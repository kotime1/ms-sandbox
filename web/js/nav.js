// Navigation model, taken from Microsoft's own mapping of where Sentinel features live in the Defender portal:
// https://learn.microsoft.com/en-us/azure/sentinel/microsoft-sentinel-defender-portal  (page dated 2026-06-18)
//
// Page ids (`sentinel/logs`, `defender/rules`, ...) are internal and unchanged, so labs, tests and coach targets
// keep working. Only the labels and groupings here are what the trainee sees, and every label is a real menu name.
//
// Several internal ids can map to the SAME real page (e.g. `defender/hunting` and `sentinel/logs` are both
// "Advanced hunting"). `nav` is the one that gets a menu entry; `aliases` are extra ids that highlight it.

export const SECTIONS = [
  {
    title: 'Investigation & response',
    items: [
      { id: 'defender/alerts', label: 'Incidents & alerts', aliases: ['sentinel/incidents'] },
      { id: 'defender/hunting', label: 'Hunting > Advanced hunting', aliases: ['sentinel/logs'] },
    ],
  },
  {
    title: 'Assets',
    items: [{ id: 'defender/devices', label: 'Devices' }],
  },
  {
    title: 'Microsoft Sentinel',
    items: [
      { id: 'sentinel/hunting', label: 'Threat management > Hunting' },
      { id: 'sentinel/analytics', label: 'Configuration > Analytics' },
      { id: 'sentinel/automation', label: 'Configuration > Automation' },
      { id: 'sentinel/summary', label: 'Configuration > Summary rules' },
    ],
  },
  {
    title: 'System > Settings',
    items: [{ id: 'defender/rules', label: 'Endpoints, Defender XDR and email rules' }],
  },
];

export const AZURE = {
  title: 'Azure portal',
  items: [
    { id: 'azure/resources', label: 'All resources' },
    { id: 'azure/iam', label: 'Access control (IAM)' },
  ],
};

export const isAzure = (id) => id.startsWith('azure/');
export const matches = (item, path) => [item.id, ...(item.aliases ?? [])].some((i) => path === i || path.startsWith(`${i}/`));
