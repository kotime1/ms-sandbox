import { h, clear } from '../dom.js';
import { resultGrid } from './table.js';
import { chart } from './chart.js';
import { ctx } from '../app.js';
import { answerBox } from './answer-box.js';

const drafts = { sentinel: 'SigninLogs\n| take 10', defender: 'DeviceLogonEvents\n| take 10' }; // kept for the page session only

/**
 * Query editor + results, shared by Sentinel Logs and Defender Advanced hunting.
 * extra(lastQuery) can return additional toolbar nodes (e.g. "Create detection rule").
 */
export async function queryEditor(host, surface, { extra } = {}) {
  const schema = await ctx.view(`schema-${surface}`);
  const area = h('textarea', { class: 'kql', spellcheck: 'false', rows: '8', 'aria-label': 'KQL query', maxlength: '4000' });
  area.value = drafts[surface];
  area.addEventListener('input', () => { drafts[surface] = area.value; });
  const out = h('div', { class: 'qresult' }, h('div', { class: 'empty' }, 'Run a query to see results.'));
  const toolbarExtra = h('span', { class: 'spacer' });
  let last = null;

  const run = async () => {
    clear(out).append(h('div', { class: 'loading' }, 'Running…'));
    const res = await ctx.act('query.run', { surface, text: area.value }, { silentError: true });
    clear(out);
    if (!res.ok) { out.append(h('div', { class: 'form-error', role: 'alert' }, res.error.message)); return; }
    const { columns, rows, meta } = res.data.result;
    last = area.value;
    const tabs = [];
    const results = h('div', null, rows.length ? resultGrid(columns, rows) : h('div', { class: 'empty' }, 'No results found for the selected query.'));
    const info = h('div', { class: 'muted small' }, `${meta.rowCount} row(s) · ${meta.elapsedMs} ms${meta.truncated ? ' · showing first 1000' : ''}`);
    if (meta.render) {
      const view = h('div', null, chart(meta.render, columns, rows));
      const show = (which) => { clear(host.querySelector('.qpane')).append(which === 'chart' ? view : results); tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.k === which))); };
      tabs.push(h('button', { class: 'tab', role: 'tab', 'data-k': 'chart', onclick: () => show('chart') }, 'Chart'), h('button', { class: 'tab', role: 'tab', 'data-k': 'table', onclick: () => show('table') }, 'Results'));
      out.append(h('div', { class: 'tabs', role: 'tablist' }, tabs), info, h('div', { class: 'qpane' }));
      show('chart');
    } else {
      out.append(info, h('div', { class: 'qpane' }, results));
    }
  };
  area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });

  const tables = h('div', { class: 'schema' }, h('h3', null, 'Tables'),
    schema.tables.map((t) => h('details', null, h('summary', null, t.name),
      h('ul', null, t.columns.map((c) => h('li', null, h('span', null, c.name), ' ', h('em', null, c.type)))),
      h('button', { class: 'btn small', type: 'button', onclick: () => { area.value = `${t.name}\n| take 10`; drafts[surface] = area.value; area.focus(); } }, 'Query this table'))));

  host.append(h('div', { class: 'qlayout' }, tables, h('div', { class: 'qmain' },
    area,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:run-query', onclick: run }, '▶ Run'), h('span', { class: 'muted small' }, 'Ctrl+Enter'),
      toolbarExtra,
      ...(extra ? [extra(() => last ?? area.value)] : [])),
    out)));
  // Investigation labs ask for a fact ("who?", "how many?"), typed here and checked server-side.
  const answers = ctx.lab?.briefing?.answers;
  if (answers?.length) answerBox(host, answers);
}
