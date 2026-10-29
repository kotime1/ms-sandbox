// Iteration 2 scenarios. Same rules as scenarios.js: synthetic records only, no I/O,
// RFC 5737 addresses, contoso.com. Data is deterministic because labs check it for exact answers.

import { raiseSentinelIncident, enableTables, device } from '../sim/world.js';
import { guid } from '../core/util.js';

const MIN = 60_000;
const ago = (m) => new Date(Date.now() - m * MIN);
const sha = (n) => n.toString(16).padStart(2, '0').repeat(32); // 64 hex chars, readable in the UI

export const LOB_HASH = sha(0xa1);
export const MALWARE_HASH = sha(0xb2);
export const UNKNOWN_HASH = sha(0xc3);
export const TOKEN_UTI = '8c1b2a2e-6b5f-4a5d-9b3b-2aa5c0e9f4aa';

export const EXTRA_SCENARIOS = {
  // Q1/Q5: an automated remediation rule blocked LOB1's file. A genuinely bad file is blocked too.
  'lob-file-blocked': {
    title: 'Automated remediation blocks LOB1 (and real malware)',
    mitre: ['DefenseEvasion'],
    run(w) {
      w.defender.files.push(
        { sha256: LOB_HASH, name: 'lob1-sync.exe', blocked: true, blockedBy: 'Automated remediation', verdict: 'Clean', behaviors: ['Reads LOB1 config', 'Connects to internal ERP'] },
        { sha256: MALWARE_HASH, name: 'invoice_viewer.exe', blocked: true, blockedBy: 'Automated remediation', verdict: 'Malicious', behaviors: ['Drops payload to %TEMP%', 'Disables Defender'] },
      );
      return 'LOB1 file and a malicious file were blocked by automated remediation';
    },
  },

  // Q6: devices appear in the portal but have not been approved, so they report no alerts.
  'devices-pending-approval': {
    title: 'New devices waiting for approval',
    mitre: [],
    run(w) {
      for (const [id, name] of [['dev-0101', 'LT-NEW-01'], ['dev-0102', 'LT-NEW-02'], ['dev-0103', 'LT-NEW-03']]) {
        if (!device(w, id)) w.defender.devices.push({ id, name, os: 'Windows 11', isolated: false, riskScore: 'Low', onboarding: 'Pending approval' });
      }
      return 'Three newly onboarded devices are waiting for approval';
    },
  },

  // Q10: an incident-trigger playbook that Sentinel is not yet allowed to attach to an automation rule.
  'playbook-picker': {
    title: 'Incident ready; playbook cannot be selected',
    mitre: [],
    run(w) {
      raiseSentinelIncident(w, {
        title: 'Impossible travel followed by mailbox rule creation', severity: 'Medium', ruleId: 'rule-sch1',
        entities: [{ type: 'Account', name: 'mei.tan@contoso.com' }, { type: 'IP', name: '203.0.113.66' }],
        description: 'Scheduled rule matched an unusual sign-in sequence.',
      });
      return 'Raised an incident for the playbook-picker lab';
    },
  },

  // Q19/Q21: which incidents can actually be investigated (have entities)?
  'rule-types-incidents': {
    title: 'Incidents from four rule types',
    mitre: [],
    run(w) {
      const mk = (title, ruleId, entities) => raiseSentinelIncident(w, { title, severity: 'Medium', ruleId, entities, description: 'Generated for the entity-mapping lab.' });
      mk('Rare admin sign-in (scheduled)', 'rule-sch1', [{ type: 'Account', name: 'sam.okafor@contoso.com' }]);
      mk('Suspicious process (NRT)', 'rule-nrt1', [{ type: 'Host', name: 'VM1' }]);
      mk('Multistage attack (fusion)', 'rule-fusion', []);
      mk('Microsoft security alert (incident creation rule)', 'rule-msft', []);
      return 'Raised four incidents, one per rule type';
    },
  },

  // Q44: UEBA behaviours (BehaviorInfo + BehaviorEntities) in Advanced hunting.
  'ueba-behaviors': {
    title: 'UEBA behaviours observed',
    mitre: ['InitialAccess', 'Discovery'],
    run(w) {
      enableTables(w, 'BehaviorInfo', 'BehaviorEntities');
      const info = w.tables.get('BehaviorInfo').rows;
      const ent = w.tables.get('BehaviorEntities').rows;
      const rows = [
        ['b-001', 'Unusual number of failed sign-ins', 'Many failed sign-ins before one success.', 'InitialAccess', 'mei.tan@contoso.com'],
        ['b-002', 'Rare application consent', 'First time this user consented to an app.', 'PrivilegeEscalation', 'chris.novak@contoso.com'],
        ['b-003', 'Sign-in from a new country', 'Location not seen in the past 30 days.', 'InitialAccess', 'mei.tan@contoso.com'],
        ['b-004', 'Mass file download', 'Downloaded 400 files in ten minutes.', 'Collection', 'dana.ortiz@contoso.com'],
      ];
      rows.forEach(([id, title, desc, cat, upn], i) => {
        info.push({ Timestamp: ago(300 - i * 40), BehaviorId: id, Title: title, Description: desc, Categories: cat });
        ent.push({ Timestamp: ago(300 - i * 40), BehaviorId: id, EntityType: 'User', AccountUpn: upn, RemoteIP: '', DeviceName: '' });
        ent.push({ Timestamp: ago(300 - i * 40), BehaviorId: id, EntityType: 'IP', AccountUpn: '', RemoteIP: i % 2 ? '198.51.100.23' : '203.0.113.66', DeviceName: '' });
      });
      return 'Added 4 behaviours with their entities';
    },
  },

  // Q46: saved hunting queries; favorites run when the Hunting blade opens.
  'hunting-queries': {
    title: 'Saved hunting queries',
    mitre: [],
    run(w) {
      w.sentinel.hunting.queries.push(
        { id: 'hq-rareip', name: 'Rare sign-in IPs', tactics: ['InitialAccess'], query: 'SigninLogs | where ResultType == "0" | summarize n=count() by IPAddress | where n < 3' },
        { id: 'hq-mfa', name: 'Failed sign-ins by user', tactics: ['CredentialAccess'], query: 'SigninLogs | where ResultType != "0" | summarize Failures=count() by UserPrincipalName | sort by Failures desc' },
        { id: 'hq-roles', name: 'Role changes in the last 7 days', tactics: ['PrivilegeEscalation'], query: 'AuditLogs | where OperationName has "role"' },
      );
      return 'Added three saved hunting queries';
    },
  },

  // Q49/Q50: a high-volume table that times out when aggregated directly.
  'high-volume-network': {
    title: 'High-volume firewall/session logs',
    mitre: [],
    run(w) {
      // Only the raw table exists. The summary table is created by the learner's summary rule, so the schema
      // browser does not give away the answer.
      enableTables(w, 'NetworkSessions_CL');
      const raw = w.tables.get('NetworkSessions_CL');
      raw.scanCost = 1500; // every row costs 1500 "steps" to aggregate; see KQL engine
      const ips = ['192.0.2.10', '192.0.2.24', '198.51.100.23', '203.0.113.66'];
      const ports = [80, 443, 445, 3389, 22];
      for (let i = 0; i < 4000; i++) {
        raw.rows.push({ TimeGenerated: ago(1 + (i % (7 * 24 * 60))), SourceIP: ips[i % 4], DestinationIP: `192.0.2.${1 + (i % 200)}`, DestinationPort: ports[(i * 7) % 5], Bytes: 500 + (i * 37) % 9000, Action: i % 11 ? 'Allow' : 'Deny' });
      }
      return 'Ingesting 4,000 sessions into NetworkSessions_CL (too large to aggregate interactively)';
    },
  },

  // Q29/Q30/Q31/Q34: one device, one timeline, a blocked infection, a suspicious PowerShell alert.
  'device-investigation': {
    title: 'Investigate WS-23',
    mitre: ['Execution', 'CommandAndControl'],
    run(w) {
      if (!device(w, 'dev-0201')) w.defender.devices.push({ id: 'dev-0201', name: 'WS-23', os: 'Windows 11', isolated: false, riskScore: 'Medium', onboarding: 'Approved' });
      w.defender.timelines['dev-0201'] = [
        ['t01', 600, 'Sign-in', 'Interactive logon by priya.shah'],
        ['t02', 420, 'Process', 'chrome.exe started'],
        ['t03', 300, 'File', 'invoice_viewer.exe downloaded (blocked)'],
        ['t04', 240, 'Process', 'powershell.exe -enc JABz... launched by WINWORD.EXE'],
        ['t05', 235, 'Network', 'powershell.exe connected to 203.0.113.66:443'],
        ['t06', 120, 'Registry', 'Run key added by powershell.exe'],
        ['t07', 30, 'Process', 'notepad.exe started'],
      ].map(([id, m, kind, text]) => ({ id, at: Date.now() - m * MIN, kind, text, flagged: false }));
      w.defender.files.push({ sha256: UNKNOWN_HASH, name: 'update.ps1', blocked: false, verdict: 'Suspicious', behaviors: ['Obfuscated PowerShell', 'Contacts 203.0.113.66'] });

      // A mixed fleet reporting remote-activity events. Android devices are onboarded but, like the real
      // DeviceEvents table, produce no rows, so a scoping query must not expect them.
      enableTables(w, 'DeviceEvents');
      const E = w.tables.get('DeviceEvents').rows;
      const fleet = [['dev-0201', 'WS-23', 'Windows11'], ['dev-0301', 'LT-WIN-ENT', 'Windows11'], ['dev-0302', 'LT-WIN-PRO', 'Windows11'], ['dev-0304', 'MAC-DESIGN', 'macOS']];
      let rid = 9000;
      for (const [id, name, os] of fleet) {
        for (let i = 0; i < 3; i++) E.push({ Timestamp: ago(50 + i * 9), ReportId: rid++, DeviceId: id, DeviceName: name, OSPlatform: os, ActionType: i === 0 ? 'RemoteDesktopConnection' : i === 1 ? 'RemoteCreateThread' : 'ProcessCreated', InitiatingProcessFileName: i === 2 ? 'cmd.exe' : 'mstsc.exe', InitiatingProcessCommandLine: 'mstsc.exe /v:SRV-APP01', InitiatingProcessAccountUpn: 'priya.shah@contoso.com' });
      }
      // The Android phone is onboarded (it shows in the device list) but contributes nothing to DeviceEvents.
      if (!device(w, 'dev-0303')) w.defender.devices.push({ id: 'dev-0303', name: 'PHONE-ANDROID', os: 'Android', isolated: false, riskScore: 'Low', onboarding: 'Approved' });
      return 'Seeded WS-23 with a timeline, an unfamiliar file and a mixed fleet in DeviceEvents';
    },
  },

  // Q37: an interactive sign-in with a token id, and Graph calls that used that token.
  'token-trail': {
    title: 'One token, many Graph calls',
    mitre: ['CredentialAccess', 'Collection'],
    run(w) {
      if (!w.tables.get('MicrosoftGraphActivityLogs').columns.some((c) => c.name === 'SignInActivityId')) {
        w.tables.get('MicrosoftGraphActivityLogs').columns.push({ name: 'SignInActivityId', type: 'string' });
      }
      if (!w.tables.get('SigninLogs').columns.some((c) => c.name === 'UniqueTokenIdentifier')) {
        w.tables.get('SigninLogs').columns.push({ name: 'UniqueTokenIdentifier', type: 'string' });
      }
      w.tables.get('SigninLogs').rows.push({ TimeGenerated: ago(180), UserPrincipalName: 'user1@contoso.com', IPAddress: '203.0.113.66', Location: 'XX', AppDisplayName: 'Microsoft Graph PowerShell', ResultType: '0', ResultDescription: 'Success', ConditionalAccessStatus: 'notApplied', UniqueTokenIdentifier: TOKEN_UTI });
      const G = w.tables.get('MicrosoftGraphActivityLogs').rows;
      const uris = ['/v1.0/users', '/v1.0/groups', '/v1.0/me/messages', '/v1.0/me/drive/root/children', '/v1.0/users', '/v1.0/me/messages'];
      uris.forEach((u, i) => G.push({ TimeGenerated: ago(170 - i * 5), RequestId: guid(w.r), AppId: 'app-7', ServicePrincipalId: 'sp-7', UserId: 'user1@contoso.com', RequestMethod: 'GET', RequestUri: `https://graph.microsoft.com${u}`, ResponseStatusCode: 200, IPAddress: '203.0.113.66', SignInActivityId: TOKEN_UTI }));
      // Unrelated calls by the same user from another token, to make a user-name filter wrong.
      for (let i = 0; i < 4; i++) G.push({ TimeGenerated: ago(900 - i * 10), RequestId: guid(w.r), AppId: 'app-2', ServicePrincipalId: 'sp-2', UserId: 'user1@contoso.com', RequestMethod: 'GET', RequestUri: 'https://graph.microsoft.com/v1.0/me', ResponseStatusCode: 200, IPAddress: '192.0.2.10', SignInActivityId: 'aaaaaaaa-0000-4000-8000-000000000009' });
      return 'Seeded a suspicious sign-in and the Graph calls made with its token';
    },
  },
};
