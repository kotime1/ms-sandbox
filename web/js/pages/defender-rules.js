import { h, badge, sev } from '../dom.js';
import { table } from '../components/table.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  const [v, f] = await Promise.all([ctx.view('defender'), ctx.view('defender-files')]);
  host.append(
    h('h1', null, 'Rules'),
    h('p', { class: 'muted' }, 'Custom detections, the Tenant Allow/Block List, and custom indicators.'),

    h('h2', null, 'Custom detection rules'),
    table([
      { key: 'name', label: 'Name' },
      { key: 'severity', label: 'Severity', render: (d) => sev(d.severity) },
      { key: 'actions', label: 'Actions', render: (d) => (d.actions.includes('isolateDevice') ? badge('Isolate device', 'warn') : 'None') },
      { key: 'enabled', label: 'Status', render: (d) => badge(d.enabled ? 'On' : 'Off', d.enabled ? 'ok' : '') },
      { key: 'query', label: 'Query', render: (d) => h('code', { class: 'inline-q' }, d.query) },
      { key: 'id', label: '', render: (d) => h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete ${d.name}`, onclick: async () => { if (confirm(`Delete detection "${d.name}"?`)) { const o = await ctx.act('defender.deleteDetection', { id: d.id }); if (o.ok) await ctx.reloadPage(); } } }, 'Delete') },
    ], v.detections, { empty: 'No custom detection rules. Create one from Advanced hunting.' }),
    v.alerts.some((a) => a.source === 'Custom detection')
      ? h('div', null, h('h3', null, 'Alerts raised by detections'),
        table([{ key: 'title', label: 'Alert' }, { key: 'device', label: 'Device' }, { key: 'severity', label: 'Severity', render: (a) => sev(a.severity) }, { key: 'action', label: 'Automatic action', render: (a) => a.action ?? '' }], v.alerts.filter((a) => a.source === 'Custom detection')))
      : null,

    h('h2', null, 'Tenant Allow/Block List'),
    h('p', { class: 'muted' }, 'Explicitly allow or block a specific file, URL or sender. An allow entry for a file takes effect immediately.'),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:add-allowblock', onclick: () => addAllowBlock(f) }, '+ Add')),
    table([
      { key: 'kind', label: 'Type' },
      { key: 'value', label: 'Value', render: (e) => h('code', null, e.value) },
      { key: 'action', label: 'Action', render: (e) => badge(e.action, e.action === 'allow' ? 'ok' : 'warn') },
      { key: 'expiry', label: 'Expires' },
      { key: 'id', label: '', render: (e) => h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Remove ${e.kind} entry`, onclick: async () => { const o = await ctx.act('defender.deleteAllowBlock', { id: e.id }); if (o.ok) await ctx.reloadPage(); } }, 'Remove') },
    ], f.allowBlock, { empty: 'No entries.' }),

    h('h2', null, 'Files'),
    f.files.length
      ? table([
        { key: 'name', label: 'File' },
        { key: 'sha256', label: 'SHA-256', render: (x) => h('code', { class: 'hash' }, x.sha256) },
        { key: 'blocked', label: 'Status', render: (x) => (x.blocked ? badge(`Blocked${x.blockedBy ? ` by ${x.blockedBy}` : ''}`, 'warn') : badge('Not blocked', 'ok')) },
        { key: 'analysis', label: 'Deep analysis', render: (x) => (x.analysis ? badge(x.analysis.verdict, x.analysis.verdict === 'Clean' ? 'ok' : 'warn') : badge('Not analysed')) },
        { key: 'id', label: '', render: (x) => h('button', { class: 'btn small', type: 'button', 'data-target': `btn:open-file:${x.name}`, onclick: () => fileDialog(x, f) }, 'Open') },
      ], f.files, { rowTarget: (x) => `row:file:${x.name}` })
      : h('div', { class: 'empty' }, 'No files are known to the tenant in this lab.'),

    h('h2', null, 'Indicators'),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn', type: 'button', 'data-target': 'btn:add-indicator', onclick: () => addIndicator(f) }, '+ Add indicator')),
    table([
      { key: 'type', label: 'Type' },
      { key: 'value', label: 'Value', render: (i) => h('code', { class: 'hash' }, i.value) },
      { key: 'action', label: 'Action' },
      { key: 'status', label: 'Status', render: (i) => badge(i.status, i.status === 'Active' ? 'ok' : 'warn') },
      { key: 'targets', label: 'Targets', render: (i) => (i.targets.length ? i.targets.map((t) => f.deviceGroups.find((g) => g.id === t)?.name ?? t).join(', ') : h('em', null, 'None: this indicator is not applied anywhere')) },
      { key: 'id', label: '', render: (i) => h('span', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => editTargets(i, f) }, 'Edit targets'),
        h('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Delete indicator', onclick: async () => { const o = await ctx.act('defender.deleteIndicator', { id: i.id }); if (o.ok) await ctx.reloadPage(); } }, 'Delete')) },
    ], f.indicators, { empty: 'No custom indicators.' }));
}

