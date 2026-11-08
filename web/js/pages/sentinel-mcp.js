// Visual Studio Code notebook + Microsoft Sentinel MCP server (simulated). The learner edits the MCP server definition (the
// x-mcp-client-tenant-id header), lists workspaces, runs a hunting tool call and reads which tenant and workspace it really used.
// The rules and the wording of each outcome come from the server (server/sim/mcp.js).
import { h, badge, clear } from '../dom.js';
import { table } from '../components/table.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('mcp');
  const act = async (type, params) => {
    const o = await ctx.act(type, params, { silentError: true });
    if (!o.ok) { ctx.toast(o.error.message, 'err'); return null; }
    await ctx.reloadPage();
    return o;
  };

  const tenant = h('input', { type: 'text', id: 'mcp-tenant', 'aria-label': 'Value of the x-mcp-client-tenant-id header', placeholder: 'contoso.onmicrosoft.com', value: v.tenantHeader, 'data-target': 'field:mcp-tenant' });
  const ws = h('input', { type: 'text', id: 'mcp-ws', 'aria-label': 'Workspace ID named in the prompt', placeholder: 'workspace ID (leave empty to name none)', 'data-target': 'field:mcp-ws' });
  const note = h('input', { type: 'text', id: 'mcp-note', 'aria-label': 'Prompt', value: 'Hunt for sign-ins from unfamiliar locations in the last 24 hours', 'data-target': 'field:mcp-note' });

  host.append(
    h('h1', null, 'Notebook: Sentinel MCP server'),
    h('p', { class: 'muted' }, 'Simulated Visual Studio Code notebook using GitHub Copilot Agent Mode with the Microsoft Sentinel MCP server. Nothing here talks to a real tenant.'),
    h('section', { class: 'blade' },
      h('h2', null, 'MCP server definition'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Signed in to Visual Studio Code as'), h('dd', null, v.signIn === 'guest' ? 'a guest account' : 'a member of the home tenant'),
        h('dt', null, 'Tool calls authenticate to'), h('dd', null, v.authTenant, v.tenantHeader ? ' (set by the header)' : ' (no header set)')),
      h('div', { class: 'field' }, h('label', { for: 'mcp-tenant' }, 'x-mcp-client-tenant-id header'), tenant,
        h('div', { class: 'hint-text' }, 'Leave empty to send no header.')),
      h('button', { class: 'btn primary small', type: 'button', 'data-target': 'btn:mcp-header', onclick: () => act('mcp.setTenantHeader', { value: tenant.value.trim() }) }, 'Save server definition')),
    h('section', { class: 'blade' },
      h('h2', null, 'Workspaces'),
      v.workspaces
        ? (v.workspaces.length
          ? table([{ key: 'name', label: 'Workspace' }, { key: 'id', label: 'Workspace ID' }], v.workspaces, { rowTarget: (r) => `row:ws:${r.name}` })
          : h('p', { class: 'note small' }, 'list_sentinel_workspaces returned no workspaces for the tenant these calls authenticate to.'))
        : h('p', { class: 'muted small' }, 'Run list_sentinel_workspaces to see the workspace IDs.'),
      h('button', { class: 'btn small', type: 'button', 'data-target': 'btn:mcp-list', onclick: () => act('mcp.listWorkspaces', {}) }, 'Run list_sentinel_workspaces')),
    h('section', { class: 'blade' },
      h('h2', null, 'Run a hunting prompt'),
      h('div', { class: 'field' }, h('label', { for: 'mcp-note' }, 'Prompt'), note),
      h('div', { class: 'field' }, h('label', { for: 'mcp-ws' }, 'Workspace ID in the prompt'), ws),
      h('button', { class: 'btn primary small', type: 'button', 'data-target': 'btn:mcp-run', onclick: () => act('mcp.runTool', { workspaceId: ws.value.trim(), note: note.value.trim().replace(/[^A-Za-z0-9 ,.'-]/g, '') }) }, 'Run tool call')),
    h('section', { class: 'blade' },
      h('h2', null, 'What each call did'),
      v.calls.length
        ? table(
          [{ key: 'n', label: '#' }, { key: 'tenant', label: 'Authenticated to' }, { key: 'workspaceName', label: 'Queried workspace' }, { key: 'why', label: 'What happened' }],
          v.calls.map((c, i) => ({ n: i + 1, tenant: c.tenant, workspaceName: c.workspaceName ?? 'none', why: c.why })),
          { rowTarget: (r) => `row:call:${r.n}` })
        : h('p', { class: 'muted small' }, 'No tool calls yet.')));
}
