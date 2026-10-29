import { h, badge } from '../dom.js';
import { table } from '../components/table.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('defender');
  host.append(
    h('h1', null, 'Device inventory'),
    table([
      { key: 'name', label: 'Device' },
      { key: 'os', label: 'OS' },
      { key: 'risk', label: 'Risk level', render: (d) => badge(d.risk, d.risk === 'High' ? 'warn' : '') },
      { key: 'isolated', label: 'Network', render: (d) => (d.isolated ? badge('Isolated', 'warn') : badge('Connected', 'ok')) },
      { key: 'id', label: 'Response', render: (d) => h('button', { class: 'btn small', type: 'button', 'data-target': `btn:isolate:${d.id}`, onclick: async () => {
        const o = await ctx.act('defender.isolateDevice', { deviceId: d.id, release: d.isolated });
        if (o.ok) { ctx.toast(d.isolated ? 'Isolation released' : 'Device isolated', 'ok'); await ctx.reloadPage(); }
      } }, d.isolated ? 'Release from isolation' : 'Isolate device') },
    ], v.devices, { rowTarget: (d) => `row:device:${d.id}` }));
}
