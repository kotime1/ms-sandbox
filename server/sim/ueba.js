// User and Entity Behavior Analytics (UEBA) settings in Microsoft Sentinel: Settings > Entity behavior configuration.
//
// What is modelled, from Microsoft Learn ("Enable entity behavior analytics to detect advanced threats"):
//  - UEBA is turned on for the workspace, then you choose which data sources feed it. The page lists the UEBA-supported
//    sources you have not connected yet. The two sources in that list are Azure Activity and Security Events.
//  - UEBA also uses Microsoft Entra ID (identity data) to build user profiles, so the identity side is a separate step.
//  - Microsoft 365 / Office 365 is NOT one of the two UEBA data sources on that page (the practice question asks which
//    two do: Azure Activity and Security Events).
// What is simplified: the real page also has Entra ID sync options and per-source anomaly toggles; here a source is on or off.

import { SimError } from './world.js';

export const UEBA_SOURCES = [
  { id: 'AzureActivity', label: 'Azure Activity', supported: true, table: 'AzureActivity', note: 'Control-plane operations on Azure resources.' },
  { id: 'SecurityEvent', label: 'Security Events', supported: true, table: 'SecurityEvent', note: 'Windows security events from servers and domain controllers.' },
  { id: 'OfficeActivity', label: 'Microsoft 365', supported: false, table: 'OfficeActivity', note: 'Exchange, SharePoint and Teams audit activity.' },
  { id: 'Syslog', label: 'Syslog', supported: false, table: 'Syslog', note: 'Linux syslog messages.' },
  { id: 'CommonSecurityLog', label: 'Common Event Format', supported: false, table: 'CommonSecurityLog', note: 'Firewalls and other network devices.' },
];

export const defaultUeba = () => ({ enabled: false, sources: [], entraSync: false });

const find = (id) => UEBA_SOURCES.find((s) => s.id === id);

/** Turn UEBA on for the workspace. Idempotent. */
export function enable(state) {
  return { ...state, enabled: true };
}

/** Connect one data source to UEBA. UEBA must be on, and only the supported sources can be connected. */
export function connectSource(state, id) {
  const s = find(id);
  if (!s) throw new SimError('Unknown data source.', 'NotFound');
  if (!state.enabled) throw new SimError('Turn on entity behavior analytics before connecting data sources.');
  if (!s.supported) throw new SimError(`${s.label} is not a UEBA data source. The data sources UEBA supports are listed under "Connect data sources".`);
  if (state.sources.includes(id)) throw new SimError(`${s.label} is already connected.`);
  return { ...state, sources: [...state.sources, id] };
}

export function disconnectSource(state, id) {
  if (!find(id)) throw new SimError('Unknown data source.', 'NotFound');
  if (!state.sources.includes(id)) throw new SimError('That data source is not connected.');
  return { ...state, sources: state.sources.filter((x) => x !== id) };
}

/** Sync user entities with Microsoft Entra ID. Needs UEBA on. */
export function setEntraSync(state, on) {
  if (!state.enabled) throw new SimError('Turn on entity behavior analytics first.');
  return { ...state, entraSync: Boolean(on) };
}

/** What the page shows: every source, whether UEBA supports it, whether it is connected, and which are still available. */
export function describe(state) {
  const sources = UEBA_SOURCES.map((s) => ({ id: s.id, label: s.label, supported: s.supported, note: s.note, connected: state.sources.includes(s.id) }));
  return {
    enabled: state.enabled,
    entraSync: state.entraSync,
    sources,
    // The list the real page shows: supported sources you have not connected yet.
    available: sources.filter((s) => s.supported && !s.connected).map((s) => s.label),
    ready: state.enabled && UEBA_SOURCES.filter((s) => s.supported).every((s) => state.sources.includes(s.id)),
  };
}
