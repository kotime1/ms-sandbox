// The ONLY way the front-end changes the world.
//
// Every portal button maps to one action here. Each action declares a validation spec, so
// by the time `run` executes, params are typed, bounded and stripped of unknown keys.
// The learner is always the same simulated identity; actions authorize against the
// simulated RBAC where the exam topic is about permissions.

import { validateObject, idSpec } from '../core/validate.js';
import { ROLES, getRole } from './rbac.js';
import {
  SUB, RG, WS_ID, LEARNER, ASI_PRINCIPAL, SimError, capCheck, resource, device, can, query, runPlaybook, runDetections,
  raiseDefenderAlert, REQUIRED_DETECTION_COLUMNS, ENTITY_COLUMNS,
} from './world.js';
import { runQuery } from './kql/engine.js';
import { tablesFor } from './world.js';
import { runScenario } from '../attacks/scenarios.js';
import { EXTRA_ACTIONS } from './actions-extra.js';
import { AUTOMATION_ACTIONS } from './actions-automation.js';
import { DETECTION_ACTIONS } from './actions-detections.js';

const LEARNER_ID = 'u-admin1';
const name = (extra = {}) => ({ type: 'string', min: 1, max: 80, pattern: /^[\w .:()-]+$/, ...extra });

export const SCOPES = [
  { id: `/subscriptions/${SUB}`, label: 'Subscription: Sandbox' },
  { id: RG, label: 'Resource group: rg-sentinel' },
  { id: `/subscriptions/${SUB}/resourceGroups/rg-workloads`, label: 'Resource group: rg-workloads' },
];

export function listScopes(w) {
  return [...SCOPES, ...w.azure.resources.map((r) => ({ id: r.id, label: `${r.type.split('/').pop()}: ${r.name}` }))];
}

export function listPrincipals(w) {
  const users = Array.from(new Set(w.tables.get('SigninLogs').rows.map((r) => r.UserPrincipalName)))
    .map((u) => ({ id: `u-${u.split('@')[0]}`, name: u, type: 'User' }));
  if (!users.some((u) => u.id === LEARNER_ID)) users.push({ id: LEARNER_ID, name: LEARNER, type: 'User' });
  const idents = w.azure.resources.filter((r) => r.identity?.systemAssigned).map((r) => ({ id: r.identity.principalId, name: r.name, type: 'Managed identity' }));
  const apps = [{ id: ASI_PRINCIPAL, name: 'Azure Security Insights', type: 'Service principal' }];
  return [...users, ...idents, ...apps].sort((a, b) => a.name.localeCompare(b.name));
}

const principalById = (w, id) => listPrincipals(w).find((p) => p.id === id) ?? null;
const scopeValid = (w, id) => listScopes(w).some((s) => s.id === id);

const incident = (w, id) => {
  const inc = w.sentinel.incidents.find((i) => i.id === id);
  if (!inc) throw new SimError('Incident not found', 'NotFound');
  return inc;
};

