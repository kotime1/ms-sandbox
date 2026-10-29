import { h } from '../dom.js';
import { queryEditor } from '../components/query-editor.js';
import { modal, field } from '../components/modal.js';
import { ctx } from '../app.js';

export async function render(host) {
  host.append(
    h('h1', null, 'Advanced hunting'),
    h('p', { class: 'muted' }, 'Defender XDR tables only (here: DeviceLogonEvents). Sentinel tables such as SigninLogs live in the Sentinel Logs blade.'));
  await queryEditor(host, 'defender', {
    extra: (getQuery) => h('button', { class: 'btn', type: 'button', 'data-target': 'btn:create-detection', onclick: () => detectionDialog(getQuery()) }, 'Create detection rule'),
  });
}

function detectionDialog(query) {
  const name = h('input', { type: 'text', value: 'My detection rule', maxlength: '80' });
  const title = h('input', { type: 'text', value: 'Suspicious activity detected', maxlength: '120' });
  const severity = h('select', null, ['Low', 'Medium', 'High'].map((s) => h('option', { value: s, selected: s === 'High' }, s)));
  const isolate = h('input', { type: 'checkbox' });
  const q = h('textarea', { class: 'kql', rows: '6', maxlength: '4000', 'aria-label': 'Detection query' });
  q.value = query;
  modal({
    title: 'Create custom detection rule', wide: true,
    content: [
      h('p', { class: 'muted' }, 'The query must return Timestamp, ReportId and a column that identifies the entity to act on. The rule runs on a schedule in the real service; the sandbox runs it as soon as you save.'),
      field('Detection name', name), field('Alert title', title), field('Severity', severity), field('Query', q),
      h('div', { class: 'field' }, h('strong', null, 'Actions'), h('label', { class: 'toggle' }, isolate, ' Isolate device (full network isolation)')),
    ],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Create', primary: true, target: 'btn:save-detection', onClick: async (x) => {
        const out = await ctx.act('defender.createDetection', { name: name.value, alertTitle: title.value, severity: severity.value, query: q.value, isolateDevice: isolate.checked }, { silentError: true });
        if (!out.ok) { x.setError(out.error.message); return; }
        x.close(); ctx.toast('Custom detection rule created', 'ok'); ctx.navigate('defender/rules');
      } },
    ],
  });
}
