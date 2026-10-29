// Shared harness for the end-to-end scripts: starts the app on a random port, launches a headless
// Chromium-based browser and drives it over the DevTools protocol (Node's built-in WebSocket; no deps).
//
//   BROWSER="C:\path\to\msedge.exe" node scripts/e2e-labs2.mjs
//
// Not part of `npm test` because it needs a browser installed.

import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/http/app.js';

const CANDIDATES = [process.env.BROWSER, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);

export async function launch() {
  const browserPath = CANDIDATES.find((p) => existsSync(p));
  if (!browserPath) { console.error('No Chromium-based browser found. Set BROWSER=<path>.'); process.exit(2); }

  const server = http.createServer(createApp({ env: {} }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const dbgPort = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'e2e-'))}`, '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
  const cleanup = () => { try { proc.kill(); } catch { /* ignore */ } server.close(); };
  process.on('exit', cleanup);

  const json = async (url, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      try { return await (await fetch(url)).json(); } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    throw new Error(`cannot reach ${url}`);
  };
  const targets = await json(`http://127.0.0.1:${dbgPort}/json`);
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });

  let id = 0;
  const pending = new Map();
  const errors = [];
  const dialogs = [];
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    // Native confirm() dialogs block the page; accept like a learner would, and remember the text.
    if (msg.method === 'Page.javascriptDialogOpening') { dialogs.push(msg.params.message); send('Page.handleJavaScriptDialog', { accept: true }); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      const text = `${msg.params.entry.text} ${msg.params.entry.url ?? ''}`;
      // The simulator reports learner mistakes (e.g. an invalid query) as HTTP 422; these scripts do that on purpose.
      if (!/status of 422 .*\/api\/action/.test(text)) errors.push(text);
    }
  };

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (expr, label, ms = 6000) => {
    const t = Date.now();
    while (Date.now() - t < ms) { if (await evalJs(expr).catch(() => false)) return; await sleep(100); }
    throw new Error(`timeout waiting for: ${label}`);
  };

  let passed = 0;
  const api = {
    port, errors, dialogs, send, evalJs, sleep, waitFor,
    glowTarget: () => evalJs(`document.querySelector('.coach-glow')?.getAttribute('data-target') ?? null`),
    click: (target) => evalJs(`(() => { const e = [...document.querySelectorAll('[data-target]')].find((x) => x.getAttribute('data-target') === ${JSON.stringify(target)}); if (!e) return false; e.click(); return true; })()`),
    clickText: (sel, text) => evalJs(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) return false; e.click(); return true; })()`),
    setValue: (selector, value) => evalJs(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); })()`),
    go: (hash) => evalJs(`location.hash = ${JSON.stringify(hash)}`),
    met: () => evalJs(`[...document.querySelectorAll('.objectives li')].map((l) => l.classList.contains('met'))`),
    ok: (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); passed++; console.log(`  ok  ${msg}`); },
    get passed() { return passed; },
    async open(hash = '#/home') {
      await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
      await send('Page.navigate', { url: `http://127.0.0.1:${port}/${hash}` });
    },
    async finish(failure) {
      if (failure) {
        console.error(`\n${failure.message}`);
        if (errors.length) console.error('console errors:', errors);
        try { console.error('page text:', await evalJs(`document.body.innerText.slice(0, 700)`)); } catch { /* ignore */ }
        process.exitCode = 1;
      } else {
        console.log(`\n${passed} checks passed`);
      }
      cleanup();
      setTimeout(() => process.exit(process.exitCode ?? 0), 200);
    },
  };
  return api;
}
