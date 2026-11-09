// exam-agent: writes fresh practice-exam questions with Claude, on request. Optional: it is only available when
// ICA_API_KEY and a model (EXAM_MODEL or ICA_MODEL) are set (and EXAM_PROVIDER != local). Calls go through IBM Consulting Advantage. The authored bank in server/exam/bank/ works without it.
//
// Security properties (same shape as assistant-agent.js):
//  - The only inputs are enum values chosen by the server (domain key, question types, how many). No text from the
//    browser reaches the prompt, so there is nothing to inject into.
//  - The reply is untrusted data: it must be a JSON array, every item goes through validateQuestion() (structure and
//    answer-shape neutrality), and anything that fails is dropped. Nothing from the model is rendered as HTML.
//  - The API key is read once from the environment, sent only to the ICA API (core/ica-client.js), and never returned or logged.
//    Calls have a timeout and a response size cap.
//  - Generated questions are labelled source:'live'; the UI tells the learner to verify them on Microsoft Learn.

import { DOMAINS, OBJECTIVES } from '../exam/objectives.js';
import { validateQuestion } from '../exam/validate.js';
import { randomToken } from '../core/util.js';
import { icaConfig, icaChatFull } from '../core/ica-client.js';
import { aiLog } from '../exam/ai-log.js';

const MAX_BODY_CHARS = 60_000;
const TIMEOUT_MS = 120_000;
// The model spends a varying share of its token budget before the visible text (measured: 8000 tokens produced between 4,200 and 8,400
// characters), and four questions with an explanation on every choice used 5,300 to 7,600 of 8000. At 8000 about one request in four was
// cut off mid-array and lost whole; this leaves roughly twice the room.
const MAX_TOKENS = 16_000;

const EXAMPLE = {
  domain: 'respond',
  objective: 'Perform actions on the device, including live response and collecting investigation packages',
  type: 'single',
  scenario: 'A user reports that WS-12 is slow. Defender for Endpoint shows a suspicious scheduled task on the device. The user is in a meeting and must not lose access to the machine.',
  stem: 'You need a forensic snapshot of the processes, connections and scheduled tasks on WS-12 without a live session. What should you do?',
  options: [
    { text: 'Collect an investigation package from the device page', correct: true, why: 'It gathers a ZIP of processes, connections and scheduled tasks without interrupting the user or opening a session.' },
    { text: 'Isolate the device from the network from the device page', why: 'Isolation contains the device and disrupts the user. It does not collect a snapshot.' },
    { text: 'Open a live response session from the device page', why: 'Live response is an interactive session, which the requirement rules out.' },
    { text: 'Submit the scheduled task file for deep analysis', why: 'Deep analysis detonates one file in a sandbox. It does not capture the device state.' },
  ],
  explanation: 'Collect investigation package gathers a ZIP of device artefacts (processes, connections, scheduled tasks, autoruns) without disrupting the user or opening a session.',
  learn: 'Take response actions on a device in Microsoft Defender for Endpoint',
};

const SCHEMA_NOTES = [
  'Each question is a JSON object with: domain, objective (copied EXACTLY from the list for that domain), type, optional scenario, stem, explanation, learn (a Microsoft Learn page TITLE, never a URL).',
  'EVERY option (right or wrong) and every ordering step needs a "why" of 15 to 300 characters. The learner reads it under that choice after answering: on the right option it says why it is right, on a wrong option why it is wrong, on a step why it belongs at that position. Do not just repeat the option text.',
  'type "single": options = 4 or 5 objects { text, why } with exactly one also marked correct: true.',
  'type "multi": options = 5 or 6 objects as above, 2 or 3 correct, "select" = the number correct, and the stem says "two" or "three".',
  'type "order": steps = 3 to 6 objects { text, why } listed in the CORRECT order. The stem asks to arrange them. Each why explains why that step comes at that position, usually by what depends on it or what it depends on.',
  'type "dropdown": template = text containing {{a}}, {{b}} ... blanks (each exactly once); blanks = [{ id: "a", options: [{ text, correct: true, why }, { text, why }] }, ...], 2-5 options each, exactly one correct. Use it for Yes/No statement tables, completing a KQL query (set "code": true) or choosing portal settings.',
].join('\n');

