// Read-only views of the world for the front-end. Each view is an explicit whitelist of
// fields: raw world objects (which hold RNG state, seen-sets, check functions...) never leave
// the server.

import { listScopes, listPrincipals, ROLE_CATALOG } from '../sim/actions.js';
import { LEARNER, visibleTables, tableColumns, query } from '../sim/world.js';
import { tableSource } from '../sim/tables.js';
import { FREQUENCIES } from '../sim/detections.js';
import { TRIGGERS, PROPERTIES, OPERATOR_LABELS, conditionsFor, nextOrder } from '../sim/automation.js';
import { asiCanRun } from '../sim/world.js';
import { KINDS, SEVERITIES, MIN_MINUTES, NRT_FIXED, describeKind } from '../sim/analytics.js';
import { CAPABILITIES, ASR_RULES, MODES, PLATFORMS } from '../sim/security-policies.js';
import { TEMPLATES } from '../sim/workbooks.js';
import { CATALOGUE, COLUMN_TYPES } from '../sim/ingestion.js';
import { RECORD_TYPES, canSearchAudit } from '../sim/audit.js';
import { canManageSecuritySettings, isGlobalAdmin, SEVERITIES as ALERT_SEVERITIES } from '../sim/notifications.js';

const iso = (ms) => new Date(ms).toISOString();

function actionSummary(x, w) {
  switch (x.type) {
    case 'assignOwner': return `Assign owner: ${x.owner}`;
    case 'changeStatus': return x.status === 'Closed' ? `Change status: Closed (${x.classification})` : `Change status: ${x.status}`;
    case 'changeSeverity': return `Change severity: ${x.severity}`;
    case 'addTags': return `Add tags: ${(x.tags ?? []).join(', ')}`;
    case 'runPlaybook': return `Run playbook: ${w.azure.resources.find((r) => r.id === x.playbookId)?.name ?? x.playbookId}`;
    default: return x.type;
  }
}

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
  analyticsRules: w.sentinel.analyticsRules.map((r) => ({ id: r.id, name: r.name, kind: r.kind, severity: r.severity, enabled: r.enabled, tactics: r.tactics, query: r.query, schedule: r.schedule ?? null, entityMapping: r.entityMapping !== false && Boolean(r.query) })),
  analyticsMeta: { kinds: KINDS.map((k) => ({ id: k, label: k === 'NRT' ? 'NRT query rule' : 'Scheduled query rule', summary: describeKind(k) })), severities: SEVERITIES, min: MIN_MINUTES, nrt: NRT_FIXED },
  automationRules: [...w.sentinel.automationRules].sort((a, b) => a.trigger.localeCompare(b.trigger) || a.order - b.order).map((a) => ({
    id: a.id, name: a.name, order: a.order, enabled: a.enabled && !(a.expiresAt && Date.now() >= a.expiresAt), expired: Boolean(a.expiresAt && Date.now() >= a.expiresAt),
    trigger: a.trigger, triggerLabel: TRIGGERS[a.trigger],
    conditions: a.conditions, actions: a.actions.map((x) => ({ ...x })), expiresAt: a.expiresAt ?? null,
    lastRun: a.lastRun ? iso(a.lastRun) : null,
    summary: {
      conditions: a.conditions.map((c) => `${PROPERTIES[c.property]?.label ?? c.property} ${(OPERATOR_LABELS[c.operator] ?? c.operator).toLowerCase()}${c.values.length ? ` ${c.values.join(' / ')}` : ''}`),
      actions: a.actions.map((x) => actionSummary(x, w)),
    },
  })),
  // What the Create/Edit panel needs: valid conditions per trigger, playbooks (and whether Sentinel may run them), owners, next order.
  automationMeta: {
    conditions: Object.fromEntries(Object.keys(TRIGGERS).map((t) => [t, conditionsFor(t)])),
    analyticsRules: w.sentinel.analyticsRules.filter((r) => r.kind === 'Scheduled' || r.kind === 'NRT' || true).map((r) => ({ id: r.id, name: r.name })),
    playbooks: w.azure.resources.filter((r) => r.playbook).map((r) => ({ id: r.id, name: r.name, rg: r.rg, trigger: r.playbook.trigger, sentinelCanRun: asiCanRun(w, r) })),
    owners: ['soc.analyst1@contoso.com', 'soc.analyst2@contoso.com', 'admin1@contoso.com'],
    nextOrder: Object.fromEntries(Object.keys(TRIGGERS).map((t) => [t, nextOrder(w.sentinel.automationRules, t)])),
  },
  playbooks: w.azure.resources.filter((r) => r.playbook).map((r) => ({ id: r.id, name: r.name, trigger: r.playbook.trigger })),
});

