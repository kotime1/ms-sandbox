// Table schemas and baseline telemetry for the simulated workspace.
//
// Schemas are SIMPLIFIED versions of the real ones (see docs/ARCHITECTURE.md "Fidelity").
// All data is synthetic; IPs come from RFC 5737 documentation ranges, domains are contoso.com.
// Baseline data is generated from a seeded RNG so every learner sees the same dataset.

import { rng, guid } from '../core/util.js';

export const T = (name, type = 'string') => ({ name, type });

export const SCHEMAS = {
  SigninLogs: [T('TimeGenerated', 'datetime'), T('UserPrincipalName'), T('IPAddress'), T('Location'), T('AppDisplayName'), T('ResultType'), T('ResultDescription'), T('ConditionalAccessStatus')],
  AuditLogs: [T('TimeGenerated', 'datetime'), T('OperationName'), T('Category'), T('InitiatedBy'), T('TargetUser'), T('IPAddress'), T('Result')],
  SecurityAlert: [T('TimeGenerated', 'datetime'), T('SystemAlertId'), T('AlertName'), T('AlertSeverity'), T('ProviderName'), T('CompromisedEntity'), T('IPAddress'), T('Description')],
  SecurityIncident: [T('TimeGenerated', 'datetime'), T('IncidentNumber', 'long'), T('Title'), T('Severity'), T('Status'), T('Owner')],
  AzureActivity: [T('TimeGenerated', 'datetime'), T('OperationNameValue'), T('ActivityStatusValue'), T('Caller'), T('ResourceGroup'), T('CategoryValue'), T('Properties')],
  MicrosoftGraphActivityLogs: [T('TimeGenerated', 'datetime'), T('RequestId'), T('AppId'), T('ServicePrincipalId'), T('UserId'), T('RequestMethod'), T('RequestUri'), T('ResponseStatusCode', 'long'), T('IPAddress')],
  DeviceLogonEvents: [T('Timestamp', 'datetime'), T('ReportId', 'long'), T('DeviceId'), T('DeviceName'), T('ActionType'), T('LogonType'), T('AccountName'), T('RemoteIP'), T('InitiatingProcessCommandLine')],
  DeviceEvents: [T('Timestamp', 'datetime'), T('ReportId', 'long'), T('DeviceId'), T('DeviceName'), T('OSPlatform'), T('ActionType'), T('InitiatingProcessFileName'), T('InitiatingProcessCommandLine'), T('InitiatingProcessAccountUpn')],
  BehaviorInfo: [T('Timestamp', 'datetime'), T('BehaviorId'), T('Title'), T('Description'), T('Categories')],
  BehaviorEntities: [T('Timestamp', 'datetime'), T('BehaviorId'), T('EntityType'), T('AccountUpn'), T('RemoteIP'), T('DeviceName')],
  NetworkSessions_CL: [T('TimeGenerated', 'datetime'), T('SourceIP'), T('DestinationIP'), T('DestinationPort', 'long'), T('Bytes', 'long'), T('Action')],
};

/**
 * Which tables each query surface exposes. Using a table from the wrong surface is a teachable error.
 * The UEBA behaviour tables live in Advanced hunting (the exam question asks about it there).
 */
export const SURFACES = {
  sentinel: ['SigninLogs', 'AuditLogs', 'SecurityAlert', 'SecurityIncident', 'AzureActivity', 'MicrosoftGraphActivityLogs', 'NetworkSessions_CL'],
  defender: ['DeviceLogonEvents', 'DeviceEvents', 'BehaviorInfo', 'BehaviorEntities'],
};

/** Tables a lab must opt into (so the schema browser stays uncluttered). Hidden from `/api/view/schema-*` until enabled. */
export const OPTIONAL_TABLES = new Set(['NetworkSessions_CL', 'BehaviorInfo', 'BehaviorEntities', 'DeviceEvents']);

export const USERS = [
  'alex.rivera', 'priya.shah', 'jordan.lee', 'sam.okafor', 'mei.tan', 'chris.novak',
  'dana.ortiz', 'jamie.fox', 'user1', 'admin1', 'soc.analyst1', 'soc.analyst2',
].map((n) => `${n}@contoso.com`);

const HOME_IPS = ['192.0.2.10', '192.0.2.11', '192.0.2.24', '192.0.2.57', '192.0.2.88'];
const APPS = ['Office 365 Exchange Online', 'Microsoft Teams', 'Azure Portal', 'SharePoint Online', 'Microsoft Graph PowerShell'];
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

export function newTables() {
  const m = new Map();
  for (const [name, cols] of Object.entries(SCHEMAS)) m.set(name, { columns: cols, rows: [] });
  return m;
}

