import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/http/app.js';
import { BANK, loadBank } from '../server/exam/bank/index.js';
import { OBJECTIVES, BULLET_DOMAIN, DOMAINS } from '../server/exam/objectives.js';
import { checkStructure } from '../server/exam/schema.js';
import { validateQuestion, checkSet, rankHistogram, bankBiasProblems } from '../server/exam/validate.js';
import { apportion, domainQuota, buildExam, TYPE_MIX } from '../server/exam/build.js';
import { makeItem, publicView, grade, ExamInputError } from '../server/exam/item.js';
import { ExamSession } from '../server/exam/session.js';
import { ExamAgent } from '../server/agents/exam-agent.js';
import { getLab } from '../server/labs/index.js';

const ok = (text) => ({ text, correct: true, why: 'This is right for a reason that is spelled out.' });
const no = (text, why = 'This is wrong for a reason that is spelled out.') => ({ text, why });
const proto = { id: 'x-001', domain: 'manage', objective: 'Specify Microsoft Sentinel roles', source: 'bank', explanation: 'A sufficiently long explanation of why the right answer is right and the others are not.' };
const single = (options, extra = {}) => ({ ...proto, type: 'single', stem: 'Which option should you choose for this requirement?', options, ...extra });
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---- the bank itself ----------------------------------------------------------------------------
test('every bank question is valid, ids are unique, and the bank is large enough to vary', () => {
  assert.ok(BANK.length >= 90, `bank has ${BANK.length}`);
  assert.equal(new Set(BANK.map((q) => q.id)).size, BANK.length);
  for (const q of BANK) assert.deepEqual(validateQuestion(q), [], q.id);
});

test('the bank covers all four question types and both scenario and non-scenario items', () => {
  for (const t of Object.keys(TYPE_MIX)) assert.ok(BANK.filter((q) => q.type === t).length >= 5, t);
  const scenario = BANK.filter((q) => q.scenario).length / BANK.length;
  assert.ok(scenario > 0.4 && scenario < 0.95, `scenario share ${scenario}`);
});

test('every domain has enough questions for several distinct exams', () => {
  const by = (d) => BANK.filter((q) => q.domain === d).length;
  assert.ok(by('manage') >= 21 && by('respond') >= 19 && by('hunt') >= 10);
});

test('every objective names a real skills-measured bullet, and the domain matches', () => {
  for (const q of BANK) assert.equal(BULLET_DOMAIN.get(q.objective), q.domain, q.id);
});

test('every objective group has at least one question', () => {
  const missing = OBJECTIVES.filter((g) => !BANK.some((q) => g.bullets.includes(q.objective))).map((g) => g.group);
  assert.deepEqual(missing, []);
});

test('labId and source references point at things that exist', () => {
  for (const q of BANK) {
    if (q.labId) assert.ok(getLab(q.labId), `${q.id} -> ${q.labId}`);
    assert.match(q.source, /^(bank|set[1-5]:Q\d{1,2})$/, q.id);
  }
});

test('the bank does not leak the answer through option length: every length rank is close to 25%', () => {
  assert.deepEqual(bankBiasProblems(BANK), []);
  const { n, share } = rankHistogram(BANK);
  assert.ok(n >= 40, `${n} four-option sets`);
  for (const s of share) assert.ok(Math.abs(s - 0.25) <= 0.09, share.join(','));
});

test('"always pick the longest option" does no better than chance on the bank', () => {
  let right = 0;
  let sets = 0;
  for (const q of BANK.filter((x) => x.type === 'single')) {
    const lens = q.options.map((o) => o.text.length);
    const top = Math.max(...lens);
    const tied = q.options.filter((o) => o.text.length === top);
    if (tied.some((o) => o.correct)) right += 1 / tied.length;
    sets++;
  }
  const chance = BANK.filter((x) => x.type === 'single').reduce((s, q) => s + 1 / q.options.length, 0) / sets;
  assert.ok(Math.abs(right / sets - chance) < 0.1, `longest-wins rate ${(right / sets).toFixed(2)} vs chance ${chance.toFixed(2)}`);
});

