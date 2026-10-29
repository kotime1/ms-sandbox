// Per-session event bus that the three agents (and the simulator) talk over.
//
//  emit(type, payload)    fan-out notification; a throwing subscriber is logged, never fatal
//  handle(type, fn)       register the single responder for a request type
//  request(type, payload) call that responder (agent-to-agent RPC)
//
// Every event is also appended to a bounded ring so the UI can show an "agent activity"
// feed. Payloads placed on the feed are copies limited to plain data.

const FEED_MAX = 200;

export class EventBus {
  constructor() {
    this.subs = new Map();
    this.handlers = new Map();
    this.feed = [];
    this.seq = 0;
  }

  on(type, fn) {
    if (!this.subs.has(type)) this.subs.set(type, []);
    this.subs.get(type).push(fn);
  }

  emit(type, payload = {}) {
    for (const fn of [...(this.subs.get(type) ?? []), ...(this.subs.get('*') ?? [])]) {
      try {
        fn(payload, type);
      } catch (err) {
        this.record('bus', 'error', `subscriber for ${type} failed: ${err.message}`);
      }
    }
  }

  handle(type, fn) {
    if (this.handlers.has(type)) throw new Error(`duplicate handler for ${type}`);
    this.handlers.set(type, fn);
  }

  request(type, payload = {}) {
    const fn = this.handlers.get(type);
    if (!fn) throw new Error(`no handler for ${type}`);
    return fn(payload);
  }

  /** Append to the agent-activity feed that the UI shows. */
  record(agent, kind, text) {
    this.feed.push({ id: ++this.seq, at: Date.now(), agent, kind, text: String(text).slice(0, 400) });
    if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
  }

  feedSince(afterId = 0) {
    return this.feed.filter((e) => e.id > afterId);
  }
}