const defender = (w) => ({
  alerts: w.defender.alerts.map((a) => ({ id: a.id, title: a.title, severity: a.severity, status: a.status, device: a.deviceName, process: a.evidence?.process ?? null, source: a.source, createdAt: iso(a.createdAt), suppressed: Boolean(a.suppressedBy), action: a.actionTaken ?? null })),
  devices: w.defender.devices.map((d) => ({ id: d.id, name: d.name, os: d.os, isolated: d.isolated, risk: d.riskScore, onboarding: d.onboarding, groups: d.groups ?? [] })),
  suppression: w.defender.suppression.map((s) => ({ id: s.id, alertTitle: s.alertTitle, ioc: s.ioc, scope: s.scope, device: s.deviceId, action: s.action })),
  detections: w.defender.detections.map((d) => ({
    id: d.id, name: d.name, alertTitle: d.alertTitle, severity: d.severity, query: d.query, enabled: d.enabled,
    actions: d.actions.map((a) => a.type), // type strings for list views; the wizard reads the full definition below
    frequency: d.frequency, frequencyLabel: FREQUENCIES[d.frequency]?.label ?? d.frequency, lookback: FREQUENCIES[d.frequency]?.lookback ?? '',
    category: d.category, tactic: d.tactic, techniques: d.techniques, description: d.description, recommendedActions: d.recommendedActions,
    customDetails: d.customDetails, entities: d.entities, actionDefs: d.actions, scope: d.scope,
    lastRun: d.lastRun ? iso(d.lastRun) : null, lastAlerts: d.lastAlerts ?? 0, truncated: (d.truncatedRuns ?? 0) > 0,
  })),
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

// Settings > Endpoints > General > Email notifications, plus who the learner is signed in as.
// Users are listed with their roles (an admin can see a directory); whether each may manage settings is computed here.
const notifications = (w) => ({
  actorId: w.directory.actorId,
  users: w.directory.users.map((u) => ({ id: u.id, name: u.name, entraRole: u.entraRole, roleGroup: u.roleGroup })),
  canManage: canManageSecuritySettings(w.directory.users.find((u) => u.id === w.directory.actorId)),
  isGlobalAdmin: isGlobalAdmin(w.directory.users.find((u) => u.id === w.directory.actorId)),
  severities: ALERT_SEVERITIES,
  deviceGroups: w.defender.deviceGroups.filter((g) => g.id !== 'grp-all').map((g) => ({ id: g.id, name: g.name })),
  rules: w.defender.notificationRules.map((r) => ({ id: r.id, name: r.name, allDevices: r.allDevices, deviceGroups: r.deviceGroups, severities: r.severities, recipients: r.recipients, enabled: r.enabled })),
  outbox: w.defender.outbox.slice(-40).map((m) => ({ id: m.id, to: m.to, title: m.title, severity: m.severity, device: m.device, at: iso(m.at) })).reverse(),
});

// Endpoint security policies: the capability catalogue and rule list are public reference data; policies are the learner's own.
const securityPolicies = (w) => ({
  capabilities: Object.entries(CAPABILITIES).map(([id, c]) => ({ id, label: c.label, summary: c.summary, platforms: c.platforms, hasRules: c.rules })),
  rules: ASR_RULES.map((r) => ({ id: r.id, name: r.name, warn: r.warn })),
  modes: MODES,
  platforms: PLATFORMS,
  deviceGroups: w.defender.deviceGroups.filter((g) => g.id !== 'grp-all').map((g) => ({ id: g.id, name: g.name })),
  policies: w.defender.securityPolicies.map((p) => ({ id: p.id, name: p.name, type: p.type, platform: p.platform, deviceGroups: p.deviceGroups, rules: p.rules.map((r) => ({ ...r })) })),
});

// Threat management > Workbooks. Tiles are executed here, against the sandbox's own data, and only the result is sent;
// a failing tile (for example after its table was hidden) is reported as an error string, not a crash.
const runTile = (w, t) => {
  try {
    const r = query(w, 'sentinel', t.query);
    return { title: t.title, columns: r.columns.map((c) => ({ name: c.name, type: c.type })), rows: r.rows.slice(0, 100), render: r.meta.render ?? null, error: null };
  } catch (e) { return { title: t.title, columns: [], rows: [], render: null, error: String(e.message).slice(0, 200) }; }
};
const workbooks = (w) => ({
  templates: TEMPLATES.map((t) => ({ id: t.id, name: t.name, summary: t.summary, required: t.required, metrics: t.metrics, available: t.required.every((n) => visibleTables(w).includes(n)) })),
  mine: w.sentinel.workbooks.map((b) => ({ id: b.id, name: b.name, template: b.template, metrics: b.metrics, editing: b.editing, viewed: b.viewed, revision: b.revision, clonedFrom: b.clonedFrom ?? null, tiles: b.viewed ? (b.tiles ?? []).map((t) => runTile(w, t)) : [] })),
});

// Configuration > Data connectors, and Settings > Tables / data collection rules. Row counts only: ingested data is read through queries.
const ingestion = (w) => ({
  catalogue: CATALOGUE.map((c) => {
    const live = w.sentinel.connectors.find((x) => x.id === c.id);
    return { id: c.id, name: c.name, blurb: c.blurb, apps: c.apps, tables: c.tables, connected: live?.status === 'Connected', connectedApps: live?.apps ?? [] };
  }),
  other: w.sentinel.connectors.filter((x) => !CATALOGUE.some((c) => c.id === x.id)).map((x) => ({ id: x.id, name: x.name, status: x.status, tables: x.tables })),
  columnTypes: COLUMN_TYPES,
  tables: w.sentinel.customTables.map((t) => ({ name: t.name, columns: w.tables.get(t.name).columns.map((c) => ({ name: c.name, type: c.type })), rows: w.tables.get(t.name).rows.length })),
  dcrs: w.sentinel.dcrs.map((d) => ({ id: d.id, name: d.name, table: d.table, stream: d.stream, columns: d.columns.map((c) => ({ ...c })) })),
});

// Microsoft Purview > Audit. Records themselves are never sent: the learner reads them only through a search the server runs.
const audit = (w) => {
  const actor = w.directory.users.find((u) => u.id === w.directory.actorId);
  return {
    tier: w.audit.tier, actorId: w.directory.actorId, canSearch: canSearchAudit(actor),
    users: w.directory.users.map((u) => ({ id: u.id, name: u.name, entraRole: u.entraRole, roleGroup: u.roleGroup })),
    recordTypes: RECORD_TYPES.map((r) => ({ id: r.id, label: r.label, about: r.about })),
  };
};

// Defender portal Home: counts only (what the dashboard cards show), never incident or alert detail.
const defenderHome = (w) => {
  const rules = w.sentinel.automationRules;
  const open = w.sentinel.incidents.filter((i) => i.status !== 'Closed');
  return {
    automationRules: rules.length,
    incidents: { open: open.length, high: open.filter((i) => i.severity === 'High').length },
    devices: { total: w.defender.devices.length, pending: w.defender.devices.filter((d) => d.onboarding !== 'Approved').length },
    connectors: { connected: w.sentinel.connectors.filter((c) => c.status === 'Connected').length, total: w.sentinel.connectors.length },
    workbooks: w.sentinel.workbooks.length,
  };
};

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
  notifications,
  'defender-home': defenderHome,
  audit,
  ingestion,
  workbooks,
  'security-policies': securityPolicies,
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
