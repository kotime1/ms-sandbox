// Turns a tutor reply into DOM. Only h() and svg() are used (text nodes and setAttribute), never innerHTML, and every style is a CSS class,
// so the app's CSP and the front-end guardrail tests still hold. A diagram that cannot be drawn is shown as its text, with the reason.

import { h, svg } from '../dom.js';
import { parseMarkdown, inlineText } from './markdown.js';
import { parseDiagram, describeDiagram } from './mermaid.js';
import { layoutDiagram } from './layout.js';
import { LINE_H } from './text.js';

const inline = (kids) => kids.map((k) => {
  switch (k.t) {
    case 'strong': return h('strong', null, inline(k.kids));
    case 'em': return h('em', null, inline(k.kids));
    case 'code': return h('code', null, k.text);
    // rel and target: a link leaves the sandbox, so it opens a new tab and passes nothing along.
    case 'link': return h('a', { href: k.href, target: '_blank', rel: 'noopener noreferrer nofollow' }, inline(k.kids));
    default: return k.text;
  }
});

const text = (x, y, lines, attrs = {}) => svg('text', { x, y, ...attrs },
  ...lines.map((l, k) => svg('tspan', { x, dy: k === 0 ? 0 : LINE_H }, l)));

/** Lines of text centred on (cx, cy). */
const centred = (cx, cy, lines, cls) => text(cx, cy - ((lines.length - 1) * LINE_H) / 2 + 4.5, lines, { class: cls, 'text-anchor': 'middle' });

function shapeOf(n) {
  const { x, y, w, h: ht } = n;
  const l = x - w / 2;
  const t = y - ht / 2;
  const r = x + w / 2;
  const b = y + ht / 2;
  const cls = 'dg-shape';
  switch (n.shape) {
    case 'diamond': return svg('polygon', { class: cls, points: `${x},${t} ${r},${y} ${x},${b} ${l},${y}` });
    case 'circle': return svg('ellipse', { class: cls, cx: x, cy: y, rx: w / 2, ry: ht / 2 });
    case 'stadium': return svg('rect', { class: cls, x: l, y: t, width: w, height: ht, rx: ht / 2 });
    case 'round': return svg('rect', { class: cls, x: l, y: t, width: w, height: ht, rx: 12 });
    case 'hexagon': return svg('polygon', { class: cls, points: `${l + 14},${t} ${r - 14},${t} ${r},${y} ${r - 14},${b} ${l + 14},${b} ${l},${y}` });
    case 'flag': return svg('polygon', { class: cls, points: `${l},${t} ${r},${t} ${r},${b} ${l},${b} ${l + 12},${y}` });
    case 'cylinder': return svg('g', {},
      svg('path', { class: cls, d: `M${l},${t + 9}V${b - 9}A${w / 2},9 0 0 0 ${r},${b - 9}V${t + 9}A${w / 2},9 0 0 0 ${l},${t + 9}Z` }),
      svg('path', { class: 'dg-line', d: `M${l},${t + 9}A${w / 2},9 0 0 0 ${r},${t + 9}` }));
    case 'subroutine': return svg('g', {},
      svg('rect', { class: cls, x: l, y: t, width: w, height: ht, rx: 3 }),
      svg('path', { class: 'dg-line', d: `M${l + 8},${t}V${b}M${r - 8},${t}V${b}` }));
    default: return svg('rect', { class: cls, x: l, y: t, width: w, height: ht, rx: 5 });
  }
}

