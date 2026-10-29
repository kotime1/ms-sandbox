import { h, badge, sev, fmtTime, clear } from '../dom.js';
import { table } from '../components/table.js';
import { modal } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('defender');
  const pending = v.devices.filter((d) => d.onboarding === 'Pending approval');

  host.append(
    h('h1', null, 'Device inventory'),
    pending.length
      ? h('div', { class: 'note' },
        h('strong', null, `${pending.length} device(s) are waiting for approval. `), 'Until they are approved they appear here but do not report alerts. ',
        h('button', { class: 'btn small', type: 'button', 'data-target': 'btn:approve-all', onclick: async () => {
          const o = await ctx.act('defender.approveDevices', { ids: pending.map((d) => d.id) });
          if (o.ok) { ctx.toast(`${o.data.approved} device(s) approved`, 'ok'); await ctx.reloadPage(); }
        } }, 'Approve all pending'))
      : null,
    table([
      { key: 'name', label: 'Device', render: (d) => h('a', { href: '#', 'data-target': `btn:open-timeline:${d.id}`, onclick: (e) => { e.preventDefault(); openDevice(d.id); } }, d.name) },
      { key: 'os', label: 'OS' },
      { key: 'onboarding', label: 'Onboarding', render: (d) => badge(d.onboarding, d.onboarding === 'Approved' ? 'ok' : 'warn') },
      { key: 'risk', label: 'Risk level', render: (d) => badge(d.risk, d.risk === 'High' ? 'warn' : '') },
      { key: 'isolated', label: 'Network', render: (d) => (d.isolated ? badge('Isolated', 'warn') : badge('Connected', 'ok')) },
      { key: 'id', label: 'Response', render: (d) => h('button', { class: 'btn small', type: 'button', 'data-target': `btn:isolate:${d.id}`, onclick: async () => {
        const o = await ctx.act('defender.isolateDevice', { deviceId: d.id, release: d.isolated });
        if (o.ok) { ctx.toast(d.isolated ? 'Isolation released' : 'Device isolated', 'ok'); await ctx.reloadPage(); }
      } }, d.isolated ? 'Release from isolation' : 'Isolate device') },
    ], v.devices, { rowTarget: (d) => `row:device:${d.id}` }));
}

/** Device page: Timeline (flag events, show only flagged) and the Collect investigation package action. */
async function openDevice(id) {
  const body = h('div', null);
  const m = modal({ title: 'Device', wide: true, content: body, buttons: [{ label: 'Close', onClick: (x) => x.close() }] });
  const state = { onlyFlagged: false, before: null };

  const paint = async () => {
    const d = await ctx.view(`device/${id}`);
    m.el.querySelector('h2').textContent = d.device.name;
    let events = d.timeline;
    if (state.onlyFlagged) events = events.filter((e) => e.flagged);
    if (state.before) events = events.filter((e) => e.at <= state.before);
    clear(body).append(
      h('div', { class: 'chips' }, badge(d.device.os), badge(d.device.onboarding, d.device.onboarding === 'Approved' ? 'ok' : 'warn'), badge(d.device.isolated ? 'Isolated' : 'Connected', d.device.isolated ? 'warn' : 'ok')),
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn', type: 'button', 'data-target': `btn:collect-package:${id}`, onclick: async () => {
          const o = await ctx.act('defender.collectPackage', { deviceId: id });
          if (o.ok) { ctx.toast('Investigation package collected', 'ok'); await paint(); }
        } }, 'Collect investigation package'),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: state.onlyFlagged, onchange: (e) => { state.onlyFlagged = e.target.checked; paint(); } }), ' Only flagged events'),
        state.before ? h('button', { class: 'btn small', type: 'button', onclick: () => { state.before = null; paint(); } }, 'Show all times') : null),
      d.packages.length ? h('div', { class: 'note ok' }, h('strong', null, 'Package collected. '), `Contains: ${d.packages[d.packages.length - 1].contents.join(', ')}.`) : null,
      h('h3', null, 'Timeline'),
      events.length
        ? table([
          { key: 'flagged', label: 'Flag', render: (e) => h('button', { class: 'icon-btn', type: 'button', 'aria-pressed': String(e.flagged), 'aria-label': `${e.flagged ? 'Unflag' : 'Flag'} event: ${e.text}`, onclick: async () => {
            const o = await ctx.act('defender.flagTimelineEvent', { deviceId: id, eventId: e.id, flagged: !e.flagged });
            if (o.ok) await paint();
          } }, e.flagged ? '⚑' : '⚐') },
          { key: 'at', label: 'Time', render: (e) => fmtTime(e.at) },
          { key: 'kind', label: 'Type' },
          { key: 'text', label: 'Event' },
          { key: 'id', label: '', render: (e) => h('button', { class: 'btn small', type: 'button', title: 'Show only events up to and including this one', onclick: () => { state.before = e.at; paint(); } }, 'Events before') },
        ], events, { rowTarget: (e) => `row:event:${e.id}` })
        : h('div', { class: 'empty' }, state.onlyFlagged ? 'No events are flagged yet.' : 'No timeline data for this device.'),
      d.alerts.length ? h('div', null, h('h3', null, 'Active alerts'), h('ul', null, d.alerts.map((a) => h('li', null, a.title, ' ', sev(a.severity))))) : null);
  };
  await paint();
}
