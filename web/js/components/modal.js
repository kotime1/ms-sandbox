import { h } from '../dom.js';

let seq = 0;

/**
 * Accessible modal dialog.
 * buttons: [{ label, primary, danger, onClick(modal) }]. Returns { el, close, setError, body }.
 */
export function modal({ title, content, buttons = [], wide = false }) {
  const prev = document.activeElement;
  const titleId = `m-title-${++seq}`;
  const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const body = h('div', { class: 'modal-body' }, content);
  const m = {};
  const btns = buttons.map((b) => h('button', {
    class: `btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}`.trim(),
    type: 'button',
    'data-target': b.target,
    onclick: async (e) => {
      const btn = e.currentTarget; // currentTarget is null once the event finishes dispatching, i.e. after the await
      btn.disabled = true;
      try { await b.onClick?.(m); } finally { if (btn.isConnected) btn.disabled = false; }
    },
  }, b.label));
  const dialog = h('div', { class: `modal ${wide ? 'wide' : ''}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'modal-head' }, h('h2', { id: titleId }, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => m.close() }, '×')),
    body, err, h('div', { class: 'modal-foot' }, btns));
  const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === backdrop) m.close(); } }, dialog);
  const onKey = (e) => {
    if (e.key === 'Escape') m.close();
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = [...dialog.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  Object.assign(m, {
    el: dialog, body,
    close() { document.removeEventListener('keydown', onKey); backdrop.remove(); prev?.focus?.(); },
    setError(msg) { err.textContent = msg ?? ''; err.hidden = !msg; },
  });
  document.body.append(backdrop);
  (dialog.querySelector('input, select, textarea') ?? btns[btns.length - 1] ?? dialog).focus?.();
  return m;
}

export function field(label, control, hint) {
  const id = `f-${++seq}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('div', { class: 'hint-text' }, hint) : null);
}
