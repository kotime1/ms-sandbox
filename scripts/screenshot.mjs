// Saves PNG screenshots of key pages to ./screenshots (git-ignored). Needs a Chromium-based browser.
//   node scripts/screenshot.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch } from './e2e-lib.mjs';

mkdirSync('screenshots', { recursive: true });
const b = await launch();
const shot = async (name) => {
  const r = await b.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`screenshots/${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
const setSel = (sel, v) => b.evalJs(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })()`);
try {
  await b.open('#/home');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.waitFor(`document.querySelector('[data-target="btn:start:detect-and-isolate"]')`, 'home');
  await shotHome();
  async function shotHome() { await b.sleep(300); await shot('1-home'); }

  // custom detection wizard: step 4 (actions) shows gated actions
  await b.click('btn:start:detect-and-isolate');
  await b.waitFor(`document.querySelector('textarea.kql')`, 'editor');
  await b.evalJs(`(() => { const t = document.querySelector('textarea.kql'); t.value = 'DeviceLogonEvents | where ActionType == "LogonFailed" | summarize LogonFailures=count(), arg_max(Timestamp, *) by DeviceId | where LogonFailures > 3'; t.dispatchEvent(new Event('input')); })()`);
  await b.click('btn:run-query');
  await b.waitFor(`document.querySelector('.result td')`, 'results');
  await b.click('btn:create-detection');
  await b.waitFor(`document.querySelector('.wizard')`, 'wizard');
  await b.sleep(500);
  await shot('2-detection-wizard-query');
  await b.click('btn:wizard-next'); await b.sleep(250);
  await b.evalJs(`(() => { const e = document.querySelector('.wizard input[placeholder^="e.g. Brute"]'); e.value = 'Brute force on {{DeviceName}}'; e.dispatchEvent(new Event('input')); })()`);
  await b.click('btn:wizard-next'); await b.sleep(250);
  await b.click('btn:wizard-next'); await b.sleep(250);
  await b.waitFor(`document.querySelector('.wz-step.current')?.textContent.includes('Actions')`, 'actions step');
  await shot('3-detection-wizard-actions');
  await b.evalJs(`document.querySelector('.wizard .icon-btn').click()`);
  await b.go('#/home');
  await b.waitFor(`document.querySelector('[data-target="btn:start:playbook-picker"]')`, 'home again');

  // automation rule panel
  await b.click('btn:start:playbook-picker');
  await b.waitFor(`document.querySelector('[data-target="btn:create-automation"]')`, 'automation');
  await b.click('btn:create-automation');
  await b.waitFor(`document.querySelector('.modal')`, 'panel');
  await b.click('btn:add-condition');
  await b.click('btn:add-action');
  await setSel('.modal select[aria-label="Action"]', 'runPlaybook');
  await b.sleep(400);
  await shot('4-automation-panel');
  await b.finish();
} catch (e) { await b.finish(e); }
