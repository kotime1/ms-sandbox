// Microsoft Sentinel > Configuration > Automation  (Defender portal)
import { h, badge, fmtTime } from '../dom.js';
import { table } from '../components/table.js';
import { openAutomationPanel } from '../components/automation-panel.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('sentinel-config');
  const meta = v.automationMeta;

  // "Manage playbook permissions": grant Sentinel the Automation Contributor role on each chosen resource group.
  // Returns true on success so the panel can refresh its playbook list without closing.
  const grantPermission = async (lacking, panel) => {
    const groups = [...new Set(lacking.map((p) => p.rg))];
    for (const rg of groups) {
      if (!confirm(`Grant Microsoft Sentinel permission on resource group "${rg}"? (Needs the Owner role on it.)`)) return false;
      const o = await ctx.act('sentinel.grantPlaybookPermission', { resourceGroup: rg }, { silentError: true, noRefresh: true });
      if (!o.ok) { panel.setError(o.error.message); return false; }
    }
    panel.setError('');
    ctx.toast('Microsoft Sentinel can now run the playbooks in that resource group', 'ok');
    await ctx.refresh();
    return true;
  };
  const open = (existing = null) => openAutomationPanel({ meta, existing, grantPermission });

  host.append(
    h('h1', null, 'Automation'),
    h('p', { class: 'muted' }, 'Real path: Microsoft Sentinel > Configuration > Automation. Automation rules run in order for their trigger type. Each trigger type has its own queue.'),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:create-automation', onclick: () => open() }, '+ Create ▾ Automation rule')),
    h('h2', null, 'Automation rules'),
    table([
      { key: 'order', label: 'Order' },
      { key: 'name', label: 'Name', render: (a) => h('span', null, a.name, a.expired ? [' ', badge('Expired', 'warn')] : null) },
      { key: 'triggerLabel', label: 'Trigger' },
      { key: 'conditions', label: 'Conditions', render: (a) => (a.summary.conditions.length ? h('ul', { class: 'tight' }, a.summary.conditions.map((c) => h('li', null, c))) : h('span', { class: 'muted' }, 'None (all)')) },
      { key: 'actions', label: 'Actions', render: (a) => h('ol', { class: 'tight' }, a.summary.actions.map((x) => h('li', null, x))) },
      { key: 'expiresAt', label: 'Expires', render: (a) => (a.expiresAt ? fmtTime(new Date(a.expiresAt).toISOString()) : 'Indefinite') },
      { key: 'enabled', label: 'Status', render: (a) => badge(a.enabled ? 'Enabled' : 'Disabled', a.enabled ? 'ok' : '') },
      { key: 'id', label: '', render: (a) => h('span', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => open(a) }, 'Edit'),
        h('button', { class: 'btn small', type: 'button', onclick: async () => { const o = await ctx.act('sentinel.setAutomationRuleEnabled', { id: a.id, enabled: !a.enabled }); if (o.ok) await ctx.reloadPage(); } }, a.enabled ? 'Disable' : 'Enable'),
        h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete ${a.name}`, onclick: async () => { if (confirm(`Delete automation rule "${a.name}"?`)) { const o = await ctx.act('sentinel.deleteAutomationRule', { id: a.id }); if (o.ok) await ctx.reloadPage(); } } }, 'Delete')) },
    ], v.automationRules, { empty: 'No automation rules yet.' }),
    h('h2', null, 'Active playbooks'),
    table([
      { key: 'name', label: 'Name' },
      { key: 'trigger', label: 'Trigger type', render: (p) => (p.trigger === 'incident' ? 'Microsoft Sentinel incident' : 'Microsoft Sentinel alert') },
      { key: 'sentinelCanRun', label: 'Sentinel can run it', render: (p) => (p.sentinelCanRun ? badge('Yes', 'ok') : badge('No: grant permission on its resource group', 'warn')) },
    ], meta.playbooks, { empty: 'No playbooks in this lab.' }));
}
