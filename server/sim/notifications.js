// Email alert notifications and who may change Defender XDR security settings. Sources (checked 2026-11-02):
//   learn.microsoft.com/defender-xdr/configure-email-notifications  (rule fields, permissions, "Settings > Endpoints > General > Email notifications")
// The page says: "Only users with Manage security settings permissions or higher roles can configure email notifications. If you've
// chosen to use basic permissions management, users with Security Administrator higher roles can configure email notifications."
// and "Only users assigned to the Global administrator role can manage notification rules that are configured for all device groups."
//
// Roles that can change security settings are modelled on the Security Administrator / Global Administrator tier that page names.
// The practice question (set 3 Q4) also treats a Microsoft 365 role group called Security Administrator as sufficient.

import { SimError } from './world-errors.js';

export const SEVERITIES = ['Informational', 'Low', 'Medium', 'High'];
export const ALL_DEVICES = 'all';
export const MAX_RULES = 20;
export const MAX_RECIPIENTS = 20;
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,120}\.[A-Za-z]{2,}$/;

/** Roles (Microsoft Entra roles and Microsoft 365 role groups) that can manage security settings, in either portal. */
const CAN_MANAGE_SETTINGS = new Set(['Global Administrator', 'Security Administrator']);

/** Can this person modify Defender XDR security settings? True if EITHER their Entra role or their M365 role group qualifies. */
export const canManageSecuritySettings = (u) => CAN_MANAGE_SETTINGS.has(u.entraRole) || CAN_MANAGE_SETTINGS.has(u.roleGroup);

/** Who can touch a rule scoped to all devices: Global administrator only (Entra role). */
export const isGlobalAdmin = (u) => u.entraRole === 'Global Administrator';

/**
 * Validate a notification rule for `actor`. `groups` are the known device group ids.
 * Throws SimError with portal-style wording. Returns the normalised rule fields.
 */
export function buildNotificationRule(p, { actor, groups, existing }) {
  if (!canManageSecuritySettings(actor)) {
    throw new SimError(`${actor.name} does not have the Manage security settings permission. Only users with Manage security settings or higher roles (for example Security Administrator) can configure email notifications.`, 'Forbidden');
  }
  if (existing.length >= MAX_RULES) throw new SimError(`You can create at most ${MAX_RULES} notification rules in the sandbox.`);
  if (existing.some((r) => r.name.toLowerCase() === p.name.toLowerCase())) throw new SimError(`A notification rule named '${p.name}' already exists.`);
  const scope = [...new Set(p.deviceGroups)];
  const allDevices = p.devices === ALL_DEVICES;
  if (allDevices && !isGlobalAdmin(actor)) {
    throw new SimError('Only users assigned to the Global administrator role can create a notification rule for all devices. Select specific device groups instead.', 'Forbidden');
  }
  if (!allDevices) {
    if (!scope.length) throw new SimError('Select at least one device group.');
    const bad = scope.find((g) => !groups.includes(g));
    if (bad) throw new SimError(`'${bad}' is not a device group in this tenant.`);
  }
  const severities = [...new Set(p.severities)];
  if (!severities.length) throw new SimError('Choose at least one alert severity.');
  const recipients = [...new Set(p.recipients.map((r) => r.trim().toLowerCase()))];
  if (!recipients.length) throw new SimError('Add at least one recipient.');
  if (recipients.length > MAX_RECIPIENTS) throw new SimError(`At most ${MAX_RECIPIENTS} recipients per rule.`);
  const badMail = recipients.find((r) => !EMAIL.test(r));
  if (badMail) throw new SimError(`'${badMail}' is not a valid email address.`);
  return { allDevices, deviceGroups: allDevices ? [] : scope, severities, recipients };
}

/** Does this rule notify for this alert? Severity and device group are the only filters the real feature offers. */
export function ruleNotifies(rule, alert, device) {
  if (!rule.enabled) return false;
  if (!rule.severities.includes(alert.severity)) return false;
  return rule.allDevices || (device?.groups ?? []).some((g) => rule.deviceGroups.includes(g));
}
