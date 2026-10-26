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
                with driver.context(driver.CONTEXT_CHROME):
                    return driver.execute_script('''
                        const id=arguments[0];
                        const win=Services.wm.getMostRecentWindow("navigator:browser");
                        const widgetId=id.toLowerCase().replace(/[^a-z0-9_-]/g,"_")+"-browser-action";
                        const custom=win.CustomizableUI;
                        const widget=custom.getWidget(widgetId);
                        if(!widget)return {ok:false,error:"missing widget",widgetId};
                        custom.addWidgetToArea(widgetId,custom.AREA_NAVBAR);
                        const node=widget.forWindow(win)?.node||win.document.getElementById(widgetId);
                        if(!node)return {ok:false,error:"missing toolbar node",widgetId};
                        if(typeof node.doCommand==="function")node.doCommand();
                        else node.click();
                        return {ok:true,widgetId};
                    ''',addon_id)
            r=trigger()
            assert r.get('ok'),f'Firefox native toolbar action unavailable: {r}'
            WebDriverWait(driver,15).until(lambda d:d.execute_script('''
                const root=document.querySelector("#jotpatch-root");
                return !!(root && !root.hidden && root.shadowRoot &&
                  !root.shadowRoot.querySelector("#jp-launcher").hidden);
            '''))
            print('PASS: Firefox native toolbar action injects and displays real launcher',flush=True)
            r=trigger()
            assert r.get('ok'),r
            WebDriverWait(driver,12).until(lambda d:d.execute_script('''
                const root=document.querySelector("#jotpatch-root");
                return !!(root && root.shadowRoot &&
                  root.shadowRoot.querySelector("#jp-launcher").hidden);
            '''))
            assert driver.execute_script('return document.querySelectorAll("#jotpatch-root").length')==1
            print('PASS: second real toolbar click toggles launcher, no duplicate root',flush=True)
        finally:
            server.shutdown()
            server.server_close()
    finally:
        driver.quit()

if __name__=='__main__':
    main()
