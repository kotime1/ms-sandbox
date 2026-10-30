// Automation rules, against learn.microsoft.com/en-us/azure/sentinel/create-manage-use-automation-rules (2026-07-01)
// and .../automate-incident-handling-with-automation-rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { raiseSentinelIncident, RG, ASI_PRINCIPAL } from '../server/sim/world.js';
import { conditionsFor, queueFor, conditionHolds } from '../server/sim/automation.js';

const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('sentinel-rbac'); return s; };
const save = (s, p) => perform(s.ctx, 'sentinel.saveAutomationRule', p);
// For test SETUP: fail loudly with the reason if a rule that should save is rejected.
const mustSave = (s, p) => { const o = save(s, p); assert.ok(o.ok, `setup: saving "${p.name}" failed: ${o.error?.message}`); return o; };
const raise = (s, over = {}) => raiseSentinelIncident(s.world, { title: 'Suspicious sign-in', severity: 'Medium', ruleId: 'rule-sch1', entities: [{ type: 'Account', name: 'a@contoso.com' }], ...over });
const SEV = (value) => ({ type: 'changeSeverity', severity: value });

function addPlaybook(s, name, trigger, withRole = true) {
  const id = `${RG}/providers/Microsoft.Logic/workflows/${name}`;
  s.world.azure.resources.push({ id, name, type: 'Microsoft.Logic/workflows', rg: 'rg-sentinel', location: 'eastus', playbook: { trigger, actions: [{ type: 'incident.comment', label: 'c', text: `${name} ran` }] }, identity: { systemAssigned: true, principalId: `mi-${name}` } });
  if (withRole) perform(s.ctx, 'azure.assignRole', { scope: RG, principalId: ASI_PRINCIPAL, role: 'Microsoft Sentinel Automation Contributor' });
  return id;
}

test('the three triggers exist, and the condition list differs per trigger (docs tables)', () => {
  const create = conditionsFor('incidentCreated').map((c) => c.id);
  const update = conditionsFor('incidentUpdated').map((c) => c.id);
  const alert = conditionsFor('alertCreated').map((c) => c.id);
  assert.deepEqual(alert, ['analyticRuleName'], 'the alert trigger supports only the analytic rule name');
  assert.ok(update.includes('updatedBy') && !create.includes('updatedBy'), 'Updated by exists only for the update trigger');
  assert.ok(update.includes('owner') && !create.includes('owner'));
  const sevOps = (t) => conditionsFor(t).find((c) => c.id === 'severity').operators.map((o) => o.id);
  assert.deepEqual(sevOps('incidentCreated'), ['equals', 'notEquals']);
  assert.ok(sevOps('incidentUpdated').includes('changedTo'));
});

test('rule creation is validated like the portal', () => {
  const s = fresh();
  const base = { name: 'r', trigger: 'incidentCreated', conditions: [], actions: [SEV('High')] };
  assert.ok(save(s, base).ok);
  assert.match(save(s, { ...base, actions: [] }).error.message, /at least 1 item|Add at least one action/);
  // alert trigger: only Run playbook, only the analytic rule name condition
  assert.match(save(s, { ...base, trigger: 'alertCreated' }).error.message, /Only the Run playbook action/);
  assert.match(save(s, { ...base, trigger: 'alertCreated', conditions: [{ property: 'severity', operator: 'equals', values: ['High'] }], actions: [{ type: 'runPlaybook', playbookId: 'x' }] }).error.message, /support only the Analytic rule name/);
  // property/operator pairs
  assert.match(save(s, { ...base, conditions: [{ property: 'severity', operator: 'contains', values: ['High'] }] }).error.message, /not available for Severity/);
  assert.match(save(s, { ...base, conditions: [{ property: 'updatedBy', operator: 'equals', values: ['User'] }] }).error.message, /not available as a condition/);
  assert.match(save(s, { ...base, conditions: [{ property: 'title', operator: 'contains', values: [] }] }).error.message, /Enter a value/);
  assert.match(save(s, { ...base, conditions: [{ property: 'severity', operator: 'equals', values: ['Critical'] }] }).error.message, /not a valid Severity/);
  assert.match(save(s, { ...base, conditions: [{ property: 'analyticRuleName', operator: 'contains', values: ['No such rule'] }] }).error.message, /does not exist/);
  // closing needs a classification (mandatory in the portal)
  assert.match(save(s, { ...base, actions: [{ type: 'changeStatus', status: 'Closed' }] }).error.message, /classification/);
  assert.ok(save(s, { ...base, actions: [{ type: 'changeStatus', status: 'Closed', classification: 'Benign Positive - suspicious but expected', comment: 'pen test' }] }).ok);
});

