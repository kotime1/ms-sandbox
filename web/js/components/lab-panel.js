import { h, clear, badge } from '../dom.js';
import * as api from '../api.js';
import { ctx } from '../app.js';
import { levelOf } from '../verification.js';

// The coach: objectives, hints, the highlighted "next click", scenario replay and the
// agent activity feed, plus the assistant chat. Everything it shows comes from /api/state.

let open = true;
let feedAfter = 0;
let glowed = null;
const chat = []; // { who: 'you'|'bot', text, provider? } kept in memory only

export function renderLabPanel(host) {
  clear(host);
  host.classList.toggle('collapsed', !open);
  const toggle = h('button', { class: 'icon-btn', type: 'button', 'aria-label': open ? 'Collapse lab panel' : 'Expand lab panel', 'aria-expanded': String(open), onclick: () => { open = !open; renderLabPanel(host); } }, open ? '›' : '‹');
  const lab = ctx.lab;
  if (!open) { host.append(toggle); return; }
  host.append(h('div', { class: 'lp-head' }, h('strong', null, 'Lab coach'), toggle));
  if (!lab) {
    host.append(h('p', { class: 'muted pad' }, 'No lab running. Pick one from the Labs page to begin.'), assistantBox());
    return;
  }
  const { briefing: b, status: st, next } = lab;
  const done = st.objectives.filter((o) => o.met && !o.optional).length;
  const req = st.objectives.filter((o) => !o.optional).length;

  host.append(
    h('div', { class: 'lp-section' },
      h('h3', null, b.title), h('div', { class: 'chips' }, badge(b.level), badge(`${b.minutes} min`), badge(`${done}/${req} done`, st.complete ? 'ok' : '')),
      h('details', { class: 'fidelity' }, h('summary', null, badge(levelOf(b.verification).label, levelOf(b.verification).kind)), h('p', { class: 'small' }, levelOf(b.verification).help), b.verification?.note ? h('p', { class: 'small muted' }, b.verification.note) : null),
      h('p', { class: 'brief' }, b.brief)),
    h('div', { class: 'lp-section' }, h('h4', null, 'Objectives'),
      h('ul', { class: 'objectives' }, st.objectives.map((o) => h('li', { class: o.met ? 'met' : '' },
        h('span', { class: 'check', 'aria-hidden': 'true' }, o.met ? '✓' : '○'),
        h('span', null, o.text, o.optional ? h('em', null, ' (optional)') : null),
        o.met ? h('span', { class: 'sr-only' }, ' completed') : null)))),
    st.complete ? debrief(st) : coachBlock(next, host),
    scenarioBlock(b.scenarios),
    assistantBox(),
    feedBlock(),
  );
  applyGlow(next?.target);
}

function coachBlock(next, host) {
  return h('div', { class: 'lp-section coach' }, h('h4', null, 'Next step'),
    next ? h('p', { class: 'next' }, h('span', { class: 'step-no' }, `${Math.min(next.index + 1, next.total)}/${next.total}`), ' ', next.text) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        const out = await api.post('/api/lab/hint', {});
        if (out.ok) { ctx.toast(`Hint ${out.data.tier}/${out.data.of}: ${out.data.text}`, 'hint'); await ctx.refresh(); } else ctx.toast(out.error.message, 'error');
      } }, 'Hint'),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: ctx.showGuide, onchange: (e) => { ctx.showGuide = e.target.checked; applyGlow(ctx.lab?.next?.target); } }), ' Highlight next click')));
}

function debrief(st) {
  return h('div', { class: 'lp-section debrief' }, h('h4', null, 'Lab complete — debrief'),
    h('p', { class: 'muted' }, `Hints used: ${st.hintsUsed} · Time: ${Math.floor(st.elapsedSec / 60)}m ${st.elapsedSec % 60}s`),
    h('ul', null, st.debrief.map((d) => h('li', null, d))));
}

function scenarioBlock(scenarios) {
  if (!scenarios?.length) return null;
  return h('div', { class: 'lp-section' }, h('h4', null, 'Attack simulation'),
    h('p', { class: 'muted small' }, 'Asks the attack-agent to replay synthetic activity inside the sandbox.'),
    scenarios.map((s) => h('button', { class: 'btn', type: 'button', 'data-target': `btn:run-sim:${s.id}`, onclick: async () => {
      const out = await ctx.act('attack.run', { scenario: s.id });
      if (out.ok) { ctx.toast(out.data.message, 'ok'); await ctx.reloadPage(); }
    } }, `Replay: ${s.title}`)));
}

function assistantBox() {
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' }, chat.map(msg));
  const input = h('input', { type: 'text', maxlength: '600', placeholder: 'Ask the assistant…', 'aria-label': 'Ask the assistant' });
  const send = async () => {
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    chat.push({ who: 'you', text: q });
    log.append(msg(chat[chat.length - 1]));
    const pending = { who: 'bot', text: '…' };
    const node = msg(pending);
    log.append(node);
    const out = await api.post('/api/assistant', { question: q });
    pending.text = out.ok ? out.data.text : out.error.message;
    pending.provider = out.ok ? out.data.provider : undefined;
    chat.push(pending);
    node.replaceWith(msg(pending));
    log.scrollTop = log.scrollHeight;
    await ctx.refresh();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  return h('div', { class: 'lp-section' }, h('h4', null, 'Assistant ', badge(ctx.assistant.provider === 'claude' ? 'Claude' : 'offline notes')),
    log, h('div', { class: 'row' }, input, h('button', { class: 'btn', type: 'button', onclick: send }, 'Ask')));
}
const msg = (m) => h('div', { class: `msg ${m.who}` }, h('span', { class: 'who' }, m.who === 'you' ? 'You' : 'Assistant'), h('div', { class: 'text' }, m.text));

function feedBlock() {
  const items = ctx.feed ?? [];
  return h('details', { class: 'lp-section feed' }, h('summary', null, `Agent activity (${items.length})`),
    h('ul', null, items.slice(-25).reverse().map((e) => h('li', null, h('span', { class: `agent ${e.agent}` }, e.agent), ' ', e.text))));
}

export function noteFeed(feed) {
  ctx.feed = [...(ctx.feed ?? []), ...feed].slice(-200);
  if (feed.length) feedAfter = feed[feed.length - 1].id;
}
export const feedCursor = () => feedAfter;
export function resetFeed() { ctx.feed = []; feedAfter = 0; }

/** Highlight the element the lab-agent says is next, anywhere on the page. */
export function applyGlow(target) {
  document.querySelectorAll('.coach-glow').forEach((el) => el.classList.remove('coach-glow'));
  if (!target || ctx.showGuide === false) return;
  const el = [...document.querySelectorAll('[data-target]')].find((e) => e.getAttribute('data-target') === target || (e.getAttribute('data-target-aliases') ?? '').split(' ').includes(target));
  if (el) { el.classList.add('coach-glow'); if (glowed !== target) { el.scrollIntoView?.({ block: 'nearest' }); glowed = target; } }
}
