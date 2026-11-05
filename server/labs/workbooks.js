import { RG, WS_ID } from '../sim/world.js';
import { visited, foundEquals } from './helpers.js';

const mine = (w) => w.sentinel.workbooks;
const fromTemplate = (w, tpl) => mine(w).filter((b) => b.template === tpl);
// A workbook the learner has taken all the way through: saved, opened, edited and the edit finished (revision 2+).
const edited = (b) => b.viewed && !b.editing && b.revision >= 2;
const hasTimechart = (b) => (b.tiles ?? []).some((t) => /\brender\s+timechart\b/i.test(t.query));

export default {
  id: 'workbooks',
  title: 'Build the SOC manager a workbook',
  level: 'Beginner',
  minutes: 15,
  topics: ['Sentinel workbooks', 'Templates', 'Workbook roles', 'KQL render'],
  examObjective: '1.x Visualize data in Microsoft Sentinel',
  sourceQuestions: { set1: [10, 11, 12], set2: [11, 12, 13], set3: [8], set4: [7, 8, 9, 10, 11], set5: [10, 11] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'partial', note: 'The Templates / My workbooks flow (Save, View saved workbook, Edit, Save as, Done editing), the Security operations efficiency metric list and the Workbook Reader/Contributor prerequisite are from Microsoft Learn, checked 2026-11-02. The rule "Sentinel Contributor, or a lesser Sentinel role plus Workbook Contributor" comes from the practice question. The other template metric lists are summaries, and the editor is much simpler than the real workbook editor.' },
  scenarios: [],
  withholdNotes: ['workbooks'],
  answers: [{ id: 'authors', label: 'Which of User1 to User4 can add a workbook? (names, comma separated)', placeholder: 'User1, ...' }],
  brief:
    'The SOC manager wants a Sentinel workbook showing incidents created over time and mean time to triage, built from a template so that it takes the least effort. ' +
    'Save the right template, open it and edit it: add a query that charts sign-ins over time, then finish editing so the change is saved. Also keep an untouched copy of the template-based workbook, for the next manager. ' +
    'Then check Access control (IAM): four people have roles on the Sentinel resource group, and you were asked to delegate adding workbooks. Report which of them can add one.',

  setup(w) {
    // Q8: Owner, Responder, Contributor, and Reader + Workbook Contributor on the Sentinel resource group.
    // They are put in the directory so the IAM picker can list them (user1 already exists from the sign-in data).
    for (const n of [2, 3, 4]) w.directory.users.push({ id: `u-user${n}`, name: `User${n}`, upn: `user${n}@contoso.com`, entraRole: 'None', roleGroup: 'None' });
    const give = (id, name, role) => w.azure.assignments.push({ id: `seed-${id}-${role}`, scope: RG, principalId: id, principalName: name, role, createdBy: 'system' });
    give('u-user1', 'user1@contoso.com', 'Owner');
    give('u-user2', 'user2@contoso.com', 'Microsoft Sentinel Responder');
    give('u-user3', 'user3@contoso.com', 'Microsoft Sentinel Contributor');
    give('u-user4', 'user4@contoso.com', 'Microsoft Sentinel Reader');
    give('u-user4', 'user4@contoso.com', 'Workbook Contributor');
    return [];
  },

  objectives: [
    {
      id: 'template', text: 'Save the workbook template that already contains incidents created over time and mean time to triage.',
      check: (w) => fromTemplate(w, 'tpl-soc-efficiency').length > 0,
    },
    {
      id: 'edit', text: 'Open that workbook, add a query that draws a time chart, and finish editing so the change is saved.',
      check: (w) => fromTemplate(w, 'tpl-soc-efficiency').some((b) => edited(b) && hasTimechart(b)),
    },
    {
      // Templates are read-only. The way to keep an unmodified copy is to clone BEFORE editing, so this needs a second workbook
      // that came from a clone and has no custom tiles.
      id: 'copy', text: 'Keep a second, untouched copy of the workbook for the next manager.',
      check: (w) => mine(w).some((b) => b.clonedFrom && (b.tiles ?? []).length === 0 && b.template === 'tpl-soc-efficiency'),
    },
    { id: 'authors', text: 'Report which of the four users can add a workbook.', check: (w) => foundEquals(w, 'authors', 'user1, user3, user4') },
  ],

  steps: [
    { text: 'Open Workbooks.', target: 'nav:sentinel/workbooks', done: (w) => visited(w, 'sentinel/workbooks') },
    { text: 'Open the template and save it.', target: 'btn:save-template', done: (w) => fromTemplate(w, 'tpl-soc-efficiency').length > 0 },
    { text: 'Save a copy before you change anything.', target: 'btn:save-as', done: (w) => mine(w).some((b) => b.clonedFrom) },
    { text: 'Edit the workbook, add a time-chart query and finish editing.', target: 'btn:done-editing', done: (w) => fromTemplate(w, 'tpl-soc-efficiency').some((b) => edited(b)) },
    { text: 'Check IAM, then enter who can add workbooks.', target: 'btn:submit-answer', done: (w) => w.findings.some((f) => f.objectiveId === 'authors') },
  ],

  hints: {
    template: [
      'Read the metrics list on each template before you save one. Two templates sound close.',
      'One template is about the incident queue as it stands; the other is about how the SOC performs over time.',
      'Save "Security operations efficiency". It lists incidents created over time and mean time to triage.',
    ],
    edit: [
      'A saved workbook starts read-only too. What do you need to press before you can add content?',
      'View the saved workbook, press Edit, add a query, then Done editing. The edit only counts once it is saved.',
      'In the query use render timechart, e.g. SigninLogs | summarize count() by bin(TimeGenerated, 1d) | render timechart.',
    ],
    copy: [
      'Which button creates a duplicate of a workbook under another name?',
      'It is on the workbook toolbar. Use it before you edit so the copy stays untouched.',
      'Save as, on the workbook you saved from the template, before pressing Edit.',
    ],
    authors: [
      'Look at Access control (IAM) on the Sentinel resource group. Note each person\'s roles.',
      'Creating or deleting a workbook needs Sentinel Contributor, or Owner, or a lesser Sentinel role plus one more role that is only for workbooks.',
      'Owner, Contributor and Reader + Workbook Contributor can. A Responder alone cannot.',
    ],
  },

  debrief: [
    'Use a template when one exists: the Security operations efficiency workbook already has incidents created over time, mean time to triage, mean time to closure and more, which the Incident Overview template does not. Matching the metrics to the template is the whole exam question.',
    'Templates are read-only. You Save one to create a workbook resource (My workbooks), then View saved workbook and Edit it. To keep a pristine copy, use Save as before you edit. Done editing is what saves your changes.',
    'render turns a query result into a chart: render timechart for values over time. print, project, extend and summarize do not draw anything.',
    'Creating or deleting a workbook needs Microsoft Sentinel Contributor (or Owner), or a lesser Sentinel role together with Workbook Contributor. Workbook Contributor is only needed to create and delete; viewing needs just a reader role. A Sentinel Responder manages incidents, not workbooks.',
    'A workbook is for visualizing data over time, a notebook is for programmatic hunting and investigation, a hunting query is a saved search, and a playbook is automation.',
  ],

  // Workbook ids are wb-<counter>, assigned in order: the saved template is first, its untouched copy is the next one.
  solution: (w) => {
    const first = `wb-${w.counters.rule}`;
    return [
      ['sentinel.saveWorkbookTemplate', { template: 'tpl-soc-efficiency', name: 'SOC efficiency' }],
      ['sentinel.cloneWorkbook', { id: first, name: 'SOC efficiency (clean copy)' }],
      ['sentinel.viewWorkbook', { id: first }],
      ['sentinel.editWorkbook', { id: first }],
      ['sentinel.addWorkbookTile', { id: first, title: 'Sign-ins over time', query: 'SigninLogs | summarize Signins=count() by bin(TimeGenerated, 1d) | render timechart' }],
      ['sentinel.doneEditingWorkbook', { id: first }],
      ['findings.report', { objectiveId: 'authors', value: 'User1, User3, User4' }],
    ];
  },
};
