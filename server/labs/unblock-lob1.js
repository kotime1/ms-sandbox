import { LOB_HASH, MALWARE_HASH } from '../attacks/scenarios-extra.js';
import { visited } from './helpers.js';

const lob = (w) => w.defender.files.find((f) => f.sha256 === LOB_HASH);
const mal = (w) => w.defender.files.find((f) => f.sha256 === MALWARE_HASH);
const allowEntry = (w) => w.defender.allowBlock.find((e) => e.kind === 'file' && e.value === LOB_HASH && e.action === 'allow');
const goodIoc = (w) => w.defender.indicators.find((i) => i.type === 'file' && i.value === LOB_HASH && i.action === 'allow' && i.targets.length > 0);

export default {
  id: 'unblock-lob1',
  title: 'Unblock LOB1, keep blocking malware',
  level: 'Beginner',
  minutes: 12,
  topics: ['Defender XDR', 'Tenant Allow/Block List', 'Indicators', 'Automated remediation'],
  examObjective: '2.1 Respond to alerts and incidents in Microsoft Defender XDR',
  sourceQuestions: { set1: [4], set2: [1, 5] },
  scenarios: ['lob-file-blocked'],
  withholdNotes: ['allow-block'],
  brief:
    'Automated remediation blocked a file that your line-of-business application LOB1 needs (lob1-sync.exe). LOB1 is down. ' +
    'Get the file unblocked immediately and make sure Defender does not block it again, without letting other malicious files through automatically. ' +
    'Only one of the two blocked files in the file list is safe: check before you act. ' +
    'As a stretch goal, create a file indicator for it and notice what makes an indicator actually become active.',

  setup() { return ['lob-file-blocked']; },

  objectives: [
    { id: 'allow', text: 'The LOB1 file is on the Tenant Allow/Block List as an Allow entry, and is no longer blocked.', check: (w) => Boolean(allowEntry(w)) && lob(w)?.blocked === false },
    // A guard objective must not pass by doing nothing, so it only counts once the LOB1 fix is in.
    { id: 'scope', text: 'The malicious file is still blocked (nothing was released that should not have been).', check: (w) => Boolean(allowEntry(w)) && mal(w)?.blocked === true && !w.defender.allowBlock.some((e) => e.value === MALWARE_HASH && e.action === 'allow') },
    { id: 'ioc', optional: true, text: 'Bonus: create a file indicator (Allow) for LOB1 and give it a valid target so it becomes Active.', check: (w) => Boolean(goodIoc(w)) },
  ],

  steps: [
    { text: 'Open Incidents & alerts in the Defender portal.', target: 'nav:defender/alerts', done: (w) => visited(w, 'defender/alerts') },
    { text: 'Open the Tenant Allow/Block List (under Rules).', target: 'nav:defender/rules', done: (w) => visited(w, 'defender/rules') },
    { text: 'Add an Allow entry for the LOB1 file hash.', target: 'btn:add-allowblock', done: (w) => Boolean(allowEntry(w)) },
  ],

  hints: {
    allow: [
      'You need an exception that is narrower than "turn blocking off", and that overrides remediation.',
      'The Tenant Allow/Block List lets you allow one specific item. Which identifier is stable for a file?',
      'Rules > Tenant Allow/Block List > Add > Files > the LOB1 SHA-256 hash > Allow. It takes effect immediately.',
    ],
    scope: [
      'Be precise about which file you released.',
      'Check the SHA-256 on each blocked file before adding an entry.',
      'Allow only the hash for lob1-sync.exe. Leave invoice_viewer.exe blocked.',
    ],
    ioc: [
      'Indicators have an action, but something else decides whether they apply anywhere.',
      'There is no on/off switch for an indicator. Look at its scope.',
      'Create the indicator (File, Allow), then edit it and select a device group as its target. Without a target it stays Inactive.',
    ],
  },

  debrief: [
    'The Tenant Allow/Block List is the supported way to allow a specific item (file hash, URL, sender) that was wrongly blocked. An Allow entry takes effect immediately and keeps the item from being blocked again, while everything else is still remediated automatically.',
    'Custom indicators are for proactive detection and blocking. They are not the tool for exception management, and a custom indicator stays Inactive until it has a valid target.',
    'There is no "custom quarantine policy" for this, and critical-asset tagging protects sensitive devices and accounts rather than releasing files.',
    'Before releasing anything, verify it. Deep analysis and the file page tell you whether it is the file you think it is.',
  ],

  solution: () => [
    ['defender.addAllowBlock', { kind: 'file', value: LOB_HASH, action: 'allow' }],
    ['defender.createIndicator', { type: 'file', value: LOB_HASH, action: 'allow', targets: ['grp-all'] }],
  ],
};
