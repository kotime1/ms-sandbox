const STARTED_IN_WINDOW = ['dev-0401', 'dev-0402'];
const NAMES = { 'dev-0401': 'MAC-FIN01', 'dev-0402': 'MAC-DEV02', 'dev-0403': 'MAC-HR03', 'dev-0404': 'MAC-DES04', 'dev-0405': 'MAC-OPS05' };

// Which devices a query result names, whether it returned DeviceId or DeviceName.
const idsOf = (q) => [...new Set(q.records.map((r) => r.DeviceId ?? Object.keys(NAMES).find((k) => NAMES[k] === r.DeviceName)).filter(Boolean))].sort();

export default {
  id: 'troubleshooting-mode',
  title: 'Who turned troubleshooting mode on?',
  level: 'Intermediate',
  minutes: 15,
  topics: ['Advanced hunting', 'DeviceEvents', 'parse_json', 'Tamper protection'],
  examObjective: '3.1 Detect threats by using Microsoft Defender XDR',
  sourceQuestions: { set1: [], set2: [], set3: [46], set4: [44], set5: [], set6: [] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'partial', note: 'The ActionType and the TroubleshootingStateChangeReason field come from the practice question. The wording of the reason text and the other fields in AdditionalFields are invented for the exercise.' },
  scenarios: ['macos-troubleshooting'],
  withholdNotes: ['troubleshooting-mode'],
  answers: [{ id: 'latest', label: 'Which device started troubleshooting mode most recently? (device name)', placeholder: 'MAC-...' }],
  brief:
    'Tamper protection is on and your macOS fleet is onboarded to Defender for Endpoint. You suspect an attacker is switching on troubleshooting mode so they can change policy-locked settings. ' +
    'In Advanced hunting, list the devices that STARTED troubleshooting mode in the last three hours, one row per device with the time and report id of its latest event. ' +
    'Troubleshooting mode state changes are recorded in the DeviceEvents table, with the details in a JSON column. ' +
    'Then say which device did it most recently.',

  setup() { return ['macos-troubleshooting']; },

  objectives: [
    {
      id: 'query', text: 'Run a query that returns exactly the devices that started troubleshooting mode in the last three hours, one row per device, with Timestamp and ReportId.',
      check: (w) => w.queries.some((q) => q.tables.includes('DeviceEvents') && q.records.length === STARTED_IN_WINDOW.length
        && JSON.stringify(idsOf(q)) === JSON.stringify(STARTED_IN_WINDOW) && q.columns.includes('Timestamp') && q.columns.includes('ReportId')),
    },
    {
      id: 'latest', text: 'Report the device that started troubleshooting mode most recently.',
      check: (w) => (w.findings.find((f) => f.objectiveId === 'latest')?.value ?? '').trim().toLowerCase() === 'mac-fin01',
    },
  ],

  steps: [
    { text: 'Open Advanced hunting.', target: 'nav:defender/hunting', done: (w) => w.log.some((e) => e.ok && e.action === 'ui.visit' && e.params?.page === 'defender/hunting') },
    { text: 'Query DeviceEvents for the troubleshooting-mode events and run it.', target: 'btn:run-query', done: (w) => w.queries.some((q) => q.tables.includes('DeviceEvents')) },
    { text: 'Report the most recent device.', target: 'btn:submit-answer', done: (w) => w.findings.some((f) => f.objectiveId === 'latest') },
  ],

  hints: {
    query: [
      'Start from the table that records device-level events. Look at its columns: one holds extra detail as JSON.',
      'The events you want have an ActionType about troubleshooting mode. Then read the reason out of the JSON column with parse_json(), and keep only the ones that say started. Filter on time before you aggregate.',
      'DeviceEvents | where Timestamp > ago(3h) | where ActionType == "AntivirusTroubleshootModeEvent" | extend p = parse_json(AdditionalFields) | where p.TroubleshootingStateChangeReason contains "started" | summarize (Timestamp, ReportId)=arg_max(Timestamp, ReportId), count() by DeviceId',
    ],
    latest: [
      'Sort your result by time.',
      'Order by Timestamp descending and read the first row. DeviceName is not in your summary: add it to the by clause, or look the id up on the Devices page.',
      'Add DeviceName to the "by" list, then | order by Timestamp desc. The top row is the answer.',
    ],
  },

  debrief: [
    'The exam gives you the shape of the query and asks for the one missing filter. ActionType == "AntivirusTroubleshootModeEvent" selects the troubleshooting-mode events on macOS. Nothing in that table is called EventType.',
    'The details of the event are in AdditionalFields, a dynamic (JSON) column. parse_json() turns it into something you can index with a dot: p.TroubleshootingStateChangeReason. Without that step you cannot tell a start from an end.',
    'Each trap in the data is a way to get the wrong answer: a device that started five hours ago (no time filter), a device that only ended troubleshooting mode (no reason filter), and the same device twice (no summarize).',
    '(Timestamp, ReportId)=arg_max(Timestamp, ReportId) keeps the latest row per device. Returning Timestamp and ReportId matters again when this query becomes a custom detection.',
  ],

  solution: () => [
    ['query.run', { surface: 'defender', text: 'DeviceEvents | where Timestamp > ago(3h) | where ActionType == "AntivirusTroubleshootModeEvent" | extend p = parse_json(AdditionalFields) | where p.TroubleshootingStateChangeReason contains "started" | summarize (Timestamp, ReportId)=arg_max(Timestamp, ReportId), count() by DeviceId | order by Timestamp desc' }],
    ['findings.report', { objectiveId: 'latest', value: 'MAC-FIN01' }],
  ],
};
