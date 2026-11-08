// Prints your accuracy per question set, split into questions that were NEW in that set and repeats, and lists the questions still wrong on
// your latest attempt. Reads questions/questions.json. Use it to refresh sc200-study-guide.md after adding a set.
//
//   node scripts/progress.mjs
//
// A question counts as fully correct only if EVERY answer you gave is marked correct (so a multi-select with one wrong choice is not).
// "New" means the question's first appearance was in that set; a repeat is any later appearance.

import { LABS } from '../server/labs/index.js';
import { loadQuestions, setKeys } from '../server/knowledge/questions.js';

const SETS = setKeys();
const questions = loadQuestions().questions;
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
const key = (q) => q.appearances.map((a) => `set${a.set.slice(1)}:${a.n}`);

const labFor = new Map();
for (const l of LABS) for (const s of SETS) for (const n of l.sourceQuestions[s] ?? []) labFor.set(`${s}:${n}`, l.id);

console.log('set    fully  partly  wrong | new  new ok   | repeats  ok    | repeats you had missed, now right');
SETS.forEach((s) => {
  const here = questions.flatMap((q) => q.appearances.map((a, i) => ({ q, a, i }))).filter(({ a }) => `set${a.set.slice(1)}` === s);
  let full = 0, partly = 0, wrong = 0, nNew = 0, nNewOk = 0, nRep = 0, nRepOk = 0, missed = 0, fixed = 0;
  for (const { q, a, i } of here) {
    if (a.result === 'right') full++; else if (a.result === 'partly') partly++; else wrong++;
    if (i === 0) { nNew++; if (a.result === 'right') nNewOk++; } else {
      nRep++; if (a.result === 'right') nRepOk++;
      if (q.appearances.slice(0, i).some((p) => p.result !== 'right')) { missed++; if (a.result === 'right') fixed++; }
    }
  }
  console.log(`${s}  ${String(full).padStart(5)} ${String(partly).padStart(7)} ${String(wrong).padStart(6)} | ${String(nNew).padStart(3)} ${pct(nNewOk, nNew).padStart(7)}   | ${String(nRep).padStart(7)} ${pct(nRepOk, nRep).padStart(5)} | ${fixed}/${missed} (${pct(fixed, missed)})`);
});

// Distinct questions, and which are still wrong on the latest attempt.
const still = questions.filter((q) => q.appearances.at(-1).result !== 'right').map((q) => ({
  stem: q.stem.replace(/\s+/g, ' ').trim(), asked: q.appearances.length, wrong: q.appearances.filter((s) => s.result !== 'right').length,
  lab: q.labs[0] ?? '(no lab)',
  where: q.appearances.map((s) => `${s.set}:${s.n}${s.result === 'right' ? '' : 'x'}`).join(' '), right: q.correct.join(' + '),
})).sort((a, b) => b.wrong - a.wrong || b.asked - a.asked);

console.log(`
${questions.length} distinct questions; ${questions.filter((q) => q.appearances.some((s) => s.result !== 'right')).length} missed at least once; ${still.length} still wrong on the latest attempt:
`);
for (const r of still) console.log(`  wrong ${r.wrong}/${r.asked}  [${r.lab}]  ${r.stem.slice(0, 110)}
      answer: ${r.right}   (${r.where})`);