test('playbook choice follows the trigger: incident playbooks for incident triggers, alert playbooks for the alert trigger', () => {
  const s = fresh();
  const inc = addPlaybook(s, 'IncPB', 'incident');
  const alr = addPlaybook(s, 'AlrPB', 'alert', false);
  assert.ok(save(s, { name: 'a', trigger: 'incidentCreated', conditions: [], actions: [{ type: 'runPlaybook', playbookId: inc }] }).ok);
  assert.match(save(s, { name: 'b', trigger: 'incidentCreated', conditions: [], actions: [{ type: 'runPlaybook', playbookId: alr }] }).error.message, /incident trigger/);
  assert.ok(save(s, { name: 'c', trigger: 'alertCreated', conditions: [], actions: [{ type: 'runPlaybook', playbookId: alr }] }).ok);
  assert.match(save(s, { name: 'd', trigger: 'alertCreated', conditions: [], actions: [{ type: 'runPlaybook', playbookId: inc }] }).error.message, /alert trigger/);
});

test('conditions are case-insensitive; several values on one condition are ORed; AND across conditions', () => {
  const s = fresh();
  save(s, { name: 'tag it', trigger: 'incidentCreated', conditions: [{ property: 'title', operator: 'contains', values: ['SIGN-IN', 'phishing'] }, { property: 'severity', operator: 'equals', values: ['medium'] === ['x'] ? [] : ['Medium'] }], actions: [{ type: 'addTags', tags: ['triaged'] }] });
  assert.deepEqual(raise(s).tags, ['triaged'], 'case-insensitive contains, severity matches');
  assert.deepEqual(raise(s, { title: 'Phishing email' }).tags, ['triaged'], 'second value matches (OR within a condition)');
  assert.deepEqual(raise(s, { title: 'Unrelated' }).tags, [], 'neither value matches');
  assert.deepEqual(raise(s, { severity: 'High' }).tags, [], 'AND: the severity condition fails');
});

test('"does not contain" with several values requires ALL of them to be absent', () => {
  const inc = { title: 'Suspicious sign-in from Paris', tags: [] };
  const c = (values) => ({ property: 'title', operator: 'notContains', values });
  assert.equal(conditionHolds(c(['berlin', 'london']), inc), true);
  assert.equal(conditionHolds(c(['berlin', 'paris']), inc), false);
});

test('actions: assign owner, change status/severity, add tags run in order and the closing reason is recorded', () => {
  const s = fresh();
  save(s, {
    name: 'triage', trigger: 'incidentCreated', conditions: [],
    actions: [{ type: 'assignOwner', owner: 'soc.analyst1@contoso.com' }, SEV('High'), { type: 'changeStatus', status: 'Active' }, { type: 'addTags', tags: ['auto', 'Auto'] }],
  });
  const inc = raise(s);
  assert.equal(inc.owner, 'soc.analyst1@contoso.com');
  assert.equal(inc.severity, 'High');
  assert.equal(inc.status, 'Active');
  assert.deepEqual(inc.tags, ['auto'], 'tags are de-duplicated case-insensitively');

  save(s, { name: 'close noise', trigger: 'incidentCreated', conditions: [{ property: 'title', operator: 'startsWith', values: ['Pen test'] }], actions: [{ type: 'changeStatus', status: 'Closed', classification: 'Benign Positive - suspicious but expected', comment: 'Planned test' }] });
  const noise = raise(s, { title: 'Pen test traffic' });
  assert.equal(noise.status, 'Closed');
  assert.equal(noise.classification, 'Benign Positive - suspicious but expected');
  assert.equal(noise.closedComment, 'Planned test');
});

