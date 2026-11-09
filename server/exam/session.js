// Per-browser-session practice exam. Lives on the session object (in memory, like the lab world), so it is lost on
// server restart or after the idle timeout. Holds the answer key; nothing here is sent to the browser except through
// publicView() and the feedback returned by grade() after a question has been submitted.

import { BANK } from './bank/index.js';
import { DOMAINS, DOMAIN_KEYS } from './objectives.js';
import { buildExam, MIN_COUNT, MAX_COUNT, DEFAULT_COUNT } from './build.js';
import { makeItem, publicView, grade, ExamInputError } from './item.js';
import { ExamAgent } from '../agents/exam-agent.js';
import { ExamTutor } from '../agents/exam-tutor.js';
import { refsFor } from './references.js';
import { planSlots, toRequests } from './slots.js';

/** Share of each domain's quota we ask the model to write when live generation is on. The rest comes from the bank. */
const LIVE_SHARE = 0.4;

/** Plain-English reason for a failed request, from the error name the agent reports. */
const WHY = {
  CutOffBeforeFirstQuestion: 'the reply was cut off at the length limit before the first question was finished',
  MalformedJson: 'the reply was not valid JSON',
  NoJsonArray: 'the reply contained no list of questions',
  UpstreamError: 'the model service returned an error',
  TimeoutError: 'the model took too long to answer',
  AbortError: 'the model took too long to answer',
};
export const whyFailed = (error) => WHY[error] ?? `an unexpected error (${error})`;

/** The notes shown to the learner about what the model did, built from the per-request results. */
export function liveNotes(results, wanted, got) {
  const notes = [];
  const failed = results.filter((r) => r.error);
  const rejected = results.reduce((s, r) => s + r.rejected, 0);
  const salvaged = results.filter((r) => r.truncated && !r.error);
  const reasons = [...new Set(failed.map((r) => whyFailed(r.error)))];
  const failText = failed.length ? ` (${failed.length} of ${results.length} requests failed: ${reasons.join('; ')})` : '';
  if (got === 0) notes.push(`Model did not return usable questions${failText}, so this exam uses the built-in bank.`);
  else {
    if (got < wanted) notes.push(`Model wrote ${got} of the ${wanted} questions asked for${failText}; the built-in bank filled the rest.`);
    if (salvaged.length) notes.push(`${salvaged.length} reply(ies) hit the length limit, so only the questions finished before the cut were kept.`);
    if (rejected) notes.push(`${rejected} generated question(s) were discarded because they did not pass the quality checks.`);
  }
  return notes;
}

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
          // One slot per question to write, each with its own objective, so parallel requests cannot pick the same topic. Two slots per
          // request: measured, those never hit the output limit and the whole exam is faster than with four. A failed request just leaves a
          // gap that the built-in bank fills.
          const slots = planSlots(n, { share: LIVE_SHARE, rand: this.rand });
          const results = await Promise.all(toRequests(slots).map((r) => this.agent.generate(r.domain, r.slots)));
          extra = results.flatMap((r) => r.questions);
          const wanted = slots.length;
          notes.push(...liveNotes(results, wanted, extra.length));
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
