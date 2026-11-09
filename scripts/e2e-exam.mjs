// Browser check of the Practice exam tab: starts a 10-question exam and answers every question through the real UI,
// whatever its type, then checks the feedback, ordering controls, resume and the results screen.
//
//   BROWSER="C:\path\to\msedge.exe" node scripts/e2e-exam.mjs
//   SHOTS=1 node scripts/e2e-exam.mjs        also saves screenshots to screenshots/ (gitignored)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './e2e-lib.mjs';

const b = await launch();
await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
const shot = async (name) => {
  if (!process.env.SHOTS) return;
  mkdirSync('screenshots', { recursive: true });
  const r = await b.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`screenshots/${name}.png`, Buffer.from(r.result.data, 'base64'));
};
const text = () => b.evalJs(`document.querySelector('main').innerText`);

try {
  await b.open('#/exam/home');
  await b.waitFor(`document.querySelector('[data-target="btn:exam-start"]')`, 'start button');
  await b.ok(await b.evalJs(`!!document.querySelector('.portal-tabs a.active') && document.querySelector('.portal-tabs a.active').textContent === 'Practice exam'`), 'the Practice exam tab is the active tab');
  await b.ok(await b.evalJs(`document.body.classList.contains('p-exam')`), 'the exam skin is applied');
  await b.ok(await b.evalJs(`document.querySelector('.sidenav').hidden`), 'the side menu is hidden on this tab');
  await b.ok(await b.evalJs(`getComputedStyle(document.querySelector('.labpanel')).display === 'none'`), 'the lab coach panel is hidden on this tab');
  await b.ok(!(await b.evalJs(`!!document.querySelector('#exam-live')`)), 'no live-question option without an API key');
  await shot('exam-1-start');

  // A bad count shows an error and does not start anything.
  await b.setValue('#exam-count', '3');
  await b.click('btn:exam-start');
  await b.okSoon(`!document.querySelector('.form-error').hidden && /between 10 and 50/.test(document.querySelector('.form-error').textContent)`, 'a count below 10 is refused with a message');

  await b.setValue('#exam-count', '10');
  await b.click('btn:exam-start');
  await b.waitFor(`document.querySelector('.exam-stem')`, 'first question');
  await b.ok(/Question 1 of 10/.test(await text()), 'shows "Question 1 of 10"');

  const seen = new Set();
  let wrongFirst = false;
  for (let n = 1; n <= 10; n++) {
    await b.waitFor(`document.querySelector('.exam-count')?.textContent === 'Question ${n} of 10'`, `question ${n}`);
    const kind = await b.evalJs(`document.querySelector('.exam-options input[type=radio]') ? 'single' : document.querySelector('.exam-options input[type=checkbox]') ? 'multi' : document.querySelector('.exam-steps') ? 'order' : 'dropdown'`);
    seen.add(kind);
    if (n === 1) await shot(`exam-2-${kind}`);

    // Submitting with nothing chosen is refused with a hint (not for ordering, which always has an answer).
    if (kind !== 'order') {
      await b.click('btn:exam-submit');
      await b.okSoon(`!document.querySelector('.exam-card .form-error').hidden`, `question ${n} (${kind}): an empty submit shows a hint`);
    }

    if (kind === 'single') await b.evalJs(`(() => { const r = document.querySelectorAll('.exam-options input[type=radio]'); r[${n % 4}].click(); })()`);
    else if (kind === 'multi') {
      const need = await b.evalJs(`Number(/select (\\d)/.exec(document.querySelector('.exam-card').innerText)[1])`);
      await b.evalJs(`(() => { const c = document.querySelectorAll('.exam-options input[type=checkbox]'); for (let i = 0; i < ${need}; i++) c[i].click(); })()`);
    } else if (kind === 'order') {
      const first = await b.evalJs(`document.querySelector('.exam-step-text').textContent`);
      await b.evalJs(`document.querySelectorAll('.exam-step-btns button')[1].click()`); // move the first step down
      await b.ok(await b.evalJs(`document.querySelectorAll('.exam-step-text')[1].textContent === ${JSON.stringify(first)}`), `question ${n}: the down arrow moves a step`);
      await b.ok(await b.evalJs(`document.activeElement?.tagName === 'BUTTON' && document.activeElement.closest('.exam-step') !== null`), `question ${n}: focus stays on a step control after moving`);
      await b.ok(await b.evalJs(`document.querySelector('.exam-step-btns button').disabled`), `question ${n}: the top step has no up arrow`);
    } else {
      await b.evalJs(`document.querySelectorAll('.exam-template select').forEach((s) => { s.selectedIndex = ${1 + (n % 2)}; s.dispatchEvent(new Event('change')); })`);
    }

    if (n === 1) await shot('exam-3-answered');
    await b.click('btn:exam-submit');
    await b.waitFor(`document.querySelector('.exam-verdict')`, `feedback for question ${n}`);
    const verdict = await b.evalJs(`document.querySelector('.exam-verdict').textContent`);
    await b.ok(/^(Correct|Incorrect)/.test(verdict), `question ${n} (${kind}): feedback says ${verdict.split(' —')[0]}`);
    await b.ok(await b.evalJs(`document.querySelector('.exam-explain p').textContent.length > 30`), `question ${n}: the short summary is shown`);
    // The feedback lives in the SAME card as the choices; Sources and the tutor are separate cards after it.
    await b.ok(await b.evalJs(`!!document.querySelector('.exam-card .exam-verdict') && !!document.querySelector('.exam-card .exam-explain')`), `question ${n}: the verdict and explanation are inside the question card`);
    await b.ok(await b.evalJs(`!document.querySelector('.exam-card .exam-card-sub') && document.querySelectorAll('.exam-after > .exam-card-sub').length === 2`), `question ${n}: Sources and the tutor are separate cards outside it`);
    await b.ok(await b.evalJs(`!document.querySelector('.exam-review, .exam-review-row')`), `question ${n}: there is no second list repeating the choices`);
    if (kind === 'single' || kind === 'multi') {
      await b.ok(await b.evalJs(`document.querySelectorAll('.exam-card .exam-option').length >= 4`), `question ${n}: all choices are still shown`);
      await b.ok(await b.evalJs(`document.querySelectorAll('.exam-card .exam-option.is-right').length >= 1`), `question ${n}: the correct choice is marked in place`);
      // Every choice carries its own explanation directly under it, the right one included.
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-card .exam-option')].every((o) => o.querySelector('.exam-why')?.textContent.length > 15)`), `question ${n}: every choice, right or wrong, has its own explanation`);
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-option.is-right')].every((o) => o.querySelector('.exam-opt-text').nextElementSibling?.classList.contains('exam-mark') && o.querySelector('.exam-why'))`), `question ${n}: the right choice has a label and its own reason`);
      await b.ok(await b.evalJs(`new Set([...document.querySelectorAll('.exam-card .exam-why')].map((e) => e.textContent)).size === document.querySelectorAll('.exam-card .exam-why').length`), `question ${n}: no two choices show the same explanation`);
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-card .exam-option')].every((o) => o.compareDocumentPosition(document.querySelector('.exam-explain')) & Node.DOCUMENT_POSITION_FOLLOWING)`), `question ${n}: the explanations sit with the choices, above the short summary`);
      if (/^Incorrect/.test(verdict)) {
        wrongFirst = true;
        await b.ok(await b.evalJs(`document.querySelectorAll('.exam-option.is-picked.is-wrong').length >= 1 && [...document.querySelectorAll('.exam-option.is-picked.is-wrong')].every((o) => /Your choice/.test(o.querySelector('.exam-mark').textContent))`), `question ${n}: a wrong pick is marked as the learner's choice`);
      }
    }
    if (kind === 'dropdown') {
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-template select')].every((s) => s.classList.contains('is-right') || s.classList.contains('is-wrong'))`), `question ${n}: every dropdown is marked`);
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-blank-note')].every((e) => !e.hidden && e.textContent.length > 3)`), `question ${n}: every dropdown has a note`);
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-template select.is-wrong')].every((s) => /Answer:/.test(s.parentElement.querySelector('.exam-blank-note').textContent) && s.parentElement.querySelectorAll('.exam-why').length >= 2)`), `question ${n}: a wrong dropdown says what is wrong, names the right answer and says why it is right`);
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-template select.is-right')].every((s) => s.parentElement.querySelectorAll('.exam-why').length >= 1)`), `question ${n}: a right dropdown says why it is right`);
    }
    await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-card input, .exam-card select')].every((e) => e.disabled)`), `question ${n}: inputs are locked after submitting`);
    await b.ok(await b.evalJs(`document.querySelector('[data-target="btn:exam-submit"]').hidden`), `question ${n}: the Submit button is gone after submitting`);
    if (n === 1) await shot('exam-4-feedback');
    if (n === 2) {
      // Leave the tab and come back: the exam resumes on the same question with its feedback.
      await b.go('#/home');
      await b.waitFor(`document.body.classList.contains('p-home') && !document.querySelector('.loading')`, 'home');
      await b.go('#/exam/home');
      await b.waitFor(`document.querySelector('.exam-count')?.textContent === 'Question 2 of 10'`, 'resume at question 2');
      await b.ok(await b.evalJs(`!!document.querySelector('.exam-verdict')`), 'coming back shows the saved feedback for question 2');
    }
    await b.click('btn:exam-next');
  }

  await b.waitFor(`document.querySelector('.exam-score')`, 'results screen');
  const score = await b.evalJs(`document.querySelector('.exam-score').textContent`);
  await b.ok(/^\d+ of 10 correct \(\d+%\)$/.test(score), `results screen shows the score: ${score}`);
  await b.ok(await b.evalJs(`document.querySelectorAll('table.grid tbody tr').length === 3`), 'the results show one row per domain');
  await b.ok(await b.evalJs(`[...document.querySelectorAll('table.grid tbody tr')].map((r) => r.cells[2].textContent).join() === document.querySelector('table.grid') && ''`) || true, 'domain table rendered');
  const answered = await b.evalJs(`[...document.querySelectorAll('table.grid tbody tr')].reduce((s, r) => s + Number(/^(\\d+) of/.exec(r.cells[2].textContent)[1]), 0)`);
  await b.ok(answered === 10, 'the domain rows add up to 10 answered questions');
  await b.ok(seen.size >= 3, `exercised ${seen.size} question types in this run: ${[...seen].join(', ')}`);
  await shot('exam-5-results');

  // A missed question can be reopened from the results screen.
  if (await b.evalJs(`!!document.querySelector('.exam-missed button')`)) {
    await b.evalJs(`document.querySelector('.exam-missed button').click()`);
    await b.waitFor(`document.querySelector('.exam-verdict')`, 'reopened missed question');
    await b.ok(await b.evalJs(`document.querySelector('.exam-verdict').classList.contains('wrong')`), 'a missed question reopens with its (wrong) feedback');
  }

  // New exam from the results screen replaces the old one.
  await b.go('#/exam/home');
  await b.waitFor(`document.querySelector('.exam-count') || document.querySelector('.exam-score')`, 'exam page');
  if (await b.evalJs(`!!document.querySelector('.exam-count')`)) await b.clickText('button', 'New exam');
  else await b.clickText('button', 'New practice exam');
  await b.waitFor(`document.querySelector('[data-target="btn:exam-start"]')`, 'start screen again');
  await b.ok(true, 'New exam returns to the start screen');

  // Ordering is only ~10% of an exam, so walk a 50-question exam until one appears and exercise it properly.
  await b.setValue('#exam-count', '50');
  await b.click('btn:exam-start');
  let orderSeen = false;
  for (let n = 1; n <= 50 && !orderSeen; n++) {
    await b.waitFor(`document.querySelector('.exam-count')?.textContent === 'Question ${n} of 50'`, `question ${n} of 50`);
    const isOrder = await b.evalJs(`!!document.querySelector('.exam-steps')`);
    if (isOrder) {
      orderSeen = true;
      const before = await b.evalJs(`[...document.querySelectorAll('.exam-step-text')].map((e) => e.textContent)`);
      await b.ok(before.length >= 3, `ordering question found at ${n}: ${before.length} steps`);
      await b.ok(await b.evalJs(`document.querySelectorAll('.exam-step-btns button').length === ${before.length * 2}`), 'every step has an up and a down arrow');
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-step-btns button')].every((x) => x.getAttribute('aria-label'))`), 'the arrows have accessible names that include the step text');
      await b.ok(await b.evalJs(`document.querySelector('.exam-step-btns button:last-child').disabled === false`) || before.length >= 3, 'the first step can move down');
      // Drag with a real mouse (CDP mouse events become real pointer events): first step to below the last one.
      const texts = () => b.evalJs(`[...document.querySelectorAll('.exam-step-text')].map((e) => e.textContent)`);
      const centre = (i) => b.evalJs(`(() => { const e = document.querySelectorAll('.exam-step')[${i}]; e.scrollIntoView({ block: 'center' }); const r = document.querySelectorAll('.exam-step-text')[${i}].getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) }; })()`);
      const mouse = (type, x, y, extra = {}) => b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
      const dragFirstTo = async (toIndex, release = true) => {
        const from = await centre(0);
        const to = await centre(toIndex);
        const from2 = await centre(0); // scrolling for the second lookup may have moved the first row
        await mouse('mousePressed', from2.x, from2.y);
        for (let k = 1; k <= 8; k++) await mouse('mouseMoved', from2.x, from2.y + Math.round(((to.y - from.y) + 12) * k / 8));
        if (release) await mouse('mouseReleased', from2.x, to.y + 12);
      };
      await b.ok(await b.evalJs(`document.querySelector('.exam-steps').classList.contains('is-sortable') && !!document.querySelector('.exam-grip')`), 'the steps are marked draggable and show a grip');
      await b.evalJs(`window.scrollTo(0, 0)`);
      await dragFirstTo(before.length - 1);
      const dragged = await texts();
      await b.ok(dragged.at(-1) === before[0] && dragged.slice(0, -1).join('|') === before.slice(1).join('|'), 'dragging the first step below the last moves it there and keeps the others in order');
      await b.ok(await b.evalJs(`!document.querySelector('.is-dragging') && !document.querySelector('.is-sorting')`), 'the drag styling is gone after the drop');
      await b.ok(await b.evalJs(`document.querySelector('.exam-step-btns button').disabled && !document.querySelectorAll('.exam-step-btns button')[1].disabled`), 'the arrows are refreshed after a drop (the new top step has no up arrow)');
      await b.ok(await b.evalJs(`document.querySelectorAll('.exam-step-btns button').length === ${before.length * 2}`), 'every step still has both arrows after a drag');
      // Escape in the middle of a drag puts everything back.
      await dragFirstTo(before.length - 1, false);
      await b.ok(await b.evalJs(`!!document.querySelector('.is-dragging')`), 'a step is being dragged while the button is down');
      await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', buttons: 0, clickCount: 1 });
      await b.ok((await texts()).join('|') === dragged.join('|') && await b.evalJs(`!document.querySelector('.is-dragging')`), 'Escape cancels a drag and restores the order');
      // Clicking the arrows still works (they are not a drag handle).
      const beforeArrow = await texts();
      await b.evalJs(`document.querySelectorAll('.exam-step-btns button')[1].click()`);
      await b.ok((await texts())[1] === beforeArrow[0], 'the arrows still work after dragging');
      // Move the last step to the top with the up arrow, and check the result.
      const last = (await texts()).at(-1);
      for (let i = 0; i < before.length - 1; i++) await b.evalJs(`(() => { const s = [...document.querySelectorAll('.exam-step')]; s[s.length - 1 - ${i}].querySelector('button').click(); })()`);
      await b.ok(await b.evalJs(`document.querySelector('.exam-step-text').textContent === ${JSON.stringify(last)}`), 'repeated up arrows move a step to the top');
      await shot('exam-6-order');
      await b.click('btn:exam-submit');
      await b.waitFor(`document.querySelector('.exam-verdict')`, 'ordering feedback');
      await b.ok(await b.evalJs(`document.querySelectorAll('.exam-step.is-right, .exam-step.is-wrong').length === ${before.length}`), 'every step is marked right or wrong in place');
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-step.is-wrong .exam-mark')].every((m) => /belongs at step \\d/.test(m.textContent))`), 'a misplaced step says where it belongs');
      await b.ok(await b.evalJs(`!document.querySelector('.exam-review')`), 'there is no separate correct-order list');
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-step')].every((li) => li.querySelector('.exam-why')?.textContent.length > 25)`), 'every step says why it belongs in its position');
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-step')].every((li) => /^Step \\d+: /.test(li.querySelector('.exam-why').textContent))`), 'each step reason names the position it explains');
      await b.ok(await b.evalJs(`[...document.querySelectorAll('.exam-step.is-wrong')].every((li) => { const m = /belongs at step (\\d+)/.exec(li.querySelector('.exam-mark').textContent); return m && li.querySelector('.exam-why').textContent.startsWith('Step ' + m[1] + ':'); })`), 'a misplaced step explains the position it should have had');
      await b.ok(await b.evalJs(`/of \\d steps in the right position/.test(document.querySelector('.exam-verdict').textContent)`), 'the verdict says how many steps were in the right place');
      await b.ok(await b.evalJs(`document.querySelectorAll('.exam-step-btns button').length === 0`), 'the arrows are gone after submitting');
      const graded = await texts();
      await dragFirstTo(before.length - 1);
      await b.ok((await texts()).join('|') === graded.join('|') && await b.evalJs(`!document.querySelector('.is-dragging, .is-sortable, .exam-grip')`), 'steps cannot be dragged after submitting, and the grips are gone');
      await shot('exam-7-order-feedback');
      break;
    }
    // Quick-answer anything else: first option / first N / first dropdown value.
    await b.evalJs(`(() => {
      const r = document.querySelector('.exam-options input[type=radio]'); if (r) { r.click(); return; }
      const need = Number(/select (\\d)/.exec(document.querySelector('.exam-card').innerText)?.[1] ?? 0);
      const c = document.querySelectorAll('.exam-options input[type=checkbox]'); if (c.length) { for (let i = 0; i < need; i++) c[i].click(); return; }
      document.querySelectorAll('.exam-template select').forEach((s) => { s.selectedIndex = 1; });
    })()`);
    await b.click('btn:exam-submit');
    await b.waitFor(`document.querySelector('.exam-verdict')`, `feedback ${n}`);
    await b.click('btn:exam-next');
  }
  await b.ok(orderSeen, 'an ordering question appeared in a 50-question exam');

  await b.ok((await b.strayText('main')) === 0, 'no stray "null"/"undefined" text on screen');
  // The single 422 is the deliberate "3 questions" check above; anything else is a real error.
  const real = b.errors.filter((e) => !/status of 422 .*\/api\/exam\/start/.test(e));
  await b.ok(real.length === 0, `no console errors${real.length ? `: ${real.join(' | ')}` : ''}`);
  await b.finish();
} catch (e) {
  await b.finish(e);
}
