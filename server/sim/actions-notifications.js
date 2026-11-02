// Email alert notification rules (Settings > Endpoints > General > Email notifications) and the "signed in as" selector.
// Rules and permissions: notifications.js. Delivery (the simulated outbox): world.js raiseDefenderAlert.

import { idSpec } from '../core/validate.js';
import { SimError, capCheck } from './world.js';
import { SEVERITIES, buildNotificationRule, canManageSecuritySettings } from './notifications.js';

const email = { type: 'string', min: 3, max: 190, pattern: /^[A-Za-z0-9._%+@-]+$/ };
const actorOf = (w) => w.directory.users.find((u) => u.id === w.directory.actorId);

export const NOTIFICATION_ACTIONS = {
  'defender.createNotificationRule': {
    spec: {
      name: { type: 'string', min: 1, max: 80, pattern: /^[\w .:()@/\\,'+#&|=-]+$/ },
      devices: { type: 'enum', values: ['all', 'groups'] },
      deviceGroups: { type: 'array', of: idSpec(), max: 10, optional: true, default: [] },
      severities: { type: 'array', of: { type: 'enum', values: SEVERITIES }, max: 4 },
      recipients: { type: 'array', of: email, max: 20 },
    },
    run({ w }, p) {
      const actor = actorOf(w);
      capCheck(w.defender.notificationRules, 'notificationRules');
      const built = buildNotificationRule(p, { actor, groups: w.defender.deviceGroups.map((g) => g.id).filter((g) => g !== 'grp-all'), existing: w.defender.notificationRules });
      const rule = { id: `nr-${w.counters.rule++}`, name: p.name, ...built, enabled: true, createdBy: actor.name };
      w.defender.notificationRules.push(rule);
      return { rule: { id: rule.id } };
    },
  },
  'defender.deleteNotificationRule': {
    spec: { id: idSpec() },
    run({ w }, p) {
      const actor = actorOf(w);
      if (!canManageSecuritySettings(actor)) throw new SimError(`${actor.name} does not have the Manage security settings permission.`, 'Forbidden');
      const i = w.defender.notificationRules.findIndex((r) => r.id === p.id);
      if (i < 0) throw new SimError('Notification rule not found', 'NotFound');
      w.defender.notificationRules.splice(i, 1);
      return {};
    },
  },
  // Which person the learner is acting as. Lets the "who can change settings" questions be played, not just read.
  'directory.signInAs': {
    spec: { userId: idSpec() },
    run({ w }, p) {
      if (!w.directory.users.some((u) => u.id === p.userId)) throw new SimError('Unknown user', 'NotFound');
      w.directory.actorId = p.userId;
      return {};
    },
  },
};
