// Offline study notes for the assistant-agent. Original paraphrases (not Microsoft text),
// matched by keywords. This is what powers the assistant when no LLM key is configured.

export const CONCEPTS = [
  {
    id: 'playbook-vs-automation',
    keys: ['playbook', 'automation rule', 'logic app', 'trigger', 'incident trigger', 'alert trigger', 'nrt'],
    title: 'Playbooks, triggers and automation rules',
    body:
      'A Sentinel playbook is an Azure Logic App. Its first step is a trigger. The incident trigger hands the playbook an incident (with its alerts and entities), which lets it be attached to an automation rule and shown under an incident\'s Actions > Run playbook. The alert trigger hands it a single alert, which suits manual runs from an alert or "alert automation (classic)" on a scheduled rule. ' +
      'NRT and scheduled analytics rules reach incident-trigger playbooks through automation rules.',
  },
  {
    id: 'managed-identity',
    keys: ['managed identity', 'identity', 'authorization', 'authorizationfailed', 'permission', 'rbac', 'role assignment', 'scope', 'least privilege'],
    title: 'Managed identity and Azure RBAC for playbooks',
    body:
      'When a Logic App changes Azure resources it authenticates as its own (system-assigned) managed identity. Permissions flow from that identity to the target: grant the identity a role on the resource it acts on. Pick the narrowest built-in role whose description covers the action, at the narrowest scope that contains the target.',
  },
  {
    id: 'sentinel-roles',
    keys: ['responder', 'contributor', 'reader', 'playbook operator', 'logic app contributor', 'role', 'tier 1', 'analyst'],
    title: 'Microsoft Sentinel roles',
    body:
      'Reader: view. Responder: Reader + manage incidents. Contributor: Responder + create/edit rules, workbooks and other content. Playbook Operator: run playbooks manually. Automation Contributor: lets Sentinel attach playbooks to automation rules (not for people). Building playbooks is a Logic Apps permission (Logic App Contributor).',
  },
  {
    id: 'suppression',
    keys: ['suppression', 'suppress', 'false positive', 'tuning', 'ioc', 'indicator'],
    title: 'Suppression rules (Defender for Endpoint)',
    body:
      'A suppression rule hides or resolves future alerts that match a title plus a condition (an indicator such as a file, process or IP) within a scope (one device, a device group or the organization). Keeping the condition narrow means the same alert from other sources is still raised. Existing alerts are not rewritten.',
  },
  {
    id: 'custom-detection',
    keys: ['custom detection', 'detection rule', 'reportid', 'timestamp', 'arg_max', 'isolate', 'response action', 'advanced hunting'],
    title: 'Custom detection rules',
    body:
      'Create them from Advanced hunting once the query works. The query must return Timestamp and ReportId, plus a column that identifies the entity (DeviceId, AccountUpn, RecipientEmailAddress...). After summarize those columns disappear unless you keep them, typically with arg_max(Timestamp, *). Response actions such as isolate act on the entities the query returns, so keep the query tight.',
  },
  {
    id: 'kql-union-join',
    keys: ['union', 'join', 'lookup', 'across tables', 'ip address across'],
    title: 'union vs join',
    body: 'union stacks the rows of several tables ("search everywhere"). join matches rows between two tables on a key. lookup enriches a fact table from a dimension table. extend adds calculated columns.',
  },
  {
    id: 'kql-basics',
    keys: ['kql', 'where', 'summarize', 'count_distinct', 'dcount', 'render', 'timechart', 'project', 'extend', 'sort', 'limit', 'ago', 'has', 'contains', 'startswith', 'query'],
    title: 'KQL building blocks',
    body:
      'Pipe a table through operators: where filters, project picks columns, extend adds columns, summarize aggregates (count(), dcount(), count_distinct()) optionally by columns, sort by orders (desc by default), limit/take keeps N rows, render draws a chart (e.g. render timechart after summarize ... by bin(TimeGenerated, 1h)). `has` matches whole terms, `contains` matches substrings, `==` is case-sensitive and `=~` is not. A value cannot equal 401 AND 403; use or / in.',
  },
  {
    id: 'allow-block',
    keys: ['allow/block', 'allow block', 'tenant allow', 'unblock', 'blocked file', 'wrongly blocked', 'indicator', 'inactive', 'target', 'quarantine', 'remediation'],
    title: 'Tenant Allow/Block List vs indicators',
    body:
      'The Tenant Allow/Block List lets you explicitly allow or block a specific item (file hash, URL, sender); an allow entry for a file takes effect immediately and stops it being blocked again, while everything else is still remediated. Custom indicators are for proactive detection and blocking, and an indicator stays inactive until it has a valid target such as a device group; there is no manual enable switch.',
  },
  {
    id: 'asi-role',
    keys: ['azure security insights', 'automation contributor', 'not in the list', 'greyed out', 'unavailable', 'playbook picker', 'cannot select', 'permission to run'],
    title: 'Letting Sentinel run a playbook',
    body:
      'Running an incident-trigger playbook from an automation rule is done by Microsoft Sentinel itself, via its Azure Security Insights service principal, not by you or by the playbook. It needs explicit permission on the resource group that holds the playbook. A role assigned on the playbook resource, or the Logic App Contributor role, does not make the playbook selectable.',
  },
  {
    id: 'entity-mapping',
    keys: ['entity', 'entities', 'entity mapping', 'investigation graph', 'investigate', 'fusion', 'machine learning', 'incident creation rule', 'microsoft security rule'],
    title: 'Entity mapping and investigation',
    body:
      'Entity mapping turns columns in a rule\'s query results into entities (accounts, hosts, IPs) that appear on the alert and incident and feed the investigation graph. It is configured in scheduled and NRT rules only. Fusion, ML behavior analytics and Microsoft incident-creation rules have no editable query or mapping.',
  },
  {
    id: 'ueba',
    keys: ['ueba', 'behavior', 'behaviour', 'behaviorinfo', 'behaviorentities', 'join'],
    title: 'UEBA behaviours in hunting',
    body:
      'With the UEBA behaviours layer, behaviour metadata (title, description, categories) is in one table and the entities involved (users, IPs, devices) in another. Combine them with a join on the shared behaviour id. join matches rows between two tables; union just stacks them. Columns that exist on both sides get a numeric suffix on the right.',
  },
  {
    id: 'hunting-favorites',
    keys: ['favorite', 'favourite', 'hunting blade', 'livestream', 'bookmark', 'run when i open', 'hunting query'],
    title: 'Hunting favorites, livestream and bookmarks',
    body:
      'Saved hunting queries marked as favorites run automatically each time the Hunting blade opens. An analytics rule runs continuously and generates alerts. Livestream is an interactive session that notifies you on new matches. Bookmarks keep a query\'s results with your notes and tags for collaboration.',
  },
  {
    id: 'summary-rules',
    keys: ['summary rule', 'time out', 'timeout', 'timed out', 'high volume', 'high-volume', 'search job', 'kql job', 'aggregate', '_cl', 'custom table'],
    title: 'Summary rules for high-volume tables',
    body:
      'A summary rule runs a scheduled KQL aggregation over a large table and writes the result into a new custom (_CL) analytics table that analysts then query, so interactive queries scan a small summary instead of the raw data. The query must aggregate and return a time column. Search jobs fetch data from large historical sets; KQL jobs run asynchronously against the data lake; scheduled analytics rules produce alerts.',
  },
  {
    id: 'device-investigation',
    keys: ['timeline', 'investigation package', 'collect investigation', 'live response', 'deep analysis', 'isolate', 'forensic', 'sandbox', 'device page', 'flag'],
    title: 'Investigating a device in Defender for Endpoint',
    body:
      'The device Timeline gives a chronological view of activity with a custom date range, flaggable events and a filter for flagged ones. Collect investigation package gathers forensic artifacts (processes, network connections, autoruns, scheduled tasks...) into one download with little user impact. Live response gives an interactive remote shell. Deep analysis detonates an unfamiliar file in a sandbox; an indicator turns the verdict into a standing detection. Isolation is a containment action that disrupts the user.',
  },
  {
    id: 'graph-correlation',
    keys: ['signinactivityid', 'token', 'unique token', 'uti', 'same token', 'correlate', 'sessionid', 'clientrequestid', 'operationid', 'sign-in id'],
    title: 'Correlating Graph requests with a sign-in',
    body:
      'In the Microsoft Graph activity logs, the attribute that links a request to the sign-in that issued its token is SignInActivityId (it matches the sign-in\'s unique token identifier). Other identifiers (a session, a client request, an operation) do not correlate to a specific sign-in, and filtering by user over-reports because the same user has other tokens.',
  },
  {
    id: 'azure-activity',
    keys: ['azureactivity', 'azure activity', 'alertrules', 'edited', 'who changed', 'activitystatusvalue', 'audit'],
    title: 'Auditing Sentinel changes with AzureActivity',
    body:
      'Management operations on Sentinel resources land in AzureActivity. Analytics rule edits use OperationNameValue "MICROSOFT.SECURITYINSIGHTS/ALERTRULES/WRITE", and the rule id appears in Properties. Filter ActivityStatusValue for "Succeeded" so failed attempts are not read as changes. Caller shows who did it.',
  },
  {
    id: 'graph-logs',
    keys: ['graph', 'microsoftgraphactivitylogs', '401', '403', 'groups'],
    title: 'Microsoft Graph activity logs',
    body: 'MicrosoftGraphActivityLogs records Graph API requests: RequestUri, ResponseStatusCode, AppId, ServicePrincipalId, UserId, RequestId. For "top callers with failures" filter the status codes with or, filter RequestUri, then summarize count_distinct(RequestId) by the caller columns, sort desc and limit.',
  },
];

export function findConcepts(text, max = 2, withheld = []) {
  const q = String(text).toLowerCase();
  const scored = CONCEPTS.filter((c) => !withheld.includes(c.id)).map((c) => ({ c, score: c.keys.reduce((n, k) => n + (q.includes(k) ? (k.length > 5 ? 2 : 1) : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.c);
}
