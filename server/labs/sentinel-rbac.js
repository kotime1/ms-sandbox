import { SUB, RG, WS_ID } from '../sim/world.js';
import { visited, hasRoleCovering, anyPrivileged, subscriptionScoped } from './helpers.js';

const T1 = 'u-soc.analyst1';
const AUTHOR = 'u-soc.analyst2';
const rgScoped = (w, id, role) => w.azure.assignments.some((a) => a.principalId === id && a.role === role && (a.scope === RG || a.scope === WS_ID));

export default {
  id: 'sentinel-rbac',
  title: 'Least privilege for the SOC',
  level: 'Beginner',
  minutes: 10,
  topics: ['Sentinel roles', 'Azure RBAC', 'Least privilege'],
  examObjective: '1.x Configure and manage Microsoft Sentinel permissions',
  sourceQuestions: { set1: [8, 9], set2: [] },
  scenarios: [],
  withholdNotes: ['sentinel-roles'], // this note names the exact roles; the assistant shows it after the lab
  brief:
    'Two new people join the SOC. soc.analyst1 is a Tier 1 analyst who must triage incidents and run existing playbooks, but must not edit analytics rules or other content. ' +
    'soc.analyst2 must be able to build new playbooks (Logic Apps) for Sentinel and nothing more. Assign built-in roles at the right scope: the Sentinel workspace or its resource group, not the subscription.',

  setup() { return []; },

  objectives: [
    {
      id: 'tier1', text: 'soc.analyst1 can manage incidents and manually run playbooks (the two roles that give exactly this).',
      check: (w) => rgScoped(w, T1, 'Microsoft Sentinel Responder') && rgScoped(w, T1, 'Microsoft Sentinel Playbook Operator'),
    },
    {
      id: 'tier1-least', text: 'soc.analyst1 has nothing broader (no Contributor/Owner roles, nothing at subscription scope).',
      check: (w) => rgScoped(w, T1, 'Microsoft Sentinel Responder') && rgScoped(w, T1, 'Microsoft Sentinel Playbook Operator') && !anyPrivileged(w, T1) && !subscriptionScoped(w, T1, SUB),
    },
    {
      id: 'author', text: 'soc.analyst2 can create playbooks with the least-privileged role that allows it.',
      check: (w) => hasRoleCovering(w, AUTHOR, 'Logic App Contributor', RG) && !subscriptionScoped(w, AUTHOR, SUB) && !anyPrivileged(w, AUTHOR),
    },
  ],

  steps: [
    { text: 'Open Access control (IAM).', target: 'nav:azure/iam', done: (w) => visited(w, 'azure/iam') },
    { text: 'Add role assignments.', target: 'btn:add-role', done: (w) => rgScoped(w, T1, 'Microsoft Sentinel Responder') && hasRoleCovering(w, AUTHOR, 'Logic App Contributor', RG) },
  ],

  hints: {
    tier1: [
      'One role lets someone work incidents; another is needed to actually trigger a playbook.',
      'Read the role descriptions in the picker. Neither of them starts with "Contributor".',
      'IAM > scope rg-sentinel > Add role assignment: "Microsoft Sentinel Responder" and "Microsoft Sentinel Playbook Operator" for soc.analyst1.',
    ],
    'tier1-least': [
      'Responder + Playbook Operator is the whole answer.',
      'If you assigned a Contributor role "to be safe", remove it.',
      'Remove any extra or subscription-scoped assignment for soc.analyst1.',
    ],
    author: [
      'Playbooks are Logic Apps, so think beyond the Sentinel-prefixed roles.',
      'The role is named after Logic Apps.',
      'Assign "Logic App Contributor" to soc.analyst2 at rg-sentinel.',
    ],
  },

  debrief: [
    'Sentinel Responder lets an analyst manage incidents but not run playbooks by itself; Playbook Operator adds permission to run them manually. Sentinel Contributor would also let them edit rules and workbooks, which a Tier 1 analyst should not do.',
    'Creating playbooks is a Logic Apps permission: Logic App Contributor, not a Sentinel role.',
    'Scope matters as much as role: assign at the workspace or resource group that holds the Sentinel and playbook resources.',
  ],

  solution: () => [
    ['azure.assignRole', { scope: RG, principalId: T1, role: 'Microsoft Sentinel Responder' }],
    ['azure.assignRole', { scope: RG, principalId: T1, role: 'Microsoft Sentinel Playbook Operator' }],
    ['azure.assignRole', { scope: RG, principalId: AUTHOR, role: 'Logic App Contributor' }],
  ],
};
