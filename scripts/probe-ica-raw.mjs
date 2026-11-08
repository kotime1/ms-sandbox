// Diagnostic: one raw ICA chat call that prints the HTTP status, finish_reason, usage and timing (never the key or the prompt).
//   node --env-file=.env scripts/probe-ica-raw.mjs "your question" [max_tokens]
import { icaConfig } from '../server/core/ica-client.js';

const cfg = icaConfig(process.env, 'EXAM_MODEL');
const question = process.argv[2] ?? 'What is the capital of France? Answer in one sentence.';
const max = Number(process.argv[3] ?? 500);
const t0 = Date.now();
try {
  const res = await fetch(`${cfg.base}/chat-models/chat/completions`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, max_tokens: max, messages: [{ role: 'system', content: 'You are a tutor for SC-200. Keep replies under 180 words.' }, { role: 'user', content: question }] }),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${text.length} bytes`);
  let j; try { j = JSON.parse(text); } catch { console.log('not JSON; first 200 chars:', text.slice(0, 200)); process.exit(1); }
  const c = j.choices?.[0];
  console.log('finish_reason:', c?.finish_reason, '| usage:', JSON.stringify(j.usage), '| top-level keys:', Object.keys(j).join(','));
  console.log('content type:', typeof c?.message?.content, '| length:', String(c?.message?.content ?? '').length);
  if (!res.ok) console.log('error body keys/values:', JSON.stringify(j.error ?? j).slice(0, 300));
} catch (e) {
  console.log(`FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e.name}: ${e.message}`);
}