test('a shuffled exam puts the correct answer in every position about equally often', () => {
  const rand = seeded(7);
  const pos = [0, 0, 0, 0];
  let n = 0;
  for (let i = 0; i < 200; i++) {
    for (const q of BANK.filter((x) => x.type === 'single' && x.options.length === 4)) {
      const item = makeItem(q, rand);
      pos[item.options.findIndex((o) => o.correct)]++;
      n++;
    }
  }
  for (const p of pos) assert.ok(Math.abs(p / n - 0.25) < 0.04, pos.join(','));
});

// ---- schema and validator reject bad questions --------------------------------------------------
test('structure check rejects the common authoring mistakes', () => {
  const good = single([ok('One option that is right'), no('Another option that is wrong'), no('A third option that is wrong'), no('A fourth option that is wrong')]);
  assert.deepEqual(checkStructure(good), []);
  assert.match(checkStructure({ ...good, objective: 'Make up a skill' }).join(), /objective/);
  assert.match(checkStructure({ ...good, domain: 'hunt' }).join(), /belongs to domain/);
  assert.match(checkStructure({ ...good, options: good.options.slice(0, 3) }).join(), /4-5 options/);
  assert.match(checkStructure(single([ok('A'), ok('B right too'), no('C is wrong'), no('D is wrong')])).join(), /needs 1 correct option\(s\), has 2/);
  assert.match(checkStructure(single([ok('Right one here'), { text: 'Wrong with no reason' }, no('C is wrong'), no('D is wrong')])).join(), /why/);
  assert.match(checkStructure({ ...good, learn: 'https://learn.microsoft.com/x' }).join(), /learn/);
  assert.match(checkStructure({ ...good, source: 'wiki' }).join(), /source/);
  assert.match(checkStructure({ ...proto, type: 'multi', stem: 'Which options are right for this?', select: 2, options: [ok('A one'), ok('B two'), no('C three'), no('D four'), no('E five')] }).join(), /two|three/);
  assert.match(checkStructure({ ...proto, type: 'dropdown', stem: 'Complete the statement now.', template: 'Pick {{a}} and {{z}}', blanks: [{ id: 'a', options: [ok('Yes'), no('No')] }] }).join(), /\{\{z\}\}/);
});

test('shape check rejects a correct answer that is clearly the longest', () => {
  const q = single([ok('Configure the analytics rule with an entity mapping for the account and the host'), no('Disable the rule'), no('Delete the rule'), no('Rename the rule')]);
  assert.match(validateQuestion(q).join(), /longest|lengths range/);
});

test('shape check rejects all/none of the above and both-options', () => {
  for (const bad of ['All of the above', 'None of the above', 'Both A and B']) {
    const q = single([ok('Option one is fine'), no('Option two is fine'), no(bad), no('Option four is fine')]);
    assert.match(validateQuestion(q).join(), /escape-hatch/, bad);
  }
});

test('shape check rejects punctuation or hedging that only the correct (or only the wrong) options have', () => {
  const comma = checkSet({ path: 'o', kind: 'single', options: [ok('Enable A, then B'), no('Enable A then B'), no('Enable A and B'), no('Enable A only')] });
  assert.ok(comma.some((p) => /comma/.test(p)), comma.join());
  const hedge = checkSet({ path: 'o', kind: 'single', options: [ok('Turn on the feature'), no('Always turn on feature'), no('Turn on the other'), no('Turn off the feature')] });
  assert.ok(hedge.some((p) => /absolute/.test(p)), hedge.join());
});

test('shape check allows schedules such as "every hour" next to a correct answer without hedges', () => {
  const p = checkSet({ path: 'o', kind: 'single', options: [ok('Continuous'), no('Every hour'), no('Every 3 hours'), no('Every 24 hours')] });
  assert.equal(p.filter((x) => /absolute/.test(x)).length, 0, p.join());
});

test('shape check flags a correct answer that repeats the stem words the wrong ones do not', () => {
  const q = single([ok('Install the Connected Machine agent on servers'), no('Move the collection rule elsewhere'), no('Configure event forwarding there'), no('Deploy the file sync client')], { stem: 'Install the Connected Machine agent on servers. What should you do first?', scenario: undefined });
  assert.match(validateQuestion(q).join(), /stem words/);
});

