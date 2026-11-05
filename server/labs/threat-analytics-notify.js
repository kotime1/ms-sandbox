import { visited } from './helpers.js';

const OWNER = 'threatintel@contoso.com';
const mails = (w) => w.defender.outbox.filter((m) => m.title.startsWith('Threat analytics:'));
const published = (w) => w.log.some((e) => e.ok && e.action === 'ta.publishReport');
const rules = (w) => w.defender.kindRules;
const ta = (w) => rules(w).filter((r) => r.kind === 'threatAnalytics');

export default {
  id: 'threat-analytics-notify',
  title: 'Get told when a new threat report lands',
  level: 'Beginner',
  minutes: 10,
  topics: ['Threat analytics', 'Email notifications', 'Defender XDR settings'],
  examObjective: '3.1 Detect threats by using Microsoft Defender XDR',
  sourceQuestions: { set1: [], set2: [], set3: [], set4: [1], set5: [1] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'partial', note: 'The Threat analytics tab, its path (Settings > Microsoft Defender XDR > General > Email notifications), the name rule (letters and numbers only) and the choice of all reports or a type/tag are from Microsoft Learn, checked 2026-11-04. The Vulnerabilities tab is modelled minimally, from the practice question. The report feed is invented.' },
  scenarios: [],
  withholdNotes: ['threat-analytics-notify'],
  brief:
    'Your threat intelligence team wants an email whenever Microsoft publishes a new or updated threat analytics report about ransomware, and only those. ' +
    `The recipient is ${OWNER}. There are several kinds of email notification in the Defender portal and they live in different places: pick the one that is about threat reports, ` +
    'create it, then use the simulated feed to publish a ransomware report and an unrelated one and check the outbox. A rule of the wrong kind is easy to create and will say nothing when a report arrives.',

  setup(w) {
    w.defender.taReports.push(
      { id: 'ta-ransom', title: 'Ransomware campaign targeting healthcare', type: 'Threat overview', tags: ['Ransomware'] },
      { id: 'ta-phish', title: 'Phishing kit abusing QR codes', type: 'Technique profile', tags: ['Phishing'] },
    );
    return [];
  },

  objectives: [
    {
      id: 'rule', text: 'Create the notification rule that covers threat analytics reports, limited to ransomware, with the threat intelligence team as recipient.',
      check: (w) => ta(w).some((r) => !r.scope.all && r.scope.tags.length === 1 && r.scope.tags[0] === 'Ransomware' && r.recipients.includes(OWNER)),
    },
    {
      // Graded on the outcome: publishing both reports must produce exactly one email, for the ransomware report.
      id: 'outcome', text: 'Publish the ransomware report and the phishing report from the feed, and confirm only the ransomware one sent an email.',
      check: (w) => {
        const sent = mails(w);
        const bothPublished = w.log.filter((e) => e.ok && e.action === 'ta.publishReport').map((e) => e.params?.reportId);
        return published(w) && bothPublished.includes('ta-ransom') && bothPublished.includes('ta-phish') && sent.length === 1 && sent[0].title.includes('Ransomware') && sent[0].to === OWNER;
      },
    },
  ],

  steps: [
    { text: 'Open Settings and find the email notification areas.', target: 'nav:defender/rules', done: (w) => visited(w, 'defender/rules') },
    { text: 'Create a notification rule on the Threat analytics tab.', target: 'btn:create-notif:threatAnalytics', done: (w) => ta(w).length > 0 },
    { text: 'Publish the two reports from the simulated feed.', target: 'btn:publish:ta-ransom', done: (w) => published(w) },
  ],

  hints: {
    rule: [
      'There are separate email notification areas: one for alerts on devices, and tabs for other kinds of event. Which one is about threat reports?',
      'It is on the Microsoft Defender XDR email notifications page, not under Endpoints. Open the Threat analytics tab and create a rule there. The name takes English letters and numbers only.',
      'Threat analytics tab > + Create a notification rule > name it (for example RansomwareReports) > Only reports of a certain type or with a specific tag > tick Ransomware > add the recipient.',
    ],
    outcome: [
      'The sandbox cannot send mail, so it records what it would have sent. The feed under the rules publishes reports.',
      'Publish both reports, then read the Emails sent list in the alert section above: it shows every simulated email.',
      'One email, for the ransomware report. If the phishing report also mailed, your rule covers all reports; if neither did, the rule is the wrong kind.',
    ],
  },

  debrief: [
    'Threat analytics has its own notification rule, created on the Threat analytics tab of Settings > Microsoft Defender XDR > General > Email notifications. It emails about new or updated threat reports, either all of them or only a chosen report type or tag.',
    'The others do different jobs. An alert notification rule (Settings > Endpoints > General > Email notifications) mails about alerts on devices by device group and severity. A vulnerabilities rule mails about new vulnerabilities such as public exploits. Neither is triggered by a threat report, which is why a rule of the wrong kind is silent.',
    'A custom detection rule watches activity data such as processes and connections, not metadata about the threat analytics feature, and a Microsoft Sentinel automation rule does not see threat analytics publications at all.',
    'The rule name and description take English letters and numbers only: spaces, dashes and underscores are refused.',
  ],

  solution: () => [
    ['defender.createKindNotification', { kind: 'vulnerabilities', name: 'WrongKind', recipients: [OWNER] }],
    ['defender.createKindNotification', { kind: 'threatAnalytics', name: 'RansomwareReports', tags: ['Ransomware'], recipients: [OWNER] }],
    ['ta.publishReport', { reportId: 'ta-ransom' }],
    ['ta.publishReport', { reportId: 'ta-phish' }],
  ],
};
