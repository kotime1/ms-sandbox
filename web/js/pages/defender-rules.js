// Settings-style page. Real locations (learn.microsoft.com):
//   Endpoints > Indicators         : Settings > Endpoints > Rules > Indicators         (defender-endpoint/indicator-file)
//   Advanced features              : Settings > Endpoints > General > Advanced features
//   Custom detection rules         : Investigation & response > Hunting > Custom detection rules
//   Tenant Allow/Block Lists       : Email & collaboration > Policies & rules > Threat policies > Tenant Allow/Block Lists
//                                    (a Defender for Office 365 / EOP email feature)
import { h, badge, sev, fmtTime } from '../dom.js';
import { openDetectionWizard } from '../components/detection-wizard.js';
import { table } from '../components/table.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

const ACTIONS = [['allow', 'Allow'], ['audit', 'Audit'], ['warn', 'Warn'], ['block', 'Block execution'], ['blockRemediate', 'Block and remediate']];
const actionLabel = (a) => ACTIONS.find(([v]) => v === a)?.[1] ?? a;
const ACTION_LABELS = { isolateDevice: 'Isolate device', collectPackage: 'Collect package', runAvScan: 'AV scan', initiateInvestigation: 'Investigate', restrictAppExecution: 'Restrict apps', blockFile: 'Block file', quarantineFile: 'Quarantine', markCompromised: 'Mark compromised', disableUser: 'Disable user', resetUserAuth: 'Reset auth', moveToFolder: 'Move email', deleteEmail: 'Delete email' };

