// End-to-end: the set 3 labs through the real UI (troubleshooting-mode, nrt-rule, email-notifications).
//   node scripts/e2e-labs3.mjs
import { launch } from './e2e-lib.mjs';

const b = await launch();
const { click, clickText, waitFor, evalJs, go, setValue, sleep, ok, okSoon } = b;

// Start a lab and wait for its landing page. The card can be clicked while the Labs page is still re-rendering, which loses the click;
// so click, wait briefly for the hash to change, and click again if it did not.
const startLab = async (id, landing) => {
  await go("#/home");
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
const setIn = (sel, value) => setValue(sel, value);
// Fill the answer box and press Submit in ONE evaluation: the page can re-render between separate round trips (the lab panel refreshes
// after every action), which used to leave the field gone between "found it" and "typed in it".
const untilTrue = async (expr, label, ms = 8000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await evalJs(expr).catch(() => false) === true) return; await sleep(100); }
  throw new Error(`timeout waiting for: ${label}`);
};
const setSelect = (target, value) => untilTrue(`(() => {
  if (document.querySelector('.loading')) return false;
  const s = document.querySelector('[data-target="${target}"]');
  if (!s) return false;
  if (s.value !== ${JSON.stringify(value)}) { s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change')); return false; }
  return true;
})()`, `select ${target} = ${value}`);
// Find, fill and submit the answer box in ONE evaluation, retrying until it succeeds: a page re-render between separate steps
// (tier change, sign-in) otherwise removes the box after it was found.
// Fill the answer box (one value per field, in order) and press Submit in ONE evaluation. A lab with two questions has two fields; passing a
// single string fills the first, an array fills them in turn.
const answer = (values) => untilTrue(`(() => {
  if (document.querySelector(".loading")) return false;
  const btn = document.querySelector('[data-target="btn:submit-answer"]');
  const fields = [...(btn?.closest("section")?.querySelectorAll("input[type=text]") ?? [])];
  const vals = ${JSON.stringify([].concat(values))};
  if (!fields.length || fields.length < vals.length) return false;
  vals.forEach((v, n) => { fields[n].value = v; fields[n].dispatchEvent(new Event("input")); });
  btn.click(); return true;
})()`, "answer box");
// The audit page re-renders after some actions (tier change, sign-in), showing "Loading…" briefly. Each helper below finds its controls and
// acts on them in ONE evaluation and retries until that succeeds, so it can never act on a half-rendered page.
const setTypes = (wanted) => untilTrue(`(() => {
  if (document.querySelector('.loading')) return false;
  const boxes = [...document.querySelectorAll('[data-target^="check:record:"]')];
  if (boxes.length !== 7) return false;
  const want = new Set(${JSON.stringify(wanted)});
  for (const i of boxes) if (i.checked !== want.has(i.value)) i.click();
  return boxes.every((i) => i.checked === want.has(i.value));
})()`, 'record types set');
const setWindow = (endsAgo, length) => untilTrue(`(() => {
  if (document.querySelector('.loading')) return false;
  const n = document.querySelectorAll('input[type=number]');
  if (n.length !== 2) return false;
  n[0].value = '${endsAgo}'; n[1].value = '${length}';
  n.forEach((x) => x.dispatchEvent(new Event('input')));
  return n[0].value === '${endsAgo}' && n[1].value === '${length}';
})()`, 'window set');
// Search and wait for a result. A click can land on a page that re-renders straight afterwards (the coach refresh), losing the result,
// so retry the whole search a few times instead of assuming the first click took.
const searchUntil = async (expr, label, types = null, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    if (types) await setTypes(types);
    await click('btn:run-audit-search');
    const t = Date.now();
    while (Date.now() - t < 2500) { if (await evalJs(expr).catch(() => false)) return; await sleep(100); }
  }
  throw new Error(`timeout waiting for: ${label}`);
};
const objectivesMet = async () => (await b.met()).filter(Boolean).length;

