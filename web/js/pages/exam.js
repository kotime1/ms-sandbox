// Practice exam page. Everything the learner sees about a question comes from the server; the answer key arrives
// only in the feedback after they submit. Text is always rendered through h() (textContent), never as HTML.
import { h, badge, clear } from '../dom.js';
import * as api from '../api.js';
import { ctx } from '../app.js';

const DOMAIN_LABEL = { manage: 'Manage a security operations environment', respond: 'Respond to security incidents', hunt: 'Perform threat hunting' };
const TYPE_LABEL = { single: 'Choose one answer', multi: 'Choose more than one answer', order: 'Put the steps in order', dropdown: 'Complete each selection' };

// State for the running page. The server holds the real exam; this is only what the browser needs to draw it.
// view: 'init' (not decided yet: ask the server), 'start', 'running' or 'finished'.
const ui = { total: 0, n: 0, notes: [], view: 'init' };

export async function render(host) {
  const s = await api.get('/api/exam/summary');
  const sum = s.ok ? s.data.summary : null;
  // First visit (or a page reload): resume whatever the server is holding for this session.
  if (ui.view === 'init') ui.view = sum?.total ? (sum.done ? 'finished' : 'running') : 'start';
  if (sum?.total) { ui.total = sum.total; ui.notes = sum.notes ?? []; }
  if (ui.view === 'finished' && sum?.total) return finish(host, sum);
  if (ui.view === 'running' && sum?.total) return showQuestion(host, Math.min(ui.n || sum.answered + 1, sum.total));
  ui.view = 'start';
  return startScreen(host, sum);
}

// ---- start screen ---------------------------------------------------------------------------
function startScreen(host, sum) {
  const info = ctx.exam ?? { live: false, bank: 0, min: 10, max: 50, count: 50 };
  const count = h('input', { id: 'exam-count', type: 'number', min: info.min, max: info.max, value: info.count, 'aria-describedby': 'exam-count-hint' });
  const live = info.live ? h('input', { id: 'exam-live', type: 'checkbox' }) : null;
  const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const go = h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:exam-start', onclick: async () => {
    go.disabled = true;
    err.hidden = true;
    go.textContent = live?.checked ? 'Writing questions, about a minute…' : 'Starting…';
    const out = await api.post('/api/exam/start', { count: Number(count.value), includeLive: Boolean(live?.checked) });
    go.disabled = false;
    go.textContent = 'Start practice exam';
    if (!out.ok) { err.textContent = out.error.message; err.hidden = false; return; }
    ui.total = out.data.total;
    ui.notes = out.data.notes;
    ui.view = 'running';
    showQuestionData(host, out.data.question);
  } }, 'Start practice exam');

  clear(host).append(
    h('h1', null, 'Practice exam'),
    h('p', { class: 'lede' }, 'Questions are built to match the SC-200 skills measured: scenario-based and performance-style items in four formats (choose one, choose several, put steps in order, and complete dropdown selections). After you submit each question you see whether it was right and why.'),
    h('section', { class: 'blade' },
      h('h2', null, 'Domain mix'),
      h('p', { class: 'muted small' }, 'Questions are drawn to follow the published weighting. A 50-question exam has 21 / 19 / 10 questions.'),
      h('ul', { class: 'exam-weights' }, [
        h('li', null, h('strong', null, 'Manage a security operations environment'), ' 40–45%'),
        h('li', null, h('strong', null, 'Respond to security incidents'), ' 35–40%'),
        h('li', null, h('strong', null, 'Perform threat hunting'), ' 20–25%'),
      ])),
    h('section', { class: 'blade' },
      h('h2', null, 'Start'),
      h('div', { class: 'field' }, h('label', { for: 'exam-count' }, 'Number of questions'), count, h('div', { id: 'exam-count-hint', class: 'hint-text' }, `${info.min} to ${info.max}. The real exam is about 40 to 60 questions.`)),
      info.live
        ? h('div', { class: 'field' }, h('label', { class: 'toggle', for: 'exam-live' }, live, ' Also have Claude write some fresh questions'), h('div', { class: 'hint-text' }, 'About 40% of the exam is written on request and checked by the same answer-shape rules as the built-in questions. Preparing them takes about a minute, and generated questions can contain mistakes, so confirm anything surprising on Microsoft Learn.'))
        : h('p', { class: 'muted small' }, 'Fresh questions written by Claude are available when an Anthropic API key is configured. This session uses the built-in bank.'),
      err, go),
    sum?.answered ? h('p', { class: 'muted small' }, 'Starting a new exam replaces the one in progress.') : null,
    h('p', { class: 'muted small foot' }, 'Practice questions are original and written for this sandbox. They are not real exam items. Microsoft Learn is the source of truth for product behaviour.'));
}

