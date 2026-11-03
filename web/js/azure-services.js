// The Azure portal's "All services" catalogue. It follows the real portal's categories and service names so the page looks and
// searches like the one in a lab environment. Only the entries with a `page` open something in the sandbox; the rest are shown
// but explain that they are not simulated (the real portal has hundreds of services).
//
// `featured` are the icons along the top of the page; `glyph` is a short text mark drawn in a coloured tile (no image files,
// so nothing is fetched from outside and the strict CSP stays satisfied).

export const CATEGORIES = [
  'AI + machine learning', 'Analytics', 'Compute', 'Containers', 'Databases', 'DevOps', 'General', 'Hybrid + multicloud',
  'Identity', 'Integration', 'Internet of Things', 'Management and governance', 'Migration', 'Mixed reality', 'Monitor', 'Networking',
  'Security', 'Storage', 'Web',
];

const S = (name, category, glyph, tone, page = null, extra = {}) => ({ name, category, glyph, tone, page, ...extra });

export const SERVICES = [
  // Simulated: these open real pages in the sandbox.
  S('All resources', 'General', 'RS', 'blue', 'azure/resources'),
  S('Resource groups', 'General', 'RG', 'blue', 'azure/resources', { featured: true }),
  S('Access control (IAM)', 'Identity', 'IAM', 'gold', 'azure/iam'),
  S('Logic apps', 'Integration', 'LA', 'teal', 'azure/resources'),
  S('Microsoft Sentinel', 'Security', 'MS', 'navy', 'defender:sentinel/analytics', { note: 'Opens in the Microsoft Defender portal, where Sentinel now lives.' }),
  S('Microsoft Defender for Cloud', 'Security', 'DC', 'navy', 'defender:defender/alerts'),
  S('Log Analytics workspaces', 'Monitor', 'LW', 'teal', 'azure/resources'),
  S('Microsoft Entra ID', 'Identity', 'ID', 'blue', 'azure/iam', { featured: true }),
  S('Virtual machines', 'Compute', 'VM', 'blue', 'azure/resources', { featured: true }),
  // Shown, not simulated.
  S('App Services', 'Web', 'AS', 'blue', null, { featured: true }),
  S('Storage accounts', 'Storage', 'ST', 'teal', null, { featured: true }),
  S('SQL databases', 'Databases', 'SQL', 'blue', null, { featured: true }),
  S('Cost Management', 'Management and governance', '$', 'green', null, { featured: true }),
  S('Virtual networks', 'Networking', '<>', 'blue', null, { featured: true }),
  S('Azure AI services', 'AI + machine learning', 'AI', 'blue'),
  S('Azure AI services multi-service account', 'AI + machine learning', 'AI', 'blue'),
  S('Azure AI Video Indexer', 'AI + machine learning', 'VI', 'blue'),
  S('Anomaly detectors', 'AI + machine learning', 'AD', 'blue'),
  S('Bot Services', 'AI + machine learning', 'BS', 'teal'),
  S('Cognitive Search', 'AI + machine learning', 'CS', 'blue'),
  S('Computer vision', 'AI + machine learning', 'CV', 'blue'),
  S('Content moderators', 'AI + machine learning', 'CM', 'blue'),
  S('Custom vision', 'AI + machine learning', 'CV', 'teal'),
  S('Document intelligences', 'AI + machine learning', 'DI', 'blue'),
  S('Face APIs', 'AI + machine learning', 'FA', 'blue'),
  S('Immersive readers', 'AI + machine learning', 'IR', 'blue'),
  S('Language', 'AI + machine learning', 'LG', 'gold'),
  S('Metrics advisors', 'AI + machine learning', 'MA', 'blue'),
  S('Azure OpenAI', 'AI + machine learning', 'OA', 'dark'),
  S('Personalizers', 'AI + machine learning', 'PZ', 'teal'),
  S('Speech services', 'AI + machine learning', 'SP', 'blue'),
  S('Azure Machine Learning', 'AI + machine learning', 'ML', 'blue'),
  S('Azure AI Search', 'AI + machine learning', 'SR', 'blue'),
  S('Azure AI Foundry', 'AI + machine learning', 'FD', 'purple'),
  S('Language understanding', 'AI + machine learning', 'LU', 'blue'),
  S('Translators', 'AI + machine learning', 'TR', 'blue'),
  S('Azure Synapse Analytics', 'Analytics', 'SY', 'blue'),
  S('Event Hubs', 'Analytics', 'EH', 'blue'),
  S('Azure Data Explorer clusters', 'Analytics', 'DX', 'blue'),
  S('Azure Databricks', 'Analytics', 'DB', 'red'),
  S('Virtual machine scale sets', 'Compute', 'VS', 'blue'),
  S('Azure Kubernetes Service', 'Containers', 'K8', 'blue'),
  S('Container registries', 'Containers', 'CR', 'blue'),
  S('Azure Cosmos DB', 'Databases', 'CO', 'blue'),
  S('SQL managed instances', 'Databases', 'MI', 'blue'),
  S('Azure Arc', 'Hybrid + multicloud', 'AR', 'blue'),
  S('Service Bus', 'Integration', 'SB', 'blue'),
  S('IoT Hub', 'Internet of Things', 'IH', 'blue'),
  S('Policy', 'Management and governance', 'PO', 'blue'),
  S('Azure Automation', 'Management and governance', 'AU', 'blue'),
  S('Azure Monitor', 'Monitor', 'MO', 'blue'),
  S('Application Insights', 'Monitor', 'AI', 'purple'),
  S('Azure Migrate', 'Migration', 'MG', 'blue'),
  S('Network security groups', 'Networking', 'NS', 'blue'),
  S('Key Vaults', 'Security', 'KV', 'gold'),
  S('Microsoft Defender for Endpoint', 'Security', 'DE', 'navy'),
];

const BY_NAME = new Map(SERVICES.map((s) => [s.name.toLowerCase(), s]));
export const getService = (name) => BY_NAME.get(String(name).toLowerCase()) ?? null;

/** Case-insensitive match on the service name (and its category, so "monitor" finds the Monitor group). */
export function searchServices(q, limit = 8) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const starts = [], contains = [];
  for (const s of SERVICES) {
    const n = s.name.toLowerCase();
    if (n.startsWith(needle)) starts.push(s);
    else if (n.includes(needle) || s.category.toLowerCase().includes(needle)) contains.push(s);
  }
  return [...starts, ...contains].slice(0, limit);
}
