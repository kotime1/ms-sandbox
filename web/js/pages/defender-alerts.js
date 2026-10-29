import { h, badge, sev, fmtTime } from '../dom.js';
import { table } from '../components/table.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('defender');
  const shown = v.alerts.filter((a) => !a.suppressed || a.status === 'Resolved');
  const hidden = v.alerts.length - shown.length;
  host.append(
    h('h1', null, 'Incidents & alerts'),
    h('p', { class: 'muted' }, `${shown.length} alert(s)${hidden ? ` · ${hidden} hidden by suppression rules` : ''}`),
    table([
      { key: 'title', label: 'Alert' },
      { key: 'severity', label: 'Severity', render: (a) => sev(a.severity) },
      { key: 'device', label: 'Device' },
      { key: 'process', label: 'Process', render: (a) => a.process ?? '' },
      { key: 'status', label: 'Status', render: (a) => badge(a.status, a.status === 'Resolved' ? 'ok' : '') },
      { key: 'createdAt', label: 'First seen', render: (a) => fmtTime(a.createdAt) },
    ], shown, { empty: 'No alerts. Some labs raise alerts when they start or when you replay a simulation.', rowTarget: (a) => `row:alert:${a.id}`, onRowClick: (a) => detail(a, v) }),
    v.suppression.length ? h('div', null, h('h2', null, 'Alert suppression rules'),
      table([
        { key: 'alertTitle', label: 'Alert title' },
        { key: 'ioc', label: 'Triggering IOC', render: (s) => (s.ioc ? `${s.ioc.type}: ${s.ioc.value}` : 'Any') },
        { key: 'scope', label: 'Scope' },
        { key: 'action', label: 'Action' },
        { key: 'id', label: '', render: (s) => h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete suppression rule for ${s.alertTitle}`, onclick: async () => { const o = await ctx.act('defender.deleteSuppression', { id: s.id }); if (o.ok) await ctx.reloadPage(); } }, 'Delete') },
      ], v.suppression)) : null);
}

function detail(a, v) {
  modal({
    title: a.title, wide: true,
    content: [
      h('div', { class: 'chips' }, sev(a.severity), badge(a.status), badge(a.source)),
      h('dl', { class: 'kv' }, h('dt', null, 'Device'), h('dd', null, a.device), h('dt', null, 'Triggering process'), h('dd', null, a.process ?? 'n/a'), h('dt', null, 'First seen'), h('dd', null, fmtTime(a.createdAt)),
        a.action ? [h('dt', null, 'Automatic action'), h('dd', null, a.action)] : null),
    ],
    buttons: [
      { label: 'Close', onClick: (x) => x.close() },
      { label: 'Resolve', onClick: async (x) => { const o = await ctx.act('defender.setAlertStatus', { alertId: a.id, status: 'Resolved' }); if (o.ok) { x.close(); await ctx.reloadPage(); } } },
      { label: 'Create suppression rule', primary: true, target: 'btn:create-suppression', onClick: (x) => { x.close(); suppressionDialog(a, v); } },
    ],
  });
}

function suppressionDialog(a, v) {
  const title = h('input', { type: 'text', value: a.title, maxlength: '120' });
  const iocType = h('select', null, h('option', { value: 'none' }, 'Any (no condition)'), h('option', { value: 'process', selected: Boolean(a.process) }, 'Process name'));
  const iocValue = h('input', { type: 'text', value: a.process ?? '', maxlength: '80' });
  const device = h('select', null, v.devices.map((d) => h('option', { value: d.id }, d.name)));
  const scope = h('select', null, h('option', { value: 'organization' }, 'Organization (all devices)'), h('option', { value: 'device' }, 'Selected device only'));
  const action = h('select', null, h('option', { value: 'hide' }, 'Hide alert'), h('option', { value: 'resolve' }, 'Resolve alert'));
  modal({
    title: 'Create alert suppression rule',
    content: [
      h('p', { class: 'muted' }, 'The rule applies to alerts raised after you save it. Existing alerts are not changed.'),
      field('Alert title', title), field('Triggering IOC (condition)', iocType), field('IOC value', iocValue),
      field('Scope', scope), field('Device (device scope only)', device), field('Action', action),
    ],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Save', primary: true, target: 'btn:save-suppression', onClick: async (x) => {
        const params = { alertTitle: title.value, iocType: iocType.value, iocValue: iocType.value === 'none' ? '' : iocValue.value, scope: scope.value, action: action.value };
        if (scope.value === 'device') params.deviceId = device.value;
        const out = await ctx.act('defender.createSuppression', params, { silentError: true });
        if (!out.ok) { x.setError(out.error.message); return; }
        x.close(); ctx.toast('Suppression rule saved', 'ok'); await ctx.reloadPage();
      } },
    ],
  });
}
