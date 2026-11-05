// Defender for Identity (set 1 Q24; set 3 Q26; set 4 Q25, Q26): the action that actually stops an AD account, and the right report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { getView } from '../server/http/views.js';
import { applyAction, unavailableReason, canAuthenticate, downloadReport, getReport, REPORTS } from '../server/sim/identity.js';

const DAY = 86_400_000;
const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('identity-response'); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const respond = (s, action, accountId = 'acct-hrsvc') => perform(s.ctx, 'identity.respond', { accountId, action });
const dlr = (s, days, reportId = 'sensitive-groups') => perform(s.ctx, 'identity.downloadReport', { reportId, from: new Date(Date.now() - days * DAY).toISOString(), to: new Date().toISOString() });

test('set 3 Q26: Disable stops an Active Directory account; Revoke session and Mark as compromised are refused for it, with the reason', () => {
  const s = fresh();
  const revoke = respond(s, 'Revoke session');
  assert.equal(revoke.ok, false);
  assert.match(revoke.error.message, /not available for Active Directory/);
  assert.match(revoke.error.message, /would not stop new sign-ins/);
  const mark = respond(s, 'Mark as compromised');
  assert.equal(mark.ok, false);
  assert.match(mark.error.message, /Microsoft Entra ID accounts/);
  assert.equal(met(s, 'stop'), false, 'nothing changed');
  assert.deepEqual(s.world.identity.actionLog, [], 'refused actions are not logged as done');
  assert.ok(respond(s, 'Disable').ok);
  assert.equal(met(s, 'stop'), true);
});

test('Force password change on its own does not meet the objective (it blocks the stolen password, but the account stays enabled)', () => {
  const s = fresh();
  assert.ok(respond(s, 'Force password change').ok);
  assert.equal(s.world.identity.accounts[0].enabled, true);
  assert.equal(canAuthenticate(s.world.identity.accounts[0]), false, 'it cannot sign in with the old password until changed');
  assert.equal(met(s, 'stop'), false, 'but the brief asked to prevent access, which Disable does');
});

test('the same actions have different availability on a cloud (Entra ID) account', () => {
  const s = fresh();
  assert.ok(respond(s, 'Revoke session', 'acct-cloud').ok, 'Revoke session works for Entra ID');
  assert.equal(s.world.identity.accounts[1].sessions, 0);
  assert.ok(respond(s, 'Mark as compromised', 'acct-cloud').ok);
  assert.equal(s.world.identity.accounts[1].flaggedCompromised, true);
  assert.equal(s.world.identity.accounts[1].enabled, true, 'flagging does not block access');
  assert.equal(met(s, 'stop'), false, 'doing the cloud actions on the wrong account does nothing for hrsvc');
});

test('enable reverses disable; unknown accounts and actions are refused', () => {
  const s = fresh();
  respond(s, 'Disable');
  assert.ok(respond(s, 'Enable').ok);
  assert.equal(met(s, 'stop'), false);
  assert.equal(respond(s, 'Disable', 'acct-nope').error.code, 'NotFound');
  assert.equal(perform(s.ctx, 'identity.respond', { accountId: 'acct-hrsvc', action: 'Delete' }).ok, false);
});

test('pure rules: availability matrix and the state each action produces', () => {
  const ad = { source: 'Active Directory', enabled: true, mustChangePassword: false, sessions: 1, flaggedCompromised: false };
  assert.equal(unavailableReason('Disable', 'Active Directory'), null);
  assert.match(unavailableReason('Revoke session', 'Active Directory'), /Entra ID/);
  assert.match(unavailableReason('Mark as compromised', 'Active Directory'), /only on Microsoft Entra ID/);
  assert.equal(applyAction(ad, 'Disable').enabled, false);
  assert.equal(applyAction(ad, 'Force password change').mustChangePassword, true);
  assert.throws(() => applyAction(ad, 'Revoke session'), /not available/);
  assert.equal(ad.enabled, true, 'applyAction does not mutate its input');
});

