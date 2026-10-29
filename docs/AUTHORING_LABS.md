# Authoring guide

## Add a lab

1. Create `server/labs/<id>.js` exporting a default object (copy `suppress-app1.js`, the smallest):

| Field | Purpose |
|---|---|
| `id, title, level, minutes, topics, examObjective, sourceQuestions` | Catalogue card |
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

### Adding a data table

`server/sim/tables.js`: add the schema to `SCHEMAS`, seed rows in `seedBaseline`, and list it under a surface in `SURFACES` (`sentinel` = Logs blade, `defender` = Advanced hunting). Using a table from the wrong surface fails, as in the real portals.

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
