// Sentinel workbook actions: Templates > Save > View saved workbook > Edit > Save as > Done editing, plus delete,
// and a read-only "who could add a workbook" check over the roles the learner has assigned in IAM.
// Rules, templates and permissions: workbooks.js.

import { idSpec } from '../core/validate.js';
import { SimError, WS_ID, LEARNER, visibleTables } from './world.js';
import { TEMPLATES, getTemplate, saveFromTemplate, canAuthorWorkbooks, MAX_WORKBOOKS } from './workbooks.js';

const name = { type: 'string', min: 1, max: 80, pattern: /^[\w .:()@/\\,'+#&|=-]+$/ };
const covers = (scope, target) => target === scope || target.startsWith(`${scope}/`);
const rolesAt = (w, principalId) => w.azure.assignments.filter((a) => a.principalId === principalId && covers(a.scope, WS_ID)).map((a) => a.role);
const find = (w, id) => w.sentinel.workbooks.find((x) => x.id === id) ?? null;
const must = (w, id) => find(w, id) ?? (() => { throw new SimError('Workbook not found', 'NotFound'); })();
// Does the workspace receive this table? (SecurityIncident is built in; optional tables only appear when a lab enables them.)
const has = (w, t) => visibleTables(w).includes(t);

// The learner is the tenant owner in every lab, so they can always author. This keeps the permission model honest without
// pretending the learner is someone else; the question about OTHER users is answered by the check below.
const learnerCan = (w) => canAuthorWorkbooks(rolesAt(w, 'u-admin1'));

export const WORKBOOK_ACTIONS = {
  // Templates tab > Save
  'sentinel.saveWorkbookTemplate': {
    spec: { template: idSpec(), name },
    run({ w }, p) {
      if (!learnerCan(w)) throw new SimError(`${LEARNER} can't create workbooks: that needs Microsoft Sentinel Contributor, or a lesser Sentinel role plus Workbook Contributor.`, 'Forbidden');
      const tpl = getTemplate(p.template);
      const wb = saveFromTemplate(tpl, { name: p.name, haveTables: tpl ? tpl.required.filter((t) => has(w, t)) : [], existing: w.sentinel.workbooks });
      const saved = { id: `wb-${w.counters.rule++}`, ...wb, saved: true, viewed: false, revision: 1 };
      w.sentinel.workbooks.push(saved);
      return { workbook: { id: saved.id } };
    },
  },
  // View saved workbook (My workbooks)
  'sentinel.viewWorkbook': {
    spec: { id: idSpec() },
    run({ w }, p) { must(w, p.id).viewed = true; return {}; },
  },
  // Edit
  'sentinel.editWorkbook': {
    spec: { id: idSpec() },
    run({ w }, p) { must(w, p.id).editing = true; return {}; },
  },
  // Done editing: saves the changes
  'sentinel.doneEditingWorkbook': {
    spec: { id: idSpec() },
    run({ w }, p) {
      const wb = must(w, p.id);
      if (!wb.editing) throw new SimError('This workbook is not in edit mode. Select Edit first.');
      wb.editing = false; wb.revision += 1;
      return {};
    },
  },
  // Add a query tile while editing. The query is run when the tile is shown, never stored as a result.
  'sentinel.addWorkbookTile': {
    spec: { id: idSpec(), title: name, query: { type: 'string', min: 1, max: 2000 } },
    run({ w }, p) {
      const wb = must(w, p.id);
      if (!wb.editing) throw new SimError('Select Edit before you add content to the workbook.');
      wb.tiles = wb.tiles ?? [];
      if (wb.tiles.length >= 20) throw new SimError('A workbook can hold at most 20 tiles in the sandbox.');
      wb.tiles.push({ title: p.title, query: p.query });
      return {};
    },
  },
  // Save as: clone under another name. Works on a template or on an existing workbook.
  'sentinel.cloneWorkbook': {
    spec: { id: idSpec(), name },
    run({ w }, p) {
      const src = must(w, p.id);
      if (w.sentinel.workbooks.length >= MAX_WORKBOOKS) throw new SimError(`You can have at most ${MAX_WORKBOOKS} workbooks in the sandbox.`);
      if (w.sentinel.workbooks.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) throw new SimError(`A workbook named '${p.name}' already exists.`);
      const copy = { id: `wb-${w.counters.rule++}`, name: p.name, template: src.template, metrics: [...src.metrics], tiles: (src.tiles ?? []).map((t) => ({ ...t })), editing: false, saved: true, viewed: false, revision: 1, clonedFrom: src.id };
      w.sentinel.workbooks.push(copy);
      return { workbook: { id: copy.id } };
    },
  },
  // Delete from My workbooks. Templates cannot be deleted (they are not in this list).
  'sentinel.deleteWorkbook': {
    spec: { id: idSpec() },
    run({ w }, p) {
      if (!learnerCan(w)) throw new SimError(`${LEARNER} can't delete workbooks.`, 'Forbidden');
      const i = w.sentinel.workbooks.findIndex((x) => x.id === p.id);
      if (i < 0) throw new SimError('Workbook not found', 'NotFound');
      w.sentinel.workbooks.splice(i, 1);
      return {};
    },
  },
  // Read-only: for a principal the learner has assigned roles to, could they create or delete a workbook?
  'sentinel.checkWorkbookAccess': {
    spec: { principalId: idSpec() },
    run({ w }, p) {
      const roles = rolesAt(w, p.principalId);
      return { principalId: p.principalId, roles, canAuthor: canAuthorWorkbooks(roles) };
    },
  },
};

export { TEMPLATES };
