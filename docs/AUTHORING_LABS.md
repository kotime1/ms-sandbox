# Authoring guide

## Add a lab

1. Create `server/labs/<id>.js` exporting a default object (copy `suppress-app1.js`, the smallest):

| Field | Purpose |
|---|---|
| `id, title, level, minutes, topics, examObjective` | Catalogue card |
| `sourceQuestions` | `{ set1: [n...], set2: [n...] }`. Numbers are per question set (the sets overlap, so a bare number would be ambiguous). `node scripts/coverage.mjs` turns these into `docs/COVERAGE.md`; a test fails if you forget |
| `answers` | Optional `[{ id, label, placeholder }]`: fields the learner types a finding into (see *Investigation labs*) |
| `brief` | Scenario text. State the *requirements*, not the answer |
| `scenarios` | Attack scenarios the learner may replay (allowlist) |
| `setup(world)` | Mutate the fresh world (add resources...). Return scenario ids to seed now |
| `objectives[]` | `{ id, text, check(world), optional? }`: **outcome-based**, evaluated on every state poll |
| `steps[]` | `{ text, target, done(world) }`: the walkthrough; `target` is a `data-target` string (or `(world) => string`) |
| `hints` | `{ [objectiveId]: [tier1, tier2, tier3] }`: concept → where to look → near-answer |
| `debrief[]` | Shown on completion: *why* it works, and the distractors |
| `withholdNotes[]` | Concept-note ids that would spell out the answer (hidden from the assistant until done) |
| `solution(world)` | `[[actionType, params], ...]`; **tests only**, never serialised |

2. Register it in `server/labs/index.js` and add a start page in `START` in `web/js/pages/home.js`.
3. Run `npm test`. The suite automatically checks every lab: nothing is met at start, the reference solution completes all required objectives, every objective has 3 hints.

### Writing good objectives

- Grade the **state**, not the clicks. Allow several routes.
- Add a *least-privilege* or *too-broad* objective when the exam trap is "it works but is over-permissioned". Add a test that the sloppy solution fails it.
- A required objective must not be met at the start (the suite enforces this).

### Guard objectives must not pass by doing nothing

An objective like "the malware is still blocked" is true before the learner acts. Gate it on the fix it protects (`check: (w) => Boolean(allowEntry(w)) && mal(w).blocked`). The suite fails any lab where a required objective is met at the start.

### Objectives describe outcomes, never the mechanism

Objective text is shown up front, and the assistant can echo it. Say *what* must be true ("Play1 becomes selectable"), not *how* ("the Azure Security Insights principal has Automation Contributor"). A test fails if an objective names the role that appears in the lab's reference solution.

### Investigation labs (facts, not state)

Declare `answers`, check with `foundEquals(w, 'id', expected)` from `labs/helpers.js`, and compute `expected` from the world, not a literal where you can. Make the wrong-but-tempting answer fail (a count that includes the Android phone, a user filter that over-reports) and add a test for it in `test/labs2.test.js`.

### A deliberate dead end in `solution`

`['query.run', {...}, { fails: /timed out/ }]` asserts the step fails for exactly that reason. Use it when the lab's first objective is to *reproduce* a problem.

### Adding a data table

In `server/sim/tables.js`: add the schema to `SCHEMAS`, seed rows in `seedBaseline` (or in a scenario), and list the table under a surface in `SURFACES` (`sentinel` = Logs blade, `defender` = Advanced hunting). Using a table from the wrong surface fails, as in the real portals.

If the table would give away a lab's answer or clutter other labs, make it **optional**: add it to `OPTIONAL_TABLES` and have the lab's scenario call `enableTables(w, 'Name')`. To make a table expensive to aggregate (a "too big to query" lab), set `scanCost` on it in the scenario. Tables created at runtime, such as summary-rule outputs, need nothing here.

## Add an attack scenario

`server/attacks/scenarios.js`: a function that appends synthetic records or calls `raiseSentinelIncident` / `raiseDefenderAlert`. Rules: no I/O, RFC 5737 IPs, `contoso.com`, idempotent if possible. Add its id to a lab's `scenarios`.

## Add an action (a new button's effect)

In `server/sim/actions.js` add an entry to `ACTIONS`:

```js
'sentinel.exampleThing': {
  spec: { incidentId: idSpec(), note: { type: 'string', max: 200 } },   // validated, unknown keys dropped
  run({ w }, p) { /* mutate w; throw new SimError('message') for learner-facing errors */ return {}; },
},
```

Throw `SimError` for things a learner can get wrong (shown verbatim). Any other exception is logged and shown as a generic message.

## Add a page

1. `web/js/pages/<name>.js` exporting `async render(host, param)`; build DOM with `h()` only.
2. Register the route in `PAGES` (and `NAV`) in `web/js/main.js`.
3. Give clickable controls a `data-target` such as `btn:something` / `nav:area/page` / `row:Name` so the coach can highlight them.
4. Read data via `ctx.view('<name>')` (add the whitelist in `server/http/views.js`), write via `ctx.act(type, params)`.

## Add a study note for the assistant

`server/knowledge/concepts.js`: original paraphrase (do not paste Microsoft text), with trigger `keys`.
