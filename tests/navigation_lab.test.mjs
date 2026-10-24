import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const transpiled=ts.transpileModule(readFileSync('src/content/navigation-lab.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;
const context=vm.createContext({Date,Map,Math,Number});vm.runInContext(transpiled,context);
const Index=context.JP.NavigationLabIndex;
function checkpoint(i,top){return {id:`message-${i}`,stableId:`message-${i}`,element:{isConnected:true,getBoundingClientRect:()=>({top})}};}
const root={isConnected:true,scrollHeight:4000,scrollTop:700,getBoundingClientRect:()=>({top:0})};
context.document={scrollingElement:root};
test('lab checkpoints are bounded and contain no transcript text',()=>{
  const index=new Index();
  index.observe([checkpoint(0,250),checkpoint(1,900)],root);
  assert.equal(index.size(),2);
  const value=index.lookup('message-0');
  assert.equal(value.top,950);
  assert.deepEqual(Object.keys(value).sort(),['extent','id','observedAt','top']);
  assert.equal(index.usable('message-0',root)?.top,950);
  index.clear();assert.equal(index.size(),0);
});
test('stale checkpoints are rejected after meaningful scroll extent change',()=>{
  const index=new Index();index.observe([checkpoint(0,100)],root);
  const changed={...root,scrollHeight:6000};
  assert.equal(index.usable('message-0',changed),undefined);
});
test('checkpoint cache is bounded to 1200 entries',()=>{
  const index=new Index();
  index.observe(Array.from({length:1800},(_,i)=>checkpoint(i,i*9)),root);
  assert.equal(index.size(),1200);
  assert.equal(index.lookup('message-0'),undefined);
  assert.ok(index.lookup('message-1799'));
});
