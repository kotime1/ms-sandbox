import { visited } from './helpers.js';

const ready = (w) => w.ueba.enabled && w.ueba.sources.includes('AzureActivity') && w.ueba.sources.includes('SecurityEvent');

export default {
  id: 'ueba-sources',
  title: 'Turn on UEBA: which data sources feed it?',
  level: 'Beginner',
  minutes: 10,
  topics: ['UEBA', 'Entity behavior', 'Data sources'],
  examObjective: '1.2 Configure the Microsoft Sentinel SIEM and platform',
  sourceQuestions: { set1: [], set2: [], set3: [], set4: [], set5: [], set6: [12] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'exam', note: 'From a practice question only: the two data sources on the UEBA settings page are Azure Activity and Security Events, and Microsoft 365 is not one of them. I have not found that list on a Microsoft Learn page, so treat the source list as unverified. The real page also has Entra ID sync and per-source options that are simplified here.' },
  scenarios: [],
  withholdNotes: ['ueba-sources'],
  brief:
    'The SOC wants User and Entity Behavior Analytics running in Microsoft Sentinel. It is currently off. ' +
    'Turn it on and connect the data sources that UEBA supports so that it can start building behavior profiles. ' +
    'The workspace already ingests several kinds of data (Microsoft 365, Syslog, firewall logs) so several choices sound reasonable. Read what the page offers.',

  setup() { return []; },

  objectives: [
    { id: 'on', text: 'Entity behavior analytics is turned on for the workspace.', check: (w) => w.ueba.enabled },
    { id: 'sources', text: 'Both data sources that UEBA supports are connected.', check: (w) => ready(w) },
    {
      // Restraint: nothing that UEBA does not use should be connected.
      id: 'only', text: 'Only data sources that UEBA supports are connected.', check: (w) => ready(w) && w.ueba.sources.length === 2,
    },
  ],

  steps: [
    { text: 'Open Entity behavior configuration in Sentinel settings.', target: 'nav:sentinel/ueba', done: (w) => visited(w, 'sentinel/ueba') },
    { text: 'Turn on entity behavior analytics.', target: 'btn:ueba-enable', done: (w) => w.ueba.enabled },
    { text: 'Connect the data sources the page offers.', target: 'btn:ueba-connect:AzureActivity', done: (w) => w.ueba.sources.length > 0 },
  ],

  hints: {
    on: [
      'UEBA is a switch for the whole workspace, in Sentinel settings.',
      'Look for Entity behavior configuration.',
      'Open Entity behavior configuration and select Turn on entity behavior analytics.',
    ],
    sources: [
      'The page lists the data sources UEBA supports that you have not connected yet. Read that list instead of picking from what you ingest.',
      'There are two of them. One is about Azure resources and one is about Windows servers and domain controllers.',
      'Connect Azure Activity and Security Events.',
    ],
    only: [
      'Not every kind of log you collect is a UEBA data source.',
      'If the page refuses a source, it is not one UEBA supports.',
      'Leave Microsoft 365, Syslog and firewall logs unconnected.',
    ],
  },

  debrief: [
    'On the Entity behavior configuration page, after you turn UEBA on, Microsoft Sentinel lists the UEBA data sources you have not connected yet. The two on that list are Azure Activity and Security Events, so those are the two answers to "which data sources support UEBA".',
    'Microsoft 365 is a tempting third answer because it is a rich source of user activity, but it is not one of the two data sources on that page. The same goes for Syslog and Common Event Format, which carry other kinds of logs.',
    'UEBA also builds its user profiles from Microsoft Entra ID, which is a separate sync step and not one of the two data sources in this question.',
    'The exam question asks for two answers and says each is a complete solution, so connecting either one alone would already be a valid answer; the lab asks for both so that you meet the full list.',
  ],

  solution: () => [
    ['ueba.connectSource', { source: 'AzureActivity' }, { fails: /Turn on entity behavior analytics/ }],
    ['ueba.enable', {}],
    ['ueba.connectSource', { source: 'OfficeActivity' }, { fails: /not a UEBA data source/ }],
    ['ueba.connectSource', { source: 'AzureActivity' }],
    ['ueba.connectSource', { source: 'SecurityEvent' }],
  ],
};
