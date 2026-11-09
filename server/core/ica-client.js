// IBM Consulting Advantage (ICA) chat client, shared by the assistant-agent and the exam-agent.
// ICA is OpenAI-compatible: POST {base}/chat-models/chat/completions with a Bearer developer key (ICA UI > Settings >
// API Keys > ICA APIs). The model is an ICA chat-model id; list them with `node scripts/probe-ica.mjs models`.
//
// Security properties:
//  - The key comes from the environment only. It is sent in the Authorization header to one fixed https origin
//    (ICA_BASE_URL, operator-set) and is never returned to the browser, put in a prompt, or logged.
//  - redirect:'error' so a redirect cannot carry the key to another host. Every call has a timeout and a reply size cap.
//  - Errors carry only a name and an HTTP status, never the response body (it could echo request content).

export const DEFAULT_BASE_URL = 'https://api.servicesessentials.ibm.com/v1';
const MAX_REPLY_BYTES = 200_000;

export function icaConfig(env, modelVar) {
  const key = env.ICA_API_KEY || '';
  const model = env[modelVar] || env.ICA_MODEL || '';
  const base = (env.ICA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  // No model id is guessed: the available ids are tenant-specific, so Claude is only enabled when one is configured.
  return { key, model, base, enabled: Boolean(key && model && base.startsWith('https://')) };
}

/**
 * @returns the assistant text. Throws an Error named 'UpstreamError' (HTTP failure or empty reply) or a fetch error
 *          such as 'TimeoutError'; callers catch and fall back.
 */
export async function icaChat(args) { return (await icaChatFull(args)).text; }

/** Like icaChat, but also says whether the model stopped because it ran out of tokens (a cut-off reply). */
export async function icaChatFull({ fetchImpl = globalThis.fetch, cfg, system, messages, maxTokens, timeoutMs }) {
  const res = await fetchImpl(`${cfg.base}/chat-models/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { name: 'UpstreamError', status: res.status });
  const body = await res.json();
  const choice = body?.choices?.[0];
  const content = choice?.message?.content;
  const text = (typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => p?.text ?? '').join('') : '').trim();
  if (!text) throw Object.assign(new Error('empty'), { name: 'UpstreamError' });
  const tokens = Number.isFinite(body?.usage?.completion_tokens) ? body.usage.completion_tokens : null;
  return { text: text.slice(0, MAX_REPLY_BYTES), truncated: choice?.finish_reason === 'length', finish: String(choice?.finish_reason ?? ''), tokens };
}