test('a skewed bank is refused at load time', () => {
  const skewed = Array.from({ length: 30 }, (_, i) => single([ok('The longest option is correct here'), no('Short one'), no('Short two'), no('Short thr')], { id: `s-${i}` }));
  assert.throws(() => loadBank({ skewed }), /invalid question|leaks answers/);
  // Same options, correct answer made the shortest in every question: also refused.
  const inverse = Array.from({ length: 30 }, (_, i) => single([ok('Same size A'), no('Same size B plus a bit more'), no('Same size C plus a bit more'), no('Same size D plus a bit more')], { id: `i-${i}` }));
  assert.throws(() => loadBank({ inverse }), /leaks answers|invalid question/);
  assert.ok(bankBiasProblems(inverse).length > 0);
});

// ---- builder ------------------------------------------------------------------------------------
test('apportion splits a total exactly and the 50-question default is 21/19/10', () => {
  assert.deepEqual(domainQuota(50), { manage: 21, respond: 19, hunt: 10 });
  for (let n = 10; n <= 50; n++) {
    const q = domainQuota(n);
    assert.equal(q.manage + q.respond + q.hunt, n);
    for (const [d, c] of Object.entries(q)) {
      const share = c / n;
      assert.ok(share >= DOMAINS[d].min / 100 - 0.06 && share <= DOMAINS[d].max / 100 + 0.06, `${n}: ${d} ${share}`);
    }
  }
  assert.deepEqual(apportion(10, { a: 1, b: 1 }), { a: 5, b: 5 });
});

test('a 50-question exam matches the domain weights and has a mixed set of types', () => {
  const { questions, shortfall } = buildExam({ bank: BANK, count: 50, rand: seeded(3) });
  assert.equal(questions.length, 50);
  assert.equal(shortfall, 0);
  const by = (k, v) => questions.filter((q) => q[k] === v).length;
  assert.equal(by('domain', 'manage'), 21);
  assert.equal(by('domain', 'respond'), 19);
  assert.equal(by('domain', 'hunt'), 10);
  assert.equal(new Set(questions.map((q) => q.id)).size, 50, 'no repeats in one exam');
  for (const t of Object.keys(TYPE_MIX)) assert.ok(by('type', t) >= 3, t);
});

test('the next exam prefers questions that have not been used yet in this session', () => {
  const first = buildExam({ bank: BANK, count: 30, rand: seeded(5) }).questions;
  const seen = new Set(first.map((q) => q.id));
  const second = buildExam({ bank: BANK, count: 30, seen, rand: seeded(6) }).questions;
  const repeats = second.filter((q) => seen.has(q.id)).length;
  assert.ok(repeats <= 30 - Math.min(30, BANK.length - seen.size) + 6, `repeats ${repeats}`);
});

test('a small bank reports a shortfall instead of failing', () => {
  const { questions, shortfall } = buildExam({ bank: BANK.slice(0, 12), count: 50, rand: seeded(2) });
  assert.ok(questions.length < 50);
  assert.equal(questions.length + shortfall, 50);
});

// ---- items: public view, grading ----------------------------------------------------------------
const byType = (t) => BANK.find((q) => q.type === t);

test('the public view never carries the answer key, explanations or why-text', () => {
  for (const t of Object.keys(TYPE_MIX)) {
    const item = makeItem(byType(t), seeded(9));
    const json = JSON.stringify(publicView(item, 1, 50));
    assert.doesNotMatch(json, /"correct"|"why"|explanation|"learn"|labId|"source"/, t);
  }
});

test('single: right and wrong answers are graded and every option is explained', () => {
  const q = byType('single');
  const item = makeItem(q, seeded(1));
  const right = item.options.find((o) => o.correct).id;
  const wrong = item.options.find((o) => !o.correct).id;
  const rg = grade(item, { choice: right });
  assert.equal(rg.correct, true);
  assert.equal(rg.options.length, q.options.length);
  assert.equal(grade(item, { choice: wrong }).correct, false);
  assert.ok(grade(item, { choice: wrong }).options.every((o) => o.correct || o.why));
  assert.throws(() => grade(item, { choice: 'zz' }), ExamInputError);
  assert.throws(() => grade(item, {}), ExamInputError);
});

