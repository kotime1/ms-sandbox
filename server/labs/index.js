import playbookPermissions from './playbook-permissions.js';
import suppressApp1 from './suppress-app1.js';
import detectAndIsolate from './detect-and-isolate.js';
import kqlInvestigation from './kql-investigation.js';
import sentinelRbac from './sentinel-rbac.js';

export const LABS = [suppressApp1, sentinelRbac, playbookPermissions, detectAndIsolate, kqlInvestigation];
const BY_ID = new Map(LABS.map((l) => [l.id, l]));
export const getLab = (id) => (typeof id === 'string' ? BY_ID.get(id) ?? null : null);

/** Fields safe to show before the lab starts. Never includes hints, steps, checks or solutions. */
export function labSummary(l) {
  return { id: l.id, title: l.title, level: l.level, minutes: l.minutes, topics: l.topics, examObjective: l.examObjective, sourceQuestions: l.sourceQuestions };
}
