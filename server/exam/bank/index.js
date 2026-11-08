// The authored question bank. Loading it validates every question (structure + answer-shape neutrality) and throws
// with the full list of problems, so a bad question can never ship. Add a new bank file to FILES below.
//
// Each question file has a matching reasons-*.js file holding the explanation for every RIGHT choice and every ordering step
// (a wrong choice carries its own `why` in the question file). mergeReasons() joins them by question id and refuses a
// reason that names nothing, a right choice with no reason, or a reason that is too short to teach anything.
import { validateQuestion, bankBiasProblems } from '../validate.js';
import manage1 from './manage1.js';
import manage2 from './manage2.js';
import respond1 from './respond1.js';
import respond2 from './respond2.js';
import hunt1 from './hunt1.js';
import rManage1 from './reasons-manage1.js';
import rManage2 from './reasons-manage2.js';
import rRespond1 from './reasons-respond1.js';
import rRespond2 from './reasons-respond2.js';
import rHunt1 from './reasons-hunt1.js';

const FILES = { manage1, manage2, respond1, respond2, hunt1 };
const REASONS = { ...rManage1, ...rManage2, ...rRespond1, ...rRespond2, ...rHunt1 };

const MIN_WHY = 15;

/**
 * Returns copies of `questions` with the reasons filled in, plus a list of problems.
 * A question that already carries its own `why` text (a Claude-written one) is left as it is.
 */
export function mergeReasons(questions, reasons = REASONS) {
  const problems = [];
  const used = new Set();
  const withWhy = (target, why, where) => {
    if (typeof why !== 'string' || why.trim().length < MIN_WHY) problems.push(`${where}: the reason is missing or shorter than ${MIN_WHY} characters`);
    return { ...target, why };
  };
  const merged = questions.map((q) => {
    const r = reasons[q.id];
    if (!r) return q;
    used.add(q.id);
    const out = { ...q };
    if (q.type === 'single' || q.type === 'multi') {
      const known = new Set(q.options.filter((o) => o.correct).map((o) => o.text));
      for (const t of Object.keys(r.right ?? {})) if (!known.has(t)) problems.push(`${q.id}: reason given for "${t}", which is not a right option of this question`);
      out.options = q.options.map((o) => (o.correct && !o.why ? withWhy(o, r.right?.[o.text], `${q.id} right option "${o.text.slice(0, 40)}"`) : o));
    } else if (q.type === 'order') {
      if (!Array.isArray(r.steps) || r.steps.length !== q.steps.length) problems.push(`${q.id}: needs ${q.steps.length} step reasons, has ${r.steps?.length ?? 0}`);
      out.steps = q.steps.map((s, i) => withWhy(s, r.steps?.[i], `${q.id} step ${i + 1}`));
    } else if (q.type === 'dropdown') {
      const ids = new Set(q.blanks.map((b) => b.id));
      for (const k of Object.keys(r.blanks ?? {})) if (!ids.has(k)) problems.push(`${q.id}: reason given for blank "${k}", which does not exist`);
      out.blanks = q.blanks.map((b) => ({ ...b, options: b.options.map((o) => (o.correct && !o.why ? withWhy(o, r.blanks?.[b.id], `${q.id} blank ${b.id}`) : o)) }));
    }
    return out;
  });
  return { questions: merged, problems, used };
}

export function loadBank(files = FILES, reasons) {
  const problems = [];
  const ids = new Set();
  const bank = [];
  const matched = new Set();
  for (const [file, list] of Object.entries(files)) {
    const merged = reasons ? mergeReasons(list, reasons) : { questions: list, problems: [], used: new Set() };
    problems.push(...merged.problems.map((p) => `${file}/${p}`));
    for (const id of merged.used) matched.add(id);
    for (const q of merged.questions) {
      const errs = validateQuestion(q);
      if (ids.has(q.id)) errs.push('duplicate id');
      ids.add(q.id);
      if (errs.length) problems.push(`${file}/${q.id}: ${errs.join('; ')}`);
      else bank.push(q);
    }
  }
  // A reason that names no question is a typo in an id, and the question it was meant for would be missing its explanation.
  if (reasons) for (const id of Object.keys(reasons)) if (!matched.has(id)) problems.push(`${id}: reasons exist for a question that is not in the bank`);
  if (problems.length) throw new Error(`Practice-exam bank has ${problems.length} invalid question(s):\n${problems.join('\n')}`);
  // A bank where the right answer is usually the longest (or usually the shortest) is a guessable bank.
  const skew = bankBiasProblems(bank);
  if (skew.length) throw new Error(`Practice-exam bank leaks answers through option length:\n${skew.join('\n')}`);
  return Object.freeze(bank);
}

export const BANK = loadBank(FILES, REASONS);