export const ACTIONS = {
  // --- navigation breadcrumbs (lets the lab-agent see which blades the learner has visited)
  'ui.visit': {
    spec: { page: { type: 'string', max: 80, pattern: /^[a-z0-9/_-]+$/i } },
    run: () => ({}),
  },

  // --- Azure RBAC
  'azure.assignRole': {
    spec: { scope: { type: 'string', max: 300 }, principalId: idSpec(), role: { type: 'string', max: 80 } },
    run({ w }, p) {
      if (!scopeValid(w, p.scope)) throw new SimError('The scope is invalid.');
      const principal = principalById(w, p.principalId);
      if (!principal) throw new SimError('PrincipalNotFound: The principal does not exist in the directory.');
      if (!getRole(p.role)) throw new SimError('RoleDefinitionDoesNotExist: The specified role definition does not exist.');
      if (w.azure.assignments.some((a) => a.scope === p.scope && a.principalId === p.principalId && a.role === p.role)) {
        throw new SimError('RoleAssignmentExists: The role assignment already exists.');
      }
      capCheck(w.azure.assignments, 'assignments');
      const a = { id: `ra-${w.counters.rule++}`, scope: p.scope, principalId: p.principalId, principalName: principal.name, role: p.role, createdBy: LEARNER };
      w.azure.assignments.push(a);
      return { assignment: a };
    },
  },
  'azure.removeRole': {
    spec: { id: idSpec() },
    run({ w }, p) {
      const i = w.azure.assignments.findIndex((a) => a.id === p.id);
      if (i < 0) throw new SimError('Role assignment not found', 'NotFound');
      if (w.azure.assignments[i].createdBy === 'system') throw new SimError('This built-in assignment is locked in the sandbox.');
      w.azure.assignments.splice(i, 1);
      return {};
    },
  },

  // --- Logic App / playbook configuration
  'logicapp.setIdentity': {
    spec: { resourceId: { type: 'string', max: 300 }, systemAssigned: { type: 'boolean' } },
    run({ w }, p) {
      const r = resource(w, p.resourceId);
      if (!r?.playbook) throw new SimError('Logic app not found', 'NotFound');
      r.identity = { systemAssigned: p.systemAssigned, principalId: r.identity?.principalId ?? `mi-${r.name.toLowerCase()}` };
      return {};
    },
  },
  'logicapp.setTrigger': {
    spec: { resourceId: { type: 'string', max: 300 }, trigger: { type: 'enum', values: ['alert', 'incident'] } },
    run({ w }, p) {
      const r = resource(w, p.resourceId);
      if (!r?.playbook) throw new SimError('Logic app not found', 'NotFound');
      r.playbook.trigger = p.trigger;
      return {};
    },
  },

  // --- Sentinel incidents, playbooks, automation
  'sentinel.runPlaybook': {
    spec: { playbookId: { type: 'string', max: 300 }, incidentId: idSpec() },
    run({ w }, p) {
      const inc = incident(w, p.incidentId);
      const pb = resource(w, p.playbookId);
      if (!pb?.playbook) throw new SimError('Playbook not found', 'NotFound');
      if (pb.playbook.trigger !== 'incident') {
        throw new SimError('This playbook is not available from the incident because it does not use the Microsoft Sentinel incident trigger.');
      }
      if (!can(w, LEARNER_ID, 'playbook.run', WS_ID)) throw new SimError('You do not have permission to run playbooks.', 'Forbidden');
      return { run: runPlaybook(w, { playbookId: p.playbookId, incident: inc, by: LEARNER }) };
    },
  },
  'sentinel.deleteAutomationRule': {
    spec: { id: idSpec() },
    run({ w }, p) {
      const i = w.sentinel.automationRules.findIndex((r) => r.id === p.id);
      if (i < 0) throw new SimError('Automation rule not found', 'NotFound');
      w.sentinel.automationRules.splice(i, 1);
      return {};
    },
  },

  // --- Queries (Logs blade / Advanced hunting)
  'query.run': {
    // `surface` is legacy: Advanced hunting is one page covering every table. Optional and ignored for access.
    spec: { surface: { type: 'enum', values: ['sentinel', 'defender'], optional: true, default: 'sentinel' }, text: { type: 'string', max: 4000, min: 1 } },
    run({ w }, p) {
      const res = query(w, p.surface, p.text);
      w.queries.push({ surface: p.surface, text: p.text, columns: res.columns.map((c) => c.name), records: res.records.slice(0, 200), tables: res.meta.tables, ops: res.meta.ops, render: res.meta.render });
      if (w.queries.length > 60) w.queries.shift();
      return { result: { columns: res.columns, rows: res.rows, meta: res.meta } };
    },
  },

  // --- Defender for Endpoint
  'defender.createSuppression': {
    spec: {
      alertTitle: name({ max: 120 }),
      iocType: { type: 'enum', values: ['none', 'process'], optional: true, default: 'none' },
      iocValue: name({ optional: true, default: '' }),
      scope: { type: 'enum', values: ['organization', 'device'] },
      deviceId: idSpec({ optional: true }),
      action: { type: 'enum', values: ['hide', 'resolve'] },
    },
    run({ w }, p) {
      capCheck(w.defender.suppression, 'suppression');
      if (p.scope === 'device' && !device(w, p.deviceId)) throw new SimError('Pick a device for a device-scoped rule.');
      if (p.iocType !== 'none' && !p.iocValue) throw new SimError('Enter the value for the indicator condition.');
      const rule = {
        id: `sup-${w.counters.rule++}`, alertTitle: p.alertTitle,
        ioc: p.iocType === 'none' ? null : { type: p.iocType, value: p.iocValue },
        scope: p.scope, deviceId: p.scope === 'device' ? p.deviceId : null, action: p.action,
      };
      w.defender.suppression.push(rule);
      return { rule };
    },
  },
  'defender.deleteSuppression': {
    spec: { id: idSpec() },
    run({ w }, p) {
      const i = w.defender.suppression.findIndex((r) => r.id === p.id);
      if (i < 0) throw new SimError('Rule not found', 'NotFound');
      w.defender.suppression.splice(i, 1);
      return {};
    },
  },
  'defender.isolateDevice': {
    spec: { deviceId: idSpec(), release: { type: 'boolean', optional: true, default: false } },
    run({ w }, p) {
      const d = device(w, p.deviceId);
      if (!d) throw new SimError('Device not found', 'NotFound');
      d.isolated = !p.release;
      return {};
    },
  },
  'defender.deleteDetection': {
    spec: { id: idSpec() },
    run({ w }, p) {
      const i = w.defender.detections.findIndex((r) => r.id === p.id);
      if (i < 0) throw new SimError('Detection not found', 'NotFound');
      w.defender.detections.splice(i, 1);
      return {};
    },
  },
  'defender.setAlertStatus': {
    spec: { alertId: idSpec(), status: { type: 'enum', values: ['New', 'In progress', 'Resolved'] } },
    run({ w }, p) {
      const a = w.defender.alerts.find((x) => x.id === p.alertId);
      if (!a) throw new SimError('Alert not found', 'NotFound');
      a.status = p.status;
      return {};
    },
  },

  // --- Attack-agent (learner-triggered, scoped to the active lab by the lab-agent)
  'attack.run': {
    spec: { scenario: idSpec() },
    run: ({ bus }, p) => ({ message: bus.request('attack.run', { scenario: p.scenario }) }),
  },
};

