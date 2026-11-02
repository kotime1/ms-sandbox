// Data connectors and the Logs Ingestion API (set 3 Q11 and Q13): the right connector, the right order, and the wrong turns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { getView } from '../server/http/views.js';
import { buildCustomTable, connect, getConnector } from '../server/sim/ingestion.js';

const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('ingest-data'); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const COLS = [{ name: 'EventTime', type: 'datetime' }, { name: 'User', type: 'string' }, { name: 'Action', type: 'string' }, { name: 'AssetId', type: 'string' }, { name: 'Result', type: 'string' }];
const T = 'ManufacturingAudit_CL';
const rec = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));
const GOOD = { EventTime: '2026-11-02T09:00:00Z', User: 'op7', Action: 'ValveOpen', AssetId: 'PUMP-12', Result: 'Success' };
const mkTable = (s, extra = {}) => perform(s.ctx, 'sentinel.createCustomTable', { name: T, columns: COLS, ...extra });
const mkDcr = (s, extra = {}) => perform(s.ctx, 'sentinel.createDcr', { name: 'dcr1', table: T, columns: COLS, ...extra });

test('Q11: the Microsoft 365 connector with SharePoint makes SharePoint events queryable; Defender for Office 365 does not', () => {
  const s = fresh();
  assert.equal(perform(s.ctx, 'query.run', { surface: 'sentinel', text: 'OfficeActivity | take 1' }).ok, false, 'hidden until connected');
  // The distractor: it connects fine, brings email events, and does not satisfy the objective.
  assert.ok(perform(s.ctx, 'sentinel.connectConnector', { id: 'mdo' }).ok);
  assert.equal(met(s, 'sharepoint'), false);
  assert.equal(perform(s.ctx, 'query.run', { surface: 'sentinel', text: 'OfficeActivity | take 1' }).ok, false, 'still no OfficeActivity');
  assert.ok(perform(s.ctx, 'query.run', { surface: 'sentinel', text: 'EmailEvents | take 1' }).ok, 'it does bring EmailEvents');
  assert.ok(perform(s.ctx, 'sentinel.connectConnector', { id: 'm365', apps: ['SharePoint'] }).ok);
  assert.equal(met(s, 'sharepoint'), true);
  const r = perform(s.ctx, 'query.run', { surface: 'sentinel', text: 'OfficeActivity | summarize count() by OfficeWorkload' });
  assert.deepEqual(r.data.result.rows.map((x) => x[0]), ['SharePoint'], 'only the app that was connected');
});

test('Q11: connecting only Exchange or Teams does not give SharePoint events; apps must be chosen and valid', () => {
  const s = fresh();
  assert.match(perform(s.ctx, 'sentinel.connectConnector', { id: 'm365', apps: [] }).error.message, /Select at least one of/);
  assert.match(perform(s.ctx, 'sentinel.connectConnector', { id: 'm365', apps: ['Yammer'] }).error.message, /not an app for this connector/);
  assert.ok(perform(s.ctx, 'sentinel.connectConnector', { id: 'm365', apps: ['Exchange', 'Teams'] }).ok);
  assert.equal(met(s, 'sharepoint'), false, 'SharePoint was not selected');
  assert.ok(perform(s.ctx, 'sentinel.connectConnector', { id: 'm365', apps: ['Exchange', 'Teams', 'SharePoint'] }).ok, 'reconnecting with more apps is allowed');
  assert.equal(met(s, 'sharepoint'), true);
  assert.match(perform(s.ctx, 'sentinel.connectConnector', { id: 'entra', apps: ['SharePoint'] }).error.message, /no app selection/);
  assert.equal(perform(s.ctx, 'sentinel.connectConnector', { id: 'nope' }).ok, false);
});

test('Q13: a data collection rule cannot be created before the table exists (the exam answer is the custom table, first)', () => {
  const s = fresh();
  const out = mkDcr(s);
  assert.equal(out.ok, false);
  assert.match(out.error.message, /does not exist\. Create the custom table first/);
  assert.equal(met(s, 'dcr'), false);
  assert.ok(mkTable(s).ok);
  assert.ok(mkDcr(s).ok);
  assert.equal(met(s, 'table'), true);
  assert.equal(met(s, 'dcr'), true);
});

