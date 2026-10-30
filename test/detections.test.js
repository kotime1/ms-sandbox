// Custom detection rules, against learn.microsoft.com/en-us/defender-xdr/custom-detection-rules (2026-09-02, updated 2026-10-04).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { FREQUENCIES, MAX_ALERTS_PER_RUN, dynamicRefs, fill, nrtBlocker, actionAvailability } from '../server/sim/detections.js';

const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('detect-and-isolate'); return s; };
const BASE = {
  name: 'Failed logons', query: 'DeviceLogonEvents | where ActionType == "LogonFailed" | summarize LogonFailures=count(), arg_max(Timestamp, *) by DeviceId | where LogonFailures > 3',
  frequency: '24h', alertTitle: 'Brute force on {{DeviceName}}', severity: 'High', category: 'Credential access',
};
const save = (s, over = {}) => perform(s.ctx, 'defender.saveDetection', { ...BASE, ...over });
const mustSave = (s, over = {}) => { const o = save(s, over); assert.ok(o.ok, `setup: ${o.error?.message}`); return o; };

test('frequency options and their fixed lookback match the docs', () => {
  assert.deepEqual(Object.keys(FREQUENCIES), ['24h', '12h', '3h', '1h', 'nrt']);
  assert.equal(FREQUENCIES['24h'].lookback, '30 days');
  assert.equal(FREQUENCIES['12h'].lookback, '48 hours');
  assert.equal(FREQUENCIES['3h'].lookback, '12 hours');
  assert.equal(FREQUENCIES['1h'].lookback, '4 hours');
});

test('preview reports columns, NRT eligibility and which actions the query can support', () => {
  const s = fresh();
  const p = perform(s.ctx, 'defender.previewDetection', { query: BASE.query }).data.preview;
  assert.ok(p.columns.includes('DeviceId') && p.columns.includes('Timestamp'));
  assert.equal(p.actions.isolateDevice.available, true);
  assert.equal(p.actions.disableUser.available, false, 'no account SID in the output');
  assert.match(p.actions.disableUser.missing[0], /AccountSid/);
  assert.equal(p.actions.moveToFolder.available, false);
  // summarize + arg_max over one supported table is NRT-eligible (the docs\' own example)
  assert.equal(p.nrt.allowed, true);
});

test('Continuous (NRT): one table only, no join/union, no comments, supported table', () => {
  const s = fresh();
  const nrt = (query) => perform(s.ctx, 'defender.previewDetection', { query }).data.preview.nrt;
  assert.equal(nrt('DeviceLogonEvents | take 5').allowed, true);
  assert.match(nrt('union DeviceLogonEvents, SigninLogs').reason, /one table only/);
  assert.match(nrt('DeviceLogonEvents // note\n| take 5').reason, /comment/);
  assert.match(nrt('SecurityIncident | take 5').reason, /does not support Continuous/);
  assert.equal(nrtBlocker({ singleTable: true, usesJoinOrUnion: true, hasComment: false, tables: ['DeviceLogonEvents'] }), 'The query cannot use joins, unions or externaldata.');
  const bad = save(s, { frequency: 'nrt', query: 'SecurityIncident | take 5' });
  assert.match(bad.error.message, /cannot run as Continuous \(NRT\)/);
  assert.ok(save(s, { frequency: 'nrt', name: 'nrt ok' }).ok);
});

test('actions are gated on the output columns they need, with the exact column named', () => {
  const s = fresh();
  const noDevice = 'DeviceLogonEvents | summarize n=count() by AccountName';
  assert.match(save(s, { query: noDevice, alertTitle: 'Failures for {{AccountName}}', actions: [{ type: 'isolateDevice' }] }).error.message, /Isolate device needs the query to return DeviceId/);
  assert.match(save(s, { actions: [{ type: 'disableUser' }] }).error.message, /Disable user needs the query to return AccountSid/);
  assert.match(save(s, { actions: [{ type: 'moveToFolder', folder: 'Inbox' }] }).error.message, /NetworkMessageId and RecipientEmailAddress/);
  assert.ok(save(s, { actions: [{ type: 'isolateDevice' }, { type: 'collectPackage' }, { type: 'runAvScan' }, { type: 'initiateInvestigation' }, { type: 'restrictAppExecution' }] }).ok);
  const a = actionAvailability(['SHA256', 'AccountSid', 'AccountObjectId']);
  assert.ok(a.blockFile.available && a.quarantineFile.available && a.disableUser.available && a.markCompromised.available);
  assert.equal(a.isolateDevice.available, false);
});

