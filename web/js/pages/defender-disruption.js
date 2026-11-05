// Settings > Microsoft Defender XDR > Automatic attack disruption (learn.microsoft.com/defender-xdr/configure-attack-disruption).
// A status panel: what attack disruption can do in this tenant right now, and the reason for each action that it cannot. The reasons
// and the rules behind them come from the server (server/sim/disruption.js). The controls below change the prerequisites.
import { h, badge } from '../dom.js';
import { table } from '../components/table.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('disruption');
  const set = async (setting, value, group = '') => {
    const o = await ctx.act('disruption.set', { setting, value, group }, { silentError: true });
    if (!o.ok) { ctx.toast(o.error.message, 'err'); return; }
    await ctx.reloadPage();
  };
  const toggle = (label, on, setting, target) => h('div', { class: 'row' },
    h('span', null, label), badge(on ? 'On' : 'Off', on ? 'ok' : 'warn'),
    h('button', { class: 'btn small', type: 'button', 'data-target': `btn:fix:${target ?? setting}`, onclick: () => set(setting, on ? 'off' : 'on') }, on ? 'Turn off' : 'Turn on'));

  host.append(
    h('h1', null, 'Automatic attack disruption'),
    h('p', { class: 'muted' }, 'Real path: Settings > Microsoft Defender XDR, plus the Defender for Endpoint and Defender for Identity settings it depends on. Attack disruption contains the assets an attacker controls, but only with the products and settings below in place.'),
    h('section', { class: 'blade' },
      h('h2', null, 'What it can do now'),
      v.can.length ? h('ul', { class: 'plain' }, v.can.map((a) => h('li', null, badge('Can run', 'ok'), ' ', a))) : h('p', { class: 'muted' }, 'Nothing can run automatically.'),
      v.cannot.length ? h('div', null, h('h3', null, 'Cannot run, and why'), table([{ key: 'action', label: 'Action' }, { key: 'why', label: 'Reason' }], v.cannot, { rowTarget: (r) => `row:cannot:${r.action}` })) : h('p', { class: 'note ok' }, 'All modelled actions can run.')),
    h('section', { class: 'blade' },
      h('h2', null, 'Defender for Endpoint'),
      h('div', { class: 'row' }, h('span', null, 'Device discovery'),
        h('select', { 'aria-label': 'Device discovery', 'data-target': 'select:discovery', onchange: (e) => set('discovery', e.target.value) }, ['Basic', 'Standard'].map((o) => h('option', { value: o, selected: v.discovery === o }, `${o} discovery`)))),
      h('h3', null, 'Device groups: remediation level'),
      v.groups.map((g) => h('div', { class: 'row' }, h('span', null, g.name),
        h('select', { 'aria-label': `Remediation level for ${g.name}`, 'data-target': `select:level:${g.name}`, onchange: (e) => set('automation', e.target.value, g.name) }, v.levels.map((l) => h('option', { value: l, selected: g.level === l }, l)))))),
    h('section', { class: 'blade' },
      h('h2', null, 'Defender for Identity'),
      toggle('Sensor on the domain controller', v.mdiSensorOnDc, 'sensor'),
      toggle('Domain controller auditing', v.mdiAuditing, 'auditing'),
      toggle('Action account is valid (sensor local system account)', v.actionAccountOk, 'actionAccount')),
    h('section', { class: 'blade' },
      h('h2', null, 'Defender for Cloud Apps'),
      toggle('Microsoft 365 connector, all checkboxes selected', v.mdaOfficeConnector, 'officeConnector')));
}
