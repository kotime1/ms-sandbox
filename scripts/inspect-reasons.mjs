// One-off inspection helper: prints the reasons of the questions given as arguments (default h018 m019).
//   node scripts/inspect-reasons.mjs h018 m019
import { BANK } from '../server/exam/bank/index.js';
import { makeItem, publicView } from '../server/exam/item.js';

for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['h018', 'm019']) {
  const q = BANK.find((x) => x.id === id);
  console.log(`\n## ${id} [${q.type}]`);
  if (q.blanks) for (const b of q.blanks) for (const o of b.options) console.log(`  blank ${b.id} ${o.correct ? 'RIGHT' : 'wrong'} "${o.text}": ${o.why}`);
  if (q.options) for (const o of q.options) console.log(`  ${o.correct ? 'RIGHT' : 'wrong'} "${o.text}": ${o.why}`);
  if (q.steps) q.steps.forEach((s, i) => console.log(`  step ${i + 1}: ${s.why}`));
  const view = JSON.stringify(publicView(makeItem(q, () => 0.5), 1, 10));
  const rs = (q.options ?? q.steps ?? q.blanks.flatMap((b) => b.options)).map((o) => o.why);
  for (const w of rs) { const at = view.indexOf(w.slice(0, 30)); if (at >= 0) console.log(`  !! public view contains the start of: "${w.slice(0, 30)}" -> ...${view.slice(Math.max(0, at - 30), at + 50)}...`); }
}
