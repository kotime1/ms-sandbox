// Session store. One isolated bundle (world + bus + three agents) per browser session.
//
// - Session ids are 256-bit random values; they live only in an HttpOnly cookie.
// - A separate per-session CSRF token must accompany every state-changing request.
// - Idle sessions expire and the total is capped, so memory use is bounded.

import { EventBus } from './bus.js';
import { randomToken } from './util.js';
import { createWorld } from '../sim/world.js';
import { LabAgent } from '../agents/lab-agent.js';
import { AttackAgent } from '../agents/attack-agent.js';
import { AssistantAgent } from '../agents/assistant-agent.js';

const IDLE_MS = 2 * 60 * 60 * 1000;
export const MAX_SESSIONS = 50;

export class SessionStore {
  constructor({ env = process.env, now = () => Date.now() } = {}) {
    this.env = env;
    this.now = now;
    this.map = new Map();
  }

  create() {
    this.sweep();
    if (this.map.size >= MAX_SESSIONS) {
      // Evict the least recently used rather than refusing a legitimate learner.
      const oldest = [...this.map.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
      if (oldest) this.map.delete(oldest[0]);
    }
    const id = randomToken(32);
    const s = { id, csrf: randomToken(24), lastSeen: this.now() };
    s.bus = new EventBus();
    s.world = createWorld();
    s.ctx = { bus: s.bus, get w() { return s.world; } };
    s.attack = new AttackAgent({ bus: s.bus, getWorld: () => s.world });
    s.lab = new LabAgent({ bus: s.bus, getWorld: () => s.world, setWorld: (w) => { s.world = w; } });
    s.assistant = new AssistantAgent({ bus: s.bus, env: this.env });
    this.map.set(id, s);
    return s;
  }

  get(id) {
    if (typeof id !== 'string' || id.length > 100) return null;
    const s = this.map.get(id);
    if (!s) return null;
    if (this.now() - s.lastSeen > IDLE_MS) { this.map.delete(id); return null; }
    s.lastSeen = this.now();
    return s;
  }

  sweep() {
    const t = this.now();
    for (const [id, s] of this.map) if (t - s.lastSeen > IDLE_MS) this.map.delete(id);
  }

  get size() { return this.map.size; }
}
