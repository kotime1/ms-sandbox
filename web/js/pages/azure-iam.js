import { h, badge } from '../dom.js';
import { table } from '../components/table.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('iam');
  const short = (id) => v.scopes.find((s) => s.id === id)?.label ?? id;

  host.append(
    h('h1', null, 'Access control (IAM)'),
    h('p', { class: 'muted' }, `Signed in as ${v.user}. Role assignments grant a principal a role at a scope; they are inherited by everything beneath that scope.`),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:add-role', onclick: () => addDialog(v) }, '+ Add role assignment')),
    h('h2', null, 'Role assignments'),
    table([
      { key: 'principalName', label: 'Name' },
      { key: 'role', label: 'Role', render: (a) => h('span', null, a.role, ' ', v.roles.find((r) => r.name === a.role)?.privileged ? badge('Privileged', 'warn') : null) },
      { key: 'scope', label: 'Scope', render: (a) => short(a.scope) },
      { key: 'id', label: '', render: (a) => (a.locked ? badge('Built-in') : h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Remove ${a.role} from ${a.principalName}`, onclick: async () => { if (confirm(`Remove ${a.role} from ${a.principalName}?`)) { const o = await ctx.act('azure.removeRole', { id: a.id }); if (o.ok) await ctx.reloadPage(); } } }, 'Remove')) },
    ], v.assignments, { empty: 'No role assignments.' }),
    h('h2', null, 'Roles'),
    h('details', null, h('summary', null, `Show ${v.roles.length} built-in roles in this sandbox`),
      table([{ key: 'name', label: 'Role' }, { key: 'description', label: 'Description' }], v.roles)));
}

function addDialog(v) {
  const scope = h('select', null, v.scopes.map((s) => h('option', { value: s.id }, s.label)));
  const search = h('input', { type: 'search', placeholder: 'Search roles…', 'aria-label': 'Search roles' });
  const roleDesc = h('div', { class: 'role-desc' }, 'Select a role to read what it allows.');
  const list = h('div', { class: 'role-list', role: 'listbox', 'aria-label': 'Roles' });
  let chosen = null;
  const paint = () => {
    list.replaceChildren(...v.roles.filter((r) => r.name.toLowerCase().includes(search.value.toLowerCase())).map((r) => h('button', {
      type: 'button', role: 'option', 'aria-selected': String(chosen === r.name), class: `role-item ${chosen === r.name ? 'selected' : ''}`,
      onclick: () => { chosen = r.name; roleDesc.textContent = `${r.name}: ${r.description}`; paint(); },
    }, r.name)));
  };
  search.addEventListener('input', paint);
  paint();
  const member = h('select', null, v.principals.map((p) => h('option', { value: p.id }, `${p.name} (${p.type})`)));
  const m = modal({
    title: 'Add role assignment', wide: true,
    content: [field('Scope', scope), h('div', { class: 'field' }, h('label', null, 'Role'), search, list, roleDesc), field('Member', member)],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Review + assign', primary: true, target: 'btn:review-assign', onClick: async (x) => {
        if (!chosen) { x.setError('Select a role.'); return; }
        const out = await ctx.act('azure.assignRole', { scope: scope.value, principalId: member.value, role: chosen }, { silentError: true });
        if (!out.ok) { x.setError(out.error.message); return; }
        x.close(); ctx.toast('Role assignment added', 'ok'); await ctx.reloadPage();
      } },
    ],
  });
  return m;
}
