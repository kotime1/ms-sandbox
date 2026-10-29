import { h, badge } from '../dom.js';
import { ctx } from '../app.js';

export async function render(host, slug) {
  const { resources } = await ctx.view('resources');
  const r = resources.find((x) => x.isPlaybook && x.name.toLowerCase() === slug);
  if (!r) { host.append(h('div', { class: 'empty' }, 'Logic app not found.')); return; }
  const set = async (type, params) => { const out = await ctx.act(type, params); if (out.ok) { ctx.toast('Saved', 'ok'); await ctx.reloadPage(); } };

  host.append(
    h('div', { class: 'crumbs' }, h('a', { href: '#/azure/resources' }, 'Resources'), ' / ', r.name),
    h('h1', null, r.name),
    h('p', { class: 'muted' }, `${r.type} · ${r.rg} · ${r.location}`),

    h('section', { class: 'blade' }, h('h2', null, 'Trigger'),
      h('p', { class: 'muted' }, 'The first step of a playbook decides what it receives, and where Microsoft Sentinel offers it.'),
      h('div', { class: 'choice' },
        choice('Microsoft Sentinel alert', 'When a response to a Microsoft Sentinel alert is triggered', r.trigger === 'alert', 'btn:set-trigger-alert', () => set('logicapp.setTrigger', { resourceId: r.id, trigger: 'alert' })),
        choice('Microsoft Sentinel incident', 'When a Microsoft Sentinel incident creation rule was triggered', r.trigger === 'incident', 'btn:set-trigger-incident', () => set('logicapp.setTrigger', { resourceId: r.id, trigger: 'incident' })))),

    h('section', { class: 'blade' }, h('h2', null, 'Identity'),
      h('p', { class: 'muted' }, 'A system-assigned managed identity lets this logic app authenticate to Azure Resource Manager without stored credentials.'),
      h('div', { class: 'row' }, h('span', null, 'System assigned: ', r.identityOn ? badge('On', 'ok') : badge('Off', 'warn')),
        h('button', { class: 'btn', type: 'button', 'data-target': 'btn:identity-on', disabled: r.identityOn, onclick: () => set('logicapp.setIdentity', { resourceId: r.id, systemAssigned: true }) }, 'On'),
        h('button', { class: 'btn', type: 'button', 'data-target': 'btn:identity-off', disabled: !r.identityOn, onclick: () => set('logicapp.setIdentity', { resourceId: r.id, systemAssigned: false }) }, 'Off')),
      r.identityOn ? h('p', { class: 'muted small' }, 'Object (principal) ID: ', h('code', null, r.principalId), '. Use Access control (IAM) on the resource this playbook acts on to give it a role.') : null),

    h('section', { class: 'blade' }, h('h2', null, 'Workflow actions'),
      h('ol', null, r.actions.map((a) => h('li', null, a)))));
}

function choice(title, desc, selected, target, onClick) {
  return h('button', { type: 'button', class: `choice-card ${selected ? 'selected' : ''}`, 'data-target': target, 'aria-pressed': String(selected), onclick: onClick },
    h('strong', null, title), h('span', null, desc), selected ? badge('Current', 'ok') : null);
}
