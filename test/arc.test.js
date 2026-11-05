// Azure Arc and data collection rule targets (set 1 Q13, set 2 Q15, set 5 Q14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { getView } from '../server/http/views.js';
import { pickerMachines, enableArc, applyCollectionRule } from '../server/sim/ingestion.js';

const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('arc-servers'); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const ALL = ['AZ-WEB01', 'AZ-WEB02', 'AZ-DB01', 'ONPREM-FS01', 'ONPREM-DC01', 'ONPREM-APP01'];
const ONPREM = ['ONPREM-FS01', 'ONPREM-DC01', 'ONPREM-APP01'];
const rule = (s, machineNames, location = 'eastus') => perform(s.ctx, 'sentinel.applyCollectionRule', { machineNames, location });
const arc = (s, machine) => perform(s.ctx, 'sentinel.enableArc', { machine });

test('the picker offers the Azure VMs and none of the on-premises servers until they are Arc-enabled', () => {
  const s = fresh();
  assert.deepEqual(getView(s.world, 'ingestion').picker, ['AZ-WEB01', 'AZ-WEB02', 'AZ-DB01']);
  arc(s, 'ONPREM-FS01');
  assert.deepEqual(getView(s.world, 'ingestion').picker, ['AZ-WEB01', 'AZ-WEB02', 'AZ-DB01', 'ONPREM-FS01']);
});

test('Q13 answer: install the Azure Connected Machine agent on the on-premises servers, then the rule reaches all six', () => {
  const s = fresh();
  for (const m of ONPREM) assert.ok(arc(s, m).ok);
  assert.equal(met(s, 'arc'), true);
  assert.equal(met(s, 'collect'), false, 'enabled for the picker, but no rule yet');
  assert.ok(rule(s, ALL).ok);
  assert.deepEqual(['arc', 'collect', 'minimal'].map((id) => met(s, id)), [true, true, true]);
});

test('targeting an on-premises server that is not Arc-enabled is refused, and the message says what to do', () => {
  const s = fresh();
  const out = rule(s, ['ONPREM-FS01']);
  assert.equal(out.ok, false);
  assert.match(out.error.message, /must be Azure Arc-enabled/);
  assert.match(out.error.message, /Azure Connected Machine agent/);
  assert.equal(s.world.sentinel.machines.some((m) => m.collecting), false, 'nothing partly applied');
});

test('a rule with a mix is refused as a whole: Azure VMs are not collected until every selected machine is valid', () => {
  const s = fresh();
  assert.equal(rule(s, ['AZ-WEB01', 'ONPREM-FS01']).ok, false);
  assert.equal(s.world.sentinel.machines.find((m) => m.name === 'AZ-WEB01').collecting, false, 'all-or-nothing');
});

test('an Azure VM needs no Arc agent and the portal says so; Arc twice is refused; unknown machines are refused', () => {
  const s = fresh();
  assert.match(arc(s, 'AZ-WEB01').error.message, /already an Azure resource/);
  assert.ok(arc(s, 'ONPREM-FS01').ok);
  assert.match(arc(s, 'ONPREM-FS01').error.message, /already Azure Arc-enabled/);
  assert.equal(arc(s, 'NOPE').error.code, 'NotFound');
  assert.match(rule(s, ['NOPE']).error.message, /not a machine in this environment/);
});

test('Q13 distractors: the rule\'s region must match the workspace (moving it elsewhere is not the fix), and nothing is selected is refused', () => {
  const s = fresh();
  for (const m of ONPREM) arc(s, m);
  const wrongRegion = rule(s, ALL, 'westus');
  assert.equal(wrongRegion.ok, false);
  assert.match(wrongRegion.error.message, /same region as the Log Analytics workspace \(eastus\)/);
  assert.equal(perform(s.ctx, 'sentinel.applyCollectionRule', { machineNames: [], location: 'eastus' }).ok, false);
  assert.equal(met(s, 'collect'), false);
});

test('installing Arc on an Azure VM is never possible, so the minimal objective cannot be failed that way; it holds after a full run', () => {
  const s = fresh();
  arc(s, 'AZ-WEB01');
  for (const m of ONPREM) arc(s, m);
  rule(s, ALL);
  assert.equal(met(s, 'minimal'), true);
  assert.equal(s.world.sentinel.machines.filter((m) => m.kind === 'Azure VM').every((m) => !m.arc), true);
});

test('collecting turns the seeded Windows Security Events connector to Connected', () => {
  const s = fresh();
  for (const m of ONPREM) arc(s, m);
  rule(s, ALL);
  const c = s.world.sentinel.connectors.find((x) => x.id === 'ama');
  assert.equal(c.status, 'Connected');
});

test('pure rules: pickerMachines, enableArc and applyCollectionRule do not mutate their inputs', () => {
  const machines = [{ name: 'A', kind: 'Azure VM' }, { name: 'B', kind: 'On-premises', arc: false }, { name: 'C', kind: 'On-premises', arc: true }];
  assert.deepEqual(pickerMachines(machines).map((m) => m.name), ['A', 'C']);
  const next = enableArc(machines[1]);
  assert.equal(next.arc, true);
  assert.equal(machines[1].arc, false, 'enableArc returns a copy');
  assert.deepEqual(applyCollectionRule({ machineNames: ['A', 'C', 'A'] }, { machines, dcrLocation: 'eastus', workspaceLocation: 'eastus' }), ['A', 'C'], 'duplicates collapse');
  assert.throws(() => applyCollectionRule({ machineNames: ['B'] }, { machines, dcrLocation: 'eastus', workspaceLocation: 'eastus' }), /Arc-enabled/);
});
