// "Incidents & alerts": one page with an Incidents tab and an Alerts tab, as in the Defender portal
// (Investigation & response > Incidents & alerts > Incidents | Alerts).
// https://learn.microsoft.com/en-us/defender-xdr/investigate-alerts
//
// Both ids route here: `defender/alerts` opens the Alerts tab, `sentinel/incidents` opens the Incidents tab.
// Page ids and data-target names are unchanged, so labs, tests and the coach keep working.

import { h, badge, sev, fmtTime, clear } from '../dom.js';
import { table } from '../components/table.js';
import { modal, field } from '../components/modal.js';
import { answerBox } from '../components/answer-box.js';
import { ctx } from '../app.js';

export function makePage(initialTab) {
  return async function render(host) {
    const [d, s] = await Promise.all([ctx.view('defender'), ctx.view('sentinel-incidents')]);
    let tab = initialTab;
    const body = h('div', null);
    const tabs = h('div', { class: 'tabs', role: 'tablist' });

    const paint = () => {
      clear(tabs).append(
        h('button', { class: 'tab', role: 'tab', 'aria-selected': String(tab === 'incidents'), 'data-target': 'tab:incidents', onclick: () => { tab = 'incidents'; paint(); } }, `Incidents (${s.incidents.length})`),
        h('button', { class: 'tab', role: 'tab', 'aria-selected': String(tab === 'alerts'), 'data-target': 'tab:alerts', onclick: () => { tab = 'alerts'; paint(); } }, `Alerts (${d.alerts.filter((a) => !a.suppressed || a.status === 'Resolved').length})`));
      clear(body).append(tab === 'incidents' ? incidentsTab(s) : alertsTab(d));
    };

    host.append(h('h1', null, 'Incidents & alerts'), tabs, body);
    paint();
    const answers = ctx.lab?.briefing?.answers;
    if (answers?.length) answerBox(host, answers);
  };
}

// ------------------------------------------------------------------ Incidents tab

function incidentsTab(v) {
  return v.incidents.length
    ? table([
      { key: 'number', label: 'Incident ID' },
      { key: 'title', label: 'Incident name' },
      { key: 'severity', label: 'Severity', render: (i) => sev(i.severity) },
      { key: 'status', label: 'Status' },
      { key: 'rule', label: 'Service sources', render: (i) => (i.rule ? `Microsoft Sentinel (${i.rule})` : 'Microsoft Sentinel') },
      { key: 'createdAt', label: 'First activity', render: (i) => fmtTime(i.createdAt) },
    ], v.incidents, { rowTarget: (i) => (i === v.incidents[0] ? 'row:incident-first' : `row:incident:${i.id}`), onRowClick: (i) => incidentDetail(i, v) })
    : h('div', { class: 'empty' }, 'No incidents. Some labs create incidents when they start.');
}

