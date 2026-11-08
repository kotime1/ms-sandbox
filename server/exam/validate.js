// Answer-shape neutrality. A test-wise learner (or a model) can often pick the right answer without knowing the
// content, because correct options tend to be longer, more detailed, more hedged, or just look different.
// This file rejects questions whose options leak the answer through their SHAPE. It runs on every bank question
// at load time (and in the test suite) and on every live-generated question before it is accepted.
//
// What it checks, per option set (single/multi options and each dropdown blank with 4+ options unless noted):
//   1. length spread        longest option is not much longer than the shortest
//   2. unique longest       the correct option is not the one clearly longest option (single / dropdown blank)
//   3. correct vs wrong     multi: the correct options are not systematically longer or shorter than the wrong ones
//   4. odd one out          no punctuation/structure marker (parenthesis, comma, semicolon, colon, digit, trailing
//                           full stop, " and ") that separates exactly the correct options from the wrong ones
//   5. hedging              absolutes (always/never/only/...) appear in a wrong option but in no correct one
//   6. escape hatches       "all of the above", "none of the above", "both ..." options
//   7. stem echo            single: the correct option repeats distinctive stem words far more than every wrong one
// Order items have no options; the builder guarantees the shown order differs from the answer.

import { checkStructure } from './schema.js';