try {
  await b.open('#/home');

  // ================================================================ troubleshooting-mode
  await startLab('troubleshooting-mode', 'defender/hunting');
  await waitFor(`document.querySelector('textarea.kql')`, 'editor');
  await okSoon(`document.body.innerText.includes('DeviceEvents')`, 'DeviceEvents is in the schema once the lab starts');
  await setValue('textarea.kql', 'DeviceEvents | where Timestamp > ago(3h) | where ActionType == "AntivirusTroubleshootModeEvent" | extend p = parse_json(AdditionalFields) | where p.TroubleshootingStateChangeReason contains "started" | summarize (Timestamp, ReportId)=arg_max(Timestamp, ReportId), count() by DeviceId, DeviceName | order by Timestamp desc');
  await click('btn:run-query');
  await waitFor(`document.querySelector('.result td')`, 'results');
  ok((await evalJs(`document.querySelectorAll('.result tbody tr').length`)) === 2, 'the exam-style query returns the two devices that started troubleshooting mode');
  await okSoon(`document.querySelector('.result').innerText.includes('MAC-FIN01')`, 'the most recent device is in the result');
  ok(await objectivesMet() === 1, 'the query objective is met after running it');
  await answer('MAC-FIN01');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 2`, 'lab complete');
  await okSoon(`document.body.innerText.includes('Why it works') || document.body.innerText.includes('Debrief') || document.querySelector('.debrief')`, 'the debrief is shown on completion');

  // ================================================================ nrt-rule
  await startLab('nrt-rule', 'sentinel/analytics');
  await waitFor(`document.querySelector('[data-target="btn:create-analytics-rule"]')`, 'create button');
  await click('btn:create-analytics-rule');
  await waitFor(`document.querySelector('.modal .choice-card')`, 'rule type choice');
  ok((await evalJs(`document.querySelectorAll('.modal .choice-card').length`)) === 2, 'the + Create menu offers the two authored rule types');
  // Scheduled first: ask for one minute and read the documented refusal.
  await click('btn:create-scheduled-rule');
  await waitFor(`document.querySelector('.modal input[aria-label="Rule name"]')`, 'scheduled form');
  await setIn('.modal input[aria-label="Rule name"]', 'Failed sign-ins (slow)');
  await setValue('.modal textarea.kql', 'SigninLogs | where ResultType != "0"');
  await evalJs(`(() => { const n = document.querySelectorAll('.modal input[type=number]'); n[0].value = '1'; n[1].value = '1'; })()`);
  await click('btn:save-analytics-rule');
  await waitFor(`document.querySelector('.modal .form-error:not([hidden])')?.textContent.includes('between 5 minutes and 14 days')`, 'scheduled refusal');
  ok(true, 'a scheduled rule cannot run every minute, and the message says what is allowed');
  await clickText('.modal button', 'Cancel');
  // NRT: no scheduling controls, fixed text.
  await click('btn:create-analytics-rule');
  await waitFor(`document.querySelector('.modal .choice-card')`, 'choice again');
  await click('btn:create-nrt-rule');
  await waitFor(`document.querySelector('[data-target="note:nrt-fixed"]')`, 'nrt form');
  ok((await evalJs(`document.querySelectorAll('.modal input[type=number]').length`)) === 0, 'the NRT form has no scheduling inputs');
  await okSoon(`document.querySelector('[data-target="note:nrt-fixed"]').textContent.includes('ingestion time')`, 'the NRT form states it uses ingestion time');
  await setIn('.modal input[aria-label="Rule name"]', 'Failed sign-ins (NRT)');
  await setValue('.modal textarea.kql', 'SigninLogs | where ResultType != "0"');
  await click('btn:save-analytics-rule');
  await waitFor(`!document.querySelector('.modal')`, 'rule saved');
  await okSoon(`document.body.innerText.includes('Failed sign-ins (NRT)')`, 'the new rule is listed under Analytics');
  await answer('5');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 3`, 'nrt lab complete');
  ok(true, 'the NRT lab completes through the UI');

  // ================================================================ email-notifications
  await startLab('email-notifications', 'defender/rules');
  await waitFor(`document.querySelector('[data-target="btn:add-notification"]')`, 'notification section');
  await okSoon(`document.body.innerText.includes('Settings > Endpoints > General > Email notifications')`, 'the real menu path is shown');
  // As a Security Administrator, "All devices" is refused; do it wrong first.
  await click('btn:add-notification');
  await waitFor(`document.querySelector('.wizard')`, 'notification wizard');
  ok((await evalJs(`document.querySelectorAll('.wz-step').length`)) === 2, 'the notification wizard has two steps (General, Recipients)');
  await setIn('.wizard input[type=text]', 'Everything');
  await click('check:all-devices');
  await click('btn:wizard-next');
  await waitFor(`document.querySelector('.wizard input[aria-label="Recipient email address"]')`, 'recipients step');
  await setIn('.wizard input[aria-label="Recipient email address"]', 'secops@contoso.com');
  await click('btn:add-recipient');
  await click('btn:wizard-finish');
  await waitFor(`document.querySelector('.wizard .form-error:not([hidden])')?.textContent.includes('Global administrator')`, 'all-devices refusal');
  ok(true, 'a Security Administrator is refused an all-devices rule, naming the Global administrator requirement');
  await evalJs(`document.querySelector('.wizard .icon-btn').click()`);
  // Now the correct rule: servers only, High only.
  await click('btn:add-notification');
  await waitFor(`document.querySelector('.wizard')`, 'wizard again');
  await setIn('.wizard input[type=text]', 'Brute force on servers');
  await click('check:group:Servers');
  await click('btn:wizard-next');
  await waitFor(`document.querySelector('.wizard input[aria-label="Recipient email address"]')`, 'recipients step');
  await setIn('.wizard input[aria-label="Recipient email address"]', 'secops@contoso.com');
  await click('btn:add-recipient');
  await click('btn:wizard-finish');
  await waitFor(`!document.querySelector('.wizard')`, 'rule saved');
  await okSoon(`document.body.innerText.includes('Brute force on servers')`, 'the rule is listed');
  await click('btn:run-sim:bruteforce-alerts');
  await waitFor(`document.body.innerText.includes('SRV-APP01') && document.querySelectorAll('table').length >= 2`, 'replayed');
  await go('#/defender/rules');
  await waitFor(`!document.querySelector('.loading') && document.querySelector('[data-target="btn:add-notification"]')`, 'reloaded');
  // Rows of the table under the "Emails sent" heading, one array of cell texts per row (no regex: this string passes through a template literal).
  const outboxRows = () => evalJs(`(() => { const h3 = [...document.querySelectorAll('h3')].find((x) => x.textContent.startsWith('Emails sent')); const t = h3?.parentElement.querySelectorAll('table'); const last = t && t[t.length - 1]; return last ? [...last.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent.trim())) : null; })()`);
  const rows = await outboxRows();
  ok(Array.isArray(rows) && rows.length === 1, 'exactly one simulated email was sent');
  ok(rows[0].includes('SRV-APP01') && rows[0].includes('secops@contoso.com') && rows[0].includes('High'), 'it went to the SOC group, about the server, at High severity');
  // Who can change settings: sign in as User3 and try.
  await untilTrue(`(() => { if (document.querySelector('.loading')) return false; const s = document.querySelector('[data-target="select:sign-in-as"]'); if (!s) return false; s.value = 'u-user3'; s.dispatchEvent(new Event('change')); return true; })()`, 'sign in as User3');
  await waitFor(`document.body.innerText.includes('Read-only: cannot manage security settings')`, 'user3 read-only badge');
  ok(true, 'signing in as a Security Reader shows the read-only state');
  await click('btn:add-notification');
  await waitFor(`document.querySelector('.wizard')`, 'wizard as user3');
  await setIn('.wizard input[type=text]', 'Nope');
  await click('check:group:Servers');
  await click('btn:wizard-next');
  await setIn('.wizard input[aria-label="Recipient email address"]', 'a@contoso.com');
  await click('btn:add-recipient');
  await click('btn:wizard-finish');
  await waitFor(`document.querySelector('.wizard .form-error:not([hidden])')?.textContent.includes('Manage security settings')`, 'user3 refusal');
  ok(true, 'a Security Reader is refused with the Manage security settings message');
  await evalJs(`document.querySelector('.wizard .icon-btn').click()`);
  await answer('User1, User2');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 3`, 'email lab complete');
  ok(true, 'the email-notifications lab completes through the UI');

  // ================================================================ asr-rules
  await startLab('asr-rules', 'defender/rules');
  await waitFor(`document.querySelector('[data-target="btn:add-security-policy"]')`, 'security policy section');
  await click('btn:add-security-policy');
  await waitFor(`document.querySelector('.wizard')`, 'policy wizard');
  ok((await evalJs(`document.querySelectorAll('.wz-step').length`)) === 3, 'the policy wizard has three steps (Capability, Settings, Assignments)');
  ok((await evalJs(`document.querySelectorAll('.wizard .choice-card').length`)) === 6, 'six capabilities are offered');
  await okSoon(`!document.querySelector('.wizard').innerText.toLowerCase().includes('block at first sight')`, 'block at first sight is not offered (it is cloud antivirus, not ASR)');
  // Next without choosing is refused
  await click('btn:wizard-next');
  await waitFor(`document.querySelector('.wizard .form-error:not([hidden])')?.textContent.includes('Choose a capability')`, 'capability required');
  ok(true, 'continuing without a capability is refused');
  // The card click re-renders through the wizard api (this is the path that had a bug risk)
  await click('card:capability:exploit');
  await waitFor(`document.querySelector('[data-target="card:capability:exploit"]')?.getAttribute('aria-pressed') === 'true'`, 'exploit selected');
  await click('card:capability:asr');
  await waitFor(`document.querySelector('[data-target="card:capability:asr"]')?.getAttribute('aria-pressed') === 'true' && document.querySelector('[data-target="card:capability:exploit"]')?.getAttribute('aria-pressed') === 'false'`, 'asr selected, exploit cleared');
  ok(true, 'choosing a capability toggles the cards');
  await click('btn:wizard-next');
  await waitFor(`document.querySelector('[data-target="rule:email-exe"]')`, 'rule list');
  ok((await evalJs(`document.querySelectorAll('.wizard select[data-target^="rule:"]').length`)) === 19, 'all 19 ASR rules are listed');
  await okSoon(`document.querySelector('[data-target="rule:lsass"] option[value=warn]').disabled`, 'Warn is disabled for a rule that does not support it');
  await setIn('.wizard input[type=text]', 'ASR baseline');
  await evalJs(`(() => { for (const id of ['email-exe', 'usb-untrusted']) { const s = document.querySelector('[data-target="rule:' + id + '"]'); s.value = 'block'; s.dispatchEvent(new Event('change')); } })()`);
  await click('btn:wizard-next');
  await waitFor(`document.querySelector('[data-target="check:group:Workstations"]')`, 'assignments');
  await click('btn:wizard-finish');
  await waitFor(`document.querySelector('.wizard .form-error:not([hidden])')?.textContent.includes('at least one device group')`, 'group required');
  ok(true, 'a policy with no assignment is refused');
  await click('check:group:Workstations');
  await click('btn:wizard-finish');
  await waitFor(`!document.querySelector('.wizard')`, 'policy saved');
  await okSoon(`document.body.innerText.includes('ASR baseline') && document.body.innerText.includes('Block executable content from email client and webmail')`, 'the policy is listed with its rule names and modes');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 3`, 'asr lab complete');
  ok(true, 'the ASR lab completes through the UI');

  // ================================================================ workbooks
  await startLab('workbooks', 'sentinel/workbooks');
  await waitFor(`document.querySelector('[data-target="tab:templates"]')`, 'workbooks page');
  ok((await evalJs(`document.querySelectorAll('tbody tr').length`)) === 4, 'four templates are listed');
  await okSoon(`document.body.innerText.includes('Templates are read-only')`, 'the page says templates are read-only');
  // Open the wrong template first and read its metrics
  await click('btn:template:Incident Overview');
  await waitFor(`document.querySelector('.modal')`, 'template details');
  await okSoon(`!document.querySelector('.modal').innerText.includes('Mean time to triage')`, 'Incident Overview does not list mean time to triage');
  await clickText('.modal button', 'Close');
  await click('btn:template:Security operations efficiency');
  await waitFor(`document.querySelector('.modal')`, 'soc template details');
  await okSoon(`document.querySelector('.modal').innerText.includes('Mean time to triage') && document.querySelector('.modal').innerText.includes('Incident created over time')`, 'Security operations efficiency lists both metrics');
  await setIn('.modal input[aria-label="Workbook name"]', 'SOC efficiency');
  await click('btn:save-template');
  await waitFor(`document.querySelector('[data-target="btn:view-workbook:SOC efficiency"]')`, 'saved to My workbooks');
  ok(true, 'saving a template lands in My workbooks');
  await click('btn:view-workbook:SOC efficiency');
  await waitFor(`document.querySelector('[data-target="btn:edit-workbook"]')`, 'opened');
  // Clone first
  await click('btn:save-as');
  await waitFor(`document.querySelector('.modal')`, 'save as dialog');
  await setIn('.modal input[aria-label="Name of the copy"]', 'SOC efficiency (clean)');
  await click('btn:save-as-confirm');
  await waitFor(`!document.querySelector('.modal')`, 'clone saved');
  // Edit, add a time chart, done
  await click('btn:edit-workbook');
  await waitFor(`document.querySelector('[data-target="btn:add-tile"]')`, 'edit mode');
  await click('btn:add-tile');
  await waitFor(`document.querySelector('.modal textarea.kql')`, 'tile dialog');
  await click('btn:save-tile');
  await waitFor(`document.querySelector('.blade svg')`, 'chart rendered');
  ok(true, 'the added render timechart query draws a chart');
  await click('btn:done-editing');
  await waitFor(`document.body.innerText.includes('revision 2')`, 'saved revision 2');
  ok(true, 'Done editing saves the change (revision 2)');
  // Who can add a workbook: IAM shows the four users
  await go('#/azure/iam');
  await waitFor(`document.body.innerText.includes('user4@contoso.com')`, 'iam lists user4');
  await okSoon(`document.body.innerText.includes('Workbook Contributor')`, 'IAM shows the Workbook Contributor assignment');
  await answer('User1, User3, User4');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 4`, 'workbooks lab complete');
  ok(true, 'the workbooks lab completes through the UI');

  // ================================================================ ingest-data
  await startLab('ingest-data', 'sentinel/connectors');
  await waitFor(`document.querySelector('[data-target="btn:open-connector:m365"]')`, 'connector gallery');
  ok((await evalJs(`document.querySelectorAll('.cards .card').length`)) === 5, 'five connectors are offered');
  // The distractor first: Defender for Office 365
  await click('btn:open-connector:mdo');
  await waitFor(`document.querySelector('.modal')`, 'mdo dialog');
  await click('btn:connect');
  await waitFor(`!document.querySelector('.modal')`, 'mdo connected');
  ok((await b.met())[0] === false, 'Defender for Office 365 does not make SharePoint events available');
  // Microsoft 365 with no app chosen is refused
  await click('btn:open-connector:m365');
  await waitFor(`document.querySelector('.modal')`, 'm365 dialog');
  await click('btn:connect');
  await waitFor(`document.querySelector('.modal .form-error:not([hidden])')?.textContent.includes('Select at least one')`, 'apps required');
  ok(true, 'connecting Microsoft 365 with no app selected is refused');
  await click('check:app:SharePoint');
  await click('btn:connect');
  await waitFor(`!document.querySelector('.modal')`, 'm365 connected');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 1`, 'sharepoint objective');
  ok(true, 'Microsoft 365 with SharePoint meets the first objective');
  // Order of operations: a DCR before the table is refused
  await click('btn:create-dcr');
  await waitFor(`document.querySelector('.modal')`, 'dcr dialog');
  await setIn('.modal input[aria-label="Rule name"]', 'dcr-manufacturing');
  await setIn('.modal input[aria-label="Destination table"]', 'ManufacturingAudit_CL');
  await setIn('.modal input[aria-label="Column name"]', 'EventTime');
  await click('btn:save-dcr');
  await waitFor(`document.querySelector('.modal .form-error:not([hidden])')?.textContent.includes('Create the custom table first')`, 'table-first refusal');
  ok(true, 'a data collection rule before the table is refused, saying to create the table first');
  await clickText('.modal button', 'Cancel');
  // Create the table with the five columns
  const fillColumns = async (scope) => {
    const names = ['EventTime', 'User', 'Action', 'AssetId', 'Result'];
    for (let i = 1; i < names.length; i++) await evalJs(`(() => { [...document.querySelectorAll('${scope} button')].find((x) => x.textContent.trim() === '+ Add column').click(); })()`);
    await evalJs(`(() => { const n = document.querySelectorAll('${scope} input[aria-label="Column name"]'); const t = document.querySelectorAll('${scope} select[aria-label="Column type"]'); ${JSON.stringify(names)}.forEach((v, i) => { n[i].value = v; }); t[0].value = 'datetime'; })()`);
  };
  await click('btn:create-table');
  await waitFor(`document.querySelector('.modal')`, 'table dialog');
  await setIn('.modal input[aria-label="Table name"]', 'ManufacturingAudit_CL');
  await fillColumns('.modal');
  await click('btn:save-table');
  await waitFor(`!document.querySelector('.modal') && document.body.innerText.includes('ManufacturingAudit_CL')`, 'table created');
  await okSoon(`document.body.innerText.includes('EventTime (datetime)')`, 'the table is listed with typed columns');
  // Then the rule
  await click('btn:create-dcr');
  await waitFor(`document.querySelector('.modal')`, 'dcr dialog 2');
  await setIn('.modal input[aria-label="Rule name"]', 'dcr-manufacturing');
  await setIn('.modal input[aria-label="Destination table"]', 'ManufacturingAudit_CL');
  await fillColumns('.modal');
  await click('btn:save-dcr');
  await waitFor(`!document.querySelector('.modal') && document.body.innerText.includes('Custom-ManufacturingAudit_CL')`, 'dcr created');
  ok(true, 'the rule is created once the table exists, with the Custom- stream name');
  // Send a record
  await click('btn:send:dcr-manufacturing');
  await waitFor(`document.querySelector('.modal')`, 'send dialog');
  await evalJs(`(() => { const v = { EventTime: '2026-11-02T09:00:00Z', User: 'operator7', Action: 'ValveOpen', AssetId: 'PUMP-12', Result: 'Success' }; for (const [k, x] of Object.entries(v)) { const i = document.querySelector('.modal input[aria-label="' + k + '"]'); i.value = x; } })()`);
  await click('btn:send-record');
  await waitFor(`!document.querySelector('.modal')`, 'record sent');
  await waitFor(`document.body.innerText.includes('record accepted') || [...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes('ManufacturingAudit_CL') && r.innerText.includes('1'))`, 'row count');
  // Prove it with a query
  await go('#/defender/hunting');
  await waitFor(`document.querySelector('textarea.kql')`, 'editor');
  await setValue('textarea.kql', 'ManufacturingAudit_CL | where Action == "ValveOpen"');
  await click('btn:run-query');
  await waitFor(`document.querySelector('.result td')`, 'custom table result');
  await okSoon(`document.querySelector('.result').innerText.includes('PUMP-12')`, 'the sent record is found with a query');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 4`, 'ingest lab complete');
  ok(true, 'the ingestion lab completes through the UI');

  // ================================================================ audit-log
  await startLab('audit-log', 'purview/audit');
  await waitFor(`document.querySelector('[data-target="btn:run-audit-search"]')`, 'audit page');
  await okSoon(`document.body.innerText.includes('Audit (Standard)') && document.body.innerText.includes('180 days')`, 'the tenant starts on Audit (Standard) with 180-day retention');
  ok((await evalJs(`document.querySelectorAll('[data-target^="check:record:"]').length`)) === 7, 'seven record types are offered');
  // The distractor first
  await searchUntil(`document.body.innerText.includes('New-ComplianceSearch')`, 'cmdlet results', ['SecurityComplianceCenterEOPCmdlet']);
  await okSoon(`document.body.innerText.includes('New-ComplianceSearch') && !document.body.innerText.includes('Automated investigation')`, 'the cmdlet record type returns cmdlet records, not Defender XDR activity');
  ok((await b.met())[0] === false, 'the wrong record type does not meet the first objective');
  await searchUntil(`document.body.innerText.includes('Automated investigation completed')`, 'air results', ['AirInvestigation']);
  await okSoon(`!document.body.innerText.includes('New-ComplianceSearch')`, 'AirInvestigation shows only Defender XDR activity');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 1`, 'air objective');
  ok(true, 'AirInvestigation over the last five days meets the objective');
  // Nine months back under Standard: nothing
  await setWindow(259, 22);
  await searchUntil(`document.body.innerText.includes('No results found')`, 'empty under standard', ['AzureActiveDirectory', 'ExchangeAdmin']);
  ok(true, 'under Audit (Standard) the nine-month-old events are gone');
  await click('btn:set-premium');
  await waitFor(`document.body.innerText.includes('Audit (Premium)') && document.querySelectorAll('input[type=number]').length === 2 && !document.querySelector('.loading')`, 'premium page re-rendered');
  await setWindow(259, 22);
  await searchUntil(`document.body.innerText.includes('New-InboxRule') && document.body.innerText.includes('Add user')`, 'premium results', ['AzureActiveDirectory', 'ExchangeAdmin']);
  ok(true, 'under Audit (Premium) the Entra ID and Exchange events are returned');
  // Who can search: try as Admin2 and as a reader isn't available, so check the badge for each
  await untilTrue(`(() => { if (document.querySelector('.loading')) return false; const s = document.querySelector('[data-target="select:sign-in-as"]'); if (!s) return false; s.value = 'u-adm2'; s.dispatchEvent(new Event('change')); return true; })()`, 'sign in as Admin2');
  await untilTrue(`!document.querySelector('.loading') && document.querySelector('[data-target="select:sign-in-as"]')?.value === 'u-adm2'`, 'signed in as Admin2 (page re-rendered)');
  await waitFor(`document.body.innerText.includes('Can search the audit log')`, 'admin2 badge');
  ok(true, 'signing in as the Security Administrator shows they can search');
  await answer('Admin1, Admin2, Admin3');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 4`, 'audit lab complete');
  ok(true, 'the audit lab completes through the UI');

  // ================================================================ Azure portal skin
  await go('#/azure/services');
  await waitFor(`document.querySelector('.az-grid')`, 'all services');
  await okSoon(`getComputedStyle(document.querySelector('.topbar')).backgroundColor === 'rgb(0, 120, 212)'`, 'the Azure header is the portal blue');
  await okSoon(`getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)'`, 'the Azure portal is light, whatever the OS theme');
  await okSoon(`!!document.querySelector('.labpanel') && document.querySelector('.labpanel').getBoundingClientRect().width > 200`, 'the lab coach is still visible beside the services page');
  await okSoon(`document.querySelectorAll('.az-featured .az-tile').length === 8`, 'eight featured services are shown in a row');
  await setValue('input.az-filter', 'monitor');
  await okSoon(`document.querySelector('.az-body').innerText.includes('Azure Monitor') && !document.querySelector('.az-body').innerText.includes('Bot Services')`, 'the Filter services box narrows the list');
  await setValue('input.az-search', 'sentinel');
  await waitFor(`document.querySelector('.az-result')`, 'search results');
  await click('result:Microsoft Sentinel');
  await waitFor(`location.hash === '#/sentinel/analytics'`, 'sentinel opens in the Defender portal');
  ok(true, 'global search finds Microsoft Sentinel and opens it in the Defender portal');
  await go('#/azure/services');
  await waitFor(`document.querySelector('.az-grid')`, 'all services again');
  await setValue('input.az-search', 'access control');
  await waitFor(`document.querySelector('.az-result')`, 'iam result');
  await click('result:Access control (IAM)');
  await waitFor(`location.hash === '#/azure/iam'`, 'iam opens');
  ok(true, 'global search opens Access control (IAM)');

  // ================================================================ Defender portal skin
  await go('#/home');
  await waitFor(`document.querySelector('[data-target="btn:start:workbooks"]')`, 'labs');
  await go('#/defender/home');
  await waitFor(`document.querySelector('.dh-cards')`, 'defender home');
  await okSoon(`getComputedStyle(document.querySelector('.topbar')).backgroundColor === 'rgb(59, 58, 57)'`, 'the Defender header is charcoal');
  await okSoon(`getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)'`, 'the Defender portal is light, whatever the OS theme');
  await okSoon(`document.querySelectorAll('.dn-group').length === 10`, 'the menu has the real portal groups');
  await okSoon(`(() => { const t = [...document.querySelectorAll('.dn-group .dn-label')].map((x) => x.textContent); return ['Exposure management', 'Investigation & response', 'Microsoft Sentinel', 'Endpoints', 'Email & collaboration', 'Cloud apps'].every((n) => t.includes(n)); })()`, 'group names match the portal');
  await okSoon(`!document.querySelector('.dn-sub')`, 'groups start collapsed, as in the portal');
  await okSoon(`[...document.querySelectorAll('.dn-group')].every((g) => ['true', 'false'].includes(g.getAttribute('aria-expanded')))`, 'every group exposes aria-expanded as true or false (never "null")');
  await click('group:Microsoft Sentinel');
  await okSoon(`document.querySelector('.dn-sub') && document.querySelector('.dn-sub').innerText.includes('Analytics')`, 'opening a group shows its pages');
  await click('group:Microsoft Sentinel');
  await okSoon(`!document.querySelector('.dn-sub')`, 'it closes again');
  await click('group:Cloud apps');
  await okSoon(`document.querySelector('#toasts').innerText.includes('not simulated')`, 'a group the sandbox does not simulate says so');
  await click('btn:dismiss:ignite');
  await okSoon(`!document.body.innerText.includes('Explore the latest security solutions')`, 'a banner can be dismissed');
  await click('btn:dismiss:hero');
  await okSoon(`!document.querySelector('.dh-hero')`, 'the promotional card can be closed');
  await setValue('input.df-search', 'workbooks');
  await waitFor(`document.querySelector('.df-result')`, 'defender search result');
  await click('result:Threat management > Workbooks');
  await waitFor(`location.hash === '#/sentinel/workbooks'`, 'search opens the page');
  await okSoon(`document.querySelector('.dn-sub') && document.querySelector('.dn-link.active')?.innerText.includes('Workbooks')`, 'the group holding the current page opens and marks it');
  // The coach target sits inside a collapsed group: the group must open itself so the glow can find the link. The real labs rarely reach
  // this state (a lab lands on the page its first step names), so drive the actual nav module with a controlled coach state.
  await go('#/defender/home');
  await waitFor(`document.querySelector('.dh-cards')`, 'defender home');
  const probe = await evalJs(`(async () => {
    const { ctx } = await import('/js/app.js');
    const { renderDefenderNav } = await import('/js/defender-nav.js');
    const keep = ctx.lab;
    const host = document.createElement('div');
    const out = {};
    ctx.lab = { next: { target: 'nav:sentinel/analytics' } };
    renderDefenderNav(host, 'defender/home');
    out.opened = host.querySelector('[data-target="group:Microsoft Sentinel"]').getAttribute('aria-expanded');
    out.hasLink = Boolean(host.querySelector('[data-target="nav:sentinel/analytics"]'));
    out.otherClosed = host.querySelector('[data-target="group:Endpoints"]').getAttribute('aria-expanded');
    ctx.lab = { next: { target: 'btn:something-else' } };
    renderDefenderNav(host, 'defender/home');
    out.noTarget = host.querySelector('[data-target="group:Microsoft Sentinel"]').getAttribute('aria-expanded');
    ctx.lab = { next: { target: 'nav:sentinel/logs' } }; // an alias of Advanced hunting, which lives in Investigation & response
    renderDefenderNav(host, 'defender/home');
    out.alias = host.querySelector('[data-target="group:Investigation & response"]').getAttribute('aria-expanded');
    ctx.lab = keep;
    return out;
  })()`);
  ok(probe.opened === 'true' && probe.hasLink, 'a coach target inside a closed group opens that group and exposes the link');
  ok(probe.otherClosed === 'false', 'only that group opens');
  ok(probe.noTarget === 'false', 'a non-menu target opens nothing');
  ok(probe.alias === 'true', 'an alias target (nav:sentinel/logs) opens the group that holds its menu entry');

  // ================================================================ set 4: threat-analytics-notify
  await startLab('threat-analytics-notify', 'defender/rules');
  await waitFor(`document.querySelector('[data-target="tab:notif:Threat analytics"]')`, 'notification tabs');
  ok(await evalJs(`document.body.innerText.includes('Settings > Microsoft Defender XDR > General > Email notifications')`), 'the Defender XDR notification path is shown, separate from the Endpoints one');
  await click('tab:notif:Threat analytics');
  await waitFor(`document.querySelector('[data-target="btn:create-notif:threatAnalytics"]')`, 'create button');
  // a wrong-kind rule first (Vulnerabilities), then the right one
  await click('tab:notif:Vulnerabilities');
  await click('btn:create-notif:vulnerabilities');
  await waitFor(`document.querySelector('.wizard input[type=text]')`, 'vuln wizard');
  await setIn('.wizard input[type=text]', 'Vulns');
  await click('btn:wizard-next');
  await waitFor(`document.querySelector('.wizard input[aria-label="Recipient email address"]')`, 'vuln recipients');
  await setIn('.wizard input[aria-label="Recipient email address"]', 'threatintel@contoso.com');
  await click('btn:add-recipient');
  await click('btn:wizard-finish');
  await waitFor(`!document.querySelector('.wizard')`, 'vuln saved');
  await click('tab:notif:Threat analytics');
  await click('btn:create-notif:threatAnalytics');
  await waitFor(`document.querySelector('.wizard input[type=text]')`, 'ta wizard');
  await setIn('.wizard input[type=text]', 'RansomwareReports');
  await click('btn:wizard-next');
  await waitFor(`document.querySelector('[data-target="radio:some"]')`, 'reports step');
  await click('radio:some');
  await click('check:tag:Ransomware');
  await click('btn:wizard-next');
  await waitFor(`document.querySelector('.wizard input[aria-label="Recipient email address"]')`, 'ta recipients');
  await setIn('.wizard input[aria-label="Recipient email address"]', 'threatintel@contoso.com');
  await click('btn:add-recipient');
  await click('btn:wizard-finish');
  await waitFor(`!document.querySelector('.wizard')`, 'ta rule saved');
  // A lost click is retried, but a click that DID land must not be repeated: a second publish of the ransomware report would send a second
  // email and break the lab. So re-check the page for the effect before every re-click.
  const publish = async (id, done) => {
    for (let i = 0; i < 4; i++) {
      await click("tab:notif:Threat analytics");
      await click(`btn:publish:${id}`);
      const t = Date.now();
      while (Date.now() - t < 2500) { if (await evalJs(done).catch(() => false)) return; await sleep(100); }
      // Not seen yet: check once more before clicking again, in case the page was just slow to repaint.
      await sleep(600);
      if (await evalJs(done).catch(() => false)) return;
    }
    throw new Error(`timeout waiting for: publish ${id}`);
  };
  await publish('ta-ransom', `document.body.innerText.includes('Threat analytics: Ransomware campaign')`);
  await publish('ta-phish', `document.querySelectorAll('.objectives li.met').length === 2`);
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 2`, 'threat analytics lab complete');
  ok(true, 'only the ransomware report sent an email, and the lab completes through the UI');

  // ================================================================ set 4: cef-and-tables
  await startLab('cef-and-tables', 'sentinel/connectors');
  await waitFor(`document.querySelector('[data-target="btn:open-connector:cef"]')`, 'cef card');
  await click('btn:open-connector:cef');
  await waitFor(`document.querySelector('.modal')`, 'cef dialog');
  await click('btn:connect');
  await waitFor(`document.querySelector('.modal .form-error:not([hidden])')?.textContent.includes('Linux log forwarder')`, 'forwarder required');
  ok(true, 'the CEF connector refuses to connect before a log forwarder exists');
  await clickText('.modal button', 'Close');
  await click('btn:deploy-forwarder');
  await waitFor(`document.querySelector('.modal')`, 'forwarder dialog');
  await setIn('.modal input[aria-label="Machine name"]', 'win-fwd');
  await evalJs(`(() => { const s = document.querySelector('.modal select[aria-label="Operating system"]'); s.value = 'Windows'; s.dispatchEvent(new Event('change')); })()`);
  await click('btn:save-forwarder');
  await waitFor(`document.querySelector('.modal .form-error:not([hidden])')?.textContent.includes('Windows machine cannot')`, 'windows refused');
  ok(true, 'a Windows machine is refused as a log forwarder');
  await evalJs(`(() => { const s = document.querySelector('.modal select[aria-label="Operating system"]'); s.value = 'Linux'; s.dispatchEvent(new Event('change')); })()`);
  await setIn('.modal input[aria-label="Machine name"]', 'cef-forwarder-01');
  await click('btn:save-forwarder');
  await waitFor(`!document.querySelector('.modal')`, 'forwarder saved');
  await click('btn:open-connector:cef');
  await waitFor(`document.querySelector('.modal')`, 'cef dialog 2');
  await click('btn:connect');
  await waitFor(`!document.querySelector('.modal')`, 'cef connected');
  await click('btn:open-connector:entra-protect');
  await waitFor(`document.querySelector('.modal')`, 'protect dialog');
  await click('btn:connect');
  await waitFor(`!document.querySelector('.modal')`, 'protect connected');
  await go('#/defender/hunting');
  await waitFor(`document.querySelector('textarea.kql')`, 'editor');
  await setValue('textarea.kql', 'CommonSecurityLog | take 10');
  await click('btn:run-query');
  await waitFor(`document.querySelector('.result td')`, 'cef rows');
  await setValue('textarea.kql', 'SecurityAlert | where AlertName == "Leaked credentials"');
  await click('btn:run-query');
  await waitFor(`document.querySelector('.result').innerText.includes('Leaked credentials')`, 'leaked credentials row');
  await answer('SecurityAlert');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 4`, 'cef lab complete');
  ok(true, 'the CEF and Entra ID Protection lab completes through the UI');

  // ================================================================ set 4: identity-response
  await startLab('identity-response', 'defender/identities');
  const BS = String.fromCharCode(92); // built from its char code so no escaping layer can eat it
  const hrTarget = `btn:actions:CONTOSO${BS}hrsvc`;
  await waitFor(`[...document.querySelectorAll('[data-target]')].some((e) => e.getAttribute('data-target') === ${JSON.stringify(hrTarget)})`, 'identities page');
  await click(hrTarget);
  await waitFor(`document.querySelector('.modal')`, 'actions menu');
  await okSoon(`document.querySelector('[data-target="action:Revoke session"]').getAttribute('aria-disabled') === 'true'`, 'Revoke session is greyed out for an Active Directory account');
  await okSoon(`document.querySelector('[data-target="action:Mark as compromised"]').getAttribute('aria-disabled') === 'true'`, 'Mark as compromised is greyed out too');
  await click('action:Revoke session');
  await waitFor(`document.querySelector('.modal .form-error:not([hidden])')?.textContent.includes('not available for Active Directory')`, 'revoke refused');
  ok(true, 'choosing the greyed-out action explains why it cannot be used');
  await click('action:Disable');
  await waitFor(`!document.querySelector('.modal')`, 'disabled');
  await okSoon(`document.body.innerText.includes('Disabled')`, 'the account shows as Disabled');
  await click('btn:alert-report:mdi-1');
  await okSoon(`document.querySelector('#toasts').innerText.includes('detailed-report.xlsx')`, 'the alert report downloads as a named file');
  await click('btn:report:Modification to sensitive groups');
  await waitFor(`document.querySelector('.modal')`, 'report dialog');
  await click('btn:download-report');
  await waitFor(`document.querySelector('.modal').innerText.includes('Enterprise Admins')`, 'report rows');
  await okSoon(`document.querySelector('.modal').innerText.includes('Domain Admins') && !document.querySelector('.modal').innerText.includes('legacy')`, 'a 14-day download has the two recent rows and not the old one');
  await clickText('.modal button', 'Close');
  await answer(['XLSX', `CONTOSO${BS}tbarker`]);
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 4`, 'identity objectives');
  ok(true, 'the account is stopped, the report is downloaded and the account is reported');

  // ================================================================ set 5: attack-disruption
  await startLab('attack-disruption', 'defender/disruption');
  await waitFor(`document.querySelector('[data-target="select:discovery"]')`, 'disruption page');
  await okSoon(`document.body.innerText.includes('Isolate device') && document.body.innerText.includes('Standard discovery')`, 'the status panel lists what can run and why Contain device cannot');
  await okSoon(`document.querySelector('[data-target="row:cannot:Disable user"]')?.innerText.includes('action account')`, 'Disable user says its action account is not valid');
  // The tempting shortcut first: opt a device group out of automated response
  await setSelect('select:level:Workstations', 'No automated response');
  ok(true, 'a device group can be opted out (the shortcut), which the restraint objective will then reject');
  await setSelect('select:level:Workstations', 'Full - remediate threats automatically');
  await setSelect('select:discovery', 'Standard');
  await click('btn:fix:actionAccount');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 3`, 'attack disruption lab complete');
  ok(true, 'the attack disruption lab completes through the UI');

  // ================================================================ set 5: arc-servers
  await startLab('arc-servers', 'sentinel/connectors');
  await waitFor(`document.querySelector('[data-target="btn:add-dcr-machines"]')`, 'machines section');
  await click('btn:add-dcr-machines');
  await waitFor(`document.querySelector('.modal')`, 'dcr dialog');
  await okSoon(`document.querySelectorAll('.modal input[data-target^="check:machine:"]').length === 3`, 'the picker offers only the three Azure VMs');
  await okSoon(`!document.querySelector('.modal').innerText.includes('ONPREM')`, 'no on-premises server is in the picker');
  await clickText('.modal button', 'Cancel');
  // Install the agent on every on-premises server. Each install re-renders the table, which can swallow the next click, so click whichever
  // install button is present until none is left. A server that is already done has no button, so a repeat can never double-install.
  await untilTrue(`(() => {
    if (document.querySelector('.loading')) return false;
    const b = document.querySelector('[data-target^="btn:install-arc:"]');
    if (!b) return document.querySelectorAll('tbody tr').length >= 6;
    b.click();
    return false;
  })()`, 'all servers Arc-enabled', 15000);
  await click('btn:add-dcr-machines');
  await waitFor(`document.querySelector('.modal')`, 'dcr dialog 2');
  await okSoon(`document.querySelectorAll('.modal input[data-target^="check:machine:"]').length === 6`, 'after Azure Arc the picker offers all six');
  await evalJs(`(() => { for (const i of document.querySelectorAll('.modal input[data-target^="check:machine:"]')) if (!i.checked) i.click(); const r = document.querySelector('.modal select[aria-label="Region"]'); r.value = 'westus'; r.dispatchEvent(new Event('change')); })()`);
  await click('btn:save-dcr-machines');
  await waitFor(`document.querySelector('.modal .form-error:not([hidden])')?.textContent.includes('same region')`, 'region refusal');
  ok(true, 'a rule in the wrong region is refused with the workspace region named');
  await evalJs(`(() => { const r = document.querySelector('.modal select[aria-label="Region"]'); r.value = 'eastus'; r.dispatchEvent(new Event('change')); })()`);
  await click('btn:save-dcr-machines');
  await waitFor(`!document.querySelector('.modal')`, 'rule saved');
  await waitFor(`document.querySelectorAll('.objectives li.met').length === 3`, 'arc lab complete');
  ok(true, 'the Arc lab completes through the UI');

  ok((await b.strayText('#app, body')) === 0, 'no stray "null"/"undefined" text on the last page');
  ok(b.errors.length === 0, `no console errors or CSP violations (${b.errors.length ? b.errors.join('; ') : 'none'})`);
  await b.finish();
} catch (e) {
  await b.finish(e);
}