function incidentDetail(inc, v) {
  // Recorded server-side so investigation labs can tell the incident was actually opened.
  ctx.act('sentinel.viewIncident', { incidentId: inc.id }, { silentError: true });
  const body = h('div', null,
    h('div', { class: 'chips' }, sev(inc.severity), badge(inc.status), inc.owner ? badge(inc.owner) : badge('Unassigned')),
    h('p', null, inc.description || 'No description.'),
    h('h3', null, 'Entities'),
    inc.entities.length ? h('ul', null, inc.entities.map((e) => h('li', null, `${e.type}: ${e.name}`))) : h('p', { class: 'muted' }, 'No entities were extracted for this incident.'),
    h('h3', null, 'Playbook runs'),
    inc.runs.length ? h('div', null, inc.runs.map(runCard)) : h('p', { class: 'muted' }, 'No playbooks have run on this incident.'),
    inc.comments.length ? h('div', null, h('h3', null, 'Comments'), inc.comments.map((c) => h('p', { class: 'comment' }, h('strong', null, c.by), ': ', c.text))) : null);

  const menu = h('div', { class: 'menu', hidden: true, role: 'menu' });
  const actions = h('div', { class: 'menu-wrap' },
    h('button', { class: 'btn', type: 'button', 'aria-haspopup': 'menu', 'data-target': 'btn:incident-actions', onclick: () => { menu.hidden = !menu.hidden; } }, 'Actions ▾'),
    menu);
  const incidentPlaybooks = v.playbooks.filter((p) => p.trigger === 'incident');
  menu.append(
    h('div', { class: 'menu-head' }, 'Run playbook'),
    // Only playbooks that use the Microsoft Sentinel incident trigger are offered here.
    ...incidentPlaybooks.map((p) => h('button', { role: 'menuitem', type: 'button', class: 'menu-item', onclick: async () => {
      menu.hidden = true;
      const out = await ctx.act('sentinel.runPlaybook', { playbookId: p.id, incidentId: inc.id }, { silentError: true });
      if (!out.ok) { m.setError(out.error.message); return; }
      ctx.toast(`Playbook ${out.data.run.status.toLowerCase()}`, out.data.run.status === 'Succeeded' ? 'ok' : 'error');
      m.close(); await ctx.reloadPage();
    } }, `Run: ${p.name}`)),
    incidentPlaybooks.length ? null : h('div', { class: 'menu-empty' }, 'No playbooks with the Microsoft Sentinel incident trigger are available.'),
    h('div', { class: 'menu-head' }, 'Status'),
    ...['Active', 'Closed'].map((st) => h('button', { role: 'menuitem', type: 'button', class: 'menu-item', onclick: async () => { menu.hidden = true; const o = await ctx.act('sentinel.setIncidentStatus', { incidentId: inc.id, status: st }); if (o.ok) { m.close(); await ctx.reloadPage(); } } }, `Set ${st}`)));
  const m = modal({ title: `#${inc.number} ${inc.title}`, content: [h('div', { class: 'toolbar' }, actions), body], wide: true, buttons: [{ label: 'Close', onClick: (x) => x.close() }] });
}

function runCard(r) {
  return h('div', { class: `run ${r.status.toLowerCase()}` },
    h('div', null, h('strong', null, r.playbook), ' ', badge(r.status, r.status === 'Succeeded' ? 'ok' : 'warn'), h('span', { class: 'muted small' }, ` ${fmtTime(r.at)} · by ${r.by}`)),
    h('ol', null, r.steps.map((st) => h('li', { class: st.status.toLowerCase() }, `${st.name}`, st.message ? h('div', { class: 'err mono' }, st.message) : null))),
    r.error ? h('div', { class: 'form-error mono' }, r.error) : null);
}

// ------------------------------------------------------------------ Alerts tab (with Alert tuning)

