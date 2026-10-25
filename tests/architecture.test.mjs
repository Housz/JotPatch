import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const transpile=path=>ts.transpileModule(readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;

function adapterContext(){
  const sandbox=vm.createContext({URL});
  for(const file of ['src/adapters/sites/registry.ts','src/adapters/sites/chatgpt.ts','src/adapters/sites/gemini.ts'])
    vm.runInContext(transpile(file),sandbox,{filename:file});
  return sandbox.JP;
}
test('site adapters resolve by exact host; hostile lookalike hosts are not accepted',()=>{
  const jp=adapterContext();
  for(const host of ['https://chatgpt.com/c/1','https://chat.openai.com/'])
    assert.equal(jp.findConversationAdapter(new URL(host))?.site,'chatgpt');
  assert.equal(jp.findConversationAdapter(new URL('https://gemini.google.com/app'))?.site,'gemini');
  for(const host of ['https://chatgpt.com.evil.org','https://gemini.google.com.attacker.net',
    'https://claude.ai','https://chatgpt.example.com','https://example.org'])
    assert.equal(jp.findConversationAdapter(new URL(host)),null,host);
});
test('one new site can be registered without modifying the common collector',()=>{
  const jp=adapterContext();
  const site={site:'claude',matches:url=>url.hostname==='claude.ai',selectors:'[data-role="user"]',
    canonical:node=>node,prompt:node=>node};
  jp.registerConversationAdapter(site);
  assert.equal(jp.findConversationAdapter(new URL('https://claude.ai/new'))?.site,'claude');
  assert.throws(()=>jp.registerConversationAdapter(site),/Duplicate/);
  assert.equal(jp.findConversationAdapter(new URL('https://chatgpt.com'))?.site,'chatgpt');
});
test('core note storage has no WebExtension globals, is injectible and preserves note schema v1',async()=>{
  const sandbox=vm.createContext({Date,Math,Set,Map});
  vm.runInContext(transpile('src/core/repository.ts'),sandbox);
  const data=new Map();
  const port={
    async get(keys){if(keys===null)return Object.fromEntries(data);
      return Object.fromEntries([keys].filter(k=>data.has(k)).map(k=>[k,data.get(k)]));},
    async set(items){for(const [key,value] of Object.entries(items))data.set(key,value);},
    async remove(keys){for(const key of [keys].flat())data.delete(key);}
  };
  const repo=new sandbox.JP.NoteRepository(port);
  const note={schemaVersion:1,id:'abc',pageKey:'page1',sourceUrl:'https://example.org',
    sourceTitle:'Example',text:'hello',createdAt:123456,updatedAt:123456};
  await repo.put(note);
  assert.equal((await repo.get('abc')).text,'hello');
  assert.equal((await repo.list('page1')).length,1);
  assert.equal((await repo.list('another')).length,0);
  const pref=await repo.preferences();
  assert.equal(pref.navigationLab,false);
  assert.equal(pref.defaultNoteColorMode,'yellow');
  assert.doesNotMatch(readFileSync('src/core/repository.ts','utf8'),/\bchrome\.|\bbrowser\./);
});
test('TypeScript bundle order guarantees site registry and browser seam before application startup',()=>{
  const files=JSON.parse(readFileSync('tsconfig.content.json','utf8')).files;
  const index=(n)=>files.indexOf(n);
  assert.ok(index('src/core/conversation-types.ts')<index('src/adapters/sites/registry.ts'));
  assert.ok(index('src/adapters/sites/registry.ts')<index('src/adapters/sites/chatgpt.ts'));
  assert.ok(index('src/adapters/sites/chatgpt.ts')<index('src/content/conversation.ts'));
  assert.ok(index('src/adapters/browsers/webextension.ts')<index('src/core/repository.ts'));
  assert.equal(files.at(-1),'src/content/entry.ts');
  assert.ok(files.every(x=>!x.includes('src/content/repository.ts')));
});
