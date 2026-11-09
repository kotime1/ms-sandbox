// A reader for the part of Mermaid the tutor is asked to write: flowcharts (flowchart / graph) and sequence diagrams.
//
// Why not the real Mermaid library: it writes <style> elements and style="" attributes into every picture, which this app's CSP
// (style-src 'self') blocks; measured in headless Edge it drew black boxes and 40 CSP violations. It is also 2.5 MB. So the model writes
// Mermaid TEXT (compact, and it knows the syntax) and the page draws it itself, as SVG styled only by CSS classes.
//
// Pure: no DOM. parseDiagram() never throws; it returns { error } for anything it cannot draw, and the page then shows the text instead.
// Nothing from the model is ever treated as markup: labels are plain strings that the view puts in text nodes.

import { cleanLabel } from './text.js';

export const LIMITS = { source: 6000, nodes: 40, edges: 80, participants: 8, messages: 40 };

const FLOW_START = /^(flowchart|graph)(?:\s+(TD|TB|BT|LR|RL))?\s*$/i;

const SHAPES = [
  ['(((', [')))'], 'circle'], ['((', ['))'], 'circle'], ['([', ['])'], 'stadium'], ['[(', [')]'], 'cylinder'],
  ['[[', [']]'], 'subroutine'], ['{{', ['}}'], 'hexagon'],
  ['[/', ['/]', '\\]'], 'rect'], ['[\\', ['\\]', '/]'], 'rect'],
  ['>', [']'], 'flag'], ['{', ['}'], 'diamond'], ['(', [')'], 'round'], ['[', [']'], 'rect'],
];

const fail = (error) => ({ error });

/** Source text -> { kind: 'flow' | 'sequence', ... } or { error }. */
export function parseDiagram(source) {
  const text = String(source ?? '').replace(/\r/g, '');
  if (text.length > LIMITS.source) return fail(`The diagram text is longer than ${LIMITS.source} characters.`);
  const lines = text.split('\n');
  // An optional front-matter block (--- title ... ---) and %% comments are skipped.
  let i = 0;
  let title = '';
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.trim() === '---') {
    for (i++; i < lines.length && lines[i].trim() !== '---'; i++) {
      const m = /^\s*title:\s*(.+)$/i.exec(lines[i]);
      if (m) title = cleanLabel(m[1], 80);
    }
    i++;
  }
  const body = lines.slice(i).map((l) => l.trim()).filter((l) => l && !l.startsWith('%%'));
  if (!body.length) return fail('The diagram is empty.');
  const head = body[0];
  const flow = FLOW_START.exec(head);
  if (flow) return { title, ...parseFlow(body.slice(1), (flow[2] ?? 'TD').toUpperCase().replace('TB', 'TD')) };
  if (/^sequenceDiagram\b/i.test(head)) return { title, ...parseSequence(body.slice(1)) };
  const word = /^[A-Za-z][\w-]*/.exec(head)?.[0] ?? 'this';
  return fail(`Only flowcharts and sequence diagrams can be drawn here ("${word}" is not supported).`);
}

// ---- flowchart ------------------------------------------------------------------------------------

/** Split a line at ; but not inside quotes or brackets. */
function splitStatements(line) {
  const out = [];
  let depth = 0;
  let quote = false;
  let from = 0;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (c === '"') quote = !quote;
    else if (!quote) {
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
      else if (c === ';' && depth === 0) { out.push(line.slice(from, k)); from = k + 1; }
    }
  }
  out.push(line.slice(from));
  return out.map((s) => s.trim()).filter(Boolean);
}

const ID = /^[\p{L}\p{N}_]+/u;

/** Find where a node label ends: the first closer outside quotes (counting nested single brackets). Returns -1 if there is none. */
function findCloser(st, from, opener, closers) {
  let quote = false;
  let depth = 0;
  const open1 = opener.length === 1 ? opener : null;
  for (let k = from; k < st.length; k++) {
    const c = st[k];
    if (c === '"') { quote = !quote; continue; }
    if (quote) continue;
    const hit = closers.find((cl) => st.startsWith(cl, k));
    if (hit) {
      if (open1 && depth > 0 && hit.length === 1) { depth--; continue; }
      return { at: k, len: hit.length };
    }
    if (open1 && c === open1) depth++;
  }
  return -1;
}

function readNode(st, i) {
  const m = ID.exec(st.slice(i));
  if (!m) return null;
  const id = m[0];
  let j = i + id.length;
  let label = null;
  let shape = null;
  for (const [open, closers, kind] of SHAPES) {
    if (!st.startsWith(open, j)) continue;
    const end = findCloser(st, j + open.length, open, closers);
    if (end === -1) return { error: `A shape that starts with ${open} is never closed.` };
    label = cleanLabel(st.slice(j + open.length, end.at));
    shape = kind;
    j = end.at + end.len;
    break;
  }
  const cls = /^:::[\w-]+/.exec(st.slice(j));
  if (cls) j += cls[0].length;
  return { id, label, shape, next: j };
}