const RULES = [
  'ANSWER-SHAPE RULES (strict, they are machine-checked and a violating question is thrown away):',
  '- All options in a set must be about the same length (within roughly 30% of each other) and the same grammatical form.',
  '- The correct option must NOT be the longest, most detailed or most hedged. Do not make wrong options obviously shorter or vaguer.',
  '- Do not use punctuation, "and", parentheses, digits or a trailing full stop in only the correct options (or only the wrong ones).',
  '- No "all of the above", "none of the above" or "both ... and ..." options.',
  '- Do not use always/never/only/every/must in wrong options unless a correct option also uses one.',
  '- Do not repeat distinctive words from the stem more in the correct option than in the wrong ones. Put the specifics in the scenario.',
  '- Wrong options must be plausible real configurations or actions in the same product area, not jokes.',
].join('\n');

const SYSTEM = [
  'You write practice questions for the Microsoft SC-200 (Security Operations Analyst) exam. You write ORIGINAL questions in the style of the real exam: scenario-based and performance-based, with realistic tenant details and one clear, defensible answer.',
  'Only write about features that exist in Microsoft Sentinel, the Microsoft Defender portal, Defender XDR, Defender for Endpoint, Defender for Identity, Defender for Cloud Apps, Microsoft Purview, Entra ID and KQL. If you are not sure how a feature behaves, do not write a question about it.',
  'Reply with ONE JSON array and nothing else: no prose, no markdown fences.',
  SCHEMA_NOTES,
  RULES,
].join('\n\n');

/**
 * `slots` is either a list of type names (the model chooses objectives freely) or a list of { type, objective, scenario } (each question
 * is assigned its own objective, type and scenario, so parallel requests cannot pick the same topic).
 */
function userPrompt(domain, slots) {
  const d = DOMAINS[domain];
  const groups = OBJECTIVES.filter((g) => g.domain === domain);
  const assigned = typeof slots[0] === 'object';
  const head = assigned
    ? [
      `Write exactly ${slots.length} question${slots.length > 1 ? 's' : ''} for the domain "${d.label}", one for each line below, in this order. Copy the objective text exactly into "objective".`,
      ...slots.map((x, i) => `${i + 1}. type "${x.type}", objective "${x.objective}", ${x.scenario ? 'with a scenario' : 'without a scenario (a short direct question)'}`),
    ]
    : [
      `Write ${slots.length} questions for the domain "${d.label}".`,
      `Question types, in order: ${slots.join(', ')}. About 60% should have a scenario.`,
      'Spread them over different objectives. Use these objectives (copy the text exactly into "objective"):',
      ...groups.flatMap((g) => [`${g.group}:`, ...g.bullets.map((x) => `- ${x}`)]),
    ];
  return [
    ...head,
    `Set "domain" to "${domain}" on every question.`,
    'Example of one valid question (do not reuse it):',
    JSON.stringify(EXAMPLE),
  ].join('\n');
}

function extractJson(text) {
  const s = text.indexOf('[');
  const e = text.lastIndexOf(']');
  if (s < 0 || e <= s) throw Object.assign(new Error('no json array'), { name: 'BadReply' });
  return JSON.parse(text.slice(s, e + 1));
}

/**
 * A reply that was cut off at the token limit is an array that never closes. Return the objects that are COMPLETE before the cut: walk the
 * text tracking strings and braces, and parse each top-level object on its own. A half-written object is dropped, never repaired.
 */
