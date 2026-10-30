// End-to-end: the custom detection wizard (six steps) and the automation rule panel, through the real UI.
//   node scripts/e2e-wizards.mjs
import { launch } from './e2e-lib.mjs';

const b = await launch();
const { click, clickText, waitFor, evalJs, sleep, go, setValue, ok } = b;

const startLab = async (id, landing) => {
  await go('#/home');
  await waitFor(`document.querySelector('[data-target="btn:start:${id}"]')`, `card ${id}`);
  await click(`btn:start:${id}`);
  await waitFor(`location.hash === '#/${landing}'`, `landing ${landing}`);
  await waitFor(`!document.querySelector('.loading')`, 'loaded');
};
const next = () => click('btn:wizard-next');
const stepIs = (title) => waitFor(`document.querySelector('.wz-step.current')?.textContent.includes(${JSON.stringify(title)})`, `step "${title}"`);
// Find a control the way a screen-reader user does: by its label. Fails if the label is not linked to a control.
const byLabel = (text) => `(() => { const l = [...document.querySelectorAll('.wizard label')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); return l && document.getElementById(l.getAttribute('for')); })()`;
const setLabelled = (text, value, ev = 'change') => evalJs(`(() => { const c = ${byLabel(text)}; c.value = ${JSON.stringify(value)}; c.dispatchEvent(new Event(${JSON.stringify(ev)})); })()`);
const setSel = (sel, value) => evalJs(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change')); })()`);
const setIn = (sel, value) => evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input')); })()`);

try {
  await b.open('#/home');

  // ================================================================ custom detection wizard
  await startLab('detect-and-isolate', 'defender/hunting');
  await waitFor(`document.querySelector('textarea.kql')`, 'editor');
  await setValue('textarea.kql', 'DeviceLogonEvents | where ActionType == "LogonFailed" | summarize LogonFailures=count(), arg_max(Timestamp, *) by DeviceId | where LogonFailures > 3');
  await click('btn:run-query');
  await waitFor(`document.querySelector('.result td')`, 'results');
  await click('btn:create-detection');
  await waitFor(`document.querySelector('.wizard')`, 'wizard');
  ok((await evalJs(`document.querySelectorAll('.wz-step').length`)) === 6, 'the wizard has six steps');
  ok(await evalJs(`[...document.querySelectorAll('.wz-step')].map((s) => s.textContent.replace(/[0-9\\u2713]/g, '').trim()).join('|') === 'Prepare the query|Alert details|Alert enrichment|Actions|Scope|Review and turn on'`), 'the steps are named as in the portal');
  ok(await evalJs(`document.querySelector('.wizard textarea.kql').value.includes('LogonFailures')`), 'the query from Advanced hunting is pre-filled');
  await waitFor(`document.querySelector('.wizard')?.textContent.includes('Continuous (NRT)')`, 'query preview');
  ok(await evalJs(`document.querySelector('.wizard').textContent.includes('Columns:') && document.querySelector('.wizard').textContent.includes('DeviceId')`), 'step 1 runs the query and lists its columns');
  ok(await evalJs(`document.querySelector('.wz-step:nth-child(3) button').disabled`), 'later steps are locked until you reach them');

  await next(); await stepIs('Alert details');
  // validation: cannot continue without an alert title
  await next();
  await waitFor(`document.querySelector('.wizard .form-error:not([hidden])')?.textContent.includes('alert title')`, 'title required');
  ok(true, 'leaving Alert details without a title is refused with a clear message');
  await setLabelled('Alert title', 'Brute force on {{DeviceName}}', 'input');
  ok(await evalJs(`${byLabel('Alert title')} !== null && ${byLabel('Frequency')} !== null`), 'the wizard controls are labelled (accessible names)');
  await setLabelled('Frequency', 'nrt');
  await next(); await stepIs('Alert enrichment');

  // go back to confirm Back works, then forward again
  await evalJs(`[...document.querySelectorAll('.wizard .wz-foot .btn')].find((x) => x.textContent === 'Back').click()`);
  await stepIs('Alert details');
  await next(); await stepIs('Alert enrichment');
  await clickText('.wizard .btn', '+ Add impacted asset');
  await waitFor(`document.querySelector('.wizard select option[value="DeviceId"]')`, 'entity columns');
  await next(); await stepIs('Actions');

  ok((await b.strayText('.wizard')) === 0, 'no stray "null"/"undefined" text anywhere in the detection wizard');
  ok(await evalJs(`!document.querySelector('[data-target="action:isolateDevice"]').disabled`), 'Isolate device is available because the query returns DeviceId');
  ok(await evalJs(`document.querySelector('[data-target="action:disableUser"]').disabled`), 'Disable user is unavailable: the query has no account SID');
  ok(await evalJs(`document.querySelector('.wizard').textContent.includes('Needs AccountSid')`), 'the unavailable action says exactly which column it needs');
  ok(await evalJs(`document.querySelector('[data-target="action:moveToFolder"]').disabled`), 'email actions are unavailable for a device query');
  await evalJs(`document.querySelector('[data-target="action:isolateDevice"]').click()`);
  await next(); await stepIs('Scope');
  await evalJs(`document.querySelectorAll('.wizard input[name="scope"]')[1].click()`);
  await next();
  await waitFor(`document.querySelector('.wizard .form-error:not([hidden])')?.textContent.includes('at least one device group')`, 'scope validation');
  ok(true, 'a group scope with no group chosen is refused');
  await clickText('.wizard label.toggle', 'Workstations');
  await waitFor(`document.querySelector('.wizard')?.textContent.includes('Devices in scope: Device1')`, 'scope preview');
  ok(true, 'the scope step previews which devices are covered');
  await next(); await stepIs('Review and turn on');
  ok(await evalJs(`document.querySelector('.wizard .review').textContent.includes('Isolate device') && document.querySelector('.wizard .review').textContent.includes('Workstations')`), 'the review step summarises actions and scope');
  await click('btn:wizard-finish');
  await waitFor(`!document.querySelector('.wizard')`, 'wizard closed');
  await waitFor(`location.hash === '#/defender/rules'`, 'rules page');
  await waitFor(`document.querySelector('.grid')`, 'rules table');
  await sleep(300);
  ok(await evalJs(`document.body.textContent.includes('Continuous (NRT)') && document.body.textContent.includes('Isolate device')`), 'the saved rule is listed with frequency and actions');
  await b.waitFor(`document.querySelectorAll('.objectives li.met').length >= 3`, 'detect-and-isolate objectives');
  ok((await b.met()).every(Boolean), 'the lab is completed through the wizard (only Device2 isolated)');

  // ================================================================ automation rule panel
  await startLab('playbook-permissions', 'azure/resources');
  await go('#/sentinel/automation');
  await waitFor(`document.querySelector('[data-target="btn:create-automation"]')`, 'automation page');
  await click('btn:create-automation');
  await waitFor(`document.querySelector('.modal')`, 'panel');
  ok(await evalJs(`[...document.querySelectorAll('.modal select[aria-label="Trigger"] option')].map((o) => o.textContent).join('|') === 'When incident is created|When incident is updated|When alert is created'`), 'the three triggers are offered');

  // conditions: the property list and operators depend on the trigger
  await click('btn:add-condition');
  const props = (t) => evalJs(`[...document.querySelectorAll('.modal select[aria-label="Property"] option')].map((o) => o.textContent).join(',')`);
  ok(!(await props()).includes('Updated by'), 'create trigger: "Updated by" is not a condition');
  await setSel('.modal select[aria-label="Trigger"]', 'incidentUpdated');
  await click('btn:add-condition');
  ok((await props()).includes('Updated by') && (await props()).includes('Owner'), 'update trigger: "Updated by" and "Owner" appear');
  await setSel('.modal select[aria-label="Property"]', 'severity');
  ok(await evalJs(`[...document.querySelectorAll('.modal select[aria-label="Operator"] option')].some((o) => o.textContent === 'Changed to')`), 'update trigger: state-change operators (Changed to) exist for Severity');
  await setSel('.modal select[aria-label="Trigger"]', 'incidentCreated');
  await click('btn:add-condition');
  await setSel('.modal select[aria-label="Property"]', 'severity');
  ok(!(await evalJs(`[...document.querySelectorAll('.modal select[aria-label="Operator"] option')].some((o) => o.textContent === 'Changed to')`)), 'create trigger: no state-change operators');

  // alert trigger: only Run playbook
  await setSel('.modal select[aria-label="Trigger"]', 'alertCreated');
  await click('btn:add-action');
  ok(await evalJs(`[...document.querySelectorAll('.modal select[aria-label="Action"] option')].map((o) => o.textContent).join('|') === 'Run playbook'`), 'alert trigger: the only action is Run playbook');
  ok(await evalJs(`document.querySelector('.modal').textContent.includes('support only the Analytic rule name')`), 'alert trigger: the condition limit is explained');
  ok((await b.strayText('.modal')) === 0, 'no stray "null"/"undefined" text in the automation panel');

  // closing needs a classification (start from a fresh panel; the one above was used to explore triggers)
  await evalJs(`document.querySelector('.modal-head .icon-btn').click()`);
  await waitFor(`!document.querySelector('.modal')`, 'panel closed');
  await click('btn:create-automation');
  await waitFor(`document.querySelector('.modal')`, 'fresh panel');
  await setIn('.modal input[placeholder="Automation rule name"]', 'Close benign noise');
  await click('btn:add-action');
  await setSel('.modal select[aria-label="Action"]', 'changeStatus');
  await setSel('.modal select[aria-label="Status"]', 'Closed');
  await waitFor(`document.querySelector('.modal select[aria-label="Classification"]')`, 'classification field');
  ok(true, 'choosing Closed shows the mandatory classification and comment');
  await click('btn:apply-automation');
  await waitFor(`document.querySelector('.modal .form-error:not([hidden])')?.textContent.includes('classification')`, 'classification required');
  ok(true, 'applying without a classification is refused');
  await setSel('.modal select[aria-label="Classification"]', 'Benign Positive - suspicious but expected');
  await setIn('.modal input[placeholder="Comment"]', 'Planned test');
  await click('btn:apply-automation');
  await waitFor(`!document.querySelector('.modal')`, 'saved');
  ok(await evalJs(`document.body.textContent.includes('Close benign noise') && document.body.textContent.includes('Change status: Closed')`), 'the rule is listed with its trigger, order and action');
  ok(await evalJs(`document.body.textContent.includes('Order')`), 'the rules table shows the run order');

  // edit keeps the rule and changes it in place
  await evalJs(`[...document.querySelectorAll('button')].find((x) => x.textContent === 'Edit').click()`);
  await waitFor(`document.querySelector('.modal')`, 'edit panel');
  ok(await evalJs(`document.querySelector('.modal input[placeholder="Automation rule name"]').value === 'Close benign noise'`), 'editing opens the saved rule');
  await setIn('.modal input[placeholder="Automation rule name"]', 'Close benign noise v2');
  await click('btn:apply-automation');
  await waitFor(`!document.querySelector('.modal') && document.body.textContent.includes('Close benign noise v2')`, 'edited');
  ok((await evalJs(`[...document.querySelectorAll('.grid tbody tr')].filter((r) => [...r.querySelectorAll('button')].some((x) => x.textContent === 'Edit')).length`)) === 1, 'editing updates the rule; it does not create a second one');
  await evalJs(`[...document.querySelectorAll('button')].find((x) => x.textContent === 'Disable').click()`);
  await waitFor(`document.body.textContent.includes('Disabled')`, 'disabled');
  ok(true, 'a rule can be disabled');

  ok(b.errors.length === 0, `no console errors or CSP violations (${b.errors.join(' | ') || 'none'})`);
  await b.finish();
} catch (e) {
  await b.finish(e);
}
