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
  assert.doesNotMatch(source, /📌 原文便签|class="card-head"|class="card-foot"|id="jp-quote"/);
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


test('stage 1.6 WYSIWYG editor and history navigation stay local-first', () => {
  const ui = readFileSync('src/content/app.ts', 'utf8');
  const md = readFileSync('src/content/markdown.ts', 'utf8');
  for(const mark of ['contenteditable="true"', 'markdownFromEditor', 'font-size', 'scanOlderTurns', 'jp-note-popover'])
    assert.ok(ui.includes(mark), mark);
  for(const command of ['insertUnorderedList','insertOrderedList','bold','italic'])
    assert.ok(ui.includes(command),command);
  assert.ok(md.includes('markdownFromEditor') && md.includes('renderMarkdown'));
  assert.ok(ui.includes('navigator.clipboard.writeText(note.text)'));
  assert.equal(manifest.host_permissions, undefined);
});


test('0.1.7 rejects missing or stale anchored ranges before showing papers', () => {
  assert.equal(manifest.version, '0.1.7');
  const app = readFileSync('src/content/app.ts', 'utf8');
  assert.ok(app.includes('private liveMatch(note:Note):Match|null'));
  assert.ok(app.includes('if(!match||!rect)'));
  assert.ok(app.includes('explicitlyDetachedIds.has(noteId)'));
  assert.ok(app.includes('range.startContainer.isConnected'));
  assert.ok(app.includes('this.concealCard(card)'));
});
