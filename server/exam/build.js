// Exam builder: choose questions to match the official domain weights and a realistic type mix.
//
// Domain weights (Microsoft Learn, skills measured 21 Oct 2026): manage 40-45%, respond 35-40%, hunt 20-25%.
// We aim at 42 / 38 / 20, which gives 21 / 19 / 10 for the default 50 questions, inside every range.

import { DOMAINS, DOMAIN_KEYS } from './objectives.js';
import { shuffle } from './item.js';

export const MIN_COUNT = 10;
export const MAX_COUNT = 50;
export const DEFAULT_COUNT = 50;
export const TYPE_MIX = { single: 0.55, multi: 0.15, order: 0.10, dropdown: 0.20 };

/** Largest-remainder apportionment of `total` over `weights` (an object of non-negative numbers). */
export function apportion(total, weights) {
  const keys = Object.keys(weights);
  const sum = keys.reduce((s, k) => s + weights[k], 0);
  const exact = keys.map((k) => (weights[k] / sum) * total);
  const out = Object.fromEntries(keys.map((k, i) => [k, Math.floor(exact[i])]));
  let left = total - Object.values(out).reduce((s, v) => s + v, 0);
  keys.map((k, i) => ({ k, frac: exact[i] - Math.floor(exact[i]) })).sort((a, b) => b.frac - a.frac).forEach(({ k }) => { if (left-- > 0) out[k]++; });
  return out;
}

export function domainQuota(count) {
  return apportion(count, Object.fromEntries(DOMAIN_KEYS.map((d) => [d, DOMAINS[d].target])));
}

/**
 * Pick `quota` questions from `pool` (all one domain) aiming at TYPE_MIX, preferring ones not in `seen`.
 * If a type runs short the gap is filled from the other types, so the quota is always met when the pool is big enough.
 */
function pickDomain(pool, quota, seen, rand) {
  const fresh = (list) => shuffle(list, rand).sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)));
  const byType = Object.fromEntries(Object.keys(TYPE_MIX).map((t) => [t, fresh(pool.filter((q) => q.type === t))]));
  const want = apportion(quota, TYPE_MIX);
  const chosen = [];
  for (const t of Object.keys(TYPE_MIX)) chosen.push(...byType[t].splice(0, want[t]));
  if (chosen.length < quota) {
    const rest = fresh(Object.values(byType).flat());
    chosen.push(...rest.slice(0, quota - chosen.length));
  }
  return chosen;
}

/**
 * @param bank  validated questions
 * @param extra extra (live) questions, used before bank questions when present
 * @returns { questions, shortfall } questions in the order the exam shows them (domains interleaved)
 */
export function buildExam({ bank, extra = [], count = DEFAULT_COUNT, seen = new Set(), rand = Math.random }) {
  const quota = domainQuota(count);
  const picked = [];
  let shortfall = 0;
  for (const d of DOMAIN_KEYS) {
    const live = extra.filter((q) => q.domain === d).slice(0, quota[d]);
    const pool = bank.filter((q) => q.domain === d);
    const fromBank = pickDomain(pool, quota[d] - live.length, seen, rand);
    const got = [...live, ...fromBank];
    shortfall += quota[d] - got.length;
    picked.push(...got);
  }
  return { questions: shuffle(picked, rand), quota, shortfall };
}