test('multi: needs exactly `select` picks, and only the exact set is correct', () => {
  const q = byType('multi');
  const item = makeItem(q, seeded(1));
  const rights = item.options.filter((o) => o.correct).map((o) => o.id);
  const wrongs = item.options.filter((o) => !o.correct).map((o) => o.id);
  assert.equal(grade(item, { choices: rights }).correct, true);
  const partial = grade(item, { choices: [rights[0], wrongs[0]] });
  assert.equal(partial.correct, false);
  assert.match(partial.detail, /1 of 2/);
  assert.throws(() => grade(item, { choices: [rights[0]] }), ExamInputError);
  assert.throws(() => grade(item, { choices: [...rights, wrongs[0]] }), ExamInputError);
  assert.throws(() => grade(item, { choices: [rights[0], rights[0]] }), ExamInputError, 'duplicates do not count twice');
});

test('order: the shown order is never already the answer, and only the exact order is correct', () => {
  for (const q of BANK.filter((x) => x.type === 'order')) {
    for (let s = 1; s <= 25; s++) {
      const item = makeItem(q, seeded(s));
      assert.notDeepEqual(item.shown.map((x) => x.id), item.steps.map((x) => x.id), q.id);
    }
    const item = makeItem(q, seeded(4));
    const answer = item.steps.map((x) => x.id);
    assert.equal(grade(item, { order: answer }).correct, true);
    const swapped = [...answer];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const res = grade(item, { order: swapped });
    assert.equal(res.correct, false);
    assert.match(res.detail, /of \d steps/);
    assert.throws(() => grade(item, { order: answer.slice(1) }), ExamInputError);
    assert.throws(() => grade(item, { order: [answer[0], answer[0], ...answer.slice(2)] }), ExamInputError);
  }
});

test('dropdown: every blank must be answered, and one wrong blank makes the question wrong', () => {
  const q = byType('dropdown');
  const item = makeItem(q, seeded(1));
  const rightPicks = Object.fromEntries(item.blanks.map((b) => [b.id, b.options.find((o) => o.correct).id]));
  assert.equal(grade(item, { picks: rightPicks }).correct, true);
  const b0 = item.blanks[0];
  const bad = { ...rightPicks, [b0.id]: b0.options.find((o) => !o.correct).id };
  const res = grade(item, { picks: bad });
  assert.equal(res.correct, false);
  assert.match(res.detail, new RegExp(`${item.blanks.length - 1} of ${item.blanks.length}`));
  assert.throws(() => grade(item, { picks: { [b0.id]: rightPicks[b0.id] } }), ExamInputError);
  assert.throws(() => grade(item, {}), ExamInputError);
});

// ---- session and HTTP ---------------------------------------------------------------------------
test('ExamSession: start, question, answer once, summary by domain', async () => {
  const s = new ExamSession({ env: {}, rand: seeded(11) });
  assert.equal(s.summary(), null);
  assert.throws(() => s.question(1), ExamInputError);
  const out = await s.start({ count: 10 });
  assert.equal(out.total, 10);
  assert.equal(out.question.n, 1);
  const q1 = s.question(1);
  assert.equal(q1.result, undefined);
  const item = s.exam.items[0];
  const correctAnswer = (it) => {
    if (it.q.type === 'single') return { choice: it.options.find((o) => o.correct).id };
    if (it.q.type === 'multi') return { choices: it.options.filter((o) => o.correct).map((o) => o.id) };
    if (it.q.type === 'order') return { order: it.steps.map((x) => x.id) };
    return { picks: Object.fromEntries(it.blanks.map((b) => [b.id, b.options.find((o) => o.correct).id])) };
  };
  const res = s.answer(1, correctAnswer(item));
  assert.equal(res.correct, true);
  assert.equal(res.summary.correct, 1);
  assert.throws(() => s.answer(1, correctAnswer(item)), /already been answered/);
  assert.ok(s.question(1).result, 'a reloaded answered question shows its feedback');
  assert.throws(() => s.answer(99, {}), ExamInputError);
  for (let n = 2; n <= 10; n++) s.answer(n, correctAnswer(s.exam.items[n - 1]));
  const sum = s.summary();
  assert.equal(sum.done, true);
  assert.equal(sum.correct, 10);
  assert.equal(Object.values(sum.domains).reduce((a, d) => a + d.total, 0), 10);
  await assert.rejects(() => s.start({ count: 5 }), ExamInputError);
  await assert.rejects(() => s.start({ count: 51 }), ExamInputError);
  await assert.rejects(() => s.start({ count: 'many' }), ExamInputError);
});

