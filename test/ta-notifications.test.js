// Threat analytics and vulnerabilities email notifications (set 4 Q1): the right kind, the right scope, and the wrong turns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { getView } from '../server/http/views.js';
import { buildKindRule, notifiesForReport } from '../server/sim/ta-notifications.js';

const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('threat-analytics-notify'); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const OWNER = 'threatintel@contoso.com';
const mk = (s, extra) => perform(s.ctx, 'defender.createKindNotification', { kind: 'threatAnalytics', name: 'RansomwareReports', tags: ['Ransomware'], recipients: [OWNER], ...extra });
const pub = (s, id) => perform(s.ctx, 'ta.publishReport', { reportId: id });
const ta = (s) => s.world.defender.outbox.filter((m) => m.title.startsWith('Threat analytics:'));

test('the right rule (Threat analytics, Ransomware tag) mails once, for the ransomware report only', () => {
  const s = fresh();
  assert.ok(mk(s).ok);
  assert.equal(met(s, 'rule'), true);
  assert.equal(met(s, 'outcome'), false, 'nothing published yet');
  pub(s, 'ta-ransom');
  assert.equal(met(s, 'outcome'), false, 'only one of the two reports has been published');
  pub(s, 'ta-phish');
  assert.equal(ta(s).length, 1);
  assert.match(ta(s)[0].title, /Ransomware campaign/);
  assert.equal(ta(s)[0].to, OWNER);
  assert.equal(met(s, 'outcome'), true);
});

test('Q1 distractors: a Vulnerabilities rule is created fine and says nothing when a report is published', () => {
  const s = fresh();
  assert.ok(perform(s.ctx, 'defender.createKindNotification', { kind: 'vulnerabilities', name: 'Vulns', recipients: [OWNER] }).ok);
  assert.equal(met(s, 'rule'), false, 'wrong kind of rule');
  const a = pub(s, 'ta-ransom'), b = pub(s, 'ta-phish');
  assert.ok(a.ok && b.ok, `publishing succeeds (it must not crash): ${a.error?.message ?? ''}`);
  assert.equal(s.world.defender.kindRules.length, 1, 'the rule exists and was evaluated');
  assert.equal(ta(s).length, 0, 'a vulnerabilities rule does not react to threat reports');
  assert.equal(met(s, 'outcome'), false);
});

test('Q1 distractors: an alert notification rule (Endpoints) never reacts to a threat report', () => {
  const s = fresh();
  assert.ok(perform(s.ctx, 'defender.createNotificationRule', { name: 'AlertsToo', devices: 'groups', deviceGroups: ['grp-servers'], severities: ['High', 'Informational'], recipients: [OWNER] }).ok);
  assert.ok(pub(s, 'ta-ransom').ok, 'publishing succeeds');
  assert.equal(s.world.defender.outbox.length, 0);
  assert.equal(met(s, 'rule'), false);
});

test('scope: all reports mails for both, so the outcome objective fails (too broad); no tag means all', () => {
  const s = fresh();
  assert.ok(mk(s, { tags: [] }).ok);
  assert.equal(s.world.defender.kindRules[0].scope.all, true);
  assert.equal(met(s, 'rule'), false, 'not limited to ransomware');
  pub(s, 'ta-ransom'); pub(s, 'ta-phish');
  assert.equal(ta(s).length, 2);
  assert.equal(met(s, 'outcome'), false, 'the phishing report must not have mailed');
});

test('scope: a different tag or a report type also works as a filter; the wrong tag mails nothing', () => {
  const s = fresh();
  mk(s, { name: 'PhishingOnly', tags: ['Phishing'] });
  pub(s, 'ta-ransom');
  assert.equal(ta(s).length, 0, 'phishing rule ignores the ransomware report');
  pub(s, 'ta-phish');
  assert.equal(ta(s).length, 1);
  const t = fresh();
  mk(t, { name: 'ByType', tags: [], reportTypes: ['Technique profile'] });
  pub(t, 'ta-ransom'); pub(t, 'ta-phish');
  assert.deepEqual(ta(t).map((m) => m.title), ['Threat analytics: Phishing kit abusing QR codes'], 'the Technique profile is the phishing report');
});