// ---- one question ----------------------------------------------------------------------------
async function showQuestion(host, n) {
  const out = await api.get(`/api/exam/question/${n}`);
  if (!out.ok) { ui.view = 'start'; return startScreen(host, null); }
  showQuestionData(host, out.data.question);
}

function showQuestionData(host, q) {
  ui.n = q.n;
  ui.view = 'running';
  const state = answerState(q);
  const body = h('div', { class: 'exam-body' });
  // `feedback` is inside the question card (verdict + explanation, with the choices marked in place above it).
  // `after` sits below the card: the Sources card, the tutor card, then Next question.
  const feedback = h('div', { class: 'exam-feedback', 'aria-live': 'polite' });
  const after = h('div', { class: 'exam-after' });
  const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const reveal = (r) => {
    state.lock();
    state.reveal(r);
    submit.hidden = true;
    showResult(feedback, after, q, r);
    after.append(nextBar);
    nextBar.hidden = false;
  };
  const submit = h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:exam-submit', onclick: async () => {
    const answer = state.read();
    if (!answer) { err.textContent = state.hint; err.hidden = false; return; }
    err.hidden = true;
    submit.disabled = true;
    const out = await api.post('/api/exam/answer', { n: q.n, answer });
    if (!out.ok) { submit.disabled = false; err.textContent = out.error.message; err.hidden = false; return; }
    reveal(out.data);
    updateProgress(progress, out.data.summary);
  } }, 'Submit answer');
  const nextBar = h('div', { class: 'exam-next', hidden: true }, nextButton(host, q.n));
  const progress = h('div', { class: 'exam-progress' });

  body.append(state.node);
  clear(host).append(
    h('div', { class: 'exam-head' },
      h('div', { class: 'exam-count' }, `Question ${q.n} of ${ui.total}`),
      h('div', { class: 'chips' }, badge(DOMAIN_LABEL[q.domain], 'topic'), q.live ? badge('Written by Claude', 'warn') : null),
      progress,
      h('button', { class: 'btn small', type: 'button', onclick: () => {
        if (!confirm('Leave this exam? Your answers so far will be discarded when you start a new one.')) return;
        ui.view = 'start';
        startScreen(host, null);
      } }, 'New exam')),
    ui.notes.length && q.n === 1 ? h('p', { class: 'note small' }, ui.notes.join(' ')) : null,
    h('section', { class: 'blade exam-card' },
      q.scenario ? h('div', { class: 'exam-scenario' }, h('h4', null, 'Scenario'), h('p', null, q.scenario)) : null,
      h('p', { class: 'exam-stem' }, q.stem),
      h('p', { class: 'muted small' }, TYPE_LABEL[q.type] + (q.type === 'multi' ? ` (select ${q.select})` : '')),
      body, err, h('div', { class: 'row' }, submit), feedback),
    after,
    q.live ? h('p', { class: 'muted small' }, 'This question was written by Claude when you started the exam. Verify surprising claims on Microsoft Learn.') : null);

  // Reloaded after submitting: show the saved feedback again, locked.
  if (q.result) reveal(q.result);
  api.get('/api/exam/summary').then((s) => { if (s.ok) updateProgress(progress, s.data.summary); });
}

function nextButton(host, n) {
  const last = n >= ui.total;
  return h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:exam-next', onclick: async () => {
    if (!last) return showQuestion(host, n + 1);
    const s = await api.get('/api/exam/summary');
    if (s.ok) { ui.view = 'finished'; finish(host, s.data.summary); }
  } }, last ? 'See results' : 'Next question');
}

function updateProgress(el, sum) {
  clear(el).append(`${sum.answered} answered · ${sum.correct} correct`);
}

// ---- answer inputs: each returns { node, read(), lock(), hint } ------------------------------
function answerState(q) {
  if (q.type === 'single') return singleInput(q);
  if (q.type === 'multi') return multiInput(q);
  if (q.type === 'order') return orderInput(q);
  return dropdownInput(q);
}

