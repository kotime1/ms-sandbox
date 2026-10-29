// End-to-end smoke test: drives the real UI in headless Edge/Chrome over the DevTools protocol.
// No dependencies (uses Node's built-in WebSocket). Not part of `npm test` because it needs a browser.
//
//   node scripts/e2e.mjs            (starts its own server on a random port)
//   BROWSER="C:\path\to\msedge.exe" node scripts/e2e.mjs

import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/http/app.js';

const CANDIDATES = [process.env.BROWSER, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const browserPath = CANDIDATES.find((p) => existsSync(p));
if (!browserPath) { console.error('No Chromium-based browser found. Set BROWSER=<path>.'); process.exit(2); }

const server = http.createServer(createApp({ env: {} }));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const dbgPort = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'e2e-'))}`, '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { proc.kill(); } catch { /* ignore */ } server.close(); };
process.on('exit', cleanup);

async function json(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { return await (await fetch(url)).json(); } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  throw new Error(`cannot reach ${url}`);
}
const targets = await json(`http://127.0.0.1:${dbgPort}/json`);
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map(); const errors = []; const dialogs = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  // Native confirm() dialogs (e.g. "starting a new lab resets the environment") block the page; accept like a learner would.
  if (msg.method === 'Page.javascriptDialogOpening') { dialogs.push(msg.params.message); send('Page.handleJavaScriptDialog', { accept: true }); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    const text = `${msg.params.entry.text} ${msg.params.entry.url ?? ''}`;
    // The simulator reports learner mistakes (e.g. an invalid KQL query this test submits on purpose) as HTTP 422.
    if (!/status of 422 .*\/api\/action/.test(text)) errors.push(text);
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
  return r.result.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (expr, label, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await evalJs(expr).catch(() => false)) return; await sleep(100); } throw new Error(`timeout waiting for: ${label}`); };