export function salvageObjects(text) {
  const start = text.indexOf('[');
  if (start < 0) return [];
  const out = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let from = -1;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) from = i; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && from >= 0) { try { out.push(JSON.parse(text.slice(from, i + 1))); } catch { /* not valid JSON: skip it */ } from = -1; }
      if (depth < 0) break;
    }
  }
  return out;
}

export class ExamAgent {
  constructor({ env = process.env, fetchImpl = globalThis.fetch, log = aiLog } = {}) {
    this.fetch = fetchImpl;
    this.log = log;
    this.cfg = icaConfig(env, 'EXAM_MODEL');
    this.model = this.cfg.model;
    this.available = this.cfg.enabled && env.EXAM_PROVIDER !== 'local';
  }

  /**
   * Ask for `types.length` questions in `domain`. Never throws: returns { questions, rejected, error }.
   * `questions` have passed validateQuestion(); `rejected` counts the ones that did not.
   */
  async generate(domain, slots) {
    const types = slots.map((x) => (typeof x === 'object' ? x.type : x));
    if (!this.available || !Object.hasOwn(DOMAINS, domain) || !types.length) return { questions: [], rejected: 0, error: 'unavailable', truncated: false, salvaged: 0 };
    const t0 = Date.now();
    const asked = slots.map((x) => (typeof x === 'object' ? x : { type: x }));
    try {
      const { items, truncated, salvaged, ...meta } = await this.call(userPrompt(domain, slots));
      let rejected = 0;
      const questions = [];
      const verdicts = [];
      for (const r of items.slice(0, types.length + 2)) {
        const q = { ...r, id: `live-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, 'x').slice(0, 10)}`, source: 'live', domain };
        if (q.type === 'multi' && q.select === undefined && Array.isArray(q.options)) q.select = q.options.filter((o) => o?.correct).length;
        const problems = validateQuestion(q);
        verdicts.push({ question: q, problems });
        if (problems.length) rejected++;
        else questions.push(q);
      }
      this.#log({ domain, asked, ms: Date.now() - t0, outcome: { error: null, truncated, salvaged, finish: meta.finish, tokens: meta.tokens }, verdicts });
      return { questions, rejected, error: null, truncated, salvaged };
    } catch (err) {
      const error = err?.cause ?? err?.name ?? 'Error';
      this.#log({ domain, asked, ms: Date.now() - t0, outcome: { error, truncated: err?.truncated ?? false, salvaged: 0, finish: err?.finish, tokens: err?.tokens, preview: err?.preview, status: err?.status }, verdicts: [] });
      return { questions: [], rejected: 0, error, truncated: err?.truncated ?? false, salvaged: 0 };
    }
  }

  /** Logging must never change the outcome of a request. */
  #log(entry) {
    try { this.log.request({ ...entry, model: this.model }); } catch { /* the log is a convenience */ }
  }

  /** One model call. Returns { items, truncated, salvaged }; throws with a `cause` naming why when nothing usable came back. */
  async call(prompt) {
    const out = await icaChatFull({ fetchImpl: this.fetch, cfg: this.cfg, system: SYSTEM, messages: [{ role: 'user', content: prompt }], maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS });
    const text = out.text.slice(0, MAX_BODY_CHARS);
    const meta = { finish: out.finish, tokens: out.tokens, preview: text.slice(0, 600) };
    if (!out.truncated) {
      try { return { items: extractJson(text), truncated: false, salvaged: 0, ...meta }; } catch (e) {
        throw Object.assign(new Error('bad reply'), { cause: e.name === 'SyntaxError' ? 'MalformedJson' : 'NoJsonArray', ...meta });
      }
    }
    // Cut off at the token limit: keep the questions that were completed before the cut.
    const items = salvageObjects(text);
    if (!items.length) throw Object.assign(new Error('cut off'), { cause: 'CutOffBeforeFirstQuestion', truncated: true, ...meta });
    return { items, truncated: true, salvaged: items.length, ...meta };
  }
}
