import { visited } from './helpers.js';

const isolated = (w) => w.defender.devices.filter((d) => d.isolated).map((d) => d.name);
const detection = (w) => w.defender.detections.find((d) => d.actions.includes('isolateDevice'));

export default {
  id: 'detect-and-isolate',
  title: 'Hunt it, then make it automatic',
  level: 'Intermediate',
  minutes: 20,
  topics: ['Advanced hunting', 'Custom detection rules', 'Response actions', 'KQL'],
  examObjective: '3.1 Detect threats by using Microsoft Defender XDR',
  sourceQuestions: [16, 40, 41, 42],
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
      'A custom detection rule needs specific columns in its output. Which ones does the portal insist on?',
      'Timestamp and ReportId, plus a column that identifies the device. After summarize those vanish unless you keep them.',
      'DeviceLogonEvents | where ActionType == "LogonFailed" | summarize LogonFailures=count(), arg_max(Timestamp, *) by DeviceId | where LogonFailures > 3. Then Create detection rule, tick Isolate device.',
    ],
    isolated: [
      'Look at the baseline: other devices have a couple of failed logons too.',
      'A threshold in the query decides who is isolated.',
      'Keep `where LogonFailures > 3` after the summarize so only Device2 matches. Delete the wrong rule and un-isolate devices if needed.',
    ],
  },

  debrief: [
    'Custom detections must return Timestamp, ReportId and at least one entity column such as DeviceId. After summarize, arg_max(Timestamp, *) is the standard way to keep them.',
    'Response actions in a detection rule act on the entities the query returns: isolate needs DeviceId. A sloppy query means sloppy containment.',
    'Start from Advanced hunting and create the rule from the tested query, rather than building it from scratch in the rules page.',
    'Tune with thresholds and exclusions (for example `| where DeviceName != "Device3"`) before enabling automatic actions.',
  ],

  solution: () => [
    ['query.run', { surface: 'defender', text: 'DeviceLogonEvents | where ActionType == "LogonFailed" | summarize LogonFailures=count() by DeviceName' }],
    ['defender.createDetection', {
      name: 'Brute force isolate', alertTitle: 'Brute force against device', severity: 'High', isolateDevice: true,
      query: 'DeviceLogonEvents | where ActionType == "LogonFailed" | summarize LogonFailures=count(), arg_max(Timestamp, *) by DeviceId | where LogonFailures > 3',
    }],
  ],
};
