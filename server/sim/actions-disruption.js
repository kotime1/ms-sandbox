// Automatic attack disruption settings. Rules and wording: disruption.js.

import { SimError } from './world.js';
import { applySetting, PRODUCTS, LEVELS } from './disruption.js';

export const DISRUPTION_ACTIONS = {
  'disruption.set': {
    spec: {
      setting: { type: 'enum', values: ['deploy', 'discovery', 'automation', 'sensor', 'actionAccount', 'auditing', 'officeConnector'] },
      value: { type: 'string', min: 1, max: 80, pattern: /^[A-Za-z0-9 -]+$/ },
      group: { type: 'string', max: 60, optional: true, default: '', pattern: /^[A-Za-z0-9 -]*$/ },
    },
    run({ w }, p) {
      const next = applySetting(w.disruption, p);
      w.disruption = next;
      w.disruptionLog.push({ setting: p.setting, value: p.value });
      if (w.disruptionLog.length > 100) w.disruptionLog.shift();
      return {};
    },
  },
};

export { PRODUCTS, LEVELS, SimError };
