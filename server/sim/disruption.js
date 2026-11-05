// Automatic attack disruption: what it needs before it can contain an attack, and what it does. Sources (checked 2026-11-04):
//   learn.microsoft.com/defender-xdr/automatic-attack-disruption   (actions per product; disable-user behaviour for AD vs Entra)
//   learn.microsoft.com/defender-xdr/configure-attack-disruption   (prerequisites: deployed products, Standard discovery, device group
//                                                                   automation level, Defender for Identity action accounts and auditing)
// NOT confirmed by the pages I could read: a toggle named "Advanced features" in Defender for Identity. The practice questions
// (set 1 Q1, set 2 Q2, set 5 Q4) give that as the answer, so the lab labels it as the exam's wording, not as the docs'.

import { SimError } from './world-errors.js';

/** What each Defender product contributes to disruption. Without the product, its actions cannot run. */
export const PRODUCTS = Object.freeze({
  mde: { label: 'Microsoft Defender for Endpoint', actions: ['Contain device', 'Contain IP', 'Isolate device', 'Contain user'] },
  mdi: { label: 'Microsoft Defender for Identity', actions: ['Disable user'] },
  entra: { label: 'Microsoft Entra ID', actions: ['Revoke user session', 'Suspend user in Entra'] },
  mda: { label: 'Microsoft Defender for Cloud Apps', actions: ['OAuth app compromise'] },
});

/** Automation levels of a device group. "No automated response" opts the group out of containment. */
export const LEVELS = ['No automated response', 'Semi - require approval for any remediation', 'Semi - require approval for non-temp folders remediation', 'Semi - require approval for core folders remediation', 'Full - remediate threats automatically'];
const BLOCKING = new Set(['No automated response']);

/**
 * What can attack disruption actually do in this tenant? Returns the actions that can run, and the reason each missing one cannot.
 * `t` is the tenant: { deployed: {mde, mdi, entra, mda}, discovery: 'Standard'|'Basic', groups: [{name, level}], mdiSensorOnDc, mdiAuditing, actionAccountOk, mdaOfficeConnector }.
 */
export function assess(t) {
  const can = [], cannot = [];
  const add = (action, ok, why) => (ok ? can.push(action) : cannot.push({ action, why }));
  const contained = t.groups.some((g) => !BLOCKING.has(g.level));
  for (const a of PRODUCTS.mde.actions) {
    if (!t.deployed.mde) { add(a, false, 'Defender for Endpoint is not deployed; it runs this action.'); continue; }
    if ((a === 'Contain device' || a === 'Contain IP') && t.discovery !== 'Standard') { add(a, false, 'Device discovery must be Standard discovery for the automatic Contain device action.'); continue; }
    if (!contained) { add(a, false, 'Every device group is set to No automated response, so nothing is contained automatically.'); continue; }
    add(a, true);
  }
  for (const a of PRODUCTS.mdi.actions) {
    if (!t.deployed.mdi) add(a, false, 'Defender for Identity is not deployed; its sensor on a domain controller disables the account.');
    else if (!t.mdiSensorOnDc) add(a, false, 'The Defender for Identity sensor must be on the domain controller where the account is to be disabled.');
    else if (!t.actionAccountOk) add(a, false, 'The Defender for Identity action account is not valid. Use the sensor\'s local system account or an account with the required permissions.');
    else if (!t.mdiAuditing) add(a, false, 'Domain controller auditing is not configured for the sensor.');
    else add(a, true);
  }
  for (const a of PRODUCTS.entra.actions) add(a, Boolean(t.deployed.entra), 'Microsoft Entra ID actions need the identity connection.');
  for (const a of PRODUCTS.mda.actions) {
    if (!t.deployed.mda) add(a, false, 'Defender for Cloud Apps is not deployed.');
    else if (!t.mdaOfficeConnector) add(a, false, 'Defender for Cloud Apps needs the Microsoft 365 connector, with every checkbox selected.');
    else add(a, true);
  }
  return { can, cannot };
}

/** Does the tenant contain BOTH halves of the exam scenario: contain devices and disable compromised accounts? */
export const coversDevicesAndAccounts = (t) => {
  const { can } = assess(t);
  return can.includes('Isolate device') && can.includes('Disable user');
};

/** Change one setting. Throws SimError with portal-style wording. */
export function applySetting(t, p) {
  switch (p.setting) {
    case 'deploy': {
      if (!Object.hasOwn(PRODUCTS, p.value)) throw new SimError('Unknown product.');
      return { ...t, deployed: { ...t.deployed, [p.value]: true } };
    }
    case 'discovery': {
      if (!['Standard', 'Basic'].includes(p.value)) throw new SimError('Choose Standard or Basic discovery.');
      return { ...t, discovery: p.value };
    }
    case 'automation': {
      if (!LEVELS.includes(p.value)) throw new SimError('Unknown automation level.');
      const g = t.groups.find((x) => x.name === p.group);
      if (!g) throw new SimError('Device group not found.', 'NotFound');
      return { ...t, groups: t.groups.map((x) => (x === g ? { ...x, level: p.value } : x)) };
    }
    case 'sensor': return { ...t, mdiSensorOnDc: p.value === 'on' };
    case 'actionAccount': return { ...t, actionAccountOk: p.value === 'on' };
    case 'auditing': return { ...t, mdiAuditing: p.value === 'on' };
    case 'officeConnector': return { ...t, mdaOfficeConnector: p.value === 'on' };
    default: throw new SimError('Unknown setting.');
  }
}
