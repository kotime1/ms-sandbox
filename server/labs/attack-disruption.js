import { visited } from './helpers.js';
import { assess } from '../sim/disruption.js';

const can = (w) => assess(w.disruption).can;
const devices = (w) => can(w).includes('Isolate device');
const accounts = (w) => can(w).includes('Disable user');

export default {
  id: 'attack-disruption',
  title: 'Contain the device and disable the account, automatically',
  level: 'Intermediate',
  minutes: 12,
  topics: ['Automatic attack disruption', 'Defender for Identity', 'Device groups', 'Prerequisites'],
  examObjective: '2.1 Respond to alerts and incidents in Microsoft Defender XDR',
  sourceQuestions: { set1: [1], set2: [2], set3: [], set4: [], set5: [4], set6: [3] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'partial', note: 'The actions per product, the prerequisites (products deployed, Standard discovery, device group automation level, Defender for Identity sensor on the domain controller, valid action account, auditing) and how disable user works for Active Directory accounts are from Microsoft Learn (automatic-attack-disruption and configure-attack-disruption), checked 2026-11-04. The practice questions call the setting "Advanced features in Microsoft Defender for Identity"; the pages I could read do not show a toggle by that name, so that wording is the exam\'s, not the docs\'.' },
  scenarios: [],
  withholdNotes: ['attack-disruption'],
  brief:
    'Your tenant is hybrid: on-premises Active Directory plus Microsoft Entra ID, with Windows 11 devices onboarded to Defender for Endpoint and Defender for Identity sensors on the domain controllers. ' +
    'The requirement: during an active attack, affected devices must be contained automatically AND compromised user accounts must be disabled, with as little disruption to users as possible. ' +
    'The status panel on the Automatic attack disruption page shows what the tenant can do automatically today, and why anything is missing. Fix only what stops those two outcomes. ' +
    'Do not weaken the other protections to get there.',

  setup(w) {
    // Devices are already covered; identity containment is the gap. A device group is also set to opt out of containment (a trap).
    w.disruption = {
      deployed: { mde: true, mdi: true, entra: true, mda: false },
      discovery: 'Basic', // gap 1: Contain device and Contain IP need Standard discovery (Isolate device does not)
      groups: [{ name: 'Workstations', level: 'Full - remediate threats automatically' }, { name: 'Servers', level: 'Full - remediate threats automatically' }],
      mdiSensorOnDc: true, mdiAuditing: true, actionAccountOk: false, mdaOfficeConnector: false,
    };
    return [];
  },

  objectives: [
    { id: 'devices', text: 'Affected devices are contained automatically (both Contain device and Isolate device can run).', check: (w) => can(w).includes('Contain device') && devices(w) },
    {
      id: 'accounts', text: 'Compromised on-premises accounts are disabled automatically.',
      check: (w) => accounts(w) && can(w).includes('Contain device') && devices(w),
    },
    {
      // Least privilege / restraint: the fix must not switch protections off. Device groups must still allow automated response.
      id: 'restraint', text: 'No device group has been opted out of automated response to make this work.',
      check: (w) => accounts(w) && can(w).includes('Contain device') && w.disruption.groups.every((g) => g.level !== 'No automated response'),
    },
  ],

  steps: [
    { text: 'Open the Automatic attack disruption settings.', target: 'nav:defender/disruption', done: (w) => visited(w, 'defender/disruption') },
    { text: 'Read why disabling accounts is not available, and fix it.', target: 'btn:fix:actionAccount', done: (w) => accounts(w) },
  ],

  hints: {
    devices: [
      'The status panel lists what can run automatically. Is containing devices fully on that list, or only part of it?',
      'Isolate device is available but Contain device is not. That depends on a Defender for Endpoint setting, not on the device groups.',
      'Set device discovery to Standard discovery. Contain device and Contain IP need it.',
    ],
    accounts: [
      'Device isolation only affects devices. Which product disables a compromised Active Directory user, and where does it run?',
      'Defender for Identity disables the account from the sensor on a domain controller. Read the reason the panel gives for Disable user.',
      'The sensor\'s action account is not valid. Use the sensor\'s local system account (or an account with the required permissions) for Defender for Identity actions.',
    ],
    restraint: [
      'There is a tempting shortcut that changes device groups.',
      'Opting a group out of automated response would stop containment for that group.',
      'Leave every device group on an automated level.',
    ],
  },

  debrief: [
    'Automatic attack disruption contains assets an attacker controls by acting at the incident level. What it can do depends on which Defender products are deployed: Defender for Endpoint contains or isolates devices, Defender for Identity disables on-premises accounts, Microsoft Entra ID revokes sessions or suspends users, and Defender for Cloud Apps handles compromised OAuth apps.',
    'Device isolation on its own only addresses devices. To disable a compromised Active Directory account, Defender for Identity must have its sensor on the domain controller, a valid action account (by default the sensor\'s local system account) and domain controller auditing. That, not device isolation, is what meets the "disable compromised accounts" half of the requirement.',
    'Device groups matter too: Standard discovery is needed for the automatic Contain device action, and a group set to No automated response is excluded from containment. Setting groups to a semi or full automation level keeps disruption working without manual approval for the containment actions.',
    'Where the exam says "Advanced features in Microsoft Defender for Identity", that is the exam\'s wording for turning the identity side on. The Learn pages I read describe the prerequisites above and do not show a toggle with that name, so treat the wording as exam knowledge and the prerequisites as the documented behaviour.',
  ],

  solution: () => [
    ['disruption.set', { setting: 'discovery', value: 'Standard' }],
    ['disruption.set', { setting: 'actionAccount', value: 'on' }],
  ],
};