function flowSvg(g) {
  const kids = [];
  for (const b of g.boxes) {
    kids.push(svg('rect', { class: 'dg-group', x: b.x, y: b.y, width: b.w, height: b.h, rx: 8 }));
    kids.push(text(b.x + 10, b.y + 17, [b.title], { class: 'dg-group-title' }));
  }
  for (const e of g.edges) {
    kids.push(svg('path', { class: `dg-edge ${e.kind}`, d: e.d, fill: 'none' }));
    if (e.endHead) kids.push(svg('polygon', { class: 'dg-head', points: e.endHead }));
    if (e.startHead) kids.push(svg('polygon', { class: 'dg-head', points: e.startHead }));
  }
  for (const l of g.labels) {
    kids.push(svg('rect', { class: 'dg-label-bg', x: l.x - l.w / 2, y: l.y - l.h / 2, width: l.w, height: l.h, rx: 4 }));
    kids.push(centred(l.x, l.y, l.lines, 'dg-edge-label'));
  }
  for (const n of g.nodes) {
    kids.push(shapeOf(n));
    kids.push(centred(n.x, n.y, n.lines, 'dg-text'));
  }
  return kids;
}

function sequenceSvg(g) {
  const kids = [];
  for (const it of g.items.filter((i) => i.type === 'frame')) {
    kids.push(svg('rect', { class: 'dg-frame', x: it.x, y: it.y, width: it.w, height: it.h, rx: 4 }));
    kids.push(svg('rect', { class: 'dg-frame-tag', x: it.x, y: it.y, width: 14 + it.kind.length * 7, height: 18, rx: 3 }));
    kids.push(text(it.x + 7, it.y + 13, [it.kind], { class: 'dg-frame-kind' }));
    if (it.text) kids.push(text(it.x + 24 + it.kind.length * 7, it.y + 13, [`[${it.text}]`], { class: 'dg-frame-text' }));
  }
  for (const p of g.heads) kids.push(svg('line', { class: 'dg-life', x1: p.x, x2: p.x, y1: g.lifelines.y1, y2: g.lifelines.y2 }));
  for (const it of g.items) {
    if (it.type === 'divider') {
      kids.push(svg('line', { class: 'dg-divider', x1: it.x1, x2: it.x2, y1: it.y, y2: it.y }));
      if (it.text) kids.push(text(it.x1 + 8, it.y + 14, [`[${it.text}]`], { class: 'dg-frame-text' }));
    } else if (it.type === 'note') {
      kids.push(svg('rect', { class: 'dg-note', x: it.x, y: it.y, width: it.w, height: it.h, rx: 3 }));
      kids.push(centred(it.x + it.w / 2, it.y + it.h / 2, it.lines, 'dg-text'));
    } else if (it.type === 'msg') {
      const cls = `dg-edge${it.dashed ? ' dotted' : ''}`;
      if (it.self) {
        const x = it.x1;
        kids.push(svg('path', { class: cls, fill: 'none', d: `M${x},${it.y}H${x + 36}V${it.y + 22}H${x + 2}` }));
        kids.push(svg('polygon', { class: 'dg-head', points: `${x},${it.y + 22} ${x + 10},${it.y + 17} ${x + 10},${it.y + 27}` }));
        kids.push(text(x + 44, it.y - 2, it.lines, { class: 'dg-edge-label-seq', 'text-anchor': 'start' }));
      } else {
        const dir = Math.sign(it.x2 - it.x1) || 1;
        const tipX = it.x2;
        kids.push(svg('line', { class: cls, x1: it.x1, y1: it.y, x2: tipX - (it.tip === 'filled' ? dir * 9 : 0), y2: it.y }));
        if (it.tip === 'filled') kids.push(svg('polygon', { class: 'dg-head', points: `${tipX},${it.y} ${tipX - dir * 11},${it.y - 5} ${tipX - dir * 11},${it.y + 5}` }));
        else if (it.tip === 'open') kids.push(svg('path', { class: 'dg-edge', fill: 'none', d: `M${tipX - dir * 10},${it.y - 5}L${tipX},${it.y}L${tipX - dir * 10},${it.y + 5}` }));
        else kids.push(svg('path', { class: 'dg-edge', fill: 'none', d: `M${tipX - 6},${it.y - 5}L${tipX + 4},${it.y + 5}M${tipX + 4},${it.y - 5}L${tipX - 6},${it.y + 5}` }));
        kids.push(text((it.x1 + it.x2) / 2, it.y - 6 - (it.lines.length - 1) * LINE_H, it.lines, { class: 'dg-edge-label-seq', 'text-anchor': 'middle' }));
      }
    }
  }
  for (const p of g.heads) {
    kids.push(svg('rect', { class: 'dg-shape', x: p.x - p.w / 2, y: p.y, width: p.w, height: p.h, rx: p.actor ? p.h / 2 : 5 }));
    kids.push(centred(p.x, p.y + p.h / 2, p.lines, 'dg-text'));
  }
  return kids;
}

