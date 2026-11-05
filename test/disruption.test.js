// Automatic attack disruption (set 1 Q1, set 2 Q2, set 5 Q4): what it needs, and the shortcuts that do not work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { getView } from '../server/http/views.js';
import { assess, applySetting, coversDevicesAndAccounts, LEVELS } from '../server/sim/disruption.js';

const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('attack-disruption'); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const set = (s, setting, value, group = '') => perform(s.ctx, 'disruption.set', { setting, value, group });
const reasons = (s) => Object.fromEntries(getView(s.world, 'disruption').cannot.map((c) => [c.action, c.why]));

test('the starting tenant can isolate a device but not contain it, and cannot disable an account; each gap has a reason', () => {
  const s = fresh();
  const v = getView(s.world, 'disruption');
  assert.ok(v.can.includes('Isolate device'), 'device isolation already works');
  const why = reasons(s);
  assert.match(why['Contain device'], /Standard discovery/);
  assert.match(why['Disable user'], /action account/);
  assert.deepEqual(['devices', 'accounts', 'restraint'].map((id) => met(s, id)), [false, false, false]);
});

test('Q4 distractor: device isolation alone does not meet the requirement — it addresses devices, not accounts', () => {
  const s = fresh();
  assert.ok(assess(s.world.disruption).can.includes('Isolate device'));
  assert.equal(coversDevicesAndAccounts(s.world.disruption), false);
  assert.equal(met(s, 'accounts'), false);
});

test('the account gap alone is not enough: devices must be contained too', () => {
  const s = fresh();
  assert.ok(set(s, 'actionAccount', 'on').ok);
  assert.equal(met(s, 'accounts'), false, 'Contain device still cannot run (Basic discovery)');
  assert.ok(set(s, 'discovery', 'Standard').ok);
  assert.deepEqual(['devices', 'accounts', 'restraint'].map((id) => met(s, id)), [true, true, true]);
});

test('the device gap alone is not enough either: Standard discovery does not disable accounts', () => {
  const s = fresh();
  set(s, 'discovery', 'Standard');
  assert.equal(met(s, 'devices'), true);
  assert.equal(met(s, 'accounts'), false);
});

test('each Defender for Identity prerequisite is independently required for Disable user, and says which one is missing', () => {
  const s = fresh();
  set(s, 'discovery', 'Standard'); set(s, 'actionAccount', 'on');
  assert.equal(met(s, 'accounts'), true);
  set(s, 'sensor', 'off');
  assert.match(reasons(s)['Disable user'], /sensor must be on the domain controller/);
  assert.equal(met(s, 'accounts'), false);
  set(s, 'sensor', 'on'); set(s, 'auditing', 'off');
  assert.match(reasons(s)['Disable user'], /auditing/);
  set(s, 'auditing', 'on'); set(s, 'actionAccount', 'off');
  assert.match(reasons(s)['Disable user'], /action account/);
});

test('restraint: opting a device group out of automated response (the shortcut) fails the restraint objective', () => {
  const s = fresh();
  set(s, 'discovery', 'Standard'); set(s, 'actionAccount', 'on');
  assert.equal(met(s, 'restraint'), true);
  assert.ok(set(s, 'automation', 'No automated response', 'Workstations').ok);
  assert.equal(met(s, 'restraint'), false, 'one group opted out');
  set(s, 'automation', LEVELS[1], 'Workstations');
  assert.equal(met(s, 'restraint'), true, 'a semi level still allows disruption without manual approval of containment');
});

test('with every group opted out, nothing is contained at all and the reason says so', () => {
  const s = fresh();
  set(s, 'discovery', 'Standard');
  set(s, 'automation', 'No automated response', 'Workstations');
  set(s, 'automation', 'No automated response', 'Servers');
  assert.equal(met(s, 'devices'), false);
  assert.match(reasons(s)['Isolate device'], /No automated response/);
});

test('products must be deployed: with Defender for Endpoint missing no device action can run', () => {
  const s = fresh();
  s.world.disruption.deployed.mde = false;
  const why = reasons(s);
  for (const a of ['Contain device', 'Contain IP', 'Isolate device', 'Contain user']) assert.match(why[a], /Defender for Endpoint is not deployed/);
  s.world.disruption.deployed.mdi = false;
  assert.match(reasons(s)['Disable user'], /Defender for Identity is not deployed/);
});

test('Defender for Cloud Apps needs the Microsoft 365 connector; Entra actions need the identity connection', () => {
  const s = fresh();
  s.world.disruption.deployed.mda = true;
  assert.match(reasons(s)['OAuth app compromise'], /Microsoft 365 connector/);
  set(s, 'officeConnector', 'on');
  assert.ok(!reasons(s)['OAuth app compromise']);
  assert.ok(assess(s.world.disruption).can.includes('Revoke user session'), 'Entra ID is deployed in this tenant');
});

test('validation: unknown setting, level, product, group and bad values are refused; applySetting does not mutate', () => {
  const s = fresh();
  assert.equal(set(s, 'nonsense', 'on').ok, false);
  assert.match(set(s, 'automation', 'Whenever', 'Workstations').error.message, /Unknown automation level/);
  assert.equal(set(s, 'automation', LEVELS[4], 'Nope').error.code, 'NotFound');
  assert.match(set(s, 'discovery', 'Deep').error.message, /Standard or Basic/);
  assert.match(set(s, 'deploy', 'constructor').error.message, /Unknown product/);
  const t = s.world.disruption;
  const before = JSON.stringify(t);
  applySetting(t, { setting: 'discovery', value: 'Standard' });
  assert.equal(JSON.stringify(t), before, 'applySetting returns a new tenant');
});

test('the changes are logged and the log is bounded; the view never exposes more than the posture', () => {
  const s = fresh();
  for (let i = 0; i < 120; i++) set(s, 'sensor', i % 2 ? 'on' : 'off');
  assert.ok(s.world.disruptionLog.length <= 100);
  const v = getView(s.world, 'disruption');
  assert.deepEqual(Object.keys(v).sort(), ['can', 'cannot', 'deployed', 'discovery', 'groups', 'levels', 'mdiAuditing', 'mdiSensorOnDc', 'actionAccountOk', 'mdaOfficeConnector', 'products'].sort());
});
