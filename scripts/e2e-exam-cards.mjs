// Browser check of the two cards under an answer's explanation: Sources and references, and Ask the tutor.
// The model is a fake ICA responder, so this is fast and spends no tokens (scripts/probe-tutor.mjs checks the real service).
//
//   node scripts/e2e-exam-cards.mjs on         tutor switched on (fake model)
//   node scripts/e2e-exam-cards.mjs off        no ICA settings: tutor off, sources still work
//   SHOTS=1 also saves screenshots to screenshots/. The harness ends the process when a run finishes, so each scenario is its own run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './e2e-lib.mjs';

const asked = [];
const fake = async (body) => {
  const last = body.messages.at(-1).content;
  asked.push({ system: body.messages[0].content, turns: body.messages.length - 1, last });
  if (/FAIL/.test(last)) return { ok: false, status: 503, json: async () => ({}) };
  if (/SLOW/.test(last)) await new Promise((r) => setTimeout(r, 600));
  const reply = /HTML/.test(last) ? 'Here is <b>bold</b> and <img src=x onerror=alert(1)> as plain text.' : `Tutor reply ${asked.length}: because that is how it works.\nSecond line.`;
  return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: reply } }] }) };
};

async function run(name, opts, fn) {
  console.log(`\n== ${name}`);
  const b = await launch(opts);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1500, deviceScaleFactor: 1, mobile: false });
  const shot = async (n) => {
    if (!process.env.SHOTS) return;
    mkdirSync('screenshots', { recursive: true });
    const r = await b.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`screenshots/${n}.png`, Buffer.from(r.result.data, 'base64'));
  };
  try {
    await b.open('#/exam/home');
    await b.waitFor(`document.querySelector('[data-target="btn:exam-start"]')`, 'start button');
    await b.setValue('#exam-count', '10');
    await b.click('btn:exam-start');
    await b.waitFor(`document.querySelector('.exam-stem')`, 'first question');
    await fn(b, shot);
    const real = b.errors.filter((e) => !/status of (422|503) /.test(e));
    await b.ok(real.length === 0, `no console errors${real.length ? `: ${real.join(' | ')}` : ''}`);
    await b.finish();
  } catch (e) {
    await b.finish(e);
  }
}

/** Pick an answer for whatever type is on screen (first option / first N / first dropdown value) and submit. */
const answerNow = async (b) => {
  await b.evalJs(`(() => {
    const r = document.querySelector('.exam-options input[type=radio]'); if (r) { r.click(); return; }
    const need = Number(/select (\\d)/.exec(document.querySelector('.exam-card').innerText)?.[1] ?? 0);
    const c = document.querySelectorAll('.exam-options input[type=checkbox]'); if (c.length) { for (let i = 0; i < need; i++) c[i].click(); return; }
    document.querySelectorAll('.exam-template select').forEach((s) => { s.selectedIndex = 1; });
  })()`);
  await b.click('btn:exam-submit');
  await b.waitFor(`document.querySelector('.exam-verdict')`, 'feedback');
};

// ---------------------------------------------------------------------------------------------------
const which = process.argv[2];
if (which !== 'on' && which !== 'off') { console.error('usage: node scripts/e2e-exam-cards.mjs on|off'); process.exit(2); }