Object.assign(ACTIONS, EXTRA_ACTIONS, AUTOMATION_ACTIONS, DETECTION_ACTIONS);

export const ROLE_CATALOG = ROLES.map(({ name: n, description, privileged }) => ({ name: n, description, privileged }));

/**
 * Validate and execute one action. Returns { ok, data?, error? } and appends to the audit log.
 * Unknown action names are rejected via Object.hasOwn so `__proto__`/`constructor` never resolve.
 */
export function perform(ctx, type, rawParams) {
  const { w } = ctx;
  const entry = { at: Date.now(), action: String(type).slice(0, 60), ok: false };
  const record = (extra) => {
    Object.assign(entry, extra);
    w.log.push(entry);
    if (w.log.length > 500) w.log.shift();
  };
  if (typeof type !== 'string' || !Object.hasOwn(ACTIONS, type)) {
    record({ error: 'unknown action' });
    return { ok: false, error: { code: 'UnknownAction', message: 'Unknown action' } };
  }
  const def = ACTIONS[type];
  try {
    const params = validateObject(def.spec, rawParams);
    entry.params = type === 'query.run' ? { surface: params.surface } : { ...params };
    const data = def.run(ctx, params) ?? {};
    record({ ok: true });
    ctx.bus.emit('action', { type, params, ok: true });
    return { ok: true, data };
  } catch (e) {
    const known = e instanceof SimError || e?.name === 'ValidationError';
    const code = e instanceof SimError ? e.code : e?.name === 'ValidationError' ? 'ValidationError' : 'InternalError';
    record({ error: known ? e.message : 'internal error' });
    ctx.bus.emit('action', { type, params: entry.params, ok: false, error: known ? e.message : null });
    if (!known) console.error('[action] unexpected error in', type, e);
    return { ok: false, error: { code, message: known ? e.message : 'Something went wrong in the sandbox.' } };
  }
}

export { runScenario };
