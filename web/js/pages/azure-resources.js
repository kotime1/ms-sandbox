import { h, badge } from '../dom.js';
import { table } from '../components/table.js';
import { ctx } from '../app.js';

export async function render(host) {
  const { resources } = await ctx.view('resources');
  host.append(
    h('h1', null, 'All resources'),
    h('p', { class: 'muted' }, 'Subscription: Sandbox · Directory: contoso.com'),
    table([
      { key: 'name', label: 'Name', render: (r) => (r.isPlaybook
        ? h('a', { href: `#/azure/logicapp/${r.name.toLowerCase()}` }, r.name)
        : h('span', null, r.name)) },
      { key: 'type', label: 'Type' },
      { key: 'rg', label: 'Resource group' },
      { key: 'location', label: 'Location' },
      { key: 'state', label: 'Status', render: (r) => (r.state ? badge(r.state, 'ok') : '') },
    ], resources, { rowTarget: (r) => `row:${r.name}`, onRowClick: (r) => { if (r.isPlaybook) ctx.navigate(`azure/logicapp/${r.name.toLowerCase()}`); } }));
}
