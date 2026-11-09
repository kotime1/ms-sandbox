// The log of AI-written exam questions: one fresh file per server run, gitignored, never holds the key, never breaks an exam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AiLog, aiLog, DEFAULT_LOG_PATH } from '../server/exam/ai-log.js';
import { ExamAgent } from '../server/agents/exam-agent.js';
import { ExamSession } from '../server/exam/session.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ailog-'));
const goodQuestion = (extra = {}) => ({
  objective: 'Investigate device timelines', type: 'single', scenario: 'A laptop shows a burst of process creation events at 02:00 and the user was offline at that time.',
  stem: 'Which view helps you see the order of events on this device?',
  options: [{ text: 'The device timeline', correct: true, why: 'It lists the events on a device in time order, which is what the question asks for.' }, { text: 'The software inventory', why: 'Inventory lists installed software and not event order.' }, { text: 'The exposure score card', why: 'The score summarises risk and not event order.' }, { text: 'The device group list', why: 'Groups define scope and do not show events.' }],
  explanation: 'The device timeline lists the events on a device in time order so you can follow what happened.', ...extra,
});
const reply = (content, extra = {}) => async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { completion_tokens: 321 }, ...extra }) });
const env = { ICA_API_KEY: 'sk-very-secret-key', ICA_MODEL: 'test-model' };

test('the log is off until it is opened: a fresh log writes nothing and does not throw', () => {
  const log = new AiLog();
  assert.equal(log.enabled, false);
  log.request({ domain: 'respond', asked: [{ type: 'single' }], ms: 5, outcome: {}, verdicts: [] });
  assert.equal(aiLog.enabled, false, 'the shared log is only opened by server/index.js, so tests never write the real file');
});

test('open() creates the folder and EMPTIES an existing file, so the log holds one server run', () => {
  const dir = tmp();
  const file = path.join(dir, 'deep', 'ai.log');
  const log = new AiLog();
  assert.equal(log.open(file), path.resolve(file));
  log.request({ domain: 'hunt', asked: [{ type: 'single', scenario: true, objective: 'o' }], ms: 1200, model: 'm', outcome: {}, verdicts: [] });
  assert.match(fs.readFileSync(file, 'utf8'), /=== Request 1/);
  const again = new AiLog();
  again.open(file);
  const text = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /Request 1/, 'the earlier run is gone');
  assert.match(text, /^AI question log\. Started /);
});

test('open() on a path that cannot be written returns null and leaves logging off', () => {
  const dir = tmp();
  const blocker = path.join(dir, 'file');
  fs.writeFileSync(blocker, 'x');
  const log = new AiLog();
  assert.equal(log.open(path.join(blocker, 'inside', 'ai.log')), null);
  assert.equal(log.enabled, false);
});

test('a generated request is logged with what was asked, the outcome, and each question with its verdict and reasons', async () => {
  const file = path.join(tmp(), 'ai.log');
  const log = new AiLog();
  log.open(file);
  const bad = goodQuestion({ stem: 'Which one is it?', options: [{ text: 'The device timeline view that shows every event on the device in order', correct: true, why: 'It lists the events on a device in time order, which is what the question asks for.' }, { text: 'Inventory', why: 'Inventory lists installed software.' }, { text: 'Score', why: 'The score summarises risk and nothing else.' }, { text: 'Groups', why: 'Groups define scope and show no events.' }] });
  const agent = new ExamAgent({ env, fetchImpl: reply(JSON.stringify([goodQuestion(), bad])), log });
  const r = await agent.generate('respond', [{ type: 'single', objective: 'Investigate device timelines', scenario: true }, { type: 'single', objective: 'Another objective', scenario: false }]);
  assert.equal(r.questions.length, 1);
  assert.equal(r.rejected, 1);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /=== Request 1 .* respond · test-model/);
  assert.match(text, /Asked for 2:/);
  assert.match(text, /1\. single, with a scenario · Investigate device timelines/);
  assert.match(text, /2\. single, no scenario · Another objective/);
  assert.match(text, /Returned 2, accepted 1, rejected 1 · finish=stop tokens=321/);
  assert.match(text, /--- Question 1: accepted/);
  assert.match(text, /--- Question 2: REJECTED/);
  assert.match(text, /problem: /, 'the quality rule that rejected it is written down');
  assert.match(text, /"stem": "Which view helps you see the order of events on this device\?"/, 'the question itself is in the log');
});

