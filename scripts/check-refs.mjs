// Checks that every Microsoft Learn page in server/exam/references.js still exists. Needs the network, so it is not part of `npm test`.
//
//   node scripts/check-refs.mjs
//
// Exit code 1 if any page is missing. A redirect is reported (the page moved), with the address it moved to.
import { REFS } from '../server/exam/references.js';

const entries = Object.entries(REFS);
const bad = [];
const moved = [];
let next = 0;

async function check([id, { url }]) {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'ms-sandbox-ref-check' }, signal: AbortSignal.timeout(30_000) });
    const final = res.url.split('#')[0];
    if (!res.ok) bad.push(`${id}: HTTP ${res.status}  ${url}`);
    else if (final.replace(/\?.*$/, '').replace(/\/$/, '') !== url.replace(/\/$/, '')) moved.push(`${id}: ${url}\n      -> ${final}`);
  } catch (e) {
    bad.push(`${id}: ${e.name}  ${url}`);
  }
}

await Promise.all(Array.from({ length: 8 }, async () => { while (next < entries.length) await check(entries[next++]); }));

console.log(`${entries.length} pages checked: ${entries.length - bad.length} found, ${bad.length} missing, ${moved.length} redirected.`);
if (moved.length) console.log('\nRedirected (update the path to the new address):\n  ' + moved.join('\n  '));
if (bad.length) { console.log('\nMissing:\n  ' + bad.join('\n  ')); process.exitCode = 1; }
