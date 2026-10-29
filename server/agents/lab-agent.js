// lab-agent: owns the lab lifecycle.
//
//  - start(labId): resets the world, applies the lab's setup, asks the attack-agent to seed it
//  - status():     grades the CURRENT STATE of the world against the lab's objectives
//  - nextStep():   tells the UI which control to highlight (kinesthetic guidance)
//  - hint():       reveals hints one tier at a time and records that the learner used them
//
// Grading is outcome-based on world state, never on click order, so there are many valid paths
// and the learner cannot "pass" by calling an endpoint: there is no endpoint that sets a result.

import { getLab, labSummary } from '../labs/index.js';
import { createWorld } from '../sim/world.js';

const MAX_HINT = 3;

export class LabAgent {
  constructor({ bus, getWorld, setWorld }) {
    this.bus = bus;
    this.getWorld = getWorld;
    this.setWorld = setWorld;
    this.lab = null;
    this.hintTier = Object.create(null); // objectiveId -> tiers revealed
    this.startedAt = null;
    this.completedAt = null;

    bus.handle('lab.active', () => this.lab);
    bus.handle('lab.context', () => this.assistantContext());
  }

  start(labId) {
    const lab = getLab(labId);
    if (!lab) return null;
    const w = createWorld();
    this.setWorld(w);
    this.lab = lab;
    this.hintTier = Object.create(null);
    this.startedAt = Date.now();
    this.completedAt = null;
    this.bus.feed.length = 0;
    this.bus.record('lab-agent', 'info', `Starting lab: ${lab.title}`);
    const seeds = lab.setup(w) ?? [];
    this.bus.request('attack.allow', { scenarios: lab.scenarios });
    for (const s of seeds) this.bus.request('attack.run', { scenario: s, force: true });
    this.bus.record('lab-agent', 'info', 'Environment ready. Objectives are graded from the state of the environment.');
    return this.briefing();
  }

  briefing() {
    const l = this.lab;
    if (!l) return null;
    return {
      ...labSummary(l),
      brief: l.brief,
      objectives: l.objectives.map((o) => ({ id: o.id, text: o.text, optional: Boolean(o.optional) })),
      scenarios: this.bus.request('attack.list'),
    };
  }

  /** Evaluate every objective against the current world. Check functions are server-side only. */
  status() {
    const l = this.lab;
    if (!l) return null;
    const w = this.getWorld();
    const objectives = l.objectives.map((o) => {
      let met = false;
      try { met = Boolean(o.check(w)); } catch { met = false; }
      return { id: o.id, text: o.text, optional: Boolean(o.optional), met, hintsUsed: this.hintTier[o.id] ?? 0 };
    });
    const required = objectives.filter((o) => !o.optional);
    const complete = required.every((o) => o.met);
    if (complete && !this.completedAt) {
      this.completedAt = Date.now();
      this.bus.record('lab-agent', 'success', 'All required objectives met.');
    }
    return {
      labId: l.id,
      objectives,
      complete,
      hintsUsed: Object.values(this.hintTier).reduce((a, b) => a + b, 0),
      elapsedSec: Math.round(((this.completedAt ?? Date.now()) - this.startedAt) / 1000),
      debrief: complete ? l.debrief : null,
    };
  }

  /** The first incomplete step, and the UI control it refers to. */
  nextStep() {
    const l = this.lab;
    if (!l) return null;
    const w = this.getWorld();
    const idx = l.steps.findIndex((s) => { try { return !s.done(w); } catch { return true; } });
    if (idx < 0) return { index: l.steps.length, total: l.steps.length, text: 'Walkthrough complete. Check your objectives.', target: null };
    const s = l.steps[idx];
    const target = typeof s.target === 'function' ? s.target(w) : s.target;
    return { index: idx, total: l.steps.length, text: s.text, target };
  }

  /** Reveal the next hint tier for the first unmet objective (or a named one). */
  hint(objectiveId) {
    const l = this.lab;
    if (!l) return null;
    const st = this.status();
    const target = objectiveId ? st.objectives.find((o) => o.id === objectiveId) : st.objectives.find((o) => !o.met && !o.optional) ?? st.objectives.find((o) => !o.met);
    if (!target) return { objectiveId: null, tier: 0, text: 'Every objective is already met.' };
    const ladder = l.hints[target.id] ?? [];
    const tier = Math.min((this.hintTier[target.id] ?? 0) + 1, Math.min(MAX_HINT, ladder.length));
    this.hintTier[target.id] = tier;
    this.bus.record('lab-agent', 'hint', `Hint ${tier} for "${target.id}"`);
    return { objectiveId: target.id, tier, of: Math.min(MAX_HINT, ladder.length), text: ladder[tier - 1] ?? 'No more hints.' };
  }

  /** What the assistant-agent is allowed to know: revealed hints only, never the solution. */
  assistantContext() {
    const l = this.lab;
    if (!l) return null;
    const st = this.status();
    const revealed = {};
    for (const o of l.objectives) {
      const t = this.hintTier[o.id] ?? 0;
      if (t) revealed[o.id] = l.hints[o.id]?.slice(0, t) ?? [];
    }
    return {
      lab: { id: l.id, title: l.title, brief: l.brief, topics: l.topics },
      objectives: st.objectives.map((o) => ({ id: o.id, text: o.text, met: o.met })),
      revealedHints: revealed,
      withheldNotes: st.complete ? [] : l.withholdNotes ?? [],
      complete: st.complete,
      debrief: st.complete ? l.debrief : null,
    };
  }
}

export { createWorld };
