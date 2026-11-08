// UEBA data sources (set 6 Q12): after UEBA is on, the supported sources are Azure Activity and Security Events; Microsoft 365 is not one of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { getView } from '../server/http/views.js';
import { UEBA_SOURCES, defaultUeba, enable, connectSource, disconnectSource, setEntraSync, describe } from '../server/sim/ueba.js';
import { SimError } from '../server/sim/world.js';

const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('ueba-sources'); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const act = (s, type, params = {}) => perform(s.ctx, type, params);

test('exactly two sources are UEBA data sources: Azure Activity and Security Events', () => {
  assert.deepEqual(UEBA_SOURCES.filter((x) => x.supported).map((x) => x.id).sort(), ['AzureActivity', 'SecurityEvent']);
  assert.ok(UEBA_SOURCES.length > 2, 'there are tempting sources that are not supported');
  assert.ok(UEBA_SOURCES.some((x) => x.id === 'OfficeActivity' && !x.supported), 'Microsoft 365 is the exam distractor');
});

test('UEBA must be on before any source is connected', () => {
  assert.throws(() => connectSource(defaultUeba(), 'AzureActivity'), /Turn on entity behavior analytics/);
  assert.throws(() => setEntraSync(defaultUeba(), true), SimError);
  assert.equal(connectSource(enable(defaultUeba()), 'AzureActivity').sources.length, 1);
});

test('Microsoft 365, Syslog and CEF are refused with a reason, and nothing is recorded', () => {
  const on = enable(defaultUeba());
  for (const id of ['OfficeActivity', 'Syslog', 'CommonSecurityLog']) {
    assert.throws(() => connectSource(on, id), /is not a UEBA data source/, id);
  }
  assert.deepEqual(on.sources, []);
  assert.throws(() => connectSource(on, 'NotARealSource'), /Unknown data source/);
});

test('a source cannot be connected twice or disconnected when it is not connected', () => {
  const s = connectSource(enable(defaultUeba()), 'SecurityEvent');
  assert.throws(() => connectSource(s, 'SecurityEvent'), /already connected/);
  assert.throws(() => disconnectSource(s, 'AzureActivity'), /not connected/);
  assert.deepEqual(disconnectSource(s, 'SecurityEvent').sources, []);
});

test('the state functions do not mutate the state they are given', () => {
  const a = enable(defaultUeba());
  const b = connectSource(a, 'AzureActivity');
  assert.deepEqual(a.sources, []);
  assert.deepEqual(b.sources, ['AzureActivity']);
});

test('describe() lists the supported sources that are not connected yet, as the real page does', () => {
  let st = enable(defaultUeba());
  assert.deepEqual(describe(st).available, ['Azure Activity', 'Security Events']);
  assert.equal(describe(st).ready, false);
  st = connectSource(st, 'AzureActivity');
  assert.deepEqual(describe(st).available, ['Security Events']);
  st = connectSource(st, 'SecurityEvent');
  assert.deepEqual(describe(st).available, []);
  assert.equal(describe(st).ready, true);
  assert.ok(!describe(st).available.includes('Microsoft 365'), 'the unsupported source is never offered');
});

test('lab: nothing is met at the start', () => {
  const s = fresh();
  for (const id of ['on', 'sources', 'only']) assert.equal(met(s, id), false, id);
});

test('lab: turning UEBA on alone meets only the first objective', () => {
  const s = fresh();
  assert.ok(act(s, 'ueba.enable').ok);
  assert.equal(met(s, 'on'), true);
  assert.equal(met(s, 'sources'), false);
  assert.equal(met(s, 'only'), false, 'the restraint objective cannot pass by doing nothing');
});

test('lab: connecting one supported source is not enough; both meet the objectives', () => {
  const s = fresh();
  act(s, 'ueba.enable');
  act(s, 'ueba.connectSource', { source: 'AzureActivity' });
  assert.equal(met(s, 'sources'), false);
  act(s, 'ueba.connectSource', { source: 'SecurityEvent' });
  assert.equal(met(s, 'sources'), true);
  assert.equal(met(s, 'only'), true);
});

test('lab: the exam trap. Microsoft 365 is refused by the page, so it can never be connected', () => {
  const s = fresh();
  act(s, 'ueba.enable');
  const r = act(s, 'ueba.connectSource', { source: 'OfficeActivity' });
  assert.equal(r.ok, false);
  assert.match(r.error.message, /not a UEBA data source/);
  assert.deepEqual(s.world.ueba.sources, []);
  act(s, 'ueba.connectSource', { source: 'AzureActivity' });
  act(s, 'ueba.connectSource', { source: 'SecurityEvent' });
  assert.equal(s.world.ueba.sources.length, 2);
  assert.equal(met(s, 'only'), true);
});

test('lab: connecting a source before turning UEBA on is refused', () => {
  const s = fresh();
  const r = act(s, 'ueba.connectSource', { source: 'AzureActivity' });
  assert.equal(r.ok, false);
  assert.match(r.error.message, /Turn on entity behavior analytics/);
});

test('lab: disconnecting a required source un-meets the objective', () => {
  const s = fresh();
  act(s, 'ueba.enable');
  act(s, 'ueba.connectSource', { source: 'AzureActivity' });
  act(s, 'ueba.connectSource', { source: 'SecurityEvent' });
  assert.equal(met(s, 'sources'), true);
  act(s, 'ueba.disconnectSource', { source: 'SecurityEvent' });
  assert.equal(met(s, 'sources'), false);
});

test('actions validate their input', () => {
  const s = fresh();
  assert.equal(act(s, 'ueba.connectSource', { source: 'Whatever' }).ok, false);
  assert.equal(act(s, 'ueba.connectSource', {}).ok, false);
  assert.equal(act(s, 'ueba.entraSync', { on: 'yes' }).ok, false);
});

test('Entra sync is separate from the data sources and does not change the objectives', () => {
  const s = fresh();
  act(s, 'ueba.enable');
  assert.ok(act(s, 'ueba.entraSync', { on: true }).ok);
  assert.equal(s.world.ueba.entraSync, true);
  assert.equal(met(s, 'sources'), false);
});

test('the view reports what the page shows and carries no secrets', () => {
  const s = fresh();
  act(s, 'ueba.enable');
  const v = getView(s.world, 'ueba');
  assert.equal(v.enabled, true);
  assert.equal(v.sources.length, UEBA_SOURCES.length);
  assert.deepEqual(v.available, ['Azure Activity', 'Security Events']);
  assert.deepEqual(Object.keys(v).sort(), ['available', 'enabled', 'entraSync', 'ready', 'sources']);
});

test('the assistant does not reveal the answer note before the lab is done', async () => {
  const s = fresh();
  const r = await s.assistant.ask('which data sources does UEBA support?');
  assert.doesNotMatch(r.text, /Azure Activity and Security Events/);
  for (const [t, p] of [['ueba.enable', {}], ['ueba.connectSource', { source: 'AzureActivity' }], ['ueba.connectSource', { source: 'SecurityEvent' }]]) act(s, t, p);
  assert.ok(s.lab.status().complete ?? s.lab.status().objectives.every((o) => o.met));
  const after = await s.assistant.ask('which data sources does UEBA support?');
  assert.match(after.text, /Azure Activity/);
});
