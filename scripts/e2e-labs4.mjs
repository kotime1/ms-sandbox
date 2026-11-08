// End-to-end: the set 6 labs through the real UI (ueba-sources, mcp-workspace).
//   node scripts/e2e-labs4.mjs ueba      or      node scripts/e2e-labs4.mjs mcp
// One lab per run: the harness ends the process when a run finishes, so a second scenario in the same run would never start.
import { launch } from './e2e-lib.mjs';

const which = process.argv[2];
if (which !== 'ueba' && which !== 'mcp') { console.error('usage: node scripts/e2e-labs4.mjs ueba|mcp'); process.exit(2); }

const b = await launch();
const { click, waitFor, evalJs, go, sleep, ok, okSoon } = b;

const startLab = async (id, landing) => {
  await go('#/home');
  await waitFor(`document.querySelector('[data-target="btn:start:${id}"]')`, `card ${id}`);
  for (let i = 0; i < 4; i++) {
    await click(`btn:start:${id}`);
    const t = Date.now();
    while (Date.now() - t < 2500) { if (await evalJs(`location.hash === "#/${landing}"`).catch(() => false)) break; await sleep(100); }
    if (await evalJs(`location.hash === "#/${landing}"`).catch(() => false)) break;
  }
  await waitFor(`location.hash === "#/${landing}"`, `landing ${landing}`);
  await waitFor(`!document.querySelector('.loading')`, 'loaded');
};
const untilTrue = async (expr, label, ms = 8000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await evalJs(expr).catch(() => false) === true) return; await sleep(100); }
  throw new Error(`timeout waiting for: ${label}`);
};
// Set a text field and click a button in ONE evaluation, retrying: the page re-renders after every action.
const fillAndClick = (fieldTarget, value, buttonTarget) => untilTrue(`(() => {
  if (document.querySelector('.loading')) return false;
  const f = document.querySelector('[data-target="${fieldTarget}"]');
  const btn = document.querySelector('[data-target="${buttonTarget}"]');
  if (!f || !btn) return false;
  f.value = ${JSON.stringify(value)}; f.dispatchEvent(new Event('input'));
  btn.click(); return true;
})()`, `${fieldTarget} + ${buttonTarget}`);
const objectives = () => evalJs(`[...document.querySelectorAll('.objectives li')].map((l) => l.classList.contains('met'))`);
const toastText = () => evalJs(`[...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ')`);
const answer = (value) => untilTrue(`(() => {
  if (document.querySelector(".loading")) return false;
  const btn = document.querySelector('[data-target="btn:submit-answer"]');
  const f = btn?.closest("section")?.querySelector("input[type=text]");
  if (!f) return false;
  f.value = ${JSON.stringify(value)}; f.dispatchEvent(new Event("input"));
  btn.click(); return true;
})()`, 'answer box');

