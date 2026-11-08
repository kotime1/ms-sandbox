// Sentinel MCP server (set 1 Q50, set 4 Q48, set 6 Q49): the tenant header controls which tenant a call authenticates to; the workspace ID in
// the prompt controls which workspace it queries. Fixing one does not fix the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/core/session.js';
import { perform } from '../server/sim/actions.js';
import { getView } from '../server/http/views.js';
import { defaultMcp, setTenantHeader, listWorkspaces, runToolCall, authTenant, consistent, describe, HOME_TENANT, GUEST_TENANT, WORKSPACES } from '../server/sim/mcp.js';

const PROD = WORKSPACES[0];
const LAB = WORKSPACES[1];
const fresh = () => { const s = new SessionStore({ env: {} }).create(); s.lab.start('mcp-workspace'); return s; };
const met = (s, id) => s.lab.status().objectives.find((o) => o.id === id).met;
const act = (s, type, params = {}) => perform(s.ctx, type, params);
const guest = () => ({ ...defaultMcp(), signIn: 'guest' });
const run = (st, workspaceId = '') => runToolCall(st, { workspaceId });

test('a guest sign-in without the header authenticates to the guest tenant and queries nothing', () => {
  const { result } = run(guest());
  assert.equal(result.tenant, GUEST_TENANT);
  assert.equal(result.workspace, null);
  assert.match(result.why, /holds none of your Sentinel workspaces/);
});

test('a normal sign-in authenticates to the home tenant with no header at all', () => {
  assert.equal(authTenant(defaultMcp()), HOME_TENANT);
});

test('the header sets the tenant. It does not choose a workspace', () => {
  let st = setTenantHeader(guest(), HOME_TENANT);
  assert.equal(authTenant(st), HOME_TENANT);
  const seen = new Set();
  for (let i = 0; i < 4; i++) { const r = run(st); st = r.state; seen.add(r.result.workspace); assert.equal(r.result.tenant, HOME_TENANT); }
  assert.equal(seen.size, 2, 'with no workspace named, calls move between both workspaces');
  assert.equal(consistent(st, PROD.id), false);
});

test('the S1:50 / S4:48 trap: two workspaces, normal sign-in. The header changes nothing; the workspace ID fixes it', () => {
  let st = defaultMcp();
  const before = [run(st), (st = run(st).state, run(st))].map((r) => r.result.workspace);
  assert.notEqual(before[0], before[1], 'results come from different workspaces');
  st = setTenantHeader(defaultMcp(), HOME_TENANT);
  const withHeader = [];
  for (let i = 0; i < 4; i++) { const r = run(st); st = r.state; withHeader.push(r.result.workspace); }
  assert.ok(new Set(withHeader).size > 1, 'adding the header does not pin the workspace');
  st = defaultMcp();
  for (let i = 0; i < 3; i++) st = run(st, PROD.id).state;
  assert.equal(consistent(st, PROD.id, 3), true, 'naming the workspace is what makes it consistent');
});

test('the S6:49 case: a guest sign-in needs BOTH the header and the workspace ID', () => {
  let onlyId = guest();
  for (let i = 0; i < 2; i++) onlyId = run(onlyId, PROD.id).state;
  assert.equal(consistent(onlyId, PROD.id), false, 'a workspace ID alone cannot fix the wrong tenant');
  assert.ok(onlyId.calls.every((c) => c.tenant === GUEST_TENANT));

  let onlyHeader = setTenantHeader(guest(), HOME_TENANT);
  for (let i = 0; i < 4; i++) onlyHeader = run(onlyHeader).state;
  assert.equal(consistent(onlyHeader, PROD.id), false, 'the header alone does not pin a workspace');

  let both = setTenantHeader(guest(), HOME_TENANT);
  for (let i = 0; i < 2; i++) both = run(both, PROD.id).state;
  assert.equal(consistent(both, PROD.id), true);
});

test('naming "default" does not pin the workspace when there are two', () => {
  let st = setTenantHeader(guest(), HOME_TENANT);
  const used = new Set();
  for (let i = 0; i < 4; i++) { const r = run(st, 'default'); st = r.state; used.add(r.result.workspace); }
  assert.equal(used.size, 2);
  assert.equal(consistent(st, PROD.id), false);
});

test('a malformed workspace ID is refused, and a real ID from another tenant finds nothing', () => {
  assert.throws(() => run(defaultMcp(), 'not-an-id'), /not a workspace ID/);
  const { result } = run(guest(), PROD.id);
  assert.equal(result.workspace, null, 'the guest tenant does not hold that workspace');
});

test('the header only accepts a tenant you can sign in to', () => {
  assert.throws(() => setTenantHeader(defaultMcp(), 'evil.example.com'), /not a tenant you can sign in to/);
  assert.equal(setTenantHeader(setTenantHeader(defaultMcp(), HOME_TENANT), '').tenantHeader, '', 'an empty value clears the header');
});