function alertsTab(v) {
  const shown = v.alerts.filter((a) => !a.suppressed || a.status === 'Resolved');
  const hidden = v.alerts.length - shown.length;
  return h('div', null,
    h('p', { class: 'muted' }, `${shown.length} alert(s)${hidden ? ` · ${hidden} hidden by alert tuning rules` : ''}`),
    table([
      { key: 'title', label: 'Alert name' },
      { key: 'severity', label: 'Severity', render: (a) => sev(a.severity) },
      { key: 'device', label: 'Impacted assets' },
      { key: 'process', label: 'Process', render: (a) => a.process ?? '' },
      { key: 'status', label: 'Status', render: (a) => badge(a.status, a.status === 'Resolved' ? 'ok' : '') },
      { key: 'createdAt', label: 'First activity', render: (a) => fmtTime(a.createdAt) },
    ], shown, { empty: 'No alerts. Some labs raise alerts when they start or when you replay a simulation.', rowTarget: (a) => `row:alert:${a.id}`, onRowClick: (a) => alertDetail(a, v) }),
    v.suppression.length ? h('div', null, h('h2', null, 'Alert tuning rules'),
      h('p', { class: 'muted small' }, 'Real path: Settings > Microsoft Defender XDR > Alert tuning.'),
      table([
        { key: 'alertTitle', label: 'Name' },
        { key: 'ioc', label: 'Condition', render: (r) => (r.ioc ? `${r.ioc.type}: ${r.ioc.value}` : 'Any') },
        { key: 'scope', label: 'Scope' },
        { key: 'action', label: 'Action', render: (r) => (r.action === 'resolve' ? 'Resolve alert' : 'Hide alert') },
        { key: 'id', label: '', render: (r) => h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete alert tuning rule for ${r.alertTitle}`, onclick: async () => { const o = await ctx.act('defender.deleteSuppression', { id: r.id }); if (o.ok) await ctx.reloadPage(); } }, 'Delete') },
      ], v.suppression)) : null);
}

function alertDetail(a, v) {
  modal({
    title: a.title, wide: true,
    content: [
      h('div', { class: 'chips' }, sev(a.severity), badge(a.status), badge(a.source)),
      h('dl', { class: 'kv' }, h('dt', null, 'Impacted asset'), h('dd', null, a.device), h('dt', null, 'Triggering process'), h('dd', null, a.process ?? 'n/a'), h('dt', null, 'First activity'), h('dd', null, fmtTime(a.createdAt)),
        a.action ? [h('dt', null, 'Automatic action'), h('dd', null, a.action)] : null),
    ],
    buttons: [
      { label: 'Close', onClick: (x) => x.close() },
      { label: 'Resolve', onClick: async (x) => { const o = await ctx.act('defender.setAlertStatus', { alertId: a.id, status: 'Resolved' }); if (o.ok) { x.close(); await ctx.reloadPage(); } } },
      { label: 'Tune alert', primary: true, target: 'btn:create-suppression', onClick: (x) => { x.close(); tuneDialog(a, v); } },
    ],
  });
}

// "Tune alert" pane. Actions per the docs: Hide alert, Resolve alert, Set as behavior. Hide is Defender for Endpoint only.
// Set as behavior is not simulated (it needs the behaviors tables to be fed), so it is shown disabled.
function tuneDialog(a, v) {
  const title = h('input', { type: 'text', value: a.title, maxlength: '120' });
  const scopeType = h('select', null, h('option', { value: 'any' }, 'Any alert type based on certain conditions'), h('option', { value: 'this', selected: true }, 'This alert type only'));
  const iocType = h('select', null, h('option', { value: 'none' }, 'No condition'), h('option', { value: 'process', selected: Boolean(a.process) }, 'Process'));
  const iocValue = h('input', { type: 'text', value: a.process ?? '', maxlength: '80' });
  const device = h('select', null, v.devices.map((d) => h('option', { value: d.id }, d.name)));
  const scope = h('select', null, h('option', { value: 'organization' }, 'All devices'), h('option', { value: 'device' }, 'Selected device only'));
  const action = h('select', null, h('option', { value: 'hide' }, 'Hide alert'), h('option', { value: 'resolve' }, 'Resolve alert'), h('option', { value: 'behavior', disabled: true }, 'Set as behavior (not simulated)'));
  modal({
    title: 'Tune alert',
    content: [
      h('p', { class: 'muted' }, 'A tuning rule applies to alerts raised after you save it. Existing alerts are not rewritten.'),
      field('Rule name (alert title)', title), field('Alert types', scopeType), field('Condition: evidence type', iocType), field('Condition: value', iocValue),
      field('Scope', scope), field('Device (selected device only)', device), field('Action', action),
    ],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Save', primary: true, target: 'btn:save-suppression', onClick: async (x) => {
        const params = { alertTitle: title.value, iocType: iocType.value, iocValue: iocType.value === 'none' ? '' : iocValue.value, scope: scope.value, action: action.value };
        if (scope.value === 'device') params.deviceId = device.value;
        const out = await ctx.act('defender.createSuppression', params, { silentError: true });
        if (!out.ok) { x.setError(out.error.message); return; }
        x.close(); ctx.toast('Alert tuning rule saved', 'ok'); await ctx.reloadPage();
      } },
    ],
  });
}

export const render = makePage('alerts');
