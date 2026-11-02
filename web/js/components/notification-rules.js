// Settings > Endpoints > General > Email notifications (learn.microsoft.com/defender-xdr/configure-email-notifications).
// The two-step flow follows the docs: General (name, devices, severity) then Recipients. Whether the signed-in user may
// create a rule, and whether "all devices" is allowed, is decided by the server; this file only presents it.
import { h, badge, sev, fmtTime } from '../dom.js';
import { table } from './table.js';
import { wizard, row } from './wizard.js';
import { ctx } from '../app.js';

const check = (label, checked, onchange, attrs = {}) => h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked), ...attrs }), ` ${label}`);

export function notificationSection(n) {
  const groupName = (id) => n.deviceGroups.find((g) => g.id === id)?.name ?? id;
  return h('section', { class: 'blade' },
    h('h2', null, 'Endpoints > General > Email notifications'),
    h('p', { class: 'muted small' }, 'Real path: Settings > Endpoints > General > Email notifications. A rule says which devices and alert severities to email about, and who gets the email.'),
    signedIn(n),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:add-notification', onclick: () => open(n) }, '+ Add item')),
    table([
      { key: 'name', label: 'Rule name' },
      { key: 'devices', label: 'Devices', render: (r) => (r.allDevices ? 'All devices' : r.deviceGroups.map(groupName).join(', ')) },
      { key: 'severities', label: 'Alert severity', render: (r) => h('span', { class: 'row' }, r.severities.map((s) => sev(s))) },
      { key: 'recipients', label: 'Recipients', render: (r) => r.recipients.join(', ') },
      { key: 'id', label: '', render: (r) => h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Delete ${r.name}`, onclick: async () => {
        const o = await ctx.act('defender.deleteNotificationRule', { id: r.id }, { silentError: true });
        if (!o.ok) ctx.toast(o.error.message, 'err'); else await ctx.reloadPage();
      } }, 'Delete') },
    ], n.rules, { empty: 'No notification rules.' }),
    h('h3', null, 'Emails sent (simulated)'),
    h('p', { class: 'muted small' }, 'Nothing leaves your machine. This list shows who the sandbox would have emailed for each alert.'),
    table([
      { key: 'at', label: 'Time', render: (m) => fmtTime(m.at) },
      { key: 'to', label: 'To' },
      { key: 'title', label: 'Alert' },
      { key: 'severity', label: 'Severity', render: (m) => sev(m.severity) },
      { key: 'device', label: 'Device' },
    ], n.outbox, { empty: 'No emails sent yet.' }));
}

/** "Signed in as" picker, so who-can-change-settings questions can be played with different people. */
function signedIn(n) {
  if (n.users.length < 2) return h('p', { class: 'muted small' }, `Signed in as ${n.users[0]?.name ?? 'unknown'}.`);
  const sel = h('select', { 'aria-label': 'Signed in as', 'data-target': 'select:sign-in-as', onchange: async (e) => {
    const o = await ctx.act('directory.signInAs', { userId: e.target.value }, { silentError: true });
    if (o.ok) await ctx.reloadPage();
  } }, n.users.map((u) => h('option', { value: u.id, selected: u.id === n.actorId }, `${u.name} (Entra: ${u.entraRole}; M365 role group: ${u.roleGroup})`)));
  return h('div', { class: 'row' }, h('label', null, 'Signed in as '), sel,
    n.canManage ? badge('Can manage security settings', 'ok') : badge('Read-only: cannot manage security settings', 'warn'));
}

function open(n) {
  const state = { name: '', all: false, groups: new Set(), sevs: new Set(['High']), recipients: [], draft: '' };
  const groupBoxes = h('div', null);
  wizard({
    title: 'Create email notification rule', finishLabel: 'Save notification rule', state,
    steps: [
      {
        id: 'general', title: 'General',
        render(body) {
          const all = check('All devices (Global administrator only)', state.all, (v) => { state.all = v; paintGroups(); }, { 'data-target': 'check:all-devices' });
          const paintGroups = () => {
            groupBoxes.replaceChildren(...n.deviceGroups.map((g) => check(g.name, state.groups.has(g.id), (v) => { v ? state.groups.add(g.id) : state.groups.delete(g.id); }, { disabled: state.all, 'data-target': `check:group:${g.name}` })));
          };
          paintGroups();
          body.append(
            h('h3', null, 'General'),
            row('Rule name', h('input', { type: 'text', maxlength: '80', value: state.name, oninput: (e) => { state.name = e.target.value; } })),
            h('div', { class: 'field' }, h('label', null, 'Devices'), all, groupBoxes),
            h('div', { class: 'field' }, h('label', null, 'Alert severity'),
              n.severities.map((s) => check(s, state.sevs.has(s), (v) => { v ? state.sevs.add(s) : state.sevs.delete(s); }, { 'data-target': `check:sev:${s}` }))),
            h('p', { class: 'note small' }, 'Not simulated: include organization name, tenant-specific portal link and device information options. Those only change the email text.'));
        },
        validate: (s) => (s.name.trim() ? null : 'Enter a rule name.'),
      },
      {
        id: 'recipients', title: 'Recipients',
        render(body) {
          const list = h('ul', { class: 'plain' });
          const paint = () => list.replaceChildren(...state.recipients.map((r) => h('li', null, r, ' ', h('button', { class: 'btn small', type: 'button', 'aria-label': `Remove ${r}`, onclick: () => { state.recipients = state.recipients.filter((x) => x !== r); paint(); } }, 'Remove'))));
          paint();
          const input = h('input', { type: 'text', maxlength: '190', placeholder: 'secops@contoso.com', value: state.draft, 'aria-label': 'Recipient email address', oninput: (e) => { state.draft = e.target.value; } });
          body.append(
            h('h3', null, 'Recipients'),
            h('div', { class: 'row' }, input, h('button', { class: 'btn', type: 'button', 'data-target': 'btn:add-recipient', onclick: () => { const v = state.draft.trim(); if (v && !state.recipients.includes(v)) { state.recipients.push(v); state.draft = ''; input.value = ''; paint(); } } }, 'Add recipient')),
            list);
        },
      },
    ],
    async onFinish(s, api) {
      const params = { name: s.name.trim(), devices: s.all ? 'all' : 'groups', deviceGroups: [...s.groups], severities: [...s.sevs], recipients: s.recipients };
      const o = await ctx.act('defender.createNotificationRule', params, { silentError: true });
      if (!o.ok) return o.error.message;
      api.close(); ctx.toast('Notification rule saved', 'ok'); await ctx.reloadPage();
      return undefined;
    },
  });
}
