// Browser check of the two cards under an answer's explanation: Sources and references, and Ask the tutor.
// The model is a fake ICA responder, so this is fast and spends no tokens (node --env-file=.env scripts/probe-ica.mjs tutor checks the real service).
//
//   node scripts/e2e-exam-cards.mjs on         tutor switched on (fake model)
//   node scripts/e2e-exam-cards.mjs off        no ICA settings: tutor off, sources still work
//   SHOTS=1 also saves screenshots to screenshots/. The harness ends the process when a run finishes, so each scenario is its own run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './e2e-lib.mjs';

// Replies the fake tutor sends when the learner message starts with the key. Fences are built from a variable so this file stays readable.
const F = '```';
const RICH = {
  DIAGRAM: `Here is the flow.\n\n${F}mermaid\nflowchart TD\n  A([Alert raised]) --> B{True positive?}\n  B -->|Yes| C["Contain the device"]\n  B -->|No| D[Close as benign]\n  C --> E[(Log the action)]\n${F}\n\nIt shows the decision after the alert.`,
  SEQUENCE: `${F}mermaid\nsequenceDiagram\n  autonumber\n  participant R as Automation rule\n  participant P as Playbook\n  R->>P: Run playbook\n  P-->>R: Done\n${F}`,
  TABLE: '| Type | Runs | Use |\n|:--|:-:|--:|\n| **Scheduled** | on a timer | custom `KQL` detections |\n| NRT | about a minute | fast response |\n\nNRT has *limits*.\n\n## Steps\n\n1. Open the incident\n2. Review the alerts\n   - check severity\n   - check entities\n3. Decide\n\n> Remember: classify before closing.',
  BADLINK: 'See [Learn](https://learn.microsoft.com/en-us/azure/sentinel/) and [bad](javascript:alert(1)) and [other](https://evil.example/x).',
  // two diagrams that cannot be drawn, then one that was cut off and never closed (what a reply that ran out of tokens can leave)
  BROKEN: `${F}mermaid\nflowchart TD\n  A --> B[never closed\n${F}\n\nAnd a gantt chart:\n\n${F}mermaid\ngantt\n  title Nope\n${F}\n\nLast one:\n\n${F}mermaid\nflowchart TD\n  A --> B\n  B --> C[half writ`,
};
const asked = [];
const fake = async (body) => {
  const last = body.messages.at(-1).content;
  asked.push({ system: body.messages[0].content, turns: body.messages.length - 1, last });
  if (/FAIL/.test(last)) return { ok: false, status: 503, json: async () => ({}) };
  if (/SLOW/.test(last)) await new Promise((r) => setTimeout(r, 600));
  const reply = RICH[/^(DIAGRAM|SEQUENCE|TABLE|BADLINK|BROKEN|CUTOFF|LIST)/.exec(last)?.[1]]
    ?? (/HTML/.test(last) ? 'Here is <b>bold</b> and <img src=x onerror=alert(1)> as plain text.' : `Tutor reply ${asked.length}: because that is how it works.\nSecond line.`);
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
  await b.ok(await b.evalJs(`!!document.querySelector('.exam-card .exam-verdict') && !!document.querySelector('.exam-card .exam-explain') && !!document.querySelector('.exam-card .exam-options, .exam-card .exam-steps, .exam-card .exam-template')`), 'the choices, verdict and explanation share one card');
  await b.ok(await b.evalJs(`!document.querySelector('.exam-card').contains(document.querySelector('.exam-tutor')) && !document.querySelector('.exam-card').contains(document.querySelector('.exam-sources'))`), 'Sources and the tutor are separate cards, outside the question card');
  await b.ok(await b.evalJs(`document.querySelector('.exam-tutor').compareDocumentPosition(document.querySelector('[data-target="btn:exam-next"]')) & Node.DOCUMENT_POSITION_FOLLOWING`), 'Next question comes after both cards');

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

  // ---- rich replies, on question 2 (a question allows 12 learner messages, so these get their own chat)
  const tutors = () => b.evalJs(`document.querySelectorAll('.exam-msg.tutor:not(.pending)').length`);
  const ask = async (text) => {
    const before = await tutors();
    await b.setValue('.exam-chat-input', text);
    await b.click('btn:exam-ask');
    await b.waitFor(`document.querySelectorAll('.exam-msg.tutor:not(.pending)').length === ${before + 1}`, `reply to ${text.slice(0, 12)}`);
  };
  const lastReply = (expr) => b.evalJs(`(() => { const m = [...document.querySelectorAll('.exam-msg.tutor')].at(-1); return ${expr}; })()`);

  // Budget: the tutor allows 12 messages a minute per session and 12 per question. Question 1 used 6, so this chat uses 5 (11 in all).
  await ask('TABLE of rule types');
  await b.ok(await lastReply(`m.querySelectorAll('table.rich-table').length === 1 && m.querySelectorAll('thead th').length === 3 && m.querySelectorAll('tbody tr').length === 2`), 'a Markdown table is drawn as a real table');
  await b.ok(await lastReply(`m.querySelector('tbody td strong')?.textContent === 'Scheduled' && m.querySelector('tbody td code')?.textContent === 'KQL'`), 'bold and code work inside a table cell');
  await b.ok(await lastReply(`m.querySelector('.rich-table-wrap').getAttribute('tabindex') === '0' && [...m.querySelectorAll('th')].every((t) => t.getAttribute('scope') === 'col')`), 'the table scrolls by keyboard and has column headers');
  await b.ok(await lastReply(`getComputedStyle(m.querySelectorAll('th')[1]).textAlign === 'center' && getComputedStyle(m.querySelectorAll('th')[2]).textAlign === 'right'`), 'column alignment from the Markdown is applied');
  await b.ok(await lastReply(`m.querySelector('em')?.textContent === 'limits' && !/\\*/.test(m.textContent)`), 'emphasis is applied and no stray asterisks remain');
  await shot('exam-11-rich-table');
  // the same reply also holds a list, a heading and a quote
  await b.ok(await lastReply(`m.querySelectorAll('ol > li').length >= 3 && m.querySelectorAll('ol ul li').length === 2`), 'numbered list with a nested bullet list');
  await b.ok(await lastReply(`m.querySelector('.rich-h')?.textContent === 'Steps' && m.querySelector('blockquote')?.textContent.includes('classify before closing')`), 'a heading and a quote are drawn');

  await ask('DIAGRAM of the triage');
  await b.ok(await lastReply(`m.querySelectorAll('svg.dg-flow').length === 1`), 'a Mermaid flowchart is drawn as an SVG');
  await b.ok(await lastReply(`m.querySelectorAll('.dg-shape').length === 5 && m.querySelectorAll('.dg-edge').length === 4`), 'five steps and four arrows');
  await b.ok(await lastReply(`m.querySelector('svg .dg-shape[points]') !== null`), 'the decision is a diamond');
  await b.ok(await lastReply(`[...m.querySelectorAll('.dg-edge-label')].map((t) => t.textContent).sort().join() === 'No,Yes'`), 'arrow labels Yes and No are shown');
  await b.ok(await lastReply(`/Contain the device/.test(m.querySelector('svg').textContent) && !/mermaid|flowchart/.test(m.querySelector('svg').textContent)`), 'step text is in the picture and the Mermaid source is not');
  await b.ok(await lastReply(`m.querySelector('svg').getAttribute('role') === 'img' && m.querySelector('svg').getAttribute('aria-label').startsWith('Flowchart with 5 steps')`), 'the picture has a screen-reader description');
  await b.ok(await lastReply(`m.querySelector('details.rich-diagram-src pre code').textContent.includes('flowchart TD')`), 'the diagram text is available under "Diagram text"');
  await b.ok(await lastReply(`m.querySelector('.rich-diagram-scroll').getAttribute('tabindex') === '0'`), 'a wide diagram scrolls by keyboard');
  await b.ok(await lastReply(`[...m.querySelectorAll('svg .dg-shape')].every((s) => { const r = s.getBoundingClientRect(); return r.width > 20 && r.height > 15; })`), 'the shapes have real size on screen (the CSS applied under the CSP)');
  await b.ok(await lastReply(`getComputedStyle(m.querySelector('.dg-shape')).fill !== 'rgb(0, 0, 0)' && getComputedStyle(m.querySelector('.dg-shape')).stroke !== 'none'`), 'the shapes are styled by the theme, not left black');
  await b.ok(await lastReply(`m.querySelectorAll('[style]').length === 0`), 'no inline style attribute anywhere in a rich reply');
  await shot('exam-12-rich-flow');

  await ask('SEQUENCE of the playbook');
  await b.ok(await lastReply(`m.querySelectorAll('svg.dg-sequence').length === 1 && m.querySelectorAll('.dg-life').length === 2`), 'a sequence diagram is drawn with a lifeline per participant');
  await b.ok(await lastReply(`/1\\. Run playbook/.test(m.querySelector('svg').textContent) && /Automation rule/.test(m.querySelector('svg').textContent)`), 'autonumber and the participant aliases are applied');
  await shot('exam-13-rich-sequence');

  // BADLINK is asked with Markdown-looking text on purpose: the learner's own message must come back exactly as typed.
  await ask('BADLINK **not bold** and <b>x</b>');
  await b.ok(await b.evalJs(`(() => { const you = [...document.querySelectorAll('.exam-msg.you .exam-msg-text')].at(-1); return you.querySelectorAll('strong, b').length === 0 && you.textContent === 'BADLINK **not bold** and <b>x</b>'; })()`), "the learner's own message is shown exactly as typed, never read as Markdown or HTML");
  await b.ok(await lastReply(`[...m.querySelectorAll('a')].map((a) => a.href).join() === 'https://learn.microsoft.com/en-us/azure/sentinel/'`), 'only the Microsoft Learn link became a link');
  await b.ok(await lastReply(`(() => { const a = m.querySelector('a'); return a.target === '_blank' && /noopener/.test(a.rel) && /noreferrer/.test(a.rel); })()`), 'the link opens in a new tab with noopener noreferrer');
  await b.ok(await lastReply(`/javascript:alert\\(1\\)/.test(m.textContent) && /evil\\.example/.test(m.textContent)`), 'a refused link stays visible as text, so the learner can see where it pointed');

  // One reply with three diagrams: one with a shape that never closes, one of an unsupported kind, and a last one cut off mid-label.
  await ask('BROKEN diagram');
  await b.ok(await lastReply(`m.querySelectorAll('.rich-diagram.is-text').length === 3`), 'diagrams that cannot be drawn fall back to their text (three of them in this reply)');
  await b.ok(await lastReply(`/never closed/.test(m.textContent) && /gantt/.test(m.textContent) && /not supported/.test(m.textContent)`), 'the fallback says why, and still shows the text');
  await b.ok(await lastReply(`m.textContent.includes('And a gantt chart') && m.textContent.includes('Last one')`), 'the rest of the reply is still shown around broken diagrams');
  await b.ok(await lastReply(`m.querySelectorAll('svg').length === 0`), 'nothing half-drawn is left behind');
  await shot('exam-14-rich-broken');
  await b.ok(await b.evalJs(`document.querySelectorAll('.exam-chat-log img, .exam-chat-log script, .exam-chat-log iframe, .exam-chat-log [onerror], .exam-chat-log [onclick]').length === 0`), 'no element that could run code exists anywhere in the chat');
});

if (which === 'off') await run('tutor OFF (no ICA settings)', {}, async (b, shot) => {
  await answerNow(b);
  await b.ok(await b.evalJs(`document.querySelectorAll('.exam-sources a').length >= 1`), 'the sources card still works without the tutor');
  await b.waitFor(`/IBM Consulting Advantage is not configured/.test(document.querySelector('.exam-tutor').innerText)`, 'tutor-off message');
  await b.ok(await b.evalJs(`document.querySelector('.exam-chat-form').hidden`), 'the chat box is hidden when the tutor is off');
  await b.ok(await b.evalJs(`document.querySelector('.exam-tutor h4').textContent === 'Ask the tutor'`), 'the card explains itself instead of vanishing');
  await shot('exam-11-tutor-off');
});
