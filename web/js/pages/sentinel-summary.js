import { h } from '../dom.js';
import { table } from '../components/table.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('sentinel-summary');
  host.append(
    h('h1', null, 'Summary rules'),
    h('p', { class: 'muted' }, 'Run a KQL aggregation on a schedule and write the results to a new custom log table, so analysts can query a small table instead of the raw data.'),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:create-summary-rule', onclick: () => create(v) }, '+ Create')),
    table([
      { key: 'name', label: 'Name' },
      { key: 'source', label: 'Source table' },
      { key: 'destination', label: 'Destination table', render: (r) => h('code', null, r.destination) },
      { key: 'binMinutes', label: 'Runs every', render: (r) => `${r.binMinutes} min` },
      { key: 'rowsWritten', label: 'Rows written' },
      { key: 'query', label: 'Query', render: (r) => h('code', { class: 'inline-q' }, r.query) },
    ], v.rules, { empty: 'No summary rules.' }));
}

function create(v) {
  const name = h('input', { type: 'text', maxlength: '80', value: 'My summary rule' });
  const source = h('select', null, v.sources.map((s) => h('option', { value: s }, s)));
  const dest = h('input', { type: 'text', maxlength: '60', placeholder: 'MyTable_CL' });
  const bin = h('select', null, [['20', '20 minutes'], ['60', '1 hour'], ['180', '3 hours'], ['1440', '1 day']].map(([val, l]) => h('option', { value: val, selected: val === '60' }, l)));
  const q = h('textarea', { class: 'kql', rows: '6', maxlength: '2000', 'aria-label': 'Summary query' });
  q.value = 'SourceTable\n| summarize Count=count() by bin(TimeGenerated, 1h)';
  modal({
    title: 'Create a new summary rule', wide: true,
    content: [
      field('Rule name', name), field('Source table', source), field('Destination table (new, ends in _CL)', dest),
      field('Run every', bin), field('Query', q, 'Must aggregate with summarize and return a TimeGenerated column.'),
    ],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Save', primary: true, target: 'btn:save-summary-rule', onClick: async (x) => {
        const o = await ctx.act('sentinel.createSummaryRule', { name: name.value, source: source.value, destination: dest.value.trim(), query: q.value, binMinutes: bin.value }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); ctx.toast(`Summary rule created. ${o.data.rule.rowsWritten} row(s) written to ${o.data.rule.destination}`, 'ok'); await ctx.reloadPage();
      } },
    ],
  });
}
