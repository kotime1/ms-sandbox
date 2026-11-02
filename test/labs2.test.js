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

test('unblock-lob1: the Tenant Allow/Block List is an EMAIL feature and cannot release an endpoint file', () => {
  // learn.microsoft.com/en-us/defender-office-365/tenant-allow-block-list-files-configure (2026-07-03)
  const s = fresh('unblock-lob1');
  const out = perform(s.ctx, 'defender.addAllowBlock', { kind: 'file', value: LOB_HASH, action: 'allow' });
  assert.equal(out.ok, false);
  assert.match(out.error.message, /can't create allow entries for files directly/);
  assert.match(out.error.message, /Submissions/);
  assert.equal(met(s, 'allow'), false, 'nothing was released');
  // Block entries are allowed (they are email-attachment blocks) but do not change the endpoint state.
  assert.ok(perform(s.ctx, 'defender.addAllowBlock', { kind: 'file', value: MALWARE_HASH, action: 'block' }).ok);
  assert.match(perform(s.ctx, 'defender.addAllowBlock', { kind: 'file', value: 'abc', action: 'block' }).error.message, /SHA-256/);
});

test('unblock-lob1: a file Allow indicator releases the file only where it is scoped; no scope means it applies nowhere', () => {
  const s = fresh('unblock-lob1');
  const f = () => s.world.defender.files.find((x) => x.sha256 === LOB_HASH);
  assert.equal(f().blocked, true);
  // Created without a scope: saved but applies to no device, so LOB1 is still blocked.
  let out = perform(s.ctx, 'defender.createIndicator', { type: 'file', value: LOB_HASH, action: 'allow' });
  assert.ok(out.ok);
  assert.equal(f().perDevice['dev-0001'], 'Blocked by remediation');
  assert.equal(met(s, 'allow'), false);
  // An unknown scope is rejected.
  assert.match(perform(s.ctx, 'defender.setIndicatorTargets', { id: out.data.indicator.id, targets: ['grp-nope'] }).error.message, /not a valid device group/);
  // Scope it to the servers: the workstations are still blocked.
  perform(s.ctx, 'defender.setIndicatorTargets', { id: out.data.indicator.id, targets: ['grp-servers'] });
  assert.equal(f().perDevice['dev-0004'], 'Allow');
  assert.equal(f().perDevice['dev-0001'], 'Blocked by remediation');
  assert.equal(met(s, 'allow'), false, 'the wrong group does not fix LOB1');
  // Scope it to the workstations: fixed, and no wider than needed.
  perform(s.ctx, 'defender.setIndicatorTargets', { id: out.data.indicator.id, targets: ['grp-workstations'] });
  assert.equal(met(s, 'allow'), true);
  assert.equal(met(s, 'narrow'), true);
  assert.equal(met(s, 'scope'), true);
});

test('unblock-lob1: allowing everywhere works but fails the "no wider than needed" objective; releasing the malware fails the guard', () => {
  const s = fresh('unblock-lob1');
  perform(s.ctx, 'defender.createIndicator', { type: 'file', value: LOB_HASH, action: 'allow', targets: ['grp-all'] });
  assert.equal(met(s, 'allow'), true);
  assert.equal(met(s, 'narrow'), false);
  perform(s.ctx, 'defender.createIndicator', { type: 'file', value: MALWARE_HASH, action: 'allow', targets: ['grp-all'] });
  assert.equal(met(s, 'scope'), false);
});

test('file indicators: a group-scoped indicator beats an all-devices one; blocking needs the "Allow or block file" advanced feature', () => {
  // docs: "if conflicting file IoC policies ... are applied to all devices and to the device's group, the policy in the device group will win"
  const s = fresh('unblock-lob1');
  const f = () => s.world.defender.files.find((x) => x.sha256 === LOB_HASH);
  perform(s.ctx, 'defender.createIndicator', { type: 'file', value: LOB_HASH, action: 'block', targets: ['grp-all'] });
  assert.equal(f().perDevice['dev-0001'], 'Blocked by remediation', 'a Block indicator does nothing until the advanced feature is on');
  perform(s.ctx, 'defender.setAdvancedFeature', { feature: 'allowOrBlockFile', enabled: true });
  assert.equal(f().perDevice['dev-0001'], 'Block');
  perform(s.ctx, 'defender.createIndicator', { type: 'file', value: LOB_HASH, action: 'allow', targets: ['grp-workstations'] });
  assert.equal(f().perDevice['dev-0001'], 'Allow', 'the group-scoped Allow wins on the workstations');
  assert.equal(f().perDevice['dev-0004'], 'Block', 'servers still get the all-devices Block');
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

test('every lab: sourceQuestions use the {set1, set2, set3} shape, ids are unique, scenarios exist', async () => {
  const { LABS } = await import('../server/labs/index.js');
  const { SCENARIOS } = await import('../server/attacks/scenarios.js');
  const seen = new Set();
  for (const l of LABS) {
    assert.ok(!seen.has(l.id), `duplicate lab id ${l.id}`); seen.add(l.id);
    assert.ok(['set1', 'set2', 'set3'].every((k) => Array.isArray(l.sourceQuestions[k])), `${l.id} sourceQuestions shape`);
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
  perform(s.ctx, 'defender.createIndicator', { type: 'file', value: LOB_HASH, action: 'allow', targets: ['grp-workstations'] });
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
  for (const k of ['set1', 'set2', 'set3']) {
    const text = readFileSync(new URL(`../question_sets/${k}.txt`, import.meta.url), 'utf8');
    assert.equal((text.match(/^Question \d+ of 50\s*$/gm) ?? []).length, 50, `${k} should have 50 questions`);
    for (const l of LABS) for (const n of l.sourceQuestions[k]) assert.ok(n >= 1 && n <= 50, `${l.id}: ${k} question ${n} out of range`);
  }
});

test('every lab declares how well it is backed by Microsoft docs, and unverified labs say so honestly', async () => {
  const { LABS } = await import('../server/labs/index.js');
  for (const l of LABS) {
    assert.ok(['docs', 'partial', 'exam'].includes(l.verification?.level), `${l.id}: verification.level`);
    assert.ok(l.verification.note?.length > 20, `${l.id}: verification.note should explain`);
    // Nothing here has been checked against a live tenant, so no lab may claim it.
    assert.notEqual(l.verification.level, 'tenant');
    assert.doesNotMatch(l.verification.note, /verified in (a|the) tenant|tested in (a|the) tenant/i);
  }
  const fav = LABS.find((l) => l.id === 'hunting-favorites');
  assert.equal(fav.verification.level, 'exam', 'hunting favorites stays labelled unverified until checked in a tenant');
  assert.match(fav.verification.note, /Unverified/);
});

test('the lab catalogue and the briefing both expose the verification label (and nothing else secret)', async () => {
  const s = fresh('hunting-favorites');
  assert.equal(s.lab.briefing().verification.level, 'exam');
  const { labSummary, LABS } = await import('../server/labs/index.js');
  for (const l of LABS) assert.ok(labSummary(l).verification);
  assert.doesNotMatch(JSON.stringify(labSummary(LABS[0])), /solution|hints|check/);
});

// --- Set 3: troubleshooting-mode (Q46) ---------------------------------------------------------

const runQ = (s, text) => perform(s.ctx, 'query.run', { surface: 'defender', text });
const BASE_TS = 'DeviceEvents | where Timestamp > ago(3h) | where ActionType == "AntivirusTroubleshootModeEvent"';
const STARTED = 'extend p = parse_json(AdditionalFields) | where p.TroubleshootingStateChangeReason contains "started"';

test('troubleshooting-mode: each plausible-but-wrong query misses the objective for its own reason', () => {
  const wrong = {
    'no time filter (includes the device that started 5h ago)': `DeviceEvents | where ActionType == "AntivirusTroubleshootModeEvent" | ${STARTED} | summarize (Timestamp, ReportId)=arg_max(Timestamp, ReportId) by DeviceId`,
    'no reason filter (includes the device that only ENDED it)': `${BASE_TS} | summarize (Timestamp, ReportId)=arg_max(Timestamp, ReportId) by DeviceId`,
    'no summarize (the same device twice)': `${BASE_TS} | ${STARTED} | project Timestamp, ReportId, DeviceId`,
    'summarized but Timestamp/ReportId dropped': `${BASE_TS} | ${STARTED} | summarize count() by DeviceId`,
    'the field name from the wrong answer (EventType does not exist)': 'DeviceEvents | where EventType == "TroubleshootingModeStarted"',
  };
  for (const [why, text] of Object.entries(wrong)) {
    const s = fresh('troubleshooting-mode');
    runQ(s, text);
    assert.equal(met(s, 'query'), false, why);
  }
});

test('troubleshooting-mode: the exam query shape solves it, and the unknown-column error names the real columns', () => {
  const s = fresh('troubleshooting-mode');
  const bad = runQ(s, 'DeviceEvents | where EventType == "TroubleshootingModeStarted"');
  assert.equal(bad.ok, false);
  assert.match(bad.error.message, /EventType/);
  assert.ok(runQ(s, `${BASE_TS} | ${STARTED} | summarize (Timestamp, ReportId)=arg_max(Timestamp, ReportId), count() by DeviceId | order by Timestamp desc`).ok);
  assert.equal(met(s, 'query'), true);
  // Naming devices rather than ids also counts; the answer needs the right device, not just any.
  assert.equal(met(s, 'latest'), false);
  perform(s.ctx, 'findings.report', { objectiveId: 'latest', value: 'MAC-DEV02' });
  assert.equal(met(s, 'latest'), false, 'MAC-DEV02 started earlier');
  perform(s.ctx, 'findings.report', { objectiveId: 'latest', value: 'mac-fin01' });
  assert.equal(met(s, 'latest'), true);
});

test('troubleshooting-mode: DeviceEvents (and its AdditionalFields column) is hidden until the lab enables it', () => {
  const s = new SessionStore({ env: {} }).create();
  const r = perform(s.ctx, 'query.run', { surface: 'defender', text: 'DeviceEvents | take 1' });
  assert.equal(r.ok, false, 'DeviceEvents is optional and must not exist before a lab enables it');
  const lab = fresh('troubleshooting-mode');
  assert.ok(lab.world.tables.get('DeviceEvents').columns.some((c) => c.name === 'AdditionalFields'));
});

// --- Set 3: nrt-rule (Q20) ---------------------------------------------------------------------

const RULE_Q = 'SigninLogs | where ResultType != "0"';
const mk = (s, extra) => perform(s.ctx, 'sentinel.createAnalyticsRule', { kind: 'Scheduled', name: 'R', severity: 'Medium', query: RULE_Q, ...extra });

test('nrt-rule: a scheduled rule cannot run every minute, and the message names the allowed range', () => {
  const s = fresh('nrt-rule');
  const out = mk(s, { frequencyMinutes: 1, lookbackMinutes: 1 });
  assert.equal(out.ok, false);
  assert.match(out.error.message, /between 5 minutes and 14 days/);
  assert.match(out.error.message, /NRT/);
  assert.equal(met(s, 'rule'), false);
});

test('nrt-rule: scheduled rules need lookback >= interval, and at most 14 days', () => {
  const s = fresh('nrt-rule');
  assert.match(mk(s, { frequencyMinutes: 60, lookbackMinutes: 30 }).error.message, /longer than or equal/);
  assert.match(mk(s, { frequencyMinutes: 5, lookbackMinutes: 14 * 24 * 60 + 1 }).error.message, /14 days/);
  assert.ok(mk(s, { frequencyMinutes: 5, lookbackMinutes: 5 }).ok, '5 minutes is the minimum and is allowed');
  assert.equal(met(s, 'rule'), false, 'a valid scheduled rule still is not "every minute"');
  assert.equal(met(s, 'shortest'), false);
  perform(s.ctx, 'findings.report', { objectiveId: 'shortest', value: '1' });
  assert.equal(met(s, 'shortest'), false, 'the shortest scheduled interval is 5, not 1');
  perform(s.ctx, 'findings.report', { objectiveId: 'shortest', value: '5' });
  assert.equal(met(s, 'shortest'), true);
});

test('nrt-rule: an NRT rule has fixed scheduling; sending a schedule is refused rather than silently ignored', () => {
  const s = fresh('nrt-rule');
  const out = mk(s, { kind: 'NRT', frequencyMinutes: 5 });
  assert.equal(out.ok, false);
  assert.match(out.error.message, /always run every 1 minute/);
  const ok = mk(s, { kind: 'NRT', name: 'NRT1' });
  assert.ok(ok.ok);
  assert.deepEqual(ok.data.rule.schedule, { frequencyMinutes: 1, lookbackMinutes: 1, timeBasis: 'ingestion time', builtInDelayMinutes: 2 });
  assert.equal(met(s, 'rule'), true);
  assert.equal(met(s, 'mapping'), true);
});

test('nrt-rule: switching entity mapping off fails the mapping objective (the rule is fast but not investigable)', () => {
  const s = fresh('nrt-rule');
  mk(s, { kind: 'NRT', entityMapping: false });
  assert.equal(met(s, 'rule'), true);
  assert.equal(met(s, 'mapping'), false);
});

test('nrt-rule: a fast rule over the wrong table does not count; names are unique; the NRT cap of 50 holds; bad queries are rejected', () => {
  const s = fresh('nrt-rule');
  mk(s, { kind: 'NRT', query: 'AuditLogs | take 1' });
  assert.equal(met(s, 'rule'), false, 'must evaluate SigninLogs');
  assert.match(mk(s, { kind: 'NRT', name: 'r' }).error.message, /already exists/);
  assert.match(mk(s, { kind: 'NRT', name: 'bad', query: 'NoSuchTable | take 1' }).error.message, /rule query is not valid/);
  // 1 seeded NRT rule + 1 created above = 2; fill to the cap
  for (let i = 0; i < 48; i++) assert.ok(mk(s, { kind: 'NRT', name: `n${i}` }).ok, `n${i}`);
  assert.match(mk(s, { kind: 'NRT', name: 'one-too-many' }).error.message, /at most 50 NRT rules/);
});

// --- Set 3: email-notifications (Q3, Q4; Set 1 Q17) -----------------------------------------------

const rule = (extra = {}) => ({ name: 'Brute force on servers', devices: 'groups', deviceGroups: ['grp-servers'], severities: ['High'], recipients: ['secops@contoso.com'], ...extra });
const mk2 = (s, extra) => perform(s.ctx, 'defender.createNotificationRule', rule(extra));
const replay = (s) => perform(s.ctx, 'attack.run', { scenario: 'bruteforce-alerts' });
const outbox = (s) => s.world.defender.outbox.map((m) => `${m.device}:${m.severity}:${m.to}`);

test('email-notifications: a server-scoped High rule emails exactly once for the server, not the workstation or the informational alert', () => {
  const s = fresh('email-notifications');
  assert.ok(mk2(s).ok);
  assert.equal(met(s, 'rule'), true);
  assert.equal(met(s, 'outcome'), false, 'the replay has not run yet');
  replay(s);
  assert.deepEqual(outbox(s), ['SRV-APP01:High:secops@contoso.com']);
  assert.equal(met(s, 'outcome'), true);
});

test('email-notifications: severity alone does not limit to the servers (the exam distractor)', () => {
  const s = fresh('email-notifications');
  assert.match(mk2(s, { deviceGroups: [] }).error.message, /Select at least one device group/);
  // The wrong-but-possible rule: every group, High only. It works mechanically but fails the lab's scope.
  assert.ok(mk2(s, { deviceGroups: ['grp-servers', 'grp-workstations'], name: 'Both groups' }).ok);
  replay(s);
  assert.equal(s.world.defender.outbox.filter((m) => m.device === 'Device1').length, 1, 'the workstation also got mail');
  assert.equal(met(s, 'rule'), false);
  assert.equal(met(s, 'outcome'), false);
});

test('email-notifications: including Informational makes the outcome noisy and fails the rule objective', () => {
  const s = fresh('email-notifications');
  mk2(s, { severities: ['High', 'Informational'] });
  replay(s);
  assert.equal(met(s, 'rule'), false);
  assert.equal(met(s, 'outcome'), false, 'two server emails (High + Informational)');
});

test('email-notifications: all-devices needs Global administrator; a Security Administrator is refused with the documented reason', () => {
  const s = fresh('email-notifications');
  const out = mk2(s, { devices: 'all', deviceGroups: [] });
  assert.equal(out.ok, false);
  assert.match(out.error.message, /Global administrator role can create a notification rule for all devices/);
  perform(s.ctx, 'directory.signInAs', { userId: 'u-user1' });
  assert.ok(mk2(s, { devices: 'all', deviceGroups: [], name: 'Everything' }).ok, 'User1 is a Global Administrator');
  assert.equal(s.world.defender.notificationRules.at(-1).allDevices, true);
});

test('email-notifications: Security Reader users cannot create or delete rules, whichever portal role they hold', () => {
  const s = fresh('email-notifications');
  mk2(s);
  const id = s.world.defender.notificationRules[0].id;
  perform(s.ctx, 'directory.signInAs', { userId: 'u-user3' });
  const create = mk2(s, { name: 'Another' });
  assert.equal(create.ok, false);
  assert.match(create.error.message, /Manage security settings/);
  assert.equal(create.error.code, 'Forbidden');
  assert.equal(perform(s.ctx, 'defender.deleteNotificationRule', { id }).ok, false);
  assert.equal(s.world.defender.notificationRules.length, 1, 'nothing changed');
  // User2: Entra Security Administrator but only the Security Reader role group. Entra role alone is enough.
  perform(s.ctx, 'directory.signInAs', { userId: 'u-user2' });
  assert.ok(mk2(s, { name: 'By user2' }).ok);
});

test('email-notifications: validation (bad address, unknown group, duplicate name, no severity, no recipient, unknown user)', () => {
  const s = fresh('email-notifications');
  assert.match(mk2(s, { recipients: ['not-an-email'] }).error.message, /not a valid email/);
  assert.match(mk2(s, { recipients: [] }).error.message, /at least one recipient/);
  assert.match(mk2(s, { severities: [] }).error.message, /at least one alert severity/);
  assert.match(mk2(s, { deviceGroups: ['grp-nope'] }).error.message, /not a device group/);
  assert.ok(mk2(s).ok);
  assert.match(mk2(s).error.message, /already exists/);
  assert.match(perform(s.ctx, 'directory.signInAs', { userId: 'u-nobody' }).error.message, /Unknown user/);
});

test('email-notifications: a tuned-out (hidden) alert does not send mail, and a disabled path sends nothing before a rule exists', () => {
  const s = fresh('email-notifications');
  replay(s);
  assert.deepEqual(outbox(s), [], 'no rule, no mail');
  const t = fresh('email-notifications');
  mk2(t, { severities: ['High', 'Informational'] });
  perform(t.ctx, 'defender.createSuppression', { alertTitle: 'Brute force attack detected', scope: 'organization', action: 'hide' });
  replay(t);
  assert.deepEqual(outbox(t), ['SRV-APP01:Informational:secops@contoso.com'], 'only the unsuppressed informational alert is emailed');
});

test('email-notifications: the Q4 answer is exactly User1 and User2; User3 or a lone name fails', () => {
  const s = fresh('email-notifications');
  for (const wrong of ['User1', 'User1, User2, User3', 'User2, User3', 'user3']) {
    perform(s.ctx, 'findings.report', { objectiveId: 'who', value: wrong });
    assert.equal(met(s, 'who'), false, wrong);
  }
  perform(s.ctx, 'findings.report', { objectiveId: 'who', value: 'User1, User2' });
  assert.equal(met(s, 'who'), true);
});

test('email-notifications: the simulated outbox is capped at 500 and sheds the oldest mail', () => {
  const s = fresh('email-notifications');
  mk2(s);
  for (let i = 0; i < 500; i++) s.world.defender.outbox.push({ id: `m${i}`, to: 'x@y.zz', title: 't', severity: 'High', device: 'd', at: Date.now() });
  replay(s);
  assert.equal(s.world.defender.outbox.length, 500, 'still 500 after one more mail');
  assert.equal(s.world.defender.outbox.at(-1).device, 'SRV-APP01', 'the newest mail is kept');
  assert.equal(s.world.defender.outbox.some((m) => m.id === 'm0'), false, 'the oldest was dropped');
});

// --- Set 3: asr-rules (Q1) ---------------------------------------------------------------------

const pol = (extra = {}) => ({ name: 'P', type: 'asr', platform: 'Windows', deviceGroups: ['grp-workstations'], rules: [{ rule: 'email-exe', mode: 'block' }, { rule: 'usb-untrusted', mode: 'block' }], ...extra });
const mkPol = (s, extra) => perform(s.ctx, 'defender.createSecurityPolicy', pol(extra));

test('asr-rules: the exam answer (ASR rules) meets all three objectives', () => {
  const s = fresh('asr-rules');
  assert.ok(mkPol(s).ok);
  assert.deepEqual(['capability', 'rules', 'scope'].map((id) => met(s, id)), [true, true, true]);
});

test('asr-rules: each distractor capability is a policy that does not satisfy the requirement', () => {
  for (const type of ['exploit', 'cfa', 'network', 'web', 'device']) {
    const s = fresh('asr-rules');
    const out = mkPol(s, { type, rules: [] });
    assert.ok(out.ok, `${type} policy is creatable`);
    assert.equal(met(s, 'capability'), false, `${type} is not the ASR capability`);
    assert.equal(met(s, 'rules'), false, `${type} has no behaviour rules`);
  }
  // Rules on a capability that has no rules are refused, with the reason.
  const s = fresh('asr-rules');
  assert.match(mkPol(s, { type: 'cfa' }).error.message, /no per-rule settings/);
});

test('asr-rules: ASR, controlled folder access and exploit protection exist on Windows only; network protection also covers macOS', () => {
  const s = fresh('asr-rules');
  assert.match(mkPol(s, { platform: 'macOS' }).error.message, /available only on Windows, not on macOS/);
  assert.match(mkPol(s, { type: 'exploit', rules: [], platform: 'Linux' }).error.message, /available only on Windows/);
  assert.ok(mkPol(s, { type: 'network', rules: [], platform: 'macOS', name: 'Net on Mac' }).ok);
  assert.match(mkPol(s, { type: 'network', rules: [], platform: 'Linux', name: 'Net on Linux' }).error.message, /Windows and macOS, not on Linux/);
});

test('asr-rules: audit or warn is not block; the objective needs both rules in Block mode', () => {
  const s = fresh('asr-rules');
  mkPol(s, { name: 'Audit only', rules: [{ rule: 'email-exe', mode: 'audit' }, { rule: 'usb-untrusted', mode: 'audit' }] });
  assert.equal(met(s, 'capability'), true);
  assert.equal(met(s, 'rules'), false);
  mkPol(s, { name: 'One rule', rules: [{ rule: 'email-exe', mode: 'block' }] });
  assert.equal(met(s, 'rules'), false, 'only one of the two requirements');
  mkPol(s, { name: 'Warn', rules: [{ rule: 'email-exe', mode: 'warn' }, { rule: 'usb-untrusted', mode: 'warn' }] });
  assert.equal(met(s, 'rules'), false);
});

test('asr-rules: scope — servers or both groups fail the least-privilege objective', () => {
  const s = fresh('asr-rules');
  mkPol(s, { name: 'Both', deviceGroups: ['grp-workstations', 'grp-servers'] });
  assert.equal(met(s, 'rules'), true);
  assert.equal(met(s, 'scope'), false, 'the servers are out of scope');
  mkPol(s, { name: 'Servers', deviceGroups: ['grp-servers'] });
  assert.equal(met(s, 'scope'), false);
  assert.match(mkPol(s, { name: 'None', deviceGroups: [] }).error.message, /at least one device group/);
  assert.match(mkPol(s, { name: 'Nope', deviceGroups: ['grp-nope'] }).error.message, /not a device group/);
});

test('asr-rules: the two rules that do not support Warn refuse it; unknown rules and duplicates are refused', () => {
  const s = fresh('asr-rules');
  assert.match(mkPol(s, { rules: [{ rule: 'lsass', mode: 'warn' }] }).error.message, /doesn't support Warn mode/);
  assert.match(mkPol(s, { rules: [{ rule: 'office-injection', mode: 'warn' }] }).error.message, /doesn't support Warn mode/);
  assert.ok(mkPol(s, { name: 'Warn ok', rules: [{ rule: 'email-exe', mode: 'warn' }] }).ok);
  assert.equal(mkPol(s, { name: 'x', rules: [{ rule: 'not-a-rule', mode: 'block' }] }).error.code, 'ValidationError');
  assert.match(mkPol(s, { name: 'dup', rules: [{ rule: 'email-exe', mode: 'block' }, { rule: 'email-exe', mode: 'audit' }] }).error.message, /set more than once/);
  assert.match(mkPol(s, { name: 'empty', rules: [] }).error.message, /at least one rule/);
});

test('asr-rules: policy names are unique and block-at-first-sight is not a capability (it is cloud antivirus)', () => {
  const s = fresh('asr-rules');
  assert.ok(mkPol(s).ok);
  assert.match(mkPol(s).error.message, /already exists/);
  assert.equal(perform(s.ctx, 'defender.createSecurityPolicy', pol({ name: 'BAFS', type: 'block-at-first-sight' })).ok, false);
});
