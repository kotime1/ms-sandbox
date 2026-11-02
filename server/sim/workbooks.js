// Microsoft Sentinel workbooks: the template gallery, the save / edit / clone flow, and who may create or delete one.
// Sources (checked 2026-11-02):
//   learn.microsoft.com/azure/sentinel/monitor-your-data              (Templates / My workbooks, Save > View saved workbook > Edit > Save as, Done editing, delete rules)
//   learn.microsoft.com/azure/sentinel/manage-soc-with-incident-metrics (the Security operations efficiency template and its metric list)
//   practice question (set 3 Q8): create/delete needs Microsoft Sentinel Contributor, OR a lesser Sentinel role + Workbook Contributor; Owner also works.
// Template metric lists other than Security operations efficiency are paraphrased summaries, not Microsoft's full lists.

import { SimError } from './world-errors.js';

export const MAX_WORKBOOKS = 30;

/** id, name, what it is for, the metrics it ships with, and the data it needs before saving. */
export const TEMPLATES = Object.freeze([
  {
    id: 'tpl-soc-efficiency', name: 'Security operations efficiency', summary: 'Metrics for managing a SOC over time.',
    required: ['SecurityIncident'],
    metrics: ['Incident created over time', 'Incidents created by closing classification, severity, owner, and status', 'Mean time to triage', 'Mean time to closure',
      'Incidents created by severity, owner, status, product, and tactics over time', 'Time to triage percentiles', 'Time to closure percentiles', 'Mean time to triage per owner', 'Recent activities', 'Recent closing classifications'],
  },
  {
    id: 'tpl-incident-overview', name: 'Incident Overview', summary: 'A snapshot of the incident queue.',
    required: ['SecurityIncident'],
    metrics: ['Open incidents by severity', 'Incidents by status', 'Incidents by owner'],
  },
  {
    id: 'tpl-entra-signins', name: 'Microsoft Entra sign-ins', summary: 'Analyzes sign-ins over time to find anomalies.',
    required: ['SigninLogs'],
    metrics: ['Sign-ins over time', 'Failed sign-ins by application, device and location'],
  },
  {
    id: 'tpl-entra-audit', name: 'Microsoft Entra audit logs', summary: 'Analyzes administrative activity in the directory.',
    required: ['AuditLogs'],
    metrics: ['Admin activity over time', 'User and group changes'],
  },
]);
const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
export const getTemplate = (id) => BY_ID.get(id) ?? null;

/**
 * Can this principal create or delete a workbook in the Sentinel resource group?
 * Rule from the practice question and the Learn prerequisites: Sentinel Contributor (or Owner), OR a lesser Sentinel role
 * (Reader / Responder) together with Workbook Contributor. Workbook Contributor on its own is not enough.
 * `roles` is the list of role names the principal holds at or above the workspace's resource group.
 */
export function canAuthorWorkbooks(roles) {
  const has = (n) => roles.includes(n);
  if (has('Owner') || has('Microsoft Sentinel Contributor')) return true;
  const sentinelRole = has('Microsoft Sentinel Reader') || has('Microsoft Sentinel Responder');
  return sentinelRole && has('Workbook Contributor');
}
/** Can they view a workbook? Workbook Reader or Contributor on the resource group, or any Sentinel role. */
export function canViewWorkbooks(roles) {
  return canAuthorWorkbooks(roles) || ['Workbook Reader', 'Workbook Contributor', 'Microsoft Sentinel Reader', 'Microsoft Sentinel Responder', 'Reader'].some((r) => roles.includes(r));
}

/** Save a template as a workbook (step 1 of the documented flow). Throws when the data it needs is not in the workspace. */
export function saveFromTemplate(template, { name, haveTables, existing }) {
  if (!template) throw new SimError('Template not found', 'NotFound');
  if (existing.length >= MAX_WORKBOOKS) throw new SimError(`You can have at most ${MAX_WORKBOOKS} workbooks in the sandbox.`);
  if (existing.some((w) => w.name.toLowerCase() === name.toLowerCase())) throw new SimError(`A workbook named '${name}' already exists.`);
  const missing = template.required.filter((t) => !haveTables.includes(t));
  if (missing.length) throw new SimError(`The ${template.name} workbook needs ${missing.join(', ')} data, which this workspace is not receiving. Connect the data source first.`);
  return { name, template: template.id, metrics: [...template.metrics], editing: false };
}