test('order decides who runs first, and a later rule sees the earlier rule\'s changes ("First Automation Rule" example)', () => {
  const s = fresh();
  // Rule A lowers Medium to Low; Rule B only runs on Medium or higher. If A runs first, B must NOT run.
  mustSave(s, { name: 'A lower', trigger: 'incidentCreated', order: 1, conditions: [], actions: [SEV('Low')] });
  mustSave(s, { name: 'B tag medium+', trigger: 'incidentCreated', order: 2, conditions: [{ property: 'severity', operator: 'equals', values: ['Medium'] }], actions: [{ type: 'addTags', tags: ['saw-medium'] }] });
  assert.deepEqual(raise(s).tags, [], 'B ran after A had already lowered the severity');
  // Swap the order: B runs first and sees Medium.
  const rules = s.world.sentinel.automationRules;
  rules.find((r) => r.name === 'A lower').order = 3;
  assert.deepEqual(raise(s).tags, ['saw-medium']);
  assert.deepEqual(queueFor(rules, 'incidentCreated').map((r) => r.name), ['B tag medium+', 'A lower']);
});

test('each trigger type has its own order queue; new rules get the next number in their own queue', () => {
  const s = fresh();
  const o = (p) => s.world.sentinel.automationRules.find((r) => r.name === p).order;
  save(s, { name: 'c1', trigger: 'incidentCreated', conditions: [], actions: [SEV('Low')] });
  save(s, { name: 'c2', trigger: 'incidentCreated', conditions: [], actions: [SEV('Low')] });
  save(s, { name: 'u1', trigger: 'incidentUpdated', conditions: [{ property: 'status', operator: 'changed', values: [] }], actions: [{ type: 'addTags', tags: ['x'] }] });
  assert.deepEqual([o('c1'), o('c2'), o('u1')], [1, 2, 1]);
});

test('disabled and expired rules do not run', () => {
  const s = fresh();
  const r = save(s, { name: 'tagger', trigger: 'incidentCreated', conditions: [], actions: [{ type: 'addTags', tags: ['t'] }] });
  assert.deepEqual(raise(s).tags, ['t']);
  perform(s.ctx, 'sentinel.setAutomationRuleEnabled', { id: r.data.rule.id, enabled: false });
  assert.deepEqual(raise(s).tags, []);
  perform(s.ctx, 'sentinel.setAutomationRuleEnabled', { id: r.data.rule.id, enabled: true });
  assert.deepEqual(raise(s).tags, ['t']);
  save(s, { id: r.data.rule.id, name: 'tagger', trigger: 'incidentCreated', conditions: [], actions: [{ type: 'addTags', tags: ['t'] }], expiresAt: Date.now() - 1000 });
  assert.deepEqual(raise(s).tags, [], 'a rule past its expiration date no longer runs');
});

test('update trigger: analyst changes fire it, with state-change operators and "Updated by"', () => {
  const s = fresh();
  save(s, { name: 'escalate on close', trigger: 'incidentUpdated', conditions: [{ property: 'status', operator: 'changedTo', values: ['Closed'] }, { property: 'updatedBy', operator: 'equals', values: ['User'] }], actions: [{ type: 'addTags', tags: ['was-closed'] }] });
  const inc = raise(s);
  assert.match(perform(s.ctx, 'sentinel.updateIncident', { incidentId: inc.id, status: 'Closed' }).error.message, /classification/, 'closing needs a closing reason');
  assert.ok(perform(s.ctx, 'sentinel.updateIncident', { incidentId: inc.id, status: 'Closed', classification: 'True Positive - suspicious activity' }).ok);
  assert.deepEqual(inc.tags, ['was-closed']);
  // a different change does not match
  const inc2 = raise(s);
  perform(s.ctx, 'sentinel.updateIncident', { incidentId: inc2.id, status: 'Active' });
  assert.deepEqual(inc2.tags, []);
});

