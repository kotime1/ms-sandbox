import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icaConfig, icaChat, DEFAULT_BASE_URL } from '../server/core/ica-client.js';

test('config: needs a key and a model; per-agent model wins over ICA_MODEL; https only; trailing slash trimmed', () => {
  assert.equal(icaConfig({}, 'EXAM_MODEL').enabled, false);
  assert.equal(icaConfig({ ICA_API_KEY: 'k' }, 'EXAM_MODEL').enabled, false, 'no model id is guessed');
  assert.equal(icaConfig({ ICA_MODEL: 'm' }, 'EXAM_MODEL').enabled, false);
  const c = icaConfig({ ICA_API_KEY: 'k', ICA_MODEL: 'general', EXAM_MODEL: 'exam' }, 'EXAM_MODEL');
  assert.equal(c.enabled, true);
  assert.equal(c.model, 'exam');
  assert.equal(icaConfig({ ICA_API_KEY: 'k', ICA_MODEL: 'general' }, 'EXAM_MODEL').model, 'general');
  assert.equal(c.base, DEFAULT_BASE_URL);
  assert.equal(icaConfig({ ICA_API_KEY: 'k', ICA_MODEL: 'm', ICA_BASE_URL: 'https://x.example/v1///' }, 'A').base, 'https://x.example/v1');
  assert.equal(icaConfig({ ICA_API_KEY: 'k', ICA_MODEL: 'm', ICA_BASE_URL: 'http://x.example/v1' }, 'A').enabled, false);
});

const cfg = { key: 'sk-secret', model: 'm', base: 'https://ica.example/v1' };
const call = (fetchImpl) => icaChat({ fetchImpl, cfg, system: 'SYS', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10, timeoutMs: 1000 });

test('request: Bearer auth, system prompt first, no redirects, key only in the header', async () => {
  let seen;
  const text = await call(async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ choices: [{ message: { content: ' hello ' } }] }) }; });
  assert.equal(text, 'hello');
  assert.equal(seen.url, 'https://ica.example/v1/chat-models/chat/completions');
  assert.equal(seen.init.headers.authorization, 'Bearer sk-secret');
  assert.equal(seen.init.redirect, 'error');
  const body = JSON.parse(seen.init.body);
  assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
  assert.equal(body.max_tokens, 10);
  assert.doesNotMatch(seen.init.body, /sk-secret/);
});

test('reply: content given as an array of parts is joined; empty or malformed replies are errors', async () => {
  const reply = (b) => async () => ({ ok: true, json: async () => b });
  assert.equal(await call(reply({ choices: [{ message: { content: [{ type: 'text', text: 'a' }, { text: 'b' }] } }] })), 'ab');
  for (const b of [{}, { choices: [] }, { choices: [{ message: { content: '  ' } }] }, { choices: [{ message: {} }] }]) {
    await assert.rejects(() => call(reply(b)), { name: 'UpstreamError' });
  }
});

test('errors carry the status but never the response body', async () => {
  const f = async () => ({ ok: false, status: 401, text: async () => 'echo: sk-secret and the prompt', json: async () => ({ error: 'echo sk-secret' }) });
  await assert.rejects(() => call(f), (e) => e.name === 'UpstreamError' && e.status === 401 && !/sk-secret|echo/.test(e.message));
});
