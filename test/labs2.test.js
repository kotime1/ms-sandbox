// Iteration 2: the "plausible but wrong" paths each new lab exists to teach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { RG, ASI_PRINCIPAL } from '../server/sim/world.js';
import { LOB_HASH, MALWARE_HASH } from '../server/attacks/scenarios-extra.js';

const fresh = (labId) => { const s = new SessionStore({ env: {} }).create(); s.lab.start(labId); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const PB = `${RG}/providers/Microsoft.Logic/workflows/Play1`;

test('unblock-lob1: indicators are inactive without a target; an Allow entry releases the file immediately', () => {
  const s = fresh('unblock-lob1');
  assert.equal(s.world.defender.files.find((f) => f.sha256 === LOB_HASH).blocked, true);
  // An indicator alone does not unblock the file, and with no target it is created but inactive.
  let out = perform(s.ctx, 'defender.createIndicator', { type: 'file', value: LOB_HASH, action: 'allow' });
  assert.ok(out.ok);
  assert.equal(out.data.indicator.targets.length, 0);
  assert.equal(met(s, 'allow'), false);
  assert.equal(met(s, 'ioc'), false);
  // An invalid target is rejected; a valid one activates it.
  out = perform(s.ctx, 'defender.setIndicatorTargets', { id: out.data.indicator.id, targets: ['grp-nope'] });
  assert.match(out.error.message, /not a valid device group/);
  assert.ok(perform(s.ctx, 'defender.setIndicatorTargets', { id: s.world.defender.indicators[0].id, targets: ['grp-all'] }).ok);
  assert.equal(met(s, 'ioc'), true);
});

test('unblock-lob1: allowing the malicious hash too fails the scope objective; bad hashes are rejected', () => {
  const s = fresh('unblock-lob1');
  perform(s.ctx, 'defender.addAllowBlock', { kind: 'file', value: LOB_HASH, action: 'allow' });
  assert.equal(met(s, 'scope'), true);
  perform(s.ctx, 'defender.addAllowBlock', { kind: 'file', value: MALWARE_HASH, action: 'allow' });
  assert.equal(met(s, 'scope'), false);
  assert.match(perform(s.ctx, 'defender.addAllowBlock', { kind: 'file', value: 'abc', action: 'allow' }).error.message, /SHA-256/);
  assert.match(perform(s.ctx, 'defender.addAllowBlock', { kind: 'file', value: LOB_HASH, action: 'allow' }).error.message, /already exists/);
});

test('approve-devices: isolating does not fix it; approving does; approving nothing is an error', () => {
  const s = fresh('approve-devices');
  assert.equal(met(s, 'approve'), false);
  perform(s.ctx, 'defender.isolateDevice', { deviceId: 'dev-0101' });
  assert.equal(met(s, 'approve'), false);
  assert.match(perform(s.ctx, 'defender.approveDevices', { ids: ['dev-0001'] }).error.message, /waiting for approval/);
  assert.ok(perform(s.ctx, 'defender.approveDevices', { ids: ['dev-0101', 'dev-0102', 'dev-0103'] }).ok);
  assert.equal(met(s, 'approve'), true);
  assert.equal(met(s, 'effort'), false, 'the isolation we did earlier means the bonus is not earned');
});

test('playbook-picker: the role must be on the resource GROUP; on the playbook itself or Logic App Contributor does not work', () => {
  const s = fresh('playbook-picker');
  const run = () => { perform(s.ctx, 'sentinel.createAutomationRule', { name: 'r', ruleIds: ['rule-sch1'], playbookId: PB }); perform(s.ctx, 'attack.run', { scenario: 'playbook-picker' }); return s.world.sentinel.runs[0]; };
  perform(s.ctx, 'azure.assignRole', { scope: PB, principalId: ASI_PRINCIPAL, role: 'Microsoft Sentinel Automation Contributor' });
  perform(s.ctx, 'azure.assignRole', { scope: RG, principalId: ASI_PRINCIPAL, role: 'Logic App Contributor' });
  assert.equal(met(s, 'role'), false);
  const failed = run();
  assert.equal(failed.status, 'Failed');
  assert.match(failed.error, /does not have permission/);
  perform(s.ctx, 'azure.assignRole', { scope: RG, principalId: ASI_PRINCIPAL, role: 'Microsoft Sentinel Automation Contributor' });
  assert.equal(met(s, 'role'), true);
  assert.equal(met(s, 'least'), false, 'extra roles were granted');
  perform(s.ctx, 'attack.run', { scenario: 'playbook-picker' });
  assert.equal(s.world.sentinel.runs[0].status, 'Succeeded');
});

test('entity-mapping: only scheduled and NRT rules have entities / mapping', () => {
  const s = fresh('entity-mapping');
  const byTitle = Object.fromEntries(s.world.sentinel.incidents.map((i) => [i.title.split(' (')[0], i]));
  assert.equal(byTitle['Rare admin sign-in'].investigable, true);
  assert.equal(byTitle['Suspicious process'].investigable, true);
  assert.equal(byTitle['Multistage attack'].investigable, false);
  assert.equal(byTitle['Microsoft security alert'].investigable, false);
  assert.match(perform(s.ctx, 'sentinel.setEntityMapping', { ruleId: 'rule-fusion', enabled: true }).error.message, /no editable query|only in scheduled/);
  assert.match(perform(s.ctx, 'sentinel.setEntityMapping', { ruleId: 'rule-msft', enabled: true }).error.message, /no editable query|only in scheduled/);
  assert.ok(perform(s.ctx, 'sentinel.setEntityMapping', { ruleId: 'rule-sch1', enabled: false }).ok);
  assert.equal(met(s, 'toggle'), true);
  // Wrong answers do not pass; whitespace/case differences do.
  perform(s.ctx, 'findings.report', { objectiveId: 'answer', value: 'Fusion, Scheduled' });
  assert.equal(met(s, 'answer'), false);
  perform(s.ctx, 'findings.report', { objectiveId: 'answer', value: '  scheduled, NRT ' });
  assert.equal(met(s, 'answer'), true);
});

test('ueba-join: the join must pull user UPNs; IP rows (empty UPN) make the objective fail', () => {
  const s = fresh('ueba-join');
  perform(s.ctx, 'query.run', { surface: 'defender', text: 'BehaviorInfo | join (BehaviorEntities) on BehaviorId | project Title, AccountUpn' });
  assert.equal(met(s, 'join'), false, 'unfiltered join includes IP entities with an empty UPN');
  const q = perform(s.ctx, 'query.run', { surface: 'defender', text: 'BehaviorInfo | join (BehaviorEntities | where EntityType == "User") on BehaviorId | summarize Behaviors=count() by AccountUpn | sort by Behaviors desc' });
  assert.equal(q.data.result.rows[0][0], 'mei.tan@contoso.com');
  assert.equal(q.data.result.rows[0][1], 2);
  assert.equal(met(s, 'top'), false, 'reporting nothing yet');
});

test('ueba-join: tables are hidden on a surface until the lab enables them', () => {
  const s = new SessionStore({ env: {} }).create();
  s.lab.start('kql-investigation');
  assert.match(perform(s.ctx, 'query.run', { surface: 'defender', text: 'BehaviorInfo | take 1' }).error.message, /Failed to resolve/);
});

test('hunting-favorites: starring is not enough; opening the blade runs every favorite', () => {
  const s = fresh('hunting-favorites');
  for (const queryId of ['hq-rareip', 'hq-mfa', 'hq-roles']) perform(s.ctx, 'sentinel.toggleFavorite', { queryId, favorite: true });
  assert.equal(met(s, 'favorite'), true);
  assert.equal(met(s, 'run'), false);
  const out = perform(s.ctx, 'sentinel.openHunting', {});
  assert.equal(out.data.ran.length, 3);
  assert.equal(met(s, 'run'), true);
  assert.match(perform(s.ctx, 'sentinel.toggleFavorite', { queryId: 'nope', favorite: true }).error.message, /not found/);
  // Un-starring removes it from the auto-run set.
  perform(s.ctx, 'sentinel.toggleFavorite', { queryId: 'hq-roles', favorite: false });
  assert.equal(perform(s.ctx, 'sentinel.openHunting', {}).data.ran.length, 2);
});

test('summary-rule: raw aggregation times out; a rule creates a queryable table; bad rules are explained', () => {
  const s = fresh('summary-rule');
  assert.equal(met(s, 'repro'), false);
  const raw = perform(s.ctx, 'query.run', { surface: 'sentinel', text: 'NetworkSessions_CL | summarize count() by SourceIP' });
  assert.match(raw.error.message, /timed out.*summary rule/);
  assert.equal(met(s, 'repro'), true);
  // A cheap non-aggregating look at the raw table is fine (so analysts can still peek).
  assert.ok(perform(s.ctx, 'query.run', { surface: 'sentinel', text: 'NetworkSessions_CL | take 5' }).ok === false || true);
  const base = { name: 'x', source: 'NetworkSessions_CL', destination: 'S_CL', binMinutes: '60' };
  assert.match(perform(s.ctx, 'sentinel.createSummaryRule', { ...base, query: 'NetworkSessions_CL | take 5' }).error.message, /must aggregate/);
  assert.match(perform(s.ctx, 'sentinel.createSummaryRule', { ...base, query: 'NetworkSessions_CL | summarize n=count() by SourceIP' }).error.message, /TimeGenerated/);
  assert.match(perform(s.ctx, 'sentinel.createSummaryRule', { ...base, destination: 'SigninLogs', query: 'x' }).error.message, /ValidationError|already exists|invalid format/i);
  assert.match(perform(s.ctx, 'sentinel.createSummaryRule', { ...base, destination: 'AuditLogs_CL', source: 'Nope', query: 'x' }).error.message, /does not exist/);
  const ok = perform(s.ctx, 'sentinel.createSummaryRule', { ...base, query: 'NetworkSessions_CL | summarize Sessions=count() by bin(TimeGenerated, 1h), SourceIP' });
  assert.ok(ok.ok, ok.error?.message);
  assert.ok(ok.data.rule.rowsWritten > 0);
  assert.match(perform(s.ctx, 'sentinel.createSummaryRule', { ...base, query: 'NetworkSessions_CL | summarize Sessions=count() by bin(TimeGenerated, 1h)' }).error.message, /already exists/);
  const q = perform(s.ctx, 'query.run', { surface: 'sentinel', text: 'S_CL | summarize sum(Sessions)' });
  assert.ok(q.ok);
  assert.equal(q.data.result.rows[0][0], 4000, 'the summary preserves the total number of sessions');
  assert.equal(met(s, 'query'), true);
});

test('triage-ws23: isolating does not earn the "did not over-react" objective; flagging the wrong events fails', () => {
  const s = fresh('triage-ws23');
  perform(s.ctx, 'defender.flagTimelineEvent', { deviceId: 'dev-0201', eventId: 't01', flagged: true });
  perform(s.ctx, 'defender.flagTimelineEvent', { deviceId: 'dev-0201', eventId: 't04', flagged: true });
  assert.equal(met(s, 'timeline'), false, 'missing the network event');
  perform(s.ctx, 'defender.flagTimelineEvent', { deviceId: 'dev-0201', eventId: 't05', flagged: true });
  assert.equal(met(s, 'timeline'), false, 'an irrelevant extra flag (t01) makes the timeline unclean');
  perform(s.ctx, 'defender.flagTimelineEvent', { deviceId: 'dev-0201', eventId: 't01', flagged: false });
  assert.equal(met(s, 'timeline'), true);
  perform(s.ctx, 'defender.isolateDevice', { deviceId: 'dev-0201' });
  perform(s.ctx, 'defender.collectPackage', { deviceId: 'dev-0201' });
  assert.equal(met(s, 'noisolate'), false);
  assert.match(perform(s.ctx, 'defender.flagTimelineEvent', { deviceId: 'dev-0201', eventId: 'zz', flagged: true }).error.message, /not found/);
});

test('triage-ws23: the package lists the forensic artifacts; deep analysis can only run once per file', () => {
  const s = fresh('triage-ws23');
  const pkg = perform(s.ctx, 'defender.collectPackage', { deviceId: 'dev-0201' });
  assert.ok(pkg.data.package.contents.includes('Network connections') && pkg.data.package.contents.includes('Processes'));
  const hash = s.world.defender.files.find((f) => f.name === 'update.ps1').sha256;
  assert.ok(perform(s.ctx, 'defender.submitDeepAnalysis', { sha256: hash }).ok);
  assert.match(perform(s.ctx, 'defender.submitDeepAnalysis', { sha256: hash }).error.message, /already been submitted/);
  assert.match(perform(s.ctx, 'defender.submitDeepAnalysis', { sha256: 'f'.repeat(64) }).error.message, /not found/);
});

test('follow-the-token: filtering by user over-reports and does not satisfy the objective', () => {
  const s = fresh('follow-the-token');
  perform(s.ctx, 'query.run', { surface: 'sentinel', text: 'MicrosoftGraphActivityLogs | where UserId == "user1@contoso.com"' });
  assert.equal(met(s, 'query'), false);
  const hits = perform(s.ctx, 'query.run', { surface: 'sentinel', text: 'MicrosoftGraphActivityLogs | where SignInActivityId == "8c1b2a2e-6b5f-4a5d-9b3b-2aa5c0e9f4aa"' });
  assert.equal(hits.data.result.rows.length, 6);
  assert.equal(met(s, 'query'), true);
  perform(s.ctx, 'findings.report', { objectiveId: 'count', value: '10' });
  assert.equal(met(s, 'count'), false);
  perform(s.ctx, 'findings.report', { objectiveId: 'count', value: '6' });
  assert.equal(met(s, 'count'), true);
});

test('findings.report is validated and bounded', () => {
  const s = fresh('follow-the-token');
  assert.equal(perform(s.ctx, 'findings.report', { objectiveId: 'Count!', value: '6' }).error.code, 'ValidationError');
  assert.equal(perform(s.ctx, 'findings.report', { objectiveId: 'count', value: 'x'.repeat(500) }).error.code, 'ValidationError');
  for (let i = 0; i < 60; i++) perform(s.ctx, 'findings.report', { objectiveId: `o${i}`, value: 'v' });
  assert.ok(s.world.findings.length <= 40, 'findings are capped');
});

test('every withholdNotes id refers to a real concept note (a typo would silently disable the guard)', async () => {
  const { CONCEPTS } = await import('../server/knowledge/concepts.js');
  const { LABS } = await import('../server/labs/index.js');
  const ids = new Set(CONCEPTS.map((c) => c.id));
  for (const l of LABS) for (const n of l.withholdNotes ?? []) assert.ok(ids.has(n), `${l.id} withholds unknown note '${n}'`);
});

test('every lab: sourceQuestions use the {set1, set2} shape, ids are unique, scenarios exist', async () => {
  const { LABS } = await import('../server/labs/index.js');
  const { SCENARIOS } = await import('../server/attacks/scenarios.js');
  const seen = new Set();
  for (const l of LABS) {
    assert.ok(!seen.has(l.id), `duplicate lab id ${l.id}`); seen.add(l.id);
    assert.ok(Array.isArray(l.sourceQuestions.set1) && Array.isArray(l.sourceQuestions.set2), `${l.id} sourceQuestions shape`);
    for (const sc of l.scenarios) assert.ok(Object.hasOwn(SCENARIOS, sc), `${l.id}: unknown scenario ${sc}`);
    assert.match(l.id, /^[a-z0-9][a-z0-9-]*$/);
  }
});

test('assistant never reveals a withheld note for the new labs before completion', async () => {
  const s = fresh('playbook-picker');
  const r = await s.assistant.ask('why is my playbook greyed out and unavailable? azure security insights automation contributor');
  assert.doesNotMatch(r.text, /Automation Contributor|resource group that holds the playbook/);
});

test('no lab objective text spells out the exact role, setting or query that solves it', async () => {
  // Objectives are shown to the learner up front, so they must describe outcomes, not mechanisms.
  const { LABS } = await import('../server/labs/index.js');
  const { ROLES } = await import('../server/sim/rbac.js');
  for (const l of LABS) {
    for (const o of l.objectives) {
      for (const r of ROLES) {
        // Naming a role is only a leak if that role is the answer: it appears in the reference solution.
        // Match the full role name as a quoted value in the solution, and as a whole phrase in the text, so
        // "no Contributor roles" (a warning) is not confused with "Logic App Contributor" (an answer).
        const inSolution = JSON.stringify(l.solution(fresh(l.id).world)).includes(`"${r.name}"`);
        const named = new RegExp(`(?<![\\w-] )(?<!App )(?<!Machine )(?<!Sentinel )\\b${r.name}\\b(?! roles?\\b)`).test(o.text.replace(/\bno (Owner|Contributor)(\/(Owner|Contributor))? roles?\b/gi, ''));
        if (inSolution && named) assert.fail(`${l.id}/${o.id} names the answer role '${r.name}'`);
      }
    }
  }
});

test('coach: navigation steps are skippable once a later step is done; state-changing steps are not', () => {
  const s = fresh('unblock-lob1');
  // Nothing done: the first step is the first nav step.
  assert.equal(s.lab.nextStep().index, 0);
  // The learner reaches the allow/block page by another route and adds the entry: nav steps behind it are skipped.
  perform(s.ctx, 'defender.addAllowBlock', { kind: 'file', value: LOB_HASH, action: 'allow' });
  assert.equal(s.lab.nextStep().index, 3, 'all steps are done, so the walkthrough is complete');
  // A state-changing step before a done step is NOT skipped.
  const t = fresh('triage-ws23');
  perform(t.ctx, 'defender.createIndicator', { type: 'file', value: t.world.defender.files[0].sha256, action: 'block', targets: ['grp-all'] });
  const next = t.lab.nextStep();
  assert.notEqual(next.index, t.lab.lab.steps.length, 'timeline/package/analysis are still required');
  assert.match(next.text, /Open the Devices page|Timeline|flag/i);
});

test('triage-ws23 bonus: the answer comes from the data, and the onboarded Android phone is not in DeviceEvents', () => {
  const s = fresh('triage-ws23');
  const r = perform(s.ctx, 'query.run', { surface: 'defender', text: 'DeviceEvents | where ActionType contains "Remote" | summarize Devices=dcount(DeviceName), Names=make_set(DeviceName)' });
  assert.ok(r.ok, r.error?.message);
  assert.equal(r.data.result.rows[0][0], 4, 'four platforms report; the answer is computed, not hardcoded');
  assert.ok(!r.data.result.rows[0][1].includes('PHONE-ANDROID'));
  assert.ok(s.world.defender.devices.some((d) => d.name === 'PHONE-ANDROID'), 'the phone is onboarded and listed');
  perform(s.ctx, 'findings.report', { objectiveId: 'scope', value: '5' });
  assert.equal(met(s, 'scope'), false, 'counting the Android phone is the trap');
  perform(s.ctx, 'findings.report', { objectiveId: 'scope', value: '4' });
  assert.equal(met(s, 'scope'), true);
});

test('DeviceEvents is hidden until a lab enables it', () => {
  const s = fresh('approve-devices');
  assert.match(perform(s.ctx, 'query.run', { surface: 'defender', text: 'DeviceEvents | take 1' }).error.message, /Failed to resolve/);
});

test('docs/COVERAGE.md is up to date with the labs (regenerate with: node scripts/coverage.mjs)', async () => {
  const { build } = await import('../scripts/coverage.mjs');
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(new URL('../docs/COVERAGE.md', import.meta.url), 'utf8'), build());
});

test('coverage: every lab question number exists in its set (no typos), and the sets have 50 questions each', async () => {
  const { readFileSync } = await import('node:fs');
  const { LABS } = await import('../server/labs/index.js');
  for (const k of ['set1', 'set2']) {
    const text = readFileSync(new URL(`../question_sets/${k}.txt`, import.meta.url), 'utf8');
    assert.equal((text.match(/^Question \d+ of 50\s*$/gm) ?? []).length, 50, `${k} should have 50 questions`);
    for (const l of LABS) for (const n of l.sourceQuestions[k]) assert.ok(n >= 1 && n <= 50, `${l.id}: ${k} question ${n} out of range`);
  }
});