let server, base, port;
before(async () => {
  server = http.createServer(createApp({ env: {} }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});
after(() => server.close());

function raw(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { Host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}
async function session() {
  const r = await raw('POST', '/api/session', { headers: { 'Content-Type': 'application/json' }, body: {} });
  return { cookie: r.headers['set-cookie'][0].split(';')[0], csrf: r.json.data.csrf, info: r.json.data.exam };
}
const authed = (s, extra = {}) => ({ Cookie: s.cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrf, Origin: base, ...extra });

test('the session bootstrap reports the exam bank and that live questions are off without a key', async () => {
  const s = await session();
  assert.equal(s.info.live, false);
  assert.equal(s.info.bank, BANK.length);
});

test('exam routes need a session; writes need the CSRF token', async () => {
  let r = await raw('GET', '/api/exam/summary');
  assert.equal(r.status, 401);
  r = await raw('POST', '/api/exam/start', { headers: { 'Content-Type': 'application/json' }, body: {} });
  assert.equal(r.status, 401);
  const s = await session();
  r = await raw('POST', '/api/exam/start', { headers: { Cookie: s.cookie, 'Content-Type': 'application/json', Origin: base }, body: { count: 10 } });
  assert.equal(r.status, 403);
  r = await raw('POST', '/api/exam/start', { headers: authed(s, { Origin: 'http://evil.example' }), body: { count: 10 } });
  assert.equal(r.status, 403);
});

test('start -> question -> answer over HTTP: no key before submitting, full feedback after, once only', async () => {
  const s = await session();
  let r = await raw('GET', '/api/exam/summary', { headers: authed(s) });
  assert.equal(r.json.data.summary, null);
  r = await raw('GET', '/api/exam/question/1', { headers: authed(s) });
  assert.equal(r.status, 422);

  r = await raw('POST', '/api/exam/start', { headers: authed(s), body: { count: 10 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.total, 10);
  assert.doesNotMatch(r.text, /"correct"|"why"|explanation/);

  r = await raw('GET', '/api/exam/question/3', { headers: authed(s) });
  assert.equal(r.json.data.question.n, 3);
  assert.doesNotMatch(r.text, /"correct"|"why"|explanation/);

  r = await raw('POST', '/api/exam/answer', { headers: authed(s), body: { n: 3, answer: {} } });
  assert.equal(r.status, 422, 'a malformed answer is refused and does not use up the question');
  const q = (await raw('GET', '/api/exam/question/3', { headers: authed(s) })).json.data.question;
  const answer = q.type === 'single' ? { choice: q.options[0].id }
    : q.type === 'multi' ? { choices: q.options.slice(0, q.select).map((o) => o.id) }
      : q.type === 'order' ? { order: q.steps.map((x) => x.id) }
        : { picks: Object.fromEntries(q.blanks.map((b) => [b.id, b.options[0].id])) };
  r = await raw('POST', '/api/exam/answer', { headers: authed(s), body: { n: 3, answer } });
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.data.correct, 'boolean');
  assert.ok(r.json.data.explanation.length > 20);
  assert.equal(r.json.data.summary.answered, 1);
  r = await raw('POST', '/api/exam/answer', { headers: authed(s), body: { n: 3, answer } });
  assert.equal(r.status, 422);
  assert.match(r.json.error.message, /already been answered/);
});

test('exam routes validate their input', async () => {
  const s = await session();
  for (const body of [{ count: '10' }, { count: 5 }, { count: 500 }, { count: 10, includeLive: 'yes' }]) {
    const r = await raw('POST', '/api/exam/start', { headers: authed(s), body });
    assert.ok(r.status === 400 || r.status === 422, JSON.stringify(body));
  }
  let r = await raw('POST', '/api/exam/answer', { headers: authed(s), body: { n: '1', answer: {} } });
  assert.equal(r.status, 400);
  r = await raw('GET', '/api/exam/question/abc', { headers: authed(s) });
  assert.equal(r.status, 404);
  r = await raw('GET', '/api/exam/nothing', { headers: authed(s) });
  assert.equal(r.status, 404);
});

test('starting exams is rate limited', async () => {
  const s = await session();
  let last;
  for (let i = 0; i < 8; i++) last = await raw('POST', '/api/exam/start', { headers: authed(s), body: { count: 10 } });
  assert.equal(last.status, 429);
});

test('includeLive without an API key falls back to the bank and says so', async () => {
  const s = await session();
  const r = await raw('POST', '/api/exam/start', { headers: authed(s), body: { count: 10, includeLive: true } });
  assert.equal(r.status, 200);
  assert.match(r.json.data.notes.join(' '), /not configured/);
  assert.equal(r.json.data.live, 0);
});

// ---- live generation agent ----------------------------------------------------------------------
const liveQuestion = (extra = {}) => ({
  objective: 'Investigate device timelines', type: 'single', scenario: 'A laptop shows a burst of process creation events at 02:00 and the user was offline at that time.',
  stem: 'Which view helps you see the order of events on this device?',
  options: [{ text: 'The device timeline', correct: true, why: 'It lists the events on a device in time order, which is what the question asks for.' }, { text: 'The software inventory', why: 'Inventory lists installed software and not event order.' }, { text: 'The exposure score card', why: 'The score summarises risk and not event order.' }, { text: 'The device group list', why: 'Groups define scope and do not show events.' }],
  explanation: 'The device timeline lists the events on a device in time order so you can follow what happened.', ...extra,
});
const fakeFetch = (reply, seen = []) => async (url, init) => {
  seen.push({ url, init });
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: typeof reply === 'string' ? reply : JSON.stringify(reply) } }] }) };
};

