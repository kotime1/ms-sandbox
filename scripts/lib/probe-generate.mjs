// The `generate` check of scripts/probe-ica.mjs: makes the requests a live exam makes, with the app's own planner, against the real model,
// and reports for each request why it failed (cut off, malformed, error) and which quality rules rejected questions.
import { ExamAgent } from '../../server/agents/exam-agent.js';
import { validateQuestion } from '../../server/exam/validate.js';
import { planSlots, toRequests } from '../../server/exam/slots.js';
import { DOMAINS } from '../../server/exam/objectives.js';

const LABEL = Object.fromEntries(Object.entries(DOMAINS).map(([key, d]) => [d.label, key]));

export async function probeGenerate(runs = 1, count = 50) {
  const agent = new ExamAgent({ env: process.env });
  if (!agent.available) { console.log('ICA is not configured (need ICA_API_KEY and ICA_MODEL)'); process.exit(2); }

  // One record per request, filled in as the request goes out and comes back. Requests run in parallel, so they are matched by the
  // unique tag put in each prompt rather than by order.
  const records = new Map();
  const baseFetch = agent.fetch;
  agent.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const key = /Reference ([a-z0-9]+)/.exec(body.messages[1].content)?.[1];
    const rec = { status: null, secs: null, finish: null, tokens: null, thrown: null };
    records.set(key, rec);
    const t0 = Date.now();
    try {
      const res = await baseFetch(url, init);
      rec.status = res.status;
      rec.secs = ((Date.now() - t0) / 1000).toFixed(0);
      try { const j = await res.clone().json(); rec.finish = j.choices?.[0]?.finish_reason; rec.tokens = j.usage?.completion_tokens; } catch { /* body is not JSON */ }
      return res;
    } catch (e) { rec.secs = ((Date.now() - t0) / 1000).toFixed(0); rec.thrown = e.name; throw e; }
  };

  // Each reply is kept with the domain it was asked for, so it can be re-checked against the quality rules afterwards.
  const replies = [];
  const call = agent.call.bind(agent);
  agent.call = async (prompt) => {
    // A unique tag makes every request new. Identical requests are answered from a cache within seconds, with identical text, including a
    // cut-off reply, which would hide the real failure rate and the real timing.
    const tag = Math.random().toString(36).slice(2, 8);
    const out = await call(`${prompt}\n(Reference ${tag}; ignore this line.)`);
    const domain = LABEL[/for the domain "([^"]+)"/.exec(prompt)?.[1]];
    replies.push({ domain, items: out.items });
    return Object.assign(out, { tag });
  };

  const tally = new Map();
  let requests = 0, failed = 0, cut = 0, asked = 0, accepted = 0, rejected = 0, peak = 0;
  for (let run = 1; run <= runs; run++) {
    replies.length = 0;
    records.clear();
    const jobs = toRequests(planSlots(count));
    const t0 = Date.now();
    const results = await Promise.all(jobs.map((j) => agent.generate(j.domain, j.slots)));
    console.log(`\nrun ${run}: ${jobs.length} requests in parallel, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const recs = [...records.values()];
    results.forEach((r, i) => {
      const job = jobs[i];
      const t = recs[i] ?? {};
      requests++; asked += job.slots.length; accepted += r.questions.length; rejected += r.rejected;
      if (r.error) failed++;
      if (r.truncated) cut++;
      peak = Math.max(peak, t.tokens ?? 0);
      const bits = [`HTTP ${t.status ?? '-'}`, `${t.secs ?? '-'}s`, `finish=${t.finish ?? '-'}`, `tokens=${t.tokens ?? '-'}`];
      if (t.thrown) bits.push(`thrown=${t.thrown}`);
      console.log(`  #${i + 1} ${job.domain.padEnd(8)} asked ${job.slots.length}, accepted ${r.questions.length}, rejected ${r.rejected}${r.error ? `, FAILED: ${r.error}` : ''}${r.truncated ? ` (cut off, salvaged ${r.salvaged})` : ''} | ${bits.join(' ')}`);
    });
    for (const { domain, items } of replies) {
      for (const item of items) {
        const q = { ...item, id: 'live-probe', source: 'live', domain };
        if (q.type === 'multi' && q.select === undefined && Array.isArray(q.options)) q.select = q.options.filter((o) => o?.correct).length;
        for (const p of validateQuestion(q)) {
          const rule = p.replace(/^[^:]*: /, '').replace(/[0-9]+/g, 'N').replace(/"[^"]*"/g, '"..."').slice(0, 95);
          tally.set(rule, (tally.get(rule) ?? 0) + 1);
        }
      }
    }
  }
  console.log(`\n${requests} requests: ${failed} failed, ${cut} cut off, most tokens in one request ${peak}. ${asked} questions asked, ${accepted} accepted, ${rejected} rejected by the quality checks.`);
  if (tally.size) {
    console.log('Rules the rejected questions broke:');
    for (const [rule, n] of [...tally].sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(2)}x  ${rule}`);
  }
}
