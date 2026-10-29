const rule = (w) => w.sentinel.summaryRules[0];
// The learner chooses the destination name, so check against whatever their own rule created.
const summaryQueried = (w) => w.sentinel.summaryRules.some((r) => w.queries.some((q) => q.surface === 'sentinel' && q.tables.includes(r.destination) && q.records.length > 0));
const rawTimedOut = (w) => w.log.some((e) => !e.ok && e.action === 'query.run' && /timed out/.test(e.error ?? ''));

export default {
  id: 'summary-rule',
  title: 'Queries that time out',
  level: 'Intermediate',
  minutes: 15,
  topics: ['Summary rules', 'High-volume tables', 'KQL performance'],
  examObjective: '3.2 Detect threats by using the Microsoft Sentinel platform',
  sourceQuestions: { set1: [49], set2: [49, 50] },
  scenarios: ['high-volume-network'],
  withholdNotes: ['summary-rules'],
  brief:
    'Network sessions are ingested into NetworkSessions_CL at a very high volume. Analysts who aggregate it interactively over several days get time-outs. ' +
    'Reproduce the problem, then fix it for good: run a scheduled aggregation that stores a small summary in a new custom table, and get the analysts querying that table instead.',

  setup() { return ['high-volume-network']; },

  objectives: [
    { id: 'repro', text: 'Reproduce the time-out by aggregating NetworkSessions_CL interactively.', check: rawTimedOut },
    { id: 'rule', text: 'Create a summary rule that aggregates by source IP and destination port into a new custom table ending in _CL.', check: (w) => Boolean(rule(w)) && rule(w).source === 'NetworkSessions_CL' && rule(w).query.includes('summarize') },
    { id: 'query', text: 'Query the summary table successfully and get results.', check: summaryQueried },
  ],

  steps: [
    { text: 'Open the Logs blade and aggregate NetworkSessions_CL.', target: 'nav:sentinel/logs', done: rawTimedOut },
    { text: 'Create a summary rule.', target: 'btn:create-summary-rule', done: (w) => Boolean(rule(w)) },
    { text: 'Query the new summary table.', target: 'btn:run-query', done: summaryQueried },
  ],

  hints: {
    repro: [
      'The raw table is big. What happens if you ask it to count everything?',
      'Try a summarize over the last 7 days.',
      'NetworkSessions_CL | summarize count() by SourceIP, DestinationPort',
    ],
    rule: [
      'The goal is to pay the aggregation cost once, on a schedule, and keep the result.',
      'Sentinel has a feature that runs a KQL aggregation on a schedule and writes to a custom table.',
      'Summary rules: source NetworkSessions_CL, query ... | summarize Sessions=count(), TotalBytes=sum(Bytes) by bin(TimeGenerated, 1h), SourceIP, DestinationPort, destination NetworkSessionSummary_CL.',
    ],
    query: [
      'The summary table is small and fast.',
      'Use the table name you gave the rule as the destination.',
      'NetworkSessionSummary_CL | summarize sum(Sessions) by SourceIP',
    ],
  },

  debrief: [
    'A summary rule runs a scheduled KQL aggregation and writes the result to a custom (_CL) analytics-tier table. Analysts then query the small summary instead of the raw firehose.',
    'Scheduled analytics rules produce alerts and incidents, not summary tables. Search jobs retrieve data from large historical sets into a results table but do not maintain recurring aggregations. KQL jobs run asynchronously against the data lake.',
    'When the question says analysts need seven days of trends without time-outs, the table to query is the summary destination table, never the raw one.',
  ],

  solution: () => [
    ['query.run', { surface: 'sentinel', text: 'NetworkSessions_CL | summarize count() by SourceIP, DestinationPort' }, { fails: /timed out/ }],
    ['sentinel.createSummaryRule', {
      name: 'Hourly session summary', source: 'NetworkSessions_CL', destination: 'NetworkSessionSummary_CL', binMinutes: '60',
      query: 'NetworkSessions_CL | summarize Sessions=count(), TotalBytes=sum(Bytes) by bin(TimeGenerated, 1h), SourceIP, DestinationPort',
    }],
    ['query.run', { surface: 'sentinel', text: 'NetworkSessionSummary_CL | summarize Total=sum(Sessions) by SourceIP' }],
  ],
};
