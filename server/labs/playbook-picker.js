import { RG, ASI_PRINCIPAL, VM1_ID, resource } from '../sim/world.js';
import { visited } from './helpers.js';

const PB = `${RG}/providers/Microsoft.Logic/workflows/Play1`;
const asiRoles = (w) => w.azure.assignments.filter((a) => a.principalId === ASI_PRINCIPAL);
const good = (w) => asiRoles(w).some((a) => a.role === 'Microsoft Sentinel Automation Contributor' && a.scope === RG);
const ranFromAutomation = (w) => w.sentinel.runs.some((r) => r.playbookId === PB && r.by.startsWith('automation:') && r.status === 'Succeeded');

export default {
  id: 'playbook-picker',
  title: 'The playbook that is not in the list',
  level: 'Intermediate',
  minutes: 15,
  topics: ['Sentinel automation', 'Azure RBAC', 'Azure Security Insights', 'Least privilege'],
  examObjective: '1.x Configure automation (playbook permissions for Sentinel)',
  sourceQuestions: { set1: [5, 18], set2: [10, 18] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: "docs", note: "Matches Learn: Sentinel runs playbooks from automation rules as its own service account, needing the Automation Contributor role on the resource group; unavailable playbooks are greyed out with a Manage playbook permissions link (Owner needed). That a role on the playbook itself, or Logic App Contributor, does not help comes from the practice question; the docs only state the resource-group grant." },
  scenarios: ['playbook-picker'],
  withholdNotes: ['asi-role', 'sentinel-roles'], // sentinel-roles also names the Automation Contributor role
  brief:
    'You built an incident-trigger playbook named Play1 in resource group rg-sentinel and want an automation rule to run it. ' +
    'In the automation rule dialog, Play1 is greyed out and cannot be selected. Make it selectable so that Microsoft Sentinel itself can run it, ' +
    'using the least privilege that works. Then create the automation rule and confirm it runs.',

  setup(w) {
    w.azure.resources.push({
      id: PB, name: 'Play1', type: 'Microsoft.Logic/workflows', rg: 'rg-sentinel', location: 'eastus',
      playbook: { trigger: 'incident', actions: [{ type: 'incident.comment', label: 'Add comment to incident', text: 'Play1 ran from an automation rule.' }] },
      identity: { systemAssigned: true, principalId: 'mi-play1' },
    });
    return ['playbook-picker'];
  },

  objectives: [
    { id: 'role', text: 'Play1 becomes selectable, so that Microsoft Sentinel itself is permitted to run playbooks in rg-sentinel.', check: good },
    { id: 'least', text: 'You granted the least privilege that works: one role, at the narrowest scope that makes it work.', check: (w) => good(w) && asiRoles(w).length === 1 },
    { id: 'rule', text: 'An automation rule runs Play1 for new incidents.', check: (w) => w.sentinel.automationRules.some((r) => r.actions.some((a) => a.playbookId === PB)) },
    { id: 'run', text: 'Play1 runs successfully from the automation rule on a new incident.', check: ranFromAutomation },
  ],

  steps: [
    { text: 'Open Sentinel > Automation and start creating an automation rule.', target: 'nav:sentinel/automation', done: (w) => visited(w, 'sentinel/automation') },
    { text: 'Open Access control (IAM) at the rg-sentinel resource group.', target: 'nav:azure/iam', done: (w) => visited(w, 'azure/iam') },
    { text: 'Assign the Sentinel automation role to the Azure Security Insights service principal at rg-sentinel.', target: 'btn:add-role', done: good },
    { text: 'Create the automation rule for Play1.', target: 'btn:create-automation', done: (w) => w.sentinel.automationRules.some((r) => r.actions.some((a) => a.playbookId === PB)) },
    { text: 'Replay the simulation to raise a new incident and watch the rule run.', target: 'btn:run-sim:playbook-picker', done: ranFromAutomation },
  ],

  hints: {
    role: [
      'Who actually runs a playbook from an automation rule: you, the Logic App, or Sentinel?',
      'Sentinel uses its own service identity (Azure Security Insights). It needs a role where the playbook lives.',
      'Two routes: in the automation rule panel, the greyed-out playbook has a "Manage playbook permissions" link (needs Owner on the resource group); or IAM > rg-sentinel > Add role assignment > "Microsoft Sentinel Automation Contributor" > member: Azure Security Insights. Scope matters: a role on Play1 itself is not enough.',
    ],
    least: [
      'One role at one scope is the whole answer.',
      'Logic App Contributor sounds relevant but does not make the playbook selectable.',
      'Remove anything extra you assigned to Azure Security Insights.',
    ],
    rule: [
      'Automation rules are created from the Automation blade.',
      'Pick the trigger "When incident is created" and add a "Run playbook" action.',
      'Automation > Create > Automation rule: name it, trigger "When incident is created", action Run playbook: Play1, then Apply. Conditions are optional.',
    ],
    run: [
      'The rule only fires for incidents created after it exists.',
      'Use the replay button in the lab panel.',
      'Replay: Incident ready; playbook cannot be selected. Then open the incident and check the run history.',
    ],
  },

  debrief: [
    'To run an incident-trigger playbook (manually or from an automation rule), Microsoft Sentinel needs explicit permission: delegate Microsoft Sentinel Automation Contributor to the Azure Security Insights service principal on the resource group that holds the playbook. In the automation rule panel, playbooks Sentinel cannot run are greyed out ("unavailable") and the Manage playbook permissions link grants it for you; doing that needs the Owner role on the resource group.',
    'Granting the role on the playbook resource itself, or granting Logic App Contributor, leaves the playbook unavailable in the picker. Granting Owner or Contributor would work but violates least privilege.',
    'Contrast with the other playbook permission trap: when the playbook acts on an Azure resource (restarting a VM) it uses its own managed identity, which needs a role on that resource. Different identity, different role, different scope.',
  ],

  solution: (w) => [
    ['azure.assignRole', { scope: RG, principalId: ASI_PRINCIPAL, role: 'Microsoft Sentinel Automation Contributor' }],
    ['sentinel.createAutomationRule', { name: 'Run Play1 on new incidents', ruleIds: ['rule-sch1'], playbookId: PB }],
    ['attack.run', { scenario: 'playbook-picker' }],
  ],
};

export { VM1_ID, resource };
