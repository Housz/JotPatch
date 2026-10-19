import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const js = ts.transpileModule(readFileSync('src/content/rail-layout.ts','utf8'), {
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;
const context = vm.createContext({});
vm.runInContext(js,context);
const layout = context.JP.layoutConversationRail;
const group=(id,number)=>({turnId:id,noteIds:Array.from({length:number},(_,i)=>`${id}-note-${i}`),fractions:Array.from({length:number},(_,i)=>(i+.5)/number)});

test('notes occupy distinct slots strictly between successive turn bars',()=>{
  const groups=[group('a',0),group('b',5),group('c',0),group('d',0)];
  const result=layout(groups,480);
  const start=result.positions.get('turn:b'),end=result.positions.get('turn:c');
  const notes=groups[1].noteIds.map(id=>result.positions.get(`note:${id}`));
  assert.ok(notes.every(v=>v>start&&v<end));
  assert.ok(notes.every((v,i)=>i===0||v>notes[i-1]));
  assert.ok(end-start>result.positions.get('turn:d')-result.positions.get('turn:c'));
});

test('dense focus expands a crowded round while keeping direct note markers and order',()=>{
  const groups=Array.from({length:100},(_,i)=>group(`t${i}`,i===36?8:0));
  const normal=layout(groups,480);
  const focused=layout(groups,480,'t36');
  assert.equal(normal.dense,true);
  const noteIds=groups[36].noteIds;
  const normalNotes=noteIds.map(id=>normal.positions.get(`note:${id}`));
  const bigger=noteIds.map(id=>focused.positions.get(`note:${id}`));
  assert.ok(bigger.at(-1)-bigger[0]>normalNotes.at(-1)-normalNotes[0]+35);
  assert.ok(bigger.slice(1).every((v,i)=>v-bigger[i]>9));
  const turns=groups.map(g=>focused.positions.get(`turn:${g.turnId}`));
  assert.ok(turns.slice(1).every((v,i)=>v>turns[i]));
  assert.ok([...focused.positions.values()].every(v=>v>=0&&v<=480));
});

test('empty groups and a narrow viewport still return finite in-bounds markers',()=>{
  for(const count of [1,3,18,120]){
    const groups=Array.from({length:count},(_,i)=>group(`round${i}`,i===2?3:0));
    const result=layout(groups,260);
    assert.equal([...result.positions.values()].length,count+(count>2?3:0));
    assert.ok([...result.positions.values()].every(v=>Number.isFinite(v)&&v>=0&&v<=260));
  }
});
