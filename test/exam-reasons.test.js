import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK, loadBank, mergeReasons } from '../server/exam/bank/index.js';
import { checkStructure } from '../server/exam/schema.js';
import { makeItem, publicView, grade } from '../server/exam/item.js';

const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const wordsOf = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 3));

/** Every piece of text a learner reads under a choice, with where it sits. */
function reasonsOf(q) {
  if (q.options) return q.options.map((o) => ({ where: `${q.id} "${o.text.slice(0, 40)}"`, text: o.text, why: o.why, correct: Boolean(o.correct) }));
  if (q.steps) return q.steps.map((s, i) => ({ where: `${q.id} step ${i + 1}`, text: s.text, why: s.why, correct: true }));
  return q.blanks.flatMap((b) => b.options.map((o) => ({ where: `${q.id} blank ${b.id} "${o.text.slice(0, 30)}"`, text: o.text, why: o.why, correct: Boolean(o.correct) })));
}

test('every choice and every ordering step in the bank has its own explanation, right ones included', () => {
  let n = 0;
  for (const q of BANK) for (const r of reasonsOf(q)) {
    n++;
    assert.ok(typeof r.why === 'string' && r.why.trim().length >= 15 && r.why.length <= 300, `${r.where}: missing or out of range`);
  }
  assert.ok(n > 400, `${n} explanations checked`);
});

test('no two choices of one question share the same explanation', () => {
  for (const q of BANK) {
    const all = reasonsOf(q).map((r) => r.why);
    assert.equal(new Set(all).size, all.length, `${q.id} repeats an explanation`);
  }
});

test('an explanation says more than its choice: it is not just the option text again', () => {
  const bad = [];
  for (const q of BANK) for (const r of reasonsOf(q)) {
    if (norm(r.why).startsWith(norm(r.text)) && norm(r.why).length < norm(r.text).length + 25) bad.push(r.where);
    const a = wordsOf(r.text);
    const b = wordsOf(r.why);
    if (a.size >= 4 && [...a].every((w) => b.has(w)) && b.size < a.size + 4) bad.push(`${r.where} (adds almost nothing)`);
  }
  assert.deepEqual(bad, []);
});

test('an explanation for a right choice is not a copy of the whole-question explanation', () => {
  for (const q of BANK.filter((x) => x.type === 'single')) {
    const right = q.options.find((o) => o.correct);
    assert.notEqual(norm(right.why), norm(q.explanation), q.id);
  }
});

test('an ordering step explains its position: it points at what comes before or after, or why it must be there', () => {
  const orders = BANK.filter((q) => q.type === 'order');
  assert.ok(orders.length >= 5);
  for (const q of orders) {
    assert.equal(q.steps.length, new Set(q.steps.map((s) => s.why)).size, `${q.id}: steps share an explanation`);
    for (const [i, s] of q.steps.entries()) assert.ok(s.why.length >= 25, `${q.id} step ${i + 1} is too thin to explain a position`);
  }
});

test('the reasons are not in a question before it is submitted', () => {
  for (const q of BANK) {
    const view = JSON.stringify(publicView(makeItem(q, seeded(3)), 1, 10));
    // The whole reason, not a prefix: a scenario may legitimately contain a few of the same words as a reason.
    for (const r of reasonsOf(q)) assert.ok(!view.includes(r.why), `${r.where} leaked`);
    assert.doesNotMatch(view, /"why"/);
  }
});

test('graded feedback carries each choice\'s reason, and each step\'s reason with its position', () => {
  const answerFor = (it) => it.q.type === 'single' ? { choice: it.options.find((o) => !o.correct).id }
    : it.q.type === 'multi' ? { choices: it.options.slice(0, it.q.select).map((o) => o.id) }
      : it.q.type === 'order' ? { order: [...it.steps].reverse().map((s) => s.id) }
        : { picks: Object.fromEntries(it.blanks.map((b) => [b.id, b.options[0].id])) };
  for (const q of BANK) {
    const res = grade(makeItem(q, seeded(4)), answerFor(makeItem(q, seeded(4))));
    if (res.options) for (const o of res.options) assert.ok(o.why && o.why.length >= 15, `${q.id} option ${o.id}`);
    if (res.blanks) for (const b of res.blanks) for (const o of b.options) assert.ok(o.why && o.why.length >= 15, `${q.id} blank ${b.id}`);
    if (res.steps) {
      assert.deepEqual(res.steps.map((s) => s.position), res.steps.map((_, i) => i + 1));
      for (const s of res.steps) assert.ok(s.why && s.why.length >= 25, `${q.id} step ${s.position}`);
    }
  }
});

test('the schema now refuses a right option or a step without a reason', () => {
  const q = BANK.find((x) => x.type === 'single');
  const noRight = { ...q, options: q.options.map((o) => (o.correct ? { text: o.text, correct: true } : o)) };
  assert.match(checkStructure(noRight).join(), /every option needs a 'why'.*say why the right answer is right/);
  const ord = BANK.find((x) => x.type === 'order');
  const noStep = { ...ord, steps: ord.steps.map((s, i) => (i === 1 ? { text: s.text } : s)) };
  assert.match(checkStructure(noStep).join(), /steps\[1\]: needs a 'why'.*position 2/);
});

test('mergeReasons reports a typo\'d option, a reason for a missing blank, and a wrong step count', () => {
  const single = { id: 'z1', domain: 'manage', objective: 'Specify Microsoft Sentinel roles', type: 'single', source: 'bank', stem: 'Which one is right for this question?', explanation: 'x'.repeat(50), options: [{ text: 'Right one', correct: true }, { text: 'Wrong one', why: 'This is wrong for a spelled out reason.' }] };
  assert.match(mergeReasons([single], { z1: { right: { 'Rihgt one': 'A long enough reason for the check.' } } }).problems.join(), /not a right option/);
  const order = { id: 'z2', domain: 'manage', objective: 'Specify Microsoft Sentinel roles', type: 'order', source: 'bank', stem: 'Put these in order please.', explanation: 'x'.repeat(50), steps: [{ text: 'First step' }, { text: 'Second step' }, { text: 'Third step' }] };
  assert.match(mergeReasons([order], { z2: { steps: ['only one reason here, too few'] } }).problems.join(), /needs 3 step reasons, has 1/);
});

test('a bank with a missing reason cannot load', () => {
  const q = BANK.find((x) => x.type === 'single');
  const stripped = { ...q, options: q.options.map((o) => (o.correct ? { text: o.text, correct: true } : o)) };
  assert.throws(() => loadBank({ f: [stripped] }), /every option needs a 'why'/);
});