test('ExamAgent is unavailable without a key and never calls the network', async () => {
  let called = false;
  const a = new ExamAgent({ env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(a.available, false);
  const r = await a.generate('respond', ['single']);
  assert.deepEqual(r.questions, []);
  assert.equal(called, false);
  assert.equal(new ExamAgent({ env: { ICA_API_KEY: 'k', ICA_MODEL: 'm', EXAM_PROVIDER: 'local' } }).available, false);
  assert.equal(new ExamAgent({ env: { ICA_API_KEY: 'k' } }).available, false, 'a key without a model id is not enough');
  assert.equal(new ExamAgent({ env: { ANTHROPIC_API_KEY: 'k', ICA_MODEL: 'm' } }).available, false, 'the old Anthropic key is no longer used');
});

test('ExamAgent: keeps valid questions, drops invalid ones, forces domain/source/id, and keeps the key in the header only', async () => {
  const seen = [];
  const bad = liveQuestion({ options: [{ text: 'The device timeline view that shows every event on the device in order', correct: true, why: 'It lists the events on a device in time order, which is what the question asks for.' }, { text: 'Inventory', why: 'Inventory lists installed software.' }, { text: 'Score', why: 'The score summarises risk and nothing else.' }, { text: 'Groups', why: 'Groups define scope and show no events.' }] });
  const a = new ExamAgent({ env: { ICA_API_KEY: 'sk-secret', EXAM_MODEL: 'exam-model' }, fetchImpl: fakeFetch(`Here you go:\n${JSON.stringify([liveQuestion(), bad, { nonsense: true }, liveQuestion({ domain: 'manage', source: 'bank', id: 'm001' })])}`, seen) });
  const r = await a.generate('respond', ['single', 'single']);
  assert.ok(r.error === null);
  assert.equal(r.questions.length, 2);
  assert.equal(r.rejected, 2);
  for (const q of r.questions) {
    assert.equal(q.source, 'live');
    assert.equal(q.domain, 'respond', 'the model cannot choose the domain');
    assert.match(q.id, /^live-/, 'the model cannot choose the id');
  }
  assert.equal(seen[0].url, 'https://api.servicesessentials.ibm.com/v1/chat-models/chat/completions');
  assert.equal(seen[0].init.headers.authorization, 'Bearer sk-secret');
  assert.doesNotMatch(seen[0].init.body, /sk-secret/);
  assert.equal(seen[0].init.redirect, 'error');
  assert.equal(JSON.parse(seen[0].init.body).model, 'exam-model');
});

test('ExamAgent: bad JSON, HTTP errors and timeouts return no questions instead of throwing', async () => {
  const mk = (f) => new ExamAgent({ env: { ICA_API_KEY: 'k', ICA_MODEL: 'm' }, fetchImpl: f });
  assert.equal((await mk(fakeFetch('sorry, no json')).generate('hunt', ['single'])).error, 'BadReply');
  assert.equal((await mk(async () => ({ ok: false, status: 500 })).generate('hunt', ['single'])).error, 'UpstreamError');
  assert.equal((await mk(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }).generate('hunt', ['single'])).error, 'TimeoutError');
  assert.deepEqual((await mk(fakeFetch([])).generate('hunt', ['single'])).questions, []);
});

test('ExamAgent: only server-chosen enums reach the prompt', async () => {
  const seen = [];
  const a = new ExamAgent({ env: { ICA_API_KEY: 'k', ICA_MODEL: 'm' }, fetchImpl: fakeFetch([], seen) });
  assert.equal((await a.generate('not-a-domain', ['single'])).error, 'unavailable');
  await a.generate('hunt', ['single', 'order']);
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /ANSWER-SHAPE RULES/);
  assert.match(body.messages[1].content, /single, order/);
});

