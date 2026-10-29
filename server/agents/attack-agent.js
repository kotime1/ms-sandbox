// attack-agent: simulates adversary activity by writing synthetic records into the world.
//
// It can be asked to run a scenario by the learner (the "Replay" button) or by the lab-agent
// (lab setup). It refuses any scenario the active lab did not allowlist, so a learner cannot
// use the API to dump every scenario's data into a lab where it would confuse grading.

import { runScenario, listScenarios } from '../attacks/scenarios.js';
import { SimError } from '../sim/world.js';

export class AttackAgent {
  constructor({ bus, getWorld }) {
    this.bus = bus;
    this.getWorld = getWorld; // lazy: lab.start() replaces the world
    this.allowed = new Set();
    bus.handle('attack.allow', ({ scenarios }) => { this.allowed = new Set(scenarios); });
    bus.handle('attack.run', ({ scenario, force = false }) => this.run(scenario, force));
    bus.handle('attack.list', () => listScenarios().filter((s) => this.allowed.has(s.id)));
  }

  run(scenario, force) {
    if (!force && !this.allowed.has(scenario)) {
      throw new SimError('That simulation is not part of the current lab.');
    }
    this.bus.record('attack-agent', 'action', `Running scenario: ${scenario}`);
    const msg = runScenario(this.getWorld(), scenario);
    this.bus.record('attack-agent', 'result', msg);
    return msg;
  }
}