test('Q24/Q26 format: the alert report downloads, the objective needs XLSX as a finding, and the response does not announce the format', () => {
  const s = fresh();
  const out = perform(s.ctx, 'identity.downloadAlertReport', { alertId: 'mdi-1' });
  assert.ok(out.ok);
  assert.deepEqual(Object.keys(out.data), ['file'], 'only a file name, no separate format field');
  assert.equal(met(s, 'format'), false, 'downloaded but not reported');
  for (const wrong of ['JSON', 'CSV', 'PDF', 'XML']) {
    perform(s.ctx, 'findings.report', { objectiveId: 'format', value: wrong });
    assert.equal(met(s, 'format'), false, wrong);
  }
  perform(s.ctx, 'findings.report', { objectiveId: 'format', value: 'xlsx' });
  assert.equal(met(s, 'format'), true);
  assert.equal(perform(s.ctx, 'identity.downloadAlertReport', { alertId: 'nope' }).error.code, 'NotFound');
});

test('Q24/Q26 format: the right answer without downloading the report does not count', () => {
  const s = fresh();
  perform(s.ctx, 'findings.report', { objectiveId: 'format', value: 'XLSX' });
  assert.equal(met(s, 'format'), false);
});

test('Q25: the sensitive-groups report for 14 days has the two recent rows; 3 days or 60 days is the wrong window', () => {
  const s = fresh();
  assert.equal(dlr(s, 3).data.rows, 1);
  assert.equal(met(s, 'report'), false, 'too short');
  assert.equal(dlr(s, 60).data.rows, 3);
  assert.equal(met(s, 'report'), false, 'too long: it also pulls the 40-day-old row');
  const r = dlr(s, 14);
  assert.equal(r.data.rows, 2);
  assert.equal(met(s, 'report'), true);
  assert.deepEqual(r.data.preview.map((x) => x.account), ['Enterprise Admins', 'Domain Admins']);
});

test('Q25: the other reports are the wrong answer — they do not list group changes and do not satisfy the objective', () => {
  const s = fresh();
  assert.ok(dlr(s, 14, 'cleartext').ok);
  assert.ok(dlr(s, 14, 'summary').ok);
  assert.equal(met(s, 'report'), false);
  perform(s.ctx, 'findings.report', { objectiveId: 'who', value: 'CONTOSO\\tbarker' });
  assert.equal(met(s, 'who'), false, 'the answer needs the right report downloaded for the right period');
  assert.equal(dlr(s, 14, 'cleartext').data.preview[0].account, 'PRINT-SRV01', 'a different report shows different data');
});

test('Q25: who changed Enterprise Admins — the 14-day answer is tbarker; the 40-day-old row (jlopez) and a wrong name fail', () => {
  const s = fresh();
  dlr(s, 14);
  for (const wrong of ['CONTOSO\\jlopez', 'CONTOSO\\svc-backup', 'tbarker', 'CONTOSO\\old-admin']) {
    perform(s.ctx, 'findings.report', { objectiveId: 'who', value: wrong });
    assert.equal(met(s, 'who'), false, wrong);
  }
  perform(s.ctx, 'findings.report', { objectiveId: 'who', value: 'contoso\\TBARKER' });
  assert.equal(met(s, 'who'), true, 'case-insensitive');
});

test('report download validation: unknown report, reversed or future dates, bad dates', () => {
  const s = fresh();
  assert.equal(dlr(s, 14, 'nope').error.code, 'NotFound');
  const now = Date.now();
  const bad = (from, to) => perform(s.ctx, 'identity.downloadReport', { reportId: 'summary', from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  assert.match(bad(now, now - DAY).error.message, /start date must be earlier/);
  assert.match(bad(now, now + 5 * DAY).error.message, /cannot be in the future/);
  assert.equal(perform(s.ctx, 'identity.downloadReport', { reportId: 'summary', from: 'yesterday', to: 'today' }).ok, false);
  assert.throws(() => downloadReport(getReport('summary'), [], { from: new Date('x'), to: new Date(), now }), /valid start and end/);
  assert.equal(REPORTS.length, 3);
  assert.equal(getReport('constructor'), null);
});

test('the identity view shows why an action is unavailable and never contains report rows', () => {
  const s = fresh();
  const v = getView(s.world, 'identity');
  const hr = v.accounts.find((a) => a.id === 'acct-hrsvc');
  assert.equal(hr.actions.find((x) => x.action === 'Revoke session').unavailable.includes('Active Directory'), true);
  assert.equal(hr.actions.find((x) => x.action === 'Disable').unavailable, null);
  assert.equal(v.reportPath, 'Reports > Identities > Report management');
  assert.ok(!JSON.stringify(v).includes('tbarker'), 'report rows are only reachable by downloading a report');
});
