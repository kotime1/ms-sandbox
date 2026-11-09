// A plain-text log of what the model wrote for live practice-exam questions: for every request, what was asked, how it ended, and each
// question it returned with the verdict of the quality checks (and the reasons, for a rejected one). It is for the person running the
// sandbox, to see why questions were rejected or requests failed.
//
//  - Off until the server calls open(). Tests and the probe script therefore never write to it.
//  - open() EMPTIES the file, so the log holds one server run only. It is gitignored (logs/).
//  - It holds model output and request outcomes. Never the API key, the Authorization header or the prompt text.
//  - A write that fails turns logging off. It can never break an exam.

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_LOG_PATH = 'logs/ai-questions.log';
const MAX_BYTES = 5 * 1024 * 1024; // a runaway log stops here
const PREVIEW_CHARS = 600;

export class AiLog {
  constructor() {
    this.file = null;
    this.bytes = 0;
    this.requests = 0;
  }

  get enabled() { return this.file !== null; }

  /** Start a fresh log at `file` (relative paths are from the working directory). Returns the absolute path, or null if it cannot be written. */
  open(file = DEFAULT_LOG_PATH) {
    try {
      const abs = path.resolve(file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const head = `AI question log. Started ${new Date().toISOString()}. Rewritten each time the server starts.\n`;
      fs.writeFileSync(abs, head);
      this.file = abs;
      this.bytes = head.length;
      this.requests = 0;
      return abs;
    } catch {
      this.file = null;
      return null;
    }
  }

  close() { this.file = null; }

  #append(text) {
    if (!this.file) return;
    if (this.bytes + text.length > MAX_BYTES) {
      this.file = null; // stop, and say so once, rather than grow without limit
      return;
    }
    try { fs.appendFileSync(this.file, text); this.bytes += text.length; } catch { this.file = null; }
  }

  /**
   * One finished request.
   *   domain, asked: [{type, objective, scenario}], ms, model
   *   outcome: { error, truncated, salvaged, finish, tokens, preview }
   *   verdicts: [{ question, problems }]   problems is [] for an accepted question
   */
  request({ domain, asked, ms, model, outcome, verdicts }) {
    if (!this.file) return;
    const n = ++this.requests;
    const accepted = verdicts.filter((v) => !v.problems.length).length;
    const lines = [];
    lines.push('', `=== Request ${n} · ${new Date().toISOString()} · ${domain} · ${model ?? '-'} · ${((ms ?? 0) / 1000).toFixed(1)}s ===`);
    lines.push(`Asked for ${asked.length}:`);
    asked.forEach((s, i) => lines.push(`  ${i + 1}. ${s.type}${s.scenario === undefined ? '' : s.scenario ? ', with a scenario' : ', no scenario'}${s.objective ? ` · ${s.objective}` : ''}`));
    const bits = [];
    if (outcome.status) bits.push(`HTTP ${outcome.status}`);
    if (outcome.finish) bits.push(`finish=${outcome.finish}`);
    if (outcome.tokens != null) bits.push(`tokens=${outcome.tokens}`);
    if (outcome.truncated) bits.push(`CUT OFF (salvaged ${outcome.salvaged ?? 0})`);
    lines.push(outcome.error ? `FAILED: ${outcome.error}${bits.length ? ` · ${bits.join(' ')}` : ''}` : `Returned ${verdicts.length}, accepted ${accepted}, rejected ${verdicts.length - accepted}${bits.length ? ` · ${bits.join(' ')}` : ''}`);
    if (outcome.preview) lines.push(`Start of the reply: ${JSON.stringify(outcome.preview.slice(0, PREVIEW_CHARS))}`);
    verdicts.forEach((v, i) => {
      lines.push('', `--- Question ${i + 1}: ${v.problems.length ? 'REJECTED' : 'accepted'}`);
      for (const p of v.problems) lines.push(`    problem: ${p}`);
      lines.push(JSON.stringify(v.question, null, 2).split('\n').map((l) => `    ${l}`).join('\n'));
    });
    this.#append(`${lines.join('\n')}\n`);
  }
}

/** The one log the server uses. Off until server/index.js opens it. */
export const aiLog = new AiLog();
