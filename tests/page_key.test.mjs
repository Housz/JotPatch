import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import typescript from 'typescript';

// Firefox extension content scripts can expose URLSearchParams.keys() as a
// non-iterable Xray wrapper. Browser DOM mocks used by our Playwright suite
// do not reproduce it, so emulate the restriction in a focused real-code test.
class FirefoxContentURL extends URL {
  get searchParams() {
    const params = super.searchParams;
    Object.defineProperty(params, 'keys', {
      configurable: true,
      value: () => ({next: () => ({done: true})})
    });
    return params;
  }
}

function loadPageKey(URLConstructor) {
  const typescriptSource = readFileSync('src/core/page-key.ts', 'utf8');
  const compiled = typescript.transpileModule(typescriptSource, {
    compilerOptions: {
      module: typescript.ModuleKind.None,
      target: typescript.ScriptTarget.ES2022
    }
  }).outputText;
  const context = {URL: URLConstructor};
  runInNewContext(compiled, context, {filename: 'page-key.js'});
  return context.JP.pageKey;
}

test('pageKey works when Firefox Xray URLSearchParams.keys() is non-iterable', () => {
  const pageKey = loadPageKey(FirefoxContentURL);
  assert.equal(
    pageKey('https://chatgpt.com/c/abc?utm_source=a&utm_medium=b&fbclid=c&b=2&a=1#heading'),
    'https://chatgpt.com/c/abc?a=1&b=2'
  );
  assert.equal(pageKey('https://gemini.google.com/app/abc?gclid=x&msclkid=y&keep=yes'),
    'https://gemini.google.com/app/abc?keep=yes');
  assert.equal(pageKey('https://example.org/docs?utm_source=a&utm_source=b&q=1#/chapter'),
    'https://example.org/docs?q=1#/chapter');
});

test('pageKey agrees with the normal browser URL implementation', () => {
  const standard = loadPageKey(URL);
  const firefox = loadPageKey(FirefoxContentURL);
  for (const url of [
    'https://chatgpt.com/c/abc?utm_campaign=1&b=2&a=1',
    'https://gemini.google.com/app/def?gclid=x&foo=hello',
    'https://example.org/a?x=1#section',
    'https://example.org/a?x=1#/route'
  ]) assert.equal(firefox(url), standard(url));
});
