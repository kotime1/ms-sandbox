import { visited } from './helpers.js';

const pending = (w) => w.defender.devices.filter((d) => d.onboarding === 'Pending approval');

export default {
  id: 'approve-devices',
  title: 'The devices that never raise alerts',
  level: 'Beginner',
  minutes: 8,
  topics: ['Defender for Endpoint', 'Device onboarding', 'Configuration management'],
  examObjective: '2.2 Respond to alerts and incidents in Microsoft Defender for Endpoint',
  sourceQuestions: { set1: [], set2: [6] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: "exam", note: "The device approval flow comes from the practice question. No Microsoft Learn page confirming it was found." },
  scenarios: ['devices-pending-approval'],
  brief:
    'Three new Windows 11 laptops show up in the Defender portal, but they never produce alerts. The analyst who onboarded them says "they are in the list, so they must be working". ' +
    'Find out why they are silent and make all devices report alerts with as little effort as possible.',

  setup() { return ['devices-pending-approval']; },

  objectives: [
    { id: 'approve', text: 'All newly onboarded devices are approved and reporting.', check: (w) => w.defender.devices.some((d) => d.id === 'dev-0101') && pending(w).length === 0 },
    { id: 'effort', optional: true, text: 'Bonus: you did not need to isolate or re-onboard anything to fix it.', check: (w) => pending(w).length === 0 && !w.defender.devices.some((d) => d.isolated) },
  ],

  steps: [
    { text: 'Open the Devices page.', target: 'nav:defender/devices', done: (w) => visited(w, 'defender/devices') },
    { text: 'Look at the onboarding status column, then approve the pending devices.', target: 'btn:approve-all', done: (w) => pending(w).length === 0 },
  ],

  hints: {
    approve: [
      'Being visible in the list is not the same as being active.',
      'Check the onboarding column on the Devices page.',
      'Select the pending devices and choose Approve. Configuration management is where this lives in the real portal.',
    ],
    effort: [
      'Fixing it should not need any response action.',
      'Isolating a device would cut it off from the network and does not change alerting.',
      'Just approve. Do not isolate or re-onboard.',
    ],
  },

  debrief: [
    'A device can be visible in the portal yet not approved, so it does not report alerts until it is approved from the configuration management page.',
    'Filtering alerts, changing device group membership (which scopes RBAC and policy) or tweaking alert settings does not change whether a device reports.',
    'Approving the pending devices in bulk is the minimum-effort fix.',
  ],

  solution: (w) => [['defender.approveDevices', { ids: pending(w).map((d) => d.id) }]],
};
