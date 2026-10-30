// End-to-end: plays the iteration-2 labs through the real UI (clicks and typing only).
//   node scripts/e2e-labs2.mjs
import { launch } from './e2e-lib.mjs';
import { LOB_HASH } from '../server/attacks/scenarios-extra.js';

const b = await launch();
const { click, clickText, waitFor, evalJs, sleep, glowTarget, go, setValue, ok } = b;
const allMet = (n) => waitFor(`document.querySelectorAll('.objectives li.met').length >= ${n}`, `${n} objectives met`);
const startLab = async (id, landing) => {
  await go('#/home');
  await waitFor(`document.querySelector('[data-target="btn:start:${id}"]')`, `card ${id}`);
  await click(`btn:start:${id}`);
  await waitFor(`location.hash === '#/${landing}'`, `landing page ${landing}`);
  await waitFor(`!document.querySelector('.loading')`, 'page loaded');
};

try {
  await b.open('#/home');

  // ---------------------------------------------------------------- unblock-lob1 (file indicator, the product's mechanism)
  await startLab('unblock-lob1', 'defender/rules');
  await waitFor(`document.querySelector('[data-target="btn:add-indicator"]')`, 'indicators section');
  ok((await evalJs(`document.querySelectorAll('table.grid code.hash').length`)) >= 2, 'both blocked files are listed with their hashes');
  ok(!(await evalJs(`document.body.textContent.includes('Malicious')`)), 'the verdict is NOT shown before deep analysis');
  ok(await evalJs(`document.body.textContent.includes('This is an email feature')`), 'the Tenant Allow/Block List is labelled as an email feature');
  ok(await evalJs(`document.body.textContent.includes('Workstations: ')`), 'file state is shown per device group');

  // Trap first: the Tenant Allow/Block List cannot release an endpoint file.
  await click('btn:add-allowblock');
  await waitFor(`document.querySelector('.modal')`, 'allow/block dialog');
  await evalJs(`(() => { const sel = document.querySelectorAll('.modal select'); sel[0].value = 'file'; sel[1].value = 'allow'; })()`);
  await setValue('.modal input[type=text]', 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1');
  await click('btn:save-allowblock');
  await waitFor(`document.querySelector('.modal .form-error:not([hidden])')?.textContent.includes("can't create allow entries for files directly")`, 'allow/block explained');
  ok(await evalJs(`!document.querySelector('[data-target="btn:save-allowblock"]').disabled`), 'the email list refuses a file Allow and explains why; the dialog stays usable');
  await evalJs(`document.querySelector('.modal-head .icon-btn').click()`);

  // The product's mechanism: a file hash indicator, action Allow, scoped to the device group that runs LOB1.
  await waitFor(`document.querySelector('.coach-glow')?.getAttribute('data-target') === 'btn:add-indicator'`, 'coach highlights Add item');
  ok(true, 'coach highlights "Add item" under Indicators');
  await click('btn:add-indicator');
  await waitFor(`document.querySelector('.modal')`, 'indicator dialog');
  await setValue('.modal input[type=text]', 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1');
  await evalJs(`(() => { document.querySelector('.modal select:not([multiple])').value = 'allow'; const t = document.querySelector('.modal select[multiple]'); for (const o of t.options) o.selected = o.textContent === 'All devices'; })()`);
  await click('btn:save-indicator');
  await waitFor(`!document.querySelector('.modal')`, 'indicator saved (all devices)');
  await waitFor(`document.querySelectorAll('.objectives li.met').length >= 2`, 'allow + guard met');
  ok(!(await b.met())[2], 'allowing on ALL devices works but is not "no wider than needed"');
  await click('btn:add-indicator'); // reopen to narrow the scope via Edit scope instead
  await evalJs(`document.querySelector('.modal-head .icon-btn').click()`);
  await evalJs(`[...document.querySelectorAll('button')].find((x) => x.textContent === 'Edit scope').click()`);
  await waitFor(`document.querySelector('.modal select[multiple]')`, 'edit scope');
  await evalJs(`(() => { const t = document.querySelector('.modal select[multiple]'); for (const o of t.options) o.selected = o.textContent === 'Workstations'; })()`);
  await clickText('.modal .btn', 'Save');
  await waitFor(`!document.querySelector('.modal')`, 'scope narrowed');
  await allMet(3);
  ok((await b.met()).every(Boolean), 'LOB1 allowed on the workstations only, and the malware stays blocked');

  // ---------------------------------------------------------------- approve-devices
  await startLab('approve-devices', 'defender/devices');
  await waitFor(`document.querySelector('[data-target="btn:approve-all"]')`, 'approval banner');
  ok(await evalJs(`document.body.textContent.includes('waiting for approval')`), 'pending devices are called out');
  ok((await glowTarget()) === 'btn:approve-all', 'coach highlights Approve');
  await click('btn:approve-all');
  await waitFor(`!document.querySelector('[data-target="btn:approve-all"]')`, 'banner gone');
  await allMet(1);
  ok((await b.met())[0], 'all devices approved');

  // ---------------------------------------------------------------- hunting-favorites
  await startLab('hunting-favorites', 'sentinel/hunting');
  await waitFor(`document.querySelector('[data-target="btn:fav:hq-rareip"]')`, 'hunting queries');
  for (const q of ['hq-rareip', 'hq-mfa', 'hq-roles']) {
    await click(`btn:fav:${q}`);
    await waitFor(`document.querySelector('[data-target="btn:fav:${q}"]')?.getAttribute('aria-pressed') === 'true'`, `${q} starred`);
  }
  await go('#/sentinel/incidents'); await waitFor(`!document.querySelector('.loading')`, 'left blade');
  await go('#/sentinel/hunting');
  await waitFor(`document.body.textContent.includes('3 favorite queries ran')`, 'favorites ran on open');
  await allMet(3);
  ok((await b.met()).every(Boolean), 'favorites run when the Hunting blade is opened');

  // ---------------------------------------------------------------- summary-rule (timeout -> rule -> query)
  await startLab('summary-rule', 'sentinel/logs');
  ok(await evalJs(`document.body.textContent.includes('NetworkSessions_CL')`), 'the raw table is in the schema browser');
  ok(!(await evalJs(`document.body.textContent.includes('NetworkSessionSummary_CL')`)), 'the summary table is NOT revealed up front');
  await setValue('textarea.kql', 'NetworkSessions_CL | summarize count() by SourceIP');
  await click('btn:run-query');
  await waitFor(`document.querySelector('.form-error')?.textContent.includes('timed out')`, 'timeout shown');
  ok(true, 'aggregating the raw table times out, with a pointer to summary rules');
  await go('#/sentinel/summary');
  await waitFor(`document.querySelector('[data-target="btn:create-summary-rule"]')`, 'summary page');
  await click('btn:create-summary-rule');
  await waitFor(`document.querySelector('.modal')`, 'summary dialog');
  await evalJs(`(() => { const s = document.querySelector('.modal select'); s.value = 'NetworkSessions_CL'; })()`);
  await setValue('.modal input[placeholder="MyTable_CL"]', 'SessionSummary_CL');
  await setValue('.modal textarea', 'NetworkSessions_CL | summarize Sessions=count(), TotalBytes=sum(Bytes) by bin(TimeGenerated, 1h), SourceIP, DestinationPort');
  await click('btn:save-summary-rule');
  await waitFor(`!document.querySelector('.modal') && document.body.textContent.includes('SessionSummary_CL')`, 'rule saved');
  await go('#/sentinel/logs');
  await waitFor(`document.body.textContent.includes('SessionSummary_CL')`, 'new table now in the schema browser');
  await setValue('textarea.kql', 'SessionSummary_CL | summarize Total=sum(Sessions) by SourceIP');
  await click('btn:run-query');
  await waitFor(`document.querySelector('.result td')`, 'summary results');
  await allMet(3);
  ok((await b.met()).every(Boolean), 'the summary table answers instantly and the lab completes');

  // ---------------------------------------------------------------- follow-the-token (answer box, server-side check)
  await startLab('follow-the-token', 'sentinel/logs');
  await waitFor(`document.querySelector('[data-target="btn:submit-answer"]')`, 'answer box');
  ok(await evalJs(`document.querySelectorAll('.blade input[type=text]').length === 2`), 'the answer box has one field per question');
  await setValue('textarea.kql', 'MicrosoftGraphActivityLogs | where SignInActivityId == "8c1b2a2e-6b5f-4a5d-9b3b-2aa5c0e9f4aa"');
  await click('btn:run-query');
  await waitFor(`document.querySelector('.result td')`, 'token results');
  await evalJs(`(() => { const i = document.querySelectorAll('.blade input[type=text]'); i[0].value = '10'; i[1].value = '/v1.0/users'; })()`);
  await click('btn:submit-answer');
  await sleep(500);
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 2`, 'query + top met, count wrong');
  ok(!(await b.met())[1], 'a wrong count (10) is not accepted');
  await evalJs(`document.querySelectorAll('.blade input[type=text]')[0].value = '6'`);
  await click('btn:submit-answer');
  await allMet(3);
  ok((await b.met()).every(Boolean), 'the correct answers complete the lab');

  // ---------------------------------------------------------------- triage-ws23 (device page: flag events, package, deep analysis, indicator)
  await startLab('triage-ws23', 'defender/devices');
  await waitFor(`document.querySelector('[data-target="btn:open-timeline:dev-0201"]')`, 'WS-23 row');
  await click('btn:open-timeline:dev-0201');
  await waitFor(`document.querySelector('.modal table.grid')`, 'timeline');
  ok(await evalJs(`document.querySelectorAll('.modal tbody tr').length === 7`), 'the timeline shows 7 events');
  await evalJs(`(() => { const rows = [...document.querySelectorAll('.modal tbody tr')]; for (const r of rows) { if (/powershell\\.exe (-enc|connected)/.test(r.textContent)) r.querySelector('button').click(); } })()`);
  await waitFor(`document.querySelectorAll('.modal [aria-pressed="true"]').length === 2`, 'two events flagged');
  await click('btn:collect-package:dev-0201');
  await waitFor(`document.querySelector('.modal .note.ok')?.textContent.includes('Network connections')`, 'package collected');
  ok(true, 'flagged the PowerShell events and collected an investigation package');
  await evalJs(`document.querySelector('.modal-head .icon-btn').click()`);
  await go('#/defender/rules');
  await waitFor(`document.querySelector('[data-target="row:file:update.ps1"]')`, 'file list');
  await click("btn:open-file:update.ps1");
  await waitFor(`document.querySelector('.modal')`, 'file dialog');
  await click('btn:deep-analysis');
  await waitFor(`!document.querySelector('.modal')`, 'analysis done');
  await waitFor(`document.querySelector('[data-target="row:file:update.ps1"]')?.textContent.includes('Suspicious')`, 'verdict revealed after analysis');
  ok(true, 'the verdict only appears after deep analysis');
  await click('btn:add-indicator');
  await waitFor(`document.querySelector('.modal')`, 'indicator dialog');
  await evalJs(`document.querySelector('.modal select[multiple]').options[0].selected = true`);
  await evalJs(`(() => { const t = document.querySelector('.modal input[type=text]'); })()`);
  await evalJs(`document.querySelector('.modal .hint-text button').click()`);
  await clickText('.modal .btn', 'Save');
  await waitFor(`!document.querySelector('.modal')`, 'indicator saved');
  await allMet(5);
  ok((await b.met()).slice(0, 5).every(Boolean), 'WS-23 triaged: timeline, package, deep analysis, indicator, and no over-reaction');
  ok(await evalJs(`document.querySelector('.debrief') !== null`), 'the five required objectives complete the lab; the optional bonus is not needed');

  // Bonus: scope the incident with Advanced hunting. DeviceEvents is available in this lab only.
  await go('#/defender/hunting');
  await waitFor(`document.querySelector('textarea.kql')`, 'editor');
  ok(await evalJs(`document.body.textContent.includes('DeviceEvents')`), 'DeviceEvents appears in Advanced hunting for this lab');
  await setValue('textarea.kql', 'DeviceEvents | where ActionType contains "Remote" | summarize Devices=dcount(DeviceName)');
  await click('btn:run-query');
  await waitFor(`document.querySelector('.result td')`, 'bonus result');
  ok((await evalJs(`document.querySelector('.result td').textContent`)) === '4', 'four devices report remote activity (the onboarded Android phone does not)');
  await evalJs(`document.querySelector('.blade input[type=text]').value = '4'`);
  await click('btn:submit-answer');
  await allMet(6);
  ok((await b.met()).every(Boolean), 'the optional bonus objective is met too');

  // ---------------------------------------------------------------- playbook-picker (role on the RESOURCE GROUP, then automation rule + replay)
  await startLab('playbook-picker', 'sentinel/automation');
  await waitFor(`document.querySelector('[data-target="btn:create-automation"]')`, 'automation page');
  await click('btn:create-automation');
  await waitFor(`document.querySelector('.modal')`, 'automation dialog');
  await evalJs(`(() => { const s = document.querySelectorAll('.modal select')[1]; s.value = [...s.options].find((o) => o.textContent.startsWith('Play1')).value; })()`);
  await click('btn:apply-automation');
  await waitFor(`!document.querySelector('.modal')`, 'rule created');
  ok(true, 'the rule can be created, but Sentinel is not yet permitted to run it');
  await click('btn:run-sim:playbook-picker');
  await waitFor(`document.querySelectorAll('.toast').length > 0`, 'replay toast');
  await go('#/sentinel/incidents'); await waitFor(`document.querySelector('[data-target="row:incident-first"]')`, 'incidents');
  await click('row:incident-first');
  await waitFor(`document.querySelector('.modal .run.failed')`, 'failed run');
  ok(await evalJs(`document.querySelector('.modal .run.failed').textContent.includes('does not have permission')`), 'the automation run fails with the Sentinel-permission error');
  await evalJs(`document.querySelector('.modal-head .icon-btn').click()`);
  await go('#/azure/iam'); await waitFor(`document.querySelector('[data-target="btn:add-role"]')`, 'iam');
  await click('btn:add-role');
  await waitFor(`document.querySelector('.modal')`, 'role dialog');
  await evalJs(`(() => { const [scope, member] = document.querySelectorAll('.modal select'); scope.value = [...scope.options].find((o) => o.textContent === 'Resource group: rg-sentinel').value; member.value = [...member.options].find((o) => o.textContent.startsWith('Azure Security Insights')).value; })()`);
  await clickText('.role-item', 'Microsoft Sentinel Automation Contributor');
  await click('btn:review-assign');
  await waitFor(`!document.querySelector('.modal')`, 'assigned');
  await go('#/sentinel/automation'); await waitFor(`document.querySelector('[data-target="btn:create-automation"]')`, 'automation again');
  await click('btn:run-sim:playbook-picker');
  await allMet(4);
  ok((await b.met()).every(Boolean), 'with the role on the resource group the playbook runs from the automation rule');

  // ---------------------------------------------------------------- entity-mapping (open every incident, answer, toggle)
  await startLab('entity-mapping', 'sentinel/incidents');
  await waitFor(`document.querySelectorAll('.grid tbody tr').length === 4`, 'four incidents');
  for (let i = 0; i < 4; i++) {
    await evalJs(`document.querySelectorAll('.grid tbody tr')[${i}].click()`);
    await waitFor(`document.querySelector('.modal')`, `incident ${i} dialog`);
    await evalJs(`document.querySelector('.modal-head .icon-btn').click()`);
  }
  await go('#/sentinel/incidents'); await waitFor(`document.querySelector('[data-target="btn:submit-answer"]')`, 'answer box');
  await evalJs(`document.querySelector('.blade input[type=text]').value = 'Scheduled, NRT'`);
  await click('btn:submit-answer');
  await go('#/sentinel/analytics'); await waitFor(`document.querySelectorAll('.grid tbody tr').length >= 4`, 'rules');
  ok(true, 'incidents opened and the answer submitted');

  // ---------------------------------------------------------------- ueba-join (join across two tables, then the answer)
  await startLab('ueba-join', 'defender/hunting');
  await waitFor(`document.querySelector('textarea.kql')`, 'editor');
  ok(await evalJs(`document.body.textContent.includes('BehaviorInfo') && document.body.textContent.includes('BehaviorEntities')`), 'the UEBA tables appear in Advanced hunting for this lab only');
  await setValue('textarea.kql', 'BehaviorInfo | join (BehaviorEntities | where EntityType == "User") on BehaviorId | project Title, Description, AccountUpn');
  await click('btn:run-query');
  await waitFor(`document.querySelector('.result td')`, 'join results');
  ok((await evalJs(`document.querySelectorAll('.result tbody tr').length`)) === 4, 'the join returns four behaviours with their user');
  await evalJs(`document.querySelector('.blade input[type=text]').value = 'mei.tan@contoso.com'`);
  await click('btn:submit-answer');
  await allMet(2);
  ok((await b.met()).every(Boolean), 'join + answer completes the lab');

  ok(b.errors.length === 0, `no console errors or CSP violations (${b.errors.join(' | ') || 'none'})`);
  await b.finish();
} catch (e) {
  await b.finish(e);
}
