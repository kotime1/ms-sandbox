import { visited } from './helpers.js';
import { HOME_TENANT, WORKSPACES, consistent } from '../sim/mcp.js';

const PROD = WORKSPACES[0];
const ran = (w, pred) => w.mcp.calls.some(pred);

export default {
  id: 'mcp-workspace',
  title: 'The notebook queries the wrong workspace',
  level: 'Intermediate',
  minutes: 15,
  topics: ['Sentinel MCP server', 'Notebooks', 'Guest sign-in', 'Data lake'],
  examObjective: '3.2 Detect threats by using the Microsoft Sentinel platform',
  sourceQuestions: { set1: [50], set2: [], set3: [], set4: [48], set5: [], set6: [49] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'exam', note: 'From three practice questions: the x-mcp-client-tenant-id header controls which tenant a call authenticates to (it matters for a guest sign-in), and the list_sentinel_workspaces tool plus a workspace ID in the prompt controls which workspace is queried. I have not checked the MCP tool collection pages on Microsoft Learn, so treat the details as unverified. The notebook, the model and the tool calls are simulated.' },
  scenarios: [],
  withholdNotes: ['mcp-workspace'],
  answers: [{ id: 'cause', label: 'Why did the first call return nothing? (tenant or workspace)', placeholder: 'tenant or workspace' }],
  brief:
    'You run threat-hunting prompts from a notebook in Visual Studio Code, through the Microsoft Sentinel MCP server. ' +
    'You are signed in to Visual Studio Code with a guest account, but both Sentinel data lake workspaces are in your home tenant. ' +
    'Run a tool call and read what it did: the first calls return nothing or come from a different workspace each time. ' +
    'Make the calls reliable: every call should authenticate to the home tenant and keep querying the production workspace, sentinel-prod. ' +
    'Fix one problem at a time and run the call again, so you can tell which fix did what.',

  setup(w) {
    w.mcp = { signIn: 'guest', tenantHeader: '', discovered: false, calls: [] };
    return [];
  },

  objectives: [
    { id: 'tenant', text: 'A tool call authenticates to the home tenant.', check: (w) => ran(w, (c) => c.tenant === HOME_TENANT) },
    {
      id: 'workspace', text: 'Two tool calls in a row query sentinel-prod and no other workspace.',
      check: (w) => consistent(w.mcp, PROD.id, 2),
    },
    {
      // Diagnosis: the learner states which of the two problems made the first call return nothing.
      id: 'cause', text: 'Say which problem made the first call return nothing: tenant or workspace.',
      check: (w) => (w.findings.find((f) => f.objectiveId === 'cause')?.value ?? '').trim().toLowerCase() === 'tenant',
    },
  ],

  steps: [
    { text: 'Open the notebook and its MCP server definition.', target: 'nav:sentinel/mcp', done: (w) => visited(w, 'sentinel/mcp') },
    { text: 'Run a tool call and read where it went.', target: 'btn:mcp-run', done: (w) => w.mcp.calls.length > 0 },
    { text: 'Fix the tenant, then pin the workspace.', target: 'btn:mcp-header', done: (w) => w.mcp.tenantHeader !== '' },
  ],

  hints: {
    tenant: [
      'Look at which tenant the first call authenticated to. Is it the one that holds your workspaces?',
      'You signed in as a guest. The server definition has a header that says which tenant to authenticate to.',
      'Add the x-mcp-client-tenant-id header to the MCP server definition, with the home tenant.',
    ],
    workspace: [
      'Once the tenant is right, check whether successive calls hit the same workspace. They can alternate.',
      'The header does not choose a workspace. What do you need to tell the agent, and where can you find it?',
      'Run the list workspaces tool, then put the sentinel-prod workspace ID in the prompt of each call.',
    ],
    cause: [
      'Compare the first call (before any fix) with the second. What changed when you added the header?',
      'A call that authenticates to the wrong tenant cannot see your workspaces at all.',
      'The answer is tenant.',
    ],
  },

  debrief: [
    'There are two separate controls. The x-mcp-client-tenant-id header in the MCP server definition decides which tenant a tool call authenticates to, which matters when you sign in with a guest account. The workspace a call queries is decided by the workspace ID you give it in the prompt, found with the list_sentinel_workspaces tool.',
    'So the header does not fix "results come from different workspaces". That is the trap in the two earlier questions (set 1 Q50, set 4 Q48): with two workspaces in the same tenant and a normal sign-in, the fix is list_sentinel_workspaces and a workspace ID in the prompt. Adding the tenant header there changes nothing.',
    'The newest question (set 6 Q49) adds a guest sign-in, so both problems are present and the answer is the header and the workspace ID together. Read the scenario for which problem it describes: a guest account points to the tenant, several workspaces point to the workspace.',
    'Using the value default as the workspace ID does not pin the call to one workspace when more than one is available, and storing a static access token or recreating the server definition fixes neither problem.',
  ],

  solution: () => [
    ['mcp.runTool', { note: 'first call' }],
    ['mcp.setTenantHeader', { value: HOME_TENANT }],
    ['mcp.runTool', { note: 'no workspace named' }],
    ['mcp.runTool', { workspaceId: 'default', note: 'default does not pin it' }],
    ['mcp.listWorkspaces', {}],
    ['mcp.runTool', { workspaceId: PROD.id, note: 'pinned' }],
    ['mcp.runTool', { workspaceId: PROD.id, note: 'pinned again' }],
    ['findings.report', { objectiveId: 'cause', value: 'tenant' }],
  ],
};
