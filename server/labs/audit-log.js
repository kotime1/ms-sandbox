import { visited, foundEquals } from './helpers.js';

const DAY = 86_400_000;
const ago = (d) => new Date(Date.now() - d * DAY);
const searches = (w) => w.audit.searches;
const air = (w) => searches(w).find((s) => s.recordTypes.length === 1 && s.recordTypes[0] === 'AirInvestigation' && s.count > 0);

export default {
  id: 'audit-log',
  title: 'Search the audit log, keep it for a year',
  level: 'Intermediate',
  minutes: 15,
  topics: ['Microsoft Purview Audit', 'Audit (Standard) vs Premium', 'Record types', 'Audit retention'],
  examObjective: '2.3 Investigate Microsoft 365 activities to identify threats',
  sourceQuestions: { set1: [36], set2: [39], set3: [34, 39] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'exam', note: 'Unverified in part. Retention (180 days Standard; one year for Entra ID, Exchange, SharePoint and OneDrive in Premium), the 180-day maximum search range and the Audit Logs / View-Only Audit Logs roles are from Microsoft Learn, checked 2026-11-02. The AirInvestigation record type, and which Entra roles can search, come from the practice questions: the Learn pages I could read did not confirm them.' },
  scenarios: [],
  withholdNotes: ['audit'],
  answers: [{ id: 'searchers', label: 'Which of Admin1 (Global Administrator), Admin2 (Security Administrator) and Admin3 (Exchange Administrator) can search the audit log?', placeholder: 'Admin1, ...' }],
  brief:
    'An investigation is under way and you are the Global Administrator. First, find out what Microsoft Defender XDR did in the last five days: search the unified audit log for activity from automated investigation and response, using the record type that scopes to it and nothing broader. ' +
    'Second, auditors asked for Microsoft Entra ID and Exchange Online events from nine months ago, and the search returns nothing. Make sure that, from now on, records for those two services stay searchable for at least a year. ' +
    'Finally, say which of the three admins in the tenant can use the audit search.',

  setup(w) {
    w.audit.tier = 'standard';
    w.directory.actorId = 'u-ga';
    w.directory.users.push(
      { id: 'u-ga', name: 'admin0@contoso.com', entraRole: 'Global Administrator', roleGroup: 'Global Administrator' },
      { id: 'u-adm1', name: 'Admin1', entraRole: 'Global Administrator', roleGroup: 'Organization Management' },
      { id: 'u-adm2', name: 'Admin2', entraRole: 'Security Administrator', roleGroup: 'Security Administrator' },
      { id: 'u-adm3', name: 'Admin3', entraRole: 'Exchange Administrator', roleGroup: 'Organization Management' },
    );
    const rec = (days, recordType, activity, user) => ({ at: ago(days), recordType, activity, user });
    // Defender XDR: recent automated investigation activity, plus an old one outside the window.
    w.audit.records.push(
      rec(1, 'AirInvestigation', 'Automated investigation started', 'system'),
      rec(2, 'AirInvestigation', 'Remediation action approved', 'priya.shah@contoso.com'),
      rec(4, 'AirInvestigation', 'Automated investigation completed', 'system'),
      rec(40, 'AirInvestigation', 'Automated investigation started', 'system'),
      // Noise in other record types over the same five days.
      rec(1, 'SecurityComplianceCenterEOPCmdlet', 'New-ComplianceSearch', 'jamie.fox@contoso.com'),
      rec(3, 'ExchangeAdmin', 'Set-Mailbox', 'jamie.fox@contoso.com'),
      rec(2, 'AzureActiveDirectory', 'Add member to role', 'admin0@contoso.com'),
      // Nine months ago: Entra and Exchange (kept a year only in Premium) and Teams (180 days either way).
      rec(270, 'AzureActiveDirectory', 'Add user', 'admin0@contoso.com'),
      rec(270, 'ExchangeAdmin', 'New-InboxRule', 'alex.rivera@contoso.com'),
      rec(270, 'MicrosoftTeams', 'ChannelAdded', 'sam.okafor@contoso.com'),
    );
    return [];
  },

  objectives: [
    {
      id: 'air', text: 'Search the last five days for Defender XDR automated investigation and response activity, scoped to the one record type that covers it.',
      check: (w) => searches(w).some((s) => s.recordTypes.length === 1 && s.recordTypes[0] === 'AirInvestigation' && s.count > 0 && (Date.parse(s.to) - Date.parse(s.from)) <= 5 * DAY + 60_000 && (Date.parse(s.to) - Date.parse(s.from)) >= 4 * DAY),
    },
    {
      id: 'tier', text: 'Entra ID and Exchange Online audit records are kept for at least one year.',
      check: (w) => w.audit.tier === 'premium',
    },
    {
      // Proof by outcome: with the longer retention in place, the nine-month-old events can be found by a search.
      id: 'retained', text: 'Confirm it with a search: the Entra ID and Exchange events from nine months ago are returned.',
      check: (w) => w.audit.tier === 'premium' && searches(w).some((s) => s.tier === 'premium' && s.recordTypes.includes('AzureActiveDirectory') && s.recordTypes.includes('ExchangeAdmin')
        && s.activities.includes('Add user') && s.activities.includes('New-InboxRule')),
    },
    { id: 'searchers', text: 'Report which of the three admins can search the audit log.', check: (w) => foundEquals(w, 'searchers', 'admin1, admin2, admin3') },
  ],

  steps: [
    { text: 'Open Audit in Microsoft Purview.', target: 'nav:purview/audit', done: (w) => visited(w, 'purview/audit') },
    { text: 'Search the last five days for Defender XDR activity.', target: 'btn:run-audit-search', done: (w) => Boolean(air(w)) },
    { text: 'Change the audit tier so Entra ID and Exchange are kept for a year.', target: 'btn:set-premium', done: (w) => w.audit.tier === 'premium' },
    { text: 'Search nine months back for the Entra ID and Exchange events.', target: 'btn:run-audit-search', done: (w) => searches(w).some((s) => s.tier === 'premium' && s.recordTypes.includes('AzureActiveDirectory')) },
    { text: 'Report who can search the log.', target: 'btn:submit-answer', done: (w) => w.findings.some((f) => f.objectiveId === 'searchers') },
  ],

  hints: {
    air: [
      'The record type filter narrows a search to one service. Read the descriptions: which one is about automated investigation and response?',
      'Set the date range to the last five days and tick only that record type. A broader search returns noise, including cmdlet records you do not need.',
      'Record type: AirInvestigation, with start five days ago and end now.',
    ],
    tier: [
      'Which audit offering keeps Entra ID and Exchange records longer than 180 days by default?',
      'Running a search with PowerShell or the API only queries the same log; it does not make it last longer. Retention is a property of the offering.',
      'Switch the tenant to Audit (Premium). It keeps AzureActiveDirectory, Exchange, OneDrive and SharePoint records for one year.',
    ],
    retained: [
      'Retention applies going forward and to what has not yet aged out. Nine months is inside one year.',
      'The search page allows at most 180 days per search, so use a window that ends nine months ago (about day 270 back to day 150).',
      'Search AzureActiveDirectory and ExchangeAdmin from about 280 days ago to about 260 days ago.',
    ],
    searchers: [
      'The search needs a role such as Audit Logs or View-Only Audit Logs. Which of these people hold roles that carry it?',
      'Try signing in as each admin (the sign-in selector on the Audit page) and attempting a search.',
      'The practice-question answer is all three: Global Administrator, Security Administrator and Exchange Administrator.',
    ],
  },

  debrief: [
    'AirInvestigation is the record type for Microsoft Defender XDR automated investigation and response. SecurityComplianceCenterEOPCmdlet is for Security & Compliance and EOP cmdlets an admin ran, ExchangeAdmin for Exchange admin changes, and AzureActiveDirectory for directory changes. A record-type filter is how you scope a search to one service.',
    'Audit (Standard) keeps records for 180 days. Audit (Premium) keeps Microsoft Entra ID, Exchange, OneDrive and SharePoint records for one year by default; other services stay at 180 days unless you add an audit log retention policy (up to 10 years with the add-on licence). Searching with Search-UnifiedAuditLog or the Management Activity API reads the same log: it does not extend retention.',
    'A single search can cover at most 180 days, so a nine-month-old record needs a window placed there. Records that have aged out are gone: the Teams event from nine months ago is not recoverable under either tier.',
    'Who can search: the Learn page requires the Audit Logs or View-Only Audit Logs role in Purview. The practice question treats Global, Security and Exchange Administrators as able to, which the sandbox follows, but I could not confirm the Entra-role mapping in the docs.',
  ],

  solution: () => {
    const now = Date.now();
    const d = (n) => new Date(now - n * DAY).toISOString();
    return [
      ['purview.searchAudit', { from: d(5), to: d(0), recordTypes: ['AirInvestigation'] }],
      ['purview.setAuditTier', { tier: 'premium' }],
      ['purview.searchAudit', { from: d(281), to: d(259), recordTypes: ['AzureActiveDirectory', 'ExchangeAdmin'] }],
      ['findings.report', { objectiveId: 'searchers', value: 'Admin1, Admin2, Admin3' }],
    ];
  },
};