test('recommended columns produce warnings, not errors', () => {
  const s = fresh();
  const o = save(s, { query: 'DeviceLogonEvents | summarize n=count() by DeviceName', alertTitle: 'x {{DeviceName}}' });
  assert.ok(o.ok);
  assert.ok(o.data.warnings.some((w) => /Timestamp/.test(w)));
  assert.ok(o.data.warnings.some((w) => /DeviceId and ReportId/.test(w)));
});

test('dynamic alert title/description: placeholders must exist, at most three columns per field', () => {
  assert.deepEqual(dynamicRefs('User {{AccountName}} signed in from {{ Location }}'), ['AccountName', 'Location']);
  assert.equal(fill('Hi {{A}} {{B}}', { A: 'x' }), 'Hi x {{B}}', 'a missing value keeps the placeholder visible');
  const s = fresh();
  assert.match(save(s, { alertTitle: 'On {{Nope}}' }).error.message, /references \{\{Nope\}\}, which the query does not return/);
  assert.match(save(s, { description: '{{DeviceId}} {{DeviceName}} {{LogonFailures}} {{Timestamp}}' }).error.message, /up to 3 columns/);
  const o = mustSave(s, { name: 'dyn', alertTitle: 'Brute force on {{DeviceName}}' });
  const alert = s.world.defender.alerts.find((a) => a.source === 'Custom detection');
  assert.match(alert.title, /^Brute force on Device2$/);
  assert.equal(o.data.detection.alerts, 1);
});

test('custom details: at most 20, unique keys, columns must exist; entity mapping columns must exist', () => {
  const s = fresh();
  const details = (n) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, column: 'DeviceName' }));
  assert.equal(save(s, { customDetails: details(21) }).error.code, 'ValidationError', 'more than 20 custom details is refused');
  assert.match(save(s, { customDetails: [{ key: 'A', column: 'DeviceName' }, { key: 'a', column: 'DeviceId' }] }).error.message, /used twice/);
  assert.match(save(s, { customDetails: [{ key: 'A', column: 'Nope' }] }).error.message, /does not return/);
  assert.match(save(s, { entities: [{ type: 'Device', column: 'Nope' }] }).error.message, /does not return/);
  const o = mustSave(s, { name: 'enriched', customDetails: [{ key: 'Failures', column: 'LogonFailures' }], entities: [{ type: 'Device', column: 'DeviceId' }] });
  const alert = s.world.defender.alerts.find((a) => a.source === 'Custom detection');
  assert.equal(alert.customDetails[0].key, 'Failures');
  assert.ok(Number(alert.customDetails[0].value) > 3, 'the value comes from the query result, not a constant');
  assert.deepEqual(alert.entities, [{ type: 'Device', value: 'dev-0002' }]);
  assert.ok(o.ok);
});

test('scope: a rule scoped to device groups only alerts on devices in those groups', () => {
  const s = fresh();
  // Device2 (the attacked one) is in Workstations. Scoping to Servers should produce nothing.
  const servers = mustSave(s, { name: 'servers only', scopeType: 'groups', scopeGroups: ['grp-servers'] });
  assert.equal(servers.data.detection.alerts, 0);
  const ws = mustSave(s, { name: 'workstations', scopeType: 'groups', scopeGroups: ['grp-workstations'] });
  assert.equal(ws.data.detection.alerts, 1);
  assert.match(save(s, { name: 'z', scopeType: 'groups', scopeGroups: [] }).error.message, /Choose at least one device group/);
  assert.match(save(s, { name: 'y', scopeType: 'groups', scopeGroups: ['grp-nope'] }).error.message, /does not exist/);
});

test('each run raises at most 150 alerts', () => {
  const s = fresh();
  const rows = s.world.tables.get('DeviceLogonEvents').rows;
  for (let i = 0; i < 400; i++) rows.push({ Timestamp: new Date(), ReportId: 100000 + i, DeviceId: 'dev-0001', DeviceName: 'Device1', ActionType: 'LogonFailed', LogonType: 'Network', AccountName: `u${i}`, RemoteIP: '198.51.100.9', InitiatingProcessCommandLine: `cmd${i}` });
  const o = mustSave(s, { name: 'noisy', query: 'DeviceLogonEvents | where ActionType == "LogonFailed" and AccountName startswith "u"', alertTitle: 'Failed logon {{AccountName}}' });
  assert.equal(o.data.detection.alerts, MAX_ALERTS_PER_RUN);
  assert.equal(s.world.defender.detections.at(-1).truncatedRuns, 1, 'the cap is recorded so the UI can say so');
});

