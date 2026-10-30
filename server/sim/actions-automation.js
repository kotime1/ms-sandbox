// Automation-rule actions (the "Create new automation rule" panel) and incident updates that fire automation.
// Rules and validation live in automation.js; the run-time engine lives in world.js.

import { idSpec } from '../core/validate.js';
import { SimError, capCheck, resource, runAutomation, updateIncident, can, SUB, ASI_PRINCIPAL } from './world.js';
import { TRIGGERS, STATUSES, SEVERITIES, CLASSIFICATIONS, PROPERTIES, validateRule, nextOrder } from './automation.js';

// Letters, digits and the punctuation analysts really use in names and tags. No < > " ` $ { } so nothing can look like markup.
const text = (max, extra = {}) => ({ type: 'string', min: 1, max, pattern: /^[\w .:()@/\\,'+#&|=-]+$/, ...extra });
const name = (extra = {}) => text(80, extra);

const CONDITION_SPEC = {
  property: { type: 'enum', values: Object.keys(PROPERTIES) },
  operator: { type: 'enum', values: ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith', 'added', 'changed', 'changedFrom', 'changedTo'] },
  values: { type: 'array', of: text(120), max: 10, optional: true, default: [] },
};
const ACTION_SPEC = {
  type: { type: 'enum', values: ['assignOwner', 'changeStatus', 'changeSeverity', 'addTags', 'runPlaybook'] },
  owner: text(120, { optional: true }),
  status: { type: 'enum', values: STATUSES, optional: true },
  classification: { type: 'enum', values: CLASSIFICATIONS, optional: true },
  comment: text(500, { optional: true }),
  severity: { type: 'enum', values: SEVERITIES, optional: true },
  tags: { type: 'array', of: text(60), max: 10, optional: true },
  playbookId: { type: 'string', max: 300, optional: true },
};

const incidentOf = (w, id) => {
  const inc = w.sentinel.incidents.find((i) => i.id === id);
  if (!inc) throw new SimError('Incident not found', 'NotFound');
  return inc;
};

/** Build a normalised rule from validated params, and validate it against the documented constraints. */
function buildRule(w, p, existing = null) {
  const rule = {
    id: existing?.id ?? `auto-${w.counters.rule++}`,
    seq: existing?.seq ?? w.counters.rule++,
    name: p.name,
    trigger: p.trigger,
    // Already validated and copied into null-prototype objects by the validator; copy to plain objects for storage.
    conditions: p.conditions.map((c) => ({ property: c.property, operator: c.operator, values: [...(c.values ?? [])] })),
    actions: p.actions.map((a) => ({ ...a })),
    enabled: existing?.enabled ?? true,
    expiresAt: p.expiresAt ?? null,
    order: p.order ?? existing?.order ?? nextOrder(w.sentinel.automationRules.filter((r) => r.id !== existing?.id), p.trigger),
  };
  validateRule(rule, { analyticsRules: w.sentinel.analyticsRules, playbookOf: (id) => resource(w, id)?.playbook ? { trigger: resource(w, id).playbook.trigger } : null });
  return rule;
}

export const AUTOMATION_ACTIONS = {
  // "Manage playbook permissions" > select the resource group > Apply. Needs Owner on the group (docs: "You yourself must have
  // owner permissions on any resource group to which you want to grant Microsoft Sentinel permissions").
  'sentinel.grantPlaybookPermission': {
    spec: { resourceGroup: { type: 'string', min: 1, max: 80, pattern: /^[\w.()-]+$/ } },
    run({ w }, p) {
      const rg = `/subscriptions/${SUB}/resourceGroups/${p.resourceGroup}`;
      if (!w.azure.resources.some((r) => r.id.startsWith(`${rg}/`))) throw new SimError(`Resource group '${p.resourceGroup}' contains no playbooks.`, 'NotFound');
      if (!can(w, 'u-admin1', 'rbac', rg)) throw new SimError('You need the Owner role on this resource group to grant Microsoft Sentinel permissions.', 'Forbidden');
      if (w.azure.assignments.some((x) => x.principalId === ASI_PRINCIPAL && x.role === 'Microsoft Sentinel Automation Contributor' && x.scope === rg)) throw new SimError('Microsoft Sentinel already has permission on this resource group.');
      capCheck(w.azure.assignments, 'assignments');
      w.azure.assignments.push({ id: `ra-${w.counters.rule++}`, scope: rg, principalId: ASI_PRINCIPAL, principalName: 'Azure Security Insights', role: 'Microsoft Sentinel Automation Contributor', createdBy: 'admin1@contoso.com' });
      return {};
    },
  },

  // The full "Create new automation rule" panel (Defender portal: Microsoft Sentinel > Configuration > Automation > Create > Automation rule).
  'sentinel.saveAutomationRule': {
    spec: {
      id: idSpec({ optional: true }),
      name: name(),
      trigger: { type: 'enum', values: Object.keys(TRIGGERS) },
      conditions: { type: 'array', of: { type: 'object', shape: CONDITION_SPEC }, max: 10, optional: true, default: [] },
      actions: { type: 'array', of: { type: 'object', shape: ACTION_SPEC }, min: 1, max: 10 },
      expiresAt: { type: 'int', min: 0, max: 4_102_444_800_000, optional: true },
      order: { type: 'int', min: 1, max: 1000, optional: true },
    },
    run({ w }, p) {
      const rules = w.sentinel.automationRules;
      const existing = p.id ? rules.find((r) => r.id === p.id) : null;
      if (p.id && !existing) throw new SimError('Automation rule not found', 'NotFound');
      if (!existing) capCheck(rules, 'automationRules');
      const rule = buildRule(w, p, existing);
      if (existing) Object.assign(existing, rule); else rules.push(rule);
      return { rule: { id: rule.id, order: rule.order } };
    },
  },

  // Backward-compatible call used by the first labs: "run this playbook when an analytics rule creates an incident".
  'sentinel.createAutomationRule': {
    spec: {
      name: name(),
      ruleIds: { type: 'array', of: idSpec(), max: 20, optional: true, default: [] },
      playbookId: { type: 'string', max: 300 },
    },
    run({ w }, p) {
      capCheck(w.sentinel.automationRules, 'automationRules');
      const names = p.ruleIds.map((id) => {
        const r = w.sentinel.analyticsRules.find((x) => x.id === id);
        if (!r) throw new SimError(`Analytics rule '${id}' not found`, 'NotFound');
        return r.name;
      });
      const rule = buildRule(w, {
        name: p.name, trigger: 'incidentCreated',
        conditions: names.length ? [{ property: 'analyticRuleName', operator: 'contains', values: names }] : [],
        actions: [{ type: 'runPlaybook', playbookId: p.playbookId }],
      });
      w.sentinel.automationRules.push(rule);
      return { rule };
    },
  },

  'sentinel.setAutomationRuleEnabled': {
    spec: { id: idSpec(), enabled: { type: 'boolean' } },
    run({ w }, p) {
      const r = w.sentinel.automationRules.find((x) => x.id === p.id);
      if (!r) throw new SimError('Automation rule not found', 'NotFound');
      r.enabled = p.enabled;
      return {};
    },
  },

  // Analyst changes an incident. Fires "When incident is updated" automation, as in the real service.
  'sentinel.updateIncident': {
    spec: {
      incidentId: idSpec(),
      status: { type: 'enum', values: STATUSES, optional: true },
      classification: { type: 'enum', values: CLASSIFICATIONS, optional: true },
      comment: text(500, { optional: true }),
      severity: { type: 'enum', values: SEVERITIES, optional: true },
      owner: text(120, { optional: true }),
      addTags: { type: 'array', of: text(60), max: 10, optional: true },
    },
    run({ w }, p) {
      const inc = incidentOf(w, p.incidentId);
      const changes = updateIncident(w, inc, { status: p.status, classification: p.classification, comment: p.comment, severity: p.severity, owner: p.owner, addTags: p.addTags });
      return { changed: changes.length };
    },
  },

  // Kept for older callers and labs: a bare status change (no classification needed unless closing).
  'sentinel.setIncidentStatus': {
    spec: {
      incidentId: idSpec(),
      status: { type: 'enum', values: STATUSES },
      classification: { type: 'enum', values: CLASSIFICATIONS, optional: true },
      comment: text(500, { optional: true }),
    },
    run({ w }, p) {
      updateIncident(w, incidentOf(w, p.incidentId), { status: p.status, classification: p.classification, comment: p.comment });
      return {};
    },
  },

  // "When alert is created" fires from Scheduled/NRT analytics rules. The sandbox lets a lab or learner trigger it explicitly.
  'sentinel.raiseAlertForRule': {
    spec: { ruleId: idSpec() },
    run({ w }, p) {
      const r = w.sentinel.analyticsRules.find((x) => x.id === p.ruleId);
      if (!r) throw new SimError('Analytics rule not found', 'NotFound');
      if (!['Scheduled', 'NRT'].includes(r.kind)) throw new SimError('The alert trigger only fires for alerts created by Scheduled or NRT analytics rules.');
      return { ran: runAutomation(w, 'alertCreated', { title: r.name, severity: r.severity, status: 'New', ruleName: r.name, tags: [], runs: [] }) };
    },
  },
};
