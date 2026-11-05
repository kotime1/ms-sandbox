// Microsoft Defender for Identity: remediation actions on a compromised account, and the reports. Sources (checked 2026-11-04):
//   learn.microsoft.com/defender-for-identity/remediation-actions  (actions x identity source; Revoke session is N/A for Active Directory;
//                                                                   Mark as compromised is Microsoft Entra ID only; sensor on a DC does the work)
//   learn.microsoft.com/defender-for-identity/reports              (Reports > Identities > Report management; the three reports; max 100,000 rows)
// NOT in the docs I could read: the file format of the detailed ALERT report. "Excel / XLSX" comes from the practice questions (set 1 Q24, set 4 Q26).

import { SimError } from './world-errors.js';

export const SOURCES = ['Active Directory', 'Microsoft Entra ID'];
export const ACTIONS = ['Disable', 'Enable', 'Revoke session', 'Mark as compromised', 'Force password change'];

/** Which identity sources each action supports (from the Supported actions table, restricted to the two sources the sandbox has). */
const SUPPORT = Object.freeze({
  'Disable': ['Active Directory', 'Microsoft Entra ID'],
  'Enable': ['Active Directory', 'Microsoft Entra ID'],
  'Revoke session': ['Microsoft Entra ID'],
  'Mark as compromised': ['Microsoft Entra ID'],
  'Force password change': ['Active Directory', 'Microsoft Entra ID'],
});

/** Why an action is unavailable for a source, in the docs' own terms. */
export function unavailableReason(action, source) {
  if (SUPPORT[action].includes(source)) return null;
  if (action === 'Revoke session') return `Revoke session is not available for ${source} accounts: it works on Microsoft Entra ID (and Okta) sessions. It also would not stop new sign-ins.`;
  if (action === 'Mark as compromised') return `Mark as compromised works only on Microsoft Entra ID accounts. It flags the identity in Entra ID; it does not block access.`;
  return `${action} is not supported for ${source}.`;
}

/** What each action does to an account, once it is allowed. Returns the new account state. */
export function applyAction(account, action) {
  const why = unavailableReason(action, account.source);
  if (why) throw new SimError(why);
  const a = { ...account };
  switch (action) {
    case 'Disable': a.enabled = false; break;
    case 'Enable': a.enabled = true; break;
    case 'Force password change': a.mustChangePassword = true; break;
    case 'Revoke session': a.sessions = 0; break;
    case 'Mark as compromised': a.flaggedCompromised = true; break;
    default: throw new SimError('Unknown action');
  }
  return a;
}

/** Can this account still authenticate to on-premises resources right now? Only an enabled account without a forced change can. */
export const canAuthenticate = (a) => a.enabled && !a.mustChangePassword;

// ---- Reports (Reports > Identities > Report management) ------------------------------------------------------------------
export const REPORTS = Object.freeze([
  { id: 'summary', name: 'Summary', about: 'A dashboard of system status: a summary of detected network activity and open health issues, listed by type.' },
  { id: 'sensitive-groups', name: 'Modification to sensitive groups', about: 'Every time a modification is made to a sensitive group, such as admins, or to manually tagged accounts or groups.' },
  { id: 'cleartext', name: 'Passwords exposed in cleartext', about: 'Source computers and accounts whose passwords Defender for Identity detected being sent in clear text (for example over LDAP).' },
]);
export const MAX_REPORT_ROWS = 100_000;
export const REPORT_PATH = 'Reports > Identities > Report management';
export const getReport = (id) => REPORTS.find((r) => r.id === id) ?? null;

/** Download a report for a period. Returns the rows in the window; the window must be sensible and the report must exist. */
export function downloadReport(report, rows, { from, to, now }) {
  if (!report) throw new SimError('Report not found', 'NotFound');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new SimError('Enter a valid start and end date.');
  if (from > to) throw new SimError('The start date must be earlier than the end date.');
  if (to > now) throw new SimError('The end date cannot be in the future.');
  return rows.filter((r) => r.at >= from && r.at <= to).slice(0, MAX_REPORT_ROWS);
}
