"""Firefox MV3 add-on smoke with a REAL installed temporary extension.

This is intentionally separate from Playwright tests with a mocked API:
  pip install selenium
  FIREFOX_BIN=/path/to/firefox python tests/firefox_addon_smoke.py

No AMO credentials or permanent install are required. A signed XPI still needs
Mozilla/AMO signing before it can be installed normally in release Firefox.
"""
from __future__ import annotations
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from pathlib import Path
from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

ROOT=Path(__file__).resolve().parents[1]

def main():
    firefox_path=os.environ.get('FIREFOX_BIN')
    options=Options()
    options.add_argument('-headless')
    if firefox_path:
        options.binary_location=firefox_path
    # Firefox 138+: system access belongs to geckodriver's SERVICE, not browser capabilities.
    driver=webdriver.Firefox(options=options, service=Service(service_args=['--allow-system-access']))
    try:
        driver.set_page_load_timeout(25)
        driver.set_script_timeout(20)
        version=driver.capabilities.get('browserVersion','0')
        assert int(version.split('.')[0]) >= 142, f'Firefox version {version} is below the manifest floor'
        addon_id=driver.install_addon(str(ROOT/'build/firefox'),temporary=True)
        assert addon_id == '{8801fba0-08ef-481b-a4b6-870a061b2878}',addon_id
        print(f'PASS: temporary Firefox {version} MV3 add-on installed: {addon_id}',flush=True)

        # Marionette's chrome context can inspect the locally assigned UUID.
        # The UUID mapping is a browser-owned preference, not a hardcoded URL.
        with driver.context(driver.CONTEXT_CHROME):
            base=driver.execute_script('''
                const mapping=JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids', '{}'));
                return mapping['{8801fba0-08ef-481b-a4b6-870a061b2878}'] || null;
            ''')
        assert base, 'Firefox did not register the extension origin UUID'
        driver.get(f'moz-extension://{base}/options.html')
        WebDriverWait(driver,15).until(lambda d:d.find_element(By.CSS_SELECTOR,'h1').text=='JotPatch')
        assert '随地大小贴' in driver.find_element(By.TAG_NAME,'body').text
        print('PASS: real installed Firefox options page loads without injected WebExtension API mocks',flush=True)

        random=driver.find_element(By.CSS_SELECTOR, 'input[name="defaultNoteColorMode"][value="random"]')
        random.click()
        WebDriverWait(driver,10).until(lambda d:'已保存' in d.find_element(By.ID,'color-status').text)
        value=driver.execute_async_script('''
            const done=arguments[arguments.length-1];
            browser.storage.local.get('jotpatch:preferences:v1').then(v=>done(v['jotpatch:preferences:v1']),e=>done({error:String(e)}));
        ''')
        assert value.get('defaultNoteColorMode')=='random',value
        print('PASS: Firefox browser.storage.local persisted a real options-page preference',flush=True)

        # Verify an actual event-page message round-trip without granting hosts.
        response=driver.execute_async_script('''
            const done=arguments[arguments.length-1];
            browser.runtime.sendMessage({type:'JP_REGISTER_SITE',origin:'https://not-granted.example'})
              .then(done,e=>done({error:String(e)}));
        ''')
        assert response.get('ok') is False,response
        assert 'Site permission not granted' in response.get('error',''),response
        print('PASS: Firefox event-page message round-trip and permission denial',flush=True)

        # Settings changes survive reopening options in the same installed add-on.
        driver.refresh()
        WebDriverWait(driver,12).until(lambda d:d.find_element(By.CSS_SELECTOR,'input[name="defaultNoteColorMode"][value="random"]').is_selected())
        print('PASS: Firefox options reloaded and remembered the saved colour preference',flush=True)

        # Real WebExtension action: a successful options page alone does not
        # prove that a user's toolbar click actually activates the on-page UI.
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
        Thread(target=server.serve_forever,daemon=True).start()
        try:
            driver.get(f'http://127.0.0.1:{server.server_port}/fixtures/long-page.html')
            WebDriverWait(driver,12).until(lambda d:d.execute_script('return document.readyState==="complete"'))

            def trigger():
                # WebDriver's native element click (not JS .click) supplies an
                # actual user-activation gesture for MV3 activeTab.
                with driver.context(driver.CONTEXT_CHROME):
                    info=driver.execute_script('''
                        const id=arguments[0],win=Services.wm.getMostRecentWindow("navigator:browser");
                        const widgetId=id.toLowerCase().replace(/[^a-z0-9_-]/g,"_")+"-browser-action";
                        const ui=win.CustomizableUI,widget=ui.getWidget(widgetId);
                        if(!widget)return {ok:false,error:"missing widget",widgetId};
                        ui.addWidgetToArea(widgetId,ui.AREA_NAVBAR);
                        const node=widget.forWindow(win)?.node||win.document.getElementById(widgetId);
                        if(!node)return {ok:false,error:"missing toolbar node",widgetId};
                        return {ok:true,widgetId,nodeName:node.tagName,
                           childAction:!!node.querySelector(".unified-extensions-item-action-button")};
                    ''',addon_id)
                    assert info.get('ok'),f'Firefox toolbar button unavailable: {info}'
                    outer=driver.find_element(By.ID,info['widgetId'])
                    child=outer.find_elements(By.CSS_SELECTOR,'.unified-extensions-item-action-button')
                    (child[0] if child else outer).click()
                    return info
            r=trigger()
            assert r.get('ok'),f'Firefox native toolbar action unavailable: {r}'
            print(f'DIAGNOSTIC: clicked Firefox native action: {r}',flush=True)
            original_window=driver.current_window_handle
            try:
                WebDriverWait(driver,10).until(lambda d:d.execute_script('''
                    const root=document.querySelector("#jotpatch-root");
                    return !!(root && !root.hidden && root.shadowRoot &&
                      !root.shadowRoot.querySelector("#jp-rail").hidden &&
                       !root.shadowRoot.querySelector("#jp-new").hidden);
                '''))
            except TimeoutException as original_error:
                # A failed action may open an options/help tab; the driver
                # remains attached to the original window so inspect all tabs.
                tab_states=[]
                for handle in driver.window_handles:
                    driver.switch_to.window(handle)
                    try:
                        tab_states.append(driver.execute_script('''
                            const root=document.querySelector("#jotpatch-root");
                            return {url:location.href,title:document.title,hasRoot:!!root,
                              rootHidden:root?.hidden,hasShadow:!!root?.shadowRoot,
                              dockHidden:root?.shadowRoot?.querySelector("#jp-rail")?.hidden,
                              help:document.querySelector("#activation-help-detail")?.textContent};
                        '''))
                    except Exception as error:
                        tab_states.append({'inspectError':str(error)})
                driver.switch_to.window(original_window)
                # Diagnose whether the extension can address the original tab.
                # Run only after a failure; do not change permission state in
                # successful tests or fake the native toolbar gesture.
                driver.switch_to.new_window('tab')
                driver.get(f'moz-extension://{base}/options.html')
                ext_state=driver.execute_async_script('''
                    const done=arguments[arguments.length-1];
                    (async()=>{
                        const tabs=await browser.tabs.query({});
                        const info=[];
                        for(const tab of tabs){
                            if(!tab.url?.startsWith("http://127.0.0.1:"))continue;
                            let ping=null, injection=null;
                            try{ping=await browser.tabs.sendMessage(tab.id,{type:"JP_PING"});}
                            catch(e){ping=String(e);}
                            try {
                                const result=await browser.scripting.executeScript({
                                    target:{tabId:tab.id},func:()=>document.readyState});
                                injection=result?.[0]?.result||"empty result";
                            }catch(e){injection=String(e);}
                            let css="not attempted",content="not attempted",postPing=null,initState=null;
                            try {
                                await browser.scripting.insertCSS({
                                    target:{tabId:tab.id},files:["styles/highlight.css"]});
                                css="ok";
                            }catch(e){css=String(e);}
                            try {
                                await browser.scripting.executeScript({
                                    target:{tabId:tab.id},files:["dist/content.js"]});
                                content="ok";
                            }catch(e){content=String(e);}
                            try{postPing=await browser.tabs.sendMessage(tab.id,{type:"JP_PING"});}
                            catch(e){postPing=String(e);}
                            try {
                                initState=(await browser.scripting.executeScript({
                                  target:{tabId:tab.id},func:()=>({
                                      root:!!document.querySelector("#jotpatch-root"),
                                      state:document.readyState,
                                      jpGlobal:typeof JP,
                                      jpExports:typeof JP==="object"?Object.keys(JP):[],
                                      browserAvailable:typeof globalThis.browser,
                                      browserRuntime:!!globalThis.browser?.runtime,
                                      browserStorage:!!globalThis.browser?.storage,
                                      chromeAvailable:typeof globalThis.chrome,
                                      chromeRuntime:!!globalThis.chrome?.runtime,
                                      chromeStorage:!!globalThis.chrome?.storage,
                                      apiCheck:(()=>{
                                          try{return !!JP.extensionApi()?.storage?.local;}
                                          catch(e){return String(e);}
                                      })(),
                                      ctorCheck:(()=>{
                                          try{return {ok:!!new JP.JotPatchApp()};}
                                          catch(e){return {error:String(e),stack:String(e?.stack).slice(0,850)};}
                                      })(),
                                      app:!!globalThis.__jotpatchStage0
                                  })}))[0].result;
                            }catch(e){initState=String(e);}
                            info.push({id:tab.id,url:tab.url,ping,injection,css,content,postPing,initState});
                        }
                        return {tabs:info};
                    })().then(done,e=>done({error:String(e)}));
                ''')
                print(f'DIAGNOSTIC: Firefox action failure tabs={tab_states!r} extension={ext_state!r}',flush=True)
                raise AssertionError('Native Firefox toolbar click did not activate Dock; see diagnostic tabs / injection result') from original_error
            print('PASS: Firefox native toolbar action injects and displays unified Dock',flush=True)
            r=trigger()
            assert r.get('ok'),r
            WebDriverWait(driver,12).until(lambda d:d.execute_script('''
                const root=document.querySelector("#jotpatch-root");
                return !!(root && root.shadowRoot && root.hidden);
            '''))
            assert driver.execute_script('return document.querySelectorAll("#jotpatch-root").length')==1
            print('PASS: second real toolbar click hides Dock and notes, no duplicate root',flush=True)

            # The real installed extension must create a note, serialize the
            # editor text, and restore it from Firefox storage after reload.
            # Synthetic DOM tests alone cannot establish that this works.
            trigger()
            WebDriverWait(driver,8).until(lambda d:d.execute_script('''
                const root=document.querySelector("#jotpatch-root");
                return !!(root && !root.hidden && root.shadowRoot &&
                  !root.shadowRoot.querySelector("#jp-rail").hidden);
            '''))
            new_button=driver.execute_script('''
                return document.querySelector("#jotpatch-root").shadowRoot.querySelector("#jp-new");
            ''')
            new_button.click()
            editor=WebDriverWait(driver,8).until(lambda d:d.execute_script('''
                return document.querySelector("#jotpatch-root").shadowRoot.querySelector(".paper .note-editor");
            '''))
            note_text='Firefox native note storage verification 0.1.17'
            editor.send_keys(note_text)
            WebDriverWait(driver,6).until(lambda d:note_text in d.execute_script('''
                return document.querySelector("#jotpatch-root").shadowRoot.querySelector(".paper .note-editor").textContent;
            '''))
            # Blur explicitly; a literal tab sent into contenteditable inserts a tab.
            driver.execute_script('arguments[0].blur()', editor)
            original_window=driver.current_window_handle
            driver.switch_to.new_window('tab')
            driver.get(f'moz-extension://{base}/options.html')

            observed_notes=[]
            def read_note_storage(d):
                notes=d.execute_async_script('''
                    const done=arguments[arguments.length-1];
                    browser.storage.local.get(null).then(
                      data=>done(Object.entries(data)
                        .filter(([key,value])=>key.startsWith("jotpatch:note:v1:") && value?.schemaVersion===1)
                        .map(([key,value])=>({key,text:value.text,deletedAt:value.deletedAt||null}))),
                      e=>done({error:String(e)}));
                ''')
                assert isinstance(notes,list),f'Firefox real storage unavailable: {notes}'
                observed_notes[:] = notes
                return next((n for n in notes if n['text']==note_text and not n['deletedAt']),None)

            try:
                persisted=WebDriverWait(driver,8).until(read_note_storage)
            except TimeoutException:
                driver.switch_to.window(original_window)
                editor_state=driver.execute_script('''
                    const root=document.querySelector("#jotpatch-root");
                    const editor=root?.shadowRoot?.querySelector(".paper .note-editor");
                    const paper=editor?.closest(".paper");
                    return {text:editor?.textContent,html:editor?.innerHTML,
                        editorEmpty:editor?.dataset.empty,
                        paperSave:paper?.dataset.save,
                        root:!!root, paperCount:root?.shadowRoot?.querySelectorAll(".paper").length};
                ''')
                print(f'DIAGNOSTIC: Firefox native editor={editor_state!r} persisted={observed_notes!r}',flush=True)
                raise
            assert persisted['key'].startswith('jotpatch:note:v1:')
            print('PASS: real Firefox note editor autosaved Markdown into browser.storage.local',flush=True)

            driver.switch_to.window(original_window)
            driver.refresh()
            WebDriverWait(driver,12).until(lambda d:d.execute_script('return document.readyState==="complete"'))
            trigger()
            WebDriverWait(driver,10).until(lambda d:d.execute_script('''
                const root=document.querySelector("#jotpatch-root");
                if(!root || root.hidden || !root.shadowRoot)return false;
                const rail=root.shadowRoot.querySelector("#jp-rail");
                const list=root.shadowRoot.querySelector("#jp-list-toggle");
                return !!rail && !rail.hidden && !!list && !list.hidden;
            '''))
            assert driver.execute_script('return document.querySelectorAll("#jotpatch-root").length')==1
            print('PASS: real Firefox stored note restored after page reload and action click',flush=True)
        finally:
            server.shutdown()
            server.server_close()
    finally:
        driver.quit()

if __name__=='__main__':
    main()
