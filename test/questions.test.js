// The consolidated practice questions (questions/questions.json): the one record of every distinct question and every attempt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadQuestions, setKeys, appearances, numbersIn, find } from '../server/knowledge/questions.js';
import { LABS } from '../server/labs/index.js';

const { questions } = loadQuestions();

test('every question has a stem, at least one correct answer, a unique id and at least one appearance', () => {
  assert.ok(questions.length >= 100);
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  for (const q of questions) {
    assert.match(q.id, /^q\d{3}$/);
    assert.ok(q.stem.length > 20, `${q.id} stem`);
    assert.ok(q.correct.length >= 1 && q.correct.every((c) => c.length > 1), `${q.id} correct answers`);
    assert.ok(q.appearances.length >= 1, `${q.id} appearances`);
  }
});

test('each set holds questions 1 to 50 exactly once, so nothing was dropped or doubled', () => {
  const keys = setKeys();
  assert.ok(keys.length >= 6);
  for (const k of keys) assert.deepEqual(numbersIn(k), Array.from({ length: 50 }, (_, i) => i + 1), k);
  assert.equal(appearances().length, keys.length * 50);
});

test('an appearance is recorded in order, as a set and a number, with a result and what was answered', () => {
  for (const q of questions) {
    let last = 0;
    for (const a of q.appearances) {
      assert.match(a.set, /^S\d+$/);
      assert.ok(Number.isInteger(a.n) && a.n >= 1 && a.n <= 50);
      assert.ok(['right', 'partly', 'wrong'].includes(a.result), `${q.id}`);
      assert.ok(a.gave.length >= 1 && a.gave.every((g) => g.length > 0), `${q.id} ${a.set}:${a.n} answers given`);
      assert.ok(Number(a.set.slice(1)) >= last, `${q.id} appearances are in set order`);
      last = Number(a.set.slice(1));
    }
  }
});

test('a result agrees with the answers given: right means every answer given is a correct answer', () => {
  for (const q of questions) for (const a of q.appearances) {
    const inside = a.gave.filter((g) => q.correct.includes(g)).length;
    if (a.result === 'right') assert.equal(inside, a.gave.length, `${q.id} ${a.set}:${a.n}`);
    if (a.result === 'wrong') assert.ok(inside < a.gave.length || a.gave.length === 0, `${q.id} ${a.set}:${a.n}`);
  }
});

test('the questions that have more than one correct answer say so in the stem', () => {
  const multi = questions.filter((q) => q.correct.length > 1);
  assert.ok(multi.length >= 5);
  for (const q of multi) assert.match(q.stem, /\b(two|three|2|3)\b|Each (correct )?answer/i, q.id);
});

test('explanations are clean: no link titles, scrape words or leftover answer markers', () => {
  for (const q of questions) {
    assert.doesNotMatch(q.explanation, /This answer is (correct|incorrect)/, q.id);
    assert.doesNotMatch(q.explanation, /\| Microsoft Learn|- Training \|/, q.id);
    assert.doesNotMatch(q.explanation, /^(Introduction|Completed)$/m, q.id);
    assert.doesNotMatch(q.stem, /^(Your Answer|Correct Answer)$/m, q.id);
  }
});

test('the labs a question names are the labs whose sourceQuestions list one of its appearances, and no lab is missed', () => {
  const byId = new Map(LABS.map((l) => [l.id, l]));
  for (const q of questions) {
    const expected = LABS.filter((l) => q.appearances.some((a) => (l.sourceQuestions[`set${a.set.slice(1)}`] ?? []).includes(a.n))).map((l) => l.id).sort();
    assert.deepEqual([...q.labs].sort(), expected, q.id);
    for (const id of q.labs) assert.ok(byId.has(id), `${q.id} -> ${id}`);
  }
});

test('find() and numbersIn() answer lookups, and an unknown set is empty', () => {
  assert.match(find('set6', 12).stem, /User and Entity Behavior Analytics/);
  assert.deepEqual(find('set6', 12).correct.sort(), ['Azure Activity', 'Security Events']);
  assert.equal(find('set99', 1), undefined);
  assert.deepEqual(numbersIn('set99'), []);
});

test('the questions known to need a lab all have one now: the UEBA and the MCP questions', () => {
  assert.ok(find('set6', 12).labs.includes('ueba-sources'));
  for (const [s, n] of [['set1', 50], ['set4', 48], ['set6', 49]]) assert.ok(find(s, n).labs.includes('mcp-workspace'), `${s}:${n}`);
});