test('changes made by a create-trigger rule fire update rules ("Updated by: Automation rule"), and loops are bounded', () => {
  const s = fresh();
  save(s, { name: 'raise sev', trigger: 'incidentCreated', conditions: [], actions: [SEV('High')] });
  save(s, { name: 'react to rule', trigger: 'incidentUpdated', conditions: [{ property: 'severity', operator: 'changedTo', values: ['High'] }, { property: 'updatedBy', operator: 'equals', values: ['Automation rule'] }], actions: [{ type: 'addTags', tags: ['rule-changed-it'] }] });
  assert.deepEqual(raise(s).tags, ['rule-changed-it']);
  // Two update rules that keep undoing each other must not loop forever.
  const t = fresh();
  save(t, { name: 'up', trigger: 'incidentUpdated', conditions: [{ property: 'severity', operator: 'changed', values: [] }], actions: [SEV('High')] });
  save(t, { name: 'down', trigger: 'incidentUpdated', conditions: [{ property: 'severity', operator: 'changed', values: [] }], actions: [SEV('Low')] });
  const inc = raise(t);
  assert.doesNotThrow(() => perform(t.ctx, 'sentinel.updateIncident', { incidentId: inc.id, severity: 'Medium' }));
});

test('alert trigger: fires only for Scheduled and NRT rules, and runs only a playbook', () => {
  const s = fresh();
  const pb = addPlaybook(s, 'AlertPB', 'alert');
  save(s, { name: 'alert pb', trigger: 'alertCreated', conditions: [{ property: 'analyticRuleName', operator: 'contains', values: ['NRTRule1'] }], actions: [{ type: 'runPlaybook', playbookId: pb }] });
  assert.deepEqual(perform(s.ctx, 'sentinel.raiseAlertForRule', { ruleId: 'rule-nrt1' }).data.ran, ['alert pb']);
  assert.deepEqual(perform(s.ctx, 'sentinel.raiseAlertForRule', { ruleId: 'rule-sch1' }).data.ran, [], 'the rule-name condition filters');
  assert.match(perform(s.ctx, 'sentinel.raiseAlertForRule', { ruleId: 'rule-fusion' }).error.message, /only fires for alerts created by Scheduled or NRT/);
});

test('Sentinel needs permission on the playbook\'s resource group; without it the playbook action fails visibly', () => {
  const s = fresh();
  const pb = addPlaybook(s, 'NoRole', 'incident', false);
  save(s, { name: 'run', trigger: 'incidentCreated', conditions: [], actions: [{ type: 'runPlaybook', playbookId: pb }] });
  const inc = raise(s);
  assert.equal(s.world.sentinel.runs[0].status, 'Failed');
  assert.match(s.world.sentinel.runs[0].error, /does not have permission/);
  assert.equal(inc.runs.length, 1);
  perform(s.ctx, 'azure.assignRole', { scope: RG, principalId: ASI_PRINCIPAL, role: 'Microsoft Sentinel Automation Contributor' });
  assert.equal(raise(s).runs.length, 1);
  assert.equal(s.world.sentinel.runs[0].status, 'Succeeded');
});

test('the old createAutomationRule call still works and builds a normal rule', () => {
  const s = fresh();
  const pb = addPlaybook(s, 'Legacy', 'incident');
  const out = perform(s.ctx, 'sentinel.createAutomationRule', { name: 'legacy', ruleIds: ['rule-sch1'], playbookId: pb });
  assert.ok(out.ok, out.error?.message);
  const rule = s.world.sentinel.automationRules[0];
  assert.equal(rule.trigger, 'incidentCreated');
  assert.deepEqual(rule.conditions, [{ property: 'analyticRuleName', operator: 'contains', values: ['Rule3 - Rare admin sign-in'] }]);
  assert.equal(raise(s).runs.length, 1);
  assert.equal(raise(s, { ruleId: 'rule-nrt1' }).runs.length, 0, 'only the named analytics rule');
});

