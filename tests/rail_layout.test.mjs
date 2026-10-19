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

test('dense overview is stable and does not reflow when pointer hovers',()=>{
  const groups=Array.from({length:100},(_,i)=>group(`t${i}`,i===36?8:0));
  const normal=layout(groups,480);
  // A third focus argument used to reallocate the entire rail and move the
  // target while the pointer was already above it. The layout is now stable.
  const repeat=layout(groups,480);
  assert.equal(normal.dense,true);
  assert.equal(normal.positions.size,109);
  assert.ok(normal.compactGroups.has('t36'));
  assert.ok(normal.positions.has('overview:t36'));
  const all=[...normal.positions.entries()];
  assert.deepEqual(all,[...repeat.positions.entries()]);
  const turns=groups.map(g=>normal.positions.get(`turn:${g.turnId}`));
  assert.ok(turns.slice(1).every((v,i)=>v>turns[i]));
  assert.ok([...normal.positions.values()].every(v=>v>=0&&v<=480));
});

test('empty groups and a narrow viewport still return finite in-bounds markers',()=>{
  for(const count of [1,3,18,120]){
    const groups=Array.from({length:count},(_,i)=>group(`round${i}`,i===2?3:0));
    const result=layout(groups,260);
    assert.equal([...result.positions.values()].length,count+(count>2?3:0)+result.compactGroups.size);
    assert.ok([...result.positions.values()].every(v=>Number.isFinite(v)&&v>=0&&v<=260));
  }
});


test('four notes in ONE round trigger striped overview in a sparse conversation',()=>{
  const groups=Array.from({length:10},(_,i)=>group(`t${i}`,i===4?4:0));
  const out=layout(groups,540);
  assert.ok(out.compactGroups.has('t4'));
  const y=out.positions.get('overview:t4');
  assert.ok(out.positions.get('turn:t4') < y && y < out.positions.get('turn:t5'));
  assert.ok(!out.compactGroups.has('t3'));
  assert.ok(!out.compactGroups.has('t5'));
});

test('three notes with enough room stay independently clickable',()=>{
  const groups=Array.from({length:8},(_,i)=>group(`t${i}`,i===3?3:0));
  const out=layout(groups,600);
  assert.ok(!out.compactGroups.has('t3'));
  assert.ok(!out.positions.has('overview:t3'));
});

test('note-only fallback groups many nearby notes without a conversation adapter',()=>{
  const groups=context.JP.groupPageRailPoints(Array.from({length:30},(_,i)=>({noteId:`n${i}`,fraction:i/30})),480);
  assert.equal(groups.reduce((count,g)=>count+g.noteIds.length,0),30);
  assert.ok(groups.some(g=>g.noteIds.length>=2));
  assert.ok(groups.every(g=>g.center>=0&&g.center<=480));
});


test('thirty notes spread across sixty turns also produce colored overviews',()=>{
  const groups=Array.from({length:60},(_,i)=>group(`t${i}`,i%2===0?1:0));
  const out=layout(groups,480);
  // No single turn has four notes; global rail spacing, not turn count alone,
  // determines whether some neighboring notes must share an overview chip.
  const cross=context.JP.groupCrowdedTurnNotes(groups,out);
  assert.ok(cross.length>=4,cross.length);
  assert.ok(cross.every(group=>group.noteIds.length>=2));
  assert.ok(cross.every(group=>group.center>=0&&group.center<=480));
  const allIds=cross.flatMap(group=>group.noteIds);
  assert.equal(new Set(allIds).size,allIds.length);
});