test('Q13: the table must have the application\'s names and types; a table with the wrong type does not meet the objective', () => {
  const s = fresh();
  assert.ok(mkTable(s, { columns: COLS.map((c) => (c.name === 'EventTime' ? { ...c, type: 'string' } : c)) }).ok);
  assert.equal(met(s, 'table'), false, 'EventTime was declared as text');
  const t = fresh();
  assert.ok(mkTable(t, { columns: COLS.filter((c) => c.name !== 'Result') }).ok);
  assert.equal(met(t, 'table'), false, 'a field is missing');
});

test('Q13: a rule declaring columns that do not match the table is refused with the mismatch named', () => {
  const s = fresh();
  mkTable(s);
  assert.match(mkDcr(s, { columns: [...COLS, { name: 'Extra', type: 'string' }] }).error.message, /'Extra' has no matching column/);
  assert.match(mkDcr(s, { columns: COLS.map((c) => (c.name === 'EventTime' ? { ...c, type: 'string' } : c)) }).error.message, /EventTime' is string but .* is datetime/);
  assert.ok(mkDcr(s).ok);
  assert.match(mkDcr(s).error.message, /already exists/);
});

test('Q13: a rule for a table that is not a custom (_CL) table is refused (the AzureDiagnostics distractor)', () => {
  const s = fresh();
  assert.match(mkDcr(s, { table: 'SigninLogs' }).error.message, /custom \(_CL\) table/);
  assert.match(mkDcr(s, { table: 'AzureDiagnostics' }).error.message, /does not exist/);
});

test('table rules: _CL suffix, valid and unique names, reserved columns, duplicates, no columns', () => {
  const s = fresh();
  assert.match(mkTable(s, { name: 'Manufacturing' }).error.message, /must end with _CL/);
  assert.match(mkTable(s, { name: '1bad_CL' }).error.message, /must start with a letter/);
  assert.match(mkTable(s, { columns: [{ name: 'Type', type: 'string' }] }).error.message, /reserved column name/);
  assert.match(mkTable(s, { columns: [{ name: 'A', type: 'string' }, { name: 'a', type: 'string' }] }).error.message, /defined twice/);
  assert.equal(mkTable(s, { columns: [] }).ok, false);
  assert.ok(mkTable(s).ok);
  assert.match(mkTable(s).error.message, /already exists/);
  // The same name in another case is the same table.
  assert.match(mkTable(s, { name: 'manufacturingaudit_CL' }).error.message, /already exists/);
  assert.match(mkTable(s, { name: T.toLowerCase() }).error.message, /case-sensitive/, 'a lower-case suffix is explained, not just rejected');
});

test('names that collide with existing tables are refused regardless of case', () => {
  assert.throws(() => buildCustomTable({ name: 'MyTable_CL', columns: [{ name: 'A', type: 'string' }] }, { existingNames: ['mytable_cl'] }), /already exists/);
});

test('table cap: at most 10 custom tables', () => {
  const s = fresh();
  for (let i = 0; i < 10; i++) assert.ok(perform(s.ctx, 'sentinel.createCustomTable', { name: `T${i}_CL`, columns: [{ name: 'A', type: 'string' }] }).ok, `T${i}`);
  assert.match(perform(s.ctx, 'sentinel.createCustomTable', { name: 'T10_CL', columns: [{ name: 'A', type: 'string' }] }).error.message, /Sandbox limit reached/);
});

test('ingestion: a record lands with typed values and is queryable; TimeGenerated is added', () => {
  const s = fresh();
  mkTable(s);
  const dcr = mkDcr(s).data.dcr.id;
  assert.equal(met(s, 'data'), false, 'nothing sent yet');
  const out = perform(s.ctx, 'sentinel.ingest', { dcrId: dcr, records: [rec(GOOD)] });
  assert.ok(out.ok, out.error?.message);
  assert.equal(out.data.accepted, 1);
  assert.equal(met(s, 'data'), false, 'the record must be found with a query');
  const q = perform(s.ctx, 'query.run', { surface: 'sentinel', text: `${T} | where Action == "ValveOpen" | project EventTime, User, AssetId` });
  assert.ok(q.ok, q.error?.message);
  assert.equal(q.data.result.rows.length, 1);
  assert.equal(met(s, 'data'), true);
  const row = s.world.tables.get(T).rows[0];
  assert.ok(row.TimeGenerated instanceof Date && row.EventTime instanceof Date);
});

test('ingestion: undeclared fields, bad dates, bad numbers and wrong DCR ids are rejected, and nothing is partly stored', () => {
  const s = fresh();
  mkTable(s, { columns: [...COLS, { name: 'Bytes', type: 'long' }] });
  const dcr = mkDcr(s, { columns: [...COLS, { name: 'Bytes', type: 'long' }] }).data.dcr.id;
  assert.match(perform(s.ctx, 'sentinel.ingest', { dcrId: dcr, records: [rec({ ...GOOD, Surprise: 'x' })] }).error.message, /'Surprise' that is not declared/);
  assert.match(perform(s.ctx, 'sentinel.ingest', { dcrId: dcr, records: [rec({ ...GOOD, EventTime: 'not a date' })] }).error.message, /not a valid date/);
  assert.match(perform(s.ctx, 'sentinel.ingest', { dcrId: dcr, records: [rec({ ...GOOD, Bytes: 'lots' })] }).error.message, /must be a number/);
  assert.equal(perform(s.ctx, 'sentinel.ingest', { dcrId: 'dcr-nope', records: [rec(GOOD)] }).error.code, 'NotFound');
  // second record bad: the first must not be stored either
  assert.equal(perform(s.ctx, 'sentinel.ingest', { dcrId: dcr, records: [rec(GOOD), rec({ ...GOOD, Bytes: 'x' })] }).ok, false);
  assert.equal(s.world.tables.get(T).rows.length, 0, 'all-or-nothing');
  assert.ok(perform(s.ctx, 'sentinel.ingest', { dcrId: dcr, records: [rec({ ...GOOD, Bytes: '42' })] }).ok);
  assert.strictEqual(s.world.tables.get(T).rows[0].Bytes, 42);
});

test('ingestion: a DCR column name that differs from the table only in case still works (matching is case-insensitive)', () => {
  const s = fresh();
  mkTable(s);
  const dcr = mkDcr(s, { columns: COLS.map((c) => ({ ...c, name: c.name.toLowerCase() })) });
  assert.ok(dcr.ok, dcr.error?.message);
  const out = perform(s.ctx, 'sentinel.ingest', { dcrId: dcr.data.dcr.id, records: [rec({ eventtime: GOOD.EventTime, user: 'u' })] });
  assert.ok(out.ok, out.error?.message);
  assert.equal(s.world.tables.get(T).rows[0].User, 'u', 'stored under the table\'s own column name');
});

test('ingestion: a custom table is capped at 2000 rows', () => {
  const s = fresh();
  mkTable(s);
  const dcr = mkDcr(s).data.dcr.id;
  s.world.tables.get(T).rows.length = 1999;
  assert.match(perform(s.ctx, 'sentinel.ingest', { dcrId: dcr, records: [rec(GOOD), rec(GOOD)] }).error.message, /at most 2000 rows/);
});

test('hostile values: HTML and prototype names are stored as plain data, and the connector catalogue ids are own-property only', () => {
  const s = fresh();
  mkTable(s);
  const dcr = mkDcr(s).data.dcr.id;
  assert.ok(perform(s.ctx, 'sentinel.ingest', { dcrId: dcr, records: [rec({ ...GOOD, User: '<img src=x onerror=alert(1)>' })] }).ok);
  assert.equal(s.world.tables.get(T).rows[0].User, '<img src=x onerror=alert(1)>');
  for (const id of ['constructor', '__proto__', 'toString']) assert.equal(getConnector(id), null);
  assert.equal(perform(s.ctx, 'sentinel.connectConnector', { id: 'constructor' }).ok, false);
  assert.throws(() => connect(null, { apps: [] }), /Connector not found/);
});

test('the ingestion view lists connectors with their connection state and never leaks rows', () => {
  const s = fresh();
  perform(s.ctx, 'sentinel.connectConnector', { id: 'm365', apps: ['SharePoint', 'Teams'] });
  mkTable(s);
  const v = getView(s.world, 'ingestion');
  const m = v.catalogue.find((c) => c.id === 'm365');
  assert.equal(m.connected, true);
  assert.deepEqual(m.connectedApps, ['SharePoint', 'Teams']);
  assert.equal(v.catalogue.find((c) => c.id === 'mdo').connected, false);
  assert.equal(v.tables[0].rows, 0, 'a row count, not the rows');
  assert.ok(!JSON.stringify(v).includes('payroll'), 'no ingested data in the view');
});
