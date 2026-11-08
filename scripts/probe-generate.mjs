// Manual check against the real ICA service: asks for a few questions and reports how many pass, and why the rest do not.
//   node --env-file=.env scripts/probe-generate.mjs [domain]
import { ExamAgent } from '../server/agents/exam-agent.js';
import { validateQuestion } from '../server/exam/validate.js';

const domain = process.argv[2] ?? 'respond';
const a = new ExamAgent({ env: process.env });
if (!a.available) { console.log('ICA is not configured'); process.exit(2); }
const types = ['single', 'multi', 'order', 'dropdown'];
const t0 = Date.now();
const r = await a.generate(domain, types);
console.log(`asked ${types.length} (${domain}), accepted ${r.questions.length}, rejected ${r.rejected}, error: ${r.error}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const q of r.questions) {
  const whys = [...(q.options ?? []), ...(q.steps ?? []), ...(q.blanks ?? []).flatMap((b) => b.options)].map((o) => o.why);
  console.log(`  ${q.type.padEnd(8)} ok | ${whys.length} explanations, shortest ${Math.min(...whys.map((w) => w.length))} chars, all distinct: ${new Set(whys).size === whys.length}`);
}