test('the documented name rule: English letters and numbers only (spaces, dashes and underscores are refused, with that message)', () => {
  const s = fresh();
  for (const bad of ['Ransomware reports', 'Ransomware-reports', 'Ransomware_reports']) {
    const out = mk(s, { name: bad });
    assert.equal(out.ok, false, bad);
    assert.match(out.error.message, /letters and numbers only/);
  }
  assert.match(mk(s, { description: 'has spaces' }).error.message, /description accepts English letters and numbers only/);
  assert.ok(mk(s, { name: 'Ransomware2026', description: 'Weekly' }).ok);
  assert.match(mk(s, { name: 'ransomware2026' }).error.message, /already exists/);
});

test('recipients: at least one, valid addresses; unknown tags and types and an unknown report are refused', () => {
  const s = fresh();
  assert.match(mk(s, { recipients: [] }).error.message, /at least one recipient/);
  assert.match(mk(s, { recipients: ['nope'] }).error.message, /not a valid email/);
  assert.equal(mk(s, { tags: ['Memes'] }).ok, false);
  assert.equal(mk(s, { reportTypes: ['Poem'] }).ok, false);
  assert.equal(pub(s, 'ta-nope').error.code, 'NotFound');
  assert.throws(() => buildKindRule({ kind: 'x', name: 'A', recipients: ['a@b.co'], tags: [], reportTypes: [], description: '' }, { existing: [] }), /Choose a notification type/);
});

test('permission and cap: a Security Reader cannot create a rule; at most 20 rules; the outbox sheds the oldest mail', () => {
  const s = fresh();
  s.world.directory.users.push({ id: 'u-reader', name: 'Reader1', entraRole: 'Security Reader', roleGroup: 'Security Reader' });
  perform(s.ctx, 'directory.signInAs', { userId: 'u-reader' });
  const out = mk(s);
  assert.equal(out.ok, false);
  assert.equal(out.error.code, 'Forbidden');
  assert.equal(s.world.defender.kindRules.length, 0);
  perform(s.ctx, 'directory.signInAs', { userId: 'u-sec1' });
  for (let i = 0; i < 20; i++) assert.ok(mk(s, { name: `Rule${i}`, tags: [] }).ok, `Rule${i}`);
  assert.match(mk(s, { name: 'OneTooMany', tags: [] }).error.message, /Sandbox limit reached|at most 20/);
  for (let i = 0; i < 500; i++) s.world.defender.outbox.push({ id: `m${i}`, to: 'x@y.zz', title: 't', severity: 'High', device: '', at: Date.now() });
  pub(s, 'ta-ransom');
  assert.ok(s.world.defender.outbox.length <= 500, 'bounded');
});

test('a disabled rule does not notify, and notifiesForReport is exact about kind', () => {
  const rule = { kind: 'threatAnalytics', enabled: true, scope: { all: false, tags: ['Ransomware'], reportTypes: [] } };
  const rep = { tags: ['Ransomware'], type: 'Threat overview' };
  assert.equal(notifiesForReport(rule, rep), true);
  assert.equal(notifiesForReport({ ...rule, enabled: false }, rep), false);
  assert.equal(notifiesForReport({ ...rule, kind: 'vulnerabilities' }, rep), false);
  assert.equal(notifiesForReport({ ...rule, scope: { all: false, tags: ['Phishing'], reportTypes: [] } }, rep), false);
});

test('the view lists rules and reports without leaking anything else', () => {
  const s = fresh();
  mk(s);
  const v = getView(s.world, 'notifications');
  assert.equal(v.kindRules.length, 1);
  assert.equal(v.kindRules[0].kind, 'threatAnalytics');
  assert.equal(v.taReports.length, 2);
  assert.deepEqual(v.taOptions.tags, ['Ransomware', 'Phishing', 'Activity group', 'Vulnerability']);
});
