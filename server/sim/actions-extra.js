// Actions added in iteration 2 (set 2 labs). Same rules as actions.js: validated spec, SimError for
// learner-facing mistakes, mutate the world only through here.

import { idSpec } from '../core/validate.js';
import { SimError, capCheck, device, resource, tablesFor } from './world.js';

const text = (max, extra = {}) => ({ type: 'string', min: 1, max, pattern: /^[\w .:()@/\\-]+$/, ...extra });
const HASH = /^[a-f0-9]{64}$/i;

const file = (w, sha) => w.defender.files.find((f) => f.sha256 === sha.toLowerCase()) ?? null;

export const EXTRA_ACTIONS = {
  // ---------------------------------------------------------------- Defender: files, indicators, allow/block
  'defender.createIndicator': {
    spec: {
      type: { type: 'enum', values: ['file', 'ip', 'url'] },
      value: text(300),
      action: { type: 'enum', values: ['allow', 'alert', 'block'] },
      // Targets are device-group ids; an indicator with none is created but stays inactive.
      targets: { type: 'array', of: idSpec(), max: 10, optional: true, default: [] },
    },
    run({ w }, p) {
      capCheck(w.defender.indicators, 'indicators');
      if (p.type === 'file' && !HASH.test(p.value)) throw new SimError('A file indicator needs a SHA-256 hash (64 hex characters).');
      const groups = w.defender.deviceGroups ?? [];
      for (const t of p.targets) if (!groups.some((g) => g.id === t)) throw new SimError(`Target '${t}' is not a valid device group.`);
      const ind = { id: `ioc-${w.counters.rule++}`, type: p.type, value: p.type === 'file' ? p.value.toLowerCase() : p.value, action: p.action, targets: [...p.targets] };
      w.defender.indicators.push(ind);
      return { indicator: ind };
    },
  },
  'defender.setIndicatorTargets': {
    spec: { id: idSpec(), targets: { type: 'array', of: idSpec(), max: 10 } },
    run({ w }, p) {
      const ind = w.defender.indicators.find((i) => i.id === p.id);
      if (!ind) throw new SimError('Indicator not found', 'NotFound');
      const groups = w.defender.deviceGroups ?? [];
      for (const t of p.targets) if (!groups.some((g) => g.id === t)) throw new SimError(`Target '${t}' is not a valid device group.`);
      ind.targets = [...p.targets];
      return {};
    },
  },
  'defender.deleteIndicator': {
    spec: { id: idSpec() },
    run({ w }, p) {
      const i = w.defender.indicators.findIndex((x) => x.id === p.id);
      if (i < 0) throw new SimError('Indicator not found', 'NotFound');
      w.defender.indicators.splice(i, 1);
      return {};
    },
  },
  'defender.addAllowBlock': {
    spec: {
      kind: { type: 'enum', values: ['file', 'url', 'sender'] },
      value: text(300),
      action: { type: 'enum', values: ['allow', 'block'] },
      expiry: { type: 'enum', values: ['30days', 'never', 'removeAfterInactive'], optional: true, default: '30days' },
    },
    run({ w }, p) {
      capCheck(w.defender.allowBlock, 'indicators');
      if (p.kind === 'file' && !HASH.test(p.value)) throw new SimError('A file entry needs a SHA-256 hash (64 hex characters).');
      const value = p.kind === 'file' ? p.value.toLowerCase() : p.value;
      if (w.defender.allowBlock.some((e) => e.kind === p.kind && e.value === value)) throw new SimError('That entry already exists in the Tenant Allow/Block List.');
      const entry = { id: `tabl-${w.counters.rule++}`, kind: p.kind, value, action: p.action, expiry: p.expiry };
      w.defender.allowBlock.push(entry);
      // An allow entry for a file that is currently blocked releases it immediately.
      if (p.kind === 'file' && p.action === 'allow') {
        const f = file(w, value);
        if (f?.blocked) { f.blocked = false; f.releasedBy = entry.id; }
      }
      return { entry };
    },
  },
  'defender.deleteAllowBlock': {
    spec: { id: idSpec() },
    run({ w }, p) {
      const i = w.defender.allowBlock.findIndex((e) => e.id === p.id);
      if (i < 0) throw new SimError('Entry not found', 'NotFound');
      w.defender.allowBlock.splice(i, 1);
      return {};
    },
  },
  'defender.submitDeepAnalysis': {
    spec: { sha256: text(64, { pattern: HASH }) },
    run({ w }, p) {
      const f = file(w, p.sha256);
      if (!f) throw new SimError('File not found', 'NotFound');
      if (f.deepAnalysis) throw new SimError('This file has already been submitted for deep analysis.');
      f.deepAnalysis = { status: 'Completed', verdict: f.verdict ?? 'Suspicious', behaviors: f.behaviors ?? [] };
      return { analysis: f.deepAnalysis };
    },
  },
  'defender.approveDevices': {
    spec: { ids: { type: 'array', of: idSpec(), max: 50 } },
    run({ w }, p) {
      let n = 0;
      for (const id of p.ids) {
        const d = device(w, id);
        if (!d) throw new SimError(`Device '${id}' not found`, 'NotFound');
        if (d.onboarding === 'Pending approval') { d.onboarding = 'Approved'; n++; }
      }
      if (!n) throw new SimError('None of the selected devices were waiting for approval.');
      return { approved: n };
    },
  },
  'defender.collectPackage': {
    spec: { deviceId: idSpec() },
    run({ w }, p) {
      const d = device(w, p.deviceId);
      if (!d) throw new SimError('Device not found', 'NotFound');
      if (d.onboarding !== 'Approved') throw new SimError('The device is not approved yet.');
      const pkg = {
        id: `pkg-${w.counters.rule++}`, deviceId: d.id, deviceName: d.name, at: Date.now(),
        contents: ['Autoruns', 'Installed programs', 'Network connections', 'Prefetch files', 'Processes', 'Scheduled tasks', 'Security event log', 'Services', 'SMB sessions', 'System information', 'Temp directories', 'Users and groups', 'WMI Repository'],
      };
      w.defender.packages.push(pkg);
      return { package: { id: pkg.id, deviceName: pkg.deviceName, contents: pkg.contents } };
    },
  },
  'defender.flagTimelineEvent': {
    spec: { deviceId: idSpec(), eventId: idSpec(), flagged: { type: 'boolean' } },
    run({ w }, p) {
      const ev = (w.defender.timelines?.[p.deviceId] ?? []).find((e) => e.id === p.eventId);
      if (!ev) throw new SimError('Event not found', 'NotFound');
      ev.flagged = p.flagged;
      return {};
    },
  },

  // ---------------------------------------------------------------- Sentinel: workbooks, hunting, summary rules, analytics
  'sentinel.createWorkbook': {
    spec: { name: text(80), template: idSpec({ optional: true }) },
    run({ w }, p) {
      capCheck(w.sentinel.workbooks, 'workbooks');
      const tpl = p.template ? (w.sentinel.workbookTemplates ?? []).find((t) => t.id === p.template) : null;
      if (p.template && !tpl) throw new SimError('Template not found', 'NotFound');
      // Templates are read-only: the learner always works on a copy ("Save as" / Clone), as in the portal.
      const wb = { id: `wb-${w.counters.rule++}`, name: p.name, template: tpl?.id ?? null, metrics: tpl ? [...tpl.metrics] : [] };
      w.sentinel.workbooks.push(wb);
      return { workbook: wb };
    },
  },
  'sentinel.toggleFavorite': {
    spec: { queryId: idSpec(), favorite: { type: 'boolean' } },
    run({ w }, p) {
      const h = w.sentinel.hunting;
      if (!h.queries.some((q) => q.id === p.queryId)) throw new SimError('Hunting query not found', 'NotFound');
      const has = h.favorites.includes(p.queryId);
      if (p.favorite && !has) { capCheck(h.favorites, 'favorites'); h.favorites.push(p.queryId); }
      if (!p.favorite && has) h.favorites.splice(h.favorites.indexOf(p.queryId), 1);
      return {};
    },
  },
  'sentinel.openHunting': {
    // Opening the Hunting blade runs every favorite query (the behaviour the exam question tests).
    spec: {},
    run({ w }) {
      const h = w.sentinel.hunting;
      const results = [];
      for (const id of h.favorites) {
        const q = h.queries.find((x) => x.id === id);
        if (!q) continue;
        try {
          const r = runQueryOn(w, 'sentinel', q.query);
          q.lastRun = { at: Date.now(), count: r.meta.rowCount };
          results.push({ id, count: r.meta.rowCount });
        } catch (e) {
          q.lastRun = { at: Date.now(), error: e.message };
        }
      }
      return { ran: results };
    },
  },
  'sentinel.createSummaryRule': {
    spec: {
      name: text(80),
      source: text(60),
      destination: text(60, { pattern: /^[A-Za-z][A-Za-z0-9_]*_CL$/ }),
      query: { type: 'string', min: 1, max: 2000 },
      binMinutes: { type: 'enum', values: [20, 30, 60, 120, 180, 360, 720, 1440].map(String), optional: true, default: '60' },
    },
    run({ w }, p) {
      capCheck(w.sentinel.summaryRules, 'summaryRules');
      if (!w.tables.has(p.source) || !w.enabledTables.has(p.source)) throw new SimError(`Source table '${p.source}' does not exist in this workspace.`);
      // The destination must be a NEW table, and not collide with any table the workspace already has.
      if (w.tables.has(p.destination)) {
        throw new SimError(`'${p.destination}' already exists. A summary rule writes to a new custom table: choose a different name.`);
      }
      let res;
      try {
        // The rule itself runs against the raw table in the backend, so it is not subject to the interactive timeout.
        res = runQueryOn(w, 'sentinel', p.query, { noScanCost: true });
      } catch (e) {
        throw new SimError(`The summary query is not valid: ${e.message}`);
      }
      if (!res.meta.ops.includes('summarize')) throw new SimError('A summary rule query must aggregate (use summarize).');
      if (!res.columns.some((c) => c.name === 'TimeGenerated')) throw new SimError('The summary query must return a TimeGenerated column (for example summarize ... by bin(TimeGenerated, 1h)).');
      const rule = { id: `sum-${w.counters.rule++}`, name: p.name, source: p.source, destination: p.destination, query: p.query, binMinutes: Number(p.binMinutes), rowsWritten: res.rows.length };
      w.sentinel.summaryRules.push(rule);
      // Materialise the destination table so analysts can query it.
      w.tables.set(p.destination, { columns: res.columns.map((c) => ({ name: c.name, type: c.type })), rows: res.records.map((r) => ({ ...r })) });
      return { rule: { id: rule.id, destination: rule.destination, rowsWritten: rule.rowsWritten } };
    },
  },
  'sentinel.viewIncident': {
    // Recorded so investigation labs can tell the learner actually opened the incident.
    spec: { incidentId: idSpec() },
    run({ w }, p) {
      if (!w.sentinel.incidents.some((i) => i.id === p.incidentId)) throw new SimError('Incident not found', 'NotFound');
      return {};
    },
  },
  'sentinel.setEntityMapping': {
    spec: { ruleId: idSpec(), enabled: { type: 'boolean' } },
    run({ w }, p) {
      const r = w.sentinel.analyticsRules.find((x) => x.id === p.ruleId);
      if (!r) throw new SimError('Analytics rule not found', 'NotFound');
      if (!r.query) throw new SimError('This rule type is built on Microsoft algorithms and has no editable query or entity mapping.');
      if (!['Scheduled', 'NRT'].includes(r.kind)) throw new SimError('Entity mapping is available only in scheduled and NRT analytics rules.');
      r.entityMapping = p.enabled;
      return {};
    },
  },

  // ---------------------------------------------------------------- Investigation answers
  'findings.report': {
    // For "what did you find" objectives. The lab compares this to server-side truth; the expected value is never sent.
    spec: { objectiveId: idSpec(), value: { type: 'string', min: 1, max: 120 } },
    run({ w }, p) {
      capCheck(w.findings, 'findings');
      const existing = w.findings.find((f) => f.objectiveId === p.objectiveId);
      if (existing) existing.value = p.value.trim(); else w.findings.push({ objectiveId: p.objectiveId, value: p.value.trim() });
      return {};
    },
  },
};

// local helper: run a query on a surface and translate KQL errors, with optional engine flags
import { runQuery, KqlError } from './kql/engine.js';
function runQueryOn(w, surface, textQuery, flags = {}) {
  try {
    return runQuery(textQuery, { tables: tablesFor(w, surface), now: Date.now(), ...flags });
  } catch (e) {
    if (e instanceof KqlError) throw new SimError(e.message, `Kql${e.kind}`);
    throw e;
  }
}

export { resource };
