// Safe DOM builder. There is deliberately no way to inject HTML: text always goes through
// text nodes / textContent, and the dangerous attributes below are refused outright.
// A unit test (test/web-static.test.js) also fails the build if innerHTML & friends appear.

const BOOL = new Set(['disabled', 'checked', 'selected', 'readOnly', 'hidden', 'multiple', 'required']);
const FORBIDDEN = new Set(['innerHTML', 'outerHTML', 'srcdoc', 'srcDoc']);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (FORBIDDEN.has(k)) throw new Error(`h(): '${k}' is not allowed`);
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') value = v; // set after children so <select> can match an <option>
    else if (BOOL.has(k)) el[k] = true;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}

// Always the native method: safeContainer() replaces el.append, which would otherwise recurse into this function.
const nativeAppend = Element.prototype.append;

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === undefined || k === null || k === false) continue;
    nativeAppend.call(el, k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

/**
 * A container whose .append() skips null/undefined/false and flattens arrays, exactly like h().
 * Pages receive one of these, so `cond ? node : null` is safe. The native Element.append would
 * render a literal "null" into the page.
 */
export function safeContainer(tag, props) {
  const el = h(tag, props);
  el.append = (...kids) => { append(el, kids); };
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

export const clear = (el) => { el.replaceChildren(); return el; };

export function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export const badge = (text, kind = '') => h('span', { class: `badge ${kind}`.trim() }, text);
export const sev = (s) => badge(s, `sev-${String(s).toLowerCase()}`);
export const fmtTime = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(); };
