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
  const feedback = h('div', { class: 'exam-feedback', 'aria-live': 'polite' });
  const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn primary', type: 'button', 'data-target': 'btn:exam-submit', onclick: async () => {
    const answer = state.read();
    if (!answer) { err.textContent = state.hint; err.hidden = false; return; }
    err.hidden = true;
    submit.disabled = true;
    const out = await api.post('/api/exam/answer', { n: q.n, answer });
    if (!out.ok) { submit.disabled = false; err.textContent = out.error.message; err.hidden = false; return; }
    state.lock();
    submit.hidden = true;
    showResult(feedback, q, out.data);
    nextBar.hidden = false;
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
      body, err, h('div', { class: 'row' }, submit), feedback, nextBar),
    q.live ? h('p', { class: 'muted small' }, 'This question was written by Claude when you started the exam. Verify surprising claims on Microsoft Learn.') : null);

  if (q.result) {
    // Reloaded after submitting: show the saved feedback again, locked.
    state.lock();
    submit.hidden = true;
    showResult(feedback, q, q.result);
    nextBar.hidden = false;
  }
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

function singleInput(q) {
  const name = `q${q.n}`;
  const inputs = q.options.map((o) => h('input', { type: 'radio', name, value: o.id }));
  return {
    hint: 'Choose one answer.',
    node: h('div', { class: 'exam-options', role: 'radiogroup' }, q.options.map((o, i) => h('label', { class: 'exam-option' }, inputs[i], h('span', null, o.text)))),
    read: () => { const c = inputs.find((i) => i.checked); return c ? { choice: c.value } : null; },
    lock: () => inputs.forEach((i) => { i.disabled = true; }),
  };
}

function multiInput(q) {
  const inputs = q.options.map((o) => h('input', { type: 'checkbox', value: o.id }));
  const count = h('div', { class: 'hint-text' }, `0 of ${q.select} selected`);
  inputs.forEach((i) => i.addEventListener('change', () => { count.textContent = `${inputs.filter((x) => x.checked).length} of ${q.select} selected`; }));
  return {
    hint: `Select exactly ${q.select}.`,
    node: h('div', { class: 'exam-options' }, q.options.map((o, i) => h('label', { class: 'exam-option' }, inputs[i], h('span', null, o.text))), count),
    read: () => { const c = inputs.filter((i) => i.checked).map((i) => i.value); return c.length === q.select ? { choices: c } : null; },
    lock: () => inputs.forEach((i) => { i.disabled = true; }),
  };
}

// Ordering uses up/down buttons rather than drag and drop, so it works from the keyboard and screen readers.
function orderInput(q) {
  let order = q.steps.map((s) => s.id);
  const text = Object.fromEntries(q.steps.map((s) => [s.id, s.text]));
  let locked = false;
  const list = h('ol', { class: 'exam-steps' });
  const draw = (focusId, dir) => {
    clear(list);
    order.forEach((id, i) => {
      const up = h('button', { class: 'btn small', type: 'button', 'aria-label': `Move up: ${text[id]}`, disabled: locked || i === 0, onclick: () => move(id, -1, 'up') }, '↑');
      const down = h('button', { class: 'btn small', type: 'button', 'aria-label': `Move down: ${text[id]}`, disabled: locked || i === order.length - 1, onclick: () => move(id, 1, 'down') }, '↓');
      list.append(h('li', { class: 'exam-step' }, h('span', { class: 'exam-step-text' }, text[id]), h('span', { class: 'exam-step-btns' }, up, down)));
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
  };
}

function dropdownInput(q) {
  const selects = new Map();
  const parts = q.template.split(/(\{\{[a-z0-9]{1,3}\}\})/);
  const blank = (id) => {
    const b = q.blanks.find((x) => x.id === id);
    const sel = h('select', { 'aria-label': `Selection ${id}` }, h('option', { value: '' }, 'Select…'), b.options.map((o) => h('option', { value: o.id }, o.text)));
    selects.set(id, sel);
    return sel;
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
  };
}

// ---- feedback --------------------------------------------------------------------------------
function showResult(el, q, r) {
  clear(el);
  const head = h('div', { class: `exam-verdict ${r.correct ? 'right' : 'wrong'}`, role: 'status' },
    h('strong', null, r.correct ? 'Correct' : 'Incorrect'), r.detail ? h('span', null, ` — ${r.detail}`) : null);
  el.append(head, h('div', { class: 'exam-explain' }, h('h4', null, 'Why'), h('p', null, r.explanation)));

  if (r.options) {
    el.append(h('div', { class: 'exam-review' }, h('h4', null, 'Every option'), h('ul', null, r.options.map((o) => reviewRow(o.text, o, q.type === 'single' ? 'chose' : 'selected')))));
  } else if (r.steps) {
    el.append(h('div', { class: 'exam-review' }, h('h4', null, 'Correct order'), h('ol', null, r.steps.map((s) => h('li', { class: s.position === s.yourPosition ? 'is-right' : 'is-wrong' },
      s.text, s.position === s.yourPosition ? null : h('span', { class: 'muted small' }, ` (you put this at ${s.yourPosition})`))))));
  } else if (r.blanks) {
    el.append(h('div', { class: 'exam-review' }, h('h4', null, 'Each selection'), r.blanks.map((b) => h('div', { class: 'exam-blank' },
      h('strong', null, `Selection ${b.id}: `), b.right ? 'right' : 'wrong', h('ul', null, b.options.map((o) => reviewRow(o.text, o, 'chose')))))));
  }
  const links = [];
  if (r.learn) links.push(h('p', { class: 'muted small' }, `Read on Microsoft Learn: ${r.learn}`));
  if (r.labId) {
    const lab = ctx.labs.find((l) => l.id === r.labId);
    if (lab) links.push(h('p', { class: 'small' }, 'Practise this in the sandbox: ', h('a', { href: '#/home' }, lab.title)));
  }
  el.append(...links);
}

function reviewRow(text, o, verb) {
  const mark = o.correct ? 'Correct answer' : 'Not correct';
  return h('li', { class: `exam-review-row ${o.correct ? 'is-right' : ''} ${o.picked ? 'is-picked' : ''}` },
    h('div', null, h('span', { class: 'exam-mark' }, mark), ' ', text, o.picked ? h('em', { class: 'muted small' }, ` (you ${verb} this)`) : null),
    !o.correct && o.why ? h('div', { class: 'muted small exam-why' }, o.why) : null);
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
