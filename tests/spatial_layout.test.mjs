import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const js=ts.transpileModule(readFileSync('src/content/rail-layout.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;
const ctx=vm.createContext({Math,Map});vm.runInContext(js,ctx);
const {layoutConversationRail:layout,layoutPageRail:pageLayout,
  fisheyeCoordinate, fisheyePositions}=ctx.JP;
const group=(id, fractions=[])=>({turnId:id,noteIds:fractions.map((_,i)=>`${id}-n${i}`),fractions});
const groups=(n, populated, fractions)=>Array.from({length:n},(_,i)=>group(`t${i}`,i===populated?fractions:[]));

test('5%, 7%, 9% notes stay near beginning and retain their order',()=>{
  const out=layout(groups(12,4,[.05,.07,.09]),520);
  const region=out.regions[4],notes=[0,1,2].map(i=>out.positions.get(`note:t4-n${i}`));
  assert.ok(notes[0]<notes[1]&&notes[1]<notes[2]);
  assert.ok(notes.every(y=>y<region.start+(region.end-region.start)*.36),{region,notes});
  assert.ok(!out.dense,`3 markers should not force magnification in 520px: ${out.minPitch}`);
});

test('10%, 50%, 90% map to start/middle/end, independent of number of notes',()=>{
  const before=layout(groups(12,4,[.10,.50,.90]),520);
  const region=before.regions[4];
  const fractions=[0,1,2].map(i=>(before.positions.get(`note:t4-n${i}`)-region.start)/(region.end-region.start));
  assert.ok(fractions[0]<.28 && fractions[1]>.33&&fractions[1]<.66&&fractions[2]>.76, fractions);
  // Adding a note at 65% must not renormalize the existing proportions.
  const after=layout(groups(12,4,[.10,.50,.65,.90]),520),other=after.regions[4];
  const mapped=[0,1,3].map(i=>(after.positions.get(`note:t4-n${i}`)-other.start)/(other.end-other.start));
  assert.ok(Math.abs(mapped[0]-fractions[0])<.06);
  assert.ok(Math.abs(mapped[1]-fractions[1])<.06);
  assert.ok(Math.abs(mapped[2]-fractions[2])<.06);
});

test('twelve rounds and five notes keep five distinct targets, never merge',()=>{
  const out=layout(groups(12,4,[.08,.17,.30,.63,.92]),520);
  assert.equal(out.positions.size,17);
  assert.equal(out.positions.has('overview:t4'),false);
  const notes=[0,1,2,3,4].map(i=>out.positions.get(`note:t4-n${i}`));
  assert.ok(notes.every((y,i)=>i===0||y>notes[i-1]));
  assert.equal(out.dense,false);
});

test('low density with many turns preserves strict global order',()=>{
  const input=Array.from({length:45},(_,i)=>group(`r${i}`,i%3===0?[.15,.75]:[]));
  const out=layout(input,720);
  const rows=[...out.positions.entries()].map(([key,y])=>({key,y})).sort((a,b)=>a.y-b.y);
  for(let i=1;i<rows.length;i++)assert.ok(rows[i].y>=rows[i-1].y-1e-9);
  assert.equal(out.positions.size,75);
});

test('100 rounds / 60 notes triggers fisheye but no grouping',()=>{
  const input=Array.from({length:100},(_,i)=>group(`r${i}`,i%5===0?[.05,.50,.95]:[]));
  const out=layout(input,480);
  assert.ok(out.dense);
  assert.equal(out.positions.size,160);
  assert.equal(out.positions.has('overview:r0'),false);
  const focus=out.positions.get('note:r50-n1');
  const shifted=fisheyePositions(out,focus);
  assert.ok(Math.abs(shifted.get('note:r50-n1')-focus)<1e-8);
  const near0=out.positions.get('note:r50-n0'),near2=out.positions.get('note:r50-n2');
  const wideBefore=near2-near0,wideAfter=shifted.get('note:r50-n2')-shifted.get('note:r50-n0');
  assert.ok(wideAfter>wideBefore*1.35, {wideBefore,wideAfter});
  assert.ok([...shifted.values()].every(y=>y>=0&&y<=480));
});

test('fisheye anchors focus and ends, is monotone for every pointer position',()=>{
  for(const H of [240,480,750])for(const focus of [0,4,38,H*.4,H*.75,H-3,H]){
    let prior=-Infinity;
    for(let y=0;y<=H;y+=2){
      const f=fisheyeCoordinate(y,focus,H);
      assert.ok(Number.isFinite(f)&&f>=0&&f<=H+1e-6);
      assert.ok(f>=prior-1e-5,{H,focus,y,prior,f});prior=f;
    }
    assert.equal(fisheyeCoordinate(0,focus,H),0);
    assert.equal(fisheyeCoordinate(H,focus,H),H);
    assert.ok(Math.abs(fisheyeCoordinate(focus,focus,H)-focus)<1e-9);
  }
});

test('page-only 30 notes retain order, never create a count or segment overview',()=>{
  const pts=Array.from({length:30},(_,i)=>({noteId:`page-${i}`,fraction:(i+.5)/30}));
  const out=pageLayout(pts,440);
  assert.equal(out.positions.size,30);
  assert.ok(![...out.positions.keys()].some(x=>x.includes('overview')));
  assert.ok(out.positions.get('note:page-4')<out.positions.get('note:page-29'));
});
