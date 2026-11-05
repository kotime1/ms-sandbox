// One question as it exists inside a running exam: options shuffled, opaque ids, the key kept server-side.
//   makeItem(q, rand)   -> item (server only)
//   publicView(item)    -> what the browser may see (no correct flags, no 'why', no explanation)
//   grade(item, answer) -> { correct, ... } feedback, or throws ExamInputError for a malformed answer
//
// Answer shapes (from the browser):
//   single   { choice: 'o2' }
//   multi    { choices: ['o1', 'o4'] }                exactly `select` ids
//   order    { order: ['s3', 's1', 's2'] }            every step id once
//   dropdown { picks: { a: 'o2', b: 'o1' } }          every blank answered

export class ExamInputError extends Error {}

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const withIds = (opts, prefix, rand) => shuffle(opts, rand).map((o, i) => ({ id: `${prefix}${i + 1}`, text: o.text, correct: Boolean(o.correct), why: o.why }));

export function makeItem(q, rand = Math.random) {
  const item = { q, live: q.source === 'live', answered: false, answer: null, result: null };
  if (q.type === 'single' || q.type === 'multi') item.options = withIds(q.options, 'o', rand);
  else if (q.type === 'order') {
    const correct = q.steps.map((s, i) => ({ id: `s${i + 1}`, text: s.text }));
    let shown = shuffle(correct, rand);
    // The shown order must not already be the answer.
    for (let tries = 0; tries < 20 && shown.every((s, i) => s.id === correct[i].id); tries++) shown = shuffle(correct, rand);
    if (shown.every((s, i) => s.id === correct[i].id)) shown = [...correct.slice(1), correct[0]];
    item.steps = correct;
    item.shown = shown;
  } else if (q.type === 'dropdown') {
    item.blanks = q.blanks.map((b) => ({ id: b.id, options: withIds(b.options, 'o', rand) }));
  }
  return item;
}

export function publicView(item, n, total) {
  const q = item.q;
  const base = { n, total, type: q.type, domain: q.domain, objective: q.objective, scenario: q.scenario ?? null, stem: q.stem, live: item.live };
  if (q.type === 'single') return { ...base, options: item.options.map(({ id, text }) => ({ id, text })) };
  if (q.type === 'multi') return { ...base, select: q.select, options: item.options.map(({ id, text }) => ({ id, text })) };
  if (q.type === 'order') return { ...base, steps: item.shown.map(({ id, text }) => ({ id, text })) };
  return { ...base, template: q.template, code: Boolean(q.code), blanks: item.blanks.map((b) => ({ id: b.id, options: b.options.map(({ id, text }) => ({ id, text })) })) };
}

const isId = (v) => typeof v === 'string' && v.length <= 8;

export function grade(item, answer) {
  const q = item.q;
  const a = answer && typeof answer === 'object' ? answer : {};
  const common = { explanation: q.explanation, learn: q.learn ?? null, labId: q.labId ?? null, source: q.source };
  const review = (o, picked) => ({ id: o.id, text: o.text, correct: o.correct, picked, why: o.why ?? null });

  if (q.type === 'single') {
    if (!isId(a.choice) || !item.options.some((o) => o.id === a.choice)) throw new ExamInputError('Choose one answer.');
    const hit = item.options.find((o) => o.id === a.choice);
    return { ...common, correct: hit.correct, detail: null, options: item.options.map((o) => review(o, o.id === a.choice)) };
  }

  if (q.type === 'multi') {
    const picks = Array.isArray(a.choices) ? [...new Set(a.choices)] : [];
    if (picks.length !== q.select || !picks.every((p) => isId(p) && item.options.some((o) => o.id === p))) throw new ExamInputError(`Select exactly ${q.select}.`);
    const right = picks.filter((p) => item.options.find((o) => o.id === p).correct).length;
    return {
      ...common, correct: right === q.select, detail: `${right} of ${q.select} correct choices selected`,
      options: item.options.map((o) => review(o, picks.includes(o.id))),
    };
  }

  if (q.type === 'order') {
    const order = Array.isArray(a.order) ? a.order : [];
    const ids = item.steps.map((s) => s.id);
    if (order.length !== ids.length || new Set(order).size !== ids.length || !order.every((id) => ids.includes(id))) throw new ExamInputError('Put every step in order.');
    const inPlace = order.filter((id, i) => id === ids[i]).length;
    return {
      ...common, correct: inPlace === ids.length, detail: `${inPlace} of ${ids.length} steps in the right position`,
      steps: item.steps.map((s, i) => ({ id: s.id, text: s.text, position: i + 1, yourPosition: order.indexOf(s.id) + 1 })),
    };
  }

  const picks = a.picks && typeof a.picks === 'object' && !Array.isArray(a.picks) ? a.picks : {};
  for (const b of item.blanks) {
    if (!isId(picks[b.id]) || !b.options.some((o) => o.id === picks[b.id])) throw new ExamInputError('Answer every dropdown.');
  }
  const blanks = item.blanks.map((b) => {
    const chosen = picks[b.id];
    return { id: b.id, right: b.options.find((o) => o.id === chosen).correct, options: b.options.map((o) => review(o, o.id === chosen)) };
  });
  const right = blanks.filter((b) => b.right).length;
  return { ...common, correct: right === blanks.length, detail: `${right} of ${blanks.length} blanks correct`, blanks };
}
