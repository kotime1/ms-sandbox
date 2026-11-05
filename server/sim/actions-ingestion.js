// Data connectors, custom tables, data collection rules and ingestion (Logs Ingestion API). Rules: ingestion.js.

import { idSpec } from '../core/validate.js';
import { SimError, capCheck, enableTables } from './world.js';
import { pickerMachines, enableArc, applyCollectionRule } from './ingestion.js';
import { CATALOGUE, COLUMN_TYPES, MAX_COLUMNS, FORWARDER_OS, getConnector, connect, buildCustomTable, buildDcr, buildForwarder, ingest } from './ingestion.js';

const MIN = 60_000;
const ago = (m) => new Date(Date.now() - m * MIN);
const label = (max) => ({ type: 'string', min: 1, max, pattern: /^[\w .:()@/\\-]+$/ });
const colSpec = { type: 'object', shape: { name: { type: 'string', min: 1, max: 45, pattern: /^[A-Za-z][A-Za-z0-9_]*$/ }, type: { type: 'enum', values: COLUMN_TYPES } } };

// What each Microsoft 365 app writes to OfficeActivity once connected. Synthetic, deterministic, contoso.com.
const M365_ROWS = {
  SharePoint: [
    ['SharePoint', 'FileDownloaded', 'dana.ortiz@contoso.com', '192.0.2.24', 'Finance/Q3-forecast.xlsx', 'https://contoso.sharepoint.com/sites/Finance'],
    ['SharePoint', 'FileDownloaded', 'dana.ortiz@contoso.com', '192.0.2.24', 'Finance/Payroll.xlsx', 'https://contoso.sharepoint.com/sites/Finance'],
    ['SharePoint', 'SharingSet', 'jamie.fox@contoso.com', '192.0.2.57', 'HR/Handbook.docx', 'https://contoso.sharepoint.com/sites/HR'],
  ],
  Exchange: [['Exchange', 'MailItemsAccessed', 'alex.rivera@contoso.com', '192.0.2.10', 'Inbox', '']],
  Teams: [['Teams', 'MemberAdded', 'sam.okafor@contoso.com', '192.0.2.88', 'Ops channel', '']],
};
const emailRows = () => [
  { Timestamp: ago(50), NetworkMessageId: 'nm-1', SenderFromAddress: 'billing@fabrikam.example', RecipientEmailAddress: 'dana.ortiz@contoso.com', Subject: 'Invoice overdue', ThreatTypes: 'Phish', DeliveryAction: 'Blocked' },
];

