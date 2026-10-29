import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, KqlError, LIMITS } from '../server/sim/kql/engine.js';

const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);
const t = (mins) => new Date(NOW - mins * 60_000);

const tables = new Map([
  ['SigninLogs', {
    columns: [{ name: 'TimeGenerated' }, { name: 'UserPrincipalName' }, { name: 'IPAddress' }, { name: 'ResultType' }],
    rows: [
      { TimeGenerated: t(5), UserPrincipalName: 'a@contoso.com', IPAddress: '1.1.1.1', ResultType: '0' },
      { TimeGenerated: t(10), UserPrincipalName: 'a@contoso.com', IPAddress: '2.2.2.2', ResultType: '50126' },
      { TimeGenerated: t(20), UserPrincipalName: 'b@contoso.com', IPAddress: '2.2.2.2', ResultType: '50126' },
      { TimeGenerated: t(60 * 30), UserPrincipalName: 'b@contoso.com', IPAddress: '3.3.3.3', ResultType: '0' },
    ],
  }],
  ['AuditLogs', {
    columns: [{ name: 'TimeGenerated' }, { name: 'IPAddress' }, { name: 'OperationName' }],
    rows: [{ TimeGenerated: t(3), IPAddress: '2.2.2.2', OperationName: 'Add member to role' }],
  }],
]);
const q = (text) => runQuery(text, { tables, now: NOW });

test('where / project / sort / take', () => {
  const r = q('SigninLogs | where ResultType == "50126" | project UserPrincipalName, IPAddress | sort by UserPrincipalName asc | take 5');
  assert.deepEqual(r.rows, [['a@contoso.com', '2.2.2.2'], ['b@contoso.com', '2.2.2.2']]);
});

test('ago() and time arithmetic', () => {
  assert.equal(q('SigninLogs | where TimeGenerated > ago(1d)').rows.length, 3);
  assert.equal(q('SigninLogs | where TimeGenerated > ago(1h)').rows.length, 3);
  assert.equal(q('SigninLogs | where TimeGenerated > ago(15m)').rows.length, 2);
});

test('summarize count / dcount / by', () => {
  const r = q('SigninLogs | summarize n=count(), ips=dcount(IPAddress) by UserPrincipalName | sort by UserPrincipalName asc');
  assert.deepEqual(r.rows, [['a@contoso.com', 2, 2], ['b@contoso.com', 2, 2]]);
});

test('summarize with bin() and render', () => {
  const r = q('SigninLogs | summarize Count=count() by bin(TimeGenerated, 1d) | render timechart');
  assert.equal(r.meta.render, 'timechart');
  assert.equal(r.columns[0].name, 'TimeGenerated');
});

test('union across tables finds an IP', () => {
  const r = q('union SigninLogs, AuditLogs | where IPAddress == "2.2.2.2"');
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.meta.tables.sort(), ['AuditLogs', 'SigninLogs']);
});

test('has is term-based, contains is substring', () => {
  assert.equal(q('AuditLogs | where OperationName has "role"').rows.length, 1);
  assert.equal(q('AuditLogs | where OperationName has "rol"').rows.length, 0);
  assert.equal(q('AuditLogs | where OperationName contains "rol"').rows.length, 1);
  assert.equal(q('AuditLogs | where OperationName startswith "ADD"').rows.length, 1);
});

test('in, !in, between, and/or precedence', () => {
  assert.equal(q('SigninLogs | where ResultType in ("0", "50126")').rows.length, 4);
  assert.equal(q('SigninLogs | where ResultType !in ("0")').rows.length, 2);
  assert.equal(q('SigninLogs | where IPAddress == "1.1.1.1" or IPAddress == "3.3.3.3" and ResultType == "9"').rows.length, 1);
});

test('arg_max keeps whole winning row', () => {
  const r = q('SigninLogs | summarize arg_max(TimeGenerated, *) by UserPrincipalName | sort by UserPrincipalName asc');
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.columns.map((c) => c.name), ['UserPrincipalName', 'TimeGenerated', 'IPAddress', 'ResultType']);
  assert.equal(r.rows[0][2], '1.1.1.1');
});

test('count_distinct and a failed-and-401-or-403 style filter', () => {
  const r = q('SigninLogs | where ResultType == "50126" or ResultType == "0" | summarize U=count_distinct(IPAddress) by UserPrincipalName');
  assert.equal(r.rows.length, 2);
});

