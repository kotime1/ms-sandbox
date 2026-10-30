import { h, clear } from '../dom.js';

let seq = 0;

/**
 * Multi-step wizard in a side panel, like the Defender portal's custom-detection wizard.
 *
 *   steps:  [{ id, title, render(body, state, api) }]   render() builds the step's controls into `body`
 *   state:  a plain object the steps read and write
 *   onFinish(state, api) -> Promise<void|string>   return a string to show it as an error and stay on the review step
 *   api:    { rerender(), setError(msg), goto(index), close() }
 *
 * The step list is clickable (jump back freely, forward only to steps already reached), shows which steps are done, and
 * keeps focus inside the panel. Escape closes it.
 */
export function wizard({ title, steps, state, finishLabel = 'Create', onFinish, intro }) {
  const prev = document.activeElement;
  const titleId = `wz-title-${++seq}`;
  let index = 0;
  let reached = 0;

  const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const body = h('div', { class: 'wz-body' });
  const list = h('ol', { class: 'wz-steps', 'aria-label': 'Steps' });
  const back = h('button', { class: 'btn', type: 'button', onclick: () => api.goto(index - 1) }, 'Back');
  const next = h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:wizard-next' }, 'Next');
  const panel = h('div', { class: 'wizard', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'wz-head' }, h('h2', { id: titleId }, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => api.close() }, '×')),
    intro ? h('p', { class: 'muted small wz-intro' }, intro) : null,
    h('div', { class: 'wz-main' }, list, h('div', { class: 'wz-content' }, body, err)),
    h('div', { class: 'wz-foot' }, back, h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', onclick: () => api.close() }, 'Cancel'), next));
  const backdrop = h('div', { class: 'modal-backdrop wz-backdrop', onmousedown: (e) => { if (e.target === backdrop) api.close(); } }, panel);

  const onKey = (e) => {
    if (e.key === 'Escape') api.close();
    if (e.key === 'Tab') {
      const f = [...panel.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  const paint = () => {
    clear(list).append(...steps.map((s, i) => h('li', { class: `wz-step ${i === index ? 'current' : ''} ${i < reached || (i < index) ? 'done' : ''}` },
      h('button', {
        type: 'button', 'aria-current': i === index ? 'step' : undefined, disabled: i > reached,
        'data-target': `wizard-step:${s.id}`,
        onclick: () => api.goto(i),
      }, h('span', { class: 'wz-num' }, i < index || i < reached ? '✓' : String(i + 1)), ' ', s.title))));
    clear(body);
    steps[index].render(body, state, api);
    back.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? finishLabel : 'Next';
    next.setAttribute('data-target', index === steps.length - 1 ? 'btn:wizard-finish' : 'btn:wizard-next');
    api.setError('');
  };

  const api = {
    el: panel,
    rerender: () => paint(),
    setError(msg) { err.textContent = msg ?? ''; err.hidden = !msg; },
    goto(i) {
      if (i < 0 || i >= steps.length || i > reached) return;
      // leaving a step forward asks the step to validate itself
      if (i > index) {
        const problem = steps[index].validate?.(state);
        if (problem) { api.setError(problem); return; }
      }
      index = i;
      reached = Math.max(reached, index);
      paint();
      body.closest('.wz-content')?.scrollTo?.(0, 0);
    },
    close() { document.removeEventListener('keydown', onKey); backdrop.remove(); prev?.focus?.(); },
  };

  next.addEventListener('click', async () => {
    const problem = steps[index].validate?.(state);
    if (problem) { api.setError(problem); return; }
    if (index < steps.length - 1) { reached = Math.max(reached, index + 1); api.goto(index + 1); return; }
    next.disabled = true;
    try {
      const msg = await onFinish(state, api);
      if (typeof msg === 'string' && msg) api.setError(msg);
    } finally { if (next.isConnected) next.disabled = false; }
  });

  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  paint();
  panel.querySelector('input, select, textarea, button.btn.primary')?.focus?.();
  return api;
}

/** A label + control, with optional help text. */
export function row(labelText, control, help) {
  const id = `wzf-${++seq}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, labelText), control, help ? h('div', { class: 'hint-text' }, help) : null);
}

/** A callout used for "not simulated" notes, so the trainee knows what the real portal has that this does not. */
export const notSimulated = (text) => h('p', { class: 'note small' }, h('strong', null, 'Not simulated: '), text);
