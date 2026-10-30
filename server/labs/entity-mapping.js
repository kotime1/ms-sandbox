import { visited, foundEquals } from './helpers.js';

const ids = (w, name) => w.sentinel.incidents.find((i) => i.title.startsWith(name));

export default {
  id: 'entity-mapping',
  title: 'Which incidents can you actually investigate?',
  level: 'Intermediate',
  minutes: 12,
  topics: ['Analytics rule types', 'Entity mapping', 'Investigation graph'],
  examObjective: '1.4 Configure detections',
  sourceQuestions: { set1: [19, 20], set2: [19, 20, 21] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: "partial", note: "Entity mapping on scheduled rules matches Learn. \"Only scheduled and NRT\" is from the practice question; the Learn page covers scheduled rules." },
  scenarios: ['rule-types-incidents'],
  withholdNotes: ['entity-mapping'],
  answers: [{ id: 'answer', label: 'Which rule types produce investigable incidents?', placeholder: 'e.g. Fusion, ML' }],
  brief:
    'Four incidents were raised, each by a different analytics rule type: scheduled, near-real-time (NRT), fusion and a Microsoft incident-creation rule. ' +
    'Your manager wants to know which of them have entities you can pivot on in the investigation graph. Open each incident and each rule, work out which rule types support entity mapping, ' +
    'then report the answer. Finally, switch off entity mapping on the scheduled rule and watch its next incident lose its entities.',

  setup() { return ['rule-types-incidents']; },

  objectives: [
    { id: 'incidents', text: 'Open all four incidents and compare their entities.', check: (w) => ['sentinel/incidents'].every((p) => visited(w, p)) && w.sentinel.incidents.length === 4 && w.log.filter((e) => e.ok && e.action === 'sentinel.viewIncident').length >= 4 },
    { id: 'answer', text: 'Report which rule types produce investigable incidents (enter the rule names in the Answer box, separated by commas).', check: (w) => foundEquals(w, 'answer', 'scheduled, nrt') },
    { id: 'toggle', text: 'Disable entity mapping on the scheduled rule and confirm that its incidents are no longer investigable.', check: (w) => w.sentinel.analyticsRules.find((r) => r.id === 'rule-sch1')?.entityMapping === false },
  ],

  steps: [
    { text: 'Open the Incidents page.', target: 'nav:sentinel/incidents', done: (w) => visited(w, 'sentinel/incidents') },
    { text: 'Open each incident and note whether it has entities.', target: 'row:incident-first', done: (w) => w.log.filter((e) => e.ok && e.action === 'sentinel.viewIncident').length >= 4 },
    { text: 'Open Analytics and review each rule type.', target: 'nav:sentinel/analytics', done: (w) => visited(w, 'sentinel/analytics') },
    { text: 'Enter your answer in the Answer box.', target: 'btn:submit-answer', done: (w) => foundEquals(w, 'answer', 'scheduled, nrt') },
  ],

  hints: {
    incidents: [
      'Entities are shown in the incident detail.',
      'Click a row to open the detail pane; do it for all four.',
      'Look at the Entities section: two of the four have none.',
    ],
    answer: [
      'Entities come from mapping fields in the rule. Which rule types let you configure that?',
      'Rules built on Microsoft algorithms or Microsoft alerts have no editable mapping.',
      'Answer with the two rule types that expose entity mapping.',
    ],
    toggle: [
      'The mapping is a setting on the rule itself.',
      'Open the scheduled rule in Analytics.',
      'Analytics > the scheduled rule > Entity mapping: Off. Only scheduled and NRT rules offer this.',
    ],
  },

  debrief: [
    'Entity mapping, which turns query columns into accounts, hosts and IPs, exists only in scheduled and NRT analytics rules. Incidents from fusion, ML behaviour analytics and Microsoft incident-creation rules arrive with whatever entities their source provided.',
    'The investigation graph needs entities to pivot on. Without mapping there is nothing to expand, so those incidents cannot be investigated with it.',
    'A Microsoft incident-creation rule only chooses the product and severity filter: no query, alert details or entity mapping.',
  ],

  solution: () => [
    ...['inc-1040', 'inc-1041', 'inc-1042', 'inc-1043'].map((incidentId) => ['sentinel.viewIncident', { incidentId }]),
    ['ui.visit', { page: 'sentinel/incidents' }],
    ['findings.report', { objectiveId: 'answer', value: 'Scheduled, NRT' }],
    ['sentinel.setEntityMapping', { ruleId: 'rule-sch1', enabled: false }],
  ],
};

export { ids };
