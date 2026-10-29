import { h, badge, sev } from '../dom.js';
import { table } from '../components/table.js';
import { modal } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('sentinel-config');
  host.append(
    h('h1', null, 'Analytics'),
    h('p', { class: 'muted' }, 'Rules that turn telemetry into alerts and incidents. Open a rule to review its query logic (where Microsoft publishes it).'),
    table([
      { key: 'name', label: 'Name' },
      { key: 'kind', label: 'Rule type' },
      { key: 'severity', label: 'Severity', render: (r) => sev(r.severity) },
      { key: 'enabled', label: 'Status', render: (r) => badge(r.enabled ? 'Enabled' : 'Disabled', r.enabled ? 'ok' : '') },
      { key: 'tactics', label: 'Tactics', render: (r) => r.tactics.join(', ') },
    ], v.analyticsRules, { rowTarget: (r) => `row:rule:${r.id}`, onRowClick: (r) => show(r) }));
}

function show(r) {
  const logic = r.query
    ? h('pre', { class: 'code' }, r.query)
    : h('div', { class: 'note' }, `${r.kind === 'Fusion' ? 'Fusion' : 'Machine learning behavior analytics'} rules are built on proprietary Microsoft algorithms. Their logic cannot be viewed or changed.`);
  modal({ title: r.name, content: [h('div', { class: 'chips' }, badge(r.kind), sev(r.severity)), h('h3', null, 'Rule query'), logic], buttons: [{ label: 'Close', onClick: (x) => x.close() }] });
}
