// Read-only views of the world for the front-end. Each view is an explicit whitelist of
// fields: raw world objects (which hold RNG state, seen-sets, check functions...) never leave
// the server.

import { listScopes, listPrincipals, ROLE_CATALOG } from '../sim/actions.js';
import { SCHEMAS, SURFACES } from '../sim/tables.js';
import { LEARNER } from '../sim/world.js';

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
  devices: w.defender.devices.map((d) => ({ id: d.id, name: d.name, os: d.os, isolated: d.isolated, risk: d.riskScore })),
  suppression: w.defender.suppression.map((s) => ({ id: s.id, alertTitle: s.alertTitle, ioc: s.ioc, scope: s.scope, device: s.deviceId, action: s.action })),
  detections: w.defender.detections.map((d) => ({ id: d.id, name: d.name, alertTitle: d.alertTitle, severity: d.severity, query: d.query, actions: d.actions, enabled: d.enabled })),
});

const schema = (w, surface) => ({
  tables: (SURFACES[surface] ?? []).map((n) => ({ name: n, columns: SCHEMAS[n].map((c) => ({ name: c.name, type: c.type })) })),
});

export const VIEWS = {
  resources,
  iam,
  'sentinel-incidents': sentinelIncidents,
  'sentinel-config': sentinelConfig,
  defender,
  'schema-sentinel': (w) => schema(w, 'sentinel'),
  'schema-defender': (w) => schema(w, 'defender'),
};

export function getView(w, name) {
  return typeof name === 'string' && Object.hasOwn(VIEWS, name) ? VIEWS[name](w) : null;
}
