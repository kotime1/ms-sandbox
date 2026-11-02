// Data ingestion into the Sentinel workspace: data connectors, custom tables and data collection rules (DCRs).
// Sources (checked 2026-11-02):
//   learn.microsoft.com/azure/sentinel/sentinel-tables-connectors-reference   (OfficeActivity is fed by "Microsoft 365 (formerly, Office 365)")
//   learn.microsoft.com/azure/azure-monitor/logs/logs-ingestion-api-overview  (the table must exist first; _CL suffix; DCR stream and output stream names)
// Connector table lists beyond OfficeActivity are simplified. Column lists are small versions of the real schemas.

import { SimError } from './world-errors.js';

/** The catalogue the Data connectors page offers. `needs` marks connectors whose Connect step asks which apps to include. */
export const CATALOGUE = Object.freeze([
  { id: 'm365', name: 'Microsoft 365 (formerly, Office 365)', blurb: 'Audit activity from Exchange Online, SharePoint Online and Microsoft Teams.', tables: ['OfficeActivity'], apps: ['Exchange', 'SharePoint', 'Teams'] },
  { id: 'mdo', name: 'Microsoft Defender for Office 365', blurb: 'Email threat protection alerts and email events: phishing, malware and Safe Links verdicts. Not the Exchange, SharePoint or Teams audit log.', tables: ['EmailEvents'], apps: [] },
  { id: 'entra', name: 'Microsoft Entra ID', blurb: 'Sign-in and audit logs.', tables: ['SigninLogs', 'AuditLogs'], apps: [] },
]);
const BY_ID = new Map(CATALOGUE.map((c) => [c.id, c]));
export const getConnector = (id) => BY_ID.get(id) ?? null;

export const COLUMN_TYPES = ['string', 'datetime', 'long', 'real', 'boolean', 'dynamic'];
export const MAX_CUSTOM_TABLES = 10;
export const MAX_COLUMNS = 30;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,44}$/;
const RESERVED = new Set(['_resourceid', 'id', '_subscriptionid', 'tenantid', 'type', 'uniqueid', 'title']);

/** Connect a connector, optionally with a subset of apps. Returns the data the sandbox should now receive. */
export function connect(connector, { apps }) {
  if (!connector) throw new SimError('Connector not found', 'NotFound');
  if (connector.apps.length) {
    const chosen = [...new Set(apps)];
    if (!chosen.length) throw new SimError(`Select at least one of: ${connector.apps.join(', ')}.`);
    const bad = chosen.find((a) => !connector.apps.includes(a));
    if (bad) throw new SimError(`'${bad}' is not an app for this connector. Options: ${connector.apps.join(', ')}.`);
    return { apps: chosen };
  }
  if (apps.length) throw new SimError(`${connector.name} has no app selection.`);
  return { apps: [] };
}

/** Validate a custom table definition (the first step of the Logs Ingestion API setup). */
export function buildCustomTable(p, { existingNames }) {
  if (!/_CL$/.test(p.name)) throw new SimError(/_cl$/i.test(p.name) ? 'The custom log table suffix is case-sensitive: it must be exactly _CL (capital C and L).' : 'A custom log table name must end with _CL, for example ManufacturingAudit_CL.');
  const base = p.name.slice(0, -3);
  if (!NAME.test(base)) throw new SimError('A table name must start with a letter and use only letters, digits and underscores.');
  if (existingNames.includes(p.name.toLowerCase())) throw new SimError(`A table named '${p.name}' already exists.`);
  if (!p.columns.length) throw new SimError('Define at least one column.');
  if (p.columns.length > MAX_COLUMNS) throw new SimError(`At most ${MAX_COLUMNS} columns.`);
  const seen = new Set();
  for (const c of p.columns) {
    if (!NAME.test(c.name)) throw new SimError(`'${c.name}' is not a valid column name. Start with a letter; use up to 45 letters, digits and underscores.`);
    if (RESERVED.has(c.name.toLowerCase())) throw new SimError(`'${c.name}' is a reserved column name.`);
    if (seen.has(c.name.toLowerCase())) throw new SimError(`Column '${c.name}' is defined twice.`);
    seen.add(c.name.toLowerCase());
  }
  // TimeGenerated is added automatically in a real workspace; the sandbox does the same so queries over time work.
  const columns = [{ name: 'TimeGenerated', type: 'datetime' }, ...p.columns.filter((c) => c.name.toLowerCase() !== 'timegenerated').map((c) => ({ name: c.name, type: c.type }))];
  return columns;
}

/**
 * Validate a data collection rule for the Logs Ingestion API.
 * The table must already exist; the stream declaration must describe the incoming JSON; the output stream is Custom-<table>.
 */
export function buildDcr(p, { tables }) {
  const table = tables.get(p.table);
  if (!table) throw new SimError(`The destination table '${p.table}' does not exist. Create the custom table first: the Logs Ingestion API cannot send data to a table that is not there.`);
  if (!/_CL$/.test(p.table)) throw new SimError('A data collection rule for the Logs Ingestion API targets a custom (_CL) table in the sandbox.');
  if (!p.columns.length) throw new SimError('Declare the columns of the incoming data.');
  const known = new Map(table.columns.map((c) => [c.name.toLowerCase(), c]));
  for (const c of p.columns) {
    const t = known.get(c.name.toLowerCase());
    if (!t) throw new SimError(`The incoming column '${c.name}' has no matching column in ${p.table}. Add a transformation to map it, or add the column to the table.`);
    if (t.type !== c.type) throw new SimError(`The incoming column '${c.name}' is ${c.type} but ${p.table}.${t.name} is ${t.type}. They must match, or the DCR needs a transformation.`);
  }
  return { stream: `Custom-${p.table}`, outputStream: `Custom-${p.table}` };
}

/** Convert a JSON value to the declared column type, or explain why it cannot be. */
function coerce(c, v, i) {
  const where = `Record ${i + 1}: '${c.name}'`;
  switch (c.type) {
    case 'datetime': { const d = new Date(v); if (Number.isNaN(d.getTime())) throw new SimError(`${where} is not a valid date and time.`); return d; }
    case 'long': case 'real': { const n = typeof v === 'number' ? v : Number(v); if (!Number.isFinite(n) || String(v).trim() === '') throw new SimError(`${where} must be a number.`); return c.type === 'long' ? Math.trunc(n) : n; }
    case 'boolean': { if (v === true || v === 'true') return true; if (v === false || v === 'false') return false; throw new SimError(`${where} must be true or false.`); }
    default: return String(v);
  }
}

/** Send records through a DCR. Records that do not match the declared stream are rejected, not guessed at. */
export function ingest(dcr, records, table) {
  const declared = new Set(dcr.columns.map((c) => c.name));
  const cols = new Map(table.columns.map((c) => [c.name.toLowerCase(), c])); // buildDcr matched case-insensitively, so must this
  const rows = [];
  for (const [i, rec] of records.entries()) {
    const extra = Object.keys(rec).find((k) => !declared.has(k));
    if (extra) throw new SimError(`Record ${i + 1} has a field '${extra}' that is not declared in the data collection rule.`);
    const row = { TimeGenerated: new Date() };
    for (const c of dcr.columns) {
      const v = rec[c.name];
      const target = cols.get(c.name.toLowerCase()).name;
      row[target] = v === undefined || v === null ? null : coerce(c, v, i);
    }
    rows.push(row);
  }
  return rows;
}
