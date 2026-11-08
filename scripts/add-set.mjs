// Adds a new practice-test attempt to questions/questions.json, links its repeated questions to the labs that already cover them, and reports
// what is new. This is the whole workflow for a new set.
//
//   node scripts/add-set.mjs path/to/pasted-results.txt          dry run: shows what would happen
//   node scripts/add-set.mjs path/to/pasted-results.txt --write  adds the set
//
// The input is a pasted results page of 50 questions ("Question 1 of 50", the stem, "Your Answer", "Correct Answer", the explanation).
// What --write does:
//   1. Parses the pages and matches each question to an existing one (95% of the distinct words in common), else makes a new question.
//   2. Appends the attempt (set number, result, what you answered) to each question's `appearances`.
//   3. Adds `setN: [...]` to every lab's sourceQuestions: repeats inherit the labs of the question they repeat, the rest get none.
//   4. Prints the new questions, the ones you got wrong, and the new questions that no lab covers (each needs a lab or a BACKLOG topic
//      in scripts/coverage.mjs before `npm test` passes).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABS } from '../server/labs/index.js';
import { loadQuestions } from '../server/knowledge/questions.js';
import { parseSet } from './lib/question-sets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
const write = process.argv.includes('--write');
if (!file || file.startsWith('--')) { console.error('usage: node scripts/add-set.mjs <pasted-results.txt> [--write]'); process.exit(2); }

const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
const sim = (a, b) => { const A = words(a), B = words(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };

const data = loadQuestions();
const existing = data.questions;
const nextSet = Math.max(0, ...existing.flatMap((q) => q.appearances.map((a) => Number(a.set.slice(1))))) + 1;
const setName = `S${nextSet}`;
const parsed = parseSet(readFileSync(file, 'utf8'));
if (parsed.length !== 50) { console.error(`expected 50 questions, found ${parsed.length}. Is the whole page pasted?`); process.exit(1); }

const added = [];
const touched = [];
for (const p of parsed) {
  const ok = p.mine.length > 0 && p.mine.every((m) => m.correct);
  const appearance = { set: setName, n: p.n, result: ok ? 'right' : p.mine.some((m) => m.correct) ? 'partly' : 'wrong', gave: p.mine.map((m) => m.text) };
  const home = existing.map((q) => ({ q, s: sim(q.stem, p.stem) })).sort((a, b) => b.s - a.s)[0];
  if (home && home.s >= 0.95) { home.q.appearances.push(appearance); touched.push({ q: home.q, appearance }); continue; }
  const q = {
    id: `q${String(existing.length + 1).padStart(3, '0')}`, stem: p.stem, correct: p.right.map((r) => r.text),
    wrongOptions: p.options.filter((o) => !o.correct).map((o) => ({ text: o.text, why: o.why })), explanation: p.explanation,
    objective: p.objective, tests: p.tests, appearances: [appearance], labs: [],
  };
  existing.push(q);
  added.push(q);
  touched.push({ q, appearance });
}

// Lab links: a repeat inherits the labs of the question it repeats (from its earlier appearances).
const setKey = `set${nextSet}`;
const links = new Map(LABS.map((l) => [l.id, []]));
for (const { q, appearance } of touched) {
  for (const l of LABS) if (q.appearances.some((a) => a !== appearance && (l.sourceQuestions[`set${a.set.slice(1)}`] ?? []).includes(a.n))) links.get(l.id).push(appearance.n);
}
for (const { q, appearance } of touched) q.labs = [...new Set([...q.labs, ...LABS.filter((l) => links.get(l.id).includes(appearance.n)).map((l) => l.id)])];

const wrong = touched.filter((t) => t.appearance.result !== 'right');
console.log(`${setName}: ${parsed.length} questions. ${added.length} new, ${parsed.length - added.length} repeat an earlier question. You got ${parsed.length - wrong.length} right.`);
console.log(`\nNew questions (${added.length}):`);
for (const q of added) console.log(`  ${setName}:${q.appearances[0].n} [${q.appearances[0].result}]  ${q.stem.replace(/\s+/g, ' ').slice(0, 110)}`);
console.log(`\nMissed (${wrong.length}):`);
for (const t of wrong) console.log(`  ${setName}:${t.appearance.n}${added.includes(t.q) ? ' (new)' : ''} [${t.q.labs.join(', ') || 'no lab'}]  ${t.q.stem.replace(/\s+/g, ' ').slice(0, 90)}`);
const bare = added.filter((q) => !q.labs.length);
console.log(`\nNew questions with no lab (${bare.length}): add a lab, or a BACKLOG topic in scripts/coverage.mjs:`);
for (const q of bare) console.log(`  ${setName}:${q.appearances[0].n}`);

if (!write) { console.log('\n(dry run: pass --write to save)'); process.exit(0); }

writeFileSync(path.join(root, 'questions', 'questions.json'), `${JSON.stringify({ generatedFrom: [...new Set([...data.generatedFrom, setKey])], questions: existing }, null, 1)}\n`);
for (const l of LABS) {
  const labFile = path.join(root, 'server', 'labs', `${l.id}.js`);
  let src = readFileSync(labFile, 'utf8');
  const m = src.match(/(sourceQuestions: \{[^}]*?)(\s*\})/);
  if (!m) { console.warn(`${l.id}: no sourceQuestions found, add ${setKey} by hand`); continue; }
  const nums = [...new Set(links.get(l.id))].sort((a, b) => a - b);
  src = src.replace(m[0], `${m[1]}, ${setKey}: [${nums.join(', ')}]${m[2]}`);
  writeFileSync(labFile, src);
}
console.log(`\nwrote questions/questions.json and added ${setKey} to ${LABS.length} labs. Next: node scripts/progress.mjs, then node scripts/coverage.mjs --check.`);
