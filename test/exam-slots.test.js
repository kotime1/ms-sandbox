// Planning live questions as slots: one question to write, with its own domain, type, objective and scenario flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSlots, toRequests, pickObjectives, SLOTS_PER_REQUEST, SCENARIO_SHARE } from '../server/exam/slots.js';
import { OBJECTIVES, BULLET_DOMAIN, DOMAINS } from '../server/exam/objectives.js';
import { TYPE_MIX } from '../server/exam/build.js';

const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const count = (list, key) => list.reduce((m, x) => { m[x[key]] = (m[x[key]] ?? 0) + 1; return m; }, {});

test('a 50-question exam plans 20 live slots that keep the domain weights: 8 manage, 8 respond, 4 hunt', () => {
  const slots = planSlots(50, { rand: seeded(1) });
  assert.equal(slots.length, 20);
  assert.deepEqual(count(slots, 'domain'), { manage: 8, respond: 8, hunt: 4 });
});

test('every slot has a real objective of its own domain, and a known question type', () => {
  for (let seed = 1; seed <= 25; seed++) {
    for (const s of planSlots(50, { rand: seeded(seed) })) {
      assert.equal(BULLET_DOMAIN.get(s.objective), s.domain, `${s.objective} is not a ${s.domain} objective`);
      assert.ok(Object.hasOwn(TYPE_MIX, s.type), s.type);
      assert.equal(typeof s.scenario, 'boolean');
    }
  }
});

test('no two slots in a domain share an objective (that is what makes parallel requests unique)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const slots = planSlots(50, { rand: seeded(seed) });
    for (const d of Object.keys(DOMAINS)) {
      const objs = slots.filter((s) => s.domain === d).map((s) => s.objective);
      assert.equal(new Set(objs).size, objs.length, `seed ${seed}, ${d}`);
    }
  }
});

test('the objectives are spread over the domain, not always the first few', () => {
  // The start moves from exam to exam (it is drawn from the random generator); here it is stepped explicitly so the test is deterministic.
  const used = new Set();
  for (let start = 0; start < 30; start++) for (const s of planSlots(50, { rand: seeded(start + 1), start })) used.add(s.objective);
  const all = OBJECTIVES.flatMap((g) => g.bullets);
  assert.ok(used.size >= all.length * 0.8, `${used.size} of ${all.length} objectives were ever used`);
});

test('the type mix follows TYPE_MIX over a domain, and about 60% of slots carry a scenario', () => {
  const slots = planSlots(50, { rand: seeded(3) });
  const types = count(slots, 'type');
  assert.ok(Object.keys(types).length >= 3, JSON.stringify(types));
  assert.ok(types.single >= types.multi && types.single >= types.order, JSON.stringify(types));
  const share = slots.filter((s) => s.scenario).length / slots.length;
  assert.ok(Math.abs(share - SCENARIO_SHARE) <= 0.15, `scenario share ${share}`);
});

test('different starts give different objectives, so successive exams are not the same', () => {
  const a = planSlots(50, { rand: seeded(1), start: 0 }).map((s) => s.objective).join('|');
  const b = planSlots(50, { rand: seeded(1), start: 3 }).map((s) => s.objective).join('|');
  assert.notEqual(a, b);
});

test('requests hold at most SLOTS_PER_REQUEST slots, never mix domains, and cover every slot exactly once', () => {
  const slots = planSlots(50, { rand: seeded(5) });
  const reqs = toRequests(slots);
  assert.equal(SLOTS_PER_REQUEST, 2);
  assert.equal(reqs.length, 10);
  assert.ok(reqs.every((r) => r.slots.length >= 1 && r.slots.length <= SLOTS_PER_REQUEST));
  assert.ok(reqs.every((r) => r.slots.every((s) => s.domain === r.domain)));
  assert.equal(reqs.flatMap((r) => r.slots).length, slots.length);
  assert.equal(new Set(reqs.flatMap((r) => r.slots)).size, slots.length, 'no slot appears twice');
});

test('an odd number of slots in a domain leaves one smaller request, not a lost slot', () => {
  const reqs = toRequests([{ domain: 'hunt', type: 'single', objective: 'a', scenario: true }, { domain: 'hunt', type: 'single', objective: 'b', scenario: true }, { domain: 'hunt', type: 'single', objective: 'c', scenario: false }]);
  assert.deepEqual(reqs.map((r) => r.slots.length), [2, 1]);
});

test('small exams: 10 questions give 4 live slots, and the planner never returns more slots than the share allows', () => {
  const slots = planSlots(10, { rand: seeded(2) });
  assert.equal(slots.length, 4);
  assert.ok(planSlots(10, { rand: seeded(2), share: 0 }).length === 0);
});

test('more slots than objectives in a domain is allowed to repeat, and does not crash', () => {
  const objs = pickObjectives('hunt', 50);
  assert.equal(objs.length, 50);
  assert.ok(objs.every((o) => BULLET_DOMAIN.get(o) === 'hunt'));
  assert.equal(pickObjectives('hunt', 0).length, 0);
});

test('pickObjectives gives distinct objectives up to the number the domain has', () => {
  for (const d of Object.keys(DOMAINS)) {
    const have = OBJECTIVES.filter((g) => g.domain === d).flatMap((g) => g.bullets).length;
    const objs = pickObjectives(d, have, 2);
    assert.equal(new Set(objs).size, have, `${d}: all ${have} distinct`);
  }
});
