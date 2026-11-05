import { visited, foundEquals } from './helpers.js';

const linux = (w) => w.sentinel.forwarders.some((f) => f.os === 'Linux');
const connected = (w, id) => w.sentinel.connectors.find((c) => c.id === id)?.status === 'Connected';
const cefReady = (w) => connected(w, 'cef') && w.enabledTables.has('CommonSecurityLog');
const queried = (w, table) => w.queries.some((q) => q.tables.includes(table) && q.records.length > 0);

export default {
  id: 'cef-and-tables',
  title: 'Firewall logs in, and where did Entra ID Protection go?',
  level: 'Intermediate',
  minutes: 12,
  topics: ['Data connectors', 'CEF', 'Log forwarder', 'Azure Monitor Agent', 'SecurityAlert'],
  examObjective: '1.3 Ingest data into the Microsoft Sentinel SIEM and platform',
  sourceQuestions: { set1: [], set2: [], set3: [], set4: [13, 14], set5: [12] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'partial', note: 'The Linux log forwarder prerequisite, the CEF via AMA connector and the CommonSecurityLog table are from Microsoft Learn (connect-cef-syslog-ama), checked 2026-11-04. That Entra ID Protection detections land in SecurityAlert is from the practice question. The agent install, data collection rule and Azure Arc steps are not modelled.' },
  scenarios: [],
  withholdNotes: ['cef-tables'],
  answers: [{ id: 'table', label: 'Which table received the Microsoft Entra ID Protection detections?', placeholder: 'TableName' }],
  brief:
    'Two data sources are missing from Sentinel. First, your on-premises network has several devices that send logs in Common Event Format (CEF). ' +
    'Get those logs into the workspace so analysts can query them. Think about what has to exist before the connector can collect anything: ' +
    'the devices cannot run an agent themselves. Second, you just connected Microsoft Entra ID Protection and need to verify that data is arriving. ' +
    'Find the table it wrote to, by looking at the data (its newest detection is called Leaked credentials), and report its name.',

  setup() { return []; },

  objectives: [
    { id: 'forwarder', text: 'Set up the machine that the CEF devices will send their logs to.', check: (w) => linux(w) },
    {
      id: 'cef', text: 'CEF logs from the devices are queryable in Advanced hunting.',
      check: (w) => linux(w) && cefReady(w) && queried(w, 'CommonSecurityLog'),
    },
    { id: 'protect', text: 'Microsoft Entra ID Protection is connected.', check: (w) => connected(w, 'entra-protect') },
    { id: 'table', text: 'Report the table that received the Entra ID Protection detections.', check: (w) => connected(w, 'entra-protect') && foundEquals(w, 'table', 'SecurityAlert') },
  ],

  steps: [
    { text: 'Open Data connectors.', target: 'nav:sentinel/connectors', done: (w) => visited(w, 'sentinel/connectors') },
    { text: 'Deploy the machine that will collect the CEF messages.', target: 'btn:deploy-forwarder', done: (w) => linux(w) },
    { text: 'Connect the CEF connector.', target: 'btn:open-connector:cef', done: (w) => cefReady(w) },
    { text: 'Connect Microsoft Entra ID Protection.', target: 'btn:open-connector:entra-protect', done: (w) => connected(w, 'entra-protect') },
    { text: 'Query to find where its data went, then report the table.', target: 'btn:submit-answer', done: (w) => w.findings.some((f) => f.objectiveId === 'table') },
  ],

  hints: {
    forwarder: [
      'The network devices cannot run the Azure Monitor Agent. Something else has to receive their messages and pass them on.',
      'A machine that runs a syslog daemon (rsyslog or syslog-ng). Which operating system do those run on?',
      'Deploy a Linux machine as the log forwarder. A Windows machine is refused.',
    ],
    cef: [
      'Connect the connector that is named for the format the devices use, and that is collected by the Azure Monitor Agent.',
      'Common Event Format (CEF) via AMA. It refuses to connect until the forwarder exists. Then query its table in Advanced hunting.',
      'Query CommonSecurityLog after connecting.',
    ],
    protect: [
      'Open the connector gallery and look for the identity risk product.',
      'Its name contains "ID Protection".',
      'Open the Microsoft Entra ID Protection connector page and connect it.',
    ],
    table: [
      'Detections from this product are alerts. Where do alerts land in the workspace?',
      'Do not guess from the connector name. Look at recent rows in the alert table, and filter on the provider or the alert name.',
      'SecurityAlert. Run: SecurityAlert | where AlertName == "Leaked credentials" and then report the table name.',
    ],
  },

  debrief: [
    'Network devices that send CEF or Syslog messages cannot run the Azure Monitor Agent, so a designated Linux machine acts as a log forwarder: the devices send to its syslog daemon (rsyslog or syslog-ng), and the agent on it forwards the messages to Sentinel. So the first thing to do is deploy a Linux machine. Adding the Security Events via AMA connector is for Windows event logs from machines, which is a different thing.',
    'The Common Event Format (CEF) via AMA connector writes to the CommonSecurityLog table. In a real setup you then create a data collection rule, install the agent on the forwarder, run the installation script, and point the devices at the forwarder. The sandbox models only the precondition and the result.',
    'The Microsoft Entra ID Protection connector does not create a table of its own. Its detections are stored in SecurityAlert. When a question asks which table to query to verify a connector, the connector name is not a reliable guide: look at the data.',
  ],

  solution: () => [
    ['sentinel.connectConnector', { id: 'cef' }, { fails: /Linux log forwarder/ }],
    ['sentinel.deployForwarder', { name: 'win-forwarder', os: 'Windows' }, { fails: /Linux machine/ }],
    ['sentinel.deployForwarder', { name: 'cef-forwarder-01', os: 'Linux' }],
    ['sentinel.connectConnector', { id: 'cef' }],
    ['query.run', { surface: 'sentinel', text: 'CommonSecurityLog | take 10' }],
    ['sentinel.connectConnector', { id: 'entra-protect' }],
    ['query.run', { surface: 'sentinel', text: 'SecurityAlert | where AlertName == "Leaked credentials"' }],
    ['findings.report', { objectiveId: 'table', value: 'SecurityAlert' }],
  ],
};
