// Text helpers shared by the diagram layout code. Pure: no DOM, so the layout can be tested in Node.
//
// The layout cannot measure text (that needs a browser), so it estimates: one character is CHAR_W wide at the 13px the diagrams use. The
// estimate is slightly generous so labels fit; the picture is an SVG that scales, so a little extra room costs nothing.

export const CHAR_W = 7.2;
export const LINE_H = 17;

const ENTITY = { '#quot;': '"', '#amp;': '&', '#lt;': '<', '#gt;': '>', '#35;': '#', '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };

/**
 * A label as the model wrote it, made into plain text: <br> becomes a new line, any other tag is dropped, a few entities are decoded,
 * surrounding quotes are removed. Nothing here is ever treated as markup; the view puts the result in text nodes.
 */
export function cleanLabel(raw, max = 120) {
  let s = String(raw ?? '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?[a-z][^>]*>/gi, '');
  s = s.replace(/#(?:quot|amp|lt|gt|35);|&(?:quot|amp|lt|gt|nbsp);/g, (m) => ENTITY[m]);
  s = s.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('`') && s.endsWith('`')))) s = s.slice(1, -1);
  if (s.startsWith('"`') && s.endsWith('`"')) s = s.slice(2, -2);
  const lines = s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l, i, all) => l || (i > 0 && i < all.length - 1));
  return lines.join('\n').slice(0, max);
}

/** Wrap a label to at most `maxChars` per line (greedy, on spaces; a longer word is split). At most `maxLines`; the last gets an ellipsis. */
export function wrap(text, maxChars = 24, maxLines = 6) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (let word of para.split(' ')) {
      if (!word) continue;
      while (word.length > maxChars) {
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else { out.push(line); line = word; }
    }
    if (line || !para) out.push(line);
  }
  if (out.length > maxLines) {
    out.length = maxLines;
    out[maxLines - 1] = `${out[maxLines - 1].slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return out.length ? out : [''];
}

export const longest = (lines) => lines.reduce((m, l) => Math.max(m, l.length), 0);
export const textWidth = (lines) => longest(lines) * CHAR_W;
