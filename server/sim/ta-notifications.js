// Email notification rules beyond alerts: Threat analytics and Vulnerabilities. Source (checked 2026-11-04):
//   learn.microsoft.com/defender-xdr/m365d-threat-analytics-notifications
//     Settings > Microsoft Defender XDR > General > Email notifications > "Threat analytics" tab > "+ Create a notification rule".
//     Name is required, the description is optional; both accept English letters and numbers only (no spaces, dashes, underscores).
//     Choose all new or updated reports, or only reports of a certain type or with a specific tag. At least one recipient.
// Alert notification rules live elsewhere (Settings > Endpoints > General > Email notifications) and are in notifications.js.
// The Vulnerabilities rule type exists as a tab beside them (practice question explanation); its fields are modelled minimally.

import { SimError } from './world-errors.js';

export const KINDS = ['threatAnalytics', 'vulnerabilities'];
export const TAGS = ['Ransomware', 'Phishing', 'Activity group', 'Vulnerability'];
export const REPORT_TYPES = ['Threat overview', 'Actor profile', 'Technique profile', 'Tool profile', 'Vulnerability profile', 'OSINT'];
export const MAX_RULES = 20;
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,120}\.[A-Za-z]{2,}$/;
const PLAIN = /^[A-Za-z0-9]+$/;

/** Validate a rule from the Threat analytics or Vulnerabilities tab. Throws SimError with portal-style wording. */
export function buildKindRule(p, { existing }) {
  if (!KINDS.includes(p.kind)) throw new SimError('Choose a notification type.');
  if (existing.length >= MAX_RULES) throw new SimError(`You can create at most ${MAX_RULES} of these notification rules in the sandbox.`);
  if (!PLAIN.test(p.name)) throw new SimError('The rule name accepts English letters and numbers only. Spaces, dashes and underscores are not supported.');
  if (p.description && !PLAIN.test(p.description)) throw new SimError('The description accepts English letters and numbers only. Spaces, dashes and underscores are not supported.');
  if (existing.some((r) => r.name.toLowerCase() === p.name.toLowerCase())) throw new SimError(`A notification rule named '${p.name}' already exists.`);
  const recipients = [...new Set(p.recipients.map((r) => r.trim().toLowerCase()))];
  if (!recipients.length) throw new SimError('Add at least one recipient.');
  const bad = recipients.find((r) => !EMAIL.test(r));
  if (bad) throw new SimError(`'${bad}' is not a valid email address.`);
  if (p.kind === 'vulnerabilities') return { recipients, scope: null };
  // Threat analytics: everything, or narrowed by report type and/or tag.
  const tags = [...new Set(p.tags)], types = [...new Set(p.reportTypes)];
  for (const t of tags) if (!TAGS.includes(t)) throw new SimError(`'${t}' is not a threat tag.`);
  for (const t of types) if (!REPORT_TYPES.includes(t)) throw new SimError(`'${t}' is not a report type.`);
  return { recipients, scope: { all: !tags.length && !types.length, tags, reportTypes: types } };
}

/** Does this rule send mail for a published or updated threat analytics report? Vulnerability rules never do. */
export function notifiesForReport(rule, report) {
  if (!rule.enabled || rule.kind !== 'threatAnalytics') return false;
  const s = rule.scope;
  if (s.all) return true;
  return s.tags.some((t) => report.tags.includes(t)) || s.reportTypes.includes(report.type);
}
