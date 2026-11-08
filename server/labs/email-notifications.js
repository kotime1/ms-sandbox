import { visited, foundEquals } from './helpers.js';

const OWNER = 'secops@contoso.com';
// Everything the sandbox would have emailed. All mail counts: an informational email is exactly the noise the brief rules out.
const mails = (w) => w.defender.outbox;
const ranReplay = (w) => w.log.some((e) => e.ok && e.action === 'attack.run');

export default {
  id: 'email-notifications',
  title: 'Email the right people about brute force',
  level: 'Beginner',
  minutes: 12,
  topics: ['Defender XDR settings', 'Email notifications', 'Device groups', 'Roles and permissions'],
  examObjective: '2.1 Respond to alerts and incidents in Microsoft Defender XDR',
  sourceQuestions: { set1: [17], set2: [], set3: [3, 4], set4: [2, 16], set5: [3, 5], set6: [4, 16] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'partial', note: 'The rule fields (name, devices, severity, recipients), the Settings > Endpoints > General > Email notifications path and the permissions are from Microsoft Learn, checked 2026-11-02. That Microsoft 365 role groups count as well as Entra roles comes only from the practice question; the Learn permissions page lists Entra roles only.' },
  scenarios: ['bruteforce-alerts'],
  withholdNotes: ['email-notifications'],
  answers: [{ id: 'who', label: 'Which users can modify security settings in Defender XDR? (names, comma separated)', placeholder: 'User1, ...' }],
  brief:
    'The SOC wants an email the moment a brute-force alert fires on the servers, and only on the servers. Workstation alerts are handled by another team, and ' +
    'low-value alerts should not fill the inbox. The recipient is the SOC distribution group secops@contoso.com. ' +
    'Create the rule, then replay the brute-force activity and check the simulated outbox. You are signed in as a Security Administrator. ' +
    'Afterwards, use the sign-in selector to find out which of the three admins in this tenant could have made the same change, and report them.',

  setup(w) {
    // The three people from the exam scenario, plus the learner (who is already signed in as a Security Administrator).
    w.directory.users.push(
      { id: 'u-user1', name: 'User1', entraRole: 'Global Administrator', roleGroup: 'Security Administrator' },
      { id: 'u-user2', name: 'User2', entraRole: 'Security Administrator', roleGroup: 'Security Reader' },
      { id: 'u-user3', name: 'User3', entraRole: 'Security Reader', roleGroup: 'Security Reader' },
    );
    return [];
  },

  objectives: [
    {
      id: 'rule', text: 'Create a notification rule that emails secops@contoso.com about alerts on the servers only, and not about informational alerts.',
      check: (w) => w.defender.notificationRules.some((r) => !r.allDevices && r.deviceGroups.length === 1 && r.deviceGroups[0] === 'grp-servers'
        && r.recipients.includes(OWNER) && !r.severities.includes('Informational')),
    },
    {
      // Graded on the outcome of the replay, not on the form: the server got one email, for the server, with the right severity.
      id: 'outcome', text: 'Replay the brute-force activity and confirm exactly one email went out, for the server.',
      check: (w) => ranReplay(w) && mails(w).length === 1 && mails(w)[0].device === 'SRV-APP01' && mails(w)[0].to === OWNER,
    },
    { id: 'who', text: 'Report which of User1, User2 and User3 can modify security settings in Defender XDR.', check: (w) => foundEquals(w, 'who', 'user1, user2') },
  ],

  steps: [
    { text: 'Open Settings and find the email notification rules.', target: 'nav:defender/rules', done: (w) => visited(w, 'defender/rules') },
    { text: 'Add a notification rule scoped to the servers.', target: 'btn:add-notification', done: (w) => w.defender.notificationRules.length > 0 },
    { text: 'Replay the brute-force activity.', target: 'btn:run-sim:bruteforce-alerts', done: (w) => ranReplay(w) },
    { text: 'Report who can modify security settings.', target: 'btn:submit-answer', done: (w) => w.findings.some((f) => f.objectiveId === 'who') },
  ],

  hints: {
    rule: [
      'A notification rule has three parts: which devices, which alert severities, and who to email.',
      'Narrow it by device group (not "All devices", which only a Global administrator may choose) and untick the severity you do not want.',
      'Add item > name it > Devices: Servers only > untick Informational (keep High) > Next > add secops@contoso.com > Save notification rule.',
    ],
    outcome: [
      'The sandbox cannot send mail, so it records what it would have sent.',
      'Replay the activity from the lab panel, then read the "Emails sent (simulated)" list under the rules.',
      'One email, for SRV-APP01. If you see Device1 or an informational alert, tighten the rule.',
    ],
    who: [
      'Open the "Signed in as" selector. Each person has an Entra role and a Microsoft 365 role group.',
      'Try creating a rule as each person. Read what the failure says.',
      'Global Administrator and Security Administrator can; Security Reader cannot. A person qualifies through either their Entra role or their role group.',
    ],
  },

  debrief: [
    'The rule is built from device group + severity + recipients. Severity or alert category alone cannot limit notifications to particular devices, which is why "which users to notify and the device group" is the exam answer to "only these devices, minimise noise".',
    'Where it lives: Settings > Endpoints > General > Email notifications in the current Microsoft Defender portal. The exam writes this as "the Microsoft Defender XDR settings" (not Email & collaboration settings, which are for mail protection). Both phrases point at the same place.',
    'Who can do it: users with Manage security settings or a higher role, such as Security Administrator. A rule for all devices is a Global administrator task. Security Reader and Global Reader are read-only.',
    'In the permissions question, User1 (Global Administrator) and User2 (Security Administrator in Entra) can change settings. User3 holds only Security Reader in both places. Microsoft recommends using the lowest role that works rather than Global Administrator.',
  ],

  solution: () => [
    ['defender.createNotificationRule', { name: 'Brute force on servers', devices: 'groups', deviceGroups: ['grp-servers'], severities: ['High'], recipients: [OWNER] }],
    ['attack.run', { scenario: 'bruteforce-alerts' }],
    ['findings.report', { objectiveId: 'who', value: 'User1, User2' }],
  ],
};
