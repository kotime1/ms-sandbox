// The simulated tenant. One World per learner session; it is plain data plus a few engine
// functions. Nothing here touches the network, the filesystem or child processes: the
// "environment" is entirely in memory, which is what makes the sandbox safe to run.

import { newTables, seedBaseline } from './tables.js';
import { getRole, roleAllows } from './rbac.js';
import { runQuery, KqlError } from './kql/engine.js';
import { SURFACES } from './tables.js';
import { rng, guid, randomToken } from '../core/util.js';

export const SUB = '00000000-0000-0000-0000-000000000000';
export const RG = `/subscriptions/${SUB}/resourceGroups/rg-sentinel`;
export const WS_ID = `${RG}/providers/Microsoft.OperationalInsights/workspaces/law-sentinel`;
export const VM1_ID = `/subscriptions/${SUB}/resourceGroups/rg-workloads/providers/Microsoft.Compute/virtualMachines/VM1`;
export const LEARNER = 'admin1@contoso.com';

const MAX = { assignments: 200, automationRules: 50, suppression: 50, detections: 50, runs: 200, incidents: 500, alerts: 1000 };

export function createWorld() {
  const now = Date.now();
  const tables = newTables();
  const { nextReportId } = seedBaseline(tables, now);
  const r = rng(77);
  return {
    id: randomToken(9),
    createdAt: now,
    r,
    tables,
    counters: { report: nextReportId, incident: 1040, alert: 1, run: 1, rule: 1 },
    log: [], // every learner action: { at, action, params, ok } -- the audit trail labs are graded on
    queries: [], // successful learner queries: { surface, text, columns, records, tables, ops } (server-side only)
    flags: Object.create(null),
    azure: {
      user: { name: LEARNER, role: 'Owner' },
      resources: [
        { id: VM1_ID, name: 'VM1', type: 'Microsoft.Compute/virtualMachines', rg: 'rg-workloads', location: 'eastus', state: 'Running', restarts: 0 },
        { id: WS_ID, name: 'law-sentinel', type: 'Microsoft.OperationalInsights/workspaces', rg: 'rg-sentinel', location: 'eastus' },
      ],
      assignments: [
        { id: guid(r), scope: `/subscriptions/${SUB}`, principalId: 'u-admin1', principalName: LEARNER, role: 'Owner', createdBy: 'system' },
      ],
    },
    sentinel: {
      workspace: 'law-sentinel',
      connectors: [
        { id: 'entra', name: 'Microsoft Entra ID', status: 'Connected', tables: ['SigninLogs', 'AuditLogs'] },
        { id: 'azact', name: 'Azure Activity', status: 'Connected', tables: ['AzureActivity'] },
        { id: 'xdr', name: 'Microsoft Defender XDR', status: 'Connected', tables: ['SecurityAlert', 'SecurityIncident'] },
        { id: 'graph', name: 'Microsoft Graph activity logs', status: 'Connected', tables: ['MicrosoftGraphActivityLogs'] },
        { id: 'ama', name: 'Windows Security Events via AMA', status: 'Not connected', tables: [] },
      ],
      analyticsRules: [
        { id: 'rule-nrt1', name: 'NRTRule1', kind: 'NRT', severity: 'High', enabled: true, tactics: ['Execution'], query: 'SecurityAlert\n| where AlertName has "Suspicious"' },
        { id: 'rule-sch1', name: 'Rule3 - Rare admin sign-in', kind: 'Scheduled', severity: 'Medium', enabled: true, tactics: ['InitialAccess'], query: 'SigninLogs\n| where ResultType == "0"\n| summarize count() by UserPrincipalName' },
        { id: 'rule-fusion', name: 'Advanced Multistage Attack Detection', kind: 'Fusion', severity: 'High', enabled: true, tactics: [], query: null },
        { id: 'rule-ml', name: 'Anomalous RDP Login Detection', kind: 'MLBehaviorAnalytics', severity: 'Medium', enabled: true, tactics: ['LateralMovement'], query: null },
      ],
      automationRules: [],
      incidents: [],
      playbooks: [], // ids of logic-app resources that are playbooks (see azure.resources[].playbook)
      runs: [],
    },
    defender: {
      devices: [
        { id: 'dev-0001', name: 'Device1', os: 'Windows 11', isolated: false, riskScore: 'Low' },
        { id: 'dev-0002', name: 'Device2', os: 'Windows 11', isolated: false, riskScore: 'Low' },
        { id: 'dev-0003', name: 'Device3', os: 'Windows 11', isolated: false, riskScore: 'Low' },
        { id: 'dev-0004', name: 'SRV-APP01', os: 'Windows Server 2022', isolated: false, riskScore: 'Low' },
      ],
      alerts: [],
      suppression: [],
      detections: [],
    },
  };
}