try {
  await b.open('#/home'); // the harness starts on about:blank; without this there is no page to click on
  if (which === 'ueba') {
    await startLab('ueba-sources', 'sentinel/ueba');
    await ok(await evalJs(`/Entity behavior configuration/.test(document.querySelector('h1').textContent)`), 'the lab opens the Entity behavior configuration page');
    await ok(!(await evalJs(`!!document.querySelector('[data-target="btn:ueba-connect:AzureActivity"]')`)), 'no data sources are offered while UEBA is off');
    await ok((await objectives()).every((m) => !m), 'no objective is met at the start');

    await click('btn:ueba-enable');
    await okSoon(`!!document.querySelector('[data-target="btn:ueba-connect:AzureActivity"]')`, 'turning UEBA on reveals the data sources');
    await ok(await evalJs(`/Azure Activity, Security Events/.test(document.querySelector('.note').textContent)`), 'the page lists the two supported sources that are not connected yet');
    await okSoon(`document.querySelectorAll('.objectives li.met').length === 1`, 'turning UEBA on meets only the first objective');

    // The exam trap: Microsoft 365 is refused, with a reason, and stays disconnected.
    await click('btn:ueba-connect:OfficeActivity');
    await okSoon(`/not a UEBA data source/.test([...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' '))`, 'connecting Microsoft 365 is refused with a reason');
    await ok(await evalJs(`document.querySelector('[data-target="btn:ueba-connect:OfficeActivity"]') !== null`), 'Microsoft 365 is still offered as "Connect", so it was not connected');

    await click('btn:ueba-connect:AzureActivity');
    await okSoon(`!!document.querySelector('[data-target="btn:ueba-disconnect:AzureActivity"]')`, 'Azure Activity is now connected');
    await okSoon(`document.querySelectorAll('.objectives li.met').length === 1`, 'one supported source is not enough');
    await click('btn:ueba-connect:SecurityEvent');
    await okSoon(`document.querySelectorAll('.objectives li.met').length === 3`, 'both supported sources meet the source and restraint objectives');
    await okSoon(`/All UEBA-supported data sources are connected/.test(document.querySelector('.note').textContent)`, 'the page says all supported sources are connected');
    await ok(await evalJs(`document.querySelectorAll('[data-target^="btn:ueba-connect:"]').length === 3`), 'the three unsupported sources are still unconnected');
    await ok((await b.strayText('main')) === 0, 'no stray "null" or "undefined" text');
  } else {
    await startLab('mcp-workspace', 'sentinel/mcp');
    await ok(await evalJs(`/Sentinel MCP server/.test(document.querySelector('h1').textContent)`), 'the lab opens the notebook page');
    await ok(await evalJs(`/a guest account/.test(document.querySelector('.kv').textContent)`), 'the learner is signed in as a guest');
    await ok(await evalJs(`/fabrikam/.test(document.querySelector('.kv').textContent)`), 'calls authenticate to the guest tenant at the start');

    // Reproduce the problem first.
    await click('btn:mcp-run');
    await okSoon(`document.querySelectorAll('table tbody tr').length === 1 && /holds none of your Sentinel workspaces/.test(document.querySelector('table').textContent)`, 'the first call authenticates to the wrong tenant and queries nothing');
    await ok((await objectives()).every((m) => !m), 'a failing call meets no objective');

    // The S6:49-style half fix: naming the workspace while still in the wrong tenant does not help.
    const wsId = 'a1111111-0000-4000-8000-000000000001';
    await fillAndClick('field:mcp-ws', wsId, 'btn:mcp-run');
    await okSoon(`document.querySelectorAll('table tbody tr').length === 2`, 'a second call is logged');
    await ok((await objectives()).filter(Boolean).length === 0, 'naming the workspace alone does not fix the wrong tenant');

    // The tenant header.
    await fillAndClick('field:mcp-tenant', 'contoso.onmicrosoft.com', 'btn:mcp-header');
    await okSoon(`/set by the header/.test(document.querySelector('.kv').textContent)`, 'saving the header changes the tenant the calls use');
    await click('btn:mcp-run');
    await okSoon(`document.querySelectorAll('table tbody tr').length === 3`, 'a third call is logged');
    await okSoon(`document.querySelectorAll('.objectives li.met').length === 1`, 'the header meets the tenant objective only');
    await ok(await evalJs(`/No workspace was named/.test(document.querySelector('table').textContent)`), 'with the header but no workspace, the table says the agent chose one');

    // List the workspaces, then pin the production one.
    await click('btn:mcp-list');
    await okSoon(`document.querySelectorAll('[data-target^="row:ws:"]').length === 2`, 'list_sentinel_workspaces shows both workspaces of the home tenant');
    await fillAndClick('field:mcp-ws', wsId, 'btn:mcp-run');
    await okSoon(`document.querySelectorAll('table')[1].querySelectorAll('tbody tr').length === 4`, 'a pinned call is logged');
    await okSoon(`document.querySelectorAll('.objectives li.met').length === 1`, 'one pinned call is not consistency');
    await fillAndClick('field:mcp-ws', wsId, 'btn:mcp-run');
    await okSoon(`document.querySelectorAll('.objectives li.met').length === 2`, 'two pinned calls in a row meet the workspace objective');

    // The diagnosis. A wrong answer first.
    await answer('workspace');
    await okSoon(`document.querySelectorAll('.objectives li.met').length === 2`, 'answering "workspace" is not the diagnosis');
    await answer('tenant');
    await okSoon(`document.querySelectorAll('.objectives li.met').length === 3`, 'answering "tenant" completes the lab');
    await ok((await b.strayText('main')) === 0, 'no stray "null" or "undefined" text');
  }
  const real = b.errors.filter((e) => !/status of (422|400) /.test(e));
  await ok(real.length === 0, `no console errors${real.length ? `: ${real.join(' | ')}` : ''}`);
  await b.finish();
} catch (e) {
  await b.finish(e);
}
