// The tutor's rich replies: the Markdown reader, the Mermaid reader and the diagram layout (all pure, no DOM), and the tutor's handling of
// replies that contain them. The DOM view is checked in the browser (scripts/e2e-exam-cards.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline, safeHref, MAX_BLOCKS } from '../web/js/rich/markdown.js';
import { parseDiagram, describeDiagram, LIMITS } from '../web/js/rich/mermaid.js';
import { layoutDiagram } from '../web/js/rich/layout.js';
import { cleanLabel, wrap } from '../web/js/rich/text.js';
import { finish, capReply, openFence, forModel } from '../server/agents/exam-tutor.js';

const FENCE = '```';
const flow = (body, head = 'flowchart TD') => parseDiagram(`${head}\n${body}`);

// ---- Markdown ---------------------------------------------------------------------------------------

test('markdown: paragraphs, headings, bold, italic and code', () => {
  const b = parseMarkdown('## Title\n\nSome **bold**, *italic* and `code` text.\nSecond line of the same paragraph.');
  assert.equal(b[0].t, 'h');
  assert.equal(b[0].level, 2);
  assert.equal(b[1].t, 'p');
  assert.deepEqual(b[1].kids.map((k) => k.t), ['text', 'strong', 'text', 'em', 'text', 'code', 'text']);
  assert.equal(b.length, 2, 'two lines with no blank between are one paragraph');
});

test('markdown: bullet and numbered lists, nested by indentation', () => {
  const [ul] = parseMarkdown('- one\n- two\n  - inner a\n  - inner b\n- three');
  assert.equal(ul.t, 'list');
  assert.equal(ul.ordered, false);
  assert.equal(ul.items.length, 3);
  assert.equal(ul.items[1].sub[0].items.length, 2);
  const [ol] = parseMarkdown('3. third\n4. fourth');
  assert.equal(ol.ordered, true);
  assert.equal(ol.start, 3);
});

test('markdown: pipe tables keep alignment, pad short rows and cut long ones', () => {
  const [t] = parseMarkdown('| Type | Runs | Use |\n|:--|:-:|--:|\n| NRT | 1 min | fast |\n| Scheduled | cron |\n| a | b | c | d |');
  assert.equal(t.t, 'table');
  assert.deepEqual(t.align, ['left', 'center', 'right']);
  assert.equal(t.head.length, 3);
  assert.equal(t.rows.length, 3);
  assert.ok(t.rows.every((r) => r.length === 3), 'every row has exactly the header width');
});

test('markdown: a pipe inside backticks or escaped does not split a cell', () => {
  const [t] = parseMarkdown('| a | b |\n|---|---|\n| `x | y` | p \\| q |');
  assert.equal(t.rows[0].length, 2);
});

test('markdown: a lone line with a pipe is a paragraph, not a table', () => {
  const b = parseMarkdown('use a | b to choose\n\nand more');
  assert.equal(b[0].t, 'p');
});

test('markdown: a mermaid fence is a diagram block, any other fence is code, and an unclosed fence runs to the end', () => {
  const b = parseMarkdown(`before\n\n${FENCE}mermaid\nflowchart TD\n  A --> B\n${FENCE}\n\n${FENCE}kql\nSigninLogs | take 5\n${FENCE}\n\n${FENCE}mermaid\nflowchart TD\n  A -->`);
  assert.deepEqual(b.map((x) => x.t), ['p', 'diagram', 'code', 'diagram']);
  assert.equal(b[2].lang, 'kql');
  assert.match(b[1].source, /A --> B/);
});

test('markdown: raw HTML is just characters', () => {
  const b = parseMarkdown('Hello <img src=x onerror=alert(1)> and <script>alert(2)</script>\n\n<b>bold</b>');
  const text = JSON.stringify(b);
  assert.ok(b.every((x) => x.t === 'p'));
  assert.match(text, /<img src=x onerror=alert\(1\)>/, 'kept as literal text for the view to put in a text node');
  assert.ok(!b.some((x) => x.t === 'html'));
});

