import { h, badge, sev } from '../dom.js';
import { table } from '../components/table.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('sentinel-config');
  host.append(
    h('h1', null, 'Analytics'),
    h('p', { class: 'muted' }, 'Rules that turn telemetry into alerts and incidents. Open a rule to review its query logic (where Microsoft publishes it).'),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:create-analytics-rule', onclick: () => create(v.analyticsMeta) }, '+ Create')),
    table([
      { key: 'name', label: 'Name' },
      { key: 'kind', label: 'Rule type' },
      { key: 'severity', label: 'Severity', render: (r) => sev(r.severity) },
      { key: 'enabled', label: 'Status', render: (r) => badge(r.enabled ? 'Enabled' : 'Disabled', r.enabled ? 'ok' : '') },
      { key: 'tactics', label: 'Tactics', render: (r) => r.tactics.join(', ') },
    ], v.analyticsRules, { rowTarget: (r) => `row:rule:${r.id}`, onRowClick: (r) => show(r) }));
}

function show(r) {
  const logic = r.query
    ? h('pre', { class: 'code' }, r.query)
    : h('div', { class: 'note' }, `${r.kind === 'Fusion' ? 'Fusion' : 'Machine learning behavior analytics'} rules are built on proprietary Microsoft algorithms. Their logic cannot be viewed or changed.`);
  const when = r.schedule ? h('p', { class: 'muted' }, `Runs every ${mins(r.schedule.frequencyMinutes)}, looks back ${mins(r.schedule.lookbackMinutes)}, evaluates ${r.schedule.timeBasis}.`) : null;
  modal({ title: r.name, content: [h('div', { class: 'chips' }, badge(r.kind), sev(r.severity)), when, h('h3', null, 'Rule query'), logic], buttons: [{ label: 'Close', onClick: (x) => x.close() }] });
}

const mins = (n) => (n === 1 ? '1 minute' : n % 1440 === 0 ? `${n / 1440} day(s)` : n % 60 === 0 ? `${n / 60} hour(s)` : `${n} minutes`);

// Two-step: pick the rule type (as the + Create menu does), then fill in the wizard for that type.
function create(meta) {
  const m = modal({
    title: 'Create', content: [h('p', { class: 'muted' }, 'Choose the type of analytics rule to create.'), h('div', { class: 'choice' }, meta.kinds.map((k) =>
      h('button', { class: 'choice-card', type: 'button', 'data-target': `btn:create-${k.id.toLowerCase()}-rule`, onclick: () => { m.close(); wizard(meta, k); } }, h('strong', null, k.label), h('span', { class: 'muted small' }, k.summary))))],
    buttons: [{ label: 'Cancel', onClick: (x) => x.close() }],
  });
}

function wizard(meta, kind) {
  const nrt = kind.id === 'NRT';
  const name = h('input', { type: 'text', maxlength: '100', 'aria-label': 'Rule name' });
  const sevSel = h('select', null, meta.severities.map((x) => h('option', { value: x, selected: x === 'Medium' }, x)));
  const q = h('textarea', { class: 'kql', rows: '6', maxlength: '2000', 'aria-label': 'Rule query' });
  const every = h('input', { type: 'number', min: String(meta.min), value: '5' });
  const unit = h('select', null, [['1', 'Minutes'], ['60', 'Hours'], ['1440', 'Days']].map(([v, l]) => h('option', { value: v }, l)));
  const back = h('input', { type: 'number', min: String(meta.min), value: '5' });
  const unit2 = h('select', null, [['1', 'Minutes'], ['60', 'Hours'], ['1440', 'Days']].map(([v, l]) => h('option', { value: v }, l)));
  const entity = h('input', { type: 'checkbox', checked: true });
  const schedule = nrt
    ? h('div', { class: 'note', 'data-target': 'note:nrt-fixed' }, `Query scheduling is fixed for NRT rules: runs every ${meta.nrt.frequencyMinutes} minute, looks up data from the last ${meta.nrt.lookbackMinutes} minute, using ${meta.nrt.timeBasis}.`)
    : h('div', null, field('Run query every', h('div', { class: 'row' }, every, unit)), field('Lookup data from the last', h('div', { class: 'row' }, back, unit2)));
  modal({
    title: nrt ? 'Create NRT query rule' : 'Create scheduled query rule', wide: true,
    content: [
      field('Name', name), field('Severity', sevSel), field('Rule query', q, 'Validated against the workspace tables when you create the rule.'),
      schedule, h('label', null, entity, ' Map entities (needed to investigate incidents in the investigation graph)'),
    ],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Create', primary: true, target: 'btn:save-analytics-rule', onClick: async (x) => {
        const params = { kind: kind.id, name: name.value.trim(), severity: sevSel.value, query: q.value, entityMapping: entity.checked };
        if (!nrt) { params.frequencyMinutes = Number(every.value) * Number(unit.value); params.lookbackMinutes = Number(back.value) * Number(unit2.value); }
        const o = await ctx.act('sentinel.createAnalyticsRule', params, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); ctx.toast(`${kind.label} created`, 'ok'); await ctx.reloadPage();
      } },
    ],
  });
}
