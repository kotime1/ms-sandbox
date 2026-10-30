// Read-only views of the world for the front-end. Each view is an explicit whitelist of
// fields: raw world objects (which hold RNG state, seen-sets, check functions...) never leave
// the server.

import { listScopes, listPrincipals, ROLE_CATALOG } from '../sim/actions.js';
import { LEARNER, visibleTables, tableColumns } from '../sim/world.js';
import { tableSource } from '../sim/tables.js';

const iso = (ms) => new Date(ms).toISOString();

const resources = (w) => ({
  resources: w.azure.resources.map((r) => ({
    id: r.id, name: r.name, type: r.type, rg: r.rg, location: r.location, state: r.state ?? null,
    isPlaybook: Boolean(r.playbook),
    trigger: r.playbook?.trigger ?? null,
    identityOn: r.playbook ? Boolean(r.identity?.systemAssigned) : null,
    principalId: r.playbook ? r.identity?.principalId ?? null : null,
    actions: r.playbook ? r.playbook.actions.map((a) => a.label) : null,
  })),
});

const iam = (w) => ({
  user: LEARNER,
  scopes: listScopes(w),
  principals: listPrincipals(w),
  roles: ROLE_CATALOG,
  assignments: w.azure.assignments.map((a) => ({ id: a.id, scope: a.scope, principalId: a.principalId, principalName: a.principalName, role: a.role, locked: a.createdBy === 'system' })),
});

const sentinelIncidents = (w) => ({
  incidents: w.sentinel.incidents.map((i) => ({
    id: i.id, number: i.number, title: i.title, severity: i.severity, status: i.status, owner: i.owner, rule: i.ruleName,
    createdAt: iso(i.createdAt), description: i.description, entities: i.entities, comments: i.comments.map((c) => ({ ...c, at: iso(c.at) })),
    runs: w.sentinel.runs.filter((r) => r.incidentId === i.id).map(runView),
  })),
  playbooks: w.azure.resources.filter((r) => r.playbook).map((r) => ({ id: r.id, name: r.name, trigger: r.playbook.trigger })),
});

const runView = (r) => ({ id: r.id, playbook: r.playbookName, by: r.by, at: iso(r.at), status: r.status, error: r.error, steps: r.steps.map((s) => ({ name: s.name, detail: s.detail, status: s.status, message: s.message ?? '' })) });

const sentinelConfig = (w) => ({
  connectors: w.sentinel.connectors,
  analyticsRules: w.sentinel.analyticsRules.map((r) => ({ id: r.id, name: r.name, kind: r.kind, severity: r.severity, enabled: r.enabled, tactics: r.tactics, query: r.query })),
  automationRules: w.sentinel.automationRules.map((a) => ({
    id: a.id, name: a.name, order: a.order, enabled: a.enabled, trigger: a.trigger,
    rules: a.ruleIds.map((id) => w.sentinel.analyticsRules.find((r) => r.id === id)?.name ?? id),
    actions: a.actions.map((x) => ({ type: x.type, playbook: w.azure.resources.find((r) => r.id === x.playbookId)?.name ?? null })),
  })),
  playbooks: w.azure.resources.filter((r) => r.playbook).map((r) => ({ id: r.id, name: r.name, trigger: r.playbook.trigger })),
});

const defender = (w) => ({
  alerts: w.defender.alerts.map((a) => ({ id: a.id, title: a.title, severity: a.severity, status: a.status, device: a.deviceName, process: a.evidence?.process ?? null, source: a.source, createdAt: iso(a.createdAt), suppressed: Boolean(a.suppressedBy), action: a.actionTaken ?? null })),
  devices: w.defender.devices.map((d) => ({ id: d.id, name: d.name, os: d.os, isolated: d.isolated, risk: d.riskScore, onboarding: d.onboarding, groups: d.groups ?? [] })),
  suppression: w.defender.suppression.map((s) => ({ id: s.id, alertTitle: s.alertTitle, ioc: s.ioc, scope: s.scope, device: s.deviceId, action: s.action })),
  detections: w.defender.detections.map((d) => ({ id: d.id, name: d.name, alertTitle: d.alertTitle, severity: d.severity, query: d.query, actions: d.actions, enabled: d.enabled })),
});