// After submitting, the same controls are marked in place: green for a correct choice, red for a wrong one that was
// picked, with the reason under each. `reveal(result)` is called with the server's graded result.
function markChoice(label, o) {
  const picked = o.picked;
  label.classList.add(o.correct ? 'is-right' : 'is-wrong');
  if (picked) label.classList.add('is-picked');
  const tag = o.correct ? (picked ? 'Correct answer · your choice' : 'Correct answer') : (picked ? 'Your choice · not correct' : null);
  // Every choice carries its own explanation, the right one included, directly under it.
  label.querySelector('.exam-opt-body').append(
    tag ? h('span', { class: 'exam-mark' }, tag) : null,
    o.why ? h('span', { class: 'exam-why' }, o.why) : null);
}

function choiceRows(q, inputs) {
  return q.options.map((o, i) => h('label', { class: 'exam-option', 'data-opt': o.id }, inputs[i], h('span', { class: 'exam-opt-body' }, h('span', { class: 'exam-opt-text' }, o.text))));
}

function singleInput(q) {
  const name = `q${q.n}`;
  const inputs = q.options.map((o) => h('input', { type: 'radio', name, value: o.id }));
  const rows = choiceRows(q, inputs);
  return {
    hint: 'Choose one answer.',
    node: h('div', { class: 'exam-options', role: 'radiogroup' }, rows),
    read: () => { const c = inputs.find((i) => i.checked); return c ? { choice: c.value } : null; },
    lock: () => inputs.forEach((i) => { i.disabled = true; }),
    reveal: (r) => r.options.forEach((o) => markChoice(rows[q.options.findIndex((x) => x.id === o.id)], o)),
  };
}

function multiInput(q) {
  const inputs = q.options.map((o) => h('input', { type: 'checkbox', value: o.id }));
  const rows = choiceRows(q, inputs);
  const count = h('div', { class: 'hint-text' }, `0 of ${q.select} selected`);
  inputs.forEach((i) => i.addEventListener('change', () => { count.textContent = `${inputs.filter((x) => x.checked).length} of ${q.select} selected`; }));
  return {
    hint: `Select exactly ${q.select}.`,
    node: h('div', { class: 'exam-options' }, rows, count),
    read: () => { const c = inputs.filter((i) => i.checked).map((i) => i.value); return c.length === q.select ? { choices: c } : null; },
    lock: () => inputs.forEach((i) => { i.disabled = true; }),
    reveal: (r) => { count.textContent = r.detail; r.options.forEach((o) => markChoice(rows[q.options.findIndex((x) => x.id === o.id)], o)); },
  };
}

// Ordering uses up/down buttons rather than drag and drop, so it works from the keyboard and screen readers.
function orderInput(q) {
  let order = q.steps.map((s) => s.id);
  const text = Object.fromEntries(q.steps.map((s) => [s.id, s.text]));
  let locked = false;
  let result = null; // the graded steps, once submitted: the learner's order is then shown with each step marked
  const list = h('ol', { class: 'exam-steps' });
  const draw = (focusId, dir) => {
    clear(list);
    order.forEach((id, i) => {
      const s = result?.find((x) => x.id === id);
      const right = s && s.position === i + 1;
      const up = h('button', { class: 'btn small', type: 'button', 'aria-label': `Move up: ${text[id]}`, disabled: locked || i === 0, onclick: () => move(id, -1, 'up') }, '↑');
      const down = h('button', { class: 'btn small', type: 'button', 'aria-label': `Move down: ${text[id]}`, disabled: locked || i === order.length - 1, onclick: () => move(id, 1, 'down') }, '↓');
      list.append(h('li', { class: `exam-step${s ? (right ? ' is-right' : ' is-wrong') : ''}` },
        h('span', { class: 'exam-step-text' }, text[id],
          s ? h('span', { class: 'exam-mark' }, right ? 'Correct position' : `Not correct · belongs at step ${s.position}`) : null,
          // Why this step belongs where it does. For a misplaced step it explains the position it should have had.
          s?.why ? h('span', { class: 'exam-why' }, `Step ${s.position}: ${s.why}`) : null),
        s ? null : h('span', { class: 'exam-step-btns' }, up, down)));
      if (id === focusId) (dir === 'up' && up.disabled ? down : dir === 'down' && down.disabled ? up : dir === 'up' ? up : down).dataset.refocus = '1';
    });
    list.querySelector('[data-refocus]')?.focus();
  };
  const move = (id, d, dir) => {
    const i = order.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    draw(id, dir);
  };
  draw();
  return {
    hint: '',
    node: h('div', null, h('p', { class: 'hint-text' }, 'Use the arrows to move each step. The first item in the list happens first.'), list),
    read: () => ({ order: [...order] }),
    lock: () => { locked = true; draw(); },
    // A reloaded question has no local order, so show the learner's own order from the graded result.
    reveal: (r) => {
      locked = true;
      result = r.steps;
      order = [...r.steps].sort((a, b) => a.yourPosition - b.yourPosition).map((s) => s.id);
      draw();
    },
  };
}

