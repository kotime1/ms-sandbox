// Custom detection rules (Microsoft Defender XDR).
//
// Source: learn.microsoft.com/en-us/defender-xdr/custom-detection-rules (page dated 2026-09-02, updated 2026-10-04).
//
// Modelled:
//   - the six wizard steps: prepare query, alert details, alert enrichment, actions, scope, review
//   - frequency with the documented fixed lookback for Defender data, and the Continuous (NRT) eligibility rules
//   - recommended output columns; entity columns used to map impacted assets
//   - dynamic alert title/description with {{Column}} (at most 3 columns per field); up to 20 custom details
//   - device / file / user / email actions and the columns each one needs
//   - scope: all devices or device groups
//   - 150 alerts per run; events with the same entities and details collapse into one alert
// NOT modelled (the UI says so): Sentinel "Custom" frequency and lookback, SaaS governance actions, Sentinel scoping columns,
//   the 30-day backfill on first save, scheduled execution (rules run when saved and when a lab/scenario asks).

import { SimError } from './world-errors.js';

export const FREQUENCIES = {
  '24h': { label: 'Every 24 hours', lookback: '30 days', lookbackMs: 30 * 86_400_000 },
  '12h': { label: 'Every 12 hours', lookback: '48 hours', lookbackMs: 48 * 3_600_000 },
  '3h': { label: 'Every 3 hours', lookback: '12 hours', lookbackMs: 12 * 3_600_000 },
  '1h': { label: 'Every hour', lookback: '4 hours', lookbackMs: 4 * 3_600_000 },
  nrt: { label: 'Continuous (NRT)', lookback: 'near real time', lookbackMs: 3_600_000 },
};

export const MAX_ALERTS_PER_RUN = 150;
export const MAX_CUSTOM_DETAILS = 20;
export const MAX_DYNAMIC_COLUMNS = 3;

export const SEVERITIES = ['Informational', 'Low', 'Medium', 'High'];
export const CATEGORIES = ['Collection', 'Command and control', 'Credential access', 'Defense evasion', 'Discovery', 'Execution', 'Exfiltration', 'Exploit', 'Initial access', 'Lateral movement', 'Malware', 'Persistence', 'Privilege escalation', 'Ransomware', 'Suspicious activity', 'Unwanted software'];

/** Tables that support Continuous (NRT) frequency. Only the ones this sandbox has are relevant, but the docs' list is kept whole. */
export const NRT_TABLES = new Set([
  'AlertEvidence', 'CloudAppEvents', 'DeviceEvents', 'DeviceFileCertificateInfo', 'DeviceFileEvents', 'DeviceImageLoadEvents', 'DeviceLogonEvents',
  'DeviceNetworkEvents', 'DeviceNetworkInfo', 'DeviceInfo', 'DeviceProcessEvents', 'DeviceRegistryEvents', 'EmailAttachmentInfo', 'EmailEvents',
  'EmailPostDeliveryEvents', 'EmailUrlInfo', 'IdentityDirectoryEvents', 'IdentityLogonEvents', 'IdentityQueryEvents', 'UrlClickEvents',
  'AuditLogs', 'AWSCloudTrail', 'AzureActivity', 'CommonSecurityLog', 'MicrosoftGraphActivityLogs', 'OfficeActivity', 'SecurityAlert', 'SecurityEvent', 'SigninLogs',
]);

// Entity columns, by what they identify (the docs' list under "Required columns in the query results").
export const ENTITY_COLUMNS = {
  device: ['DeviceId', 'DeviceName', 'RemoteDeviceName'],
  mailbox: ['RecipientEmailAddress', 'SenderFromAddress', 'SenderMailFromAddress', 'SenderObjectId', 'RecipientObjectId'],
  account: ['AccountObjectId', 'AccountSid', 'AccountUpn', 'InitiatingProcessAccountSid', 'InitiatingProcessAccountUpn'],
};
export const ALL_ENTITY_COLUMNS = Object.values(ENTITY_COLUMNS).flat();

