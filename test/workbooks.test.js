// Sentinel workbooks (set 3 Q8; set 1 Q10-12; set 2 Q11-13): the flow, the template choice and who may author.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { RG } from '../server/sim/world.js';
import { getView } from '../server/http/views.js';
import { canAuthorWorkbooks, canViewWorkbooks, saveFromTemplate } from '../server/sim/workbooks.js';
import { roleAllows } from '../server/sim/rbac.js';

const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('workbooks'); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const SOC = 'tpl-soc-efficiency';
const TILE = 'SigninLogs | summarize Signins=count() by bin(TimeGenerated, 1d) | render timechart';
const save = (s, template = SOC, name = 'WB') => perform(s.ctx, 'sentinel.saveWorkbookTemplate', { template, name });
const view = (s) => getView(s.world, 'workbooks');

test('the whole flow (save, clone first, view, edit, add a time chart, done) solves the lab', () => {
  const s = fresh();
  const first = save(s).data.workbook.id;
  assert.ok(perform(s.ctx, 'sentinel.cloneWorkbook', { id: first, name: 'Clean copy' }).ok);
  perform(s.ctx, 'sentinel.viewWorkbook', { id: first });
  perform(s.ctx, 'sentinel.editWorkbook', { id: first });
  assert.ok(perform(s.ctx, 'sentinel.addWorkbookTile', { id: first, title: 'T', query: TILE }).ok);
  assert.equal(met(s, 'edit'), false, 'the edit is not saved until Done editing');
  assert.ok(perform(s.ctx, 'sentinel.doneEditingWorkbook', { id: first }).ok);
  perform(s.ctx, 'findings.report', { objectiveId: 'authors', value: 'user1, user3, user4' });
  assert.deepEqual(['template', 'edit', 'copy', 'authors'].map((id) => met(s, id)), [true, true, true, true]);
});

test('Incident Overview (the wrong answer to set 2 Q12) does not meet the template objective; the SOC template has the triage metrics', () => {
  const s = fresh();
  assert.ok(save(s, 'tpl-incident-overview').ok);
  assert.equal(met(s, 'template'), false);
  const byName = Object.fromEntries(view(s).templates.map((t) => [t.name, t]));
  assert.ok(byName['Security operations efficiency'].metrics.includes('Mean time to triage'));
  assert.ok(byName['Security operations efficiency'].metrics.includes('Incident created over time'));
  assert.ok(!byName['Incident Overview'].metrics.includes('Mean time to triage'));
});

test('a workbook is read-only until Edit; adding a tile and Done editing both need edit mode', () => {
  const s = fresh();
  const id = save(s).data.workbook.id;
  assert.match(perform(s.ctx, 'sentinel.addWorkbookTile', { id, title: 'T', query: TILE }).error.message, /Select Edit/);
  assert.match(perform(s.ctx, 'sentinel.doneEditingWorkbook', { id }).error.message, /not in edit mode/);
  perform(s.ctx, 'sentinel.editWorkbook', { id });
  perform(s.ctx, 'sentinel.addWorkbookTile', { id, title: 'T', query: TILE });
  assert.equal(s.world.sentinel.workbooks[0].editing, true);
  perform(s.ctx, 'sentinel.doneEditingWorkbook', { id });
  assert.equal(s.world.sentinel.workbooks[0].revision, 2);
});

test('a clone taken AFTER the edit carries the edit, so it is not an untouched copy', () => {
  const s = fresh();
  const id = save(s).data.workbook.id;
  perform(s.ctx, 'sentinel.viewWorkbook', { id });
  perform(s.ctx, 'sentinel.editWorkbook', { id });
  perform(s.ctx, 'sentinel.addWorkbookTile', { id, title: 'T', query: TILE });
  perform(s.ctx, 'sentinel.doneEditingWorkbook', { id });
  assert.equal(met(s, 'copy'), false, 'nothing cloned yet');
  perform(s.ctx, 'sentinel.cloneWorkbook', { id, name: 'Late copy' });
  assert.equal(met(s, 'copy'), false, 'the late copy has the custom tile');
});

test('names are unique, the cap of 30 holds, and unknown ids and templates are refused', () => {
  const s = fresh();
  const id = save(s, SOC, 'A').data.workbook.id;
  assert.match(save(s, SOC, 'a').error.message, /already exists/);
  assert.match(perform(s.ctx, 'sentinel.cloneWorkbook', { id, name: 'A' }).error.message, /already exists/);
  assert.match(save(s, 'tpl-nope', 'X').error.message, /Template not found/);
  assert.match(perform(s.ctx, 'sentinel.viewWorkbook', { id: 'wb-999' }).error.message, /not found/);
  for (let i = 0; i < 29; i++) assert.ok(save(s, SOC, `W${i}`).ok);
  assert.match(save(s, SOC, 'one-more').error.message, /at most 30/);
  perform(s.ctx, 'sentinel.deleteWorkbook', { id });
  assert.equal(s.world.sentinel.workbooks.length, 29);
});