export const INGESTION_ACTIONS = {
  // Configuration > Data connectors > Open connector page > Connect
  'sentinel.connectConnector': {
    spec: { id: idSpec(), apps: { type: 'array', of: { type: 'string', min: 1, max: 20, pattern: /^[A-Za-z]+$/ }, max: 5, optional: true, default: [] } },
    run({ w }, p) {
      const c = getConnector(p.id);
      const { apps } = connect(c, { apps: p.apps, forwarders: w.sentinel.forwarders });
      const existing = w.sentinel.connectors.find((x) => x.id === c.id);
      const entry = existing ?? { id: c.id, name: c.name, status: 'Not connected', tables: [] };
      if (!existing) w.sentinel.connectors.push(entry);
      entry.status = 'Connected'; entry.tables = c.tables; entry.apps = apps;
      // Make the connector's tables queryable, and fill them from the apps the learner chose.
      for (const t of c.tables) {
        if (w.tables.has(t) && ['OfficeActivity', 'EmailEvents', 'CommonSecurityLog'].includes(t)) enableTables(w, t);
      }
      if (c.id === 'm365') {
        const rows = w.tables.get('OfficeActivity').rows;
        rows.length = 0;
        for (const app of apps) for (const [OfficeWorkload, Operation, UserId, ClientIP, OfficeObjectId, SiteUrl] of M365_ROWS[app] ?? []) {
          rows.push({ TimeGenerated: ago(30 + rows.length * 7), OfficeWorkload, Operation, UserId, ClientIP, OfficeObjectId, SiteUrl });
        }
      }
      if (c.id === 'cef') {
        const rows = w.tables.get('CommonSecurityLog').rows;
        rows.length = 0;
        rows.push(
          { TimeGenerated: ago(12), DeviceVendor: 'Palo Alto Networks', DeviceProduct: 'PAN-OS', Activity: 'TRAFFIC', SourceIP: '192.0.2.31', DestinationIP: '198.51.100.7', LogSeverity: '3' },
          { TimeGenerated: ago(9), DeviceVendor: 'Cisco', DeviceProduct: 'ASA', Activity: 'Deny inbound TCP', SourceIP: '203.0.113.9', DestinationIP: '192.0.2.50', LogSeverity: '7' },
        );
      }
      if (c.id === 'entra-protect') {
        // Entra ID Protection writes its detections into SecurityAlert, not into a table of its own (set 4 Q14).
        const rows = w.tables.get('SecurityAlert').rows;
        rows.push({ TimeGenerated: ago(25), SystemAlertId: 'ip-1', AlertName: 'Leaked credentials', AlertSeverity: 'High', ProviderName: 'IPC', CompromisedEntity: 'jamie.fox@contoso.com', IPAddress: '203.0.113.88', Description: 'The user credentials were found leaked (Microsoft Entra ID Protection).' });
      }
      if (c.id === 'mdo') { const rows = w.tables.get('EmailEvents').rows; rows.length = 0; rows.push(...emailRows()); }
      return { connected: c.id, tables: c.tables };
    },
  },
  // A machine the network devices send CEF/Syslog to. The CEF connector will not connect until a Linux one exists.
  'sentinel.deployForwarder': {
    spec: { name: label(40), os: { type: 'enum', values: FORWARDER_OS }, azureVm: { type: 'boolean', optional: true, default: true } },
    run({ w }, p) {
      const f = buildForwarder(p, { existing: w.sentinel.forwarders });
      w.sentinel.forwarders.push(f);
      return { forwarder: { name: f.name } };
    },
  },
  // Install the Azure Connected Machine agent (Azure Arc) on a server that is not an Azure VM.
  'sentinel.enableArc': {
    spec: { machine: label(40) },
    run({ w }, p) {
      const i = w.sentinel.machines.findIndex((m) => m.name === p.machine);
      const next = enableArc(w.sentinel.machines[i]);
      w.sentinel.machines[i] = next;
      return { machine: { name: next.name, arc: true } };
    },
  },
  // Windows Security Events via AMA: create a data collection rule that targets machines from the Resources picker.
  'sentinel.applyCollectionRule': {
    spec: { machineNames: { type: 'array', of: label(40), max: 20, min: 1 }, location: { type: 'string', min: 2, max: 20, pattern: /^[a-z0-9]+$/ } },
    run({ w }, p) {
      const names = applyCollectionRule(p, { machines: w.sentinel.machines, dcrLocation: p.location, workspaceLocation: w.sentinel.workspaceLocation });
      for (const m of w.sentinel.machines) if (names.includes(m.name)) m.collecting = true;
      const conn = w.sentinel.connectors.find((c) => c.id === 'ama');
      if (conn) { conn.status = 'Connected'; conn.tables = ['SecurityEvent']; }
      return { collecting: names };
    },
  },
  'sentinel.listCatalogue': { // read-only: the connector gallery
    spec: {},
    run: () => ({ catalogue: CATALOGUE.map((c) => ({ id: c.id, name: c.name, blurb: c.blurb, apps: c.apps, tables: c.tables })) }),
  },

  // Settings > Tables > Create > New custom log (DCR-based). Step one of the Logs Ingestion API setup.
  'sentinel.createCustomTable': {
    spec: { name: label(60), columns: { type: 'array', of: colSpec, min: 1, max: MAX_COLUMNS } },
    run({ w }, p) {
      capCheck(w.sentinel.customTables, 'customTables');
      const columns = buildCustomTable(p, { existingNames: [...w.tables.keys()].map((k) => k.toLowerCase()) });
      w.tables.set(p.name, { columns, rows: [] });
      w.sentinel.customTables.push({ name: p.name });
      return { table: { name: p.name, columns } };
    },
  },

  // Monitor > Data Collection Rules. Needs the table to exist, and its declared columns must match.
  'sentinel.createDcr': {
    spec: { name: label(60), table: label(60), columns: { type: 'array', of: colSpec, min: 1, max: MAX_COLUMNS } },
    run({ w }, p) {
      capCheck(w.sentinel.dcrs, 'dcrs');
      if (w.sentinel.dcrs.some((d) => d.name.toLowerCase() === p.name.toLowerCase())) throw new SimError(`A data collection rule named '${p.name}' already exists.`);
      const { stream } = buildDcr(p, { tables: w.tables });
      const dcr = { id: `dcr-${w.counters.rule++}`, name: p.name, table: p.table, columns: p.columns.map((c) => ({ ...c })), stream };
      w.sentinel.dcrs.push(dcr);
      return { dcr: { id: dcr.id, stream } };
    },
  },

  // The client side of the Logs Ingestion API: POST a JSON array to a DCR stream.
  'sentinel.ingest': {
    // The validator never passes unknown keys, so a record is sent as name/value pairs (one pair per JSON field).
    spec: { dcrId: idSpec(), records: { type: 'array', min: 1, max: 50, of: { type: 'array', min: 1, max: MAX_COLUMNS, of: { type: 'object', shape: { name: { type: 'string', min: 1, max: 45, pattern: /^[A-Za-z][A-Za-z0-9_]*$/ }, value: { type: 'string', max: 200 } } } } } },
    run({ w }, p) {
      const dcr = w.sentinel.dcrs.find((d) => d.id === p.dcrId);
      if (!dcr) throw new SimError('Data collection rule not found', 'NotFound');
      const table = w.tables.get(dcr.table);
      if (!table) throw new SimError(`The destination table '${dcr.table}' no longer exists.`);
      const records = p.records.map((pairs) => Object.fromEntries(pairs.map((x) => [x.name, x.value])));
      const rows = ingest(dcr, records, table);
      if (table.rows.length + rows.length > 2000) throw new SimError('Sandbox limit: at most 2000 rows per custom table.');
      table.rows.push(...rows);
      return { accepted: rows.length };
    },
  },
};
