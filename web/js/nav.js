// Navigation model for the Microsoft Defender portal, in the order and with the group names of the real left menu.
// Where Sentinel features live follows Microsoft's own mapping:
// https://learn.microsoft.com/en-us/azure/sentinel/microsoft-sentinel-defender-portal  (page dated 2026-06-18)
//
// Page ids (`sentinel/logs`, `defender/rules`, ...) are internal and unchanged, so labs, tests and coach targets keep working.
// Several internal ids can map to the SAME real page (e.g. `defender/hunting` and `sentinel/logs` are both "Advanced hunting"):
// `nav` is the one that gets a menu entry; `aliases` are extra ids that highlight it.
//
// A group has `items` (pages) or none. A group with no items is shown for realism and says it is not simulated. Groups are
// collapsed like the real menu, but the one holding the current page or the coach's next target opens itself.

export const DEFENDER_HOME = { id: 'defender/home', label: 'Home' };

export const SECTIONS = [
  { title: 'Exposure management', icon: '◔', items: [] },
  {
    title: 'Investigation & response', icon: '◎',
    items: [
      { id: 'defender/alerts', label: 'Incidents & alerts', aliases: ['sentinel/incidents'] },
      { id: 'defender/hunting', label: 'Hunting > Advanced hunting', aliases: ['sentinel/logs'] },
    ],
  },
  { title: 'Threat intelligence', icon: '◈', items: [] },
  { title: 'Assets', icon: '▤', items: [{ id: 'defender/devices', label: 'Devices' }] },
  {
    title: 'Microsoft Sentinel', icon: '◉',
    items: [
      { id: 'sentinel/hunting', label: 'Threat management > Hunting' },
      { id: 'sentinel/workbooks', label: 'Threat management > Workbooks' },
      { id: 'sentinel/connectors', label: 'Configuration > Data connectors' },
      { id: 'sentinel/analytics', label: 'Configuration > Analytics' },
      { id: 'sentinel/automation', label: 'Configuration > Automation' },
      { id: 'sentinel/summary', label: 'Configuration > Summary rules' },
    ],
  },
  { title: 'Identities', icon: '▣', items: [{ id: 'defender/identities', label: 'Identities and reports' }] },
  { title: 'Endpoints', icon: '▭', items: [] },
  { title: 'Email & collaboration', icon: '✉', items: [] },
  { title: 'Cloud apps', icon: '☁', items: [] },
  {
    title: 'Microsoft Purview', icon: '◇',
    items: [{ id: 'purview/audit', label: 'Audit > Search' }],
  },
];

/** Plain links under the groups, as in the real menu. Only Settings has a page here. */
export const LINKS = [
  { label: 'Cases', icon: '▯' },
  { label: 'SOC optimization', icon: '✧' },
  { label: 'Reports', icon: '▥' },
  { label: 'Learning hub', icon: '☺' },
  { label: 'Trials', icon: '✦' },
  { id: 'defender/rules', label: 'System > Settings', icon: '⚙', aliases: [] },
  { id: 'defender/disruption', label: 'Settings > Attack disruption', icon: '⛨', aliases: [] },
];

export const AZURE = {
  title: 'Azure portal',
  items: [
    { id: 'azure/services', label: 'All services' },
    { id: 'azure/resources', label: 'All resources' },
    { id: 'azure/iam', label: 'Access control (IAM)' },
  ],
};

export const isAzure = (id) => id.startsWith('azure/');
export const matches = (item, path) => [item.id, ...(item.aliases ?? [])].some((i) => path === i || path.startsWith(`${i}/`));