// Indicator state is derived, never stored: an indicator with no valid target is Inactive.
const indicatorStatus = (i) => (i.targets.length ? 'Active' : 'Inactive');

const fileView = (f) => ({
  sha256: f.sha256, name: f.name, blocked: f.blocked, blockedBy: f.blocked ? f.blockedBy ?? null : null,
  // Where it is blocked, by device. The verdict (clean / malicious) is NOT here: deep analysis reveals that.
  perDevice: f.perDevice ?? {},
  // The verdict and sandbox behaviours are what deep analysis REVEALS, so they are only sent once it has run.
  analysis: f.deepAnalysis ? { status: f.deepAnalysis.status, verdict: f.deepAnalysis.verdict, behaviors: f.deepAnalysis.behaviors } : null,
});

const defenderFiles = (w) => ({
  files: w.defender.files.map(fileView),
  allowBlock: w.defender.allowBlock.map((e) => ({ id: e.id, kind: e.kind, value: e.value, action: e.action, expiry: e.expiry })),
  indicators: w.defender.indicators.map((i) => ({ id: i.id, type: i.type, value: i.value, action: i.action, targets: i.targets, status: indicatorStatus(i) })),
  deviceGroups: w.defender.deviceGroups,
  advancedFeatures: { ...w.defender.advancedFeatures },
});

const deviceDetail = (w, id) => {
  const d = w.defender.devices.find((x) => x.id === id);
  if (!d) return null;
  return {
    device: { id: d.id, name: d.name, os: d.os, isolated: d.isolated, risk: d.riskScore, onboarding: d.onboarding },
    timeline: (w.defender.timelines[id] ?? []).map((e) => ({ id: e.id, at: iso(e.at), kind: e.kind, text: e.text, flagged: e.flagged })).sort((a, b) => (a.at < b.at ? -1 : 1)),
    packages: w.defender.packages.filter((p) => p.deviceId === id).map((p) => ({ id: p.id, at: iso(p.at), contents: p.contents })),
    alerts: w.defender.alerts.filter((a) => a.deviceId === id).map((a) => ({ id: a.id, title: a.title, severity: a.severity })),
  };
};

const sentinelHunting = (w) => {
  const h = w.sentinel.hunting;
  return {
    queries: h.queries.map((q) => ({ id: q.id, name: q.name, tactics: q.tactics, query: q.query, favorite: h.favorites.includes(q.id), lastRun: q.lastRun ? { at: iso(q.lastRun.at), count: q.lastRun.count ?? null, error: q.lastRun.error ?? null } : null })),
  };
};

const sentinelSummary = (w) => ({
  rules: w.sentinel.summaryRules.map((r) => ({ id: r.id, name: r.name, source: r.source, destination: r.destination, binMinutes: r.binMinutes, rowsWritten: r.rowsWritten, query: r.query })),
  sources: [...w.enabledTables].filter((n) => w.tables.has(n) && !w.sentinel.summaryRules.some((r) => r.destination === n)),
});

// One schema for the single Advanced hunting page, grouped by where the table comes from.
const schema = (w) => ({
  tables: visibleTables(w).map((n) => ({
    name: n,
    source: tableSource(n),
    columns: tableColumns(w, n).map((c) => ({ name: c.name, type: c.type })),
  })),
});

export const VIEWS = {
  resources,
  iam,
  'sentinel-incidents': sentinelIncidents,
  'sentinel-config': sentinelConfig,
  defender,
  'defender-files': defenderFiles,
  'sentinel-hunting': sentinelHunting,
  'sentinel-summary': sentinelSummary,
  'schema-sentinel': (w) => schema(w),
  'schema-defender': (w) => schema(w),
  schema: (w) => schema(w),
};

export function getView(w, name) {
  // Parameterised views look like "device/dev-0201".
  if (typeof name === 'string' && name.startsWith('device/')) {
    const id = name.slice('device/'.length);
    return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(id) ? deviceDetail(w, id) : null;
  }
  return typeof name === 'string' && Object.hasOwn(VIEWS, name) ? VIEWS[name](w) : null;
}
