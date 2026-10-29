import { h, badge, sev } from '../dom.js';
import { table } from '../components/table.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('defender');
  host.append(
    h('h1', null, 'Custom detection rules'),
    table([
      { key: 'name', label: 'Name' },
      { key: 'severity', label: 'Severity', render: (d) => sev(d.severity) },
      { key: 'actions', label: 'Actions', render: (d) => (d.actions.includes('isolateDevice') ? badge('Isolate device', 'warn') : 'None') },
      { key: 'enabled', label: 'Status', render: (d) => badge(d.enabled ? 'On' : 'Off', d.enabled ? 'ok' : '') },
      { key: 'query', label: 'Query', render: (d) => h('code', { class: 'inline-q' }, d.query) },
      { key: 'id', label: '', render: (d) => h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete ${d.name}`, onclick: async () => { if (confirm(`Delete detection "${d.name}"?`)) { const o = await ctx.act('defender.deleteDetection', { id: d.id }); if (o.ok) await ctx.reloadPage(); } } }, 'Delete') },
    ], v.detections, { empty: 'No custom detection rules. Create one from Advanced hunting.' }),
    h('h2', null, 'Alerts raised by detections'),
    table([
      { key: 'title', label: 'Alert' }, { key: 'device', label: 'Device' }, { key: 'severity', label: 'Severity', render: (a) => sev(a.severity) }, { key: 'action', label: 'Automatic action', render: (a) => a.action ?? '' },
    ], v.alerts.filter((a) => a.source === 'Custom detection'), { empty: 'None yet.' }));
}