test('markdown: links are links only for https on Microsoft sites; every other address stays visible text', () => {
  assert.ok(safeHref('https://learn.microsoft.com/en-us/azure/sentinel/'));
  assert.ok(safeHref('https://portal.azure.com/'));
  for (const bad of ['http://learn.microsoft.com/x', 'javascript:alert(1)', 'data:text/html,hi', 'https://evil.example/', 'https://learn.microsoft.com.evil.example/', 'https://user:pw@learn.microsoft.com/', '//learn.microsoft.com', 'notaurl', 'https://microsoft.com.evil.io/']) assert.equal(safeHref(bad), null, bad);
  const k = parseInline('[docs](https://learn.microsoft.com/x) and [click](javascript:alert(1)) and [bing](https://evil.example/)');
  assert.deepEqual(k.filter((p) => p.t === 'link').map((p) => p.href), ['https://learn.microsoft.com/x']);
  const shown = k.filter((p) => p.t === 'text').map((p) => p.text).join('');
  assert.match(shown, /click \(javascript:alert\(1\)\)/, 'a refused link keeps its address visible');
  assert.match(shown, /bing \(https:\/\/evil\.example\/\)/);
});

test('markdown: an underscore inside a word is not emphasis', () => {
  const k = parseInline('the table SigninLogs_CL and a_b_c stay as typed, but _this_ is emphasised');
  assert.equal(k.filter((p) => p.t === 'em').length, 1);
});

test('markdown: input is bounded and never throws, whatever it is', () => {
  const hostile = ['', '```', '|', '| a |\n|-|', '> > > > > > >', '- ' + '- '.repeat(500), '*'.repeat(5000), '['.repeat(3000), '[a](' + 'x'.repeat(100000) + ')', 'a\n'.repeat(5000), '\u0000‮'];
  for (const s of hostile) assert.doesNotThrow(() => parseMarkdown(s), s.slice(0, 20));
  assert.ok(parseMarkdown('para\n\n'.repeat(500)).length <= MAX_BLOCKS);
  assert.deepEqual(parseMarkdown(null), []);
});

// ---- Mermaid: flowcharts ------------------------------------------------------------------------------

test('flowchart: shapes, labels, edge labels, chains and fan-out are read', () => {
  const d = flow('A([Start]) --> B{Is it bad?}\nB -->|Yes| C[Contain]\nB -- No --> D(Close)\nC & D --> E[(Log)]\nE -.-> F((End))\nF === G{{Hex}}');
  assert.equal(d.kind, 'flow');
  const shape = Object.fromEntries(d.nodes.map((n) => [n.id, n.shape]));
  assert.deepEqual(shape, { A: 'stadium', B: 'diamond', C: 'rect', D: 'round', E: 'cylinder', F: 'circle', G: 'hexagon' });
  const edge = (a, b) => d.edges.find((e) => e.from === a && e.to === b);
  assert.equal(edge('B', 'C').label, 'Yes');
  assert.equal(edge('B', 'D').label, 'No');
  assert.ok(edge('C', 'E') && edge('D', 'E'), 'C & D --> E fans in');
  assert.equal(edge('E', 'F').kind, 'dotted');
  assert.equal(edge('F', 'G').kind, 'thick');
});

test('flowchart: the direction defaults to top-down and TB means TD', () => {
  assert.equal(parseDiagram('flowchart\nA --> B').direction, 'TD');
  assert.equal(parseDiagram('graph TB\nA --> B').direction, 'TD');
  assert.equal(parseDiagram('graph LR\nA --> B').direction, 'LR');
});

test('flowchart: labels may hold brackets, parentheses and arrows when quoted; <br> becomes a line break; other tags vanish', () => {
  const d = flow('A["Run (KQL) [now] --> go"] --> B["Line one<br/>line two <b>bold</b>"]');
  assert.equal(d.nodes[0].label, 'Run (KQL) [now] --> go');
  assert.equal(d.nodes[1].label, 'Line one\nline two bold');
});

test('flowchart: subgraphs nest, title them, and a step keeps the group it was first written in', () => {
  const d = flow('subgraph S["Sentinel"]\n  A --> B\n  subgraph L["Workspace"]\n    C\n  end\nend\nB --> C\nA --> Z');
  assert.deepEqual(d.groups.map((g) => [g.id, g.title, g.parent]), [['S', 'Sentinel', null], ['L', 'Workspace', 'S']]);
  const group = Object.fromEntries(d.nodes.map((n) => [n.id, n.group]));
  assert.deepEqual(group, { A: 'S', B: 'S', C: 'L', Z: null });
});