// Actions and the output columns each needs (docs: "Specify actions").
export const ACTIONS = {
  isolateDevice: { group: 'Devices', label: 'Isolate device', needs: ['DeviceId'], note: 'Applies full network isolation using Microsoft Defender for Endpoint.' },
  collectPackage: { group: 'Devices', label: 'Collect investigation package', needs: ['DeviceId'], note: 'Collects device information in a ZIP file.' },
  runAvScan: { group: 'Devices', label: 'Run antivirus scan', needs: ['DeviceId'], note: 'Performs a full Microsoft Defender Antivirus scan.' },
  initiateInvestigation: { group: 'Devices', label: 'Initiate investigation', needs: ['DeviceId'], note: 'Starts an automated investigation on the device.' },
  restrictAppExecution: { group: 'Devices', label: 'Restrict app execution', needs: ['DeviceId'], note: 'Only files signed with a Microsoft-issued certificate can run.' },
  blockFile: { group: 'Files', label: 'Allow/Block', needs: [['SHA1', 'InitiatingProcessSHA1', 'SHA256', 'InitiatingProcessSHA256']], note: 'Blocks the file on all devices in the chosen device groups. Needs Remediate permission.' },
  quarantineFile: { group: 'Files', label: 'Quarantine file', needs: [['SHA1', 'InitiatingProcessSHA1', 'SHA256', 'InitiatingProcessSHA256']], note: 'Deletes the file from its location and keeps a copy in quarantine.' },
  markCompromised: { group: 'Users', label: 'Mark user as compromised', needs: [['AccountObjectId', 'InitiatingProcessAccountObjectId', 'RecipientObjectId']], note: "Sets the user's risk level to high in Microsoft Entra ID." },
  disableUser: { group: 'Users', label: 'Disable user', needs: [['AccountSid', 'InitiatingProcessAccountSid', 'RequestAccountSid', 'OnPremSid']], note: 'Temporarily prevents the user from signing in. Needs the account SID.' },
  resetUserAuth: { group: 'Users', label: 'Reset user authentication', needs: [['AccountSid', 'InitiatingProcessAccountSid', 'RequestAccountSid', 'OnPremSid']], note: 'Forces a password change (on-premises) or a new sign-in (Entra). Needs the account SID.' },
  moveToFolder: { group: 'Emails', label: 'Move to mailbox folder', needs: ['NetworkMessageId', 'RecipientEmailAddress'], note: 'Moves the message to Junk, Inbox or Deleted items.' },
  deleteEmail: { group: 'Emails', label: 'Delete email', needs: ['NetworkMessageId', 'RecipientEmailAddress'], note: 'Soft delete (Deleted Items) or hard delete.' },
};

const norm = (s) => String(s ?? '').trim();

/** `{{Column}}` references in a template. */
export const dynamicRefs = (text) => [...String(text ?? '').matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map((m) => m[1]);

/** Fill `{{Column}}` from a record; a missing value leaves the placeholder so the author notices. */
export const fill = (text, rec) => String(text ?? '').replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, c) => (rec[c] === undefined || rec[c] === null || rec[c] === '' ? m : String(rec[c])));

/** Query shape facts the wizard and the NRT rule both need. */
export function describeQuery(text, meta, columns) {
  const ops = meta.ops ?? [];
  const tables = meta.tables ?? [];
  const hasComment = /\/\//.test(text);
  return {
    columns,
    tables,
    ops,
    singleTable: tables.length === 1,
    usesJoinOrUnion: ops.includes('join') || ops.includes('union'),
    hasComment,
  };
}

/** Why a query cannot run as Continuous (NRT), or null if it can. Exact reasons from the docs. */
export function nrtBlocker(info) {
  if (!info.singleTable) return 'The query must reference one table only.';
  if (info.usesJoinOrUnion) return 'The query cannot use joins, unions or externaldata.';
  if (info.hasComment) return 'The query cannot include comment lines.';
  if (!NRT_TABLES.has(info.tables[0])) return `The table ${info.tables[0]} does not support Continuous (NRT) frequency.`;
  return null;
}

/** Which actions can run against this query's output, and what is missing for the others. */
export function actionAvailability(columns) {
  const has = (c) => columns.includes(c);
  return Object.fromEntries(Object.entries(ACTIONS).map(([id, a]) => {
    const missing = a.needs.filter((n) => (Array.isArray(n) ? !n.some(has) : !has(n))).map((n) => (Array.isArray(n) ? n.join(' or ') : n));
    return [id, { ...a, available: missing.length === 0, missing }];
  }));
}

