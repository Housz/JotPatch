import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const background=readFileSync('dist/background.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function runtime(kind='firefox') {
  const events={};
  const registered=new Map();
  const injects=[];
  const sends=[];
  const tabs=[];
  let menuCreated=0;
  let granted=[];
  const event=name=>({addListener(fn){(events[name] ||= []).push(fn)}});
  const emit=(name,...args)=>(events[name]||[]).map(fn=>fn(...args));
  const api={
    storage:{local:{async get(){return {}},async set(){}}},
    runtime:{
      onInstalled:event('installed'),onStartup:event('startup'),onMessage:event('message'),
      getURL:path=>(kind==='firefox'?'moz-extension://test-uuid/':'chrome-extension://test-uuid/')+path
    },
    action:{onClicked:event('action')},
    contextMenus:{
      onClicked:event('context'),
      removeAll(callback){if(kind==='chromium'){callback?.();return undefined;}return Promise.resolve();},
      create(){menuCreated++;return kind==='chromium'?undefined:Promise.resolve();}
    },
    permissions:{
      onAdded:event('added'),onRemoved:event('removed'),
      async contains({origins}){return origins.every(origin=>granted.includes(origin));},
      async getAll(){return {origins:[...granted]}}
    },
    scripting:{
      async getRegisteredContentScripts(options){
        if(options?.ids)return [...registered.values()].filter(x=>options.ids.includes(x.id));
        return [...registered.values()];
      },
      async registerContentScripts(scripts){for(const script of scripts){
        if(registered.has(script.id))throw Error('Duplicate');
        registered.set(script.id,script);
      }},
      async unregisterContentScripts({ids}){ids.forEach(id=>registered.delete(id));},
      async insertCSS(payload){injects.push({type:'css',...payload});},
      async executeScript(payload){injects.push({type:'js',...payload});}
    },
    tabs:{
      async sendMessage(tabId,message){sends.push({tabId,message});
        if(message.type==='JP_PING')throw Error('content not injected');
        return {ok:true};
      },
      async create({url}){tabs.push(url)}
    }
  };
  const sandbox=vm.createContext({URL,Promise,Set,Map,console,setTimeout,
    ...(kind==='firefox'?{browser:api}:{chrome:api})});
  vm.runInContext(background,sandbox,{filename:'dist/background.js'});
  return {api,events,registered,injects,sends,tabs,emit,tick,
    grant:(url)=>{granted=[url]},
    menus:()=>menuCreated};
}

for(const kind of ['firefox','chromium']){
  test(`${kind}: installed/startup reconciles granted sites and removes revoked scripts`,async()=>{
    const r=runtime(kind);
    r.grant('https://example.org/*');
    r.emit('installed');await tick();await tick();
    assert.equal(r.menus(),1);
    assert.equal(r.registered.size,1);
    const script=[...r.registered.values()][0];
    assert.deepEqual(Array.from(script.matches),['https://example.org/*']);
    assert.equal(script.persistAcrossSessions,true);
    r.registered.clear();
    r.emit('startup');await tick();await tick();
    assert.equal(r.registered.size,1,'startup restores a lost registration');
    r.grant('https://second.example/*');
    r.emit('added');await tick();await tick();
    assert.deepEqual([...r.registered.values()].map(x=>x.matches[0]),['https://second.example/*']);
    r.grant();r.emit('removed');await tick();await tick();
    assert.equal(r.registered.size,0,'revoked host cannot auto inject');
  });
  test(`${kind}: opens settings, responds to site registration, and injects on click`,async()=>{
    const r=runtime(kind);
    const sender={tab:{url:'https://example.org/article'},url:r.api.runtime.getURL('options.html')};
    let response=null;
    const pending=r.emit('message',{type:'JP_OPEN_SITE_SETUP'},sender,value=>response=value)[0];
    assert.equal(pending,false);
    await tick();assert.equal(response.ok,true);
    assert.match(r.tabs[0],/options.html\?origin=https%3A%2F%2Fexample.org/);
    r.grant('https://example.org/*');
    if(kind==='firefox'){
      const result=await r.emit('message',{type:'JP_REGISTER_SITE',origin:'https://example.org'},sender,()=>{throw Error('Firefox should return a Promise');})[0];
      assert.equal(result.ok,true);
    }else{
      let answer=null;
      const pending=r.emit('message',{type:'JP_REGISTER_SITE',origin:'https://example.org'},sender,value=>answer=value)[0];
      assert.equal(pending,true);
      await tick();assert.equal(answer?.ok,true);
    }
    assert.equal(r.registered.size,1);
    const promise=r.emit('action',{id:4})[0];await promise;
    assert.deepEqual(r.injects.map(x=>x.type),['css','js']);
    assert.equal(r.sends.at(-1).message.type,'JP_OPEN_LAUNCHER');
  });
}

test('an unapproved host never gets registered in either browser',async()=>{
  for(const kind of ['firefox','chromium']){
    const r=runtime(kind);
    const sender={url:r.api.runtime.getURL('options.html')};
    const returned=r.emit('message',{type:'JP_REGISTER_SITE',origin:'https://not-granted.example'},sender,()=>{})[0];
    if(kind==='firefox') assert.equal((await returned).ok,false);
    else {assert.equal(returned,true);await tick();}
    assert.equal(r.registered.size,0);
  }
});