test('flowchart: style, classDef, click and similar lines are ignored (they cannot reach the page)', () => {
  const d = flow('A --> B\nstyle A fill:#f00,stroke:#000\nclassDef x fill:#0f0\nclass A x\nclick A "javascript:alert(1)"\nlinkStyle 0 stroke:red\nA:::x --> C');
  assert.deepEqual(d.nodes.map((n) => n.id), ['A', 'B', 'C']);
  assert.ok(!JSON.stringify(d).includes('javascript'));
});

test('flowchart: front matter title and %% comments are handled', () => {
  const d = parseDiagram('---\ntitle: Phishing triage\n---\n%% a comment\nflowchart TD\n  A --> B %% not a comment mid-line is part of the id read');
  assert.equal(d.title, 'Phishing triage');
});

test('mermaid reader refuses what it cannot draw, with a reason, and never throws', () => {
  for (const [src, why] of [['', /empty/], ['pie title x\n"a": 1', /pie.*not supported/], ['gantt\n  title x', /gantt/], ['flowchart TD', /no steps/], ['flowchart TD\nA --> B[never closed', /never closed/], ['flowchart TD\nA ==>> ???', /Could not read/], ['sequenceDiagram', /no participants/], ['classDiagram\nA <|-- B', /classDiagram/]]) {
    const d = parseDiagram(src);
    assert.match(d.error ?? '', why, src);
  }
  const hostile = ['flowchart TD\n' + 'A --> B\n'.repeat(5000), 'flowchart TD\n' + '['.repeat(2000), 'flowchart TD\n' + 'A'.repeat(100000), 'sequenceDiagram\n' + 'A->>B: x\n'.repeat(5000), '\u0000', 'flowchart TD\nA --> A --> A --> A', 'flowchart TD\nsubgraph\nsubgraph\nend\nend\nend\nend'];
  for (const s of hostile) assert.doesNotThrow(() => parseDiagram(s), s.slice(0, 30));
});

test('mermaid reader enforces its size limits', () => {
  const many = 'flowchart TD\n' + Array.from({ length: LIMITS.nodes + 5 }, (_, i) => `N${i} --> N${i + 1}`).join('\n');
  assert.match(parseDiagram(many).error, /More than \d+ steps/);
  const wide = 'sequenceDiagram\n' + Array.from({ length: LIMITS.participants + 1 }, (_, i) => `participant P${i}`).join('\n');
  assert.match(parseDiagram(wide).error, /participants/);
  assert.match(parseDiagram('flowchart TD\nA --> B\n' + '%% x\n'.repeat(2000)).error, /longer than/);
});

test('an arrow that points at a group is refused, since the box has no edge to meet', () => {
  assert.match(flow('subgraph G\n A\nend\nB --> G').error, /group "G"/);
});

// ---- Mermaid: sequence diagrams -----------------------------------------------------------------------

test('sequence diagram: participants with aliases, arrows of every kind, notes, loops and numbering', () => {
  const d = parseDiagram('sequenceDiagram\nautonumber\nactor U as Analyst\nparticipant S as Sentinel\nU->>S: Open incident\nS-->>U: Details\nU-)S: async\nU-xS: lost\nS->>S: self\nNote right of S: remember this\nloop Every minute\n  S->>U: ping\nelse stopped\n  S->>U: bye\nend');
  assert.equal(d.kind, 'sequence');
  assert.equal(d.numbered, true);
  assert.deepEqual(d.participants.map((p) => [p.id, p.label, p.actor]), [['U', 'Analyst', true], ['S', 'Sentinel', false]]);
  const msgs = d.rows.filter((r) => r.type === 'msg');
  assert.equal(msgs.length, 7);
  assert.equal(msgs[1].dashed, true);
  assert.equal(msgs[3].cross, true);
  assert.equal(msgs[4].from, msgs[4].to);
  assert.deepEqual(d.rows.filter((r) => ['open', 'divider', 'close'].includes(r.type)).map((r) => r.type), ['open', 'divider', 'close']);
});

test('sequence diagram: a participant used only in a message is created, and an unclosed loop is closed', () => {
  const d = parseDiagram('sequenceDiagram\nA->>B: hi\nloop forever\nA->>B: again');
  assert.deepEqual(d.participants.map((p) => p.id), ['A', 'B']);
  assert.equal(d.rows.at(-1).type, 'close');
});

