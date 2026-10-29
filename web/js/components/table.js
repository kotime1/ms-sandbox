import { h, cellText } from '../dom.js';

/**
 * columns: [{ key, label, render?(row) -> Node|string }]
 * opts: { empty, rowTarget?(row) -> string, onRowClick?(row) }
 */
export function table(columns, rows, opts = {}) {
  if (!rows.length) return h('div', { class: 'empty' }, opts.empty ?? 'No items to show.');
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'grid' },
      h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col' }, c.label)))),
      h('tbody', null, rows.map((row) => h('tr', {
        'data-target': opts.rowTarget?.(row),
        class: opts.onRowClick ? 'clickable' : '',
        tabindex: opts.onRowClick ? '0' : undefined,
        onclick: opts.onRowClick ? () => opts.onRowClick(row) : undefined,
        onkeydown: opts.onRowClick ? (e) => { if (e.key === 'Enter') opts.onRowClick(row); } : undefined,
      }, columns.map((c) => h('td', null, c.render ? c.render(row) : cellText(row[c.key]))))))));
}

/** Result grid for KQL output: columns [{name,type}], rows [[...]] */
export function resultGrid(columns, rows) {
  return h('div', { class: 'table-wrap result' },
    h('table', { class: 'grid mono' },
      h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col', title: c.type }, c.name)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((v) => h('td', null, cellText(v))))))));
}
