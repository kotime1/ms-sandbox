// Pure rules for creating Microsoft Sentinel analytics rules: which rule types the learner can create and what
// each lets them configure. Sources (checked 2026-11-02):
//   learn.microsoft.com/azure/sentinel/near-real-time-rules      (NRT)
//   learn.microsoft.com/azure/sentinel/create-analytics-rules    (scheduled, "Schedule and scope the query")
// The other kinds (Fusion, ML behavior analytics, Microsoft security, Anomaly) are enabled from templates, not authored,
// so they are not creatable here.

import { SimError } from './world-errors.js';

export const KINDS = ['Scheduled', 'NRT'];
export const SEVERITIES = ['Informational', 'Low', 'Medium', 'High'];

export const MIN_MINUTES = 5;               // scheduled: run every / look back, minimum
export const MAX_MINUTES = 14 * 24 * 60;    // scheduled: 14 days
export const MAX_NRT_RULES = 50;            // "No more than 50 rules can be defined per customer"

/** What NRT hard-codes. The wizard shows these read-only instead of offering the scheduling controls. */
export const NRT_FIXED = Object.freeze({
  frequencyMinutes: 1,
  lookbackMinutes: 1,
  timeBasis: 'ingestion time',
  builtInDelayMinutes: 2,
});
/** Scheduled rules wait five minutes to allow for ingestion lag and evaluate TimeGenerated. */
export const SCHEDULED_FIXED = Object.freeze({ builtInDelayMinutes: 5, timeBasis: 'TimeGenerated (event time)' });

/** One-line comparison used by the wizard to show what the chosen type means. */
export function describeKind(kind) {
  if (kind === 'NRT') {
    return `Runs every ${NRT_FIXED.frequencyMinutes} minute with a ${NRT_FIXED.lookbackMinutes}-minute lookback and evaluates ${NRT_FIXED.timeBasis}, so an ingestion delay does not hide events. Frequency and lookback cannot be changed.`;
  }
  return `You choose how often it runs (${MIN_MINUTES} minutes to 14 days) and how far back it looks (at least as long as the interval). It evaluates ${SCHEDULED_FIXED.timeBasis} after a ${SCHEDULED_FIXED.builtInDelayMinutes}-minute built-in delay.`;
}

/**
 * Validate and normalise a rule the learner is creating. Throws SimError with portal-style wording.
 * `existing` is the current rule list (for the name and NRT-cap checks).
 */
export function buildRule(p, existing) {
  if (!KINDS.includes(p.kind)) throw new SimError('Choose Scheduled query rule or Near-real-time (NRT) query rule.');
  if (existing.some((r) => r.name.toLowerCase() === p.name.toLowerCase())) throw new SimError(`A rule named '${p.name}' already exists. Rule names must be unique.`);
  if (!SEVERITIES.includes(p.severity)) throw new SimError('Choose a severity.');
  if (p.kind === 'NRT') {
    if (existing.filter((r) => r.kind === 'NRT').length >= MAX_NRT_RULES) throw new SimError(`You can define at most ${MAX_NRT_RULES} NRT rules.`);
    // The NRT wizard has no scheduling controls, so a request that carries them is a mistake worth explaining.
    if (p.frequencyMinutes !== undefined || p.lookbackMinutes !== undefined) {
      throw new SimError('NRT rules always run every 1 minute with a 1-minute lookback. Those settings are not configurable. Use a scheduled rule if you need a different interval.');
    }
    return { ...NRT_FIXED };
  }
  const f = p.frequencyMinutes ?? 300, l = p.lookbackMinutes ?? 300;
  for (const [label, v] of [['Run query every', f], ['Lookup data from the last', l]]) {
    if (!Number.isInteger(v) || v < MIN_MINUTES || v > MAX_MINUTES) throw new SimError(`${label} must be between ${MIN_MINUTES} minutes and 14 days. A scheduled rule cannot run every minute: that is what an NRT rule is for.`);
  }
  if (l < f) throw new SimError('Lookup data from the last must be longer than or equal to Run query every, otherwise events between runs would never be evaluated.');
  return { frequencyMinutes: f, lookbackMinutes: l, timeBasis: SCHEDULED_FIXED.timeBasis, builtInDelayMinutes: SCHEDULED_FIXED.builtInDelayMinutes };
}