test('describeDiagram gives a sentence a screen reader can use, bounded in length', () => {
  const f = describeDiagram(flow('A[Start] --> B{Ok?}\nB -->|Yes| C[Done]'));
  assert.match(f, /Flowchart with 3 steps\. Start to Ok\?; Ok\? to Done \(Yes\)/);
  const s = describeDiagram(parseDiagram('sequenceDiagram\nA->>B: hello'));
  assert.match(s, /Sequence diagram of A, B\. 1\. A to B: hello/);
  assert.ok(describeDiagram(flow(Array.from({ length: 30 }, (_, i) => `N${i} --> N${i + 1}`).join('\n'))).length <= 900);
  assert.equal(describeDiagram({ error: 'x' }), '');
});

// ---- Labels -------------------------------------------------------------------------------------------

test('cleanLabel makes model text safe plain text', () => {
  assert.equal(cleanLabel('a<br>b<BR/>c'), 'a\nb\nc');
  assert.equal(cleanLabel('<script>alert(1)</script>x'), 'alert(1)x');
  assert.equal(cleanLabel('<img src=x onerror=1>'), '');
  assert.equal(cleanLabel('"quoted"'), 'quoted');
  assert.equal(cleanLabel('a #quot;b#quot; &amp; c'), 'a "b" & c');
  assert.equal(cleanLabel('x'.repeat(500)).length, 120);
});

test('wrap keeps lines short, splits a long word, and ends a long text with an ellipsis', () => {
  assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four']);
  assert.ok(wrap('a'.repeat(50), 10).every((l) => l.length <= 10));
  const w = wrap('word '.repeat(100), 20, 3);
  assert.equal(w.length, 3);
  assert.ok(w[2].endsWith('…'));
});

// ---- Layout -------------------------------------------------------------------------------------------

const boxOf = (n) => ({ l: n.x - n.w / 2, r: n.x + n.w / 2, t: n.y - n.h / 2, b: n.y + n.h / 2 });
const overlap = (p, q) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;

function checkFlowLayout(src) {
  const parsed = parseDiagram(src);
  assert.equal(parsed.error, undefined, parsed.error);
  const g = layoutDiagram(parsed);
  assert.ok(g.width > 0 && g.height > 0);
  for (const n of g.nodes) {
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y) && n.w > 0 && n.h > 0, n.id);
    const b = boxOf(n);
    assert.ok(b.l >= 0 && b.t >= 0 && b.r <= g.width && b.b <= g.height, `${n.id} is inside the picture`);
  }
  for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) assert.ok(!overlap(boxOf(g.nodes[i]), boxOf(g.nodes[j])), `${g.nodes[i].id} overlaps ${g.nodes[j].id}`);
  for (const e of g.edges) assert.ok(!/NaN|Infinity/.test(e.d + e.endHead + e.startHead), e.d);
  return { g, parsed };
}

test('layout: no steps overlap, everything is inside the picture, no NaN, for every direction', () => {
  for (const dir of ['TD', 'BT', 'LR', 'RL']) checkFlowLayout(`flowchart ${dir}\nA --> B & C\nB --> D\nC --> D\nD --> A\nD --> E\nA --> E`);
});

test('layout: top-down puts a step below the one before it, left-right to its right', () => {
  const td = layoutDiagram(flow('A --> B --> C'));
  const [a, b, c] = ['A', 'B', 'C'].map((id) => td.nodes.find((n) => n.id === id));
  assert.ok(a.y < b.y && b.y < c.y);
  const lr = layoutDiagram(flow('A --> B --> C', 'flowchart LR'));
  const [x, y, z] = ['A', 'B', 'C'].map((id) => lr.nodes.find((n) => n.id === id));
  assert.ok(x.x < y.x && y.x < z.x);
  const bt = layoutDiagram(flow('A --> B', 'flowchart BT'));
  assert.ok(bt.nodes.find((n) => n.id === 'A').y > bt.nodes.find((n) => n.id === 'B').y);
});

test('layout: cycles, self-loops, duplicate arrows and disconnected parts all lay out', () => {
  checkFlowLayout('flowchart TD\nA --> B --> C --> A\nC --> C\nA --> B\nX --> Y');
  checkFlowLayout('flowchart TD\nA --> A');
  checkFlowLayout('flowchart TD\nA');
});

