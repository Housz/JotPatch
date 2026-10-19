import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const code=ts.transpileModule(readFileSync('src/content/rail-layout.ts','utf8'), {
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;
const context=vm.createContext({Math,Map});vm.runInContext(code,context);
const {layoutConversationRail:layout,layoutPageRail,fisheyePositions}=context.JP;
const group=(id,notes)=>({turnId:id,noteIds:Array.from({length:notes},(_,i)=>`${id}-n${i}`),
  fractions:Array.from({length:notes},(_,i)=>(i+.5)/notes)});

test('all notes remain individually addressable between consecutive questions',()=>{
  const input=[group('a',0),group('b',5),group('c',0),group('d',0)];
  const out=layout(input,480);
  const noteYs=[...Array(5)].map((_,i)=>out.positions.get(`note:b-n${i}`));
  assert.ok(noteYs.every((y,i)=>i===0||y>noteYs[i-1]));
  assert.ok(noteYs.every(y=>y>out.positions.get('turn:b')&&y<out.positions.get('turn:c')));
  assert.equal(out.positions.size,9);
});

test('dense overview is the same set of notes, not a collapsed count glyph',()=>{
  const input=Array.from({length:100},(_,i)=>group(`t${i}`,i===36?8:0));
  const normal=layout(input,480),focused=fisheyePositions(normal,normal.positions.get('note:t36-n4'));
  assert.equal(normal.positions.size,108);
  assert.equal(focused.size,108);
  assert.equal(normal.dense,true);
  assert.ok(![...focused.keys()].some(k=>k.startsWith('overview:')));
  const y=[...Array(8)].map((_,i)=>focused.get(`note:t36-n${i}`));
  assert.ok(y.every((v,i)=>i===0||v>y[i-1]));
});

test('narrow viewports maintain valid finite on-screen coordinates',()=>{
  for(const n of [1,3,18,120]){
    const groups=Array.from({length:n},(_,i)=>group(`r${i}`,i===2?3:0));
    const out=layout(groups,260);
    assert.equal(out.positions.size,n+(n>2?3:0));
    assert.ok([...out.positions.values()].every(y=>Number.isFinite(y)&&y>=0&&y<=260));
  }
});

test('a sparse 10-round chat with five notes does not force fisheye',()=>{
  const input=Array.from({length:10},(_,i)=>group(`r${i}`,i===4?5:0));
  const out=layout(input,600);
  assert.equal(out.positions.size,15);
  assert.equal(out.dense,false);
});

test('30 note-only positions retain order and can be focused without clustering',()=>{
  const points=Array.from({length:30},(_,i)=>({noteId:`p${i}`,fraction:i/30}));
  const out=layoutPageRail(points,480);
  assert.equal(out.positions.size,30);
  assert.equal(out.positions.has('overview:p0'),false);
  const shifted=fisheyePositions(out,260);
  assert.ok(shifted.get('note:p0')<shifted.get('note:p29'));
});
