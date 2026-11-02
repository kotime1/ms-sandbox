// Microsoft Purview Audit (set 1 Q36; set 2 Q39; set 3 Q34, Q39): record types, retention tiers, the search window and who may search.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { getView } from '../server/http/views.js';
import { search, retentionDays, canSearchAudit, getRecordType, MAX_RANGE_DAYS } from '../server/sim/audit.js';

const DAY = 86_400_000;
const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('audit-log'); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const win = (startDaysAgo, lengthDays) => ({ from: new Date(Date.now() - startDaysAgo * DAY).toISOString(), to: new Date(Date.now() - (startDaysAgo - lengthDays) * DAY).toISOString() });
const find = (s, startDaysAgo, lengthDays, recordTypes = []) => perform(s.ctx, 'purview.searchAudit', { ...win(startDaysAgo, lengthDays), recordTypes });

test('Q34: AirInvestigation scoped to five days meets the objective; a broader search or the wrong record type does not', () => {
  const s = fresh();
  assert.ok(find(s, 5, 5, ['SecurityComplianceCenterEOPCmdlet']).ok, 'the distractor from the exam');
  assert.equal(met(s, 'air'), false);
  assert.ok(find(s, 5, 5).ok, 'no record type filter');
  assert.equal(met(s, 'air'), false, 'unfiltered search is not scoped to Defender XDR');
  assert.ok(find(s, 5, 5, ['AirInvestigation', 'ExchangeAdmin']).ok);
  assert.equal(met(s, 'air'), false, 'two record types is broader than asked');
  assert.ok(find(s, 60, 5, ['AirInvestigation']).ok, 'wrong window');
  assert.equal(met(s, 'air'), false, 'the window must be the last five days');
  const r = find(s, 5, 5, ['AirInvestigation']);
  assert.equal(r.data.results.length, 3, 'three AIR records in the last five days; the one from 40 days ago is outside');
  assert.ok(r.data.results.every((x) => x.recordType === 'AirInvestigation'));
  assert.equal(met(s, 'air'), true);
});

test('Q34: the distractor record types return different records (they are not interchangeable)', () => {
  const s = fresh();
  const cmd = find(s, 5, 5, ['SecurityComplianceCenterEOPCmdlet']).data.results;
  assert.deepEqual(cmd.map((x) => x.activity), ['New-ComplianceSearch']);
  const exch = find(s, 5, 5, ['ExchangeAdmin']).data.results;
  assert.deepEqual(exch.map((x) => x.activity), ['Set-Mailbox']);
});

test('Q39: under Standard the nine-month-old Entra and Exchange events are gone; Premium keeps them; Teams is gone either way', () => {
  const s = fresh();
  const old = (types) => find(s, 281, 22, types).data.results.map((x) => x.activity).sort();
  assert.deepEqual(old(['AzureActiveDirectory', 'ExchangeAdmin', 'MicrosoftTeams']), [], 'Standard keeps 180 days');
  assert.equal(met(s, 'tier'), false);
  assert.ok(perform(s.ctx, 'purview.setAuditTier', { tier: 'premium' }).ok);
  assert.equal(met(s, 'tier'), true);
  assert.deepEqual(old(['AzureActiveDirectory', 'ExchangeAdmin', 'MicrosoftTeams']), ['Add user', 'New-InboxRule'], 'Teams stays at 180 days even in Premium');
  assert.equal(met(s, 'retained'), true);
});

test('Q39: searching with PowerShell or the API is not a retention setting (no action exists for it), and the tier is the only lever', () => {
  const s = fresh();
  for (const t of ['purview.searchUnifiedAuditLog', 'purview.setRetention', 'purview.useManagementApi']) assert.equal(perform(s.ctx, t, {}).ok, false, t);
  assert.equal(perform(s.ctx, 'purview.setAuditTier', { tier: 'ultimate' }).ok, false);
});

test('Q39: only a Global Administrator can assign Premium licences; the retention search must be done after the change', () => {
  const s = fresh();
  perform(s.ctx, 'directory.signInAs', { userId: 'u-adm2' });
  const out = perform(s.ctx, 'purview.setAuditTier', { tier: 'premium' });
  assert.equal(out.ok, false);
  assert.equal(out.error.code, 'Forbidden');
  assert.equal(s.world.audit.tier, 'standard');
  // A matching search made BEFORE the upgrade finds nothing, so 'retained' is not met by it.
  perform(s.ctx, 'directory.signInAs', { userId: 'u-ga' });
  find(s, 281, 22, ['AzureActiveDirectory', 'ExchangeAdmin']);
  perform(s.ctx, 'purview.setAuditTier', { tier: 'premium' });
  assert.equal(met(s, 'retained'), false, 'the earlier search came back empty under Standard');
});