test('helpful errors: unknown column suggests the right one', () => {
  assert.throws(() => q('SigninLogs | where IpAddres == "x"'), (e) => e instanceof KqlError && /Did you mean 'IPAddress'/.test(e.message));
});

test('helpful errors: unknown table, join unsupported, syntax', () => {
  assert.throws(() => q('SigninLog | take 1'), /Did you mean 'SigninLogs'/);
  assert.throws(() => q('SigninLogs | lookup AuditLogs on IPAddress'), /not supported/);
  assert.throws(() => q('SigninLogs | join kind=fullouter (AuditLogs) on IPAddress'), /not supported/);
  assert.throws(() => q('SigninLogs | join AuditLogs on IPAddress'), /Syntax error/); // the right side must be parenthesised
  assert.throws(() => q('SigninLogs | where'), /Syntax error/);
  assert.throws(() => q('SigninLogs | where "abc'), /unterminated/);
});

test('prototype-ish names are inert', () => {
  assert.throws(() => q('constructor | take 1'), /Failed to resolve/);
  assert.throws(() => q('SigninLogs | where __proto__ == 1'), /Failed to resolve/);
  assert.throws(() => q('SigninLogs | where toString(1) == "1" and constructor(1)'), /Unknown function/);
});

test('limits: query length, nesting depth, result rows', () => {
  assert.throws(() => q('SigninLogs | where ' + 'a'.repeat(LIMITS.maxQueryLength)), /too long/);
  assert.throws(() => q('SigninLogs | where ' + '('.repeat(200) + '1' + ')'.repeat(200)), /nested too deeply/);
  const big = new Map([['T', { columns: [{ name: 'x' }], rows: Array.from({ length: 1500 }, (_, i) => ({ x: i })) }]]);
  const r = runQuery('T', { tables: big, now: NOW });
  assert.equal(r.rows.length, LIMITS.maxResultRows);
  assert.equal(r.meta.truncated, true);
});

test('join: inner on a shared column, right-side name clashes get a numeric suffix', () => {
  const r = q('SigninLogs | where ResultType == "50126" | join (AuditLogs | project IPAddress, OperationName, TimeGenerated) on IPAddress | project UserPrincipalName, OperationName, TimeGenerated, TimeGenerated1');
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.columns.map((c) => c.name), ['UserPrincipalName', 'OperationName', 'TimeGenerated', 'TimeGenerated1']);
});

test('join: $left/$right keys, leftouter keeps unmatched rows, inner drops them', () => {
  const inner = q('SigninLogs | join (AuditLogs) on $left.IPAddress == $right.IPAddress');
  const outer = q('SigninLogs | join kind=leftouter (AuditLogs) on IPAddress');
  assert.equal(inner.rows.length, 2);
  assert.equal(outer.rows.length, 4);
});

test('join: helpful errors for a missing key column, and a runaway join is capped', () => {
  assert.throws(() => q('SigninLogs | join (AuditLogs) on IpAddres'), /left side of the join\. Did you mean 'IPAddress'/);
  assert.throws(() => q('SigninLogs | join (AuditLogs) on $left.IPAddress == $right.Nope'), /right side of the join/);
  const dup = new Map([['A', { columns: [{ name: 'k' }], rows: Array.from({ length: 400 }, () => ({ k: 1 })) }]]);
  assert.throws(() => runQuery('A | join (A) on k', { tables: dup, now: NOW }), /join produced more than/);
});

test('scanCost: aggregating a huge raw table times out, a small summary table does not', () => {
  const raw = { columns: [{ name: 'x' }], rows: Array.from({ length: 5000 }, (_, i) => ({ x: i })), scanCost: 1000 };
  const summary = { columns: [{ name: 'x' }], rows: [{ x: 1 }] };
  const tbl = new Map([['Raw_CL', raw], ['Summary_CL', summary]]);
  assert.throws(() => runQuery('Raw_CL | summarize count()', { tables: tbl, now: NOW }), (e) => e.kind === 'Timeout' && /summary rule/.test(e.message));
  assert.equal(runQuery('Summary_CL | summarize count()', { tables: tbl, now: NOW }).rows[0][0], 1);
});
