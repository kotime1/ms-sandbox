// Endpoint security policies for the attack surface reduction area (Windows/macOS device protection settings).
// Rules and validation: security-policies.js.

import { idSpec } from '../core/validate.js';
import { SimError, capCheck } from './world.js';
import { CAPABILITIES, ASR_RULES, MODES, PLATFORMS, buildPolicy } from './security-policies.js';

export const SECURITY_POLICY_ACTIONS = {
  'defender.createSecurityPolicy': {
    spec: {
      name: { type: 'string', min: 1, max: 80, pattern: /^[\w .:()@/\\,'+#&|=-]+$/ },
      type: { type: 'enum', values: Object.keys(CAPABILITIES) },
      platform: { type: 'enum', values: PLATFORMS },
      deviceGroups: { type: 'array', of: idSpec(), max: 10, optional: true, default: [] },
      rules: { type: 'array', of: { type: 'object', shape: { rule: { type: 'enum', values: ASR_RULES.map((r) => r.id) }, mode: { type: 'enum', values: MODES } } }, max: 25, optional: true, default: [] },
    },
    run({ w }, p) {
      capCheck(w.defender.securityPolicies, 'securityPolicies');
      const built = buildPolicy(p, { groups: w.defender.deviceGroups.map((g) => g.id).filter((g) => g !== 'grp-all'), existing: w.defender.securityPolicies });
      const policy = { id: `sp-${w.counters.rule++}`, name: p.name, type: p.type, platform: p.platform, deviceGroups: built.scope, rules: built.rules };
      w.defender.securityPolicies.push(policy);
      return { policy: { id: policy.id } };
    },
  },
  'defender.deleteSecurityPolicy': {
    spec: { id: idSpec() },
    run({ w }, p) {
      const i = w.defender.securityPolicies.findIndex((x) => x.id === p.id);
      if (i < 0) throw new SimError('Policy not found', 'NotFound');
      w.defender.securityPolicies.splice(i, 1);
      return {};
    },
  },
};
