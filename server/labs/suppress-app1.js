import { visited } from './helpers.js';

const TITLE = 'Security event log was cleared';
const isApp1 = (a) => a.evidence?.process === 'App1.exe';
const isWevtutil = (a) => a.evidence?.process === 'wevtutil.exe';
const goodRule = (r) => r.alertTitle === TITLE && r.ioc?.type === 'process' && String(r.ioc.value).toLowerCase() === 'app1.exe';

export default {
  id: 'suppress-app1',
  title: 'Silence App1 without going blind',
  level: 'Beginner',
  minutes: 10,
  topics: ['Defender for Endpoint', 'Alert tuning', 'Suppression rules'],
  examObjective: '2.2 Respond to alerts and incidents in Microsoft Defender for Endpoint',
  sourceQuestions: [3, 25],
  scenarios: ['app1-clears-logs'],
  brief:
    'App1 is an approved maintenance tool that clears the event log on the application server SRV-APP01, and it fires "Security event log was cleared" every night. ' +
    'Stop App1 from raising alerts, but make sure the same alert is still raised if any other tool (for example wevtutil.exe on another device) clears a log. Then replay the simulation to prove it.',

  setup() { return ['app1-clears-logs']; },

  objectives: [
    { id: 'rule', text: 'Create a suppression rule limited to this alert title and the App1.exe process.', check: (w) => w.defender.suppression.some(goodRule) },
    {
      id: 'verify', text: 'Replay the simulation: App1\'s alert is suppressed, but wevtutil.exe\'s alert still appears.',
      check: (w) => w.defender.alerts.some((a) => isApp1(a) && a.suppressedBy) && w.defender.alerts.filter(isWevtutil).length > 0 && w.defender.alerts.filter(isWevtutil).every((a) => !a.suppressedBy),
    },
  ],

  steps: [
    { text: 'Open Incidents & alerts in the Defender portal.', target: 'nav:defender/alerts', done: (w) => visited(w, 'defender/alerts') },
    { text: 'Open the "log was cleared" alert caused by App1.exe.', target: (w) => { const a = w.defender.alerts.find(isApp1); return a ? `row:alert:${a.id}` : 'nav:defender/alerts'; }, done: (w) => w.defender.suppression.some(goodRule) },
    { text: 'Create a suppression rule for the App1.exe indicator.', target: 'btn:create-suppression', done: (w) => w.defender.suppression.some(goodRule) },
    { text: 'Replay the simulation from the lab panel.', target: 'btn:run-sim:app1-clears-logs', done: (w) => w.defender.alerts.some((a) => isApp1(a) && a.suppressedBy) },
  ],

  hints: {
    rule: [
      'You want to dismiss alerts you know are harmless, automatically, in the future.',
      'Start from one of the alerts that App1 caused, and look for a way to create a rule from it.',
      'Open the alert from App1.exe > Create suppression rule > Triggering IOC: process App1.exe > Scope: Organization > Action: Hide alert.',
    ],
    verify: [
      'A rule only affects alerts raised after it exists.',
      'The lab panel has a button that makes the attack agent replay the activity.',
      'Click "Replay: App1 clears logs" in the lab panel, then check the alert list. If wevtutil.exe\'s alert is hidden too, your rule is too broad.',
    ],
  },

  debrief: [
    'A suppression rule matches on the alert title plus a triggering indicator (IOC) and a scope. Adding the IOC (App1.exe) is what keeps the same alert from other processes visible.',
    'Suppression applies to alerts raised after the rule exists; existing alerts are not rewritten.',
    'Hide vs. Resolve: hide removes it from the queue; resolve keeps a closed record. Both leave other detections untouched.',
    'Compare with the other tools the exam offers: automated investigation and response reduces alert volume by investigating, alert policies cover Microsoft 365 activity, and custom detections create new alerts.',
  ],

  solution: (w) => {
    const a = w.defender.alerts.find(isApp1);
    return [
      ['defender.createSuppression', { alertTitle: TITLE, iocType: 'process', iocValue: 'App1.exe', scope: 'organization', action: 'hide' }],
      ['attack.run', { scenario: 'app1-clears-logs' }],
      ['ui.visit', { page: 'defender/alerts' }],
      ...(a ? [] : []),
    ];
  },
};
