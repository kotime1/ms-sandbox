// The consolidated practice questions (questions/questions.json): every distinct question once, with every place it appeared.
// This is the one reader of that file. The coverage and progress scripts and the tests all go through it.
//
// A "set" is one practice attempt of 50 questions; a question's appearances name them as S1..S6 with the number within that set.
// Labs refer to questions the same way in `sourceQuestions` ({ set6: [12] }).

import { readFileSync } from 'node:fs';

const FILE = new URL('../../questions/questions.json', import.meta.url);

let cache;
export function loadQuestions() {
  cache ??= JSON.parse(readFileSync(FILE, 'utf8'));
  return cache;
}

/** ['set1', 'set2', ...] in order, derived from the data so a new set needs no code change. */
export function setKeys() {
  const seen = new Set(loadQuestions().questions.flatMap((q) => q.appearances.map((a) => a.set)));
  return [...seen].map((s) => `set${s.slice(1)}`).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
}

/** Every appearance of every question as a flat list: { set:'set6', n, result, gave, question } */
export function appearances() {
  return loadQuestions().questions.flatMap((q) => q.appearances.map((a) => ({ set: `set${a.set.slice(1)}`, n: a.n, result: a.result, ok: a.result === 'right', partly: a.result === 'partly', gave: a.gave, question: q })));
}

/** The question numbers present in one set, e.g. 1..50. */
export function numbersIn(setKey) {
  return appearances().filter((a) => a.set === setKey).map((a) => a.n).sort((a, b) => a - b);
}

/** The distinct question that was asked as `setKey` question `n`, or undefined. */
export function find(setKey, n) {
  return appearances().find((a) => a.set === setKey && a.n === n)?.question;
}
