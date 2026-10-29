import { roleAllows, getRole } from '../sim/rbac.js';

export const visited = (w, page) => w.log.some((e) => e.ok && e.action === 'ui.visit' && e.params?.page === page);

const covers = (scope, target) => target === scope || target.startsWith(`${scope}/`);
export const assignmentsFor = (w, principalId) => w.azure.assignments.filter((a) => a.principalId === principalId);
export const hasRoleCovering = (w, principalId, role, target) =>
  assignmentsFor(w, principalId).some((a) => a.role === role && covers(a.scope, target));
export const anyPrivileged = (w, principalId) => assignmentsFor(w, principalId).some((a) => getRole(a.role)?.privileged);
export const subscriptionScoped = (w, principalId, sub) => assignmentsFor(w, principalId).some((a) => a.scope === `/subscriptions/${sub}`);
export { roleAllows };