test('Q36: Global, Security and Exchange Administrators can search; a Security Reader cannot', () => {
  const s = fresh();
  for (const id of ['u-adm1', 'u-adm2', 'u-adm3']) {
    perform(s.ctx, 'directory.signInAs', { userId: id });
    assert.ok(find(s, 5, 5).ok, id);
  }
  s.world.directory.users.push({ id: 'u-reader', name: 'Reader1', entraRole: 'Security Reader', roleGroup: 'Security Reader' });
  perform(s.ctx, 'directory.signInAs', { userId: 'u-reader' });
  const out = find(s, 5, 5);
  assert.equal(out.ok, false);
  assert.match(out.error.message, /Audit Logs or View-Only Audit Logs role/);
  assert.equal(canSearchAudit({ entraRole: 'Security Reader', roleGroup: 'Security Reader' }), false);
});

test('Q36: the answer needs all three admins; two of three or a wrong name fails', () => {
  const s = fresh();
  for (const wrong of ['Admin1, Admin2', 'Admin1', 'Admin1, Admin2, Admin3, Admin4', 'admin2, admin3']) {
    perform(s.ctx, 'findings.report', { objectiveId: 'searchers', value: wrong });
    assert.equal(met(s, 'searchers'), false, wrong);
  }
  perform(s.ctx, 'findings.report', { objectiveId: 'searchers', value: 'admin1, admin2, admin3' });
  assert.equal(met(s, 'searchers'), true);
});

test('search window rules: at most 180 days, start before end, not in the future, valid dates', () => {
  const s = fresh();
  assert.match(find(s, 200, 181).error.message, /maximum date range is 180 days/);
  assert.ok(find(s, 180, 180).ok, 'exactly 180 days is allowed');
  assert.match(perform(s.ctx, 'purview.searchAudit', { from: new Date().toISOString(), to: new Date(Date.now() - DAY).toISOString() }).error.message, /start date must be earlier/);
  assert.match(perform(s.ctx, 'purview.searchAudit', { from: new Date().toISOString(), to: new Date(Date.now() + 5 * DAY).toISOString() }).error.message, /cannot be in the future/);
  assert.equal(perform(s.ctx, 'purview.searchAudit', { from: 'yesterday', to: 'today' }).ok, false);
  assert.equal(perform(s.ctx, 'purview.searchAudit', { ...win(5, 5), recordTypes: ['NotARecordType'] }).ok, false);
  assert.equal(MAX_RANGE_DAYS, 180);
});

test('retention rules: Standard is 180 days; Premium is a year for Entra, Exchange, OneDrive, SharePoint and 180 days for the rest', () => {
  assert.equal(retentionDays('standard', 'ExchangeAdmin'), 180);
  assert.equal(retentionDays('premium', 'ExchangeAdmin'), 365);
  assert.equal(retentionDays('premium', 'AzureActiveDirectory'), 365);
  assert.equal(retentionDays('premium', 'SharePointFileOperation'), 365);
  assert.equal(retentionDays('premium', 'MicrosoftTeams'), 180);
  assert.equal(retentionDays('premium', 'AirInvestigation'), 180);
  assert.equal(retentionDays('premium', 'NotAType'), 180, 'unknown record types fall back to the default, never to longer');
  assert.equal(getRecordType('constructor'), null);
});

test('search() filters by retention at the boundary and by record type', () => {
  const now = Date.now();
  const rec = (d, recordType) => ({ at: new Date(now - d * DAY), recordType, activity: 'a', user: 'u' });
  const records = [rec(179, 'ExchangeAdmin'), rec(181, 'ExchangeAdmin'), rec(364, 'ExchangeAdmin')];
  const q = (tier) => search({ records, tier, now, from: new Date(now - 400 * DAY + 0), to: new Date(now), recordTypes: [] });
  // a single search may not exceed 180 days, so exercise the retention filter with a window that is allowed
  assert.throws(() => q('standard'), /maximum date range/);
  const within = (tier, a, b) => search({ records, tier, now, from: new Date(now - a * DAY), to: new Date(now - b * DAY), recordTypes: [] }).length;
  assert.equal(within('standard', 180, 0), 1, 'only the 179-day record is within 180 days');
  assert.equal(within('premium', 365, 185), 1, 'the 364-day record is kept in Premium');
});

test('the audit view never contains records, only the tier, users and record-type catalogue', () => {
  const s = fresh();
  const v = getView(s.world, 'audit');
  assert.equal(v.tier, 'standard');
  assert.ok(!JSON.stringify(v).includes('Add user'), 'no audit record text in the view');
  assert.ok(v.recordTypes.some((r) => r.id === 'AirInvestigation'));
  assert.equal(v.canSearch, true);
});

test('search history is capped and a Forbidden search is not recorded', () => {
  const s = fresh();
  for (let i = 0; i < 40; i++) assert.ok(find(s, 5, 5).ok);
  assert.match(find(s, 5, 5).error.message, /Sandbox limit reached/);
  const t = fresh();
  t.world.directory.users.push({ id: 'u-reader', name: 'Reader1', entraRole: 'Security Reader', roleGroup: 'Security Reader' });
  perform(t.ctx, 'directory.signInAs', { userId: 'u-reader' });
  find(t, 5, 5);
  assert.equal(t.world.audit.searches.length, 0);
});
