// Attack-agent scenario library.
//
// A scenario is a function that WRITES SYNTHETIC RECORDS into the in-memory world:
// telemetry rows, alerts and incidents. It generates no network traffic, runs no code and
// touches no real systems. All addresses are RFC 5737 documentation ranges.

import { raiseSentinelIncident, raiseDefenderAlert, runDetections, device } from '../sim/world.js';
import { pushDeviceLogon } from '../sim/tables.js';
import { guid } from '../core/util.js';
import { EXTRA_SCENARIOS } from './scenarios-extra.js';

export const ATTACKER_IP = '203.0.113.66';
const MIN = 60_000;
const ago = (m) => new Date(Date.now() - m * MIN);

export const SCENARIOS = {
  'vm-compromise-incident': {
    title: 'Suspicious activity on VM1 (Sentinel incident)',
    mitre: ['Execution', 'Persistence'],
    run(w) {
      const inc = raiseSentinelIncident(w, {
        title: 'Suspicious process creation on VM1',
        severity: 'High',
        ruleId: 'rule-nrt1',
        entities: [{ type: 'Host', name: 'VM1' }, { type: 'Account', name: 'svc-deploy' }],
        description: 'An NRT rule matched a suspicious command line on VM1. Containment playbook is available.',
        alertRows: [{ AlertName: 'Suspicious process creation', AlertSeverity: 'High', ProviderName: 'ASC', CompromisedEntity: 'VM1', IPAddress: ATTACKER_IP, Description: 'Encoded PowerShell launched by an unusual parent.' }],
      });
      return `Raised Sentinel incident #${inc.number} against VM1`;
    },
  },

  'app1-clears-logs': {
    title: 'App1 clears event logs (benign) + real PowerShell alert',
    mitre: ['DefenseEvasion'],
    run(w) {
      const a = raiseDefenderAlert(w, { title: 'Security event log was cleared', severity: 'Medium', deviceId: 'dev-0004', evidence: { process: 'App1.exe' } });
      const b = raiseDefenderAlert(w, { title: 'Suspicious PowerShell command line', severity: 'High', deviceId: 'dev-0001', evidence: { process: 'powershell.exe' } });
      const c = raiseDefenderAlert(w, { title: 'Security event log was cleared', severity: 'Medium', deviceId: 'dev-0002', evidence: { process: 'wevtutil.exe' } });
      return `Raised ${[a, b, c].length} Defender alerts (${[a, b, c].filter((x) => x.suppressedBy).length} suppressed)`;
    },
  },

  'bruteforce-device': {
    title: 'Password spray / brute force against Device2',
    mitre: ['CredentialAccess'],
    run(w) {
      for (let i = 0; i < 14; i++) {
        pushDeviceLogon(w, { Timestamp: ago(30 - i), DeviceId: 'dev-0002', DeviceName: 'Device2', ActionType: 'LogonFailed', LogonType: 'Network', AccountName: 'administrator', RemoteIP: '198.51.100.23', InitiatingProcessCommandLine: 'net use \\\\Device2\\c$ /user:administrator' });
      }
      const fired = runDetections(w);
      return fired.length ? `Telemetry written; ${fired.length} custom detection alert(s) fired` : 'Telemetry written; no custom detection matched yet';
    },
  },

  'identity-and-graph-abuse': {
    title: 'Compromised account, rule tampering and Graph enumeration',
    mitre: ['InitialAccess', 'PrivilegeEscalation', 'Discovery', 'DefenseEvasion'],
    run(w) {
      if (w.flags.identityAbuseSeeded) return 'Already seeded';
      w.flags.identityAbuseSeeded = true;
      const S = w.tables.get('SigninLogs').rows;
      const U = 'mei.tan@contoso.com';
      for (let i = 0; i < 6; i++) S.push({ TimeGenerated: ago(95 - i * 2), UserPrincipalName: U, IPAddress: ATTACKER_IP, Location: 'XX', AppDisplayName: 'Azure Portal', ResultType: '50126', ResultDescription: 'Invalid username or password', ConditionalAccessStatus: 'failure' });
      S.push({ TimeGenerated: ago(80), UserPrincipalName: U, IPAddress: ATTACKER_IP, Location: 'XX', AppDisplayName: 'Azure Portal', ResultType: '0', ResultDescription: 'Success', ConditionalAccessStatus: 'notApplied' });
      w.tables.get('AuditLogs').rows.push({ TimeGenerated: ago(72), OperationName: 'Add member to role', Category: 'RoleManagement', InitiatedBy: U, TargetUser: U, IPAddress: ATTACKER_IP, Result: 'success' });
      w.tables.get('SecurityAlert').rows.push({ TimeGenerated: ago(78), SystemAlertId: guid(w.r), AlertName: 'Unfamiliar sign-in properties', AlertSeverity: 'Medium', ProviderName: 'IPC', CompromisedEntity: U, IPAddress: ATTACKER_IP, Description: 'Sign-in from an unfamiliar location.' });

      // Analytics rule 1111... edited. A failed attempt precedes the successful edit by a different caller.
      const rid = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-sentinel/providers/Microsoft.OperationalInsights/workspaces/law-sentinel/providers/Microsoft.SecurityInsights/alertRules/11111111-1111-1111-1111-111111111111';
      const A = w.tables.get('AzureActivity').rows;
      const edit = (caller, status, m) => A.push({ TimeGenerated: ago(m), OperationNameValue: 'MICROSOFT.SECURITYINSIGHTS/ALERTRULES/WRITE', ActivityStatusValue: status, Caller: caller, ResourceGroup: 'RG-SENTINEL', CategoryValue: 'Administrative', Properties: JSON.stringify({ resource: rid }) });
      edit('chris.novak@contoso.com', 'Failed', 140);
      edit('sam.okafor@contoso.com', 'Succeeded', 65);

      // Graph: one app hammers /groups with 401/403, a second does so less.
      const G = w.tables.get('MicrosoftGraphActivityLogs').rows;
      const call = (app, code, m) => G.push({ TimeGenerated: ago(m), RequestId: guid(w.r), AppId: app, ServicePrincipalId: app.replace('app', 'sp'), UserId: '', RequestMethod: 'GET', RequestUri: 'https://graph.microsoft.com/v1.0/groups', ResponseStatusCode: code, IPAddress: ATTACKER_IP });
      for (let i = 0; i < 25; i++) call('app-9', i % 3 ? 403 : 401, 60 + i);
      for (let i = 0; i < 8; i++) call('app-3', 403, 200 + i * 10);
      for (let i = 0; i < 30; i++) call('app-5', 200, 50 + i); // noisy but successful: must not be counted
      return 'Seeded sign-in, audit, alert, Azure Activity and Graph telemetry';
    },
  },
};

Object.assign(SCENARIOS, EXTRA_SCENARIOS);

export function listScenarios() {
  return Object.entries(SCENARIOS).map(([id, s]) => ({ id, title: s.title, mitre: s.mitre }));
}

export function runScenario(w, id) {
  const s = Object.hasOwn(SCENARIOS, id) ? SCENARIOS[id] : null;
  if (!s) throw new Error(`unknown scenario ${id}`);
  return s.run(w);
}

export { device };