export function seedBaseline(tables, now, seed = 2026) {
  const r = rng(seed);
  const add = (name, row) => tables.get(name).rows.push(row);

  // ~7 days of ordinary sign-ins, mostly successful, with a little noise.
  for (let i = 0; i < 420; i++) {
    const ok = r() > 0.12;
    add('SigninLogs', {
      TimeGenerated: new Date(now - r.int(2, 7 * 24 * 60) * MIN),
      UserPrincipalName: r.pick(USERS),
      IPAddress: r.pick(HOME_IPS),
      Location: 'US',
      AppDisplayName: r.pick(APPS),
      ResultType: ok ? '0' : r.pick(['50126', '50074', '50053']),
      ResultDescription: ok ? 'Success' : r.pick(['Invalid username or password', 'Strong Authentication required', 'Account locked']),
      ConditionalAccessStatus: ok ? 'success' : 'failure',
    });
  }
  for (let i = 0; i < 60; i++) {
    add('AuditLogs', {
      TimeGenerated: new Date(now - r.int(10, 7 * 24 * 60) * MIN),
      OperationName: r.pick(['Update user', 'Add member to group', 'Reset password (by admin)', 'Update application', 'Add app role assignment']),
      Category: r.pick(['UserManagement', 'GroupManagement', 'ApplicationManagement']),
      InitiatedBy: r.pick(['admin1@contoso.com', 'priya.shah@contoso.com', 'jamie.fox@contoso.com']),
      TargetUser: r.pick(USERS),
      IPAddress: r.pick(HOME_IPS),
      Result: 'success',
    });
  }
  const rule = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-sentinel/providers/Microsoft.OperationalInsights/workspaces/law-sentinel/providers/Microsoft.SecurityInsights/alertRules';
  for (let i = 0; i < 70; i++) {
    const op = r.pick(['MICROSOFT.COMPUTE/VIRTUALMACHINES/WRITE', 'MICROSOFT.RESOURCES/DEPLOYMENTS/WRITE', 'MICROSOFT.STORAGE/STORAGEACCOUNTS/LISTKEYS/ACTION', 'MICROSOFT.NETWORK/NETWORKSECURITYGROUPS/WRITE']);
    add('AzureActivity', {
      TimeGenerated: new Date(now - r.int(30, 7 * 24 * 60) * MIN),
      OperationNameValue: op,
      ActivityStatusValue: r.pick(['Succeeded', 'Succeeded', 'Started', 'Failed']),
      Caller: r.pick(['admin1@contoso.com', 'jamie.fox@contoso.com', 'sam.okafor@contoso.com']),
      ResourceGroup: 'RG-WORKLOADS',
      CategoryValue: 'Administrative',
      Properties: JSON.stringify({ resource: op.split('/').slice(0, 2).join('/') }),
    });
  }
  // A couple of ordinary analytics-rule edits so the lab filter is not trivially "everything".
  for (const [rid, caller, ago] of [['aaaaaaaa-0000-4000-8000-000000000001', 'admin1@contoso.com', 3 * DAY], ['aaaaaaaa-0000-4000-8000-000000000002', 'jamie.fox@contoso.com', 5 * DAY]]) {
    add('AzureActivity', {
      TimeGenerated: new Date(now - ago),
      OperationNameValue: 'MICROSOFT.SECURITYINSIGHTS/ALERTRULES/WRITE',
      ActivityStatusValue: 'Succeeded',
      Caller: caller,
      ResourceGroup: 'RG-SENTINEL',
      CategoryValue: 'Administrative',
      Properties: JSON.stringify({ resource: `${rule}/${rid}` }),
    });
  }
  for (let i = 0; i < 6; i++) {
    add('SecurityAlert', {
      TimeGenerated: new Date(now - r.int(60, 6 * 24 * 60) * MIN),
      SystemAlertId: guid(r),
      AlertName: r.pick(['Anonymous IP address sign-in', 'Unfamiliar sign-in properties', 'Suspicious inbox forwarding rule']),
      AlertSeverity: r.pick(['Low', 'Medium']),
      ProviderName: 'IPC',
      CompromisedEntity: r.pick(USERS),
      IPAddress: r.pick(HOME_IPS),
      Description: 'Baseline informational alert.',
    });
  }
  // Graph API traffic (baseline = overwhelmingly 2xx).
  const calls = ['/v1.0/users', '/v1.0/me', '/v1.0/groups', '/v1.0/applications', '/v1.0/devices'];
  for (let i = 0; i < 300; i++) {
    add('MicrosoftGraphActivityLogs', {
      TimeGenerated: new Date(now - r.int(5, 3 * 24 * 60) * MIN),
      RequestId: guid(r),
      AppId: `app-${r.int(1, 5)}`,
      ServicePrincipalId: `sp-${r.int(1, 5)}`,
      UserId: r() > 0.5 ? r.pick(USERS) : '',
      RequestMethod: 'GET',
      RequestUri: `https://graph.microsoft.com${r.pick(calls)}`,
      ResponseStatusCode: r() > 0.96 ? r.pick([429, 500]) : 200,
      IPAddress: r.pick(HOME_IPS),
    });
  }
  // Windows logon telemetry for four endpoints.
  const devices = [['dev-0001', 'Device1'], ['dev-0002', 'Device2'], ['dev-0003', 'Device3'], ['dev-0004', 'SRV-APP01']];
  let report = 5000;
  const failedPer = new Map(); // keep baseline failures to <=2 per device so an attack stands out
  for (let i = 0; i < 160; i++) {
    const [id, name] = r.pick(devices);
    const failed = r() > 0.8 && (failedPer.get(id) ?? 0) < 2;
    if (failed) failedPer.set(id, (failedPer.get(id) ?? 0) + 1);
    add('DeviceLogonEvents', {
      Timestamp: new Date(now - r.int(5, 6 * 24 * 60) * MIN),
      ReportId: report++,
      DeviceId: id,
      DeviceName: name,
      ActionType: failed ? 'LogonFailed' : 'LogonSuccess',
      LogonType: r.pick(['Interactive', 'Network', 'RemoteInteractive']),
      AccountName: r.pick(['alex.rivera', 'priya.shah', 'svc-backup']),
      RemoteIP: r.pick(HOME_IPS),
      InitiatingProcessCommandLine: r.pick(['svchost.exe -k netsvcs', 'winlogon.exe', 'lsass.exe']),
    });
  }
  return { nextReportId: report };
}

/** Helper for scenarios: push rows with a continuing ReportId. */
export function pushDeviceLogon(world, row) {
  const t = world.tables.get('DeviceLogonEvents');
  t.rows.push({ ReportId: world.counters.report++, ...row });
}
