// Planning live questions as SLOTS: one slot = one question to write, with its domain, type, objective and whether it carries a scenario.
//
// Why slots: requests run in parallel and cannot see each other. Left to choose freely, they pile onto the same popular objectives
// (measured: 17 repeated topics in 40 questions with free choice, 0 with assigned objectives). The planner owns the whole exam, so it gives
// every question its own objective up front. Small requests (2 slots each) also never hit the output limit (measured: peak 6,245 of 8,000
// tokens, against 40% of 4-question requests being cut off).

import { OBJECTIVES, DOMAIN_KEYS, DOMAINS } from './objectives.js';
import { TYPE_MIX, apportion } from './build.js';
import { shuffle } from './item.js';

/** Share of live questions that carry a scenario (about 60%, as in the bank). */
export const SCENARIO_SHARE = 0.6;
/** Slots per model request. */
export const SLOTS_PER_REQUEST = 2;

const bulletsOf = (domain) => OBJECTIVES.filter((g) => g.domain === domain).flatMap((g) => g.bullets);

/**
 * `want` objectives for a domain with no repeats while there are enough bullets, spread over the whole list (not the first few).
 * `start` rotates the starting point so successive exams do not always begin with the same objectives.
 */
export function pickObjectives(domain, want, start = 0) {
  const all = bulletsOf(domain);
  const out = [];
  for (let i = 0; i < want; i++) out.push(all[(Math.floor(i * (all.length / Math.max(want, 1))) + start) % all.length]);
  // If there are more slots than bullets, repeats are unavoidable; otherwise every objective must be distinct.
  if (want <= all.length && new Set(out).size !== out.length) {
    const rest = all.filter((b) => !out.includes(b));
    const seen = new Set();
    return out.map((b) => { if (!seen.has(b)) { seen.add(b); return b; } const alt = rest.shift(); seen.add(alt); return alt; });
  }
  return out;
}

/**
 * The slots for an exam of `count` questions of which `share` is written by the model. Per domain the number follows the domain target
 * (so the live questions keep the exam's domain weights), types follow TYPE_MIX, scenarios follow SCENARIO_SHARE.
 */
export function planSlots(count, { share = 0.4, rand = Math.random, start = Math.floor(rand() * 1000) } = {}) {
  const quota = apportion(count, Object.fromEntries(DOMAIN_KEYS.map((d) => [d, DOMAINS[d].target])));
  const slots = [];
  // Split the live total across the domains in proportion to their quotas, as ONE apportionment: rounding each domain separately can add
  // up to more than the live share (10 questions at 40% gave 5 live slots instead of 4).
  const live = apportion(Math.round(count * share), quota);
  for (const d of DOMAIN_KEYS) {
    const want = live[d];
    if (!want) continue;
    const types = shuffle(Object.entries(apportion(want, TYPE_MIX)).flatMap(([t, k]) => Array(k).fill(t)), rand);
    const objectives = pickObjectives(d, want, start);
    const scenarios = shuffle(Array.from({ length: want }, (_, i) => i < Math.round(want * SCENARIO_SHARE)), rand);
    for (let i = 0; i < want; i++) slots.push({ domain: d, type: types[i], objective: objectives[i], scenario: scenarios[i] });
  }
  return slots;
}

/** Group slots into requests of `size`, never mixing domains in one request. */
export function toRequests(slots, size = SLOTS_PER_REQUEST) {
  const out = [];
  for (const d of DOMAIN_KEYS) {
    const mine = slots.filter((s) => s.domain === d);
    for (let i = 0; i < mine.length; i += size) out.push({ domain: d, slots: mine.slice(i, i + size) });
  }
  return out;
}
