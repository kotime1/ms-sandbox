// Microsoft Sentinel > Threat management > Workbooks (learn.microsoft.com/azure/sentinel/monitor-your-data).
// Templates tab: pick a template, read what it needs, Save. My workbooks tab: View saved workbook, Edit, Save as, Done editing, Delete.
// Templates are read-only: the only things you can do to one are Save (creates a copy under My workbooks) and look.
import { h, clear, badge } from '../dom.js';
import { table } from '../components/table.js';
import { chart } from '../components/chart.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

let tab = 'templates';
let openId = null; // the saved workbook being viewed

export async function render(host) {
  const v = await ctx.view('workbooks');
  const body = h('div', null);
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const paint = (data) => {
    clear(tabs).append(
      h('button', { class: 'tab', role: 'tab', 'aria-selected': String(tab === 'templates'), 'data-target': 'tab:templates', onclick: () => { tab = 'templates'; openId = null; paint(data); } }, `Templates (${data.templates.length})`),
      h('button', { class: 'tab', role: 'tab', 'aria-selected': String(tab === 'mine'), 'data-target': 'tab:my-workbooks', onclick: () => { tab = 'mine'; openId = null; paint(data); } }, `My workbooks (${data.mine.length})`));
    clear(body).append(tab === 'templates' ? templates(data) : openId ? workbook(data, data.mine.find((b) => b.id === openId)) : mine(data));
  };
  host.append(h('h1', null, 'Workbooks'),
    h('p', { class: 'muted' }, 'Visualize and monitor your data. Real path: Microsoft Sentinel > Threat management > Workbooks. Templates are read-only; save one to My workbooks to use and edit it.'),
    tabs, body);
  paint(v);
}

async function reload() { await ctx.reloadPage(); }

function templates(v) {
  const rows = v.templates;
  return h('div', null,
    table([
      { key: 'name', label: 'Template' },
      { key: 'summary', label: 'About' },
      { key: 'required', label: 'Required data types', render: (t) => h('span', { class: 'row' }, t.required.map((n) => badge(n, t.available ? 'ok' : 'warn'))) },
      { key: 'id', label: '', render: (t) => h('button', { class: 'btn small', type: 'button', 'data-target': `btn:template:${t.name}`, onclick: () => details(t) }, 'Details') },
    ], rows, { rowTarget: (t) => `row:template:${t.name}` }));
}

function details(t) {
  const name = h('input', { type: 'text', maxlength: '80', value: t.name, 'aria-label': 'Workbook name' });
  modal({
    title: t.name, wide: true,
    content: [
      h('p', { class: 'muted' }, t.summary),
      h('h3', null, 'Metrics in this template'),
      h('ul', null, t.metrics.map((m) => h('li', null, m))),
      h('p', { class: 'muted small' }, `Required data types: ${t.required.join(', ')}${t.available ? '' : ' (not available in this workspace)'}.`),
      h('p', { class: 'note small' }, 'A template is read-only. Save creates a workbook under My workbooks that you can open and edit.'),
      field('Save as', name),
    ],
    buttons: [
      { label: 'Close', onClick: (x) => x.close() },
      { label: 'Save', primary: true, target: 'btn:save-template', onClick: async (x) => {
        const o = await ctx.act('sentinel.saveWorkbookTemplate', { template: t.id, name: name.value.trim() }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); tab = 'mine'; ctx.toast('Workbook saved. Open it under My workbooks.', 'ok'); await reload();
      } },
    ],
  });
}

