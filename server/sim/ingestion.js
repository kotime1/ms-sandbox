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
  { id: 'entra-protect', name: 'Microsoft Entra ID Protection', blurb: 'Risk detections and risky-user alerts from Microsoft Entra ID Protection.', tables: ['SecurityAlert'], apps: [] },
  { id: 'cef', name: 'Common Event Format (CEF) via AMA', blurb: 'CEF messages from network and security appliances, collected by the Azure Monitor Agent on a Linux log forwarder.', tables: ['CommonSecurityLog'], apps: [], needsForwarder: true },
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
export const FORWARDER_OS = ['Linux', 'Windows'];
export const MAX_FORWARDERS = 5;

/**
 * A log forwarder: the machine network devices send their CEF/Syslog messages to. Source (checked 2026-11-04):
 * learn.microsoft.com/azure/sentinel/connect-cef-syslog-ama - "You must have a designated Linux VM as a log forwarder"; the forwarder
 * needs rsyslog or syslog-ng, Python, and (if it is not an Azure VM) the Azure Arc Connected Machine agent.
 */
export function buildForwarder(p, { existing }) {
  if (existing.length >= MAX_FORWARDERS) throw new SimError(`You can have at most ${MAX_FORWARDERS} log forwarders in the sandbox.`);
  if (existing.some((f) => f.name.toLowerCase() === p.name.toLowerCase())) throw new SimError(`A machine named '${p.name}' already exists.`);
  if (p.os !== 'Linux') {
    throw new SimError(`A Windows machine cannot be a CEF/Syslog log forwarder. The forwarder runs a syslog daemon (rsyslog or syslog-ng), so it must be a Linux machine.`);
  }
  return { name: p.name, os: 'Linux', daemon: 'rsyslog', arc: !p.azureVm };
}

export function connect(connector, { apps, forwarders = [] }) {
  if (!connector) throw new SimError('Connector not found', 'NotFound');
  if (connector.needsForwarder && !forwarders.some((f) => f.os === 'Linux')) {
    throw new SimError(`${connector.name} collects messages through a Linux log forwarder, and there is none yet. Deploy a Linux machine to receive the CEF messages first, then connect.`);
  }
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

// ---- Azure Monitor Agent collection: which machines can a data collection rule target? ---------------------------------------------
// Source (checked 2026-11-04): learn.microsoft.com/azure/sentinel/connect-services-windows-based
//   "To collect events from any system that is not an Azure virtual machine, the system must have Azure Arc installed and enabled BEFORE you
//    enable the Azure Monitor Agent-based connector" (Windows servers on physical machines, on-premises VMs, VMs in non-Azure clouds).
//   The DCR Resources picker lists "Azure virtual machines and Azure Arc-enabled servers". The DCR itself may sit in any resource group or
//   subscription, as long as it is in the same tenant.
export const MACHINE_KINDS = ['Azure VM', 'On-premises'];
export const MAX_MACHINES = 60;

/** The machines a DCR's Resources picker offers: Azure VMs always, anything else only once Arc-enabled. */
export const pickerMachines = (machines) => machines.filter((m) => m.kind === 'Azure VM' || m.arc);

/** Install the Azure Connected Machine agent (Azure Arc) on a non-Azure machine. */
export function enableArc(machine) {
  if (!machine) throw new SimError('Machine not found', 'NotFound');
  if (machine.kind === 'Azure VM') throw new SimError(`${machine.name} is an Azure virtual machine: it is already an Azure resource and needs no Azure Arc agent.`);
  if (machine.arc) throw new SimError(`${machine.name} is already Azure Arc-enabled.`);
  return { ...machine, arc: true };
}

/** Apply a data collection rule to machines. Returns the machines now collecting. */
export function applyCollectionRule(p, { machines, dcrLocation, workspaceLocation }) {
  if (!p.machineNames.length) throw new SimError('Select at least one machine.');
  const offered = new Map(pickerMachines(machines).map((m) => [m.name, m]));
  const missing = p.machineNames.find((n) => !offered.has(n));
  if (missing) {
    const exists = machines.some((m) => m.name === missing);
    throw new SimError(exists
      ? `${missing} is not in the resource picker. A machine that is not an Azure virtual machine must be Azure Arc-enabled (the Azure Connected Machine agent installed) before a data collection rule can target it.`
      : `${missing} is not a machine in this environment.`);
  }
  // The DCR can live in a different resource group or subscription than the machines; the location must match the workspace.
  if (dcrLocation !== workspaceLocation) throw new SimError(`The data collection rule must be in the same region as the Log Analytics workspace (${workspaceLocation}).`);
  return [...new Set(p.machineNames)].map((n) => offered.get(n).name);
}
