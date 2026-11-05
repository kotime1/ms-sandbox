import { visited } from './helpers.js';

const onPrem = (w) => w.sentinel.machines.filter((m) => m.kind === 'On-premises');
const azure = (w) => w.sentinel.machines.filter((m) => m.kind === 'Azure VM');
const allCollecting = (w) => w.sentinel.machines.length > 0 && w.sentinel.machines.every((m) => m.collecting);

export default {
  id: 'arc-servers',
  title: 'Why are my on-premises servers missing from the picker?',
  level: 'Beginner',
  minutes: 10,
  topics: ['Azure Arc', 'Azure Monitor Agent', 'Data collection rules', 'Windows Security Events'],
  examObjective: '1.3 Ingest data into the Microsoft Sentinel SIEM and platform',
  sourceQuestions: { set1: [13], set2: [15], set3: [], set4: [], set5: [14] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'docs', note: 'That a system that is not an Azure VM must have Azure Arc installed and enabled before an Azure Monitor Agent connector works, that the resource picker lists Azure VMs and Azure Arc-enabled servers, and that the rule may sit in any resource group in the same tenant, are from Microsoft Learn (connect-services-windows-based), checked 2026-11-04. The sandbox models six machines, not a full fleet, and none of the agent installation itself.' },
  scenarios: [],
  withholdNotes: ['arc-servers'],
  brief:
    'You are using the Windows Security Events via AMA connector to collect security events from your Windows servers: some are Azure virtual machines and some run on-premises. ' +
    'When you create the data collection rule, the on-premises servers do not appear in the machine picker. ' +
    'Work out what is missing, fix it, and get all six servers collecting. Several things sound plausible, so try them and read what the portal says. ' +
    'Pay attention to what a tempting fix actually changes.',

  setup(w) {
    w.sentinel.machines.push(
      { name: 'AZ-WEB01', kind: 'Azure VM', arc: false, collecting: false },
      { name: 'AZ-WEB02', kind: 'Azure VM', arc: false, collecting: false },
      { name: 'AZ-DB01', kind: 'Azure VM', arc: false, collecting: false },
      { name: 'ONPREM-FS01', kind: 'On-premises', arc: false, collecting: false },
      { name: 'ONPREM-DC01', kind: 'On-premises', arc: false, collecting: false },
      { name: 'ONPREM-APP01', kind: 'On-premises', arc: false, collecting: false },
    );
    return [];
  },

  objectives: [
    { id: 'arc', text: 'All three on-premises servers can be targeted by a data collection rule.', check: (w) => onPrem(w).length > 0 && onPrem(w).every((m) => m.arc) },
    { id: 'collect', text: 'All six servers are collecting Windows security events.', check: (w) => allCollecting(w) },
    {
      // Restraint: Azure VMs are already Azure resources; the fix is not to install anything on them or to rebuild the rule per fleet.
      id: 'minimal', text: 'The Azure virtual machines were not given an Azure Arc agent.', check: (w) => allCollecting(w) && azure(w).every((m) => !m.arc),
    },
  ],

  steps: [
    { text: 'Open Data connectors.', target: 'nav:sentinel/connectors', done: (w) => visited(w, 'sentinel/connectors') },
    { text: 'Install the missing agent on the on-premises servers.', target: 'btn:install-arc:ONPREM-FS01', done: (w) => onPrem(w).every((m) => m.arc) },
    { text: 'Create the data collection rule for all servers.', target: 'btn:add-dcr-machines', done: (w) => allCollecting(w) },
  ],

  hints: {
    arc: [
      'Look at what the picker says it lists. What are the two kinds of machine it offers?',
      'A machine that is not an Azure VM has to become an Azure resource before a rule can target it. Which agent does that?',
      'Install the Azure Connected Machine agent (Azure Arc) on each on-premises server.',
    ],
    collect: [
      'Once the servers are in the picker, create the rule and select all of them.',
      'Choose a region for the rule: it must match the workspace.',
      'Add data collection rule > tick all six machines > region eastus > Create.',
    ],
    minimal: [
      'Which machines are already Azure resources?',
      'Azure VMs do not need an Arc agent, and the portal will say so if you try.',
      'Install the agent only on the three on-premises servers.',
    ],
  },

  debrief: [
    'A server that is not an Azure virtual machine (a physical server, an on-premises VM, or a VM in another cloud) must have Azure Arc installed and enabled, which means installing the Azure Connected Machine agent, before an Azure Monitor Agent based connector can collect from it. The data collection rule\'s Resources picker lists only Azure VMs and Azure Arc-enabled servers, which is why the on-premises machines were missing. The Azure Monitor Agent is then installed by the rule.',
    'The other options fail for specific reasons. Windows Event Forwarding with the Windows Forwarded Events connector is a different architecture (a collector machine) and does not fix the picker. The Azure File Sync agent has nothing to do with this. A rule can live in a different resource group, or subscription, from the machines it targets as long as it is in the same tenant, so moving it does not help; its region must match the workspace.',
    'Azure VMs are already Azure resources and are offered in the picker as they are.',
  ],

  solution: () => [
    ['sentinel.applyCollectionRule', { machineNames: ['ONPREM-FS01'], location: 'eastus' }, { fails: /Azure Arc-enabled/ }],
    ['sentinel.enableArc', { machine: 'AZ-WEB01' }, { fails: /already an Azure resource/ }],
    ['sentinel.enableArc', { machine: 'ONPREM-FS01' }],
    ['sentinel.enableArc', { machine: 'ONPREM-DC01' }],
    ['sentinel.enableArc', { machine: 'ONPREM-APP01' }],
    ['sentinel.applyCollectionRule', { machineNames: ['AZ-WEB01', 'AZ-WEB02', 'AZ-DB01', 'ONPREM-FS01', 'ONPREM-DC01', 'ONPREM-APP01'], location: 'westus' }, { fails: /same region as the Log Analytics workspace/ }],
    ['sentinel.applyCollectionRule', { machineNames: ['AZ-WEB01', 'AZ-WEB02', 'AZ-DB01', 'ONPREM-FS01', 'ONPREM-DC01', 'ONPREM-APP01'], location: 'eastus' }],
  ],
};