function dropdownInput(q) {
  const selects = new Map();
  const notes = new Map(); // blank id -> element that explains the answer after submitting
  const parts = q.template.split(/(\{\{[a-z0-9]{1,3}\}\})/);
  const blank = (id) => {
    const b = q.blanks.find((x) => x.id === id);
    const sel = h('select', { 'aria-label': `Selection ${id}` }, h('option', { value: '' }, 'Select…'), b.options.map((o) => h('option', { value: o.id }, o.text)));
    selects.set(id, sel);
    const note = h('span', { class: 'exam-blank-note', hidden: true });
    notes.set(id, note);
    return h('span', { class: 'exam-blank' }, sel, note);
  };
  // Keep line breaks: a Yes/No table has one statement per line.
  const lines = [[]];
  for (const p of parts) {
    const m = p.match(/^\{\{([a-z0-9]{1,3})\}\}$/);
    if (m) lines.at(-1).push(blank(m[1]));
    else p.split('\n').forEach((t, i) => { if (i) lines.push([]); if (t) lines.at(-1).push(t); });
  }
  return {
    hint: 'Answer every dropdown.',
    node: h('div', { class: q.code ? 'exam-template code' : 'exam-template' }, lines.map((l) => h('div', { class: 'exam-line' }, l))),
    read: () => {
      const picks = {};
      for (const [id, sel] of selects) { if (!sel.value) return null; picks[id] = sel.value; }
      return { picks };
    },
    lock: () => selects.forEach((s) => { s.disabled = true; }),
    // Each dropdown is marked beside itself: right, or wrong with the correct choice and the reason for the one picked.
    reveal: (r) => r.blanks.forEach((b) => {
      const sel = selects.get(b.id);
      const note = notes.get(b.id);
      const picked = b.options.find((o) => o.picked);
      const right = b.options.find((o) => o.correct);
      sel.value = picked?.id ?? '';
      sel.classList.add(b.right ? 'is-right' : 'is-wrong');
      // A right pick explains why it is right. A wrong pick says what is wrong with it, then names the right answer and why.
      clear(note).append(b.right
        ? h('span', null, h('span', { class: 'exam-mark ok' }, '✓ Correct'), right.why ? h('span', { class: 'exam-why' }, ` ${right.why}`) : null)
        : h('span', null,
          h('span', { class: 'exam-mark bad' }, '✗ Not correct'), picked?.why ? h('span', { class: 'exam-why' }, ` ${picked.why}`) : null,
          h('span', { class: 'exam-right-answer' }, h('span', { class: 'exam-mark ok' }, 'Answer: '), h('strong', null, right.text), right.why ? h('span', { class: 'exam-why' }, ` ${right.why}`) : null)));
      note.hidden = false;
    }),
  };
}

// ---- feedback --------------------------------------------------------------------------------
// The choices above were marked in place by state.reveal(); here the verdict and the explanation are added to the same
// card, and the Sources and tutor cards go below it.
function showResult(el, after, q, r) {
  clear(el);
  el.append(
    h('div', { class: `exam-verdict ${r.correct ? 'right' : 'wrong'}`, role: 'status' },
      h('strong', null, r.correct ? 'Correct' : 'Incorrect'), r.detail ? h('span', null, ` — ${r.detail}`) : null),
    h('div', { class: 'exam-explain' }, h('h4', null, 'In short'), h('p', null, r.explanation)));
  clear(after).append(sourcesCard(r), tutorCard(q));
}

// ---- sources: curated Microsoft Learn pages for this question's skill, plus the matching lab -----
const LEARN = /^https:\/\/learn\.microsoft\.com\/en-us\/[A-Za-z0-9\-_./#?=&%]*$/;

function sourcesCard(r) {
  const refs = (r.refs ?? []).filter((x) => LEARN.test(x.url)); // only ever link to Microsoft Learn
  const lab = r.labId ? ctx.labs.find((l) => l.id === r.labId) : null;
  return h('section', { class: 'exam-card-sub', 'aria-label': 'Sources and references' },
    h('h4', null, 'Sources and references'),
    refs.length
      ? h('ul', { class: 'exam-sources' }, refs.map((x) => h('li', null,
        h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title), h('span', { class: 'muted small' }, ' · Microsoft Learn'))))
      : h('p', { class: 'muted small' }, 'No reference pages are listed for this skill yet.'),
    lab ? h('p', { class: 'small' }, 'Practice it in the sandbox: ', h('a', { href: '#/home' }, lab.title)) : null,
    h('p', { class: 'muted small' }, 'Pages are chosen for the skill this question tests. Microsoft Learn is the source of truth for product behaviour.'));
}

