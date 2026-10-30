import { TOKEN_UTI } from '../attacks/scenarios-extra.js';
import { foundEquals } from './helpers.js';

const sentinelQ = (w) => w.queries.filter((q) => q.surface === 'sentinel');

export default {
  id: 'follow-the-token',
  title: 'Follow one token through Graph',
  level: 'Advanced',
  minutes: 20,
  topics: ['Microsoft Graph activity logs', 'Sign-in correlation', 'KQL'],
  examObjective: '2.3 Investigate Microsoft 365 activities to identify threats',
  sourceQuestions: { set1: [38, 39], set2: [37, 38] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: "docs", note: "SignInActivityId joins to UniqueTokenIdentifier in sign-in logs, as in the Learn example." },
  scenarios: ['token-trail'],
  withholdNotes: ['graph-correlation'],
  answers: [
    { id: 'count', label: 'How many distinct requests used the token?', placeholder: 'a number' },
    { id: 'top', label: 'Which Graph path was requested most often with it?', placeholder: '/v1.0/...' },
  ],
  brief:
    `A Microsoft Entra sign-in for user1@contoso.com looks suspicious. Its unique token identifier is ${TOKEN_UTI}. ` +
    'user1 also made other, ordinary Graph requests that day from a different token, so filtering by user will give you the wrong picture. ' +
    'Find exactly the Graph requests made with that one token and report how many distinct requests there were and which resource they touched most.',

  setup() { return ['token-trail']; },

  objectives: [
    {
      id: 'query', text: 'Run a query that returns only the Graph requests tied to that sign-in (correlate on SignInActivityId).',
      check: (w) => sentinelQ(w).some((q) => q.tables.includes('MicrosoftGraphActivityLogs') && q.records.length > 0 && q.records.every((r) => r.SignInActivityId === TOKEN_UTI)),
    },
    { id: 'count', text: 'Report how many distinct requests used the token.', check: (w) => foundEquals(w, 'count', 6) },
    { id: 'top', text: 'Report the Graph path requested most often with it (for example /v1.0/users).', check: (w) => foundEquals(w, 'top', '/v1.0/me/messages') || foundEquals(w, 'top', '/v1.0/users') },
  ],

  steps: [
    { text: 'Open the Logs blade.', target: 'nav:sentinel/logs', done: (w) => sentinelQ(w).length > 0 },
    { text: 'Filter MicrosoftGraphActivityLogs on the token.', target: 'btn:run-query', done: (w) => sentinelQ(w).some((q) => q.tables.includes('MicrosoftGraphActivityLogs')) },
    { text: 'Report your answers.', target: 'btn:submit-answer', done: (w) => w.findings.length >= 2 },
  ],

  hints: {
    query: [
      'Several attributes could identify "the same sign-in". Which one is built to link a request to a sign-in event?',
      'SessionId and ClientRequestId do not do that job. Look at the table\'s columns.',
      `MicrosoftGraphActivityLogs | where SignInActivityId == "${TOKEN_UTI}"`,
    ],
    count: [
      'Count requests, not rows of anything else.',
      'count_distinct(RequestId).',
      '... | summarize count_distinct(RequestId)',
    ],
    top: [
      'Group by the path.',
      'summarize count() by RequestUri, then sort descending.',
      'Two paths are tied; either is accepted.',
    ],
  },

  debrief: [
    'The SignInActivityId attribute in the Graph activity logs links each request to the Entra sign-in that produced the token (the sign-in\'s unique token identifier). Filtering on it returns exactly the activity of that token.',
    'Filtering by user would also pull in legitimate requests from other tokens, so it over-reports. SessionId, OperationId and ClientRequestId do not correlate a request to a specific sign-in.',
    'This is the same table and the same count_distinct(RequestId) idea as the failed-request hunt: count distinct requests, group by what you care about.',
  ],

  solution: () => [
    ['query.run', { surface: 'sentinel', text: `MicrosoftGraphActivityLogs | where SignInActivityId == "${TOKEN_UTI}"` }],
    ['findings.report', { objectiveId: 'count', value: '6' }],
    ['findings.report', { objectiveId: 'top', value: '/v1.0/users' }],
  ],
};
