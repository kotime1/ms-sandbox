import { UNKNOWN_HASH } from '../attacks/scenarios-extra.js';
import { visited, foundEquals } from './helpers.js';

const dev = (w) => w.defender.devices.find((d) => d.name === 'WS-23');
const pkg = (w) => w.defender.packages.find((p) => p.deviceName === 'WS-23');
const file = (w) => w.defender.files.find((f) => f.sha256 === UNKNOWN_HASH);
const flagged = (w) => (w.defender.timelines['dev-0201'] ?? []).filter((e) => e.flagged);
const goodIoc = (w) => w.defender.indicators.some((i) => i.type === 'file' && i.value === UNKNOWN_HASH);

export default {
  id: 'triage-ws23',
  title: 'Triage WS-23',
  level: 'Intermediate',
  minutes: 20,
  topics: ['Defender for Endpoint', 'Device timeline', 'Investigation package', 'Deep analysis', 'Response actions'],
  examObjective: '2.2 Respond to alerts and incidents in Microsoft Defender for Endpoint',
  sourceQuestions: { set1: [30, 31, 32, 33, 34, 35, 43], set2: [28, 29, 30, 31, 32, 41, 42] },
  scenarios: ['device-investigation'],
  withholdNotes: ['device-investigation'],
  brief:
    'Defender blocked a malware download on WS-23 and then raised a suspicious PowerShell alert. Triage the device the way you would on the job: ' +
    '(1) review what happened and build a clean timeline by flagging the key events, (2) collect forensic data without disrupting the user, ' +
    '(3) analyse the unfamiliar file update.ps1 in the sandbox and make sure the result helps future detections. ' +
    'Do not isolate the device: the user is a finance director in the middle of a close, and nothing so far proves the machine is compromised.',

  setup() { return ['device-investigation']; },

  objectives: [
    // Exactly the two key events: flagging everything (or an irrelevant event) is not a "clean" breach timeline.
    { id: 'timeline', text: 'Flag only the key events (the suspicious PowerShell launch and its outbound connection) on the WS-23 timeline.', check: (w) => flagged(w).length === 2 && ['t04', 't05'].every((id) => flagged(w).some((e) => e.id === id)) },
    { id: 'package', text: 'Collect an investigation package from WS-23.', check: (w) => Boolean(pkg(w)) },
    { id: 'analysis', text: 'Submit update.ps1 for deep analysis.', check: (w) => Boolean(file(w)?.deepAnalysis) },
    { id: 'indicator', text: 'Add update.ps1 as a file indicator so the result supports future detections (give it a target).', check: (w) => goodIoc(w) && w.defender.indicators.find((i) => i.value === UNKNOWN_HASH).targets.length > 0 },
    { id: 'noisolate', text: 'WS-23 is still connected to the network (you did not over-react).', check: (w) => dev(w)?.isolated === false && Boolean(pkg(w)) },
    {
      id: 'scope', optional: true,
      text: 'Bonus: the incident may affect more than one device. Use Advanced hunting on DeviceEvents to find which devices report remote activity, then report how many (the Android phone is onboarded too).',
      check: (w) => w.queries.some((q) => q.surface === 'defender' && q.tables.includes('DeviceEvents') && q.records.length > 0) && foundEquals(w, 'scope', 4),
    },
  ],
  answers: [{ id: 'scope', label: 'Bonus: how many distinct devices report remote activity in DeviceEvents?', placeholder: 'a number' }],

  steps: [
    { text: 'Open the Devices page and open WS-23.', target: 'nav:defender/devices', done: (w) => visited(w, 'defender/devices') },
    { text: 'On the Timeline tab, flag the PowerShell events.', target: 'btn:open-timeline:dev-0201', done: (w) => flagged(w).length > 0 },
    { text: 'Collect an investigation package.', target: 'btn:collect-package:dev-0201', done: (w) => Boolean(pkg(w)) },
    { text: 'Open Rules & lists and open the file update.ps1.', target: 'btn:open-file:update.ps1', done: (w) => Boolean(file(w)?.deepAnalysis) },
    { text: 'Submit it for deep analysis.', target: 'btn:deep-analysis', done: (w) => Boolean(file(w)?.deepAnalysis) },
    { text: 'Add it as an indicator.', target: 'btn:add-indicator', done: goodIoc },
  ],

  hints: {
    timeline: [
      'The device page keeps an ordered record of what happened on it.',
      'Individual events can be marked, then the view filtered to just those.',
      'Timeline tab > flag the powershell.exe launch and its network connection > show only flagged events.',
    ],
    package: [
      'You want a snapshot of the machine\'s state, without sitting down at it.',
      'It is a device action, and it downloads as a single archive.',
      'Device page > Collect investigation package.',
    ],
    analysis: [
      'You are looking at a file nobody has seen before.',
      'The file page has an action that detonates it in Microsoft\'s sandbox.',
      'File page > Submit for deep analysis.',
    ],
    indicator: [
      'How does a one-off finding become a standing detection?',
      'Indicators work from the file hash, but only once they have a target.',
      'File page > Add indicator (File) > action: Alert and block > target: All devices.',
    ],
    scope: [
      'Which table records device activity such as remote connections, and which platforms feed it?',
      'Query DeviceEvents for ActionType values containing "Remote", then count distinct devices. An onboarded device is not necessarily a reporting one.',
      'DeviceEvents | where ActionType contains "Remote" | summarize Devices=dcount(DeviceName). The Android phone adds nothing to DeviceEvents.',
    ],
    noisolate: [
      'Containment is not free.',
      'Isolation cuts the device off from the network and disrupts its user.',
      'Collect evidence first. Isolate only when you have a reason to.',
    ],
  },

  debrief: [
    'The device Timeline is the least-effort way to see recent activity on one device. You can pick a custom time range, flag key events, show only flagged events and look back before a chosen event to build a clean breach timeline.',
    'Collecting an investigation package gathers forensic artifacts (processes, network connections, autoruns, scheduled tasks and more) into one download with little impact on the user. Isolating first would disrupt the user without adding evidence; an antivirus scan detects but does not collect forensics.',
    'Live response is the answer when you need to interactively inspect or run commands on the device. Advanced hunting answers fleet-wide scoping questions with KQL.',
    'For an unfamiliar file: submit it for deep analysis (sandbox behaviour) and add it as an indicator so the verdict feeds future detections.',
  ],

  solution: () => [
    ['defender.flagTimelineEvent', { deviceId: 'dev-0201', eventId: 't04', flagged: true }],
    ['defender.flagTimelineEvent', { deviceId: 'dev-0201', eventId: 't05', flagged: true }],
    ['defender.collectPackage', { deviceId: 'dev-0201' }],
    ['defender.submitDeepAnalysis', { sha256: UNKNOWN_HASH }],
    ['defender.createIndicator', { type: 'file', value: UNKNOWN_HASH, action: 'block', targets: ['grp-all'] }],
    ['query.run', { surface: 'defender', text: 'DeviceEvents | where ActionType contains "Remote" | summarize Devices=dcount(DeviceName)' }],
    ['findings.report', { objectiveId: 'scope', value: '4' }],
  ],
};
