// Prints your accuracy per question set, split into questions that were NEW in that set and repeats, and lists the questions still wrong on
// your latest attempt. Reads the answer markers in question_sets/*.txt. Use it to refresh sc200-study-guide.md after adding a set.
//
//   node scripts/progress.mjs
//
// A question counts as fully correct only if EVERY answer you gave is marked correct (so a multi-select with one wrong choice is not).
// Two questions are the same when their wording is at least 95% the same (the sets repeat each other word for word).

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABS } from '../server/labs/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SETS = readdirSync(path.join(root, 'question_sets')).filter((f) => /^set\d+\.txt$/.test(f)).map((f) => f.replace('.txt', '')).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));

/** The learner's own answer markers: only the part before "Correct Answer", so the model answer's marker is not counted. */
export const learnerMarks = (body) => {
  const a = body.indexOf('\nYour Answer\n');
  const b = body.indexOf('\nCorrect Answer\n');
  if (a < 0) return [];
  return [...body.slice(a, b < 0 ? undefined : b).matchAll(/This answer is (correct|incorrect)\./g)].map((m) => m[1] === 'correct');
};

const parse = (set) => {
  const text = readFileSync(path.join(root, 'question_sets', `${set}.txt`), 'utf8').replace(/\r/g, '');
  const parts = text.split(/^Question (\d+) of \d+$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1];
    const marks = learnerMarks(body);
    out.push({
      set, n: Number(parts[i]), stem: body.split(/\nYour Answer\n/)[0].replace(/\s+/g, ' ').trim(),
      ok: marks.length > 0 && marks.every(Boolean), partly: marks.some(Boolean) && !marks.every(Boolean),
      mine: (/\nYour Answer\n([^\n]+)/.exec(body) ?? [])[1], right: (/\nCorrect Answer\n([^\n]+)/.exec(body) ?? [])[1],
    });
  }
  return out;
};

const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length > 3));
const same = (a, b) => { const A = words(a), B = words(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i) >= 0.95; };
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');

const bySet = Object.fromEntries(SETS.map((s) => [s, parse(s)]));
const labFor = new Map();
for (const l of LABS) for (const s of SETS) for (const n of l.sourceQuestions[s] ?? []) labFor.set(`${s}:${n}`, l.id);

console.log('set    fully  partly  wrong | new  new ok   | repeats  ok    | repeats you had missed, now right');
SETS.forEach((s, ix) => {
  let full = 0, partly = 0, wrong = 0, nNew = 0, nNewOk = 0, nRep = 0, nRepOk = 0, missed = 0, fixed = 0;
  for (const q of bySet[s]) {
    if (q.ok) full++; else if (q.partly) partly++; else wrong++;
    const prev = SETS.slice(0, ix).flatMap((e) => bySet[e].filter((p) => same(p.stem, q.stem)));
    if (!prev.length) { nNew++; if (q.ok) nNewOk++; } else {
      nRep++; if (q.ok) nRepOk++;
      if (prev.some((p) => !p.ok)) { missed++; if (q.ok) fixed++; }
    }
  }
  console.log(`${s}  ${String(full).padStart(5)} ${String(partly).padStart(7)} ${String(wrong).padStart(6)} | ${String(nNew).padStart(3)} ${pct(nNewOk, nNew).padStart(7)}   | ${String(nRep).padStart(7)} ${pct(nRepOk, nRep).padStart(5)} | ${fixed}/${missed} (${pct(fixed, missed)})`);
});

// Distinct questions, and which are still wrong on the latest attempt.
const clusters = [];
for (const q of SETS.flatMap((s) => bySet[s])) {
  const c = clusters.find((cl) => same(cl.stem, q.stem));
  if (c) c.seen.push(q); else clusters.push({ stem: q.stem, seen: [q] });
}
const still = clusters.filter((c) => !c.seen[c.seen.length - 1].ok).map((c) => ({
  stem: c.stem, asked: c.seen.length, wrong: c.seen.filter((s) => !s.ok).length,
  lab: c.seen.map((s) => labFor.get(`${s.set}:${s.n}`)).find(Boolean) ?? '(no lab)',
  where: c.seen.map((s) => `${s.set.replace('set', 'S')}:${s.n}${s.ok ? '' : 'x'}`).join(' '), right: c.seen[c.seen.length - 1].right,
})).sort((a, b) => b.wrong - a.wrong || b.asked - a.asked);

console.log(`\n${clusters.length} distinct questions; ${clusters.filter((c) => c.seen.some((s) => !s.ok)).length} missed at least once; ${still.length} still wrong on the latest attempt:\n`);
for (const r of still) console.log(`  wrong ${r.wrong}/${r.asked}  [${r.lab}]  ${r.stem.slice(0, 110)}\n      answer: ${r.right}   (${r.where})`);
