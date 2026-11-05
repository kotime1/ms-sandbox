// Threat analytics and Vulnerabilities notification rules, and the replayable "a report was published" event. Rules: ta-notifications.js.

import { idSpec } from '../core/validate.js';
import { SimError, capCheck } from './world.js';
import { KINDS, TAGS, REPORT_TYPES, buildKindRule, notifiesForReport } from './ta-notifications.js';
import { canManageSecuritySettings } from './notifications.js';

const actorOf = (w) => w.directory.users.find((u) => u.id === w.directory.actorId);
const email = { type: 'string', min: 3, max: 190, pattern: /^[A-Za-z0-9._%+@-]+$/ };

export const TA_ACTIONS = {
  'defender.createKindNotification': {
    spec: {
      kind: { type: 'enum', values: KINDS },
      name: { type: 'string', min: 1, max: 60, pattern: /^[A-Za-z0-9 _.-]+$/ },
      description: { type: 'string', max: 120, optional: true, default: '', pattern: /^[A-Za-z0-9 _.-]*$/ },
      tags: { type: 'array', of: { type: 'enum', values: TAGS }, max: 4, optional: true, default: [] },
      reportTypes: { type: 'array', of: { type: 'enum', values: REPORT_TYPES }, max: 6, optional: true, default: [] },
      recipients: { type: 'array', of: email, max: 20 },
    },
    run({ w }, p) {
      const a = actorOf(w);
      if (!canManageSecuritySettings(a)) throw new SimError(`${a.name} does not have the Manage security settings permission.`, 'Forbidden');
      capCheck(w.defender.kindRules, 'kindRules');
      const built = buildKindRule(p, { existing: w.defender.kindRules });
      const rule = { id: `kr-${w.counters.rule++}`, kind: p.kind, name: p.name, description: p.description, enabled: true, ...built };
      w.defender.kindRules.push(rule);
      return { rule: { id: rule.id } };
    },
  },
  'defender.deleteKindNotification': {
    spec: { id: idSpec() },
    run({ w }, p) {
      const i = w.defender.kindRules.findIndex((r) => r.id === p.id);
      if (i < 0) throw new SimError('Notification rule not found', 'NotFound');
      w.defender.kindRules.splice(i, 1);
      return {};
    },
  },
  // Microsoft publishes (or updates) a threat analytics report. Matching Threat analytics rules send one email per recipient.
  'ta.publishReport': {
    spec: { reportId: idSpec() },
    run({ w }, p) {
      const report = w.defender.taReports.find((r) => r.id === p.reportId);
      if (!report) throw new SimError('Report not found', 'NotFound');
      for (const rule of w.defender.kindRules) {
        if (!notifiesForReport(rule, report)) continue;
        for (const to of rule.recipients) {
          if (w.defender.outbox.length >= 500) w.defender.outbox.shift();
          w.defender.outbox.push({ id: `mail-${w.counters.alert++}`, ruleId: rule.id, to, alertId: null, title: `Threat analytics: ${report.title}`, severity: 'Informational', device: '', at: Date.now() });
        }
      }
      return { published: report.id };
    },
  },
};
