// The authored question bank. Loading it validates every question (structure + answer-shape neutrality) and throws
// with the full list of problems, so a bad question can never ship. Add a new bank file to FILES below.
import { validateQuestion, bankBiasProblems } from '../validate.js';
import manage1 from './manage1.js';
import manage2 from './manage2.js';
import respond1 from './respond1.js';
import respond2 from './respond2.js';
import hunt1 from './hunt1.js';

const FILES = { manage1, manage2, respond1, respond2, hunt1 };

export function loadBank(files = FILES) {
  const problems = [];
  const ids = new Set();
  const bank = [];
  for (const [file, list] of Object.entries(files)) {
    for (const q of list) {
      const errs = validateQuestion(q);
      if (ids.has(q.id)) errs.push('duplicate id');
      ids.add(q.id);
      if (errs.length) problems.push(`${file}/${q.id}: ${errs.join('; ')}`);
      else bank.push(q);
    }
  }
  if (problems.length) throw new Error(`Practice-exam bank has ${problems.length} invalid question(s):\n${problems.join('\n')}`);
  // A bank where the right answer is usually the longest (or usually the shortest) is a guessable bank.
  const skew = bankBiasProblems(bank);
  if (skew.length) throw new Error(`Practice-exam bank leaks answers through option length:\n${skew.join('\n')}`);
  return Object.freeze(bank);
}

export const BANK = loadBank();