test('list_sentinel_workspaces shows only the workspaces of the tenant the calls authenticate to', () => {
  assert.deepEqual(describe(guest()).workspaces, null, 'nothing is shown until the tool is run');
  assert.deepEqual(describe(listWorkspaces(guest())).workspaces, [], 'a guest sign-in without the header sees none');
  const home = describe(listWorkspaces(setTenantHeader(guest(), HOME_TENANT)));
  assert.deepEqual(home.workspaces.map((w) => w.name).sort(), ['sentinel-lab', 'sentinel-prod']);
});

test('state functions do not mutate their input', () => {
  const a = guest();
  const b = setTenantHeader(a, HOME_TENANT);
  const c = run(b, PROD.id).state;
  assert.equal(a.tenantHeader, '');
  assert.equal(b.calls.length, 0);
  assert.equal(c.calls.length, 1);
});

test('the call log is capped', () => {
  let st = setTenantHeader(guest(), HOME_TENANT);
  for (let i = 0; i < 60; i++) st = run(st, PROD.id).state;
  assert.ok(st.calls.length <= 30);
});

// ---- the lab ------------------------------------------------------------------------------------
test('lab: nothing is met at the start, and the learner starts as a guest', () => {
  const s = fresh();
  assert.equal(s.world.mcp.signIn, 'guest');
  for (const id of ['tenant', 'workspace', 'cause']) assert.equal(met(s, id), false, id);
});

test('lab: running calls before fixing anything meets nothing', () => {
  const s = fresh();
  assert.ok(act(s, 'mcp.runTool', { note: 'first' }).ok);
  assert.ok(act(s, 'mcp.runTool', { workspaceId: PROD.id }).ok);
  assert.equal(met(s, 'tenant'), false);
  assert.equal(met(s, 'workspace'), false, 'naming the workspace while in the wrong tenant does not count');
});

test('lab: the header alone meets the tenant objective but not the workspace one (the S1:50 mistake)', () => {
  const s = fresh();
  act(s, 'mcp.setTenantHeader', { value: HOME_TENANT });
  for (let i = 0; i < 4; i++) act(s, 'mcp.runTool');
  assert.equal(met(s, 'tenant'), true);
  assert.equal(met(s, 'workspace'), false);
});

test('lab: header then two calls naming sentinel-prod meets both', () => {
  const s = fresh();
  act(s, 'mcp.setTenantHeader', { value: HOME_TENANT });
  act(s, 'mcp.listWorkspaces');
  act(s, 'mcp.runTool', { workspaceId: PROD.id });
  assert.equal(met(s, 'workspace'), false, 'one call is not consistency');
  act(s, 'mcp.runTool', { workspaceId: PROD.id });
  assert.equal(met(s, 'workspace'), true);
});

test('lab: pinning the other workspace, or alternating, does not meet the production objective', () => {
  const s = fresh();
  act(s, 'mcp.setTenantHeader', { value: HOME_TENANT });
  act(s, 'mcp.runTool', { workspaceId: LAB.id });
  act(s, 'mcp.runTool', { workspaceId: LAB.id });
  assert.equal(met(s, 'workspace'), false, 'consistent, but on sentinel-lab');
  act(s, 'mcp.runTool', { workspaceId: PROD.id });
  assert.equal(met(s, 'workspace'), false, 'a change of workspace breaks the run');
});

test('lab: the diagnosis answer is tenant, not workspace', () => {
  const s = fresh();
  act(s, 'findings.report', { objectiveId: 'cause', value: 'workspace' });
  assert.equal(met(s, 'cause'), false);
  act(s, 'findings.report', { objectiveId: 'cause', value: ' Tenant ' });
  assert.equal(met(s, 'cause'), true);
});

test('lab: input is validated', () => {
  const s = fresh();
  assert.equal(act(s, 'mcp.setTenantHeader', { value: 'bad value!' }).ok, false);
  assert.equal(act(s, 'mcp.setTenantHeader', { value: 'evil.example.com' }).ok, false);
  assert.equal(act(s, 'mcp.runTool', { workspaceId: 'x'.repeat(80) }).ok, false);
  assert.equal(act(s, 'mcp.runTool', { workspaceId: 'not-an-id' }).ok, false);
  assert.equal(act(s, 'mcp.runTool', { note: '<script>' }).ok, false);
});

test('the view reports what the page shows', () => {
  const s = fresh();
  const v = getView(s.world, 'mcp');
  assert.equal(v.signIn, 'guest');
  assert.equal(v.authTenant, GUEST_TENANT);
  assert.deepEqual(Object.keys(v).sort(), ['authTenant', 'calls', 'discovered', 'signIn', 'tenantHeader', 'workspaces']);
  act(s, 'mcp.runTool');
  assert.equal(getView(s.world, 'mcp').calls.length, 1);
});

test('the assistant does not reveal the answer note before the lab is done', async () => {
  const s = fresh();
  const r = await s.assistant.ask('what does the x-mcp-client-tenant-id header do?');
  assert.doesNotMatch(r.text, /decides which tenant tool calls authenticate to/);
});
