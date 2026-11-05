import { visited, foundEquals } from './helpers.js';

// A rule the learner created that evaluates sign-in data.
const mine = (w) => w.sentinel.analyticsRules.filter((r) => r.createdByLearner && /SigninLogs/i.test(r.query ?? ''));
const everyMinute = (r) => r.schedule?.frequencyMinutes === 1 && r.schedule?.lookbackMinutes === 1 && r.schedule?.timeBasis === 'ingestion time';

export default {
  id: 'nrt-rule',
  title: 'Cut the delay between a sign-in and the alert',
  level: 'Intermediate',
  minutes: 10,
  topics: ['Analytics rule types', 'NRT rules', 'Scheduled rules', 'Ingestion time'],
  examObjective: '1.4 Configure detections',
  sourceQuestions: { set1: [], set2: [], set3: [20], set4: [], set5: [20] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'docs', note: 'NRT facts (every minute, one-minute lookback, ingestion time, two-minute delay, 50 rule limit) and the scheduled limits (5 minutes to 14 days, lookback not shorter than the interval) are from Microsoft Learn, checked 2026-11-02. The sandbox does not execute the rules on a timer.' },
  scenarios: [],
  withholdNotes: ['nrt-rules'],
  answers: [{ id: 'shortest', label: 'What is the shortest interval, in minutes, a scheduled rule can run at?', placeholder: 'minutes' }],
  brief:
    'A scheduled rule that detects suspicious sign-ins maps the Account and IP entities, but analysts hear about a bad sign-in too late. ' +
    'Create a new analytics rule over SigninLogs (for example, failed sign-ins: ResultType not equal to "0"). It has to run automatically every minute, look back one minute, ' +
    'and use ingestion time so that late-arriving events are not missed. It must keep the Account and IP entity mapping so incidents stay investigable. ' +
    'Along the way, find out what the other rule type would have allowed, and report the shortest interval a scheduled rule can run at.',

  setup() { return []; },

  objectives: [
    {
      id: 'rule', text: 'Create an analytics rule over SigninLogs that runs every minute with a one-minute lookback and evaluates ingestion time.',
      check: (w) => mine(w).some(everyMinute),
    },
    {
      // Guard: gated on the rule so it cannot pass by doing nothing.
      id: 'mapping', text: 'The new rule keeps entity mapping on.',
      check: (w) => mine(w).some((r) => everyMinute(r) && r.entityMapping === true),
    },
    { id: 'shortest', text: 'Report the shortest interval, in minutes, that a scheduled rule can run at.', check: (w) => foundEquals(w, 'shortest', 5) },
  ],

  steps: [
    { text: 'Open Analytics.', target: 'nav:sentinel/analytics', done: (w) => visited(w, 'sentinel/analytics') },
    { text: 'Start creating a rule.', target: 'btn:create-analytics-rule', done: (w) => mine(w).length > 0 || w.log.some((e) => e.action === 'sentinel.createAnalyticsRule') },
    { text: 'Choose the rule type that meets the timing requirements, fill it in and create it.', target: 'btn:save-analytics-rule', done: (w) => mine(w).some(everyMinute) },
    { text: 'Enter the shortest scheduled interval in the Answer box.', target: 'btn:submit-answer', done: (w) => w.findings.some((f) => f.objectiveId === 'shortest') },
  ],

  hints: {
    rule: [
      'Two analytics rule types let you write your own query. Compare what each one lets you set for how often it runs and how far back it looks.',
      'One type has those settings fixed by design, and it uses a different clock than the event timestamp. Open + Create and read both descriptions.',
      'Create a near-real-time (NRT) query rule. It has no scheduling controls: it always runs every minute with a one-minute lookback on ingestion time.',
    ],
    mapping: [
      'Incidents are only investigable in the graph if the rule maps entities.',
      'The create form has a switch for it.',
      'Leave "Map entities" ticked when you create the rule.',
    ],
    shortest: [
      'Try the other rule type and ask it for the shortest interval you can think of.',
      'The error message names the allowed range.',
      'A scheduled rule runs every 5 minutes at the most frequent. Try 1 minute in a scheduled rule and read the message.',
    ],
  },

  debrief: [
    'NRT rules are hard-coded to run once a minute and look at the previous minute. They query ingestion time (when the event reached the workspace), not the event timestamp, so a log source with a delay does not hide events. That is why the exam answer for "every minute, one-minute lookback, ingestion time" is NRT.',
    'Scheduled rules are flexible (5 minutes to 14 days, lookback at least as long as the interval) and use the event time (TimeGenerated) after a built-in five-minute delay. They cannot run every minute.',
    'Both types support entity mapping, custom details and alert enrichment, and automation rules and playbooks attach to either. NRT is limited to 50 rules per customer, handles up to 30 single-event alerts per run, and suits sources with an ingestion delay under 12 hours.',
    'The other options in the question do not fit: a Microsoft security rule only picks a product and filters (no timing), and an ML behavior analytics rule is a Microsoft algorithm with no logic you can configure.',
  ],

  solution: () => [
    ['sentinel.createAnalyticsRule', { kind: 'Scheduled', name: 'Failed sign-ins (too slow)', severity: 'Medium', query: 'SigninLogs | where ResultType != "0"', frequencyMinutes: 1, lookbackMinutes: 1 }, { fails: /cannot run every minute/ }],
    ['sentinel.createAnalyticsRule', { kind: 'NRT', name: 'Failed sign-ins (NRT)', severity: 'Medium', query: 'SigninLogs | where ResultType != "0"', entityMapping: true }],
    ['findings.report', { objectiveId: 'shortest', value: '5' }],
  ],
};
