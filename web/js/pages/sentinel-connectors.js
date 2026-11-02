// Microsoft Sentinel > Configuration > Data connectors, plus the Logs Ingestion API setup (custom table -> DCR -> send data).
// Real paths: Configuration > Data connectors (learn.microsoft.com/azure/sentinel/sentinel-tables-connectors-reference);
//             Log Analytics workspace > Tables, and Monitor > Data Collection Rules (azure-monitor/logs/logs-ingestion-api-overview).
// The order matters and is enforced by the server: the table must exist before a DCR can point at it.
import { h, badge } from '../dom.js';
import { table } from '../components/table.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('ingestion');
  host.append(
    h('h1', null, 'Data connectors'),
    h('p', { class: 'muted' }, 'Real path: Microsoft Sentinel > Configuration > Data connectors. Pick the connector that carries the data you need; connecting it makes its tables appear in Advanced hunting.'),
    h('div', { class: 'cards' }, v.catalogue.map(card)),
    v.other.length ? h('div', null, h('h3', null, 'Other connectors'), table([{ key: 'name', label: 'Connector' }, { key: 'status', label: 'Status', render: (c) => badge(c.status, c.status === 'Connected' ? 'ok' : '') }, { key: 'tables', label: 'Tables', render: (c) => c.tables.join(', ') || 'none' }], v.other)) : null,
    ingestionSection(v));
}

function card(c) {
  return h('article', { class: 'card', 'data-target': `card:connector:${c.name}` },
    h('h2', null, c.name), h('p', null, c.blurb),
    h('p', { class: 'muted small' }, `Tables: ${c.tables.join(', ')}`),
    c.connected ? h('p', null, badge('Connected', 'ok'), c.connectedApps.length ? ` ${c.connectedApps.join(', ')}` : '') : null,
    h('button', { class: 'btn primary', type: 'button', 'data-target': `btn:open-connector:${c.id}`, onclick: () => openConnector(c) }, c.connected ? 'Open connector page' : 'Open connector page'));
}

function openConnector(c) {
  const boxes = c.apps.map((a) => h('label', { class: 'toggle' }, h('input', { type: 'checkbox', value: a, checked: c.connectedApps.includes(a), 'data-target': `check:app:${a}` }), ` ${a}`));
  modal({
    title: c.name,
    content: [h('p', { class: 'muted' }, c.blurb), c.apps.length ? h('div', { class: 'field' }, h('label', null, 'Connect these apps'), h('div', { class: 'row' }, boxes)) : h('p', { class: 'muted small' }, 'No app selection for this connector.'),
      h('p', { class: 'muted small' }, `Data types: ${c.tables.join(', ')}`)],
    buttons: [
      { label: 'Close', onClick: (x) => x.close() },
      { label: c.connected ? 'Apply changes' : 'Connect', primary: true, target: 'btn:connect', onClick: async (x) => {
        const apps = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
        const o = await ctx.act('sentinel.connectConnector', { id: c.id, apps }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); ctx.toast(`${c.name} connected`, 'ok'); await ctx.reloadPage();
      } },
    ],
  });
}

// ---- Logs Ingestion API: table -> data collection rule -> send data
function ingestionSection(v) {
  return h('section', { class: 'blade' },
    h('h2', null, 'Custom data: Logs Ingestion API'),
    h('p', { class: 'muted small' }, 'For an application that sends JSON to Azure Monitor: create the custom table first, then a data collection rule (DCR) that points at it, then send records through the DCR.'),
    h('h3', null, '1. Custom tables'),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn', type: 'button', 'data-target': 'btn:create-table', onclick: () => createTable(v) }, '+ Create custom table')),
    table([{ key: 'name', label: 'Table' }, { key: 'columns', label: 'Columns', render: (t) => t.columns.map((c) => `${c.name} (${c.type})`).join(', ') }, { key: 'rows', label: 'Rows' }], v.tables, { empty: 'No custom tables.' }),
    h('h3', null, '2. Data collection rules'),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn', type: 'button', 'data-target': 'btn:create-dcr', onclick: () => createDcr(v) }, '+ Create data collection rule')),
    table([{ key: 'name', label: 'Rule' }, { key: 'table', label: 'Destination table' }, { key: 'stream', label: 'Stream', render: (d) => h('code', null, d.stream) }, { key: 'columns', label: 'Declared columns', render: (d) => d.columns.map((c) => c.name).join(', ') },
      { key: 'id', label: '', render: (d) => h('button', { class: 'btn small', type: 'button', 'data-target': `btn:send:${d.name}`, onclick: () => send(d) }, 'Send sample data') }], v.dcrs, { empty: 'No data collection rules.' }));
}

