// Builds questions/questions.json from the raw practice-test pages in question_sets/ : every DISTINCT question once, with every place it appeared.
//   node scripts/consolidate-questions.mjs            dry run: prints the summary and any near-misses
//   node scripts/consolidate-questions.mjs --write    writes questions/questions.json
//
// Two appearances are the same question when their stems share at least 95% of their distinct words (the sets repeat each other word
// for word). The script prints every pair that scored 85-95%, which are the ones a human should look at before trusting the merge.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABS } from '../server/labs/index.js';
import { parseSet } from './lib/question-sets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SETS = readdirSync(path.join(root, 'question_sets')).filter((f) => /^set\d+\.txt$/.test(f)).map((f) => f.replace('.txt', '')).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
const write = process.argv.includes('--write');

const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
const sim = (a, b) => { const A = words(a), B = words(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };

// ---- read every appearance
const appearances = [];
for (const set of SETS) {
  for (const q of parseSet(readFileSync(path.join(root, 'question_sets', `${set}.txt`), 'utf8'))) {
    const ok = q.mine.length > 0 && q.mine.every((m) => m.correct);
    appearances.push({ set, ...q, ok, partly: !ok && q.mine.some((m) => m.correct) });
  }
}

// ---- group into distinct questions (first appearance is the "home")
const groups = [];
const near = [];
for (const a of appearances) {
  let best = null;
  for (const g of groups) { const s = sim(g.stem, a.stem); if (!best || s > best.s) best = { g, s }; }
  if (best && best.s >= 0.95) best.g.seen.push(a);
  else {
    if (best && best.s >= 0.85) near.push({ a: `${a.set}:${a.n}`, b: `${best.g.seen[0].set}:${best.g.seen[0].n}`, s: best.s });
    groups.push({ stem: a.stem, seen: [a] });
  }
}

// ---- which lab practises each question
const labsFor = (set, n) => LABS.filter((l) => (l.sourceQuestions[set] ?? []).includes(n)).map((l) => l.id);

const DOMAIN = { '1': 'Manage a security operations environment', '2': 'Respond to security incidents', '3': 'Perform threat hunting' };
const questions = groups.map((g, i) => {
  // Prefer the most informative appearance: one with listed options or an objective, otherwise the latest.
  const best = [...g.seen].reverse().find((s) => s.options.length || s.objective) ?? g.seen.at(-1);
  const richest = [...g.seen].sort((x, y) => (y.explanation.length + y.options.length * 40) - (x.explanation.length + x.options.length * 40))[0];
  const withObj = g.seen.find((s) => s.objective);
  return {
    id: `q${String(i + 1).padStart(3, '0')}`,
    stem: g.seen[0].stem,
    correct: best.right.map((r) => r.text),
    wrongOptions: (richest.options.length ? richest.options : best.options).filter((o) => !o.correct).map((o) => ({ text: o.text, why: o.why })),
    explanation: richest.explanation,
    objective: withObj?.objective ?? '',
    tests: withObj?.tests ?? '',
    appearances: g.seen.map((s) => ({ set: s.set.replace('set', 'S'), n: s.n, result: s.ok ? 'right' : s.partly ? 'partly' : 'wrong', gave: s.mine.map((m) => m.text) })),
    labs: [...new Set(g.seen.flatMap((s) => labsFor(s.set, s.n)))],
  };
});

// ---- report
const multi = questions.filter((q) => q.correct.length > 1).length;
console.log(`${appearances.length} appearances in ${SETS.length} sets -> ${questions.length} distinct questions (${multi} with more than one correct answer)`);
console.log(`with a written explanation: ${questions.filter((q) => q.explanation.length > 30).length} | with listed wrong options: ${questions.filter((q) => q.wrongOptions.length).length} | with an objective: ${questions.filter((q) => q.objective).length} | with a lab: ${questions.filter((q) => q.labs.length).length}`);
console.log(`appeared once: ${questions.filter((q) => q.appearances.length === 1).length} | twice: ${questions.filter((q) => q.appearances.length === 2).length} | 3+: ${questions.filter((q) => q.appearances.length >= 3).length}`);
console.log(`\nnear-misses (85-95% similar, kept as SEPARATE questions): ${near.length}`);
for (const n of near) console.log(`  ${n.a} vs ${n.b}  ${(n.s * 100).toFixed(0)}%`);
const noAnswer = questions.filter((q) => !q.correct.length || q.correct.some((c) => !c));
console.log(`\nquestions with no correct answer captured: ${noAnswer.length}${noAnswer.length ? ` -> ${noAnswer.map((q) => q.id).join(', ')}` : ''}`);

if (write) {
  mkdirSync(path.join(root, 'questions'), { recursive: true });
  writeFileSync(path.join(root, 'questions', 'questions.json'), `${JSON.stringify({ generatedFrom: SETS, questions }, null, 1)}\n`);
  console.log(`\nwrote questions/questions.json (${questions.length} questions)`);
} else console.log('\n(dry run: pass --write to save)');
