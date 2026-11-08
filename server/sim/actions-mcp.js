// MCP server definition and notebook tool-call actions. Rules and wording: mcp.js.

import { setTenantHeader, listWorkspaces, runToolCall } from './mcp.js';

export const MCP_ACTIONS = {
  'mcp.setTenantHeader': {
    spec: { value: { type: 'string', max: 80, optional: true, default: '', pattern: /^[A-Za-z0-9.-]*$/ } },
    run({ w }, p) {
      w.mcp = setTenantHeader(w.mcp, p.value);
      w.mcpLog.push({ op: 'header', value: p.value });
      return {};
    },
  },
  'mcp.listWorkspaces': {
    spec: {},
    run({ w }) {
      w.mcp = listWorkspaces(w.mcp);
      w.mcpLog.push({ op: 'list' });
      return {};
    },
  },
  'mcp.runTool': {
    spec: {
      workspaceId: { type: 'string', max: 60, optional: true, default: '', pattern: /^[A-Za-z0-9-]*$/ },
      note: { type: 'string', max: 120, optional: true, default: '', pattern: /^[A-Za-z0-9 ,.'-]*$/ },
    },
    run({ w }, p) {
      const { state, result } = runToolCall(w.mcp, { workspaceId: p.workspaceId, note: p.note });
      w.mcp = state;
      w.mcpLog.push({ op: 'call', tenant: result.tenant, workspace: result.workspace });
      if (w.mcpLog.length > 100) w.mcpLog.shift();
      return { call: result };
    },
  },
};
