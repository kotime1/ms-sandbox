// A small Markdown reader for tutor replies. It turns text into a plain tree of blocks and inline pieces; view.js turns the tree into DOM
// with h() (text nodes only), so the model's text can never become markup. Pure: no DOM, so it is tested in Node.
//
// Supported: paragraphs, # headings, bullet and numbered lists (nested by indentation), pipe tables with alignment, ``` code fences,
// ```mermaid diagram fences, > quotes, horizontal rules; **bold**, *italic*, `code`, and links to Microsoft sites. Anything else is text.
// Raw HTML is not Markdown here: "<b>" is shown as the characters <b>.

export const MAX_BLOCKS = 80;
const MAX_DEPTH = 3;

/** Links are drawn as links only for https on Microsoft's own sites; every other address stays visible text. */
export function safeHref(url) {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    return ['microsoft.com', 'azure.com', 'office.com', 'windows.net'].some((d) => host === d || host.endsWith(`.${d}`)) ? u.href : null;
  } catch { return null; }
}

const ESCAPABLE = '\\`*_{}[]()#+-.!|>~';

/** Inline pieces: { t: 'text'|'strong'|'em'|'code'|'link', ... }. */
export function parseInline(src, depth = 0) {
  const s = String(src ?? '');
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', text: buf }); buf = ''; } };
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length && ESCAPABLE.includes(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (c === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i + 1) { flush(); out.push({ t: 'code', text: s.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (depth < 2 && (s.startsWith('**', i) || s.startsWith('__', i))) {
      const mark = s.slice(i, i + 2);
      const end = s.indexOf(mark, i + 2);
      if (end > i + 2 && !/^\s/.test(s[i + 2])) { flush(); out.push({ t: 'strong', kids: parseInline(s.slice(i + 2, end), depth + 1) }); i = end + 2; continue; }
    }
    if (depth < 2 && (c === '*' || c === '_') && !s.startsWith(c + c, i)) {
      const end = s.indexOf(c, i + 1);
      // An underscore inside a word (snake_case, table names) is not emphasis.
      const wordy = c === '_' && (/\w/.test(s[i - 1] ?? '') || /\w/.test(s[end + 1] ?? ''));
      if (end > i + 1 && !/^\s/.test(s[i + 1]) && !/\s$/.test(s.slice(i + 1, end)) && !wordy) { flush(); out.push({ t: 'em', kids: parseInline(s.slice(i + 1, end), depth + 1) }); i = end + 1; continue; }
    }
    if (c === '[') {
      const m = /^\[([^\]\n]{1,200})\]\(([^)\s]{1,400})\)/.exec(s.slice(i));
      if (m) {
        const href = safeHref(m[2]);
        flush();
        // A link to anywhere else is not a link: show what the text says and where it claims to point.
        if (href) out.push({ t: 'link', href, kids: parseInline(m[1], depth + 1) });
        else out.push({ t: 'text', text: `${m[1]} (${m[2]})` });
        i += m[0].length;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Cells of one table row. A | inside backticks or after a backslash does not split. */
function cells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '`') code = !code;
    if (c === '|' && !code) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

const isTableStart = (lines, i) => lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && TABLE_SEP.test(lines[i + 1]) && cells(lines[i]).length === cells(lines[i + 1]).length;

/** Text -> blocks. Never throws. */
export function parseMarkdown(src) {
  const lines = String(src ?? '').replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  const blocks = [];
  let i = 0;
  let para = [];
  const endPara = () => { if (para.length) { blocks.push({ t: 'p', kids: parseInline(para.join(' ')), raw: para.join('\n') }); para = []; } };

  while (i < lines.length && blocks.length < MAX_BLOCKS) {
    const line = lines[i];
    let m;
    if (!line.trim()) { endPara(); i++; continue; }

    if ((m = FENCE.exec(line))) {
      endPara();
      const [, , fence, lang] = m;
      const body = [];
      i++;
      while (i < lines.length && !(lines[i].trim().startsWith(fence[0].repeat(fence.length)) && /^[`~]+\s*$/.test(lines[i].trim()))) body.push(lines[i++]);
      i++; // the closing fence (a fence that never closes runs to the end, which is what a cut-off reply looks like)
      const text = body.join('\n');
      blocks.push(lang.toLowerCase() === 'mermaid' ? { t: 'diagram', source: text } : { t: 'code', lang: lang.toLowerCase(), text });
      continue;
    }
    if (HR.test(line) && !ITEM.test(line)) { endPara(); blocks.push({ t: 'hr' }); i++; continue; }
    if ((m = HEADING.exec(line))) { endPara(); blocks.push({ t: 'h', level: Math.min(m[1].length, 4), kids: parseInline(m[2]) }); i++; continue; }

    if (isTableStart(lines, i)) {
      endPara();
      const head = cells(lines[i]);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left'));
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|') && rows.length < 40) {
        const row = cells(lines[i++]);
        while (row.length < head.length) row.push('');
        rows.push(row.slice(0, head.length));
      }
      blocks.push({ t: 'table', align, head: head.map((c) => parseInline(c)), rows: rows.map((r) => r.map((c) => parseInline(c))) });
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      endPara();
      const inner = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) inner.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      blocks.push({ t: 'quote', kids: parseMarkdown(inner.join('\n')) });
      continue;
    }

    if (ITEM.test(line)) {
      endPara();
      const list = [];
      while (i < lines.length && lines[i].trim() && (ITEM.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) list.push(lines[i++]);
      blocks.push(buildList(list));
      continue;
    }

    para.push(line.trim());
    i++;
  }
  endPara();
  return blocks;
}

/** A run of list lines -> { t: 'list', ordered, start, items: [{ kids, sub }] }, nesting by indentation. */
function buildList(lines) {
  const root = { t: 'list', ordered: false, start: 1, items: [] };
  const open = [{ indent: -1, list: root }];
  for (const line of lines) {
    const m = ITEM.exec(line);
    if (!m) { // a continuation line belongs to the last item
      const last = open.at(-1).list.items.at(-1);
      if (last) last.kids = [...last.kids, { t: 'text', text: ` ${line.trim()}` }];
      continue;
    }
    const indent = m[1].length;
    while (open.length > 1 && indent <= open.at(-1).indent - 0 && indent < open.at(-1).indent) open.pop();
    let top = open.at(-1);
    if (indent > top.indent && top.list.items.length && open.length <= MAX_DEPTH && indent >= top.indent + 2 && top.indent !== indent) {
      const parent = top.list.items.at(-1);
      const ordered = /\d/.test(m[2]);
      const sub = { t: 'list', ordered, start: ordered ? Number.parseInt(m[2], 10) : 1, items: [] };
      parent.sub = [...(parent.sub ?? []), sub];
      open.push({ indent, list: sub });
      top = open.at(-1);
    } else if (top.list === root && !root.items.length) {
      root.ordered = /\d/.test(m[2]);
      root.start = root.ordered ? Number.parseInt(m[2], 10) : 1;
    }
    top.list.items.push({ kids: parseInline(m[3]), sub: [] });
  }
  return root;
}

/** The plain text of inline pieces (used for screen-reader labels). */
export const inlineText = (kids) => kids.map((k) => (k.text ?? inlineText(k.kids ?? []))).join('');
