import { h, badge, sev, fmtTime } from '../dom.js';
import { table } from '../components/table.js';
import { modal } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('sentinel-incidents');
  host.append(
    h('h1', null, 'Incidents'),
    v.incidents.length
      ? table([
        { key: 'number', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'severity', label: 'Severity', render: (i) => sev(i.severity) },
        { key: 'status', label: 'Status' },
        { key: 'rule', label: 'Created by', render: (i) => i.rule ?? '' },
        { key: 'createdAt', label: 'Created', render: (i) => fmtTime(i.createdAt) },
      ], v.incidents, { rowTarget: (i) => (i === v.incidents[0] ? 'row:incident-first' : `row:incident:${i.id}`), onRowClick: (i) => detail(i, v) })
      : h('div', { class: 'empty' }, 'No incidents in this workspace. Some labs create incidents when they start.'));
}

function detail(inc, v) {
  const body = h('div', null,
    h('div', { class: 'chips' }, sev(inc.severity), badge(inc.status), inc.owner ? badge(inc.owner) : badge('Unassigned')),
    h('p', null, inc.description || 'No description.'),
    h('h3', null, 'Entities'),
    h('ul', null, inc.entities.map((e) => h('li', null, `${e.type}: ${e.name}`))),
    h('h3', null, 'Playbook runs'),
    inc.runs.length ? h('div', null, inc.runs.map(runCard)) : h('p', { class: 'muted' }, 'No playbooks have run on this incident.'),
    inc.comments.length ? h('div', null, h('h3', null, 'Comments'), inc.comments.map((c) => h('p', { class: 'comment' }, h('strong', null, c.by), ': ', c.text))) : null);

  const menu = h('div', { class: 'menu', hidden: true, role: 'menu' });
  const actions = h('div', { class: 'menu-wrap' },
    h('button', { class: 'btn', type: 'button', 'aria-haspopup': 'menu', 'data-target': 'btn:incident-actions', onclick: () => { menu.hidden = !menu.hidden; } }, 'Actions ▾'),
    menu);
  const items = [
    h('div', { class: 'menu-head' }, 'Run playbook'),
    ...(v.playbooks.length
      // Only playbooks that use the incident trigger are offered, exactly the behaviour the labs teach.
      ? v.playbooks.filter((p) => p.trigger === 'incident').map((p) => h('button', { role: 'menuitem', type: 'button', class: 'menu-item', onclick: async () => {
        menu.hidden = true;
        const out = await ctx.act('sentinel.runPlaybook', { playbookId: p.id, incidentId: inc.id }, { silentError: true });
        if (!out.ok) { m.setError(out.error.message); return; }
        ctx.toast(`Playbook ${out.data.run.status.toLowerCase()}`, out.data.run.status === 'Succeeded' ? 'ok' : 'error');
        m.close(); await ctx.reloadPage();
      } }, `Run: ${p.name}`))
      : []),
  ];
  if (!v.playbooks.some((p) => p.trigger === 'incident')) items.push(h('div', { class: 'menu-empty' }, 'No playbooks with the Microsoft Sentinel incident trigger are available.'));
  menu.append(...items,
    h('div', { class: 'menu-head' }, 'Status'),
    ...['Active', 'Closed'].map((s) => h('button', { role: 'menuitem', type: 'button', class: 'menu-item', onclick: async () => { menu.hidden = true; const o = await ctx.act('sentinel.setIncidentStatus', { incidentId: inc.id, status: s }); if (o.ok) { m.close(); await ctx.reloadPage(); } } }, `Set ${s}`)));
  const m = modal({ title: `#${inc.number} ${inc.title}`, content: [h('div', { class: 'toolbar' }, actions), body], wide: true, buttons: [{ label: 'Close', onClick: (x) => x.close() }] });
}

function runCard(r) {
  return h('div', { class: `run ${r.status.toLowerCase()}` },
    h('div', null, h('strong', null, r.playbook), ' ', badge(r.status, r.status === 'Succeeded' ? 'ok' : 'warn'), h('span', { class: 'muted small' }, ` ${fmtTime(r.at)} · by ${r.by}`)),
    h('ol', null, r.steps.map((s) => h('li', { class: s.status.toLowerCase() }, `${s.name}`, s.message ? h('div', { class: 'err mono' }, s.message) : null))),
    r.error ? h('div', { class: 'form-error mono' }, r.error) : null);
}
