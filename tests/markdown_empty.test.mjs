import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import typescript from 'typescript';

test('an empty paper starts with no phantom paragraph in Firefox and Chromium', () => {
  const source = readFileSync('src/core/markdown.ts', 'utf8');
  const javascript = typescript.transpileModule(source, {
    compilerOptions: {module: typescript.ModuleKind.None, target: typescript.ScriptTarget.ES2022}
  }).outputText;
  // No document mock: rendering empty text must never allocate placeholder
  // DOM markup. The editable CSS already owns the visible placeholder.
  const globals = {};
  runInNewContext(javascript, globals, {filename: 'markdown.js'});
  const editor = {
    children: ['stale empty block'],
    replaceCalls: 0,
    replaceChildren(...nodes) {
      this.replaceCalls++;
      this.children = nodes;
    }
  };
  globals.JP.renderMarkdown(editor, '');
  assert.equal(editor.replaceCalls, 1);
  assert.deepEqual(editor.children, []);
});