function addAllowBlock(f) {
  const kind = h('select', null, ['file', 'url', 'sender'].map((k) => h('option', { value: k }, k)));
  const value = h('input', { type: 'text', maxlength: '300', placeholder: 'SHA-256, URL or sender' });
  const action = h('select', null, h('option', { value: 'allow' }, 'Allow'), h('option', { value: 'block' }, 'Block'));
  const known = f.files.length ? h('div', { class: 'hint-text' }, 'Known file hashes: ', f.files.map((x) => h('button', { class: 'btn small', type: 'button', title: x.sha256, onclick: () => { value.value = x.sha256; kind.value = 'file'; } }, x.name))) : null;
  modal({
    title: 'Add to the Tenant Allow/Block List', wide: true,
    content: [field('Type', kind), field('Value', value), known, field('Action', action)],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Add', primary: true, target: 'btn:save-allowblock', onClick: async (x) => {
        const o = await ctx.act('defender.addAllowBlock', { kind: kind.value, value: value.value.trim(), action: action.value }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); ctx.toast('Entry added', 'ok'); await ctx.reloadPage();
      } },
    ],
  });
}

function addIndicator(f) {
  const type = h('select', null, ['file', 'ip', 'url'].map((k) => h('option', { value: k }, k)));
  const value = h('input', { type: 'text', maxlength: '300' });
  const action = h('select', null, [['allow', 'Allow'], ['alert', 'Alert only'], ['block', 'Alert and block']].map(([v, l]) => h('option', { value: v }, l)));
  const targets = h('select', { multiple: true, size: '3', 'aria-label': 'Targets' }, f.deviceGroups.map((g) => h('option', { value: g.id }, g.name)));
  const known = f.files.length ? h('div', { class: 'hint-text' }, 'Known file hashes: ', f.files.map((x) => h('button', { class: 'btn small', type: 'button', title: x.sha256, onclick: () => { value.value = x.sha256; type.value = 'file'; } }, x.name))) : null;
  modal({
    title: 'Add indicator', wide: true,
    content: [field('Type', type), field('Value', value), known, field('Action', action), field('Targets (device groups)', targets, 'An indicator with no target is saved but stays Inactive.')],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Save', primary: true, onClick: async (x) => {
        const o = await ctx.act('defender.createIndicator', { type: type.value, value: value.value.trim(), action: action.value, targets: [...targets.selectedOptions].map((o2) => o2.value) }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); ctx.toast('Indicator saved', 'ok'); await ctx.reloadPage();
      } },
    ],
  });
}

function editTargets(i, f) {
  const targets = h('select', { multiple: true, size: '3', 'aria-label': 'Targets' }, f.deviceGroups.map((g) => h('option', { value: g.id, selected: i.targets.includes(g.id) }, g.name)));
  modal({
    title: 'Edit indicator targets',
    content: [field('Device groups', targets)],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Save', primary: true, onClick: async (x) => {
        const o = await ctx.act('defender.setIndicatorTargets', { id: i.id, targets: [...targets.selectedOptions].map((o2) => o2.value) }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); await ctx.reloadPage();
      } },
    ],
  });
}

function fileDialog(x, f) {
  modal({
    title: x.name, wide: true,
    content: [
      h('dl', { class: 'kv' }, h('dt', null, 'SHA-256'), h('dd', null, h('code', { class: 'hash' }, x.sha256)), h('dt', null, 'Status'), h('dd', null, x.blocked ? `Blocked by ${x.blockedBy}` : 'Not blocked')),
      x.analysis
        ? h('div', null, h('h3', null, 'Deep analysis'), h('p', null, 'Verdict: ', badge(x.analysis.verdict, x.analysis.verdict === 'Clean' ? 'ok' : 'warn')), h('ul', null, x.analysis.behaviors.map((b) => h('li', null, b))))
        : h('p', { class: 'muted' }, 'This file has not been submitted for deep analysis.'),
    ],
    buttons: [
      { label: 'Close', onClick: (m) => m.close() },
      { label: 'Submit for deep analysis', target: 'btn:deep-analysis', onClick: async (m) => {
        const o = await ctx.act('defender.submitDeepAnalysis', { sha256: x.sha256 }, { silentError: true });
        if (!o.ok) { m.setError(o.error.message); return; }
        m.close(); ctx.toast('Deep analysis complete', 'ok'); await ctx.reloadPage();
      } },
      { label: 'Add indicator', primary: true, onClick: (m) => { m.close(); addIndicator(f); } },
    ],
  });
}
