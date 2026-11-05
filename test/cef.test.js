// CEF ingestion and connector tables (set 4 Q13, Q14): the forwarder comes first, and a connector's table is not its name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { getView } from '../server/http/views.js';
import { buildForwarder, connect, getConnector } from '../server/sim/ingestion.js';

const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('cef-and-tables'); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const run = (s, text) => perform(s.ctx, 'query.run', { surface: 'sentinel', text });
const fwd = (s, os = 'Linux', name = 'cef-fwd') => perform(s.ctx, 'sentinel.deployForwarder', { name, os });

test('Q13: the CEF connector cannot connect before a Linux forwarder exists, and says what to do first', () => {
  const s = fresh();
  const out = perform(s.ctx, 'sentinel.connectConnector', { id: 'cef' });
  assert.equal(out.ok, false);
  assert.match(out.error.message, /Linux log forwarder/);
  assert.match(out.error.message, /Deploy a Linux machine/);
  assert.equal(run(s, 'CommonSecurityLog | take 1').ok, false, 'its table is still hidden');
  assert.equal(met(s, 'cef'), false);
});

test('Q13: a Windows machine is not a log forwarder (and does not unlock the connector)', () => {
  const s = fresh();
  const w = fwd(s, 'Windows', 'win-fwd');
  assert.equal(w.ok, false);
  assert.match(w.error.message, /Windows machine cannot be a CEF\/Syslog log forwarder/);
  assert.equal(s.world.sentinel.forwarders.length, 0);
  assert.equal(perform(s.ctx, 'sentinel.connectConnector', { id: 'cef' }).ok, false);
  assert.equal(met(s, 'forwarder'), false);
});

test('Q13: the Windows "Security Events via AMA" connector in the seeded list is the exam distractor and gives no CommonSecurityLog', () => {
  const s = fresh();
  const seeded = s.world.sentinel.connectors.find((c) => c.id === 'ama');
  assert.ok(seeded && seeded.status === 'Not connected', 'it exists and is not the CEF connector');
  assert.equal(seeded.tables.includes('CommonSecurityLog'), false);
  assert.equal(run(s, 'CommonSecurityLog | take 1').ok, false);
});

test('Q13: Linux forwarder, then the CEF connector: logs are queryable, and the objective needs the query too', () => {
  const s = fresh();
  assert.ok(fwd(s).ok);
  assert.equal(met(s, 'forwarder'), true);
  assert.equal(met(s, 'cef'), false, 'connected is not enough until the data is found');
  assert.ok(perform(s.ctx, 'sentinel.connectConnector', { id: 'cef' }).ok);
  assert.equal(met(s, 'cef'), false, 'still no query');
  const r = run(s, 'CommonSecurityLog | summarize n=count() by DeviceVendor');
  assert.ok(r.ok, r.error?.message);
  assert.deepEqual(r.data.result.rows.map((x) => x[0]).sort(), ['Cisco', 'Palo Alto Networks']);
  assert.equal(met(s, 'cef'), true);
});

test('Q13: a forwarder cannot be created twice with the same name, and the count is capped', () => {
  const s = fresh();
  assert.ok(fwd(s, 'Linux', 'a').ok);
  assert.match(fwd(s, 'Linux', 'A').error.message, /already exists/);
  for (let i = 0; i < 4; i++) assert.ok(fwd(s, 'Linux', `f${i}`).ok);
  assert.match(fwd(s, 'Linux', 'extra').error.message, /at most 5 log forwarders/);
});

test('Q14: Entra ID Protection writes to SecurityAlert; there is no table named after it; the wrong table answer fails', () => {
  const s = fresh();
  assert.ok(perform(s.ctx, 'sentinel.connectConnector', { id: 'entra-protect' }).ok);
  assert.equal(met(s, 'protect'), true);
  const before = run(fresh(), 'SecurityAlert | where AlertName == "Leaked credentials"');
  assert.equal(before.data.result.rows.length, 0, 'the connector, not the baseline data, supplies the detection');
  const ok = run(s, 'SecurityAlert | where AlertName == "Leaked credentials"');
  assert.ok(ok.ok && ok.data.result.rows.length === 1, 'the detection is in SecurityAlert');
  for (const guess of ['SecurityEvents', 'SecurityEvent', 'SigninLogs', 'AADRiskyUsers', 'IdentityInfo', 'EntraIDProtection']) {
    perform(s.ctx, 'findings.report', { objectiveId: 'table', value: guess });
    assert.equal(met(s, 'table'), false, guess);
  }
  assert.equal(run(s, 'AADRiskyUsers | take 1').ok, false, 'a plausible table name that does not exist');
  perform(s.ctx, 'findings.report', { objectiveId: 'table', value: 'securityalert' });
  assert.equal(met(s, 'table'), true, 'case-insensitive');
});

test('Q14: the right answer without connecting the connector does not count (the objective needs the connection)', () => {
  const s = fresh();
  perform(s.ctx, 'findings.report', { objectiveId: 'table', value: 'SecurityAlert' });
  assert.equal(met(s, 'table'), false);
  perform(s.ctx, 'sentinel.connectConnector', { id: 'entra-protect' });
  assert.equal(met(s, 'table'), true);
});

test('connect() and buildForwarder() are exact about the precondition; unknown ids resolve to nothing', () => {
  const cef = getConnector('cef');
  assert.throws(() => connect(cef, { apps: [], forwarders: [] }), /Linux log forwarder/);
  assert.throws(() => connect(cef, { apps: [], forwarders: [{ os: 'Windows' }] }), /Linux log forwarder/);
  assert.deepEqual(connect(cef, { apps: [], forwarders: [{ os: 'Linux' }] }), { apps: [] });
  assert.deepEqual(connect(getConnector('entra-protect'), { apps: [] }), { apps: [] }, 'other connectors do not need a forwarder');
  assert.equal(buildForwarder({ name: 'x', os: 'Linux', azureVm: false }, { existing: [] }).arc, true, 'a non-Azure forwarder needs the Azure Arc agent');
  assert.equal(buildForwarder({ name: 'x', os: 'Linux', azureVm: true }, { existing: [] }).arc, false);
  for (const id of ['constructor', '__proto__']) assert.equal(getConnector(id), null);
});

test('the ingestion view lists forwarders and the new connectors without leaking rows', () => {
  const s = fresh();
  fwd(s);
  perform(s.ctx, 'sentinel.connectConnector', { id: 'cef' });
  const v = getView(s.world, 'ingestion');
  assert.deepEqual(v.forwarders, [{ name: 'cef-fwd', os: 'Linux', daemon: 'rsyslog' }]);
  assert.equal(v.catalogue.find((c) => c.id === 'cef').connected, true);
  assert.ok(v.catalogue.some((c) => c.id === 'entra-protect'));
  assert.ok(!JSON.stringify(v).includes('PAN-OS'), 'no ingested rows in the view');
});
