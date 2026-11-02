// Microsoft Purview Audit actions: choose the audit tier, run a search. Rules: audit.js.

import { SimError, capCheck } from './world.js';
import { TIERS, RECORD_TYPES, canSearchAudit, search } from './audit.js';

const actorOf = (w) => w.directory.users.find((u) => u.id === w.directory.actorId);
const iso = { type: 'string', min: 10, max: 30, pattern: /^[0-9T:.\-Z+]+$/ };

export const AUDIT_ACTIONS = {
  // Admin center > Licenses / Purview > Audit: the tenant moves to Audit (Premium). Needs someone who administers licences.
  'purview.setAuditTier': {
    spec: { tier: { type: 'enum', values: TIERS } },
    run({ w }, p) {
      const a = actorOf(w);
      if (a.entraRole !== 'Global Administrator' && a.roleGroup !== 'Global Administrator') throw new SimError(`${a.name} cannot change licensing. Only a Global Administrator can assign Audit (Premium) licences.`, 'Forbidden');
      w.audit.tier = p.tier;
      return { tier: p.tier };
    },
  },
  'purview.searchAudit': {
    spec: { from: iso, to: iso, recordTypes: { type: 'array', of: { type: 'enum', values: RECORD_TYPES.map((r) => r.id) }, max: 10, optional: true, default: [] } },
    run({ w }, p) {
      const a = actorOf(w);
      if (!canSearchAudit(a)) throw new SimError(`${a.name} does not have the Audit Logs or View-Only Audit Logs role, so cannot search the audit log.`, 'Forbidden');
      capCheck(w.audit.searches, 'auditSearches');
      const results = search({ records: w.audit.records, tier: w.audit.tier, now: Date.now(), from: new Date(p.from), to: new Date(p.to), recordTypes: p.recordTypes });
      const rec = { id: `as-${w.counters.rule++}`, recordTypes: p.recordTypes, from: p.from, to: p.to, tier: w.audit.tier, count: results.length, activities: [...new Set(results.map((r) => r.activity))].sort(), users: [...new Set(results.map((r) => r.user))].sort() };
      w.audit.searches.push(rec);
      return { id: rec.id, results: results.slice(0, 100).map((r) => ({ at: r.at.toISOString(), recordType: r.recordType, activity: r.activity, user: r.user })) };
    },
  },
};