/** Validate a detection definition against the query output. Throws a SimError with the portal-style reason. */
export function validateDetection(d, info) {
  const cols = info.columns;
  if (!norm(d.name)) throw new SimError('Enter a detection name.');
  if (!norm(d.alertTitle)) throw new SimError('Enter an alert title.');
  if (!Object.hasOwn(FREQUENCIES, d.frequency)) throw new SimError('Choose a frequency.');
  if (!SEVERITIES.includes(d.severity)) throw new SimError('Choose a severity.');
  if (!CATEGORIES.includes(d.category)) throw new SimError('Choose a category.');

  // Recommended output columns (the docs say "recommend"; the exam may still say "must", so the wizard warns but only blocks what cannot work).
  const hasTime = cols.includes('Timestamp') || cols.includes('TimeGenerated');
  const warnings = [];
  if (!hasTime) warnings.push('No Timestamp or TimeGenerated column: alert times will use the lookback window instead of the event time.');
  const endpoint = info.tables.some((t) => t.startsWith('Device'));
  if (endpoint && !(cols.includes('DeviceId') && cols.includes('ReportId'))) warnings.push('For Microsoft Defender for Endpoint tables, return DeviceId and ReportId so alerts get the right device-group scope and process tree.');
  if (!endpoint && !(cols.includes('ReportId'))) warnings.push('Project Timestamp and ReportId from the same event so Defender can find the original event.');
  if (!cols.some((c) => ALL_ENTITY_COLUMNS.includes(c))) warnings.push('No column identifies an impacted asset (for example DeviceId, AccountUpn or RecipientEmailAddress), so entities cannot be mapped automatically.');

  if (d.frequency === 'nrt') {
    const why = nrtBlocker(info);
    if (why) throw new SimError(`This query cannot run as Continuous (NRT). ${why}`);
  }

  // dynamic title / description: only existing columns, at most three per field
  for (const [label, text] of [['alert title', d.alertTitle], ['description', d.description]]) {
    const refs = dynamicRefs(text);
    if (new Set(refs).size > MAX_DYNAMIC_COLUMNS) throw new SimError(`You can reference up to ${MAX_DYNAMIC_COLUMNS} columns in the ${label}.`);
    for (const r of refs) if (!cols.includes(r)) throw new SimError(`The ${label} references {{${r}}}, which the query does not return.`);
  }

  if (d.customDetails.length > MAX_CUSTOM_DETAILS) throw new SimError(`A rule is limited to ${MAX_CUSTOM_DETAILS} custom details.`);
  const keys = new Set();
  for (const c of d.customDetails) {
    if (keys.has(c.key.toLowerCase())) throw new SimError(`Custom detail key "${c.key}" is used twice.`);
    keys.add(c.key.toLowerCase());
    if (!cols.includes(c.column)) throw new SimError(`Custom detail "${c.key}" uses column ${c.column}, which the query does not return.`);
  }

  for (const e of d.entities) {
    if (!cols.includes(e.column)) throw new SimError(`Entity mapping uses column ${e.column}, which the query does not return.`);
  }

  const avail = actionAvailability(cols);
  for (const a of d.actions) {
    const def = avail[a.type];
    if (!def) throw new SimError(`Unknown action ${a.type}.`);
    if (!def.available) throw new SimError(`${def.label} needs the query to return ${def.missing.join(' and ')}.`);
    if (a.type === 'moveToFolder' && !['Junk', 'Inbox', 'Deleted items'].includes(a.folder)) throw new SimError('Choose a mailbox folder: Junk, Inbox or Deleted items.');
    if (a.type === 'deleteEmail' && !['soft', 'hard'].includes(a.mode)) throw new SimError('Choose Soft delete or Hard delete.');
  }
  return { warnings };
}

/** The key that collapses duplicate events into one alert: same entities, custom details and dynamic text. */
export function dedupeKey(d, rec) {
  return JSON.stringify([fill(d.alertTitle, rec), fill(d.description, rec), d.entities.map((e) => rec[e.column] ?? null), d.customDetails.map((c) => rec[c.column] ?? null)]);
}

/** Which of the rule's alerts would a record produce, given scope? Returns false if the record's device is out of scope. */
export function inScope(d, rec, deviceById) {
  if (d.scope.type === 'all') return true;
  const devId = rec.DeviceId;
  if (!devId) return true; // rules that do not return devices (mailboxes, accounts) are not narrowed by device scope
  const dev = deviceById(devId);
  return Boolean(dev) && (dev.groups ?? []).some((g) => d.scope.groups.includes(g));
}
