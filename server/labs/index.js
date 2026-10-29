import playbookPermissions from './playbook-permissions.js';
import suppressApp1 from './suppress-app1.js';
import detectAndIsolate from './detect-and-isolate.js';
import kqlInvestigation from './kql-investigation.js';
import sentinelRbac from './sentinel-rbac.js';
import unblockLob1 from './unblock-lob1.js';
import approveDevices from './approve-devices.js';
import playbookPicker from './playbook-picker.js';
import entityMapping from './entity-mapping.js';
import uebaJoin from './ueba-join.js';
import huntingFavorites from './hunting-favorites.js';
import summaryRule from './summary-rule.js';
import triageWs23 from './triage-ws23.js';
import followTheToken from './follow-the-token.js';

// Ordered easiest to hardest within each area so the catalogue reads as a learning path.
export const LABS = [
  suppressApp1, unblockLob1, approveDevices, sentinelRbac, huntingFavorites,
  playbookPermissions, playbookPicker, entityMapping, detectAndIsolate, kqlInvestigation, uebaJoin, summaryRule, triageWs23,
  followTheToken,
];
const BY_ID = new Map(LABS.map((l) => [l.id, l]));
export const getLab = (id) => (typeof id === 'string' ? BY_ID.get(id) ?? null : null);

/** Fields safe to show before the lab starts. Never includes hints, steps, checks or solutions. */
export function labSummary(l) {
  return { id: l.id, title: l.title, level: l.level, minutes: l.minutes, topics: l.topics, examObjective: l.examObjective, sourceQuestions: l.sourceQuestions };
}