test('layout: an arrow that skips layers gets routing points and stays inside the picture', () => {
  const { g } = checkFlowLayout('flowchart TD\nA --> B --> C --> D\nA --> D');
  const long = g.edges.find((e, i) => i === 3);
  assert.ok((long.d.match(/C/g) ?? []).length >= 2, 'a curve through more than one segment');
});

// A Sentinel architecture as the model drew it: nested groups in a left-to-right chart. Before the layout kept groups apart, this drew the
// "Data Sources" box without its sources and the "Microsoft Sentinel" box over unrelated steps.
const ARCH = `flowchart LR
subgraph Sources["Data Sources"]
  M365["Microsoft 365 / Defender XDR"]
  Azure["Azure Activity and Entra ID"]
  Third["Third-party and On-prem (Syslog, CEF, APIs)"]
end
subgraph Connectors["Data Connectors"]
  Native["Service-to-service connectors"]
  AMA["Azure Monitor Agent / CEF / Syslog"]
  CCP["API and Codeless Connector Platform"]
end
subgraph Sentinel["Microsoft Sentinel"]
  subgraph LAW["Log Analytics Workspace"]
    Tables["Log tables"]
  end
  subgraph Detection["Analytics Rules"]
    Sched["Scheduled (KQL)"]
    NRT["Near-real-time (NRT)"]
    MS["Microsoft security rules"]
  end
  Alerts["Alerts"]
  Incidents["Incidents"]
  subgraph Auto["Automation"]
    AR["Automation Rules"]
    subgraph PB["Playbooks (Azure Logic Apps)"]
      Logic["Enrich, notify, block user, create ticket"]
    end
  end
end
SOC["SOC Analyst: investigate and hunt"]
M365 --> Native
Azure --> Native
Third --> AMA
Third --> CCP
Native --> Tables
AMA --> Tables
CCP --> Tables
Tables --> Sched
Tables --> NRT
MS --> Alerts
Sched --> Alerts
NRT --> Alerts
Alerts --> Incidents
Incidents --> AR
AR --> Logic
Incidents --> SOC`;

test('layout: group boxes enclose their own steps and no step that is not theirs', () => {
  const small = 'flowchart LR\nsubgraph S1["Sources"]\n a\n b\n c\nend\nsubgraph S2["Connectors"]\n d\n e\nend\nsubgraph S3["Sentinel"]\n subgraph W["Workspace"]\n  t\n end\n r\nend\nz\na --> d\nb --> d\nc --> e\nd --> t\ne --> t\nt --> r\nz --> r\nr --> z2';
  checkGroups(small);
  for (const dir of ['LR', 'TD', 'RL', 'BT']) checkGroups(ARCH.replace('flowchart LR', `flowchart ${dir}`));
});

function checkGroups(src) {
  const { g, parsed } = checkFlowLayout(src);
  const inside = (box, n) => n.x - n.w / 2 >= box.x && n.x + n.w / 2 <= box.x + box.w && n.y - n.h / 2 >= box.y && n.y + n.h / 2 <= box.y + box.h;
  const touches = (box, n) => overlap({ l: box.x, r: box.x + box.w, t: box.y, b: box.y + box.h }, boxOf(n));
  const descendants = (gid) => [gid, ...parsed.groups.filter((q) => q.parent === gid).flatMap((q) => descendants(q.id))];
  for (const box of g.boxes) {
    const mine = new Set(descendants(box.id));
    for (const n of g.nodes) {
      if (mine.has(n.group)) assert.ok(inside(box, n), `${n.id} is inside ${box.id}`);
      else assert.ok(!touches(box, n), `${n.id} (group ${n.group}) is not inside ${box.id}`);
    }
  }
  assert.deepEqual(g.boxes.map((b) => b.depth), [...g.boxes.map((b) => b.depth)].sort(), 'outer boxes are drawn first');
}

