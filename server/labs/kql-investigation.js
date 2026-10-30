import { ATTACKER_IP } from '../attacks/scenarios.js';
import { visited } from './helpers.js';

const sentinelQ = (w) => w.queries.filter((q) => q.surface === 'sentinel');

export default {
  id: 'kql-investigation',
  title: 'Three questions for the logs',
  level: 'Intermediate',
  minutes: 25,
  topics: ['KQL', 'union', 'AzureActivity', 'Microsoft Graph activity logs'],
  examObjective: '2.3 / 3.2 Investigate activity and hunt with KQL',
  sourceQuestions: { set1: [38, 39, 44, 47, 48], set2: [38, 43, 47, 48] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: "docs", note: "The Graph activity log example query is taken from Microsoft Learn. Table schemas are simplified." },
  scenarios: ['identity-and-graph-abuse'],
  brief:
    'Your SOC suspects a compromised account. Use the Logs blade to answer three questions: ' +
    `(1) Where does the IP ${ATTACKER_IP} show up across SigninLogs, AuditLogs and SecurityAlert? ` +
    '(2) Who successfully edited analytics rule 11111111-1111-1111-1111-111111111111? ' +
    '(3) Which app generates the most distinct failed (401/403) requests to /groups in Microsoft Graph activity logs over the last 3 days?',

  setup() { return ['identity-and-graph-abuse']; },

  objectives: [
    {
      id: 'union', text: `Find every row mentioning ${ATTACKER_IP} across SigninLogs, AuditLogs and SecurityAlert in one query.`,
      check: (w) => sentinelQ(w).some((q) => q.ops.includes('union') && ['SigninLogs', 'AuditLogs', 'SecurityAlert'].every((t) => q.tables.includes(t)) && q.records.length > 0 && q.records.every((r) => r.IPAddress === ATTACKER_IP)),
    },
    {
      id: 'rule-editor', text: 'Identify who successfully edited the analytics rule (your result must contain only that person).',
      check: (w) => sentinelQ(w).some((q) => q.tables.includes('AzureActivity') && q.columns.includes('Caller') && q.records.length > 0 && q.records.every((r) => r.Caller === 'sam.okafor@contoso.com')),
    },
    {
      id: 'graph', text: 'Rank apps by distinct failed (401/403) /groups requests so that the worst offender is first.',
      check: (w) => sentinelQ(w).some((q) => q.tables.includes('MicrosoftGraphActivityLogs') && q.ops.includes('summarize') && q.columns.includes('AppId') && q.records.length >= 2 && q.records[0].AppId === 'app-9' && q.records.some((r) => r.AppId === 'app-3')),
    },
  ],

  steps: [
    { text: 'Open the Logs blade.', target: 'nav:sentinel/logs', done: (w) => visited(w, 'sentinel/logs') },
    { text: 'Write a query and press Run.', target: 'btn:run-query', done: (w) => sentinelQ(w).length > 0 },
  ],

  hints: {
    union: [
      'Which operator stacks rows from several tables, rather than matching them to each other?',
      'union takes a list of tables; then filter on the shared column.',
      `union SigninLogs, AuditLogs, SecurityAlert | where IPAddress == "${ATTACKER_IP}"`,
    ],
    'rule-editor': [
      'Azure Activity records management operations, including edits to Sentinel resources.',
      'The operation name ends in ALERTRULES/WRITE; the rule id is inside Properties. A failed attempt is not an edit.',
      'AzureActivity | where OperationNameValue startswith "MICROSOFT.SECURITYINSIGHTS/ALERTRULES/WRITE" | where Properties contains "alertRules/11111111-1111-1111-1111-111111111111" | where ActivityStatusValue contains "Succeeded" | project Caller, TimeGenerated',
    ],
    graph: [
      'A request cannot be both 401 and 403: be careful with and/or. Count distinct requests, not rows.',
      'Group by AppId (and the other caller columns), sort descending, then limit.',
      'MicrosoftGraphActivityLogs | where TimeGenerated >= ago(3d) | where ResponseStatusCode == 401 or ResponseStatusCode == 403 | where RequestUri contains "/groups" | summarize UniqueRequests=count_distinct(RequestId) by AppId | sort by UniqueRequests desc | limit 20',
    ],
  },

  debrief: [
    'union appends rows from several tables; join matches rows between two. For "search this IP everywhere", union plus a filter is the pattern.',
    'AzureActivity is the audit trail of management actions in Sentinel; always filter ActivityStatusValue so that a failed attempt is not reported as a change.',
    'Mixed up and/or is a classic trap: a single response code cannot equal 401 and 403. Use or (or `in (401, 403)`).',
    'Use count_distinct(RequestId) to count distinct requests rather than rows, and sort desc + limit for a "top N".',
  ],

  solution: () => [
    ['query.run', { surface: 'sentinel', text: `union SigninLogs, AuditLogs, SecurityAlert | where IPAddress == "${ATTACKER_IP}"` }],
    ['query.run', { surface: 'sentinel', text: 'AzureActivity | where OperationNameValue startswith "MICROSOFT.SECURITYINSIGHTS/ALERTRULES/WRITE" | where Properties contains "alertRules/11111111-1111-1111-1111-111111111111" | where ActivityStatusValue contains "Succeeded" | project Caller, TimeGenerated' }],
    ['query.run', { surface: 'sentinel', text: 'MicrosoftGraphActivityLogs | where TimeGenerated >= ago(3d) | where ResponseStatusCode == 401 or ResponseStatusCode == 403 | where RequestUri contains "/groups" | summarize UniqueRequests=count_distinct(RequestId) by AppId, ServicePrincipalId, UserId | sort by UniqueRequests desc | limit 20' }],
  ],
};
