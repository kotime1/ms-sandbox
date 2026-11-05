// Per-browser-session practice exam. Lives on the session object (in memory, like the lab world), so it is lost on
// server restart or after the idle timeout. Holds the answer key; nothing here is sent to the browser except through
// publicView() and the feedback returned by grade() after a question has been submitted.

import { BANK } from './bank/index.js';
import { DOMAINS, DOMAIN_KEYS } from './objectives.js';
import { buildExam, apportion, TYPE_MIX, MIN_COUNT, MAX_COUNT, DEFAULT_COUNT } from './build.js';
import { makeItem, publicView, grade, ExamInputError } from './item.js';
import { ExamAgent } from '../agents/exam-agent.js';
import { ExamTutor } from '../agents/exam-tutor.js';
import { refsFor } from './references.js';

/** Share of each domain's quota we ask Claude to write when live generation is on. The rest comes from the bank. */
const LIVE_SHARE = 0.4;
/** Questions requested per Claude call. Kept small so a call finishes well inside the timeout. */
const LIVE_BATCH = 4;

export class ExamSession {
  constructor({ env = process.env, bank = BANK, agent, tutor, rand = Math.random } = {}) {
    this.bank = bank;
    this.agent = agent ?? new ExamAgent({ env });
    this.tutor = tutor ?? new ExamTutor({ env });
    this.rand = rand;
    this.seen = new Set(); // bank ids already used in this session, so the next exam prefers new questions
    this.exam = null;
    this.starting = false;
  }

  info() {
    return { live: this.agent.available, tutor: this.tutor.available, bank: this.bank.length, min: MIN_COUNT, max: MAX_COUNT, count: DEFAULT_COUNT };
  }

  async start({ count = DEFAULT_COUNT, includeLive = false } = {}) {
    const n = Math.round(Number(count));
    if (!Number.isFinite(n) || n < MIN_COUNT || n > MAX_COUNT) throw new ExamInputError(`Choose between ${MIN_COUNT} and ${MAX_COUNT} questions.`);
    if (this.starting) throw new ExamInputError('An exam is already being prepared.');
    this.starting = true;
    try {
      const notes = [];
      let extra = [];
      if (includeLive) {
        if (!this.agent.available) notes.push('Live question writing is not configured, so this exam uses the built-in bank.');
        else {
          const quota = apportion(n, Object.fromEntries(DOMAIN_KEYS.map((d) => [d, DOMAINS[d].target])));
          // Many small requests in parallel, not one big one per domain: a model writes ~4 questions in ~45 s, so 8 per
          // domain in one request ran past the timeout. Each batch fails on its own and the bank fills any gap.
          const jobs = DOMAIN_KEYS.flatMap((d) => {
            const want = Math.round(quota[d] * LIVE_SHARE);
            const types = Object.entries(apportion(want, TYPE_MIX)).flatMap(([t, k]) => Array(k).fill(t));
            const batches = [];
            for (let i = 0; i < types.length; i += LIVE_BATCH) batches.push(types.slice(i, i + LIVE_BATCH));
            return batches.map((b) => this.agent.generate(d, b));
          });
          const results = await Promise.all(jobs);
          extra = results.flatMap((r) => r.questions);
          const rejected = results.reduce((s, r) => s + r.rejected, 0);
          const failed = results.filter((r) => r.error).length;
          const wanted = DOMAIN_KEYS.reduce((s, d) => s + Math.round(quota[d] * LIVE_SHARE), 0);
          if (extra.length === 0) notes.push(`Claude did not return usable questions${failed ? ` (${failed} of ${results.length} requests failed${results.find((r) => r.error)?.error ? `: ${results.find((r) => r.error).error}` : ''})` : ''}, so this exam uses the built-in bank.`);
          else {
            if (extra.length < wanted) notes.push(`Claude wrote ${extra.length} of the ${wanted} questions asked for${failed ? ` (${failed} of ${results.length} requests failed)` : ''}; the built-in bank filled the rest.`);
            if (rejected) notes.push(`${rejected} generated question(s) were discarded because they did not pass the quality checks.`);
          }
        }
      }
      const { questions, shortfall } = buildExam({ bank: this.bank, extra, count: n, seen: this.seen, rand: this.rand });
      if (shortfall) notes.push(`The bank only has enough questions for ${questions.length} in this mix.`);
      if (!questions.length) throw new ExamInputError('No questions are available.');
      for (const q of questions) if (q.source !== 'live') this.seen.add(q.id);
      const id = `x${Math.floor(this.rand() * 1e9).toString(36)}`;
      this.tutor.reset();
      this.exam = { id, items: questions.map((q) => makeItem(q, this.rand)), notes, startedAt: Date.now() };
      return { examId: id, total: this.exam.items.length, notes, live: extra.length, question: this.question(1) };
    } finally {
      this.starting = false;
    }
  }

  #item(n) {
    if (!this.exam) throw new ExamInputError('Start an exam first.');
    const i = Number(n);
    if (!Number.isInteger(i) || i < 1 || i > this.exam.items.length) throw new ExamInputError('No such question.');
    return this.exam.items[i - 1];
  }

  question(n) {
    const item = this.#item(n);
    const view = publicView(item, Number(n), this.exam.items.length);
    // A question that was already submitted is shown with its feedback, so a page refresh does not lose it.
    return item.answered ? { ...view, result: item.result } : view;
  }

  answer(n, answer) {
    const item = this.#item(n);
    if (item.answered) throw new ExamInputError('This question has already been answered.');
    const result = { ...grade(item, answer), refs: refsFor(item.q) };
    item.answered = true;
    item.answer = answer;
    item.result = result;
    return { n: Number(n), ...result, summary: this.summary() };
  }

  /** The follow-up chat for an answered question. Refuses before the learner has submitted, so it can never reveal the key early. */
  #answered(n) {
    const item = this.#item(n);
    if (!item.answered) throw new ExamInputError('Submit your answer first, then you can ask about this question.');
    return item;
  }

  chat(n) {
    this.#answered(n);
    return { available: this.tutor.available, history: this.tutor.history(Number(n)) };
  }

  async ask(n, message) {
    const item = this.#answered(n);
    try {
      return await this.tutor.ask(Number(n), { q: item.q, item, result: item.result, refs: item.result.refs }, message);
    } catch (e) {
      if (e.name === 'TutorInput' || e.name === 'TutorUnavailable') throw new ExamInputError(e.message);
      // Upstream trouble (timeout, HTTP error, empty reply): say so plainly, keep the chat usable.
      throw new ExamInputError('The tutor could not answer just now. Try again in a moment, or read the sources below.');
    }
  }

  summary() {
    if (!this.exam) return null;
    const by = Object.fromEntries(DOMAIN_KEYS.map((d) => [d, { label: DOMAINS[d].label, answered: 0, correct: 0, total: 0 }]));
    const missed = [];
    this.exam.items.forEach((item, i) => {
      const row = by[item.q.domain];
      row.total++;
      if (item.answered) {
        row.answered++;
        if (item.result.correct) row.correct++;
        else missed.push({ n: i + 1, objective: item.q.objective, stem: item.q.stem.slice(0, 160) });
      }
    });
    const answered = Object.values(by).reduce((s, r) => s + r.answered, 0);
    const correct = Object.values(by).reduce((s, r) => s + r.correct, 0);
    return { examId: this.exam.id, total: this.exam.items.length, answered, correct, domains: by, missed, notes: this.exam.notes, done: answered === this.exam.items.length };
  }
}

export { ExamInputError };
