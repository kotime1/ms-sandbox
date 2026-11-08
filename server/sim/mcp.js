// Microsoft Sentinel MCP server used from a notebook in Visual Studio Code (GitHub Copilot Agent Mode).
//
// What is modelled, from the practice questions (set 1 Q50, set 4 Q48, set 6 Q49) and the "tool collection" docs they cite:
//  - Which TENANT a tool call authenticates to is set in the MCP server definition by the x-mcp-client-tenant-id header. It matters when
//    you sign in with a guest account: without the header the call can authenticate to the wrong tenant.
//  - Which WORKSPACE a tool call queries is not set by that header. With several workspaces, you identify the workspace with the
//    list_sentinel_workspaces tool and put the workspace ID in the prompt. Without an ID the agent may pick any workspace.
//  - Using "default" as the workspace id does not guarantee the right workspace when there is more than one.
// What is simplified: one server definition, a handful of tool calls, no real notebook or model. The wrong-tenant and wrong-workspace
// outcomes are deterministic so the learner can see each cause separately.

import { SimError } from './world.js';

export const HOME_TENANT = 'contoso.onmicrosoft.com';
export const GUEST_TENANT = 'fabrikam.onmicrosoft.com';

export const WORKSPACES = [
  { id: 'a1111111-0000-4000-8000-000000000001', name: 'sentinel-prod', tenant: HOME_TENANT },
  { id: 'b2222222-0000-4000-8000-000000000002', name: 'sentinel-lab', tenant: HOME_TENANT },
];

/** The default state. A lab sets signIn to 'guest' for the guest-account scenario. */
export const defaultMcp = () => ({ signIn: 'member', tenantHeader: '', discovered: false, calls: [] });

const isId = (v) => typeof v === 'string' && WORKSPACES.some((w) => w.id === v);

/** Set (or clear) the x-mcp-client-tenant-id header in the server definition. */
export function setTenantHeader(state, value) {
  const v = String(value ?? '').trim();
  if (v && v !== HOME_TENANT && v !== GUEST_TENANT) throw new SimError(`"${v}" is not a tenant you can sign in to. Use the tenant that holds the workspaces.`);
  return { ...state, tenantHeader: v };
}

/** The list_sentinel_workspaces tool: it only reveals the workspaces of the tenant the call authenticates to (see describe()). */
export function listWorkspaces(state) {
  return { ...state, discovered: true };
}

/** The tenant a tool call authenticates to. A guest sign-in without the header lands in the guest's own tenant. */
export function authTenant(state) {
  if (state.tenantHeader) return state.tenantHeader;
  return state.signIn === 'guest' ? GUEST_TENANT : HOME_TENANT;
}

/**
 * Run a hunting tool call from the notebook. `workspaceId` is whatever the prompt named ('' when it named none).
 * Returns { state, result } where result says which tenant and workspace the call really used.
 */
export function runToolCall(state, { workspaceId = '', note = '' } = {}) {
  // Input is checked first, whichever tenant the call lands in: a malformed ID is the learner's mistake, not a tenant effect.
  if (workspaceId && workspaceId !== 'default' && !isId(workspaceId)) throw new SimError('That is not a workspace ID. Use list_sentinel_workspaces to find the ID.');
  const tenant = authTenant(state);
  const inHome = tenant === HOME_TENANT;
  const candidates = WORKSPACES.filter((w) => w.tenant === tenant);
  let used = null;
  let why = '';
  if (!inHome) {
    why = `The call authenticated to ${tenant}, which holds none of your Sentinel workspaces, so nothing was queried.`;
  } else if (workspaceId === 'default') {
    // "default" is not a guarantee: with more than one workspace it can resolve to either.
    used = candidates[state.calls.length % candidates.length];
    why = 'The prompt said "default". With more than one workspace that does not pin the call to one of them.';
  } else if (isId(workspaceId)) {
    used = candidates.find((w) => w.id === workspaceId) ?? null;
    why = used ? `The prompt named workspace ${used.name}.` : 'That workspace is not in the tenant the call authenticated to.';
  } else {
    // No workspace named: the agent picks one, and which one can change between calls.
    used = candidates[state.calls.length % candidates.length];
    why = 'No workspace was named in the prompt, so the agent chose one. The next call can choose a different one.';
  }
  const call = { tenant, workspace: used?.id ?? null, workspaceName: used?.name ?? null, named: workspaceId, why, note };
  return { state: { ...state, calls: [...state.calls, call].slice(-30) }, result: call };
}

/** Did the last N calls all hit the same specific workspace in the home tenant? */
export function consistent(state, workspaceId, n = 2) {
  const last = state.calls.slice(-n);
  return last.length >= n && last.every((c) => c.tenant === HOME_TENANT && c.workspace === workspaceId && c.named === workspaceId);
}

export function describe(state) {
  return {
    signIn: state.signIn,
    tenantHeader: state.tenantHeader,
    authTenant: authTenant(state),
    discovered: state.discovered,
    workspaces: state.discovered ? WORKSPACES.filter((w) => w.tenant === authTenant(state)).map((w) => ({ id: w.id, name: w.name })) : null,
    calls: state.calls.map((c) => ({ ...c })),
  };
}
