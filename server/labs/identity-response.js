import { visited, foundEquals } from './helpers.js';

const acct = (w) => w.identity.accounts.find((a) => a.id === 'acct-hrsvc');
const alert = (w) => w.identity.alerts.find((a) => a.id === 'mdi-1');
const dl = (w, id) => w.identity.downloads.filter((d) => d.reportId === id);
const did = (w, action) => w.identity.actionLog.some((l) => l.action === action);

export default {
  id: 'identity-response',
  title: 'Stop a stolen service account, then find who changed Enterprise Admins',
  level: 'Intermediate',
  minutes: 15,
  topics: ['Defender for Identity', 'Remediation actions', 'Identity reports', 'Credential theft'],
  examObjective: '2.1 Respond to alerts and incidents in Microsoft Defender XDR',
  sourceQuestions: { set1: [24], set2: [], set3: [26], set4: [25, 26], set5: [23, 25] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'partial', note: 'The remediation actions and which identity sources each supports (Revoke session is not available for Active Directory; Mark as compromised is Entra ID only) and the three identity reports with their path are from Microsoft Learn (defender-for-identity/remediation-actions and /reports), checked 2026-11-04. The Excel (XLSX) format of the detailed alert report comes from the practice questions: the reports page I could read does not say. The report data is invented.' },
  scenarios: [],
  withholdNotes: ['identity-response'],
  answers: [
    { id: 'format', label: 'In which file format is the detailed alert report downloaded?', placeholder: 'e.g. CSV' },
    { id: 'who', label: 'Who changed the Enterprise Admins group? (account)', placeholder: 'CONTOSO\\...' },
  ],
  brief:
    'A Defender for Identity alert shows repeated NTLM sign-ins for the service account CONTOSO\\hrsvc from an unfamiliar address, and the activity is still going on. ' +
    'First stop the account from reaching on-premises resources right now: pick the action that actually prevents it, and note that this is an Active Directory account. ' +
    'Then download the alert’s detailed report and say what format it came in. Finally, auditors want to know who changed the Enterprise Admins group in the last 14 days: find the identity report that lists changes to sensitive groups, download it for that period, and report the account responsible.',

  setup(w) {
    w.identity.accounts.push(
      { id: 'acct-hrsvc', name: 'CONTOSO\\hrsvc', source: 'Active Directory', enabled: true, mustChangePassword: false, sessions: 3, flaggedCompromised: false },
      { id: 'acct-cloud', name: 'dana.ortiz@contoso.com', source: 'Microsoft Entra ID', enabled: true, mustChangePassword: false, sessions: 2, flaggedCompromised: false },
    );
    w.identity.alerts.push({ id: 'mdi-1', title: 'Suspected credential theft (NTLM)', account: 'CONTOSO\\hrsvc', severity: 'High', reportDownloaded: false });
    const day = 86_400_000, ago = (d) => new Date(Date.now() - d * day);
    w.identity.reportRows['sensitive-groups'] = [
      { at: ago(3), account: 'Enterprise Admins', detail: 'Member added: CONTOSO\\svc-backup by CONTOSO\\tbarker' },
      { at: ago(9), account: 'Domain Admins', detail: 'Member removed: CONTOSO\\old-admin by CONTOSO\\tbarker' },
      { at: ago(40), account: 'Enterprise Admins', detail: 'Member added: CONTOSO\\legacy by CONTOSO\\jlopez' }, // outside the 14-day window
    ];
    w.identity.reportRows.cleartext = [{ at: ago(2), account: 'PRINT-SRV01', detail: 'LDAP simple bind: cleartext password for CONTOSO\\scanner' }];
    w.identity.reportRows.summary = [{ at: ago(1), account: '(tenant)', detail: '2 open health issues' }];
    return [];
  },

  objectives: [
    {
      // Graded on the state of the account: it must no longer be able to authenticate. Disabling does; revoking a session (unavailable for AD)
      // and marking compromised (Entra ID only) do not; forcing a password change blocks the stolen password but is not what was asked.
      id: 'stop', text: 'CONTOSO\\hrsvc can no longer authenticate to on-premises resources.',
      check: (w) => acct(w) && !acct(w).enabled,
    },
    {
      id: 'format', text: 'Download the detailed alert report and report its file format.',
      check: (w) => Boolean(alert(w)?.reportDownloaded) && foundEquals(w, 'format', 'xlsx'),
    },
    {
      id: 'report', text: 'Download the identity report that lists changes to sensitive groups, for the last 14 days (not a shorter or a longer period).',
      check: (w) => dl(w, 'sensitive-groups').some((d) => d.rows === 2),
    },
    { id: 'who', text: 'Report the account that changed Enterprise Admins in the last 14 days.', check: (w) => dl(w, 'sensitive-groups').some((d) => d.rows === 2) && foundEquals(w, 'who', 'contoso\\tbarker') },
  ],

  steps: [
    { text: 'Open Identities.', target: 'nav:defender/identities', done: (w) => visited(w, 'defender/identities') },
    { text: 'Open the actions on the compromised account and stop it.', target: 'btn:actions:CONTOSO\\hrsvc', done: (w) => acct(w) && !acct(w).enabled },
    { text: 'Download the alert’s detailed report.', target: 'btn:alert-report:mdi-1', done: (w) => Boolean(alert(w)?.reportDownloaded) },
    { text: 'Download the sensitive-groups report.', target: 'btn:report:Modification to sensitive groups', done: (w) => dl(w, 'sensitive-groups').length > 0 },
    { text: 'Report the format and the account.', target: 'btn:submit-answer', done: (w) => w.findings.some((f) => f.objectiveId === 'who') },
  ],

  hints: {
    stop: [
      'The account is an Active Directory account and the activity is ongoing. Which of the listed actions cannot be used on an AD account, and which one only flags something?',
      'Open the Actions menu on hrsvc. Some actions are greyed out for this kind of account; hover to read why. You want the one that prevents new sign-ins.',
      'Disable. Revoke session ends existing sessions but does not stop new authentications, and it is not available for Active Directory; Mark as compromised is Microsoft Entra ID only.',
    ],
    format: [
      'Open the alert and download its detailed report, then look at the file name.',
      'The alert row has a Download detailed report button. The file extension tells you the format.',
      'It is an Excel workbook: XLSX.',
    ],
    report: [
      'Identity reports live under Reports > Identities > Report management. Read what each report shows.',
      'One lists every modification made to sensitive groups such as admins. Download it with a period of at least 14 days.',
      'Modification to sensitive groups, period 14 days or more.',
    ],
    who: [
      'Read the rows for Enterprise Admins in the report you downloaded.',
      'Only changes in the last 14 days count; an older row names someone else.',
      'The most recent change to Enterprise Admins was made by CONTOSO\\tbarker.',
    ],
  },

  debrief: [
    'For an on-premises account that is being abused right now, Disable is the action that stops it: a disabled account cannot sign in or reach network resources until it is re-enabled. Revoke session ends sessions but is not available for Active Directory accounts and would not stop new authentications. Mark as compromised only applies to Microsoft Entra ID and flags the identity without blocking access. The action is carried out by the Defender for Identity sensor on a domain controller.',
    'Defender for Identity reports are under Reports > Identities > Report management: Summary, Modification to sensitive groups (every change to admin groups or tagged accounts) and Passwords exposed in cleartext. The sensitive-groups report is the one that answers who changed Enterprise Admins. Other places in the portal show different things: an Entra workbook about provisioning, a posture assessment, or a cloud discovery dashboard do not list AD group changes.',
    'The detailed alert report downloads as an Excel (XLSX) file. The Learn reports page I could read does not state a format, so that detail comes from the practice questions.',
  ],

  solution: () => {
    const day = 86_400_000;
    return [
      ['identity.respond', { accountId: 'acct-hrsvc', action: 'Revoke session' }, { fails: /not available for Active Directory/ }],
      ['identity.respond', { accountId: 'acct-hrsvc', action: 'Mark as compromised' }, { fails: /Microsoft Entra ID accounts/ }],
      ['identity.respond', { accountId: 'acct-hrsvc', action: 'Disable' }],
      ['identity.downloadAlertReport', { alertId: 'mdi-1' }],
      ['identity.downloadReport', { reportId: 'sensitive-groups', from: new Date(Date.now() - 14 * day).toISOString(), to: new Date().toISOString() }],
      ['findings.report', { objectiveId: 'format', value: 'XLSX' }],
      ['findings.report', { objectiveId: 'who', value: 'CONTOSO\\tbarker' }],
    ];
  },
};