// ------------------------------------------------------------------ helpers

export const resource = (w, id) => w.azure.resources.find((x) => x.id === id) ?? null;
export const resourceByName = (w, name) => w.azure.resources.find((x) => x.name === name) ?? null;
export const device = (w, id) => w.defender.devices.find((d) => d.id === id) ?? null;

const covers = (scope, target) => target === scope || target.startsWith(`${scope}/`);

/** Is `principalId` allowed `action` on `target`, via any role assignment whose scope covers it? */
export function can(w, principalId, action, target) {
  return w.azure.assignments.some((a) => a.principalId === principalId && covers(a.scope, target) && roleAllows(a.role, action));
}

export function validRoleName(name) {
  return Boolean(getRole(name));
}

export function capCheck(arr, key) {
  if (arr.length >= MAX[key]) throw new SimError(`Sandbox limit reached (${MAX[key]} ${key}). Delete some first.`);
}

export class SimError extends Error {
  constructor(message, code = 'BadRequest') {
    super(message);
    this.name = 'SimError';
    this.code = code;
  }
}

// ------------------------------------------------------------------ querying

export function tablesFor(w, surface) {
  const allowed = SURFACES[surface];
  if (!allowed) throw new SimError('Unknown query surface');
  return new Map(allowed.map((n) => [n, w.tables.get(n)]));
}

export function query(w, surface, text) {
  try {
    return runQuery(text, { tables: tablesFor(w, surface), now: Date.now() });
  } catch (e) {
    if (e instanceof KqlError) throw new SimError(e.message, `Kql${e.kind}`);
    throw e;
  }
}

// ------------------------------------------------------------------ Sentinel engine

/** Create a Sentinel incident from an alert and run any matching automation rules. */
export function raiseSentinelIncident(w, { title, severity, ruleId, entities = [], description = '', alertRows = [] }) {
  capCheck(w.sentinel.incidents, 'incidents');
  const rule = w.sentinel.analyticsRules.find((x) => x.id === ruleId) ?? null;
  const inc = {
    id: `inc-${w.counters.incident}`,
    number: w.counters.incident++,
    title,
    severity,
    status: 'New',
    owner: null,
    ruleId: rule?.id ?? null,
    ruleName: rule?.name ?? null,
    createdAt: Date.now(),
    description,
    entities,
    comments: [],
    runs: [],
  };
  w.sentinel.incidents.unshift(inc);
  for (const row of alertRows) w.tables.get('SecurityAlert').rows.push({ TimeGenerated: new Date(), SystemAlertId: guid(w.r), ...row });
  w.tables.get('SecurityIncident').rows.push({ TimeGenerated: new Date(), IncidentNumber: inc.number, Title: title, Severity: severity, Status: 'New', Owner: '' });
  // Automation rules: evaluated in order; conditions are ANDed.
  for (const ar of [...w.sentinel.automationRules].filter((x) => x.enabled).sort((a, b) => a.order - b.order)) {
    if (ar.trigger !== 'incidentCreated') continue;
    if (ar.ruleIds.length && !ar.ruleIds.includes(inc.ruleId)) continue;
    for (const act of ar.actions) {
      if (act.type === 'runPlaybook') runPlaybook(w, { playbookId: act.playbookId, incident: inc, by: `automation:${ar.name}` });
      if (act.type === 'changeSeverity') inc.severity = act.value;
      if (act.type === 'assignOwner') inc.owner = act.value;
    }
  }
  return inc;
}

const AUTH_ERR = (principalName, action, scope) =>
  `AuthorizationFailed: The client '${principalName}' with object id '${principalName}' does not have authorization to perform action 'Microsoft.Compute/virtualMachines/${action === 'vm.restart' ? 'restart/action' : 'write'}' over scope '${scope}' or the scope is invalid.`;

/**
 * Execute a playbook (a Logic App with a Sentinel trigger) against an incident.
 * Returns the run record. Never throws for expected failures: they are the lesson.
 */
