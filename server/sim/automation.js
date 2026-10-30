// Sentinel automation rules: triggers, conditions, actions, order, expiry.
//
// Source: learn.microsoft.com/en-us/azure/sentinel/create-manage-use-automation-rules (2026-07-01) and
//         .../automate-incident-handling-with-automation-rules (updated 2026-06-30).
//
// Modelled:
//   - three triggers: incident created, incident updated, alert created
//   - AND conditions with the documented operator set per property; all matching is case-insensitive
//   - actions: assign owner, change status (closing classification is mandatory), change severity, add tags, run playbook
//   - the alert trigger allows ONLY the Run playbook action; the alert trigger's only condition is the analytics rule name
//   - rules run sequentially in order; each trigger type keeps its own order queue; update-trigger rules run after create-trigger rules
//   - an expiration date disables the rule afterwards
// NOT modelled (shown as out of scope in the UI): OR condition groups, custom-details conditions, tasks, Simple Flows,
//   case triggers, the 2-minute playbook-wait rule, entity-property conditions.

import { SimError } from './world-errors.js';

export const TRIGGERS = {
  incidentCreated: 'When incident is created',
  incidentUpdated: 'When incident is updated',
  alertCreated: 'When alert is created',
};

export const STATUSES = ['New', 'Active', 'Closed'];
export const SEVERITIES = ['Informational', 'Low', 'Medium', 'High'];
export const CLASSIFICATIONS = [
  'True Positive - suspicious activity',
  'Benign Positive - suspicious but expected',
  'False Positive - incorrect alert logic',
  'False Positive - incorrect data',
  'Undetermined',
];

const TEXT_OPS = ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith'];
const EQ = ['equals', 'notEquals'];
const CONTAINS = ['contains', 'notContains'];

// property -> { label, ops per trigger, kind of value }
// (the docs' "Conditions available with the create trigger / update trigger" tables)
export const PROPERTIES = {
  title: { label: 'Title', kind: 'text', create: TEXT_OPS, update: TEXT_OPS },
  description: { label: 'Description', kind: 'text', create: TEXT_OPS, update: TEXT_OPS },
  tag: { label: 'Tag', kind: 'text', create: TEXT_OPS, update: [...TEXT_OPS, 'added'] },
  severity: { label: 'Severity', kind: 'enum', values: SEVERITIES, create: EQ, update: [...EQ, 'changed', 'changedFrom', 'changedTo'] },
  status: { label: 'Status', kind: 'enum', values: STATUSES, create: EQ, update: [...EQ, 'changed', 'changedFrom', 'changedTo'] },
  analyticRuleName: { label: 'Analytic rule name', kind: 'rule', create: CONTAINS, update: CONTAINS, alert: CONTAINS },
  owner: { label: 'Owner', kind: 'text', create: [], update: ['changed'] },
  updatedBy: { label: 'Updated by', kind: 'enum', values: ['Application', 'User', 'Playbook', 'Automation rule', 'Alert grouping', 'Other'], create: [], update: EQ },
  tactics: { label: 'Tactics', kind: 'text', create: CONTAINS, update: [...CONTAINS, 'added'] },
};

export const OPERATOR_LABELS = {
  equals: 'Equals', notEquals: 'Does not equal', contains: 'Contains', notContains: 'Does not contain',
  startsWith: 'Starts with', notStartsWith: 'Does not start with', endsWith: 'Ends with', notEndsWith: 'Does not end with',
  added: 'Added', changed: 'Changed', changedFrom: 'Changed from', changedTo: 'Changed to',
};

const triggerKey = (t) => (t === 'incidentCreated' ? 'create' : t === 'incidentUpdated' ? 'update' : 'alert');

/** Which properties/operators are valid for a trigger (used by both validation and the wizard). */
export function conditionsFor(trigger) {
  const k = triggerKey(trigger);
  return Object.entries(PROPERTIES)
    .filter(([, p]) => (p[k] ?? []).length > 0)
    .map(([id, p]) => ({ id, label: p.label, kind: p.kind, values: p.values ?? null, operators: p[k].map((op) => ({ id: op, label: OPERATOR_LABELS[op] })) }));
}

