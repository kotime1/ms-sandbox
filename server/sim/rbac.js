// Role catalog for the IAM blades. Descriptions are paraphrased from Microsoft docs so the
// learner has to read and choose, as in the real "Add role assignment" picker.
//
// `actions` is a coarse capability list used by the simulator to decide whether an identity
// is allowed to do something (e.g. restart a VM). It is NOT the real RBAC action set.

export const ROLES = Object.freeze([
  { name: 'Owner', type: 'BuiltInRole', description: 'Grants full access to manage all resources, including the ability to assign roles in Azure RBAC.', actions: ['*'], privileged: true },
  { name: 'Contributor', type: 'BuiltInRole', description: 'Grants full access to manage all resources, but does not allow you to assign roles in Azure RBAC.', actions: ['*', '!rbac'], privileged: true },
  { name: 'Reader', type: 'BuiltInRole', description: 'View all resources, but does not allow you to make any changes.', actions: ['read'], privileged: false },
  { name: 'Virtual Machine Contributor', type: 'BuiltInRole', description: 'Create and manage virtual machines, manage disks, install and run software, reset password of the root user of the virtual machine using VM extensions, and manage local user accounts using VM extensions.', actions: ['read', 'vm.restart', 'vm.write'], privileged: false },
  { name: 'Logic App Contributor', type: 'BuiltInRole', description: 'Lets you manage logic apps, but not change access to them.', actions: ['read', 'logicapp.write', 'logicapp.run'], privileged: false },
  { name: 'Logic App Operator', type: 'BuiltInRole', description: 'Lets you read, enable, and disable logic apps, but not edit or update them.', actions: ['read', 'logicapp.run'], privileged: false },
  { name: 'Microsoft Sentinel Reader', type: 'BuiltInRole', description: 'Microsoft Sentinel Reader. View data, incidents, workbooks, and other Microsoft Sentinel resources.', actions: ['read', 'sentinel.read'], privileged: false },
  { name: 'Microsoft Sentinel Responder', type: 'BuiltInRole', description: 'Microsoft Sentinel Responder. In addition to Reader, manage incidents (assign, dismiss, etc.).', actions: ['read', 'sentinel.read', 'sentinel.incident.write'], privileged: false },
  { name: 'Microsoft Sentinel Contributor', type: 'BuiltInRole', description: 'Microsoft Sentinel Contributor. In addition to Responder, create and edit workbooks, analytics rules, and other Microsoft Sentinel resources.', actions: ['read', 'sentinel.read', 'sentinel.incident.write', 'sentinel.content.write'], privileged: true },
  { name: 'Microsoft Sentinel Playbook Operator', type: 'BuiltInRole', description: 'Microsoft Sentinel Playbook Operator. List, view, and manually run playbooks.', actions: ['read', 'playbook.run'], privileged: false },
  { name: 'Microsoft Sentinel Automation Contributor', type: 'BuiltInRole', description: 'Microsoft Sentinel Automation Contributor. Allows Microsoft Sentinel to add playbooks to automation rules. It is not meant for user accounts.', actions: ['automation.attach'], privileged: false },
  { name: 'Security Admin', type: 'BuiltInRole', description: 'View and update permissions for Microsoft Defender for Cloud. Same permissions as the Security Reader role and can also update the security policy and dismiss alerts and recommendations.', actions: ['read', 'defender.write'], privileged: true },
  { name: 'Monitoring Contributor', type: 'BuiltInRole', description: 'Can read all monitoring data and edit monitoring settings.', actions: ['read', 'monitor.write'], privileged: false },
]);

const BY_NAME = new Map(ROLES.map((r) => [r.name, r]));
export const getRole = (name) => BY_NAME.get(name) ?? null;

/** Does a role grant `action`? Handles the wildcard roles (Owner / Contributor). */
export function roleAllows(roleName, action) {
  const role = getRole(roleName);
  if (!role) return false;
  if (role.actions.includes(`!${action}`)) return false;
  if (role.actions.includes('*')) return !(action === 'rbac' && role.actions.includes('!rbac'));
  return role.actions.includes(action);
}
