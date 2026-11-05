// Settings > Microsoft Defender XDR > General > Email notifications, with its Alerts / Vulnerabilities / Threat analytics tabs.
// (learn.microsoft.com/defender-xdr/m365d-threat-analytics-notifications.) This is a DIFFERENT page from Endpoints > General >
// Email notifications, which holds the device-alert rules. Which tab holds which rule is the point of the exercise.
import { h, clear } from '../dom.js';
import { table } from './table.js';
import { wizard, row } from './wizard.js';
import { ctx } from '../app.js';

let tab = 'alerts';
const TABS = [['alerts', 'Alerts'], ['vulnerabilities', 'Vulnerabilities'], ['threatAnalytics', 'Threat analytics']];
const check = (label, checked, onchange, attrs = {}) => h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked), ...attrs }), ` ${label}`);

export function kindNotificationSection(n) {
  const body = h('div', null);
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const paint = () => {
    clear(tabs).append(...TABS.map(([id, label]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === id), 'data-target': `tab:notif:${label}`, onclick: () => { tab = id; paint(); } }, label)));
    clear(body).append(tab === 'alerts'
      ? h('p', { class: 'muted' }, 'Rules that email about alerts on devices are created under Settings > Endpoints > General > Email notifications (the section above). They are not listed here.')
      : list(tab, n));
  };
  const section = h('section', { class: 'blade' },
    h('h2', null, 'Microsoft Defender XDR > General > Email notifications'),
    h('p', { class: 'muted small' }, 'Real path: Settings > Microsoft Defender XDR > General > Email notifications. Each tab holds one kind of rule.'), tabs, body);
  paint();
  return section;
}

function list(kind, n) {
  const mine = n.kindRules.filter((r) => r.kind === kind);
  const label = kind === 'threatAnalytics' ? 'Threat analytics' : 'Vulnerabilities';
  return h('div', null,
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': `btn:create-notif:${kind}`, onclick: () => open(kind, n) }, '+ Create a notification rule')),
    table([
      { key: 'name', label: 'Rule name' },
      { key: 'scope', label: kind === 'threatAnalytics' ? 'Reports' : 'Scope', render: (r) => (!r.scope ? 'Vulnerability events' : r.scope.all ? 'All new and updated reports' : [...r.scope.tags, ...r.scope.reportTypes].join(', ')) },
      { key: 'recipients', label: 'Recipients', render: (r) => r.recipients.join(', ') },
      { key: 'id', label: '', render: (r) => h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete ${r.name}`, onclick: async () => { const o = await ctx.act('defender.deleteKindNotification', { id: r.id }); if (o.ok) await ctx.reloadPage(); } }, 'Delete') },
    ], mine, { empty: `No ${label} notification rules.` }),
    kind === 'threatAnalytics' && n.taReports.length ? h('div', null, h('h3', null, 'Reports (simulated feed)'), h('p', { class: 'muted small' }, 'Publishing a report is what triggers the rules above.'),
      table([{ key: 'title', label: 'Report' }, { key: 'type', label: 'Type' }, { key: 'tags', label: 'Tags', render: (r) => r.tags.join(', ') },
        { key: 'id', label: '', render: (r) => h('button', { class: 'btn small', type: 'button', 'data-target': `btn:publish:${r.id}`, onclick: async () => { const o = await ctx.act('ta.publishReport', { reportId: r.id }); if (o.ok) await ctx.reloadPage(); } }, 'Publish update') }], n.taReports)) : null);
}

function open(kind, n) {
  const state = { name: '', description: '', mode: 'all', tags: new Set(), types: new Set(), recipients: [], draft: '' };
  const ta = kind === 'threatAnalytics';
  wizard({
    title: ta ? 'Create a threat analytics notification rule' : 'Create a vulnerabilities notification rule', finishLabel: 'Create rule', state,
    steps: [
      {
        id: 'name', title: 'Name',
        render(body) {
          body.append(h('h3', null, 'Name your rule'),
            row('Rule name', h('input', { type: 'text', maxlength: '60', value: state.name, oninput: (e) => { state.name = e.target.value; } }), 'English letters and numbers only: no spaces, dashes or underscores.'),
            row('Description (optional)', h('input', { type: 'text', maxlength: '120', value: state.description, oninput: (e) => { state.description = e.target.value; } })));
        },
        validate: (s) => (s.name.trim() ? null : 'Enter a rule name.'),
      },
      ...(ta ? [{
        id: 'reports', title: 'Reports',
        render(body, _s, api) {
          const radio = (v, label) => h('label', { class: 'toggle' }, h('input', { type: 'radio', name: 'mode', checked: state.mode === v, 'data-target': `radio:${v}`, onchange: () => { state.mode = v; api.rerender(); } }), ` ${label}`);
          body.append(h('h3', null, 'Choose the reports'), radio('all', 'All new and updated reports'), radio('some', 'Only reports of a certain type or with a specific tag'));
          if (state.mode === 'some') {
            body.append(
              h('div', { class: 'field' }, h('label', null, 'Threat tags'), n.taOptions.tags.map((t) => check(t, state.tags.has(t), (v) => { v ? state.tags.add(t) : state.tags.delete(t); }, { 'data-target': `check:tag:${t}` }))),
              h('div', { class: 'field' }, h('label', null, 'Report types'), n.taOptions.reportTypes.map((t) => check(t, state.types.has(t), (v) => { v ? state.types.add(t) : state.types.delete(t); }, { 'data-target': `check:type:${t}` }))));
          }
        },
        validate: (s) => (s.mode === 'some' && !s.tags.size && !s.types.size ? 'Pick at least one tag or report type, or choose all reports.' : null),
      }] : []),
      {
        id: 'recipients', title: 'Recipients',
        render(body) {
          const items = h('ul', { class: 'plain' });
          const paintItems = () => items.replaceChildren(...state.recipients.map((r) => h('li', null, r, ' ', h('button', { class: 'btn small', type: 'button', onclick: () => { state.recipients = state.recipients.filter((x) => x !== r); paintItems(); } }, 'Remove'))));
          paintItems();
          const input = h('input', { type: 'text', maxlength: '190', placeholder: 'secops@contoso.com', value: state.draft, 'aria-label': 'Recipient email address', oninput: (e) => { state.draft = e.target.value; } });
          body.append(h('h3', null, 'Recipients'),
            h('div', { class: 'row' }, input, h('button', { class: 'btn', type: 'button', 'data-target': 'btn:add-recipient', onclick: () => { const v = state.draft.trim(); if (v && !state.recipients.includes(v)) { state.recipients.push(v); state.draft = ''; input.value = ''; paintItems(); } } }, 'Add recipient')), items);
        },
      },
    ],
    async onFinish(s, api) {
      const some = ta && s.mode === 'some';
      const params = { kind, name: s.name.trim(), description: s.description.trim(), recipients: s.recipients, tags: some ? [...s.tags] : [], reportTypes: some ? [...s.types] : [] };
      const o = await ctx.act('defender.createKindNotification', params, { silentError: true });
      if (!o.ok) return o.error.message;
      api.close(); ctx.toast('Notification rule created', 'ok'); await ctx.reloadPage();
      return undefined;
    },
  });
}