// "every hour" / "every 3 hours" is a schedule, not a hedge, so it is blanked out before looking for absolutes.
const SCHEDULE = /\bevery\s+(\d+\s+)?(minute|hour|day|week|month)s?\b/gi;
const ABSOLUTES = /\b(always|never|only|none|every|exclusively|entirely|completely|must)\b/i;
const absolute = (text) => ABSOLUTES.test(text.replace(SCHEDULE, ''));
const ESCAPE = /\bof the above\b|^both\b|\bnone of\b/i;
const MARKERS = {
  parenthesis: /\(/,
  comma: /,/,
  semicolon: /;/,
  colon: /:/,
  digit: /\d/,
  'trailing full stop': /\.\s*$/,
  'the word "and"': /\band\b/i,
};
const STOP = new Set(['should', 'which', 'would', 'could', 'their', 'these', 'those', 'there', 'about', 'after', 'before', 'being', 'where', 'while', 'microsoft', 'sentinel', 'defender', 'security']);

const words = (s) => String(s).toLowerCase().match(/[a-z]{6,}/g)?.filter((w) => !STOP.has(w)) ?? [];

/** Every group of options a learner chooses between. */
export function optionSets(q) {
  if (q.type === 'single' || q.type === 'multi') return [{ path: 'options', options: q.options, kind: q.type }];
  if (q.type === 'dropdown') return q.blanks.map((b) => ({ path: `blank ${b.id}`, options: b.options, kind: 'blank' }));
  return [];
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

export function checkSet({ path, options, kind }, context = '') {
  const out = [];
  const len = options.map((o) => o.text.trim().length);
  const max = Math.max(...len);
  const min = Math.min(...len);
  const correct = options.filter((o) => o.correct);
  const wrong = options.filter((o) => !o.correct);
  const big = options.length >= 4;

  for (const o of options) if (ESCAPE.test(o.text)) out.push(`${path}: "${o.text}" is an escape-hatch option (all/none of the above, both ...)`);

  // Short options are usually product or setting names whose length is fixed by the product, so only phrase-length
  // options (30+ chars) are held to the spread rule. The unique-longest rule below still applies to everything.
  if (max >= 30 && max > min * 1.45 && max - min > 10) out.push(`${path}: option lengths range ${min}-${max} chars; keep them within about 45% of each other`);

  if (kind !== 'multi' && correct.length === 1 && options.length >= 3) {
    const c = correct[0].text.trim().length;
    const others = wrong.map((o) => o.text.trim().length);
    const second = Math.max(...others);
    if (c > second && c - second >= Math.max(4, c * 0.08)) out.push(`${path}: the correct option is clearly the longest (${c} vs ${second} chars)`);
  }

  if (kind === 'multi' && correct.length && wrong.length) {
    const c = mean(correct.map((o) => o.text.trim().length));
    const w = mean(wrong.map((o) => o.text.trim().length));
    if (Math.abs(c - w) > 6 && (c > w * 1.2 || w > c * 1.2)) out.push(`${path}: correct options average ${c.toFixed(0)} chars, wrong ones ${w.toFixed(0)}; they should look alike`);
  }

  if (big) {
    for (const [name, re] of Object.entries(MARKERS)) {
      const has = options.map((o) => re.test(o.text));
      const nHas = has.filter(Boolean).length;
      if (nHas === 0 || nHas === options.length) continue;
      const exactlyCorrect = options.every((o, i) => has[i] === Boolean(o.correct));
      const exactlyWrong = options.every((o, i) => has[i] === !o.correct);
      if (exactlyCorrect || exactlyWrong) out.push(`${path}: ${name} appears in exactly the ${exactlyCorrect ? 'correct' : 'wrong'} options, which gives the answer away`);
    }
  }

  if (wrong.some((o) => absolute(o.text)) && !correct.some((o) => absolute(o.text))) {
    out.push(`${path}: an absolute word (always/never/only/must...) appears only in wrong options`);
  }

  if (kind === 'single' && correct.length === 1 && context) {
    const ctx = new Set(words(context));
    const overlap = (o) => new Set(words(o.text).filter((w) => ctx.has(w))).size;
    const c = overlap(correct[0]);
    const w = Math.max(...wrong.map(overlap));
    if (c - w >= 2) out.push(`${path}: the correct option repeats ${c} distinctive stem words, the wrong ones at most ${w}`);
  }
  return out;
}

export function shapeProblems(q) {
  const context = `${q.scenario ?? ''} ${q.stem ?? ''}`;
  return optionSets(q).flatMap((s) => checkSet(s, context));
}

/** Structure + shape. Returns [] when the question is acceptable. */
export function validateQuestion(q) {
  const s = checkStructure(q);
  return s.length ? s : shapeProblems(q);
}

/**
 * Length rank of the correct option in every single-answer option set with exactly 4 options: rank 1 = longest.
 * A neutral bank has each rank roughly 25% of the time. Too many 1s means "pick the longest" works; too many 4s
 * means "never pick the longest / pick the shortest" works. Both are tells.
 */
export function rankHistogram(bank) {
  const hist = [0, 0, 0, 0];
  const sets = bank.flatMap((q) => optionSets(q)).filter((s) => s.kind !== 'multi' && s.options.length === 4 && s.options.filter((o) => o.correct).length === 1);
  for (const s of sets) {
    const lens = s.options.map((o) => o.text.trim().length);
    const c = lens[s.options.findIndex((o) => o.correct)];
    // Ties share the rank fractionally, so equal-length options are never penalised.
    const above = lens.filter((l) => l > c).length;
    const equal = lens.filter((l) => l === c).length;
    for (let k = 0; k < equal; k++) hist[above + k] += 1 / equal;
  }
  return { n: sets.length, hist, share: hist.map((x) => (sets.length ? x / sets.length : 0)) };
}

/**
 * Whole-bank length-rank check. Returns a list of problems (empty = neutral enough).
 * Each rank should be near 25%; we allow +/-9 points, which is wide enough for a 50-set bank to pass honestly and
 * narrow enough that "always pick the longest" or "always pick the shortest" cannot beat chance by much.
 * Skipped below 24 sets, where the percentages are mostly noise.
 */
export function bankBiasProblems(bank, tolerance = 0.09) {
  const { n, share } = rankHistogram(bank);
  if (n < 24) return [];
  const names = ['longest', 'second longest', 'second shortest', 'shortest'];
  return share.flatMap((s, i) => (Math.abs(s - 0.25) > tolerance ? [`the correct option is the ${names[i]} ${(s * 100).toFixed(0)}% of the time (target 25% +/- ${(tolerance * 100).toFixed(0)})`] : []));
}
