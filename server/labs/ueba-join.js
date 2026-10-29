export default {
  id: 'ueba-join',
  title: 'Join behaviours to their entities',
  level: 'Intermediate',
  minutes: 15,
  topics: ['Advanced hunting', 'UEBA behaviours', 'KQL join'],
  examObjective: '3.1 Detect threats by using Microsoft Defender XDR',
  sourceQuestions: { set1: [45], set2: [44] },
  scenarios: ['ueba-behaviors'],
  withholdNotes: ['ueba'],
  answers: [{ id: 'top', label: 'Which user has the most behaviours? (UPN)', placeholder: 'user@contoso.com' }],
  brief:
    'UEBA behaviours are enabled. The BehaviorInfo table describes what happened (title, description, category) and BehaviorEntities says who and what was involved. ' +
    'In Advanced hunting, join the two tables so each row shows a behaviour title and description together with the user UPN. ' +
    'Then answer: which user has the most behaviours?',

  setup() { return ['ueba-behaviors']; },

  objectives: [
    {
      id: 'join', text: 'Run a query that joins BehaviorInfo with BehaviorEntities and returns the behaviour Title and the user AccountUpn.',
      check: (w) => w.queries.some((q) => q.surface === 'defender' && q.ops.includes('join') && q.tables.includes('BehaviorInfo') && q.tables.includes('BehaviorEntities')
        && q.columns.includes('Title') && q.columns.includes('AccountUpn') && q.records.length > 0 && q.records.every((r) => String(r.AccountUpn).includes('@'))),
    },
    {
      id: 'top', text: 'Report the user with the most behaviours (their UPN).',
      check: (w) => (w.findings.find((f) => f.objectiveId === 'top')?.value ?? '').toLowerCase() === 'mei.tan@contoso.com',
    },
  ],

  steps: [
    { text: 'Open Advanced hunting.', target: 'nav:defender/hunting', done: (w) => w.log.some((e) => e.ok && e.action === 'ui.visit' && e.params?.page === 'defender/hunting') },
    { text: 'Run a join query across the two tables.', target: 'btn:run-query', done: (w) => w.queries.some((q) => q.ops.includes('join')) },
    { text: 'Count behaviours per user and enter the answer.', target: 'btn:submit-answer', done: (w) => w.findings.some((f) => f.objectiveId === 'top') },
  ],

  hints: {
    join: [
      'Which column appears in both tables?',
      'BehaviorId links a behaviour to its entities. Entities include IPs as well as users: filter to the user rows.',
      'BehaviorInfo | join (BehaviorEntities | where EntityType == "User") on BehaviorId | project Title, Description, AccountUpn',
    ],
    top: [
      'Reuse your join, then aggregate.',
      'summarize count() by the user column, then sort descending.',
      '... | summarize Behaviors=count() by AccountUpn | sort by Behaviors desc',
    ],
  },

  debrief: [
    'BehaviorInfo holds the behaviour metadata (title, description, categories, id). BehaviorEntities holds the entities involved (users, IPs, devices). They are joined on BehaviorId.',
    'In the exam question the source for titles and descriptions is BehaviorInfo, not BehaviorEntities, and not the identity tables.',
    'When both tables have a TimeGenerated/Timestamp or BehaviorId, the right side gets a numeric suffix (BehaviorId1), as in real Kusto.',
    'join matches rows between two tables on a key; union simply stacks tables. Know which one the question is asking for.',
  ],

  solution: () => [
    ['query.run', { surface: 'defender', text: 'BehaviorInfo | join (BehaviorEntities | where EntityType == "User") on BehaviorId | project Title, Description, AccountUpn' }],
    ['findings.report', { objectiveId: 'top', value: 'mei.tan@contoso.com' }],
  ],
};