const LINK_TEXT = [
  [/^(<)?--\s+(.+?)\s+(-{2,}>|-{3,}|--[ox])(?=\s|$)/, 'solid'],
  [/^(<)?-\.\s+(.+?)\s+(\.-+>|\.-)(?=\s|$)/, 'dotted'],
  [/^(<)?==\s+(.+?)\s+(={2,}>|={3,})(?=\s|$)/, 'thick'],
];
const LINK_PLAIN = [
  [/^(<)?(--[ox]|-{2,}>|-{3,})/, 'solid'],
  [/^(<)?(-\.+->|-\.+-)/, 'dotted'],
  [/^(<)?(={2,}>|={3,})/, 'thick'],
];

function readLink(st, i) {
  const rest = st.slice(i);
  for (const [re, kind] of LINK_TEXT) {
    const m = re.exec(rest);
    if (m) return { kind, label: cleanLabel(m[2]), end: m[3].endsWith('>') || /[ox]$/.test(m[3]), start: Boolean(m[1]), len: m[0].length };
  }
  for (const [re, kind] of LINK_PLAIN) {
    const m = re.exec(rest);
    if (!m) continue;
    let len = m[0].length;
    let label = '';
    const bar = /^\s*\|([^|]*)\|/.exec(rest.slice(len));
    if (bar) { label = cleanLabel(bar[1]); len += bar[0].length; }
    return { kind, label, end: m[2].endsWith('>') || /[ox]$/.test(m[2]), start: Boolean(m[1]), len };
  }
  return null;
}

function parseFlow(body, direction) {
  const nodes = new Map();
  const groups = new Map();
  const edges = [];
  const stack = []; // open subgraphs
  const order = [];

  const touch = (ref) => {
    let n = nodes.get(ref.id);
    if (!n) { n = { id: ref.id, label: ref.id, shape: 'rect', group: null }; nodes.set(ref.id, n); order.push(n); }
    if (ref.label !== null) { n.label = ref.label || ref.id; n.shape = ref.shape; }
    if (stack.length && n.group === null) n.group = stack.at(-1);
    return n;
  };

  for (const line of body) {
    if (/^(style|classDef|class|linkStyle|click|direction|accTitle|accDescr)\b/i.test(line)) continue;
    const sub = /^subgraph\s+(.+)$/i.exec(line);
    if (sub) {
      const arg = sub[1].trim();
      const named = /^([\p{L}\p{N}_]+)\s*\[(.*)\]$/u.exec(arg);
      const id = named ? named[1] : arg.replace(/\W+/g, '_').replace(/^_+|_+$/g, '') || `g${groups.size + 1}`;
      const label = cleanLabel(named ? named[2] : arg, 60) || id;
      if (groups.has(id)) return fail(`Two groups are both called "${id}".`);
      groups.set(id, { id, title: label, parent: stack.at(-1) ?? null });
      stack.push(id);
      continue;
    }
    if (/^end$/i.test(line)) { stack.pop(); continue; }

    for (const st of splitStatements(line)) {
      let i = 0;
      const groupsOfNodes = [];
      const links = [];
      for (;;) {
        while (st[i] === ' ') i++;
        const here = [];
        for (;;) {
          while (st[i] === ' ') i++;
          const ref = readNode(st, i);
          if (!ref) return fail(`Could not read "${st.slice(i, i + 24)}".`);
          if (ref.error) return fail(ref.error);
          here.push(touch(ref));
          i = ref.next;
          while (st[i] === ' ') i++;
          if (st[i] === '&') { i++; continue; }
          break;
        }
        groupsOfNodes.push(here);
        if (i >= st.length) break;
        const link = readLink(st, i);
        if (!link) return fail(`Could not read "${st.slice(i, i + 24)}".`);
        links.push(link);
        i += link.len;
        if (nodes.size > LIMITS.nodes) return fail(`More than ${LIMITS.nodes} steps; ask for a smaller diagram.`);
      }
      links.forEach((link, k) => {
        for (const a of groupsOfNodes[k]) for (const b of groupsOfNodes[k + 1]) edges.push({ from: a.id, to: b.id, label: link.label, kind: link.kind, end: link.end, start: link.start });
      });
      if (edges.length > LIMITS.edges) return fail(`More than ${LIMITS.edges} arrows; ask for a smaller diagram.`);
    }
  }
  if (stack.length) { /* an unclosed subgraph is closed at the end of the text */ }
  if (!nodes.size) return fail('The diagram has no steps.');
  if (nodes.size > LIMITS.nodes) return fail(`More than ${LIMITS.nodes} steps; ask for a smaller diagram.`);
  // Mermaid allows an arrow to a whole group; this drawing does not. Such an arrow made a step with the group's name, so a step that has the
  // same id as a group and was never given a label of its own is that mistake.
  for (const e of edges) {
    for (const end of [e.from, e.to]) {
      const n = nodes.get(end);
      if (groups.has(end) && n && n.label === n.id && n.shape === 'rect') return fail(`An arrow points at the group "${end}". Arrows must point at steps inside it.`);
    }
  }
  // A group with no steps is dropped; a node keeps the group it was first written in.
  const used = new Set();
  for (const n of nodes.values()) for (let g = n.group; g; g = groups.get(g)?.parent) used.add(g);
  for (const id of [...groups.keys()]) if (!used.has(id)) groups.delete(id);
  return { kind: 'flow', direction, nodes: order, edges, groups: [...groups.values()] };
}

