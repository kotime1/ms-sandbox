import { SUB, RG, VM1_ID, WS_ID, LEARNER, resource, can } from '../sim/world.js';
import { visited, assignmentsFor, anyPrivileged, subscriptionScoped } from './helpers.js';

export const PB1 = `${RG}/providers/Microsoft.Logic/workflows/Playbook1`;
const PB1_PRINCIPAL = 'mi-playbook1';

const pb = (w) => resource(w, PB1);
const ranOk = (w) => w.sentinel.runs.some((r) => r.playbookId === PB1 && r.by === LEARNER && r.status === 'Succeeded');

export default {
  id: 'playbook-permissions',
  title: 'The containment playbook that will not run',
  level: 'Intermediate',
  minutes: 20,
  topics: ['Sentinel automation', 'Playbooks', 'Managed identity', 'Azure RBAC'],
  examObjective: '1.x / 2.x Configure automation; playbook triggers and permissions',
  sourceQuestions: { set1: [5, 6, 7, 18], set2: [7, 8, 9, 18] },
  scenarios: ['vm-compromise-incident'],
  brief:
    'A High-severity incident was raised for suspicious activity on VM1. Your team built a Logic App named Playbook1 that restarts VM1 to contain the host and adds a comment to the incident. ' +
    'An analyst says it is not offered under the incident\'s Actions menu, and when it was run earlier it failed. Get Playbook1 running manually from the incident, using the least privilege that works.',

  setup(w) {
    w.azure.resources.push({
      id: PB1, name: 'Playbook1', type: 'Microsoft.Logic/workflows', rg: 'rg-sentinel', location: 'eastus',
      playbook: {
        trigger: 'alert',
        actions: [
          { type: 'vm.restart', label: 'Restart virtual machine VM1', target: VM1_ID },
          { type: 'incident.comment', label: 'Add comment to incident', text: 'Containment playbook completed: VM1 restarted.' },
        ],
      },
      identity: { systemAssigned: false, principalId: PB1_PRINCIPAL },
    });
    return ['vm-compromise-incident'];
  },

  objectives: [
    { id: 'trigger', text: 'Playbook1 can be run from an incident (it uses the Microsoft Sentinel incident trigger).', check: (w) => pb(w)?.playbook.trigger === 'incident' },
    { id: 'identity', text: 'Playbook1 has a managed identity to authenticate to Azure.', check: (w) => Boolean(pb(w)?.identity?.systemAssigned) },
    { id: 'rbac', text: 'Playbook1\'s identity is allowed to restart VM1.', check: (w) => Boolean(pb(w)?.identity?.systemAssigned) && can(w, PB1_PRINCIPAL, 'vm.restart', VM1_ID) },
    {
      id: 'least', text: 'The access you granted follows least privilege (no Owner/Contributor, nothing at subscription scope).',
      check: (w) => Boolean(pb(w)?.identity?.systemAssigned) && can(w, PB1_PRINCIPAL, 'vm.restart', VM1_ID) && !anyPrivileged(w, PB1_PRINCIPAL) && !subscriptionScoped(w, PB1_PRINCIPAL, SUB),
    },
    { id: 'run', text: 'Run Playbook1 manually from the incident and see it succeed.', check: (w) => ranOk(w) && (resource(w, VM1_ID)?.restarts ?? 0) >= 1 },
    {
      id: 'automation', optional: true, text: 'Bonus: make NRTRule1 run Playbook1 automatically by adding an automation rule.',
      check: (w) => w.sentinel.automationRules.some((r) => r.ruleIds.includes('rule-nrt1') && r.actions.some((a) => a.type === 'runPlaybook' && a.playbookId === PB1)),
    },
  ],

  steps: [
    { text: 'Open the Azure portal resources list.', target: 'nav:azure/resources', done: (w) => visited(w, 'azure/resources') },
    { text: 'Open Playbook1.', target: 'row:Playbook1', done: (w) => visited(w, 'azure/logicapp/playbook1') },
    { text: 'Switch the trigger to the Microsoft Sentinel incident trigger and save.', target: 'btn:set-trigger-incident', done: (w) => pb(w)?.playbook.trigger === 'incident' },
    { text: 'Turn on the system-assigned managed identity and save.', target: 'btn:identity-on', done: (w) => Boolean(pb(w)?.identity?.systemAssigned) },
    { text: 'Open Access control (IAM).', target: 'nav:azure/iam', done: (w) => visited(w, 'azure/iam') },
    { text: 'Add a role assignment for the playbook\'s identity at VM1 scope.', target: 'btn:add-role', done: (w) => can(w, PB1_PRINCIPAL, 'vm.restart', VM1_ID) },
    { text: 'Open Microsoft Sentinel incidents.', target: 'nav:sentinel/incidents', done: (w) => visited(w, 'sentinel/incidents') },
    { text: 'Open the VM1 incident.', target: 'row:incident-first', done: (w) => w.sentinel.incidents.some((i) => i.runs.length) },
    { text: 'Actions > Run playbook > Run on Playbook1.', target: 'btn:incident-actions', done: (w) => ranOk(w) },
  ],

  hints: {
    trigger: [
      'Think about which Sentinel trigger gives a playbook an incident object to work with.',
      'Open the Logic App in the Azure portal and look at how it is triggered.',
      'Azure portal > Resources > Playbook1 > set the trigger to "Microsoft Sentinel incident", then Save.',
    ],
    identity: [
      'A playbook that changes Azure resources needs something to authenticate as.',
      'Look for an Identity section on the Logic App.',
      'On Playbook1, set System assigned to On and Save.',
    ],
    rbac: [
      'Who needs access to VM1: the analyst, the VM, or the playbook? Permissions flow from the caller to the target.',
      'Access control (IAM) lets you add a role assignment; the member is a managed identity.',
      'IAM > pick the VM1 scope > Add role assignment > "Virtual Machine Contributor" > member: Playbook1 (managed identity).',
    ],
    least: [
      'The smallest role that can restart a VM, at the smallest scope that contains it.',
      'Is Contributor or a subscription-wide assignment really necessary?',
      'Remove broad assignments for Playbook1 and keep Virtual Machine Contributor at VM1.',
    ],
    run: [
      'Playbooks are run manually from the incident itself.',
      'Open the incident and look at the Actions menu.',
      'Sentinel > Incidents > open the VM1 incident > Actions > Run playbook > Playbook1 > Run. Check the incident\'s run history.',
    ],
    automation: [
      'Which Sentinel feature runs a playbook whenever an analytics rule creates an incident?',
      'It lives under Automation.',
      'Automation > Create > Automation rule: condition = analytics rule NRTRule1, action = Run playbook Playbook1.',
    ],
  },

  debrief: [
    'Playbooks are Azure Logic Apps. A playbook that starts from "Microsoft Sentinel incident" can be attached to automation rules and run from an incident\'s Actions menu; the alert trigger is for running on alerts.',
    'A playbook acts on Azure resources with its own managed identity. The identity needs an Azure RBAC role on the target (here VM1); the VM needs nothing, and the analyst\'s role does not matter to the playbook\'s actions.',
    'Assign the narrowest built-in role at the narrowest scope. Virtual Machine Contributor at VM1 is enough to restart it; Owner or a subscription-wide role would also work, which is exactly why it is wrong.',
    'NRT and scheduled rules reach playbooks through automation rules (incident trigger). "Alert automation (classic)" is only for playbooks with the alert trigger.',
  ],

  // Used by tests only. Never serialised to the client.
  solution: (w) => [
    ['logicapp.setTrigger', { resourceId: PB1, trigger: 'incident' }],
    ['logicapp.setIdentity', { resourceId: PB1, systemAssigned: true }],
    ['azure.assignRole', { scope: VM1_ID, principalId: PB1_PRINCIPAL, role: 'Virtual Machine Contributor' }],
    ['sentinel.runPlaybook', { playbookId: PB1, incidentId: w.sentinel.incidents[0].id }],
    ['sentinel.createAutomationRule', { name: 'Contain NRTRule1 incidents', ruleIds: ['rule-nrt1'], playbookId: PB1 }],
  ],
};

export { WS_ID, assignmentsFor };
