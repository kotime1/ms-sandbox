// Saves a screenshot of a Yes/No dropdown question and a KQL "complete the query" question after answering.
//   node scripts/shot-exam-dropdown.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './e2e-lib.mjs';

const b = await launch();
mkdirSync('screenshots', { recursive: true });
await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1500, deviceScaleFactor: 1, mobile: false });
const shot = async (name) => {
  const r = await b.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`screenshots/${name}.png`, Buffer.from(r.result.data, 'base64'));
};
try {
  await b.open('#/exam/home');
  await b.waitFor(`document.querySelector('[data-target="btn:exam-start"]')`, 'start');
  await b.setValue('#exam-count', '50');
  await b.click('btn:exam-start');
  const got = { yesno: false, code: false };
  for (let n = 1; n <= 50 && !(got.yesno && got.code); n++) {
    await b.waitFor(`document.querySelector('.exam-count')?.textContent === 'Question ${n} of 50'`, `q${n}`);
    const kind = await b.evalJs(`document.querySelector('.exam-template.code') ? 'code' : document.querySelector('.exam-template') ? 'yesno' : 'other'`);
    if (kind === 'other') {
      await b.evalJs(`(() => { const r = document.querySelector('.exam-options input[type=radio]'); if (r) { r.click(); return; } const need = Number(/select (\\d)/.exec(document.querySelector('.exam-card').innerText)?.[1] ?? 0); const c = document.querySelectorAll('.exam-options input[type=checkbox]'); for (let i = 0; i < need; i++) c[i].click(); })()`);
    } else {
      // Pick the first real option in each dropdown, so some blanks are right and some wrong.
      await b.evalJs(`document.querySelectorAll('.exam-template select').forEach((s) => { s.selectedIndex = 1; })`);
    }
    await b.click('btn:exam-submit');
    await b.waitFor(`document.querySelector('.exam-verdict')`, 'feedback');
    if (kind !== 'other' && !got[kind] && await b.evalJs(`!!document.querySelector('select.is-wrong') && !!document.querySelector('select.is-right')`)) { got[kind] = true; await shot(`exam-dropdown-${kind}`); }
    await b.click('btn:exam-next');
  }
  console.log('captured', JSON.stringify(got));
  await b.finish();
} catch (e) { await b.finish(e); }
