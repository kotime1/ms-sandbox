// Saves screenshots of a single-choice and a multiple-choice question after a wrong answer, at desktop and phone width.
//   node scripts/shot-exam-choices.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './e2e-lib.mjs';

const b = await launch();
mkdirSync('screenshots', { recursive: true });
const shot = async (name, w, h) => {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await b.sleep(200);
  const r = await b.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`screenshots/${name}.png`, Buffer.from(r.result.data, 'base64'));
};
try {
  await b.open('#/exam/home');
  await b.waitFor(`document.querySelector('[data-target="btn:exam-start"]')`, 'start');
  await b.setValue('#exam-count', '50');
  await b.click('btn:exam-start');
  let got = { single: false, multi: false };
  for (let n = 1; n <= 50 && !(got.single && got.multi); n++) {
    await b.waitFor(`document.querySelector('.exam-count')?.textContent === 'Question ${n} of 50'`, `q${n}`);
    const kind = await b.evalJs(`document.querySelector('.exam-options input[type=radio]') ? 'single' : document.querySelector('.exam-options input[type=checkbox]') ? 'multi' : 'other'`);
    if (kind === 'single' || kind === 'multi') {
      // Choose the LAST option(s), so the pick is usually wrong and both marks show.
      await b.evalJs(`(() => { const need = Number(/select (\\d)/.exec(document.querySelector('.exam-card').innerText)?.[1] ?? 1); const i = [...document.querySelectorAll('.exam-options input')]; for (let k = 0; k < need; k++) i[i.length - 1 - k].click(); })()`);
    } else {
      await b.evalJs(`(() => { document.querySelectorAll('.exam-template select').forEach((s) => { s.selectedIndex = 1; }); })()`);
    }
    await b.click('btn:exam-submit');
    await b.waitFor(`document.querySelector('.exam-verdict')`, 'feedback');
    if ((kind === 'single' || kind === 'multi') && !got[kind] && /^Incorrect/.test(await b.evalJs(`document.querySelector('.exam-verdict').textContent`))) {
      got[kind] = true;
      await shot(`exam-${kind}-desktop`, 1280, 1500);
      if (kind === 'single') await shot('exam-single-phone', 390, 2400);
    }
    await b.click('btn:exam-next');
  }
  console.log('captured', JSON.stringify(got));
  await b.finish();
} catch (e) { await b.finish(e); }