test('a failed request is logged with its cause, HTTP status and the start of the reply', async () => {
  const file = path.join(tmp(), 'ai.log');
  const log = new AiLog();
  log.open(file);
  const http503 = new ExamAgent({ env, fetchImpl: async () => ({ ok: false, status: 503 }), log });
  assert.equal((await http503.generate('manage', [{ type: 'single', objective: 'o', scenario: true }])).error, 'UpstreamError');
  const garbled = new ExamAgent({ env, fetchImpl: reply('[ {"stem": oops ]'), log });
  assert.equal((await garbled.generate('hunt', ['single'])).error, 'MalformedJson');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /FAILED: UpstreamError · HTTP 503/);
  assert.match(text, /FAILED: MalformedJson · finish=stop tokens=321/);
  assert.match(text, /Start of the reply: "\[ \{\\"stem\\": oops \]"/);
});

test('a cut-off reply is logged as cut off, with how many questions were salvaged', async () => {
  const file = path.join(tmp(), 'ai.log');
  const log = new AiLog();
  log.open(file);
  const whole = JSON.stringify(goodQuestion());
  const cut = `[${whole}, {"type": "single", "stem": "half written`;
  const agent = new ExamAgent({ env, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: cut }, finish_reason: 'length' }], usage: { completion_tokens: 16000 } }) }), log });
  const r = await agent.generate('respond', ['single', 'single']);
  assert.equal(r.truncated, true);
  assert.match(fs.readFileSync(file, 'utf8'), /CUT OFF \(salvaged 1\)/);
});

test('the log never contains the API key, the Authorization header or the prompt', async () => {
  const file = path.join(tmp(), 'ai.log');
  const log = new AiLog();
  log.open(file);
  await new ExamAgent({ env, fetchImpl: reply(JSON.stringify([goodQuestion()])), log }).generate('respond', [{ type: 'single', objective: 'o', scenario: true }]);
  await new ExamAgent({ env, fetchImpl: async () => { throw new Error('connection used Bearer sk-very-secret-key'); }, log }).generate('respond', ['single']);
  const text = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /sk-very-secret-key/);
  assert.doesNotMatch(text, /authorization|bearer/i);
  assert.doesNotMatch(text, /You write exam questions|Write exactly/i, 'the prompt is not logged');
});

test('a log that fails to write cannot break generation', async () => {
  const log = { request() { throw new Error('disk full'); } };
  const r = await new ExamAgent({ env, fetchImpl: reply(JSON.stringify([goodQuestion()])), log }).generate('respond', ['single']);
  assert.equal(r.questions.length, 1);
  assert.equal(r.error, null);
});

test('the log stops growing at its size limit instead of filling the disk', () => {
  const file = path.join(tmp(), 'ai.log');
  const log = new AiLog();
  log.open(file);
  const big = { question: { stem: 'x'.repeat(400_000) }, problems: [] };
  for (let i = 0; i < 30; i++) log.request({ domain: 'hunt', asked: [{ type: 'single' }], ms: 1, outcome: {}, verdicts: [big] });
  assert.ok(fs.statSync(file).size <= 5 * 1024 * 1024);
  assert.equal(log.enabled, false);
});

test('a whole live exam writes one entry per request, and the real default path is inside the gitignored logs folder', async () => {
  const file = path.join(tmp(), 'ai.log');
  const log = new AiLog();
  log.open(file);
  const agent = new ExamAgent({ env, fetchImpl: reply(JSON.stringify([goodQuestion()])), log });
  const session = new ExamSession({ env, agent });
  const out = await session.start({ count: 50, includeLive: true });
  assert.ok(out.total > 0);
  const text = fs.readFileSync(file, 'utf8');
  assert.equal((text.match(/=== Request /g) ?? []).length, 10, 'a 50-question exam makes 10 requests');
  assert.equal(DEFAULT_LOG_PATH, 'logs/ai-questions.log');
  assert.match(fs.readFileSync(path.join(import.meta.dirname, '..', '.gitignore'), 'utf8'), /^logs\/$/m);
});
