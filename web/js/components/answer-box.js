import { h } from '../dom.js';
import { ctx } from '../app.js';

/**
 * "Report what you found" box for investigation objectives. The expected value is never sent to the
 * browser; the server compares what you type against its own record.
 */
export function answerBox(host, items) {
  const rows = items.map(({ id, label, placeholder }) => {
    const input = h('input', { type: 'text', maxlength: '120', 'aria-label': label, placeholder: placeholder ?? 'Your answer' });
    return { id, input, node: h('div', { class: 'field' }, h('label', null, label), input) };
  });
  host.append(h('section', { class: 'blade' },
    h('h2', null, 'Report your findings'),
    h('p', { class: 'muted' }, 'Type what you found. The lab checks it against the data in the environment.'),
    ...rows.map((r) => r.node),
    h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:submit-answer', onclick: async () => {
      let sent = 0;
      for (const r of rows) {
        if (!r.input.value.trim()) continue;
        const o = await ctx.act('findings.report', { objectiveId: r.id, value: r.input.value.trim() }, { noRefresh: true });
        if (o.ok) sent++;
      }
      await ctx.refresh();
      ctx.toast(sent ? 'Answer recorded. Check your objectives.' : 'Type an answer first.', sent ? 'ok' : 'error');
    } }, 'Submit answer')));
}