/** A drawn diagram, or its text and the reason it could not be drawn. */
export function diagramView(source) {
  const parsed = parseDiagram(source);
  const asText = (why) => h('figure', { class: 'rich-diagram is-text' },
    h('figcaption', { class: 'muted small' }, `${why} Showing the diagram text instead.`),
    h('pre', { class: 'rich-code' }, h('code', null, source)));
  if (parsed.error) return asText(parsed.error);
  let g;
  try { g = layoutDiagram(parsed); } catch { return asText('The diagram could not be laid out.'); }
  if (!(g.width > 0 && g.height > 0) || g.width > 5000 || g.height > 5000) return asText('The diagram is too large to draw.');
  const label = describeDiagram(parsed);
  const root = svg('svg', { class: `dg dg-${g.kind}`, viewBox: `0 0 ${g.width} ${g.height}`, width: g.width, height: g.height, role: 'img', 'aria-label': label.slice(0, 600), preserveAspectRatio: 'xMinYMin meet' },
    svg('title', {}, parsed.title || (g.kind === 'flow' ? 'Flowchart' : 'Sequence diagram')),
    ...(g.kind === 'flow' ? flowSvg(g) : sequenceSvg(g)));
  return h('figure', { class: 'rich-diagram' },
    parsed.title ? h('figcaption', { class: 'rich-diagram-title' }, parsed.title) : null,
    h('div', { class: 'rich-diagram-scroll', tabindex: 0, role: 'group', 'aria-label': 'Diagram. Scroll to see all of it.' }, root),
    h('details', { class: 'rich-diagram-src' }, h('summary', null, 'Diagram text'), h('pre', { class: 'rich-code' }, h('code', null, source))));
}

const alignClass = (a) => (a === 'center' ? 'is-center' : a === 'right' ? 'is-right' : null);

function block(b) {
  switch (b.t) {
    case 'p': return h('p', null, inline(b.kids));
    case 'h': return h(`h${b.level + 2 > 6 ? 6 : b.level + 2}`, { class: 'rich-h' }, inline(b.kids)); // a reply's # is a small heading inside a chat bubble
    case 'hr': return h('hr', { class: 'rich-hr' });
    case 'code': return h('pre', { class: 'rich-code' }, h('code', null, b.text));
    case 'diagram': return diagramView(b.text ?? b.source);
    case 'quote': return h('blockquote', { class: 'rich-quote' }, b.kids.map(block));
    case 'table': return h('div', { class: 'rich-table-wrap', tabindex: 0, role: 'group', 'aria-label': 'Table. Scroll to see all of it.' },
      h('table', { class: 'rich-table' },
        h('thead', null, h('tr', null, b.head.map((c, k) => h('th', { scope: 'col', class: alignClass(b.align[k]) }, inline(c))))),
        h('tbody', null, b.rows.map((r) => h('tr', null, r.map((c, k) => h('td', { class: alignClass(b.align[k]) }, inline(c))))))));
    case 'list': return listView(b);
    default: return null;
  }
}

function listView(l) {
  return h(l.ordered ? 'ol' : 'ul', { class: 'rich-list', start: l.ordered && l.start !== 1 ? l.start : null },
    l.items.map((it) => h('li', null, inline(it.kids), it.sub?.map(listView))));
}

/** A whole reply as a <div class="rich"> of blocks. Empty text gives an empty div. */
export function richView(source) {
  return h('div', { class: 'rich' }, parseMarkdown(source).map(block));
}

export { inlineText };
