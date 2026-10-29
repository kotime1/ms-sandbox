import { h, svg } from '../dom.js';

// Minimal chart for KQL `render`: column 0 is the x axis, the first numeric column the series.
// Built with createElementNS only (no markup strings), so query output cannot inject HTML/SVG.
const W = 640, H = 260, PAD = { l: 48, r: 12, t: 12, b: 44 };

export function chart(kind, columns, rows) {
  const yi = columns.findIndex((c, i) => i > 0 && (c.type === 'long' || c.type === 'real'));
  if (yi < 0 || !rows.length) return h('div', { class: 'empty' }, 'Nothing to chart: need a label column followed by a numeric column.');
  const pts = rows.slice(0, 200).map((r) => ({ x: String(r[0] ?? ''), y: Number(r[yi]) || 0 }));
  if (kind === 'timechart') pts.sort((a, b) => (a.x < b.x ? -1 : 1));
  const max = Math.max(1, ...pts.map((p) => p.y));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const sx = (i) => PAD.l + (pts.length === 1 ? iw / 2 : (i * iw) / (pts.length - 1));
  const sy = (v) => PAD.t + ih - (v / max) * ih;
  const bar = kind === 'barchart' || kind === 'columnchart' || kind === 'piechart';

  const g = [];
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4, y = sy(v);
    g.push(svg('line', { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y, class: 'ch-grid' }));
    g.push(svg('text', { x: PAD.l - 6, y: y + 4, class: 'ch-axis', 'text-anchor': 'end' }, String(Math.round(v))));
  }
  if (bar) {
    const bw = Math.max(2, (iw / pts.length) * 0.7);
    pts.forEach((p, i) => {
      const x = PAD.l + (i + 0.5) * (iw / pts.length) - bw / 2;
      g.push(svg('rect', { x, y: sy(p.y), width: bw, height: PAD.t + ih - sy(p.y), class: 'ch-bar' }, svg('title', {}, `${p.x}: ${p.y}`)));
    });
  } else {
    g.push(svg('polyline', { points: pts.map((p, i) => `${sx(i)},${sy(p.y)}`).join(' '), class: 'ch-line', fill: 'none' }));
    pts.forEach((p, i) => g.push(svg('circle', { cx: sx(i), cy: sy(p.y), r: 3, class: 'ch-dot' }, svg('title', {}, `${p.x}: ${p.y}`))));
  }
  const step = Math.ceil(pts.length / 6);
  pts.forEach((p, i) => {
    if (i % step) return;
    const x = bar ? PAD.l + (i + 0.5) * (iw / pts.length) : sx(i);
    g.push(svg('text', { x, y: H - 22, class: 'ch-axis', 'text-anchor': 'middle' }, p.x.length > 12 ? `${p.x.slice(0, 11)}…` : p.x));
  });
  g.push(svg('text', { x: W / 2, y: H - 4, class: 'ch-axis', 'text-anchor': 'middle' }, `${columns[0].name} / ${columns[yi].name}`));
  return svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${kind} of ${columns[yi].name}` }, ...g);
}
