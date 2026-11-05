// Assets > Identities (an account and the actions you can take on it) and Reports > Identities > Report management.
// learn.microsoft.com/defender-for-identity/remediation-actions and /reports. Which actions apply to which kind of account, and
// why one is unavailable, are decided by the server (server/sim/identity.js).
import { h, badge, sev, fmtTime } from '../dom.js';
import { table } from '../components/table.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

const DAY = 86_400_000;

export async function render(host) {
  const v = await ctx.view('identity');
  host.append(
    h('h1', null, 'Identities'),
    h('p', { class: 'muted' }, 'Real paths: Assets > Identities for accounts and their actions; Reports > Identities > Report management for reports.'),
    accounts(v), alerts(v), reports(v));
}

function accounts(v) {
  return h('section', { class: 'blade' },
    h('h2', null, 'Accounts'),
    table([
      { key: 'name', label: 'Account' },
      { key: 'source', label: 'Identity source' },
      { key: 'enabled', label: 'State', render: (a) => h('span', { class: 'row' }, badge(a.enabled ? 'Enabled' : 'Disabled', a.enabled ? 'ok' : 'warn'), a.mustChangePassword ? badge('Password change required', 'warn') : null, a.flaggedCompromised ? badge('Compromised', 'warn') : null) },
      { key: 'canAuthenticate', label: 'Can sign in to resources', render: (a) => (a.canAuthenticate ? 'Yes' : 'No') },
      { key: 'id', label: '', render: (a) => h('button', { class: 'btn small', type: 'button', 'data-target': `btn:actions:${a.name}`, onclick: () => actionsMenu(a) }, 'Actions') },
    ], v.accounts, { empty: 'No accounts.', rowTarget: (a) => `row:account:${a.name}` }));
}

function actionsMenu(a) {
  const list = h('div', { class: 'choice' }, a.actions.map((x) => h('button', {
    class: 'choice-card', type: 'button', 'data-target': `action:${x.action}`, 'aria-disabled': x.unavailable ? 'true' : undefined, title: x.unavailable ?? '',
    onclick: async () => {
      const o = await ctx.act('identity.respond', { accountId: a.id, action: x.action }, { silentError: true });
      if (!o.ok) { m.setError(o.error.message); return; }
      m.close(); ctx.toast(`${x.action}: done`, 'ok'); await ctx.reloadPage();
    },
  }, h('strong', null, x.action), x.unavailable ? h('span', { class: 'muted small' }, 'Not available for this account') : null)));
  const m = modal({ title: `Actions on ${a.name}`, content: [h('p', { class: 'muted small' }, `Identity source: ${a.source}. Actions are carried out by the sensor on a domain controller for Active Directory accounts.`), list], buttons: [{ label: 'Close', onClick: (x) => x.close() }] });
}

function alerts(v) {
  return h('section', { class: 'blade' },
    h('h2', null, 'Alerts'),
    table([
      { key: 'title', label: 'Alert' }, { key: 'account', label: 'Account' }, { key: 'severity', label: 'Severity', render: (x) => sev(x.severity) },
      { key: 'id', label: '', render: (x) => h('button', { class: 'btn small', type: 'button', 'data-target': `btn:alert-report:${x.id}`, onclick: async () => {
        const o = await ctx.act('identity.downloadAlertReport', { alertId: x.id }, { silentError: true });
        if (!o.ok) ctx.toast(o.error.message, 'err'); else { ctx.toast(`Downloaded ${o.data.file}`, 'ok'); await ctx.reloadPage(); }
      } }, x.reportDownloaded ? 'Download again' : 'Download detailed report') },
    ], v.alerts, { empty: 'No alerts.' }));
}

function reports(v) {
  return h('section', { class: 'blade' },
    h('h2', null, 'Report management'),
    h('p', { class: 'muted small' }, `Real path: ${v.reportPath}. Select a report, then Download and choose a time period.`),
    table([
      { key: 'name', label: 'Report' }, { key: 'about', label: 'What it shows' },
      { key: 'id', label: '', render: (r) => h('button', { class: 'btn small', type: 'button', 'data-target': `btn:report:${r.name}`, onclick: () => download(r) }, 'Download') },
    ], v.reports, { rowTarget: (r) => `row:report:${r.name}` }));
}

function download(r) {
  const days = h('input', { type: 'number', min: '1', max: '180', value: '14', 'aria-label': 'Period in days' });
  const out = h('div', null);
  modal({
    title: r.name, wide: true,
    content: [field('Period (days back from now)', days), out],
    buttons: [{ label: 'Close', onClick: (x) => x.close() },
      { label: 'Download report', primary: true, target: 'btn:download-report', onClick: async () => {
        const n = Number(days.value);
        const o = await ctx.act('identity.downloadReport', { reportId: r.id, from: new Date(Date.now() - n * DAY).toISOString(), to: new Date().toISOString() }, { silentError: true });
        out.replaceChildren(o.ok
          ? (o.data.rows ? table([{ key: 'at', label: 'Time', render: (x) => fmtTime(x.at) }, { key: 'account', label: 'Account / group' }, { key: 'detail', label: 'Detail' }], o.data.preview) : h('div', { class: 'empty' }, 'No rows in that period.'))
          : h('div', { class: 'form-error', role: 'alert' }, o.error.message));
      } }],
  });
}