export async function render(host) {
  const [v, f] = await Promise.all([ctx.view('defender'), ctx.view('defender-files')]);
  const groupName = (id) => f.deviceGroups.find((g) => g.id === id)?.name ?? id;

  host.append(
    h('h1', null, 'Settings'),
    h('p', { class: 'muted' }, 'A simplified view of several Settings pages. Each section names the real path.'),

    // ---- Endpoints > Indicators
    h('section', { class: 'blade' },
      h('h2', null, 'Endpoints > Indicators'),
      h('p', { class: 'muted small' }, 'Real path: Settings > Endpoints > Rules > Indicators > File hashes. An indicator has an Indicator (the hash), an Action and a Scope (device groups).'),
      h('div', { class: 'row' },
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: f.advancedFeatures.allowOrBlockFile, 'data-target': 'toggle:allow-or-block-file', onchange: async (e) => {
          const o = await ctx.act('defender.setAdvancedFeature', { feature: 'allowOrBlockFile', enabled: e.target.checked });
          if (o.ok) await ctx.reloadPage();
        } }), ' Allow or block file (Settings > Endpoints > General > Advanced features)'),
      ),
      f.advancedFeatures.allowOrBlockFile ? null : h('p', { class: 'muted small' }, 'Off: Block indicators are saved but do not block. Allow indicators still apply.'),
      h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:add-indicator', onclick: () => addIndicator(f) }, '+ Add item')),
      table([
        { key: 'value', label: 'Indicator', render: (i) => h('span', null, h('code', { class: 'hash', title: i.value }, i.value), ' ', badge(i.type)) },
        { key: 'action', label: 'Action', render: (i) => actionLabel(i.action) },
        { key: 'targets', label: 'Scope', render: (i) => (i.targets.length ? i.targets.map(groupName).join(', ') : h('em', null, 'No scope: applies to no device')) },
        { key: 'status', label: 'Status', render: (i) => badge(i.status, i.status === 'Active' ? 'ok' : 'warn') },
        { key: 'id', label: '', render: (i) => h('span', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: () => editTargets(i, f) }, 'Edit scope'),
          h('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Delete indicator', onclick: async () => { const o = await ctx.act('defender.deleteIndicator', { id: i.id }); if (o.ok) await ctx.reloadPage(); } }, 'Delete')) },
      ], f.indicators, { empty: 'No indicators.' }),
      h('h3', null, 'Files known to the tenant'),
      f.files.length
        ? table([
          { key: 'name', label: 'File' },
          { key: 'sha256', label: 'SHA-256', render: (x) => h('code', { class: 'hash', title: x.sha256 }, x.sha256) },
          { key: 'state', label: 'State by device group', render: (x) => deviceStates(x, v, f) },
          { key: 'analysis', label: 'Deep analysis', render: (x) => (x.analysis ? badge(x.analysis.verdict, x.analysis.verdict === 'Clean' ? 'ok' : 'warn') : badge('Not analysed')) },
          { key: 'id', label: '', render: (x) => h('button', { class: 'btn small', type: 'button', 'data-target': `btn:open-file:${x.name}`, onclick: () => fileDialog(x, f) }, 'Open') },
        ], f.files, { rowTarget: (x) => `row:file:${x.name}` })
        : h('div', { class: 'empty' }, 'No files are known to the tenant in this lab.')),

    // ---- Custom detection rules
    h('section', { class: 'blade' },
      h('h2', null, 'Custom detection rules'),
      h('p', { class: 'muted small' }, 'Real path: Investigation & response > Hunting > Custom detection rules.'),
      h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:create-detection-rule', onclick: () => openDetectionWizard({ devices: v.devices, groups: f.deviceGroups }) }, '+ Create detection rule')),
      table([
        { key: 'name', label: 'Name', render: (d) => h('span', null, d.name, d.truncated ? [' ', badge('150-alert cap hit', 'warn')] : null) },
        { key: 'severity', label: 'Severity', render: (d) => sev(d.severity) },
        { key: 'frequencyLabel', label: 'Frequency', render: (d) => h('span', null, d.frequencyLabel, h('div', { class: 'muted small' }, `lookback: ${d.lookback}`)) },
        { key: 'scope', label: 'Scope', render: (d) => (d.scope.type === 'all' ? 'All devices' : d.scope.groups.map(groupName).join(', ')) },
        { key: 'actions', label: 'Actions', render: (d) => (d.actions.length ? d.actions.map((a) => badge(ACTION_LABELS[a] ?? a, a === 'isolateDevice' ? 'warn' : '')) : 'None') },
        { key: 'lastRun', label: 'Last run', render: (d) => (d.lastRun ? h('span', null, fmtTime(d.lastRun), h('div', { class: 'muted small' }, `${d.lastAlerts} alert(s)`)) : '') },
        { key: 'enabled', label: 'Status', render: (d) => badge(d.enabled ? 'On' : 'Off', d.enabled ? 'ok' : '') },
        { key: 'id', label: '', render: (d) => h('span', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: () => openDetectionWizard({ existing: d, devices: v.devices, groups: f.deviceGroups }) }, 'Edit'),
          h('button', { class: 'btn small', type: 'button', onclick: async () => { const o = await ctx.act('defender.setDetectionEnabled', { id: d.id, enabled: !d.enabled }); if (o.ok) await ctx.reloadPage(); } }, d.enabled ? 'Turn off' : 'Turn on'),
          h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete ${d.name}`, onclick: async () => { if (confirm(`Delete detection "${d.name}"?`)) { const o = await ctx.act('defender.deleteDetection', { id: d.id }); if (o.ok) await ctx.reloadPage(); } } }, 'Delete')) },
      ], v.detections, { empty: 'No custom detection rules. Create one here, or from Advanced hunting.' }),
      v.alerts.some((a) => a.source === 'Custom detection')
        ? h('div', null, h('h3', null, 'Alerts raised by detections'),
          table([{ key: 'title', label: 'Alert' }, { key: 'device', label: 'Device' }, { key: 'severity', label: 'Severity', render: (a) => sev(a.severity) }, { key: 'action', label: 'Automatic action', render: (a) => a.action ?? '' }], v.alerts.filter((a) => a.source === 'Custom detection')))
        : null),

    // ---- Tenant Allow/Block List (email)
    h('section', { class: 'blade' },
      h('h2', null, 'Tenant Allow/Block List (email)'),
      h('div', { class: 'note' }, h('strong', null, 'This is an email feature. '), 'It belongs to Microsoft Defender for Office 365 / Exchange Online Protection and filters email attachments, URLs and senders. It does not release a file that Defender for Endpoint blocked on a device. Real path: Email & collaboration > Policies & rules > Threat policies > Tenant Allow/Block Lists.'),
      h('p', { class: 'muted small' }, 'You cannot create file Allow entries directly: allows are created from the Submissions page. Block entries can be added here.'),
      h('div', { class: 'toolbar' }, h('button', { class: 'btn', type: 'button', 'data-target': 'btn:add-allowblock', onclick: () => addAllowBlock(f) }, '+ Add')),
      table([
        { key: 'kind', label: 'Type' },
        { key: 'value', label: 'Value', render: (e) => h('code', { class: 'hash', title: e.value }, e.value) },
        { key: 'action', label: 'Action', render: (e) => badge(e.action, e.action === 'allow' ? 'ok' : 'warn') },
        { key: 'expiry', label: 'Expires' },
        { key: 'id', label: '', render: (e) => h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Remove ${e.kind} entry`, onclick: async () => { const o = await ctx.act('defender.deleteAllowBlock', { id: e.id }); if (o.ok) await ctx.reloadPage(); } }, 'Remove') },
      ], f.allowBlock, { empty: 'No entries.' })));
}

