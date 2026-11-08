// Saves screenshots of the practice exam after answering, for the question types a full run does not reliably reach, to ./screenshots
// (git-ignored). Needs a Chromium-based browser.
//
//   node scripts/screenshot-exam.mjs
//
// Captures: a single-choice and a multi-choice question answered wrongly (desktop, and the single-choice at phone width), and a Yes/No
// dropdown and a KQL "complete the query" dropdown answered partly wrong. The full flow is covered by e2e-exam.mjs (SHOTS=1).
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './e2e-lib.mjs';

const b = await launch();
mkdirSync('screenshots', { recursive: true });
const shot = async (name, w, h) => {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await b.sleep(200);
  const r = await b.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`screenshots/${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
// Answer whatever is on screen with its first option(s), or the LAST option(s) for choice questions so the pick is usually wrong.
const answerNow = (last) => b.evalJs(`(() => {
  const need = Number(/select (\\d)/.exec(document.querySelector('.exam-card').innerText)?.[1] ?? 1);
  const inputs = [...document.querySelectorAll('.exam-options input')];
  if (inputs.length) { for (let k = 0; k < need; k++) inputs[${last} ? inputs.length - 1 - k : k].click(); return; }
  document.querySelectorAll('.exam-template select').forEach((s) => { s.selectedIndex = 1; });
})()`);

try {
  await b.open('#/exam/home');
  await b.waitFor(`document.querySelector('[data-target="btn:exam-start"]')`, 'start');
  await b.setValue('#exam-count', '50');
  await b.click('btn:exam-start');
  const got = { single: false, multi: false, yesno: false, code: false };
  for (let n = 1; n <= 50 && !Object.values(got).every(Boolean); n++) {
    await b.waitFor(`document.querySelector('.exam-count')?.textContent === 'Question ${n} of 50'`, `question ${n}`);
    const kind = await b.evalJs(`document.querySelector('.exam-template.code') ? 'code' : document.querySelector('.exam-template') ? 'yesno' : document.querySelector('.exam-options input[type=radio]') ? 'single' : document.querySelector('.exam-options input[type=checkbox]') ? 'multi' : 'other'`);
    await answerNow(kind === 'single' || kind === 'multi');
    await b.click('btn:exam-submit');
    await b.waitFor(`document.querySelector('.exam-verdict')`, 'feedback');
    const wrongAndRight = await b.evalJs(`!!document.querySelector('.exam-option.is-wrong.is-picked') || (!!document.querySelector('select.is-wrong') && !!document.querySelector('select.is-right'))`);
    if (kind !== 'other' && !got[kind] && wrongAndRight) {
      got[kind] = true;
      await shot(`exam-${kind}`, 1280, 1500);
      if (kind === 'single') await shot('exam-single-phone', 390, 2400);
    }
    await b.click('btn:exam-next');
  }
  console.log('captured', JSON.stringify(got));
  await b.finish();
} catch (e) { await b.finish(e); }