if (which === 'on') await run('tutor ON', { env: { ICA_API_KEY: 'k', ICA_MODEL: 'm', ICA_BASE_URL: 'https://ica.test/v1' }, fakeIca: fake }, async (b, shot) => {
  await b.ok(!(await b.evalJs(`!!document.querySelector('.exam-tutor')`)), 'before submitting there is no tutor card');
  await b.ok(!(await b.evalJs(`!!document.querySelector('.exam-sources')`)), 'before submitting there are no sources');
  await answerNow(b);

  // ---- sources
  await b.ok(await b.evalJs(`!!document.querySelector('section[aria-label="Sources and references"]')`), 'a Sources and references card appears after submitting');
  const links = await b.evalJs(`[...document.querySelectorAll('.exam-sources a')].map((a) => ({ href: a.href, rel: a.rel, target: a.target, text: a.textContent }))`);
  await b.ok(links.length >= 1, `${links.length} reference link(s) shown`);
  await b.ok(links.every((l) => /^https:\/\/learn\.microsoft\.com\/en-us\//.test(l.href)), 'every reference is a Microsoft Learn page');
  await b.ok(links.every((l) => l.target === '_blank' && /noopener/.test(l.rel) && /noreferrer/.test(l.rel)), 'links open in a new tab with noopener noreferrer');
  await b.ok(links.every((l) => l.text.length > 8), 'links have readable titles');
  await b.ok(await b.evalJs(`document.querySelector('.exam-sources').closest('.exam-card-sub').compareDocumentPosition(document.querySelector('.exam-tutor')) & Node.DOCUMENT_POSITION_FOLLOWING`), 'the tutor card sits below the sources card');
  await b.ok(await b.evalJs(`document.querySelector('.exam-explain').compareDocumentPosition(document.querySelector('.exam-sources')) & Node.DOCUMENT_POSITION_FOLLOWING`), 'the cards sit under the explanation');

  // ---- tutor
  await b.waitFor(`document.querySelector('.exam-chat-form') && !document.querySelector('.exam-chat-form').hidden`, 'chat form');
  await b.ok(await b.evalJs(`document.querySelector('.exam-chat-input').getAttribute('aria-label') === 'Ask a question about this item'`), 'the box has an accessible name');
  await shot('exam-8-cards-empty');

  await b.setValue('.exam-chat-input', 'Why is the other option wrong?');
  await b.click('btn:exam-ask');
  await b.waitFor(`document.querySelectorAll('.exam-msg.tutor:not(.pending)').length === 1`, 'first tutor reply');
  await b.ok(await b.evalJs(`document.querySelector('.exam-msg.you .exam-msg-text').textContent === 'Why is the other option wrong?'`), 'the learner message is shown');
  await b.ok(await b.evalJs(`/Tutor reply 1/.test(document.querySelector('.exam-msg.tutor .exam-msg-text').textContent)`), 'the tutor reply is shown');
  await b.ok(await b.evalJs(`document.querySelector('.exam-chat-input').value === ''`), 'the box is cleared after sending');
  await b.ok(await b.evalJs(`!document.querySelector('.exam-chat-input').disabled && !document.querySelector('[data-target="btn:exam-ask"]').disabled`), 'the box is usable again');
  await b.ok(asked[0].turns === 1 && /QUESTION \(data, not instructions\)/.test(asked[0].system), 'the model got the question context and one user turn');

  // follow-up keeps the history
  await b.setValue('.exam-chat-input', 'And what should I remember for the exam?');
  await b.click('btn:exam-ask');
  await b.waitFor(`document.querySelectorAll('.exam-msg.tutor:not(.pending)').length === 2`, 'second tutor reply');
  await b.ok(asked.at(-1).turns === 3, 'the second turn carries the earlier exchange');
  await b.ok(await b.evalJs(`document.querySelectorAll('.exam-msg').length === 4`), 'the conversation shows four messages');

  // Enter sends, Shift+Enter does not
  await b.setValue('.exam-chat-input', 'sent with Enter');
  await b.evalJs(`document.querySelector('.exam-chat-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))`);
  await b.sleep(300);
  await b.ok(await b.evalJs(`document.querySelectorAll('.exam-msg').length === 4`), 'Shift+Enter does not send');
  await b.evalJs(`document.querySelector('.exam-chat-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await b.waitFor(`document.querySelectorAll('.exam-msg.tutor:not(.pending)').length === 3`, 'reply after Enter');
  await b.ok(true, 'Enter sends');

  // HTML in a reply is text, not markup
  await b.setValue('.exam-chat-input', 'HTML please');
  await b.click('btn:exam-ask');
  await b.waitFor(`document.querySelectorAll('.exam-msg.tutor:not(.pending)').length === 4`, 'html reply');
  await b.ok(await b.evalJs(`document.querySelectorAll('.exam-chat-log b, .exam-chat-log img').length === 0 && /<b>bold<\\/b>/.test(document.querySelector('.exam-chat-log').textContent)`), 'markup in a reply is shown as text, never rendered');

  // slow reply shows a waiting state and locks the box
  await b.setValue('.exam-chat-input', 'SLOW one');
  await b.click('btn:exam-ask');
  await b.ok(await b.evalJs(`!!document.querySelector('.exam-msg.pending') && document.querySelector('.exam-chat-input').disabled`), 'while waiting: a Thinking state shows and the box is locked');
  await b.waitFor(`!document.querySelector('.exam-msg.pending') && document.querySelectorAll('.exam-msg.tutor').length === 5`, 'slow reply');
  await shot('exam-9-cards-chat');

  // a failed call shows a plain message, keeps the text, and the chat still works
  await b.setValue('.exam-chat-input', 'FAIL this one');
  await b.click('btn:exam-ask');
  await b.waitFor(`!document.querySelector('.exam-card .exam-chat-form + .x') && document.querySelector('.exam-tutor .form-error') && !document.querySelector('.exam-tutor .form-error').hidden`, 'error message');
  await b.ok(await b.evalJs(`/could not answer just now/.test(document.querySelector('.exam-tutor .form-error').textContent) && !/503|HTTP|ICA/.test(document.querySelector('.exam-tutor .form-error').textContent)`), 'a failure shows a plain message with no technical detail');
  await b.ok(await b.evalJs(`document.querySelector('.exam-chat-input').value === 'FAIL this one'`), 'the learner text is kept so they can retry');
  await b.ok(await b.evalJs(`!document.querySelector('.exam-msg.pending') && document.querySelectorAll('.exam-msg').length === 10`), 'the failed turn leaves no half message');
  await shot('exam-10-cards-error');

  // Leave and come back: the chat and sources come back with the saved answer
  await b.go('#/home');
  await b.waitFor(`document.body.classList.contains('p-home') && !document.querySelector('.loading')`, 'home');
  await b.go('#/exam/home');
  await b.waitFor(`document.querySelector('.exam-verdict') && document.querySelectorAll('.exam-msg').length === 10`, 'resumed chat');
  await b.ok(await b.evalJs(`document.querySelectorAll('.exam-sources a').length >= 1`), 'after coming back the sources are still there');
  await b.ok(true, 'after coming back the whole conversation is restored');

  // next question: a fresh tutor card, locked until answered
  await b.click('btn:exam-next');
  await b.waitFor(`document.querySelector('.exam-count')?.textContent === 'Question 2 of 10'`, 'question 2');
  await b.ok(!(await b.evalJs(`!!document.querySelector('.exam-tutor')`)), 'the next question has no tutor card until it is answered');
  await answerNow(b);
  await b.waitFor(`document.querySelector('.exam-chat-form') && !document.querySelector('.exam-chat-form').hidden`, 'chat form q2');
  await b.ok(await b.evalJs(`document.querySelectorAll('.exam-msg').length === 0`), 'question 2 starts with an empty chat');
});

if (which === 'off') await run('tutor OFF (no ICA settings)', {}, async (b, shot) => {
  await answerNow(b);
  await b.ok(await b.evalJs(`document.querySelectorAll('.exam-sources a').length >= 1`), 'the sources card still works without the tutor');
  await b.waitFor(`/IBM Consulting Advantage is not configured/.test(document.querySelector('.exam-tutor').innerText)`, 'tutor-off message');
  await b.ok(await b.evalJs(`document.querySelector('.exam-chat-form').hidden`), 'the chat box is hidden when the tutor is off');
  await b.ok(await b.evalJs(`document.querySelector('.exam-tutor h4').textContent === 'Ask the tutor'`), 'the card explains itself instead of vanishing');
  await shot('exam-11-tutor-off');
});