test('layout: the sequence diagram has a column per participant and rows in order, wide enough for the labels', () => {
  const d = parseDiagram('sequenceDiagram\nautonumber\nA->>B: a very long message that needs more room than the default spacing gives it\nB-->>A: ok\nB->>B: self\nNote over A,B: shared note\nloop retry\n A->>B: again\nend');
  const g = layoutDiagram(d);
  assert.equal(g.kind, 'sequence');
  assert.equal(g.heads.length, 2);
  assert.ok(g.heads[0].x < g.heads[1].x);
  const msgs = g.items.filter((i) => i.type === 'msg');
  assert.deepEqual(msgs.map((m) => m.y), [...msgs.map((m) => m.y)].sort((p, q) => p - q), 'messages go down the page in order');
  assert.ok(g.heads[1].x - g.heads[0].x >= 200, 'the lifelines were pushed apart for the long message');
  assert.match(msgs[0].lines[0], /^1\. /);
  assert.ok(g.items.some((i) => i.type === 'frame' && i.kind === 'loop'));
  for (const i of g.items) for (const v of Object.values(i)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
  assert.ok(g.width > 0 && g.height > 0);
});

test('layout: the largest allowed diagrams stay within a sane size and finish quickly', () => {
  const t0 = Date.now();
  const edges = Array.from({ length: LIMITS.nodes - 1 }, (_, i) => `N${i} --> N${i + 1}\nN${i} --> N${(i * 7 + 3) % LIMITS.nodes}`).join('\n');
  const parsed = parseDiagram(`flowchart TD\n${edges}`);
  assert.equal(parsed.error, undefined);
  const g = layoutDiagram(parsed);
  assert.ok(g.width < 5000 && g.height < 8000, `${g.width} x ${g.height}`);
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
  const seq = parseDiagram('sequenceDiagram\n' + Array.from({ length: LIMITS.messages }, (_, i) => `P${i % LIMITS.participants}->>P${(i + 1) % LIMITS.participants}: message ${i}`).join('\n'));
  assert.equal(seq.error, undefined);
  assert.ok(layoutDiagram(seq).width < 5000);
});

// ---- Tutor: replies that contain diagrams --------------------------------------------------------------

test('finish(): a cut-off reply inside a diagram loses the whole diagram, not half of it', () => {
  const text = `Here is the flow.\n\n${FENCE}mermaid\nflowchart TD\n  A --> B\n  B --> C[Never fini`;
  const out = finish(text, true);
  assert.ok(!out.includes(FENCE), 'no fence left to swallow what follows');
  assert.ok(!out.includes('flowchart'));
  assert.match(out, /^Here is the flow\./);
  assert.match(out, /middle of a diagram or code block/);
  const closed = `Prose.\n\n${FENCE}mermaid\nA --> B\n${FENCE}\n\nThen a sentence. And a cut sen`;
  assert.ok(finish(closed, true).includes(`${FENCE}mermaid`), 'a diagram that was finished is kept');
  assert.equal(finish(text, false), text, 'a complete reply is untouched');
});

test('openFence finds a fence that never closes, and ignores balanced ones', () => {
  assert.equal(openFence(`a\n${FENCE}x\nb\n${FENCE}\nc`), -1);
  assert.equal(openFence(`a\n${FENCE}x\nb`), 2);
  assert.equal(openFence('no fences'), -1);
});

test('capReply shortens at a line and never inside a fence', () => {
  const body = `Intro.\n\n${FENCE}mermaid\n${'A --> B\n'.repeat(400)}${FENCE}\n\nAfter.`;
  const out = capReply(body, 500);
  assert.ok(out.length < 700);
  assert.ok(!out.includes(FENCE), 'the cut fell inside the diagram, so the diagram is dropped');
  assert.match(out, /too long and was shortened/);
  assert.equal(capReply('short', 500), 'short');
});

test('forModel: older diagrams go to the model as a one-line stub; the learner keeps the full text', () => {
  const full = `Here:\n\n${FENCE}mermaid\nflowchart TD\n  A --> B\n${FENCE}\n\nThat shows A to B.`;
  const sent = forModel({ role: 'assistant', content: full });
  assert.ok(!sent.content.includes('flowchart'));
  assert.match(sent.content, /\[a Mermaid diagram was shown here\]/);
  assert.match(sent.content, /That shows A to B\./);
  assert.deepEqual(forModel({ role: 'user', content: full }), { role: 'user', content: full }, 'learner messages are never altered');
  assert.ok(forModel({ role: 'assistant', content: 'x'.repeat(5000) }).content.length <= 1501);
});
