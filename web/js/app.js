// Shared application context. main.js fills in the functions; pages import `ctx`.
import * as api from './api.js';

export const ctx = {
  lab: null, // { briefing, status, next } from /api/state, or null when no lab is active
  route: 'home',
  assistant: { provider: 'local' },
  labs: [],

  // set by main.js
  navigate: () => {},
  reloadPage: async () => {},
  refresh: async () => {},
  toast: () => {},

  async view(name) {
    const out = await api.get(`/api/view/${name}`);
    if (!out.ok) throw new Error(out.error?.message ?? 'Could not load data');
    return out.data;
  },

  /**
   * Perform a simulator action (what a portal button does). Returns the server envelope.
   * Failures are toasted unless opts.silentError; the caller can still show them inline.
   */
  async act(type, params = {}, opts = {}) {
    const out = await api.post('/api/action', { type, params });
    if (!out.ok && !opts.silentError) ctx.toast(out.error?.message ?? 'Action failed', 'error');
    if (!opts.noRefresh) await ctx.refresh();
    return out;
  },
};
