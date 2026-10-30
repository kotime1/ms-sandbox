// Custom detection rule actions: the wizard (preview + save), enable/disable, and a compatibility wrapper for the first lab.
// Rules, columns and validation: detections.js. Execution: world.js runDetections.

import { idSpec } from '../core/validate.js';
import { SimError, capCheck, runDetections, tablesFor } from './world.js';
import { runQuery, KqlError } from './kql/engine.js';
import { FREQUENCIES, SEVERITIES, CATEGORIES, ACTIONS, describeQuery, nrtBlocker, actionAvailability, validateDetection } from './detections.js';

// Names/titles: letters, digits and the punctuation analysts use. {{ }} is allowed in titles and descriptions for dynamic text.
const label = (max, extra = {}) => ({ type: 'string', min: 1, max, pattern: /^[\w .:()@/\\,'+#&|=-]+$/, ...extra });
const dynamicText = (max, extra = {}) => ({ type: 'string', min: 1, max, pattern: /^[\w .:()@/\\,'+#&|={}-]+$/, ...extra });
const colName = { type: 'string', min: 1, max: 60, pattern: /^[A-Za-z_][A-Za-z0-9_]*$/ };

const SAVE_SPEC = {
  id: idSpec({ optional: true }),
  name: label(80),
  query: { type: 'string', min: 1, max: 4000 },
  frequency: { type: 'enum', values: Object.keys(FREQUENCIES) },
  alertTitle: dynamicText(120),
  severity: { type: 'enum', values: SEVERITIES },
  category: { type: 'enum', values: CATEGORIES },
  tactic: label(60, { optional: true }),
  techniques: { type: 'array', of: label(20), max: 10, optional: true, default: [] },
  description: dynamicText(500, { optional: true, default: '' }),
  recommendedActions: label(500, { optional: true, default: '' }),
  customDetails: { type: 'array', of: { type: 'object', shape: { key: label(60), column: colName } }, max: 20, optional: true, default: [] },
  entities: { type: 'array', of: { type: 'object', shape: { type: { type: 'enum', values: ['Account', 'Device', 'Mailbox'] }, column: colName } }, max: 3, optional: true, default: [] },
  actions: {
    type: 'array', max: 12, optional: true, default: [],
    of: { type: 'object', shape: { type: { type: 'enum', values: Object.keys(ACTIONS) }, folder: { type: 'enum', values: ['Junk', 'Inbox', 'Deleted items'], optional: true }, mode: { type: 'enum', values: ['soft', 'hard'], optional: true } } },
  },
  scopeType: { type: 'enum', values: ['all', 'groups'], optional: true, default: 'all' },
  scopeGroups: { type: 'array', of: idSpec(), max: 10, optional: true, default: [] },
};

/** Run the rule's query once: columns, row count and the facts the wizard needs (NRT eligibility, available actions). */
function inspect(w, queryText) {
  let res;
  try { res = runQuery(queryText, { tables: tablesFor(w, 'defender'), now: Date.now() }); } catch (e) {
    if (e instanceof KqlError) throw new SimError(`The query is not valid: ${e.message}`);
    throw e;
  }
  const columns = res.columns.map((c) => c.name);
  const info = describeQuery(queryText, res.meta, columns);
  return { res, columns, info };
}

export const DETECTION_ACTIONS = {
  // The wizard's "Explore query and results" + step gating: tells the UI which frequencies, actions and entities are possible.
  'defender.previewDetection': {
    spec: { query: { type: 'string', min: 1, max: 4000 } },
    run({ w }, p) {
      const { res, columns, info } = inspect(w, p.query);
      const nrt = nrtBlocker(info);
      return {
        preview: {
          columns, rowCount: res.meta.rowCount, tables: info.tables,
          nrt: { allowed: !nrt, reason: nrt },
          actions: actionAvailability(columns),
          entityColumns: columns.filter((c) => c === 'DeviceId' || c === 'DeviceName' || c === 'AccountUpn' || c === 'AccountObjectId' || c === 'AccountSid' || c === 'RecipientEmailAddress'),
          frequencies: Object.fromEntries(Object.entries(FREQUENCIES).map(([k, f]) => [k, { label: f.label, lookback: f.lookback }])),
        },
      };
    },
  },

  'defender.saveDetection': {
    spec: SAVE_SPEC,
    run({ w }, p) {
      const rules = w.defender.detections;
      const existing = p.id ? rules.find((r) => r.id === p.id) : null;
      if (p.id && !existing) throw new SimError('Detection rule not found', 'NotFound');
      if (!existing) capCheck(rules, 'detections');
      const { columns, info } = inspect(w, p.query);

      const groups = w.defender.deviceGroups;
      for (const g of p.scopeGroups) if (!groups.some((x) => x.id === g)) throw new SimError(`Device group '${g}' does not exist.`);
      if (p.scopeType === 'groups' && !p.scopeGroups.length) throw new SimError('Choose at least one device group, or scope the rule to all devices.');

      const def = {
        name: p.name, query: p.query, frequency: p.frequency, alertTitle: p.alertTitle, severity: p.severity, category: p.category,
        tactic: p.tactic ?? '', techniques: [...p.techniques], description: p.description ?? '', recommendedActions: p.recommendedActions ?? '',
        customDetails: p.customDetails.map((c) => ({ key: c.key, column: c.column })),
        entities: p.entities.map((e) => ({ type: e.type, column: e.column })),
        actions: p.actions.map((a) => ({ ...a })),
        scope: { type: p.scopeType, groups: [...p.scopeGroups] },
      };
      const { warnings } = validateDetection(def, info);

      let rule = existing;
      if (existing) { Object.assign(existing, def); existing.seen = new Set(); } else {
        rule = { id: `det-${w.counters.rule++}`, enabled: true, ...def };
        rules.push(rule);
      }
      // "When you save a new rule, it runs and checks for matches" (docs). The sandbox runs it now.
      const fired = runDetections(w, { only: rule.id });
      return { detection: { id: rule.id, name: rule.name, alerts: fired.length }, warnings, columns };
    },
  },

  'defender.setDetectionEnabled': {
    spec: { id: idSpec(), enabled: { type: 'boolean' } },
    run({ w }, p) {
      const r = w.defender.detections.find((x) => x.id === p.id);
      if (!r) throw new SimError('Detection rule not found', 'NotFound');
      r.enabled = p.enabled;
      return {};
    },
  },

  // First-lab compatibility: the old one-dialog call. Builds a normal rule with sensible defaults. The documented "recommended
  // columns" are warnings, not errors; an action that needs a column (isolate needs DeviceId) still blocks.
  'defender.createDetection': {
    spec: {
      name: label(80), alertTitle: dynamicText(120),
      severity: { type: 'enum', values: ['Low', 'Medium', 'High'] },
      query: { type: 'string', max: 4000, min: 1 },
      isolateDevice: { type: 'boolean', optional: true, default: false },
    },
    run(ctx, p) {
      const { w } = ctx;
      capCheck(w.defender.detections, 'detections');
      const { info } = inspect(w, p.query);
      const def = {
        name: p.name, query: p.query, frequency: info.singleTable && !info.usesJoinOrUnion && !nrtBlocker(info) ? 'nrt' : '24h',
        alertTitle: p.alertTitle, severity: p.severity, category: 'Suspicious activity', tactic: '', techniques: [], description: '', recommendedActions: '',
        customDetails: [], entities: [], actions: p.isolateDevice ? [{ type: 'isolateDevice' }] : [], scope: { type: 'all', groups: [] },
      };
      // The old call used a once-a-day style default; NRT is only chosen when it is genuinely eligible.
      if (def.frequency === 'nrt' && !info.tables.every((t) => ['DeviceLogonEvents', 'DeviceEvents'].includes(t))) def.frequency = '24h';
      validateDetection(def, info);
      const rule = { id: `det-${w.counters.rule++}`, enabled: true, ...def };
      w.defender.detections.push(rule);
      runDetections(w, { only: rule.id });
      return { detection: { id: rule.id, name: rule.name, actions: rule.actions.map((a) => a.type) } };
    },
  },
};