test('a template whose data is not in the workspace cannot be saved', () => {
  const tpl = { id: 'tpl-x', name: 'Needs hidden data', required: ['DeviceEvents'], metrics: ['m'] };
  assert.throws(() => saveFromTemplate(tpl, { name: 'N', haveTables: [], existing: [] }), /needs DeviceEvents data/);
  assert.equal(saveFromTemplate(tpl, { name: 'N', haveTables: ['DeviceEvents'], existing: [] }).metrics.length, 1);
});

test('Q8: Owner, Contributor and a lesser Sentinel role + Workbook Contributor can author; Responder alone and Workbook Contributor alone cannot', () => {
  assert.equal(canAuthorWorkbooks(['Owner']), true);
  assert.equal(canAuthorWorkbooks(['Microsoft Sentinel Contributor']), true);
  assert.equal(canAuthorWorkbooks(['Microsoft Sentinel Reader', 'Workbook Contributor']), true);
  assert.equal(canAuthorWorkbooks(['Microsoft Sentinel Responder', 'Workbook Contributor']), true);
  assert.equal(canAuthorWorkbooks(['Microsoft Sentinel Responder']), false, 'User2');
  assert.equal(canAuthorWorkbooks(['Microsoft Sentinel Reader']), false);
  assert.equal(canAuthorWorkbooks(['Workbook Contributor']), false, 'a workbook role alone is not enough');
  assert.equal(canAuthorWorkbooks(['Workbook Reader']), false);
  assert.equal(canViewWorkbooks(['Workbook Reader']), true, 'reading needs only a reader role');
  assert.equal(canViewWorkbooks([]), false);
});

test('Q8: the lab seeds exactly User1, User3 and User4 as authors, and wrong answers fail', () => {
  const s = fresh();
  const out = ['u-user1', 'u-user2', 'u-user3', 'u-user4'].map((p) => perform(s.ctx, 'sentinel.checkWorkbookAccess', { principalId: p }).data.canAuthor);
  assert.deepEqual(out, [true, false, true, true]);
  for (const wrong of ['User1, User3', 'User1, User2, User3, User4', 'User1, User2, User3']) {
    perform(s.ctx, 'findings.report', { objectiveId: 'authors', value: wrong });
    assert.equal(met(s, 'authors'), false, wrong);
  }
});

test('the workbook roles are real and assignable; Workbook Contributor alone grants no Sentinel access; adding it to Responder makes an author', () => {
  assert.equal(roleAllows('Workbook Contributor', 'workbook.write'), true);
  assert.equal(roleAllows('Workbook Reader', 'workbook.write'), false);
  assert.equal(roleAllows('Workbook Contributor', 'sentinel.read'), false);
  assert.equal(roleAllows('Microsoft Sentinel Responder', 'workbook.write'), false);
  const s = fresh();
  const out = perform(s.ctx, 'azure.assignRole', { scope: RG, principalId: 'u-user2', role: 'Workbook Contributor' });
  assert.ok(out.ok, out.error?.message);
  assert.equal(perform(s.ctx, 'sentinel.checkWorkbookAccess', { principalId: 'u-user2' }).data.canAuthor, true);
});

test('a broken tile is reported as an error string and does not stop the others from rendering; the chart type survives', () => {
  const s = fresh();
  const id = save(s).data.workbook.id;
  perform(s.ctx, 'sentinel.viewWorkbook', { id });
  perform(s.ctx, 'sentinel.editWorkbook', { id });
  perform(s.ctx, 'sentinel.addWorkbookTile', { id, title: 'Bad', query: 'NoSuchTable | take 1' });
  perform(s.ctx, 'sentinel.addWorkbookTile', { id, title: 'Good', query: TILE });
  perform(s.ctx, 'sentinel.doneEditingWorkbook', { id });
  const tiles = view(s).mine[0].tiles;
  assert.equal(tiles.length, 2);
  assert.ok(tiles[0].error, 'the bad tile carries its error');
  assert.equal(tiles[1].error, null);
  assert.equal(tiles[1].render, 'timechart');
});

test('tiles are only run once the workbook has been opened (a saved workbook does not execute queries in the list)', () => {
  const s = fresh();
  const id = save(s).data.workbook.id;
  perform(s.ctx, 'sentinel.editWorkbook', { id });
  perform(s.ctx, 'sentinel.addWorkbookTile', { id, title: 'T', query: TILE });
  assert.equal(view(s).mine[0].tiles.length, 0, 'not viewed yet');
  perform(s.ctx, 'sentinel.viewWorkbook', { id });
  assert.equal(view(s).mine[0].tiles.length, 1);
});
