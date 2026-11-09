// Layout for the diagrams parsed by mermaid.js. Pure geometry (numbers and path strings), no DOM, so it is tested in Node.
//
// Flowcharts use the usual layered method: break cycles, give every step a layer, add routing points for arrows that skip layers, order each
// layer to reduce crossings, then place steps. Sequence diagrams are columns (one per participant) and rows (one per message).

import { wrap, textWidth, LINE_H, CHAR_W } from './text.js';

const MARGIN = 16;
const NODE_GAP = 38;
const LAYER_GAP = 62;
const LABELLED_LAYER_GAP = 84;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- flowchart ------------------------------------------------------------------------------------

function sizeNode(n) {
  const lines = wrap(n.label, 22, 6);
  const tw = textWidth(lines);
  const th = lines.length * LINE_H;
  let w = Math.max(64, tw + 28);
  let h = th + 20;
  let clip = 'rect';
  if (n.shape === 'diamond') { w = (tw + 28) * 1.35; h = Math.max(54, (th + 20) * 1.6); clip = 'diamond'; }
  else if (n.shape === 'circle') { w = h = Math.max(48, Math.hypot(tw, th) + 18); clip = 'ellipse'; }
  else if (n.shape === 'hexagon') { w += 28; clip = 'rect'; }
  else if (n.shape === 'cylinder') { h += 16; }
  else if (n.shape === 'subroutine') { w += 16; }
  else if (n.shape === 'flag') { w += 14; }
  else if (n.shape === 'stadium' || n.shape === 'round') { w += 8; }
  return { w, h, lines, clip };
}

