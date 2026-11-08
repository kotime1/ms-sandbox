// Finds dropdown blanks where the reason on the right option and the reason on a wrong option read almost alike.
// That happens in Yes/No statements: each choice should say why THAT choice is right or wrong.
//   node scripts/inspect-overlap.mjs
import { BANK } from '../server/exam/bank/index.js';

const words = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 3));
let found = 0;
for (const q of BANK.filter((x) => x.type === 'dropdown')) {
  for (const b of q.blanks) {
    const right = b.options.find((o) => o.correct);
    const a = words(right.why);
    for (const o of b.options.filter((x) => !x.correct)) {
      const c = words(o.why);
      const ratio = [...a].filter((x) => c.has(x)).length / Math.min(a.size, c.size);
      if (ratio > 0.6) {
        found++;
        console.log(`${q.id} blank ${b.id} (${(ratio * 100).toFixed(0)}% overlap)\n   RIGHT "${right.text}": ${right.why}\n   wrong "${o.text}": ${o.why}`);
      }
    }
  }
}
console.log(`\n${found} blank(s) to review`);