function columnEditor(types, initial) {
  const list = h('div', null);
  const rows = [];
  const add = (name = '', type = 'string') => {
    const n = h('input', { type: 'text', maxlength: '45', value: name, 'aria-label': 'Column name', placeholder: 'Column name' });
    const t = h('select', { 'aria-label': 'Column type' }, types.map((x) => h('option', { value: x, selected: x === type }, x)));
    const row = h('div', { class: 'row' }, n, t);
    rows.push({ n, t, row }); list.append(row);
  };
  (initial.length ? initial : [['', 'string']]).forEach(([n, t]) => add(n, t));
  return { node: h('div', { class: 'field' }, h('label', null, 'Columns'), list, h('button', { class: 'btn small', type: 'button', onclick: () => add() }, '+ Add column')),
    value: () => rows.filter((r) => r.n.value.trim()).map((r) => ({ name: r.n.value.trim(), type: r.t.value })) };
}

function createTable(v) {
  const name = h('input', { type: 'text', maxlength: '60', placeholder: 'MyTable_CL', 'aria-label': 'Table name' });
  const cols = columnEditor(v.columnTypes, []);
  modal({
    title: 'Create a custom log table', wide: true,
    content: [field('Table name', name, 'Custom table names end in _CL. TimeGenerated is added for you.'), cols.node],
    buttons: [{ label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Create', primary: true, target: 'btn:save-table', onClick: async (x) => {
        const o = await ctx.act('sentinel.createCustomTable', { name: name.value.trim(), columns: cols.value() }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); await ctx.reloadPage();
      } }],
  });
}

function createDcr(v) {
  const name = h('input', { type: 'text', maxlength: '60', 'aria-label': 'Rule name' });
  const tbl = h('input', { type: 'text', maxlength: '60', placeholder: 'MyTable_CL', 'aria-label': 'Destination table' });
  const cols = columnEditor(v.columnTypes, []);
  modal({
    title: 'Create a data collection rule', wide: true,
    content: [field('Rule name', name), field('Destination table', tbl, 'The table must already exist.'), cols.node],
    buttons: [{ label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Create', primary: true, target: 'btn:save-dcr', onClick: async (x) => {
        const o = await ctx.act('sentinel.createDcr', { name: name.value.trim(), table: tbl.value.trim(), columns: cols.value() }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); await ctx.reloadPage();
      } }],
  });
}

function send(d) {
  const inputs = d.columns.map((c) => ({ c, input: h('input', { type: 'text', maxlength: '200', 'aria-label': c.name, placeholder: c.type === 'datetime' ? '2026-11-02T10:00:00Z' : c.type }) }));
  modal({
    title: `Send one record to ${d.name}`, wide: true,
    content: [h('p', { class: 'muted small' }, `POST to the stream ${d.stream}. Leave a field blank to omit it.`), ...inputs.map(({ c, input }) => field(`${c.name} (${c.type})`, input))],
    buttons: [{ label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Send', primary: true, target: 'btn:send-record', onClick: async (x) => {
        const pairs = inputs.filter(({ input }) => input.value.trim()).map(({ c, input }) => ({ name: c.name, value: input.value.trim() }));
        if (!pairs.length) { x.setError('Enter at least one value.'); return; }
        const o = await ctx.act('sentinel.ingest', { dcrId: d.id, records: [pairs] }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); ctx.toast(`${o.data.accepted} record accepted`, 'ok'); await ctx.reloadPage();
      } }],
  });
}