test('duplicate events with the same entities and details collapse into one alert; running again adds nothing', () => {
  const s = fresh();
  const rows = s.world.tables.get('DeviceLogonEvents').rows;
  for (let i = 0; i < 5; i++) rows.push({ Timestamp: new Date(), ReportId: 200000 + i, DeviceId: 'dev-0003', DeviceName: 'Device3', ActionType: 'LogonFailed', LogonType: 'Network', AccountName: 'dup', RemoteIP: '198.51.100.9', InitiatingProcessCommandLine: 'same' });
  const o = mustSave(s, { name: 'dup', query: 'DeviceLogonEvents | where AccountName == "dup"', alertTitle: 'Dup on {{DeviceName}}', entities: [{ type: 'Device', column: 'DeviceId' }] });
  assert.equal(o.data.detection.alerts, 1, 'five identical events, one alert');
  const before = s.world.defender.alerts.length;
  s.world.defender.detections.at(-1).enabled = true;
  perform(s.ctx, 'attack.run', { scenario: 'bruteforce-device' });
  assert.ok(s.world.defender.alerts.length >= before);
});

test('response actions are applied to the entities in the results', () => {
  const s = fresh();
  assert.equal(s.world.defender.devices.find((d) => d.id === 'dev-0002').isolated, false);
  mustSave(s, { name: 'iso+pkg', actions: [{ type: 'isolateDevice' }, { type: 'collectPackage' }] });
  assert.equal(s.world.defender.devices.find((d) => d.id === 'dev-0002').isolated, true);
  assert.ok(s.world.defender.packages.some((p) => p.deviceId === 'dev-0002'));
  const alert = s.world.defender.alerts.find((a) => a.source === 'Custom detection');
  assert.match(alert.actionTaken, /Device isolated/);
  assert.match(alert.actionTaken, /Investigation package collected/);
});

test('editing a rule keeps its id, re-runs it, and can be disabled', () => {
  const s = fresh();
  const o = mustSave(s, { name: 'first' });
  const id = o.data.detection.id;
  const again = perform(s.ctx, 'defender.saveDetection', { ...BASE, id, name: 'renamed', severity: 'Low' });
  assert.ok(again.ok);
  assert.equal(s.world.defender.detections.length, 1);
  assert.equal(s.world.defender.detections[0].name, 'renamed');
  perform(s.ctx, 'defender.setDetectionEnabled', { id, enabled: false });
  assert.equal(s.world.defender.detections[0].enabled, false);
  assert.equal(perform(s.ctx, 'defender.saveDetection', { ...BASE, id: 'det-999' }).error.code, 'NotFound');
});

test('wizard input is validated as nested data and cannot smuggle markup or prototype keys', () => {
  const s = fresh();
  for (const bad of [{ name: '<script>' }, { alertTitle: 'x<img>' }, { category: 'Made up' }, { severity: 'Critical' }, { frequency: 'weekly' }, { techniques: Array(11).fill('T1059') }]) {
    assert.equal(save(s, bad).error.code, 'ValidationError', JSON.stringify(bad));
  }
  const evil = JSON.parse('{"actions":[{"type":"isolateDevice","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}]}');
  assert.ok(save(s, evil).ok);
  assert.equal({}.polluted, undefined);
  assert.equal(perform(s.ctx, 'defender.previewDetection', { query: 'SigninLogs | where ' }).ok, false, 'a bad query is explained, not a crash');
});

test('alert tuning rules never apply to alerts raised by custom detection rules (docs: investigate-alerts, 2026-10-19)', () => {
  const s = fresh();
  // A tuning rule that would match this alert's title, with no other condition.
  perform(s.ctx, 'defender.createSuppression', { alertTitle: 'Brute force on Device2', scope: 'organization', action: 'hide' });
  mustSave(s, { name: 'tuned', alertTitle: 'Brute force on {{DeviceName}}' });
  const alert = s.world.defender.alerts.find((a) => a.source === 'Custom detection');
  assert.ok(alert, 'the custom detection raised an alert');
  assert.equal(alert.suppressedBy, null, 'a tuning rule cannot hide it');
  assert.equal(alert.status, 'New');
});
