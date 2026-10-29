import { visited } from './helpers.js';

const fav = (w) => w.sentinel.hunting.favorites;
const ranOnOpen = (w) => w.log.some((e) => e.ok && e.action === 'sentinel.openHunting') && fav(w).length === 3 && w.sentinel.hunting.queries.every((q) => q.lastRun?.count !== undefined);

export default {
  id: 'hunting-favorites',
  title: 'Queries that run when you open Hunting',
  level: 'Beginner',
  minutes: 8,
  topics: ['Hunting', 'Favorites', 'Analytics rules vs hunting queries'],
  examObjective: '3.2 Detect threats by using the Microsoft Sentinel platform',
  sourceQuestions: { set1: [], set2: [46] },
  scenarios: ['hunting-queries'],
  withholdNotes: ['hunting-favorites'],
  brief:
    'You wrote three hunting queries. You want all three to run automatically every time you open the Hunting blade, without creating any alerts or incidents. ' +
    'Set that up, then open the blade and check that each query has fresh results.',

  setup() { return ['hunting-queries']; },

  objectives: [
    { id: 'favorite', text: 'All three hunting queries are marked as favorites.', check: (w) => fav(w).length === 3 },
    // Guard objective: only counts once the favorites exist, so it cannot pass by doing nothing.
    { id: 'noalerts', text: 'You did not create an analytics rule (that would generate alerts, not run on opening the blade).', check: (w) => fav(w).length === 3 && w.sentinel.analyticsRules.length === 5 },
    { id: 'run', text: 'Open the Hunting blade and confirm every favorite ran.', check: ranOnOpen },
  ],

  steps: [
    { text: 'Open the Hunting blade.', target: 'nav:sentinel/hunting', done: (w) => visited(w, 'sentinel/hunting') },
    { text: 'Star each query to add it to Favorites.', target: 'btn:fav:hq-rareip', done: (w) => fav(w).length === 3 },
    { text: 'Reload the Hunting blade and check the results column.', target: 'nav:sentinel/hunting', done: ranOnOpen },
  ],

  hints: {
    favorite: [
      'Hunting has its own way to mark queries you care about.',
      'Look for a star next to each query.',
      'Click the star on all three queries.',
    ],
    noalerts: [
      'An analytics rule runs on a schedule and raises alerts: a different tool for a different job.',
      'You only want results when you open the blade.',
      'Do not create a rule. Favorites are what run on open.',
    ],
    run: [
      'Favorites run when the blade is opened, not when you star them.',
      'Navigate away and back, or reload the Hunting page.',
      'Open Hunting again and check the Last run / Results columns.',
    ],
  },

  debrief: [
    'Queries added to Favorites run automatically each time the Hunting blade is opened.',
    'An analytics rule runs continuously and generates alerts and incidents. Livestream gives an interactive session that notifies you on matches. Bookmarks preserve queries and results with notes. Each is a different tool.',
  ],

  solution: () => [
    ...['hq-rareip', 'hq-mfa', 'hq-roles'].map((queryId) => ['sentinel.toggleFavorite', { queryId, favorite: true }]),
    ['ui.visit', { page: 'sentinel/hunting' }],
    ['sentinel.openHunting', {}],
  ],
};
