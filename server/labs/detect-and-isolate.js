import { visited } from './helpers.js';

const isolated = (w) => w.defender.devices.filter((d) => d.isolated).map((d) => d.name);
const detection = (w) => w.defender.detections.find((d) => d.actions.some((a) => a.type === 'isolateDevice'));

export default {
  id: 'detect-and-isolate',
  title: 'Hunt it, then make it automatic',
  level: 'Intermediate',
  minutes: 20,
  topics: ['Advanced hunting', 'Custom detection rules', 'Response actions', 'KQL'],
  examObjective: '3.1 Detect threats by using Microsoft Defender XDR',
  sourceQuestions: { set1: [16, 40, 41, 42], set2: [17, 40] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: "docs", note: "The six-step wizard, frequencies and lookback, device/file/user/email actions with their required columns, the 150-alert cap and NRT eligibility follow Microsoft Learn (custom-detection-rules, 2026-09-02). The practice questions say a query MUST return Timestamp and ReportId; current Learn says it is recommended. Not simulated: Sentinel custom frequency, SaaS governance actions, scheduled execution." },
  scenarios: ['bruteforce-device'],
  withholdNotes: ['custom-detection'], // describes the required columns and the arg_max pattern
  brief:
    'Someone is guessing passwords against one of your devices. Use Advanced hunting to find which device is under attack, then turn your query into a custom detection rule that fully isolates affected devices automatically. ' +
    'Be precise: only the attacked device should be isolated, not every device that has had a typo.',

  setup() { return ['bruteforce-device']; },

  objectives: [
    {
      id: 'hunt', text: 'Run a hunting query that counts failed logons per device in DeviceLogonEvents.',
      check: (w) => w.queries.some((q) => q.surface === 'defender' && q.tables.includes('DeviceLogonEvents') && q.ops.includes('summarize')),
    },
    { id: 'detection', text: 'Create a custom detection rule from a query with an automatic "Isolate device" action.', check: (w) => Boolean(detection(w)) },
    { id: 'isolated', text: 'Only the attacked device (Device2) ends up isolated.', check: (w) => { const i = isolated(w); return i.length === 1 && i[0] === 'Device2'; } },
  ],

  steps: [
    { text: 'Open Advanced hunting.', target: 'nav:defender/hunting', done: (w) => visited(w, 'defender/hunting') },
    { text: 'Write and run a query that counts LogonFailed events by device.', target: 'btn:run-query', done: (w) => w.queries.some((q) => q.surface === 'defender' && q.ops.includes('summarize')) },
    { text: 'Create a detection rule from the query, with the isolate action.', target: 'btn:create-detection', done: (w) => Boolean(detection(w)) },
    { text: 'Check the Devices page to confirm only Device2 is isolated.', target: 'nav:defender/devices', done: (w) => { const i = isolated(w); return i.length === 1 && i[0] === 'Device2'; } },
  ],

  hints: {
    hunt: [
      'Which table records logons, and which operator turns many rows into a count per device?',
      'DeviceLogonEvents has an ActionType column. Filter it, then summarize.',
      'DeviceLogonEvents | where ActionType == "LogonFailed" | summarize LogonFailures=count() by DeviceName',
    ],
    detection: [
      'What does the rule need in its query output to know WHICH device to isolate, and to find the original event?',
      'Timestamp, ReportId and a device identifier such as DeviceId. After summarize those vanish unless you keep them. The isolate action cannot run at all without DeviceId.',
      'DeviceLogonEvents | where ActionType == "LogonFailed" | summarize LogonFailures=count(), arg_max(Timestamp, *) by DeviceId | where LogonFailures > 3. Then Create detection rule, tick Isolate device.',
    ],
    isolated: [
      'Look at the baseline: other devices have a couple of failed logons too.',
      'A threshold in the query decides who is isolated.',
      'Keep `where LogonFailures > 3` after the summarize so only Device2 matches. Delete the wrong rule and un-isolate devices if needed.',
    ],
  },

  debrief: [
    'A custom detection query should return Timestamp and ReportId, plus a column that identifies the impacted asset (DeviceId, AccountUpn, RecipientEmailAddress...). The practice questions say "must" and the exam may too; current Microsoft Learn says "recommend", because without them alerts lose the right device-group scope and process tree. After summarize, arg_max(Timestamp, *) is the standard way to keep them.',
    'Response actions act on the entities the query returns, and each needs its column: Isolate device needs DeviceId, file actions need a hash, user actions need an account SID or object id, email actions need NetworkMessageId and RecipientEmailAddress. The wizard greys out an action and tells you which column is missing. A sloppy query means sloppy containment.',
    'Start from Advanced hunting and use Create detection rule so the tested query is carried into the wizard, or use Custom detection rules > + Create detection rule and paste a query. Frequency matters: every 24 hours looks back 30 days, 12 hours 48 hours, 3 hours 12 hours, hourly 4 hours, and Continuous (NRT) only works for a single supported table with no join or union.',
    'Tune with thresholds and exclusions (for example `| where DeviceName != "Device3"`) before enabling automatic actions. A rule raises at most 150 alerts per run, and duplicate events with the same entities collapse into one alert.',
  ],

  solution: () => [
    ['query.run', { surface: 'defender', text: 'DeviceLogonEvents | where ActionType == "LogonFailed" | summarize LogonFailures=count() by DeviceName' }],
    ['defender.createDetection', {
      name: 'Brute force isolate', alertTitle: 'Brute force against device', severity: 'High', isolateDevice: true,
      query: 'DeviceLogonEvents | where ActionType == "LogonFailed" | summarize LogonFailures=count(), arg_max(Timestamp, *) by DeviceId | where LogonFailures > 3',
    }],
  ],
};
