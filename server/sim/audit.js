// Microsoft Purview Audit: the unified audit log, its record types, search limits, retention tiers and who may search.
// Sources (checked 2026-11-02):
//   learn.microsoft.com/purview/audit-solutions-overview  (Standard vs Premium; 180 days / one year / 10 years; Workload list for one year)
//   learn.microsoft.com/purview/audit-search              (search page: 180-day maximum range, record types filter, Audit Logs / View-Only Audit Logs roles)
// NOT confirmed from the docs fetched: the AirInvestigation record type for Defender XDR automated investigation and response.
// It comes from a practice question (set 3 Q34), so the lab that uses it is labelled Unverified for that detail.
// Which Entra roles can search is also exam-derived: the docs name the Audit Logs / View-Only Audit Logs roles, not Entra roles.

import { SimError } from './world-errors.js';

const DAY = 86_400_000;
export const MAX_RANGE_DAYS = 180;
export const TIERS = ['standard', 'premium'];
/** Workloads Audit (Premium) keeps for one year by default. Everything else is 180 days unless a policy says more. */
export const ONE_YEAR_WORKLOADS = Object.freeze(['AzureActiveDirectory', 'Exchange', 'OneDrive', 'SharePoint']);
export const RETENTION_DAYS = Object.freeze({ standard: 180, premiumOneYear: 365, premiumOther: 180 });

/** Record types the search page offers. `workload` decides retention. Descriptions are original summaries. */
export const RECORD_TYPES = Object.freeze([
  { id: 'AirInvestigation', label: 'AirInvestigation', workload: 'Defender', about: 'Activity from Microsoft Defender XDR automated investigation and response.' },
  { id: 'AzureActiveDirectory', label: 'AzureActiveDirectory', workload: 'AzureActiveDirectory', about: 'Microsoft Entra ID directory changes such as users, groups and applications.' },
  { id: 'ExchangeAdmin', label: 'ExchangeAdmin', workload: 'Exchange', about: 'Changes made by Exchange Online administrators.' },
  { id: 'ExchangeItem', label: 'ExchangeItem', workload: 'Exchange', about: 'Mailbox item activity.' },
  { id: 'SharePointFileOperation', label: 'SharePointFileOperation', workload: 'SharePoint', about: 'File and folder activity in SharePoint Online.' },
  { id: 'SecurityComplianceCenterEOPCmdlet', label: 'SecurityComplianceCenterEOPCmdlet', workload: 'Compliance', about: 'Security & Compliance and Exchange Online Protection cmdlets that an admin ran.' },
  { id: 'MicrosoftTeams', label: 'MicrosoftTeams', workload: 'MicrosoftTeams', about: 'Teams activity.' },
]);
const BY_ID = new Map(RECORD_TYPES.map((r) => [r.id, r]));
export const getRecordType = (id) => BY_ID.get(id) ?? null;

/** How long is a record of this record type kept, for this tier? */
export function retentionDays(tier, recordTypeId) {
  const rt = getRecordType(recordTypeId);
  if (tier === 'standard') return RETENTION_DAYS.standard;
  return rt && ONE_YEAR_WORKLOADS.includes(rt.workload) ? RETENTION_DAYS.premiumOneYear : RETENTION_DAYS.premiumOther;
}

/** Roles that can search, as a person holds them. Exam-derived (see above); the docs name the Audit Logs / View-Only Audit Logs roles. */
const CAN_SEARCH = new Set(['Global Administrator', 'Security Administrator', 'Exchange Administrator']);
export const canSearchAudit = (user) => [user.entraRole, user.roleGroup].some((r) => CAN_SEARCH.has(r));

/**
 * Validate and run a search over `records` (each { at: Date, recordType, activity, user, workload }).
 * `now` is injected so tests are deterministic. Records older than their retention have been deleted, so they are not returned.
 */
export function search({ records, tier, now, from, to, recordTypes }) {
  if (!(from instanceof Date) || Number.isNaN(from.getTime()) || !(to instanceof Date) || Number.isNaN(to.getTime())) throw new SimError('Enter a valid start and end date.');
  if (from > to) throw new SimError('The start date must be earlier than the end date.');
  if (to - from > MAX_RANGE_DAYS * DAY) throw new SimError(`The maximum date range is ${MAX_RANGE_DAYS} days. Narrow the range.`);
  if (to > now) throw new SimError('The end date cannot be in the future.');
  for (const id of recordTypes) if (!getRecordType(id)) throw new SimError(`'${id}' is not a record type.`);
  const wanted = new Set(recordTypes);
  return records.filter((r) => {
    if (wanted.size && !wanted.has(r.recordType)) return false;
    if (r.at < from || r.at > to) return false;
    const keptFor = retentionDays(tier, r.recordType) * DAY;
    return now - r.at.getTime() <= keptFor; // aged out of the log
  });
}