// ---- tutor: a chat about this one question, available once it has been answered ------------------
function tutorCard(q) {
  const log = h('div', { class: 'exam-chat-log', role: 'log', 'aria-live': 'polite' });
  const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const box = h('textarea', { class: 'exam-chat-input', rows: 2, maxlength: 600, 'aria-label': 'Ask a question about this item', placeholder: 'Ask about this question: why is an option wrong, how do two features differ, what should I remember?' });
  const send = h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:exam-ask' }, 'Ask');
  const hint = h('p', { class: 'muted small' }, 'The tutor can see this question, the correct answer, and what you chose. It can be wrong, so check anything that matters against the sources above.');
  const form = h('div', { class: 'exam-chat-form' }, box, send);
  const card = h('section', { class: 'exam-card-sub exam-tutor', 'aria-label': 'Ask the tutor' }, h('h4', null, 'Ask the tutor'), hint, log, err, form);

  const line = (who, text) => log.append(h('div', { class: `exam-msg ${who}` }, h('span', { class: 'exam-msg-who' }, who === 'you' ? 'You' : 'Tutor'), h('div', { class: 'exam-msg-text' }, text)));
  const draw = (history) => { clear(log); for (const m of history) line(m.role === 'user' ? 'you' : 'tutor', m.content); log.scrollTop = log.scrollHeight; };
  const off = (why) => { form.hidden = true; hint.textContent = why; };

  api.get(`/api/exam/chat/${q.n}`).then((out) => {
    if (!out.ok) return off(out.error.message);
    if (!out.data.available) return off('The tutor is off because IBM Consulting Advantage is not configured (ICA_API_KEY and ICA_MODEL). The sources above still work.');
    draw(out.data.history);
  });

  const submit = async () => {
    const text = box.value.trim();
    if (!text) return;
    err.hidden = true;
    send.disabled = true; box.disabled = true;
    line('you', text);
    const wait = h('div', { class: 'exam-msg tutor pending' }, h('span', { class: 'exam-msg-who' }, 'Tutor'), h('div', { class: 'exam-msg-text' }, 'Thinking…'));
    log.append(wait);
    log.scrollTop = log.scrollHeight;
    const out = await api.post('/api/exam/ask', { n: q.n, message: text });
    send.disabled = false; box.disabled = false;
    if (!out.ok) { wait.remove(); err.textContent = out.error.message; err.hidden = false; log.lastElementChild?.remove(); box.value = text; box.focus(); return; }
    box.value = '';
    draw(out.data.history);
    box.focus();
  };
  send.addEventListener('click', submit);
  // Enter sends; Shift+Enter makes a new line.
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
  return card;
}

// ---- results ---------------------------------------------------------------------------------
function finish(host, sum) {
  const pct = sum.total ? Math.round((sum.correct / sum.total) * 100) : 0;
  clear(host).append(
    h('h1', null, 'Practice exam complete'),
    h('section', { class: 'blade' },
      h('p', { class: 'exam-score' }, `${sum.correct} of ${sum.total} correct (${pct}%)`),
      h('p', { class: 'muted small' }, 'This is a practice score from original questions. It does not predict the 700/1000 scaled exam score, so use the breakdown below to decide what to revisit.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
        h('thead', null, h('tr', null, ['Domain', 'Correct', 'Answered'].map((t) => h('th', null, t)))),
        h('tbody', null, Object.values(sum.domains).map((d) => h('tr', null, h('td', null, d.label), h('td', null, d.answered ? `${d.correct} of ${d.answered} (${Math.round((d.correct / d.answered) * 100)}%)` : '—'), h('td', null, `${d.answered} of ${d.total}`))))))),
    sum.missed.length
      ? h('section', { class: 'blade' }, h('h2', null, 'Questions to revisit'),
        h('ul', { class: 'exam-missed' }, sum.missed.map((m) => h('li', null,
          h('button', { class: 'btn small', type: 'button', onclick: () => { ui.view = 'running'; showQuestion(host, m.n); } }, `Question ${m.n}`),
          ' ', h('span', { class: 'muted small' }, m.objective)))))
      : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { ui.view = 'start'; ui.n = 0; startScreen(host, null); } }, 'New practice exam')));
}