test('input to saveAutomationRule is validated as nested data: unknown keys dropped, prototype keys inert, sizes capped', () => {
  const s = fresh();
  const evil = { name: 'x', trigger: 'incidentCreated', conditions: [{ property: 'title', operator: 'contains', values: ['a'], __proto__: { polluted: true }, constructor: { prototype: { polluted: true } } }], actions: [{ type: 'addTags', tags: ['t'], extra: 'dropped' }] };
  assert.ok(save(s, JSON.parse(JSON.stringify(evil))).ok);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.keys(s.world.sentinel.automationRules[0].actions[0]).includes('extra'), false);
  assert.equal(save(s, { name: 'x', trigger: 'nope', conditions: [], actions: [SEV('Low')] }).error.code, 'ValidationError');
  assert.equal(save(s, { name: 'x', trigger: 'incidentCreated', conditions: Array(11).fill({ property: 'title', operator: 'contains', values: ['a'] }), actions: [SEV('Low')] }).error.code, 'ValidationError');
  assert.equal(save(s, { name: '<script>', trigger: 'incidentCreated', conditions: [], actions: [SEV('Low')] }).error.code, 'ValidationError');
});

test('rule names accept normal analyst punctuation but never markup characters', () => {
  const s = fresh();
  for (const n of ['Tag medium+ incidents', 'Triage #1 (EU) & US', 'SOC | Tier 1', 'owner=analyst1']) {
    const o = save(s, { name: n, trigger: 'incidentCreated', conditions: [], actions: [SEV('Low')] });
    assert.ok(o.ok, `${n}: ${o.error?.message}`);
  }
  for (const n of ['<img src=x onerror=1>', 'a"b', 'a`b', 'a${b}', 'x\u0000y']) {
    assert.equal(save(s, { name: n, trigger: 'incidentCreated', conditions: [], actions: [SEV('Low')] }).error.code, 'ValidationError', n);
  }
});

test('Manage playbook permissions grants Sentinel the role on a resource group, and needs Owner there', () => {
  const s = fresh();
  const pb = addPlaybook(s, 'GrantMe', 'incident', false);
  assert.equal(s.world.azure.assignments.some((a) => a.principalId === ASI_PRINCIPAL), false);
  assert.match(perform(s.ctx, 'sentinel.grantPlaybookPermission', { resourceGroup: 'rg-nothing' }).error.message, /contains no playbooks/);
  assert.equal(perform(s.ctx, 'sentinel.grantPlaybookPermission', { resourceGroup: 'bad name!' }).error.code, 'ValidationError');
  const ok = perform(s.ctx, 'sentinel.grantPlaybookPermission', { resourceGroup: 'rg-sentinel' });
  assert.ok(ok.ok, ok.error?.message); // regression: hyphenated names must validate
  assert.ok(s.world.azure.assignments.some((a) => a.principalId === ASI_PRINCIPAL && a.role === 'Microsoft Sentinel Automation Contributor'));
  assert.match(perform(s.ctx, 'sentinel.grantPlaybookPermission', { resourceGroup: 'rg-sentinel' }).error.message, /already has permission/);
  assert.ok(save(s, { name: 'now ok', trigger: 'incidentCreated', conditions: [], actions: [{ type: 'runPlaybook', playbookId: pb }] }).ok);
  assert.equal(raise(s).runs.length, 1);
  // Without Owner on the group the portal refuses.
  const t = fresh();
  addPlaybook(t, 'NoOwner', 'incident', false);
  t.world.azure.assignments.length = 0;
  assert.match(perform(t.ctx, 'sentinel.grantPlaybookPermission', { resourceGroup: 'rg-sentinel' }).error.message, /need the Owner role/);
});