test('ExamSession with live questions: mixes them in, labels them, and reports discards', async () => {
  const good = (i) => liveQuestion({ stem: `Which view helps you see the order of events on device number ${i}?` });
  const agent = new ExamAgent({ env: { ICA_API_KEY: 'k', ICA_MODEL: 'm' }, fetchImpl: fakeFetch([good(1), good(2), { nonsense: 1 }]) });
  const s = new ExamSession({ env: { ICA_API_KEY: 'k', ICA_MODEL: 'm' }, agent, rand: seeded(21) });
  assert.equal(s.info().live, true);
  const out = await s.start({ count: 20, includeLive: true });
  assert.ok(out.live >= 1);
  assert.ok(s.exam.items.some((i) => i.live));
  assert.ok(s.exam.items.filter((i) => !i.live).length >= 10, 'the rest comes from the bank');
  assert.match(out.notes.join(' '), /discarded/);
  assert.equal(out.total, 20);
  const liveN = s.exam.items.findIndex((i) => i.live) + 1;
  assert.equal(s.question(liveN).live, true);
});

test('ExamSession: when Claude fails the exam still starts from the bank', async () => {
  const agent = new ExamAgent({ env: { ICA_API_KEY: 'k', ICA_MODEL: 'm' }, fetchImpl: async () => { throw new Error('down'); } });
  const s = new ExamSession({ env: {}, agent, rand: seeded(8) });
  const out = await s.start({ count: 10, includeLive: true });
  assert.equal(out.total, 10);
  assert.equal(out.live, 0);
  assert.match(out.notes.join(' '), /built-in bank/);
});

test('ExamSession live: asks for small batches in parallel, and reports what Claude did not deliver', async () => {
  const calls = [];
  let n = 0;
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.messages[1].content.match(/Write (\d+) questions for the domain "([^"]+)"/).slice(1));
    // Every third request fails; the others return one valid question each.
    if (++n % 3 === 0) return { ok: false, status: 500 };
    const q = liveQuestion({ stem: `Which view shows the order of events on device number ${n}?` });
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify([q]) } }] }) };
  };
  const agent = new ExamAgent({ env: { ICA_API_KEY: 'k', ICA_MODEL: 'm' }, fetchImpl: f });
  const s = new ExamSession({ env: {}, agent, rand: seeded(31) });
  const out = await s.start({ count: 50, includeLive: true });
  assert.ok(calls.length >= 5, `${calls.length} requests`);
  assert.ok(calls.every(([k]) => Number(k) <= 4), `no request asks for more than 4: ${calls.map((c) => c[0])}`);
  assert.equal(calls.reduce((a, [k]) => a + Number(k), 0), 20, 'the batches add up to the 40% share of 50');
  assert.equal(out.total, 50, 'the bank fills any gap');
  assert.ok(out.live >= 1 && out.live < 20);
  assert.match(out.notes.join(' '), /wrote \d+ of the 20 questions asked for/);
  assert.match(out.notes.join(' '), /\d+ of \d+ requests failed/);
});

test('ExamSession live: when every request fails the note names the failure and the exam still starts', async () => {
  const agent = new ExamAgent({ env: { ICA_API_KEY: 'k', ICA_MODEL: 'm' }, fetchImpl: async () => ({ ok: false, status: 503 }) });
  const out = await new ExamSession({ env: {}, agent, rand: seeded(32) }).start({ count: 10, includeLive: true });
  assert.equal(out.total, 10);
  assert.equal(out.live, 0);
  assert.match(out.notes.join(' '), /did not return usable questions \(\d+ of \d+ requests failed: UpstreamError\)/);
});
