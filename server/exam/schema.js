// Practice-exam question schema (the authoring format). checkStructure() returns a list of problems; empty = fine.
//
// Every question:
//   id           'm001' style, unique across the bank (live questions get 'live-...' ids)
//   domain       'manage' | 'respond' | 'hunt'
//   objective    one skills-measured bullet from objectives.js, exactly as written there, and from the same domain
//   type         'single' | 'multi' | 'order' | 'dropdown'
//   scenario     optional. The environment the question is about (tenant, users, devices, current config). Scenario-based
//                items carry it; knowledge/performance items may not. Put the specificity here, never in an answer option.
//   stem         the question. 20-600 chars
//   explanation  why the right answer is right, 40-900 chars. Shown after the learner submits
//   source       'bank' (original), 'setN:QM' (adapted from question_sets/setN.txt question M) or 'live'
//   labId        optional. A lab in server/labs/ that practises this
//   learn        optional. Title of a Microsoft Learn page to read (a title, never a URL)
//
// type 'single'   options: 4-5 x { text, correct?: true, why? }   exactly one correct
// type 'multi'    options: 5-6 x { text, correct?: true, why? }   2-3 correct; `select` = how many; the stem says "two"/"three"
// type 'order'    steps:   3-6 x { text }                        listed in the CORRECT order; the builder shuffles them
// type 'dropdown' template: text with {{id}} blanks; blanks: 1-5 x { id, options: 2-5 x { text, correct?, why? } }, one correct each
//                 code?: true shows the template in a monospace block (KQL, JSON). Also used for Yes/No statement tables.
//
// `why` is required on every WRONG option (15-300 chars): it is what the learner reads when they pick it.
// Answer-shape rules live in validate.js. Short version: the correct option must not look different from the wrong ones.

import { DOMAINS, BULLET_DOMAIN } from './objectives.js';

export const TYPES = ['single', 'multi', 'order', 'dropdown'];
const SOURCE = /^(bank|live|set[1-5]:Q\d{1,2})$/;
const ID = /^[a-z0-9-]{3,24}$/;
const BLANK_ID = /^[a-z0-9]{1,3}$/;
const len = (v) => (typeof v === 'string' ? v.trim().length : -1);

function checkOptions(opts, path, { min, max, correct }, errs) {
  if (!Array.isArray(opts) || opts.length < min || opts.length > max) { errs.push(`${path}: needs ${min}-${max} options`); return; }
  const texts = new Set();
  let nCorrect = 0;
  opts.forEach((o, i) => {
    const p = `${path}[${i}]`;
    if (!o || typeof o !== 'object') { errs.push(`${p}: not an object`); return; }
    if (len(o.text) < 1 || o.text.length > 220) errs.push(`${p}: text must be 1-220 chars`);
    if (texts.has(o.text)) errs.push(`${p}: duplicate option text`);
    texts.add(o.text);
    if (o.correct !== undefined && o.correct !== true) errs.push(`${p}: correct must be true or omitted`);
    if (o.correct) nCorrect++;
    else if (len(o.why) < 15 || o.why.length > 300) errs.push(`${p}: a wrong option needs a 'why' of 15-300 chars`);
    if (o.correct && o.why !== undefined && (len(o.why) < 1 || o.why.length > 300)) errs.push(`${p}: why must be 1-300 chars`);
  });
  if (nCorrect < correct[0] || nCorrect > correct[1]) errs.push(`${path}: needs ${correct[0] === correct[1] ? correct[0] : `${correct[0]}-${correct[1]}`} correct option(s), has ${nCorrect}`);
}

export function checkStructure(q) {
  const errs = [];
  if (!q || typeof q !== 'object') return ['not an object'];
  if (!ID.test(q.id ?? '')) errs.push('id: must match [a-z0-9-]{3,24}');
  if (!Object.hasOwn(DOMAINS, q.domain)) errs.push('domain: must be manage, respond or hunt');
  if (!BULLET_DOMAIN.has(q.objective)) errs.push('objective: must be a skills-measured bullet from objectives.js, copied exactly');
  else if (BULLET_DOMAIN.get(q.objective) !== q.domain) errs.push(`objective: belongs to domain '${BULLET_DOMAIN.get(q.objective)}', not '${q.domain}'`);
  if (!TYPES.includes(q.type)) errs.push(`type: must be one of ${TYPES.join(', ')}`);
  if (q.scenario !== undefined && (len(q.scenario) < 20 || q.scenario.length > 900)) errs.push('scenario: 20-900 chars when present');
  if (len(q.stem) < 10 || q.stem.length > 600) errs.push('stem: 10-600 chars');
  if (len(q.explanation) < 40 || q.explanation.length > 900) errs.push('explanation: 40-900 chars');
  if (!SOURCE.test(q.source ?? '')) errs.push("source: 'bank', 'live' or 'setN:QM'");
  if (q.labId !== undefined && !/^[a-z0-9-]{2,40}$/.test(q.labId)) errs.push('labId: a lab id');
  if (q.learn !== undefined && (len(q.learn) < 5 || q.learn.length > 160 || /https?:/i.test(q.learn))) errs.push('learn: a page title of 5-160 chars, not a URL');
  if (q.code !== undefined && typeof q.code !== 'boolean') errs.push('code: boolean');

  if (q.type === 'single') checkOptions(q.options, 'options', { min: 4, max: 5, correct: [1, 1] }, errs);
  else if (q.type === 'multi') {
    checkOptions(q.options, 'options', { min: 5, max: 6, correct: [2, 3] }, errs);
    const n = Array.isArray(q.options) ? q.options.filter((o) => o?.correct).length : 0;
    if (q.select !== n) errs.push(`select: must equal the number of correct options (${n})`);
    if (!/\b(two|three|2|3)\b/i.test(q.stem ?? '')) errs.push("stem: must say how many to pick ('two' or 'three')");
  } else if (q.type === 'order') {
    const s = q.steps;
    if (!Array.isArray(s) || s.length < 3 || s.length > 6) errs.push('steps: needs 3-6 steps');
    else {
      const seen = new Set();
      s.forEach((st, i) => {
        if (len(st?.text) < 4 || st.text.length > 160) errs.push(`steps[${i}]: text must be 4-160 chars`);
        if (seen.has(st?.text)) errs.push(`steps[${i}]: duplicate step`);
        seen.add(st?.text);
      });
    }
  } else if (q.type === 'dropdown') {
    if (len(q.template) < 10 || q.template.length > 900) errs.push('template: 10-900 chars');
    const refs = [...String(q.template ?? '').matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1]);
    if (!Array.isArray(q.blanks) || q.blanks.length < 1 || q.blanks.length > 5) errs.push('blanks: needs 1-5 blanks');
    else {
      const ids = new Set();
      q.blanks.forEach((b, i) => {
        if (!BLANK_ID.test(b?.id ?? '')) errs.push(`blanks[${i}]: id must be 1-3 lowercase letters/digits`);
        if (ids.has(b?.id)) errs.push(`blanks[${i}]: duplicate id`);
        ids.add(b?.id);
        checkOptions(b?.options, `blanks[${i}].options`, { min: 2, max: 5, correct: [1, 1] }, errs);
        if (refs.filter((r) => r === b?.id).length !== 1) errs.push(`blanks[${i}]: template must contain {{${b?.id}}} exactly once`);
      });
      for (const r of refs) if (!ids.has(r)) errs.push(`template: {{${r}}} has no matching blank`);
    }
  }
  return errs;
}