/** Where a file is blocked, summarised by device group (the trainee sees state, never the verdict). */
function deviceStates(file, v, f) {
  const byGroup = new Map();
  for (const d of v.devices) {
    const s = file.perDevice[d.id];
    if (!s) continue;
    for (const g of (d.groups.length ? d.groups : ['(none)'])) {
      const key = f.deviceGroups.find((x) => x.id === g)?.name ?? g;
      if (!byGroup.has(key)) byGroup.set(key, new Set());
      byGroup.get(key).add(s);
    }
  }
  return h('span', null, [...byGroup].map(([g, states]) => h('div', null, `${g}: `, badge([...states].join(' / '), [...states].every((s) => s === 'Allow' || s === 'Not blocked') ? 'ok' : 'warn'))));
}

function hashHelper(f, type, value) {
  return f.files.length ? h('div', { class: 'hint-text' }, 'Known file hashes: ', f.files.map((x) => h('button', { class: 'btn small', type: 'button', title: x.sha256, onclick: () => { value.value = x.sha256; if (type) type.value = 'file'; } }, x.name))) : null;
}

function addAllowBlock(f) {
  const kind = h('select', null, ['file', 'url', 'sender'].map((k) => h('option', { value: k }, k)));
  const value = h('input', { type: 'text', maxlength: '300', placeholder: 'SHA-256, URL or sender' });
  const action = h('select', null, h('option', { value: 'block' }, 'Block'), h('option', { value: 'allow' }, 'Allow'));
  modal({
    title: 'Add to the Tenant Allow/Block List', wide: true,
    content: [h('p', { class: 'muted' }, 'Email filtering only.'), field('Type', kind), field('Value', value), hashHelper(f, kind, value), field('Action', action)],
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
  const value = h('input', { type: 'text', maxlength: '300', placeholder: 'SHA-256 file hash' });
  const action = h('select', null, ACTIONS.map(([v, l]) => h('option', { value: v }, l)));
  const targets = h('select', { multiple: true, size: String(Math.max(3, f.deviceGroups.length)), 'aria-label': 'Scope' }, f.deviceGroups.map((g) => h('option', { value: g.id }, g.name)));
  modal({
    title: 'Add file hash indicator', wide: true,
    content: [
      field('Indicator (SHA-256)', value), hashHelper(f, null, value),
      field('Action', action),
      field('Scope (device groups)', targets, 'With no scope, the indicator applies to no device. A group scope wins over All devices.'),
    ],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Save', primary: true, target: 'btn:save-indicator', onClick: async (x) => {
        const o = await ctx.act('defender.createIndicator', { type: 'file', value: value.value.trim(), action: action.value, targets: [...targets.selectedOptions].map((o2) => o2.value) }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); ctx.toast('Indicator saved', 'ok'); await ctx.reloadPage();
      } },
    ],
  });
}

function editTargets(i, f) {
  const targets = h('select', { multiple: true, size: String(Math.max(3, f.deviceGroups.length)), 'aria-label': 'Scope' }, f.deviceGroups.map((g) => h('option', { value: g.id, selected: i.targets.includes(g.id) }, g.name)));
  modal({
    title: 'Edit indicator scope',
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
      h('dl', { class: 'kv' }, h('dt', null, 'SHA-256'), h('dd', null, h('code', { class: 'hash' }, x.sha256)), h('dt', null, 'Status'), h('dd', null, x.blocked ? `Blocked by ${x.blockedBy ?? 'an indicator'}` : 'Not blocked')),
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