export function runPlaybook(w, { playbookId, incident, by }) {
  capCheck(w.sentinel.runs, 'runs');
  const res = resource(w, playbookId);
  const run = { id: `run-${w.counters.run++}`, playbookId, playbookName: res?.name ?? playbookId, incidentId: incident?.id ?? null, by, at: Date.now(), status: 'Succeeded', steps: [], error: null };
  w.sentinel.runs.unshift(run);
  incident?.runs.unshift(run.id);
  const fail = (step, msg) => { step.status = 'Failed'; step.message = msg; run.status = 'Failed'; run.error = msg; };

  if (!res?.playbook) { run.status = 'Failed'; run.error = 'Playbook not found'; return run; }
  const pb = res.playbook;
  const trig = { name: 'Trigger', detail: pb.trigger === 'incident' ? 'When Microsoft Sentinel incident creation rule was triggered' : 'When a response to a Microsoft Sentinel alert is triggered', status: 'Succeeded' };
  run.steps.push(trig);
  if (pb.trigger !== 'incident') {
    fail(trig, 'TriggerInputSchemaMismatch: This playbook uses the alert trigger, so it cannot receive an incident object.');
    return run;
  }
  for (const act of pb.actions) {
    const step = { name: act.label, detail: act.type, status: 'Succeeded', message: '' };
    run.steps.push(step);
    if (act.type === 'incident.comment') {
      incident?.comments.push({ at: Date.now(), by: res.name, text: act.text ?? 'Playbook ran.' });
      continue;
    }
    const vm = resource(w, act.target);
    if (!vm) { fail(step, 'ResourceNotFound: target resource does not exist'); break; }
    if (!res.identity?.systemAssigned) {
      fail(step, 'ManagedIdentityNotEnabled: The Logic App has no managed identity, so the HTTP/ARM connector has nothing to authenticate with.');
      break;
    }
    if (!can(w, res.identity.principalId, act.type, vm.id)) {
      fail(step, AUTH_ERR(res.name, act.type, vm.id));
      break;
    }
    if (act.type === 'vm.restart') { vm.restarts++; vm.state = 'Running'; step.message = `${vm.name} restarted`; }
  }
  w.flags.lastRun = run.id;
  return run;
}

// ------------------------------------------------------------------ Defender engine

export const matchesSuppression = (rule, alert) => {
  if (rule.alertTitle && rule.alertTitle !== alert.title) return false;
  if (rule.ioc && alert.evidence?.[rule.ioc.type] !== rule.ioc.value) return false;
  if (rule.scope === 'device' && rule.deviceId !== alert.deviceId) return false;
  return true;
};

/** Raise a Defender alert; suppression rules are applied at creation time. */
export function raiseDefenderAlert(w, { title, severity = 'Medium', deviceId, evidence = {}, source = 'MDE' }) {
  capCheck(w.defender.alerts, 'alerts');
  const alert = { id: `da-${w.counters.alert++}`, title, severity, deviceId, deviceName: device(w, deviceId)?.name ?? '?', evidence, source, status: 'New', createdAt: Date.now(), suppressedBy: null };
  const rule = w.defender.suppression.find((s) => matchesSuppression(s, alert));
  if (rule) {
    alert.suppressedBy = rule.id;
    alert.status = rule.action === 'resolve' ? 'Resolved' : 'Hidden';
  }
  w.defender.alerts.unshift(alert);
  return alert;
}

export const REQUIRED_DETECTION_COLUMNS = ['Timestamp', 'ReportId'];
export const ENTITY_COLUMNS = ['DeviceId', 'DeviceName', 'RemoteDeviceName', 'RecipientEmailAddress', 'SenderFromAddress', 'SenderMailFromAddress', 'RecipientObjectId', 'AccountObjectId', 'AccountSid', 'AccountUpn', 'InitiatingProcessAccountSid', 'InitiatingProcessAccountUpn', 'InitiatingProcessAccountObjectId'];

/** Run every custom detection now (the real service runs them on a schedule; see docs/ARCHITECTURE.md). */
export function runDetections(w) {
  const fired = [];
  for (const d of w.defender.detections.filter((x) => x.enabled)) {
    let res;
    try { res = runQuery(d.query, { tables: tablesFor(w, 'defender'), now: Date.now() }); } catch { continue; }
    const seen = d.seen ?? (d.seen = new Set());
    for (const rec of res.records) {
      const key = `${rec.ReportId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const devId = rec.DeviceId ?? w.defender.devices.find((x) => x.name === rec.DeviceName)?.id;
      const alert = raiseDefenderAlert(w, { title: d.alertTitle, severity: d.severity, deviceId: devId, source: 'Custom detection', evidence: { rule: d.name } });
      fired.push(alert);
      if (d.actions.includes('isolateDevice') && devId && device(w, devId)) {
        device(w, devId).isolated = true;
        device(w, devId).riskScore = 'High';
        alert.actionTaken = 'Device isolated (full)';
      }
    }
  }
  return fired;
}
