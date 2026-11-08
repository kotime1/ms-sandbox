// Lists the chat models your ICA developer key can use, so you can pick the Claude ids for ICA_MODEL / ASSISTANT_MODEL / EXAM_MODEL.
//
//   node --env-file=.env scripts/ica-models.mjs
//
// Calls GET {ICA_BASE_URL}/chat-models/models (OpenAI-compatible list). Prints ids only; the key is never printed.
import { DEFAULT_BASE_URL } from '../server/core/ica-client.js';

const key = process.env.ICA_API_KEY;
if (!key) { console.error('ICA_API_KEY is not set. Run with: node --env-file=.env scripts/ica-models.mjs'); process.exit(2); }
const base = (process.env.ICA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

try {
  const res = await fetch(`${base}/chat-models/models`, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) { console.error(`ICA answered HTTP ${res.status}. Check the key (ICA UI > Settings > API Keys > ICA APIs) and ICA_BASE_URL.`); process.exit(1); }
  const body = await res.json();
  const list = Array.isArray(body) ? body : body.data ?? body.models ?? [];
  const ids = list.map((m) => (typeof m === 'string' ? m : m.id ?? m.name)).filter(Boolean);
  if (!ids.length) { console.error('No model ids found in the reply. Shape:', Object.keys(body)); process.exit(1); }
  const claude = ids.filter((i) => /claude/i.test(i));
  console.log(`${ids.length} chat models. Claude models:`);
  for (const i of claude) console.log(`  ${i}`);
  if (!claude.length) console.log('  (none matched "claude"; all ids follow)\n' + ids.map((i) => `  ${i}`).join('\n'));
  console.log('\nSet ICA_MODEL=<id> in .env (or ASSISTANT_MODEL / EXAM_MODEL to use different models).');
} catch (e) {
  console.error(`Could not reach ICA (${e.name}).`);
  process.exit(1);
}
