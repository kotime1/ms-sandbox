import { h, badge } from '../dom.js';
import { table } from '../components/table.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('sentinel-config');
  host.append(
    h('h1', null, 'Automation'),
    h('p', { class: 'muted' }, 'Automation rules run in order when an incident is created. A rule can run a playbook that uses the Microsoft Sentinel incident trigger.'),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:create-automation', onclick: () => create(v) }, '+ Create automation rule')),
    h('h2', null, 'Automation rules'),
    table([
      { key: 'order', label: 'Order' },
      { key: 'name', label: 'Name' },
      { key: 'trigger', label: 'Trigger', render: () => 'When incident is created' },
      { key: 'rules', label: 'Analytics rules', render: (a) => (a.rules.length ? a.rules.join(', ') : 'All') },
      { key: 'actions', label: 'Actions', render: (a) => a.actions.map((x) => (x.type === 'runPlaybook' ? `Run playbook: ${x.playbook}` : x.type)).join(', ') },
      { key: 'enabled', label: 'Status', render: (a) => badge(a.enabled ? 'Enabled' : 'Disabled', a.enabled ? 'ok' : '') },
      { key: 'id', label: '', render: (a) => h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete ${a.name}`, onclick: async () => { if (confirm(`Delete automation rule "${a.name}"?`)) { const o = await ctx.act('sentinel.deleteAutomationRule', { id: a.id }); if (o.ok) await ctx.reloadPage(); } } }, 'Delete') },
    ], v.automationRules, { empty: 'No automation rules yet.' }),
    h('h2', null, 'Playbooks'),
    table([{ key: 'name', label: 'Name' }, { key: 'trigger', label: 'Trigger type', render: (p) => (p.trigger === 'incident' ? 'Microsoft Sentinel incident' : 'Microsoft Sentinel alert') }], v.playbooks, { empty: 'No playbooks in this lab.' }));
}

function create(v) {
  const name = h('input', { type: 'text', maxlength: '80', value: 'New automation rule' });
  const rule = h('select', null, h('option', { value: '' }, 'All analytics rules'), v.analyticsRules.map((r) => h('option', { value: r.id }, r.name)));
  const pb = h('select', null, v.playbooks.map((p) => h('option', { value: p.id }, `${p.name} (${p.trigger === 'incident' ? 'incident trigger' : 'alert trigger'})`)));
  modal({
    title: 'Create new automation rule',
    content: [
      field('Automation rule name', name),
      h('div', { class: 'field' }, h('strong', null, 'Trigger: '), 'When incident is created'),
      field('If analytics rule name equals', rule),
      field('Action: Run playbook', pb, v.playbooks.length ? 'Playbooks whose trigger is not the incident trigger are rejected on save.' : 'There are no playbooks to choose from.'),
    ],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Apply', primary: true, target: 'btn:apply-automation', onClick: async (x) => {
        if (!pb.value) { x.setError('Choose a playbook.'); return; }
        const out = await ctx.act('sentinel.createAutomationRule', { name: name.value, ruleIds: rule.value ? [rule.value] : [], playbookId: pb.value }, { silentError: true });
        if (!out.ok) { x.setError(out.error.message); return; }
        x.close(); ctx.toast('Automation rule created', 'ok'); await ctx.reloadPage();
      } },
    ],
  });
}