// The coach tells us what to click next; the test follows it like a learner would.
const glowTarget = () => evalJs(`document.querySelector('.coach-glow')?.getAttribute('data-target') ?? null`);
const click = (target) => evalJs(`(() => { const e = [...document.querySelectorAll('[data-target]')].find((x) => x.getAttribute('data-target') === ${JSON.stringify(target)}); if (!e) return false; e.click(); return true; })()`);
const clickText = (sel, text) => evalJs(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) return false; e.click(); return true; })()`);
const objectivesMet = () => evalJs(`[...document.querySelectorAll('.objectives li')].map((l) => l.classList.contains('met'))`);
let passed = 0;
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); passed++; console.log(`  ok  ${msg}`); };

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/#/home` });
  await waitFor(`document.querySelectorAll('.card').length === 5`, 'lab cards');
  ok(true, 'home lists 5 labs');

  // ---- Lab: playbook-permissions, by clicking only ----
  await click('btn:start:playbook-permissions');
  await waitFor(`location.hash === '#/azure/resources' && document.querySelector('.grid')`, 'resources page');
  ok((await glowTarget()) === 'row:Playbook1', 'coach highlights the Playbook1 row');
  await click('row:Playbook1');
  await waitFor(`document.querySelector('[data-target="btn:set-trigger-incident"]')`, 'logic app blade');
  await sleep(300);
  ok((await glowTarget()) === 'btn:set-trigger-incident', 'coach highlights the incident-trigger card');

  // Learner mistake first: run from incident before fixing anything -> offered nothing, then fix.
  await click('btn:set-trigger-incident');
  await waitFor(`document.querySelector('.choice-card.selected')?.textContent.includes('incident')`, 'trigger saved');
  await click('btn:identity-on');
  await waitFor(`document.body.textContent.includes('Object (principal) ID')`, 'identity on');
  ok(true, 'trigger + identity set via the blade');

  await evalJs(`location.hash = '#/azure/iam'`);
  await waitFor(`document.querySelector('[data-target="btn:add-role"]')`, 'iam page');
  await sleep(300);
  ok((await glowTarget()) === 'btn:add-role', 'coach highlights Add role assignment');
  await click('btn:add-role');
  await waitFor(`document.querySelector('.modal')`, 'role dialog');
  await evalJs(`(() => { const s = document.querySelector('.modal select'); s.value = [...s.options].find((o) => o.textContent.includes('virtualMachines: VM1')).value; })()`);
  await clickText('.role-item', 'Virtual Machine Contributor');
  await evalJs(`(() => { const s = document.querySelectorAll('.modal select')[1]; s.value = [...s.options].find((o) => o.textContent.startsWith('Playbook1')).value; })()`);
  await click('btn:review-assign');
  await waitFor(`!document.querySelector('.modal') && document.body.textContent.includes('Virtual Machine Contributor')`, 'assignment listed');
  ok(true, 'role assigned to the playbook identity at VM1 scope');

  await evalJs(`location.hash = '#/sentinel/incidents'`);
  await waitFor(`document.querySelector('[data-target="row:incident-first"]')`, 'incidents page');
  await click('row:incident-first');
  await waitFor(`document.querySelector('.modal')`, 'incident dialog');
  await click('btn:incident-actions');
  ok(await clickText('.menu-item', 'Run: Playbook1'), 'Playbook1 is offered under Actions once it has the incident trigger');
  await waitFor(`!document.querySelector('.modal')`, 'run finished');
  await waitFor(`document.querySelectorAll('.objectives li.met').length >= 5`, 'objectives met');
  const met = await objectivesMet();
  ok(met.slice(0, 5).every(Boolean), 'all 5 required objectives are met from UI clicks alone');
  ok(await evalJs(`document.querySelector('.debrief') !== null`), 'debrief appears on completion');

  // ---- Lab: KQL, run a query with a chart ----
  await evalJs(`location.hash = '#/home'`);
  await waitFor(`document.querySelectorAll('.card').length === 5`, 'home again');
  await click('btn:start:kql-investigation');
  await waitFor(`location.hash === '#/sentinel/logs'`, 'logs page');
  ok(dialogs.some((d) => /resets the simulated environment/.test(d)), 'starting a second lab asks for confirmation before resetting');
  await waitFor(`document.querySelector('textarea.kql')`, 'editor');
  await evalJs(`(() => { const t = document.querySelector('textarea.kql'); t.value = 'SigninLogs | summarize Count=count() by bin(TimeGenerated, 1d) | render timechart'; t.dispatchEvent(new Event('input')); })()`);
  await click('btn:run-query');
  await waitFor(`document.querySelector('svg.chart')`, 'chart rendered');
  ok(true, 'KQL render timechart produces an SVG chart');
  await evalJs(`(() => { const t = document.querySelector('textarea.kql'); t.value = 'SigninLogs | where IpAddres == "x"'; t.dispatchEvent(new Event('input')); })()`);
  await click('btn:run-query');
  await waitFor(`document.querySelector('.form-error')?.textContent.includes("Did you mean 'IPAddress'")`, 'KQL did-you-mean');
  ok(true, 'KQL error suggests the correct column');

  // ---- XSS probe: hostile text in a query must render inert ----
  await evalJs(`(() => { const t = document.querySelector('textarea.kql'); t.value = 'SigninLogs | take 1 | extend X = "<img src=x onerror=window.__pwned=1>"'; t.dispatchEvent(new Event('input')); })()`);
  await click('btn:run-query');
  await waitFor(`document.querySelector('.result td')`, 'result');
  await sleep(300);
  ok((await evalJs(`window.__pwned === undefined && !document.querySelector('.result img')`)), 'HTML in query output is rendered as text, not executed');

  // ---- A failed dialog submit must leave the button usable so the learner can fix it and retry ----
  await evalJs(`location.hash = '#/sentinel/automation'`);
  await waitFor(`document.querySelector('[data-target="btn:create-automation"]')`, 'automation page');
  await click('btn:create-automation');
  await waitFor(`document.querySelector('.modal')`, 'automation dialog');
  await click('btn:apply-automation'); // no playbooks exist in the KQL lab -> client-side error
  await waitFor(`document.querySelector('.modal .form-error:not([hidden])')`, 'dialog error shown');
  ok(await evalJs(`!document.querySelector('[data-target="btn:apply-automation"]').disabled`), 'dialog button is re-enabled after a failed submit');
  await evalJs(`document.querySelector('.modal-head .icon-btn').click()`);

  // ---- Assistant ----
  await evalJs(`(() => { const i = document.querySelector('.labpanel input[type=text]'); i.value = 'what is a union?'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); })()`);
  await waitFor(`document.querySelector('.msg.bot')?.textContent.includes('union')`, 'assistant reply');
  ok(true, 'assistant answers from offline notes');

  ok(errors.length === 0, `no console errors or CSP violations (${errors.join(' | ') || 'none'})`);
  console.log(`\n${passed} checks passed`);
  process.exitCode = 0;
} catch (e) {
  console.error(`\n${e.message}`);
  if (errors.length) console.error('console errors:', errors);
  try { console.error('page text:', (await evalJs(`document.body.innerText.slice(0, 600)`))); } catch { /* ignore */ }
  process.exitCode = 1;
} finally {
  cleanup();
  setTimeout(() => process.exit(process.exitCode), 200);
}
