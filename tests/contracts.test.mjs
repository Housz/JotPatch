import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const content = readFileSync('dist/content.js', 'utf8');
const background = readFileSync('dist/background.js', 'utf8');

test('Manifest V3 grants only gesture-scoped injection and context-menu access', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage', 'contextMenus']);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.host_permissions, undefined);
});

test('extension assets compile and match manifest paths', () => {
  for (const filename of [manifest.background.service_worker, 'dist/content.js', 'styles/highlight.css']) {
    assert.ok(statSync(filename).size > 100, `${filename} missing`);
  }
});

test('anchor matching, page keys, unresolved states, persisted note fields are retained', () => {
  for (const item of ['captureSelection', 'resolveAnchor', 'uniqueQuoteRange', 'pageKey', 'jp-rail',
    'jotpatch:note:v1:', 'offsetX', 'offsetY', 'resize-handle', 'JP_CREATE_FROM_CONTEXT']) {
    assert.ok(content.includes(item), `${item} missing from content script`);
  }
});

test('selection bubble has no label, no quote/title/footer, and no permanent toolbar', () => {
  const source = readFileSync('src/content/app.ts', 'utf8');
  assert.match(source, /id="jp-bubble-pin"[^>]*>📌<\/button>/);
  assert.doesNotMatch(source, /class="card-head"|class="card-foot"|id="jp-quote"/);
  assert.match(readFileSync('src/content/paper-styles.ts', 'utf8'), /\.paper\{--paper/);
});

test('right-click action and selection-trigger preference are included', () => {
  assert.ok(background.includes('chrome.contextMenus.onClicked.addListener'));
  assert.ok(background.includes('chrome.contextMenus.create'));
  assert.ok(content.includes("selectionTrigger === 'off'"));
  assert.ok(content.includes("selectionTrigger === 'alt'"));
  assert.ok(readFileSync('options.html', 'utf8').includes('value="alt"'));
});

test('stage 1.5 conversation adapters and unified rail compile without wider permissions', () => {
  assert.equal(manifest.host_permissions, undefined);
  for (const symbol of ['collectConversation', 'turnForRange', 'rail-turn', 'jp-turn-preview']) {
    assert.ok(content.includes(symbol), `${symbol} missing in bundled content script`);
  }
  const source = readFileSync('src/content/conversation.ts', 'utf8');
  assert.ok(source.includes('data-message-author-role'));
  assert.ok(source.includes('data-user-message-bubble'));
  assert.ok(source.includes('user-query'));
  assert.ok(source.includes('nativeRail'));
  assert.ok(source.includes('interface ConversationSnapshot'));
  assert.ok(readFileSync('options.html', 'utf8').includes('id="conversation-navigation"'));
  assert.ok(readFileSync('options.js', 'utf8').includes('...current, ...patch'));
});


test('stage 1.8 WYSIWYG editor and passive navigation stay local-first', () => {
  const ui = readFileSync('src/content/app.ts', 'utf8');
  const md = readFileSync('src/content/markdown.ts', 'utf8');
  for(const mark of ['contenteditable="true"', 'markdownFromEditor', 'font-size', 'layoutConversationRail', 'paper-pin'])
    assert.ok(ui.includes(mark), mark);
  for(const command of ['insertUnorderedList','insertOrderedList','bold','italic'])
    assert.ok(ui.includes(command),command);
  assert.ok(md.includes('markdownFromEditor') && md.includes('renderMarkdown'));
  assert.ok(ui.includes('navigator.clipboard.writeText(note.text)'));
  assert.equal(manifest.host_permissions, undefined);
});


test('0.1.7 rejects missing or stale anchored ranges before showing papers', () => {
  assert.equal(manifest.version, '0.1.14');
  const app = readFileSync('src/content/app.ts', 'utf8');
  assert.ok(app.includes('private liveMatch(note:Note):Match|null'));
  assert.ok(app.includes('if(!match||!rect)'));
  assert.ok(app.includes('explicitlyDetachedIds.has(noteId)'));
  assert.ok(app.includes('range.startContainer.isConnected'));
  assert.ok(app.includes('this.concealCard(card)'));
});


test('minimal rail keeps independent markers, original spatial hints and one-click actions', () => {
  const app=readFileSync('src/content/app.ts','utf8');
  const css=readFileSync('src/content/paper-styles.ts','utf8');
  const layout=readFileSync('src/content/rail-layout.ts','utf8');
  for (const name of ['associateNotesToTurns','spatialProgress','pageProgress',
      'addRailNote','applyRailLayout','showRailPreview','unpinNote','undoLastAction',
      'rail-loose','conversationTurnId','railNoteLanes']) assert.ok(app.includes(name),name);
  for (const forbidden of ['jp-rail-detail','rail-detail-header','needsRailDetail',
      'openRailDetail','closeRailDetail','trackRailPointer','railCrowded',
      'railPointerActive','railPendingRefresh','fisheyePositions','railHitTest'])
    assert.ok(!app.includes(forbidden),`should remove ${forbidden}`);
  assert.doesNotMatch(css,/\.rail-detail\{/);
  assert.doesNotMatch(css,/\.turn-preview small\{/);
  assert.match(css,/\.rail-head\{[^}]*left:50%;transform:translateX\(-50%\)/);
  assert.match(css,/\.rail-pin\.missing\{border:1px dashed/);
  assert.ok(!layout.includes('findCrowdedRailGroups'));
  assert.equal(manifest.host_permissions,undefined);
});

test('new spatial hints are optional; old note schema and colors are preserved', () => {
  const types=readFileSync('src/content/types.ts','utf8');
  assert.match(types,/spatial\?:\s*\{/);
  assert.match(types,/withinTurnProgress\?: number/);
  assert.ok(content.includes('jotpatch:note:v1:'));
  assert.match(readFileSync('src/content/paper-styles.ts','utf8'),/\.rail-pin\.missing\{border:1px dashed/);
});


test('v0.1.13 has headerless preview and direct click on both note and question',()=>{
  const app=readFileSync('src/content/app.ts','utf8');
  const css=readFileSync('src/content/paper-styles.ts','utf8');
  assert.ok(!/fisheyePositions|fisheyeCoordinate|resetRailFisheye/.test(app));
  assert.ok(app.includes("bar.addEventListener('click',()=>void this.jumpToTurn(turn))"));
  assert.ok(app.includes("button.addEventListener('click',()=>this.goTo(note.id))"));
  assert.ok(app.includes("preview.textContent=content"));
  assert.ok(!app.includes('已发现第 ${turn.order + 1} /'));
  assert.ok(!css.includes('transition:top'));
  assert.equal(manifest.version,'0.1.14');
});


test('v0.1.14 branding assets and color preferences are complete', () => {
  assert.equal(manifest.version, '0.1.14');
  assert.equal(manifest.description, 'JotPatch · 随地大小贴。');
  for (const size of [16, 32, 48, 128]) {
    const filename = `icons/icon${size}.png`;
    assert.equal(manifest.icons[String(size)], filename);
    const png = readFileSync(filename);
    assert.ok(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.equal(manifest.action.default_icon['16'], 'icons/icon16.png');
  const options = readFileSync('options.html', 'utf8');
  const js = readFileSync('options.js', 'utf8');
  const app = readFileSync('src/content/app.ts', 'utf8');
  const repo = readFileSync('src/content/repository.ts', 'utf8');
  assert.ok(options.includes('随地大小贴') && options.includes('Powered by Housz'));
  assert.ok(!app.includes('按对话顺序排列 · 不自动滚动扫描历史'));
  assert.match(options, /name="defaultNoteColorMode" value="random"/);
  assert.ok(js.includes('updatePreferences({ defaultNoteColorMode: radio.value })'));
  assert.ok(repo.includes("prefs.defaultNoteColorMode === 'random'"));
  assert.ok(app.includes('this.pickDefaultColor()'));
  assert.ok(app.includes('COLOR_ORDER.filter(color => color !== this.lastAutoColor)'));
  assert.equal(manifest.host_permissions, undefined);
});
