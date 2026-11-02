// Microsoft Purview > Audit > Search (learn.microsoft.com/purview/audit-search). Real portal: purview.microsoft.com.
// The sandbox shows it beside the Defender navigation so one browser tab covers the exam topics; the path is labelled.
// Retention, the 180-day range and who may search are decided by the server (server/sim/audit.js).
import { h, badge, fmtTime } from '../dom.js';
import { table } from '../components/table.js';
import { ctx } from '../app.js';

const DAY = 86_400_000;
let last = null; // the most recent search result, kept only for this page view
const form = { endsAgo: '0', span: '5', types: new Set() }; // survives a reload (changing the tier re-renders the page)

export async function render(host) {
  const v = await ctx.view('audit');
  const endsAgo = h('input', { type: 'number', min: '0', max: '360', 'aria-label': 'Window ends N days ago', value: form.endsAgo, oninput: (e) => { form.endsAgo = e.target.value; } });
  const span = h('input', { type: 'number', min: '1', max: '180', 'aria-label': 'Window length in days', value: form.span, oninput: (e) => { form.span = e.target.value; } });
  const boxes = v.recordTypes.map((r) => h('label', { class: 'toggle', title: r.about }, h('input', { type: 'checkbox', value: r.id, checked: form.types.has(r.id), 'data-target': `check:record:${r.id}`, onchange: (e) => { e.target.checked ? form.types.add(r.id) : form.types.delete(r.id); } }), ` ${r.label}`));
  const out = h('div', null);

  // The window is "ends N days ago, lasts M days" so a learner can place it months back without typing timestamps.
  const run = async () => {
    const end = Math.min(Date.now() - Number(endsAgo.value) * DAY, Date.now());
    const start = end - Number(span.value) * DAY;
    const recordTypes = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
    const o = await ctx.act('purview.searchAudit', { from: new Date(start).toISOString(), to: new Date(end).toISOString(), recordTypes }, { silentError: true });
    out.replaceChildren(o.ok ? results(o.data.results) : h('div', { class: 'form-error', role: 'alert' }, o.error.message));
    last = o.ok ? o.data : null;
  };

  host.append(
    h('h1', null, 'Audit'),
    h('p', { class: 'muted' }, 'Real path: Microsoft Purview portal > Audit > Search. The unified audit log records user and admin activity across Microsoft 365.'),
    signedIn(v),
    h('section', { class: 'blade' },
      h('h2', null, 'Audit solution'),
      h('p', null, 'This tenant has ', badge(v.tier === 'premium' ? 'Audit (Premium)' : 'Audit (Standard)', v.tier === 'premium' ? 'ok' : ''), ` Records are kept for ${v.tier === 'premium' ? 'one year for Microsoft Entra ID, Exchange, OneDrive and SharePoint, and 180 days for everything else' : '180 days'}.`),
      h('button', { class: 'btn', type: 'button', 'data-target': 'btn:set-premium', onclick: async () => { const o = await ctx.act('purview.setAuditTier', { tier: v.tier === 'premium' ? 'standard' : 'premium' }, { silentError: true }); if (!o.ok) ctx.toast(o.error.message, 'err'); else await ctx.reloadPage(); } },
        v.tier === 'premium' ? 'Switch to Audit (Standard)' : 'Assign Audit (Premium) licences')),
    h('section', { class: 'blade' },
      h('h2', null, 'Search'),
      h('div', { class: 'field' }, h('label', null, 'Window'), h('div', { class: 'row' }, 'Ends', endsAgo, 'days ago (0 = now) and lasts', span, 'days (maximum 180)')),
      h('div', { class: 'field' }, h('label', null, 'Record types'), h('div', { class: 'row' }, boxes), h('div', { class: 'hint-text' }, 'Leave all unticked to search every record type. Hover a name to read what it covers.')),
      h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:run-audit-search', onclick: run }, 'Search'),
      out),
    h('p', { class: 'note small' }, 'Not simulated: keyword, user, file and workload filters, admin units, saved search jobs and CSV export.'));
  if (last) out.append(results(last.results));
}

function results(rows) {
  return rows.length
    ? table([{ key: 'at', label: 'Date (UTC)', render: (r) => fmtTime(r.at) }, { key: 'recordType', label: 'Record type' }, { key: 'activity', label: 'Activity' }, { key: 'user', label: 'User' }], rows)
    : h('div', { class: 'empty' }, 'No results found. Records older than the retention period are no longer in the log.');
}

function signedIn(v) {
  if (v.users.length < 2) return h('p', { class: 'muted small' }, `Signed in as ${v.users[0]?.name ?? 'unknown'}.`);
  const sel = h('select', { 'aria-label': 'Signed in as', 'data-target': 'select:sign-in-as', onchange: async (e) => {
    const o = await ctx.act('directory.signInAs', { userId: e.target.value }, { silentError: true });
    if (o.ok) await ctx.reloadPage();
  } }, v.users.map((u) => h('option', { value: u.id, selected: u.id === v.actorId }, `${u.name} (Entra: ${u.entraRole}; role group: ${u.roleGroup})`)));
  return h('div', { class: 'row' }, h('label', null, 'Signed in as '), sel, v.canSearch ? badge('Can search the audit log', 'ok') : badge('Cannot search the audit log', 'warn'));
}