/** Validate a rule definition against the documented constraints. Throws SimError with the portal-style reason. */
export function validateRule(rule, { analyticsRules, playbookOf }) {
  if (!Object.hasOwn(TRIGGERS, rule.trigger)) throw new SimError('Choose a trigger.');
  const k = triggerKey(rule.trigger);
  if (!rule.actions.length) throw new SimError('Add at least one action.');

  for (const c of rule.conditions) {
    const prop = Object.hasOwn(PROPERTIES, c.property) ? PROPERTIES[c.property] : null;
    if (!prop || !(prop[k] ?? []).length) {
      throw new SimError(rule.trigger === 'alertCreated'
        ? `Rules for "When alert is created" support only the Analytic rule name condition. "${prop?.label ?? c.property}" is not available.`
        : `"${prop?.label ?? c.property}" is not available as a condition for "${TRIGGERS[rule.trigger]}".`);
    }
    if (!prop[k].includes(c.operator)) throw new SimError(`The operator "${OPERATOR_LABELS[c.operator] ?? c.operator}" is not available for ${prop.label} with this trigger.`);
    if (!['changed'].includes(c.operator) && !c.values.length) throw new SimError(`Enter a value for the ${prop.label} condition.`);
    if (prop.kind === 'enum') for (const v of c.values) if (!prop.values.includes(v)) throw new SimError(`"${v}" is not a valid ${prop.label}.`);
    if (prop.kind === 'rule') for (const v of c.values) if (!analyticsRules.some((r) => r.name === v)) throw new SimError(`Analytics rule "${v}" does not exist.`);
  }

  for (const a of rule.actions) {
    if (rule.trigger === 'alertCreated' && a.type !== 'runPlaybook') {
      throw new SimError('Only the Run playbook action is available in automation rules that use the alert trigger.');
    }
    if (a.type === 'changeStatus') {
      if (!STATUSES.includes(a.status)) throw new SimError('Choose a status.');
      if (a.status === 'Closed' && !CLASSIFICATIONS.includes(a.classification)) throw new SimError('Select a classification: closing an incident needs a closing reason.');
    }
    if (a.type === 'changeSeverity' && !SEVERITIES.includes(a.severity)) throw new SimError('Choose a severity.');
    if (a.type === 'assignOwner' && !a.owner) throw new SimError('Choose an owner.');
    if (a.type === 'addTags' && !a.tags?.length) throw new SimError('Enter at least one tag.');
    if (a.type === 'runPlaybook') {
      const pb = playbookOf(a.playbookId);
      if (!pb) throw new SimError('Choose a playbook.');
      const need = rule.trigger === 'alertCreated' ? 'alert' : 'incident';
      if (pb.trigger !== need) {
        throw new SimError(rule.trigger === 'alertCreated'
          ? 'Only playbooks that start with the Microsoft Sentinel alert trigger can run from an automation rule that uses the alert trigger.'
          : 'Only playbooks that start with the Microsoft Sentinel incident trigger can run from an automation rule that uses an incident trigger.');
      }
    }
  }
}

const ci = (v) => String(v ?? '').toLowerCase();

function opTest(op, actual, expected) {
  const a = ci(actual);
  const e = ci(expected);
  switch (op) {
    case 'equals': return a === e;
    case 'notEquals': return a !== e;
    case 'contains': return a.includes(e);
    case 'notContains': return !a.includes(e);
    case 'startsWith': return a.startsWith(e);
    case 'notStartsWith': return !a.startsWith(e);
    case 'endsWith': return a.endsWith(e);
    case 'notEndsWith': return !a.endsWith(e);
    default: return false;
  }
}

/** The values of an incident property, for matching. Tags are a collection; the others are single values. */
function valuesOf(inc, property) {
  switch (property) {
    case 'title': return [inc.title];
    case 'description': return [inc.description ?? ''];
    case 'tag': return inc.tags ?? [];
    case 'severity': return [inc.severity];
    case 'status': return [inc.status];
    case 'analyticRuleName': return [inc.ruleName ?? ''];
    case 'owner': return [inc.owner ?? ''];
    case 'tactics': return inc.tactics ?? [];
    default: return [''];
  }
}

/**
 * Does one condition hold? `change` is { property, from, to } describing what the update was (update trigger only).
 * Multiple values on a condition are ORed (the dice icon); the condition itself is one term of the rule's AND.
 */
export function conditionHolds(c, inc, change = null, updatedBy = 'Other') {
  if (c.property === 'updatedBy') return c.values.some((v) => (c.operator === 'equals') === (ci(v) === ci(updatedBy)));
  if (['changed', 'changedFrom', 'changedTo', 'added'].includes(c.operator)) {
    if (!change || change.property !== c.property) return false;
    if (c.operator === 'changed') return true;
    if (c.operator === 'added') return c.values.some((v) => ci(change.added) === ci(v));
    if (c.operator === 'changedFrom') return c.values.some((v) => ci(change.from) === ci(v));
    return c.values.some((v) => ci(change.to) === ci(v));
  }
  const actual = valuesOf(inc, c.property);
  if (c.property === 'tag') {
    // Any-individual-tag: true if at least one tag satisfies. (The collection operators are not modelled.)
    return c.values.some((v) => actual.some((t) => opTest(c.operator, t, v)));
  }
  const neg = c.operator.startsWith('not') || c.operator === 'notEquals';
  // For a negative operator with several values, ALL values must be absent; for a positive one, ANY value may match.
  return neg ? c.values.every((v) => actual.some((a) => opTest(c.operator, a, v))) : c.values.some((v) => actual.some((a) => opTest(c.operator, a, v)));
}

const isExpired = (rule, now) => rule.expiresAt != null && now >= rule.expiresAt;

/** Rules for a trigger, in run order. Each trigger type is its own queue; ties are broken by creation order. */
export function queueFor(rules, trigger, now = Date.now()) {
  return rules
    .filter((r) => r.enabled && r.trigger === trigger && !isExpired(r, now))
    .sort((a, b) => a.order - b.order || a.seq - b.seq);
}

export const nextOrder = (rules, trigger) => 1 + Math.max(0, ...rules.filter((r) => r.trigger === trigger).map((r) => r.order));

export const ruleMatches = (rule, inc, change, updatedBy) => rule.conditions.every((c) => conditionHolds(c, inc, change, updatedBy));
