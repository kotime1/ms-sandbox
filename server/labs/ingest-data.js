import { visited } from './helpers.js';

const SHAREPOINT = (w) => w.tables.get('OfficeActivity')?.rows.some((r) => r.OfficeWorkload === 'SharePoint') && w.enabledTables.has('OfficeActivity');
const m365 = (w) => w.sentinel.connectors.find((c) => c.id === 'm365');
// The manufacturing app's fields (from the scenario): EventTime, User, Action, AssetId, Result.
const FIELDS = { EventTime: 'datetime', User: 'string', Action: 'string', AssetId: 'string', Result: 'string' };
const customTable = (w) => w.sentinel.customTables.map((t) => ({ t, tbl: w.tables.get(t.name) })).find(({ tbl }) => tbl && Object.entries(FIELDS).every(([n, ty]) => tbl.columns.some((c) => c.name === n && c.type === ty)));
const dcrFor = (w) => { const c = customTable(w); return c && w.sentinel.dcrs.find((d) => d.table === c.t.name); };

export default {
  id: 'ingest-data',
  title: 'Bring SharePoint and a factory app into Sentinel',
  level: 'Intermediate',
  minutes: 15,
  topics: ['Data connectors', 'Microsoft 365 connector', 'Custom log tables', 'Data collection rules', 'Logs Ingestion API'],
  examObjective: '1.3 Ingest data into the Microsoft Sentinel SIEM and platform',
  sourceQuestions: { set1: [], set2: [], set3: [11, 13] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'partial', note: 'The connector name and its OfficeActivity table are from the Microsoft Sentinel tables-and-connectors reference, and the order of Logs Ingestion API setup (table first, then the DCR; _CL suffix; Custom- stream) is from the Azure Monitor Logs Ingestion API page, both checked 2026-11-02. That Defender for Office 365 does not carry SharePoint audit events is from the practice question. The screens, the app registration and the data collection endpoint are simplified or not modelled.' },
  scenarios: [],
  withholdNotes: ['ingestion'],
  brief:
    'Two data sources are missing from Sentinel. First, the security team wants events from the SharePoint Online site your company runs, so analysts can query them with KQL. ' +
    'Second, a manufacturing application in a datacentre writes JSON audit records with these fields: EventTime (a date and time), User, Action, AssetId and Result (text). It will send them to Azure with the Azure Monitor Logs Ingestion API and a data collection rule. ' +
    'The records match no existing Sentinel table, and analysts must be able to query them with their own column names and data types. ' +
    'Connect the SharePoint data, then set up the destination for the application in the right order, and prove it works by sending one record and finding it in the table.',

  setup() { return []; },

  objectives: [
    {
      id: 'sharepoint', text: 'SharePoint Online events are queryable in Advanced hunting.',
      check: (w) => Boolean(SHAREPOINT(w) && m365(w)?.apps?.includes('SharePoint')),
    },
    {
      id: 'table', text: 'A custom log table exists with the application\'s five fields and their types.',
      check: (w) => Boolean(customTable(w)),
    },
    {
      id: 'dcr', text: 'A data collection rule delivers the application\'s records to that table.',
      check: (w) => Boolean(dcrFor(w)),
    },
    {
      id: 'data', text: 'A record sent by the application arrives and can be found with a query.',
      check: (w) => {
        const c = customTable(w);
        if (!c || !dcrFor(w) || c.tbl.rows.length === 0) return false;
        return w.queries.some((q) => q.tables.includes(c.t.name) && q.records.length > 0);
      },
    },
  ],

  steps: [
    { text: 'Open Data connectors.', target: 'nav:sentinel/connectors', done: (w) => visited(w, 'sentinel/connectors') },
    { text: 'Connect the connector that carries SharePoint Online events.', target: 'btn:connect', done: (w) => Boolean(SHAREPOINT(w)) },
    { text: 'Create the custom table the application will write to.', target: 'btn:create-table', done: (w) => Boolean(customTable(w)) },
    { text: 'Create the data collection rule for it.', target: 'btn:create-dcr', done: (w) => Boolean(dcrFor(w)) },
    { text: 'Send a record, then query the new table.', target: 'btn:run-query', done: (w) => w.queries.some((q) => customTable(w) && q.tables.includes(customTable(w).t.name)) },
  ],

  hints: {
    sharepoint: [
      'Look at what each connector says it ingests, not just its product name. One is an email threat product; one carries audit activity from the Microsoft 365 apps.',
      'SharePoint events are audit activity for the Microsoft 365 workloads. Open that connector and choose the SharePoint app.',
      'Connect "Microsoft 365 (formerly, Office 365)" with SharePoint ticked. Its table is OfficeActivity.',
    ],
    table: [
      'The Logs Ingestion API needs somewhere to put the data, with the names and types you want, before anything is sent.',
      'Create a custom log table first. Names end in _CL. Define EventTime as a datetime and the rest as string.',
      'Create ManufacturingAudit_CL with columns EventTime (datetime), User, Action, AssetId, Result (string).',
    ],
    dcr: [
      'The rule tells Azure Monitor the shape of the incoming JSON and where to send it.',
      'Point it at your table and declare the same five columns with matching types. A rule for a table that does not exist is refused.',
      'Create a data collection rule with destination ManufacturingAudit_CL and the five columns.',
    ],
    data: [
      'Use the rule\'s Send sample data button to act as the application.',
      'Then query the new table in Advanced hunting to confirm the row is there.',
      'ManufacturingAudit_CL | take 10 after you have sent a record.',
    ],
  },

  debrief: [
    'SharePoint Online audit events come from the Microsoft 365 connector (formerly Office 365), which also covers Exchange Online and Teams, and writes to OfficeActivity. The Defender for Office 365 connector is about email threat protection and does not carry the SharePoint audit log.',
    'For the Logs Ingestion API the destination table must exist before you send data. Creating the custom log table is the first step because it is where you choose the column names and data types. Custom table names end in _CL.',
    'Then you create a data collection rule: it declares the incoming stream (Custom-<table>), maps it to the table, and can transform data that does not match. Then the application authenticates with an app registration and posts JSON to the rule.',
    'The distractors fail for specific reasons. A DCR for Azure Monitor Agent custom text logs is for files on monitored machines, not an application that calls the API. Sending to AzureDiagnostics gives you no control over the schema.',
    'The sandbox leaves out the Entra app registration, the Monitoring Metrics Publisher role on the rule, and the data collection endpoint. A real setup needs all three.',
  ],

  solution: (w) => [
    ['sentinel.connectConnector', { id: 'm365', apps: ['SharePoint'] }],
    ['sentinel.createCustomTable', { name: 'ManufacturingAudit_CL', columns: Object.entries(FIELDS).map(([name, type]) => ({ name, type })) }],
    ['sentinel.createDcr', { name: 'dcr-manufacturing', table: 'ManufacturingAudit_CL', columns: Object.entries(FIELDS).map(([name, type]) => ({ name, type })) }],
    ['sentinel.ingest', { dcrId: `dcr-${w.counters.rule}`, records: [[{ name: 'EventTime', value: '2026-11-02T09:00:00Z' }, { name: 'User', value: 'operator7' }, { name: 'Action', value: 'ValveOpen' }, { name: 'AssetId', value: 'PUMP-12' }, { name: 'Result', value: 'Success' }]] }],
    ['query.run', { surface: 'sentinel', text: 'ManufacturingAudit_CL | take 10' }],
  ],
};