/** Where a line from the centre of a shape towards `to` leaves the shape. */
function leave(c, size, to) {
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (!dx && !dy) return { x: c.x, y: c.y };
  const hw = size.w / 2;
  const hh = size.h / 2;
  let t;
  if (size.clip === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else if (size.clip === 'ellipse') t = 1 / Math.hypot(dx / hw, dy / hh);
  else t = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Points of an arrow head at `tip`, pointing away from `from`. */
function head(from, tip) {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x);
  const L = 10;
  const W = Math.PI / 7;
  const p = (ang) => `${(tip.x - L * Math.cos(ang)).toFixed(1)},${(tip.y - L * Math.sin(ang)).toFixed(1)}`;
  return `${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${p(a - W)} ${p(a + W)}`;
}

/** A smooth path through the points (Catmull-Rom turned into cubic curves); two points give a straight line. */
function smooth(pts) {
  const f = (n) => n.toFixed(1);
  if (pts.length === 2) return `M${f(pts[0].x)},${f(pts[0].y)}L${f(pts[1].x)},${f(pts[1].y)}`;
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += `C${f(p1.x + (p2.x - p0.x) / 6)},${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)},${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/** Edges of a cycle go backwards: find them with a depth-first walk that starts from steps nothing points at. */
function backEdges(ids, out) {
  const state = new Map();
  const back = new Set();
  const incoming = new Set([...out.values()].flat());
  const starts = [...ids.filter((id) => !incoming.has(id)), ...ids.filter((id) => incoming.has(id))];
  for (const s of starts) {
    if (state.has(s)) continue;
    const stack = [[s, 0]];
    state.set(s, 1);
    while (stack.length) {
      const top = stack.at(-1);
      const next = out.get(top[0])[top[1]++];
      if (next === undefined) { state.set(top[0], 2); stack.pop(); continue; }
      if (state.get(next) === 1) back.add(`${top[0]}>${next}`);
      else if (!state.has(next)) { state.set(next, 1); stack.push([next, 0]); }
    }
  }
  return back;
}

export function layoutFlow(d) {
  const horizontal = d.direction === 'LR' || d.direction === 'RL';
  const ids = d.nodes.map((n) => n.id);
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const sizes = new Map(d.nodes.map((n) => [n.id, sizeNode(n)]));
  const across = (id) => (id.startsWith('~') ? 8 : horizontal ? sizes.get(id).h : sizes.get(id).w);
  const along = (id) => (id.startsWith('~') ? 0 : horizontal ? sizes.get(id).w : sizes.get(id).h);

  // 1. Layers.
  const out = new Map(ids.map((id) => [id, []]));
  for (const e of d.edges) if (e.from !== e.to && !out.get(e.from).includes(e.to)) out.get(e.from).push(e.to);
  const back = backEdges(ids, out);
  const dag = []; // [u, v, edgeIndex, reversed]
  d.edges.forEach((e, i) => {
    if (e.from === e.to) return;
    const rev = back.has(`${e.from}>${e.to}`);
    dag.push(rev ? [e.to, e.from, i, true] : [e.from, e.to, i, false]);
  });
  const layer = new Map(ids.map((id) => [id, 0]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  const succ = new Map(ids.map((id) => [id, []]));
  for (const [u, v] of dag) { indeg.set(v, indeg.get(v) + 1); succ.get(u).push(v); }
  const queue = ids.filter((id) => !indeg.get(id));
  for (let q = 0; q < queue.length; q++) {
    for (const v of succ.get(queue[q])) {
      layer.set(v, Math.max(layer.get(v), layer.get(queue[q]) + 1));
      indeg.set(v, indeg.get(v) - 1);
      if (!indeg.get(v)) queue.push(v);
    }
  }

  // 2. Routing points for arrows that skip layers.
  const chains = new Map(); // edge index -> ids from the lower layer to the higher
  const everyId = [...ids];
  const layerOf = new Map(layer);
  for (const [u, v, i] of dag) {
    const chain = [u];
    for (let l = layer.get(u) + 1; l < layer.get(v); l++) {
      const id = `~${i}_${l}`;
      chain.push(id);
      layerOf.set(id, l);
      everyId.push(id);
    }
    chain.push(v);
    chains.set(i, chain);
  }
  const top = Math.max(0, ...layerOf.values());
  const layers = Array.from({ length: top + 1 }, () => []);
  for (const id of everyId) layers[layerOf.get(id)].push(id);
  const upN = new Map(everyId.map((id) => [id, []]));
  const downN = new Map(everyId.map((id) => [id, []]));
  for (const chain of chains.values()) for (let k = 0; k < chain.length - 1; k++) { downN.get(chain[k]).push(chain[k + 1]); upN.get(chain[k + 1]).push(chain[k]); }

  // 3. Order each layer: steps of one group stay together; then sweep to reduce crossings.
  const groupOf = new Map(d.groups.map((g) => [g.id, g]));
  const chainOfGroups = (id) => {
    const path = [];
    for (let g = byId.get(id)?.group; g; g = groupOf.get(g)?.parent) path.unshift(g);
    return path;
  };
  const regroup = (list, depth = 0) => {
    const buckets = new Map();
    for (const id of list) {
      const key = chainOfGroups(id)[depth] ?? `#${id}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(id);
    }
    return [...buckets.entries()].flatMap(([key, members]) => (key.startsWith('#') ? members : regroup(members, depth + 1)));
  };
  layers.forEach((l, k) => { layers[k] = regroup(l); });
  const sweep = (from, to, step, nb) => {
    for (let l = from; l !== to; l += step) {
      const ref = new Map(layers[l - step].map((id, k) => [id, k]));
      const cur = new Map(layers[l].map((id, k) => [id, k]));
      const bary = (id) => { const ns = nb.get(id).filter((n) => ref.has(n)); return ns.length ? ns.reduce((s, n) => s + ref.get(n), 0) / ns.length : cur.get(id); };
      layers[l] = regroup([...layers[l]].sort((a, b) => bary(a) - bary(b) || cur.get(a) - cur.get(b)));
    }
  };
  for (let it = 0; it < 4; it++) { sweep(1, layers.length, 1, upN); sweep(layers.length - 2, -1, -1, downN); }

  // 4. Coordinates: u across the layers, v along them.
  const labelled = d.edges.some((e) => e.label);
  const gapAlong = labelled ? LABELLED_LAYER_GAP : LAYER_GAP;
  const u = new Map();
  layers.forEach((l) => {
    const total = l.reduce((s, id) => s + across(id), 0) + NODE_GAP * Math.max(0, l.length - 1);
    let at = -total / 2;
    for (const id of l) { u.set(id, at + across(id) / 2); at += across(id) + NODE_GAP; }
  });
  const settle = (l, wantOf) => {
    const want = l.map((id) => wantOf(id));
    const pos = [];
    l.forEach((id, k) => { pos[k] = k ? Math.max(want[k], pos[k - 1] + across(l[k - 1]) / 2 + across(id) / 2 + NODE_GAP) : want[k]; });
    const shift = pos.reduce((s, p, k) => s + (want[k] - p), 0) / pos.length;
    l.forEach((id, k) => u.set(id, pos[k] + shift));
  };
  for (let it = 0; it < 6; it++) {
    for (let k = 1; k < layers.length; k++) settle(layers[k], (id) => { const ns = upN.get(id); return ns.length ? ns.reduce((s, n) => s + u.get(n), 0) / ns.length : u.get(id); });
    for (let k = layers.length - 2; k >= 0; k--) settle(layers[k], (id) => { const ns = downN.get(id); return ns.length ? ns.reduce((s, n) => s + u.get(n), 0) / ns.length : u.get(id); });
  }
  const v = new Map();
  let at = 0;
  layers.forEach((l, k) => {
    const thick = Math.max(0, ...l.map(along));
    v.set(k, at + thick / 2);
    at += thick + gapAlong;
  });
  const sign = d.direction === 'BT' || d.direction === 'RL' ? -1 : 1;
  const point = (id) => {
    const a = u.get(id);
    const b = sign * v.get(layerOf.get(id));
    return horizontal ? { x: b, y: a } : { x: a, y: b };
  };

  // 4b. Group boxes. A box is the rectangle around its steps, so two groups whose steps interleave, or a step that sits inside a box it does
  // not belong to, would be drawn wrong. Steps and boxes that share a parent are pushed apart across the layers (never along them, so the
  // layers stay put) until none overlap, and steps in one layer are then kept apart again. Capped, so a hard diagram still draws.
  const GAP = 16;
  const rectOfNode = (id) => {
    const c = point(id);
    const s = sizes.get(id) ?? { w: 8, h: 8 };
    return { l: c.x - s.w / 2, r: c.x + s.w / 2, t: c.y - s.h / 2, b: c.y + s.h / 2 };
  };
  const childGroups = (gid) => d.groups.filter((g) => (g.parent ?? null) === gid);
  const stepsIn = (gid) => d.nodes.filter((n) => (n.group ?? null) === gid).map((n) => n.id);
  const allIn = (gid) => [...stepsIn(gid), ...childGroups(gid).flatMap((g) => allIn(g.id))];
  const groupRects = () => {
    const found = new Map();
    const walk = (gid, depth) => {
      const parts = stepsIn(gid).map(rectOfNode);
      for (const c of childGroups(gid)) { const r = walk(c.id, depth + 1); if (r) parts.push(r); }
      if (!parts.length) return null;
      const title = groupOf.get(gid).title;
      const l0 = Math.min(...parts.map((p) => p.l)) - 18;
      const r0 = Math.max(...parts.map((p) => p.r)) + 18;
      const w = Math.max(r0 - l0, textWidth([title]) + 24);
      const rect = { id: gid, depth, title, l: l0 - (w - (r0 - l0)) / 2, r: l0 - (w - (r0 - l0)) / 2 + w, t: Math.min(...parts.map((p) => p.t)) - 30, b: Math.max(...parts.map((p) => p.b)) + 16 };
      found.set(gid, rect);
      return rect;
    };
    for (const g of childGroups(null)) walk(g.id, 0);
    return found;
  };
  if (d.groups.length) {
    const centre = (r) => (horizontal ? (r.t + r.b) / 2 : (r.l + r.r) / 2);
    const hit = (p, q) => p.l < q.r + GAP && q.l < p.r + GAP && p.t < q.b + GAP && q.t < p.b + GAP;
    const loose = everyId.filter((id) => id.startsWith('~'));
    for (let round = 0; round < 300; round++) {
      const rects = groupRects();
      let moved = false;
      for (const gid of [null, ...d.groups.map((g) => g.id)]) {
        if (gid !== null && !rects.has(gid)) continue;
        const items = [
          ...stepsIn(gid).map((id) => ({ ids: [id], rect: rectOfNode(id), group: false })),
          ...childGroups(gid).filter((g) => rects.has(g.id)).map((g) => ({ ids: allIn(g.id), rect: rects.get(g.id), group: true })),
          ...(gid === null ? loose.map((id) => ({ ids: [id], rect: rectOfNode(id), group: false })) : []),
        ];
        let done = false;
        for (let a = 0; a < items.length && !done; a++) {
          for (let b = a + 1; b < items.length && !done; b++) {
            if (!items[a].group && !items[b].group) continue;
            if (!hit(items[a].rect, items[b].rect)) continue;
            const [lo, hi] = centre(items[a].rect) <= centre(items[b].rect) ? [items[a], items[b]] : [items[b], items[a]];
            const delta = (horizontal ? lo.rect.b - hi.rect.t : lo.rect.r - hi.rect.l) + GAP;
            for (const id of hi.ids) u.set(id, u.get(id) + delta);
            moved = true;
            done = true;
          }
        }
      }
      for (const l of layers) {
        const order = [...l].sort((p, q) => u.get(p) - u.get(q));
        for (let k = 1; k < order.length; k++) {
          const least = u.get(order[k - 1]) + across(order[k - 1]) / 2 + across(order[k]) / 2 + NODE_GAP;
          if (u.get(order[k]) < least) { u.set(order[k], least); moved = true; }
        }
      }
      if (!moved) break;
    }
  }

  // 5. Shapes, arrows, labels, group boxes.
  const nodes = d.nodes.map((n) => {
    const c = point(n.id);
    const s = sizes.get(n.id);
    return { id: n.id, shape: n.shape, x: c.x, y: c.y, w: s.w, h: s.h, lines: s.lines, group: n.group };
  });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges = d.edges.map((e, i) => {
    const base = { kind: e.kind, label: e.label, start: e.start, end: e.end };
    if (e.from === e.to) {
      const n = nodeById.get(e.from);
      const x = n.x + n.w / 2;
      const p = [{ x, y: n.y - n.h / 4 }, { x: x + 44, y: n.y - n.h / 2 - 16 }, { x: x + 44, y: n.y + n.h / 2 + 16 }, { x, y: n.y + n.h / 4 }];
      return { ...base, d: `M${p[0].x},${p[0].y}C${p[1].x},${p[1].y} ${p[2].x},${p[2].y} ${p[3].x},${p[3].y}`, endHead: head({ x: x + 20, y: p[3].y + 6 }, p[3]), startHead: '', mid: { x: x + 46, y: n.y } };
    }
    const chain = chains.get(i);
    const ordered = back.has(`${e.from}>${e.to}`) ? [...chain].reverse() : chain;
    const centres = ordered.map(point);
    const first = nodeById.get(ordered[0]);
    const last = nodeById.get(ordered.at(-1));
    const pts = [leave(centres[0], sizes.get(first.id), centres[1]), ...centres.slice(1, -1), leave(centres.at(-1), sizes.get(last.id), centres.at(-2))];
    const midIdx = Math.floor((pts.length - 1) / 2);
    const mid = pts.length % 2 === 0 ? { x: (pts[midIdx].x + pts[midIdx + 1].x) / 2, y: (pts[midIdx].y + pts[midIdx + 1].y) / 2 } : pts[midIdx];
    return { ...base, d: smooth(pts), endHead: e.end ? head(pts.at(-2), pts.at(-1)) : '', startHead: e.start ? head(pts[1], pts[0]) : '', mid };
  });
  const labels = edges.filter((e) => e.label).map((e) => {
    const lines = wrap(e.label, 18, 3);
    return { lines, x: e.mid.x, y: e.mid.y, w: textWidth(lines) + 12, h: lines.length * LINE_H + 4 };
  });

  // A group box encloses its steps and its child groups. Outer boxes are listed first so inner ones are drawn on top.
  const boxes = [...groupRects().values()].map((r) => ({ id: r.id, depth: r.depth, title: r.title, x: r.l, y: r.t, w: r.r - r.l, h: r.b - r.t }));
  boxes.sort((p, q) => p.depth - q.depth);

  // 6. Move everything so the top left is at the margin.
  const xs = [];
  const ys = [];
  for (const n of nodes) { xs.push(n.x - n.w / 2, n.x + n.w / 2); ys.push(n.y - n.h / 2, n.y + n.h / 2); }
  for (const b of boxes) { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); }
  for (const l of labels) { xs.push(l.x - l.w / 2, l.x + l.w / 2); ys.push(l.y - l.h / 2, l.y + l.h / 2); }
  for (const e of edges) for (const m of e.d.matchAll(/(-?[0-9.]+),(-?[0-9.]+)/g)) { xs.push(Number(m[1])); ys.push(Number(m[2])); }
  const dx = MARGIN - Math.min(...xs);
  const dy = MARGIN - Math.min(...ys);
  const shiftPath = (p) => p.replace(/(-?[0-9.]+),(-?[0-9.]+)/g, (_, x, y) => `${(Number(x) + dx).toFixed(1)},${(Number(y) + dy).toFixed(1)}`);
  for (const n of nodes) { n.x += dx; n.y += dy; }
  for (const b of boxes) { b.x += dx; b.y += dy; }
  for (const l of labels) { l.x += dx; l.y += dy; }
  for (const e of edges) { e.d = shiftPath(e.d); e.endHead = e.endHead && shiftPath(e.endHead); e.startHead = e.startHead && shiftPath(e.startHead); }
  return { kind: 'flow', width: Math.ceil(Math.max(...xs) + dx + MARGIN), height: Math.ceil(Math.max(...ys) + dy + MARGIN), nodes, edges, labels, boxes };
}

