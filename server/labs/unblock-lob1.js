import { LOB_HASH, MALWARE_HASH } from '../attacks/scenarios-extra.js';
import { visited } from './helpers.js';

const file = (w, sha) => w.defender.files.find((f) => f.sha256 === sha);
const allowFor = (w) => w.defender.indicators.filter((i) => i.type === 'file' && i.value === LOB_HASH && i.action === 'allow' && i.targets.length > 0);
// "Released where it is needed": LOB1 runs on the workstations, so the file must be allowed there.
const releasedOnWorkstations = (w) => ['dev-0001', 'dev-0002', 'dev-0003'].every((id) => file(w, LOB_HASH)?.perDevice?.[id] === 'Allow');
const allowedEverywhere = (w) => allowFor(w).some((i) => i.targets.includes('grp-all'));
const malwareStillBlocked = (w) => Object.values(file(w, MALWARE_HASH)?.perDevice ?? {}).every((s) => s === 'Blocked by remediation' || s === 'Block');

export default {
  id: 'unblock-lob1',
  title: 'Unblock LOB1, keep blocking malware',
  level: 'Beginner',
  minutes: 12,
  topics: ['Defender for Endpoint', 'File indicators', 'Automated remediation', 'Device groups'],
  examObjective: '2.1 Respond to alerts and incidents in Microsoft Defender XDR',
  // The practice questions name the "Tenant Allow/Block List". In the product that list filters email; for a file blocked on
  // endpoints the mechanism is a file indicator with the Allow action. The debrief explains the difference.
  sourceQuestions: { set1: [4], set2: [1, 5] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: "docs", note: "Follows the product: a file indicator with the Allow action, scoped to device groups. The exam wording says \"Tenant Allow/Block List\", which the docs describe as an email feature." },
  scenarios: ['lob-file-blocked'],
  withholdNotes: ['allow-block'],
  brief:
    'Automated remediation blocked a file that your line-of-business application LOB1 needs (lob1-sync.exe). LOB1 runs on the workstations and is down. ' +
    'Get the file working again and make sure Defender does not block it again, without letting other malicious files through. ' +
    'Check the two blocked files before you act: only one is safe. Use the tool Microsoft provides for endpoints, not the first list you find.',

  setup() { return ['lob-file-blocked']; },

  objectives: [
    { id: 'allow', text: 'LOB1 works again: the file is allowed on the workstations where it runs.', check: releasedOnWorkstations },
    // A guard objective must not pass by doing nothing, so it only counts once the LOB1 fix is in.
    { id: 'scope', text: 'The malicious file is still blocked everywhere (nothing was released that should not have been).', check: (w) => releasedOnWorkstations(w) && malwareStillBlocked(w) },
    { id: 'narrow', text: 'The exception is no wider than it needs to be (not applied to every device in the tenant).', check: (w) => releasedOnWorkstations(w) && !allowedEverywhere(w) },
  ],

  steps: [
    { text: 'Open Incidents & alerts, then the file lists under Settings.', target: 'nav:defender/alerts', done: (w) => visited(w, 'defender/alerts') },
    { text: 'Open Settings > Endpoints > Indicators (Rules & lists in the sandbox).', target: 'nav:defender/rules', done: (w) => visited(w, 'defender/rules') },
    { text: 'Add a file hash indicator for the LOB1 file with the Allow action.', target: 'btn:add-indicator', done: (w) => allowFor(w).length > 0 },
  ],

  hints: {
    allow: [
      'Where is the exception made for a file that Defender for Endpoint blocked on devices?',
      'Not every "allow/block" list is for endpoints. Settings > Endpoints > Indicators is. Which identifier is stable for a file?',
      'Add a file hash indicator: the SHA-256 of lob1-sync.exe, action Allow, scope = the device group that runs LOB1 (Workstations).',
    ],
    scope: [
      'Be precise about which file you released.',
      'Check the SHA-256 on each blocked file before adding an indicator.',
      'Create an indicator only for lob1-sync.exe. Leave invoice_viewer.exe alone.',
    ],
    narrow: [
      'An indicator has a scope. What is the smallest scope that fixes the outage?',
      'LOB1 runs on workstations, not on servers or everything.',
      'Scope the Allow indicator to the Workstations device group instead of All devices.',
    ],
  },

  debrief: [
    'For a file that Microsoft Defender for Endpoint (or automated remediation) blocked on devices, you make the exception with a file indicator whose action is Allow: Settings > Endpoints > Indicators > File hashes > Add item, with an Indicator (the hash), an Action and a Scope (device groups). Per the docs an Allow indicator takes precedence over Microsoft Defender Antivirus blocking.',
    'The Tenant Allow/Block List is a different feature: a Defender for Office 365 / Exchange Online Protection list that filters email. Its file entries apply to email attachments, and you cannot even create a file Allow entry there directly (allows come from the Submissions page). The practice questions use the phrase "Tenant Allow/Block List" for this scenario; know the exam wording, and know that the endpoint mechanism is the file indicator.',
    'Scope matters: an indicator scoped to a device group wins over one scoped to all devices, and a narrower exception is a smaller risk. Block indicators only enforce when the "Allow or block file" advanced feature is on.',
    'Precedence to remember: a certificate Block indicator overrides a file Allow indicator, and a more secure hash (SHA-256) wins over SHA-1 over MD5 when indicators conflict.',
  ],

  solution: () => [
    ['defender.createIndicator', { type: 'file', value: LOB_HASH, action: 'allow', targets: ['grp-workstations'] }],
  ],
};