function mine(v) {
  return table([
    { key: 'name', label: 'Workbook' },
    { key: 'template', label: 'Based on', render: (b) => v.templates.find((t) => t.id === b.template)?.name ?? (b.clonedFrom ? 'A copy' : 'Blank') },
    { key: 'revision', label: 'Revision' },
    { key: 'id', label: '', render: (b) => h('span', { class: 'row' },
      h('button', { class: 'btn small', type: 'button', 'data-target': `btn:view-workbook:${b.name}`, onclick: async () => { const o = await ctx.act('sentinel.viewWorkbook', { id: b.id }, { noRefresh: true }); if (o.ok) { openId = b.id; await reload(); } } }, 'View saved workbook'),
      h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete ${b.name}`, onclick: async () => {
        const o = await ctx.act('sentinel.deleteWorkbook', { id: b.id }, { silentError: true });
        if (!o.ok) ctx.toast(o.error.message, 'err'); else await reload();
      } }, 'Delete')) },
  ], v.mine, { empty: 'No saved workbooks yet. Save a template from the Templates tab.' });
}

function workbook(v, b) {
  if (!b) { openId = null; return mine(v); }
  const tpl = v.templates.find((t) => t.id === b.template);
  const bar = h('div', { class: 'toolbar' },
    h('button', { class: 'btn', type: 'button', onclick: () => { openId = null; reload(); } }, '← My workbooks'),
    b.editing
      ? [h('button', { class: 'btn', type: 'button', 'data-target': 'btn:add-tile', onclick: () => addTile(b) }, '+ Add query'),
        h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:done-editing', onclick: async () => { const o = await ctx.act('sentinel.doneEditingWorkbook', { id: b.id }, { silentError: true }); if (o.ok) await reload(); else ctx.toast(o.error.message, 'err'); } }, 'Done editing')]
      : [h('button', { class: 'btn', type: 'button', 'data-target': 'btn:edit-workbook', onclick: async () => { const o = await ctx.act('sentinel.editWorkbook', { id: b.id }); if (o.ok) await reload(); } }, 'Edit'),
        h('button', { class: 'btn', type: 'button', 'data-target': 'btn:save-as', onclick: () => saveAs(b) }, 'Save as')]);
  return h('div', null, h('h2', null, b.name), h('p', { class: 'muted small' }, b.editing ? 'Editing. Select Done editing to save your changes.' : `Saved, revision ${b.revision}.`), bar,
    tpl ? h('div', { class: 'blade' }, h('h3', null, 'Metrics'), h('ul', null, b.metrics.map((m) => h('li', null, m)))) : null,
    b.tiles.length ? b.tiles.map(tile) : h('p', { class: 'muted' }, b.metrics.length ? 'This workbook has the template\'s metrics above. Use Edit to add your own queries.' : 'This workbook is empty. Use Edit to add a query.'));
}

function tile(t) {
  if (t.error) return h('div', { class: 'blade' }, h('h3', null, t.title), h('div', { class: 'form-error', role: 'alert' }, t.error));
  const view = t.render ? chart(t.render, t.columns, t.rows) : table(t.columns.map((c, i) => ({ key: String(i), label: c.name })), t.rows.map((r) => Object.fromEntries(r.map((x, i) => [String(i), x]))), { empty: 'No results.' });
  return h('div', { class: 'blade' }, h('h3', null, t.title), view);
}

function addTile(b) {
  const title = h('input', { type: 'text', maxlength: '80', value: 'New query', 'aria-label': 'Tile title' });
  const q = h('textarea', { class: 'kql', rows: '6', maxlength: '2000', 'aria-label': 'Workbook query' });
  q.value = 'SigninLogs\n| summarize Signins=count() by bin(TimeGenerated, 1d)\n| render timechart';
  modal({
    title: 'Add query', wide: true,
    content: [field('Title', title), field('Query', q, 'Add render timechart (or another chart type) to draw a chart instead of a table.')],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Add', primary: true, target: 'btn:save-tile', onClick: async (x) => {
        const o = await ctx.act('sentinel.addWorkbookTile', { id: b.id, title: title.value.trim(), query: q.value }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); await reload();
      } },
    ],
  });
}

function saveAs(b) {
  const name = h('input', { type: 'text', maxlength: '80', value: `${b.name} (copy)`, 'aria-label': 'Name of the copy' });
  modal({
    title: 'Save as', content: [field('Name', name, 'The clone is saved under the same subscription and resource group.')],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Save', primary: true, target: 'btn:save-as-confirm', onClick: async (x) => {
        const o = await ctx.act('sentinel.cloneWorkbook', { id: b.id, name: name.value.trim() }, { silentError: true });
        if (!o.ok) { x.setError(o.error.message); return; }
        x.close(); ctx.toast('Copy saved under My workbooks', 'ok'); await reload();
      } },
    ],
  });
}
