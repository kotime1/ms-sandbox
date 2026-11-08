// Runs every browser test, one after another, and prints a one-line result for each. Needs a Chromium-based browser (Edge or Chrome).
//
//   node scripts/e2e-all.mjs            (or: npm run e2e)
//
// Each script runs in its own process because the browser harness ends the process when a run finishes. Exit code 1 if any script fails.
import { spawnSync } from 'node:child_process';

const RUNS = [
  ['e2e.mjs'], ['e2e-wizards.mjs'], ['e2e-labs2.mjs'], ['e2e-labs3.mjs'],
  ['e2e-labs4.mjs', 'ueba'], ['e2e-labs4.mjs', 'mcp'],
  ['e2e-exam.mjs'], ['e2e-exam-cards.mjs', 'on'], ['e2e-exam-cards.mjs', 'off'],
];

let failed = 0;
for (const [file, ...args] of RUNS) {
  const label = [file, ...args].join(' ').padEnd(30);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [new URL(`./${file}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...args], { encoding: 'utf8', timeout: 600_000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(0).padStart(3);
  const passed = /(\d+) checks passed/.exec(r.stdout ?? '')?.[1];
  if (r.status === 0 && passed) console.log(`ok    ${label} ${passed.padStart(3)} checks  ${secs}s`);
  else {
    failed++;
    console.log(`FAIL  ${label} exit ${r.status}  ${secs}s`);
    console.log((r.stdout ?? '').split('\n').filter(Boolean).slice(-6).map((l) => `        ${l}`).join('\n'));
    console.log((r.stderr ?? '').split('\n').filter(Boolean).slice(-3).map((l) => `        ${l}`).join('\n'));
  }
}
console.log(failed ? `\n${failed} of ${RUNS.length} browser runs failed` : `\nall ${RUNS.length} browser runs passed`);
process.exit(failed ? 1 : 0);
