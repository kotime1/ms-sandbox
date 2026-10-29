// Static guardrails over the front-end source: the CSP is the runtime defence, this is the
// build-time one. If someone reaches for an HTML-injection sink, the test suite fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(WEB);
const js = files.filter((f) => f.endsWith('.js'));

const BANNED = [
  [/\.innerHTML\b|\.outerHTML\b/, 'innerHTML/outerHTML'],
  [/insertAdjacentHTML/, 'insertAdjacentHTML'],
  [/document\.write/, 'document.write'],
  [/\beval\s*\(/, 'eval'],
  [/new\s+Function\s*\(/, 'new Function'],
  [/setTimeout\s*\(\s*['"`]/, 'string setTimeout'],
  [/\.srcdoc\b|\bsrcdoc\s*[:=]/, 'srcdoc'], // dom.js lists it as a *forbidden* attribute name, which is fine
  [/createContextualFragment/, 'createContextualFragment'],
  [/DOMParser/, 'DOMParser'],
  [/localStorage|sessionStorage/, 'web storage (no secrets or state in the browser)'],
  [/postMessage/, 'postMessage'],
];

for (const [re, label] of BANNED) {
  test(`front-end source does not use ${label}`, () => {
    const hits = js.filter((f) => re.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''))).map((f) => path.relative(WEB, f));
    assert.deepEqual(hits, []);
  });
}

test('index.html has no inline script, inline handler, inline style or third-party origin', () => {
  const html = readFileSync(path.join(WEB, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('CSS and JS reference no external origins', () => {
  for (const f of files.filter((x) => /\.(css|js)$/.test(x))) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, ''), /(?:src|href|url\()\s*[=(]?\s*['"]?https?:\/\//i, path.relative(WEB, f));
  }
});

test('the front-end does not set inline styles (CSP style-src self)', () => {
  const hits = js.filter((f) => /\.style\.|setAttribute\(\s*['"]style['"]|\bstyle:/.test(readFileSync(f, 'utf8'))).map((f) => path.relative(WEB, f));
  assert.deepEqual(hits, []);
});