// ---- sequence diagram -----------------------------------------------------------------------------

const ARROW = /^(\S+?)\s*(--?>>|--?>|--?[x)])([+-]?)\s*(\S+?)\s*:\s*(.*)$/;

function parseSequence(body) {
  const people = new Map();
  const rows = [];
  let numbered = false;
  let depth = 0;

  const who = (id, label, actor) => {
    let p = people.get(id);
    if (!p) { p = { id, label: id, actor: false }; people.set(id, p); }
    if (label) p.label = label;
    if (actor) p.actor = true;
    return p;
  };

  for (const line of body) {
    let m;
    if (/^autonumber\b/i.test(line)) { numbered = true; continue; }
    if (/^(activate|deactivate|title|box|end box|create|destroy|link|links|accTitle|accDescr)\b/i.test(line)) continue;
    if ((m = /^(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i.exec(line))) {
      who(m[2], m[3] ? cleanLabel(m[3], 50) : '', m[1].toLowerCase() === 'actor');
      continue;
    }
    if ((m = /^note\s+(left of|right of|over)\s+([^:]+):\s*(.*)$/i.exec(line))) {
      const ids = m[2].split(',').map((s) => s.trim()).filter(Boolean);
      for (const id of ids) who(id);
      rows.push({ type: 'note', side: m[1].toLowerCase(), ids, text: cleanLabel(m[3], 140) });
      continue;
    }
    if ((m = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i.exec(line))) {
      rows.push({ type: 'open', kind: m[1].toLowerCase(), text: cleanLabel(m[2], 80) });
      depth++;
      continue;
    }
    if ((m = /^(else|and|option)\b\s*(.*)$/i.exec(line))) {
      if (depth > 0) rows.push({ type: 'divider', text: cleanLabel(m[2], 80) });
      continue;
    }
    if (/^end$/i.test(line)) {
      if (depth > 0) { depth--; rows.push({ type: 'close' }); }
      continue;
    }
    if ((m = ARROW.exec(line))) {
      const from = who(m[1]);
      const to = who(m[4]);
      const sym = m[2];
      rows.push({ type: 'msg', from: from.id, to: to.id, text: cleanLabel(m[5], 140), dashed: sym.startsWith('--'), open: !sym.includes('>>') && sym.endsWith('>'), cross: sym.endsWith('x') });
      continue;
    }
    return fail(`Could not read "${line.slice(0, 40)}".`);
  }
  while (depth-- > 0) rows.push({ type: 'close' });
  const msgs = rows.filter((r) => r.type === 'msg').length;
  if (!people.size) return fail('The sequence diagram has no participants.');
  if (people.size > LIMITS.participants) return fail(`More than ${LIMITS.participants} participants; ask for a smaller diagram.`);
  if (msgs > LIMITS.messages) return fail(`More than ${LIMITS.messages} messages; ask for a smaller diagram.`);
  return { kind: 'sequence', numbered, participants: [...people.values()], rows };
}

/** A sentence-style summary for screen readers. */
export function describeDiagram(d) {
  if (d.error) return '';
  if (d.kind === 'flow') {
    const label = new Map(d.nodes.map((n) => [n.id, n.label.replace(/\n/g, ' ')]));
    const parts = d.edges.slice(0, 24).map((e) => `${label.get(e.from)} to ${label.get(e.to)}${e.label ? ` (${e.label.replace(/\n/g, ' ')})` : ''}`);
    return `Flowchart with ${d.nodes.length} steps. ${parts.join('; ')}${d.edges.length > 24 ? '; and more' : ''}.`.slice(0, 900);
  }
  const names = new Map(d.participants.map((p) => [p.id, p.label]));
  const parts = d.rows.filter((r) => r.type === 'msg').slice(0, 24).map((r, i) => `${i + 1}. ${names.get(r.from)} to ${names.get(r.to)}: ${r.text}`);
  return `Sequence diagram of ${d.participants.map((p) => p.label).join(', ')}. ${parts.join(' ')}`.slice(0, 1200);
}
