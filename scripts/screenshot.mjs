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
try {
  await b.open('#/home');
  await b.waitFor(`document.querySelector('[data-target="btn:start:suppress-app1"]')`, 'home');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
  await shot('1-home');
  await b.click('btn:start:suppress-app1');
  await b.waitFor(`location.hash === '#/defender/alerts'`, 'alerts');
  await b.waitFor(`document.querySelector('.tabs')`, 'tabs');
  await b.sleep(500);
  await shot('2-incidents-alerts');
  await b.go('#/defender/hunting');
  await b.waitFor(`document.querySelector('textarea.kql')`, 'hunting');
  await b.sleep(400);
  await shot('3-advanced-hunting');
  await b.finish();
} catch (e) { await b.finish(e); }