// ---- sequence diagram -----------------------------------------------------------------------------

const HEAD_H = 38;
const ROW_PAD = 16;

export function layoutSequence(d) {
  const people = d.participants.map((p) => {
    const lines = wrap(p.label, 20, 3);
    return { ...p, lines, w: Math.max(84, textWidth(lines) + 24), h: Math.max(HEAD_H, lines.length * LINE_H + 16) };
  });
  const index = new Map(people.map((p, k) => [p.id, k]));
  const headH = Math.max(...people.map((p) => p.h));

  // Distance between neighbouring lifelines: wide enough for the heads, then stretched until every message and note fits.
  const gap = people.slice(1).map((p, k) => Math.max(120, (people[k].w + p.w) / 2 + 24));
  const span = (a, b) => gap.slice(Math.min(a, b), Math.max(a, b)).reduce((s, g) => s + g, 0);
  const needs = [];
  for (const r of d.rows) {
    if (r.type === 'msg' && r.from !== r.to) needs.push([index.get(r.from), index.get(r.to), Math.min(textWidth(wrap(r.text, 40, 3)) + 36, 330)]);
    if (r.type === 'note' && r.ids.length > 1) needs.push([index.get(r.ids[0]), index.get(r.ids.at(-1)), Math.min(textWidth(wrap(r.text, 36, 4)) + 28, 300)]);
  }
  needs.sort((p, q) => Math.abs(p[0] - p[1]) - Math.abs(q[0] - q[1]));
  for (const [a, b, want] of needs) {
    const have = span(a, b);
    if (have < want) for (let k = Math.min(a, b); k < Math.max(a, b); k++) gap[k] += (want - have) / Math.abs(a - b);
  }
  const cx = [];
  people.reduce((x, p, k) => { cx[k] = x; return x + (gap[k] ?? 0); }, 0);

  const items = [];
  const frames = [];
  let y = headH + 24;
  let n = 0;
  for (const r of d.rows) {
    if (r.type === 'msg') {
      const a = cx[index.get(r.from)];
      const b = cx[index.get(r.to)];
      const self = r.from === r.to;
      const chars = self ? 26 : Math.max(14, Math.floor((Math.abs(b - a) - 20) / CHAR_W));
      const lines = wrap(r.text, chars, 4);
      const label = d.numbered ? [`${++n}. ${lines[0]}`, ...lines.slice(1)] : lines;
      const above = lines.length * LINE_H;
      y += above + 4;
      items.push({ type: 'msg', x1: a, x2: b, y, lines: label, self, dashed: r.dashed, tip: r.cross ? 'cross' : r.open ? 'open' : 'filled' });
      y += self ? 34 + ROW_PAD / 2 : ROW_PAD;
    } else if (r.type === 'note') {
      const xs = r.ids.map((id) => cx[index.get(id)]);
      const lines = wrap(r.text, 32, 5);
      const w = Math.max(textWidth(lines) + 20, r.ids.length > 1 ? Math.abs(xs.at(-1) - xs[0]) + 40 : 0);
      const h = lines.length * LINE_H + 12;
      const centre = (xs[0] + xs.at(-1)) / 2;
      const x = r.side === 'left of' ? xs[0] - 10 - w : r.side === 'right of' ? xs[0] + 10 : centre - w / 2;
      items.push({ type: 'note', x, y: y + 4, w, h, lines });
      y += h + 4 + ROW_PAD;
    } else if (r.type === 'open') {
      frames.push({ kind: r.kind, text: r.text, y, depth: frames.length });
      y += (r.text ? 22 : 12) + 8;
    } else if (r.type === 'divider') {
      items.push({ type: 'divider', y: y + 4, text: r.text, depth: frames.length });
      y += 22 + (r.text ? 6 : 0);
    } else if (r.type === 'close') {
      const f = frames.pop();
      if (f) { y += 6; items.push({ type: 'frame', kind: f.kind, text: f.text, y: f.y, h: y - f.y, depth: f.depth }); y += 10; }
    }
  }
  const bottom = y + 8;

  // Everything is placed relative to the lifelines; now find the extremes and add the margin.
  const left = Math.min(...people.map((p, k) => cx[k] - p.w / 2), ...items.filter((i) => i.type === 'note').map((i) => i.x), ...items.filter((i) => i.type === 'msg' && i.self).map((i) => i.x1 - 4));
  const right = Math.max(...people.map((p, k) => cx[k] + p.w / 2), ...items.filter((i) => i.type === 'note').map((i) => i.x + i.w), ...items.filter((i) => i.type === 'msg' && i.self).map((i) => i.x1 + 40 + textWidth(i.lines) + 8));
  const dx = MARGIN + 6 - left;
  const inset = (depth) => depth * 6;
  const out = items.map((i) => {
    if (i.type === 'msg') return { ...i, x1: i.x1 + dx, x2: i.x2 + dx, y: i.y + MARGIN };
    if (i.type === 'note') return { ...i, x: i.x + dx, y: i.y + MARGIN };
    if (i.type === 'frame') return { ...i, x: MARGIN - 6 + inset(i.depth) + (left < MARGIN ? 0 : 0), w: right - left + 12 - 2 * inset(i.depth) + 12, y: i.y + MARGIN };
    return { ...i, x1: MARGIN - 6 + inset(i.depth), x2: right + dx + 6 - inset(i.depth), y: i.y + MARGIN };
  });
  // Frames go first so the lines and boxes drawn later sit on top of them.
  out.sort((p, q) => (p.type === 'frame' ? 0 : 1) - (q.type === 'frame' ? 0 : 1) || (p.type === 'frame' ? p.depth - q.depth : 0));
  return {
    kind: 'sequence',
    width: Math.ceil(right - left + 2 * MARGIN + 12),
    height: Math.ceil(bottom + MARGIN * 2),
    heads: people.map((p, k) => ({ id: p.id, lines: p.lines, actor: p.actor, x: cx[k] + dx, y: MARGIN, w: p.w, h: headH })),
    lifelines: { y1: MARGIN + headH, y2: bottom + MARGIN },
    items: out,
  };
}

export function layoutDiagram(parsed) {
  return parsed.kind === 'flow' ? layoutFlow(parsed) : layoutSequence(parsed);
}

export { dist };
