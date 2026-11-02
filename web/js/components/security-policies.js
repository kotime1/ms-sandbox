// Endpoint security > Attack surface reduction (learn.microsoft.com/defender-endpoint/attack-surface-reduction-overview).
// Three steps: pick the capability (each card says what it is for and where it runs), configure it, assign it to device groups.
// All rules (which capability exists on which platform, which rules accept Warn) come from the server.
import { h, badge } from '../dom.js';
import { table } from './table.js';
import { wizard, row } from './wizard.js';
import { ctx } from '../app.js';

const MODE_LABEL = { block: 'Block', audit: 'Audit', warn: 'Warn' };

export function securityPolicySection(sp) {
  const cap = (id) => sp.capabilities.find((c) => c.id === id);
  const ruleName = (id) => sp.rules.find((r) => r.id === id)?.name ?? id;
  const groupName = (id) => sp.deviceGroups.find((g) => g.id === id)?.name ?? id;
  return h('section', { class: 'blade' },
    h('h2', null, 'Endpoints > Attack surface reduction policies'),
    h('p', { class: 'muted small' }, 'Real path: Endpoints > Configuration management > Endpoint security policies > Create new policy > Attack surface reduction. Pick the capability that matches what you need to stop.'),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:add-security-policy', onclick: () => open(sp) }, '+ Create new policy')),
    table([
      { key: 'name', label: 'Policy' },
      { key: 'type', label: 'Capability', render: (p) => cap(p.type)?.label ?? p.type },
      { key: 'platform', label: 'Platform' },
      { key: 'deviceGroups', label: 'Assigned to', render: (p) => p.deviceGroups.map(groupName).join(', ') },
      { key: 'rules', label: 'Rules', render: (p) => (p.rules.length ? h('ul', { class: 'plain' }, p.rules.map((r) => h('li', null, ruleName(r.rule), ' ', badge(MODE_LABEL[r.mode], r.mode === 'block' ? 'warn' : '')))) : h('span', { class: 'muted' }, 'n/a')) },
      { key: 'id', label: '', render: (p) => h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete ${p.name}`, onclick: async () => { const o = await ctx.act('defender.deleteSecurityPolicy', { id: p.id }); if (o.ok) await ctx.reloadPage(); } }, 'Delete') },
    ], sp.policies, { empty: 'No policies.' }));
}

function open(sp) {
  const state = { name: '', type: '', platform: 'Windows', rules: new Map(), groups: new Set() };
  wizard({
    title: 'Create a policy', finishLabel: 'Create', state,
    steps: [
      {
        id: 'capability', title: 'Capability',
        render(body, _state, api) {
          const cards = h('div', { class: 'choice' }, sp.capabilities.map((c) => h('button', {
            class: `choice-card ${state.type === c.id ? 'selected' : ''}`, type: 'button', 'aria-pressed': String(state.type === c.id), 'data-target': `card:capability:${c.id}`,
            onclick: () => { state.type = c.id; state.rules = new Map(); if (!c.platforms.includes(state.platform)) state.platform = c.platforms[0]; api.rerender(); },
          }, h('strong', null, c.label), h('span', { class: 'muted small' }, c.summary), h('span', { class: 'muted small' }, `Platforms: ${c.platforms.join(', ')}`))));
          const platform = h('select', { 'aria-label': 'Platform', onchange: (e) => { state.platform = e.target.value; } }, sp.platforms.map((p) => h('option', { value: p, selected: p === state.platform }, p)));
          body.append(h('h3', null, 'Choose a capability'), h('p', { class: 'muted' }, 'Each capability protects a different part of the attack surface. Choose the one that fits what you need to stop.'),
            cards, row('Platform', platform));
        },
        validate: (s) => (s.type ? null : 'Choose a capability.'),
      },
      {
        id: 'settings', title: 'Settings',
        render(body) {
          const c = sp.capabilities.find((x) => x.id === state.type);
          body.append(h('h3', null, c.label), row('Policy name', h('input', { type: 'text', maxlength: '80', value: state.name, oninput: (e) => { state.name = e.target.value; } })));
          if (!c.hasRules) { body.append(h('p', { class: 'note' }, `${c.label} has no per-rule settings in this sandbox. Assign it to device groups to finish.`)); return; }
          body.append(h('p', { class: 'muted small' }, 'Leave a rule as Not configured to leave it alone. Rules that do not support Warn are marked.'),
            h('div', { class: 'rule-list' }, sp.rules.map((r) => {
              const sel = h('select', { 'aria-label': r.name, 'data-target': `rule:${r.id}`, onchange: (e) => { e.target.value ? state.rules.set(r.id, e.target.value) : state.rules.delete(r.id); } },
                h('option', { value: '' }, 'Not configured'), sp.modes.map((m) => h('option', { value: m, selected: state.rules.get(r.id) === m, disabled: m === 'warn' && !r.warn }, MODE_LABEL[m] + (m === 'warn' && !r.warn ? ' (not supported)' : ''))));
              return h('div', { class: 'row' }, h('span', null, r.name), sel);
            })));
        },
        validate: (s) => (s.name.trim() ? null : 'Enter a policy name.'),
      },
      {
        id: 'assignments', title: 'Assignments',
        render(body) {
          body.append(h('h3', null, 'Assign to device groups'),
            sp.deviceGroups.map((g) => h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: state.groups.has(g.id), 'data-target': `check:group:${g.name}`, onchange: (e) => { e.target.checked ? state.groups.add(g.id) : state.groups.delete(g.id); } }), ` ${g.name}`)));
        },
      },
    ],
    async onFinish(s, api2) {
      const o = await ctx.act('defender.createSecurityPolicy', { name: s.name.trim(), type: s.type, platform: s.platform, deviceGroups: [...s.groups], rules: [...s.rules].map(([rule, mode]) => ({ rule, mode })) }, { silentError: true });
      if (!o.ok) return o.error.message;
      api2.close(); ctx.toast('Policy created', 'ok'); await ctx.reloadPage();
      return undefined;
    },
  });
}
