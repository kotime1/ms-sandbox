# Authoring guide

## Add a lab

1. Create `server/labs/<id>.js` exporting a default object (copy `suppress-app1.js`, the smallest):

| Field | Purpose |
|---|---|
| `id, title, level, minutes, topics, examObjective` | Catalogue card |
| `sourceQuestions` | `{ set1: [n...], ..., setN: [n...] }` (one key per file in `question_sets/`). Numbers are per question set (the sets overlap, so a bare number would be ambiguous). A new question file needs its key added to every lab and to `SETS` in `scripts/coverage.mjs`; the tests read `question_sets/` themselves, so a lab missing the key fails. `node scripts/coverage.mjs` turns these into `docs/COVERAGE.md`; a test fails if you forget |
| `verification` | **Required.** `{ level: 'docs' | 'partial' | 'exam', note }`. Be honest: `docs` = checked against Microsoft Learn, `partial` = right idea but simplified, `exam` = only from a practice question (shown as *Unverified*). Never claim a live-tenant check. A test enforces this |
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

In `server/sim/tables.js`: add the schema to `SCHEMAS`, seed rows in `seedBaseline` (or in a scenario), and list it in `SURFACES` so the schema pane groups it under the right source. Every table is queryable from the one Advanced hunting page.

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

## Add a feature with its own rules (an engine)

When a feature has a documented rule set (automation rules, custom detections), do not put the rules inline in an action:

1. Put the **pure rules** in `server/sim/<feature>.js`: constants copied from the docs (with the page and date in a comment), a `validate…()` that throws `SimError` with portal-style wording, and matching/ordering functions.
2. Put the **run-time effect** that mutates the world next to `world.js` helpers, and the **actions** in `server/sim/actions-<feature>.js` using nested validator specs (`{ type: 'object', shape }`).
3. Expose what the UI needs (valid options, availability, "why not") from a **preview** or view, so the browser never re-implements the rules.
4. Test each documented behavior and each "plausible but wrong" path, and record the source and status in `docs/FIDELITY.md`.

## Add a page

1. `web/js/pages/<name>.js` exporting `async render(host, param)`; build DOM with `h()` only.
2. Register the route in `PAGES` (and `NAV`) in `web/js/main.js`.
3. Give clickable controls a `data-target` such as `btn:something` / `nav:area/page` / `row:Name` so the coach can highlight them.
4. Read data via `ctx.view('<name>')` (add the whitelist in `server/http/views.js`), write via `ctx.act(type, params)`.

## Add practice-exam questions

Questions live in `server/exam/bank/*.js` (one default-exported array per file, registered in `bank/index.js`). The format is documented at the top of `server/exam/schema.js`; use the `ok()`, `no()` and `st()` helpers from `bank/dsl.js`. Four types: `single`, `multi` (stem says "two"/"three" and `select` matches), `order` (list the steps in the CORRECT order; the builder shuffles) and `dropdown` (`{{a}}` blanks in a `template`; also used for Yes/No tables and KQL with `code: true`).

- `objective` must be one of the skills-measured bullets in `server/exam/objectives.js`, copied exactly (a test fails otherwise). Put the facts a question needs in the `scenario`.
- Every wrong option needs a `why` (what the learner reads if they pick it). `explanation` says why the right answer is right.
- Use `source: 'setN:QM'` when a question is adapted from `question_sets/`. Those files list only the right answer, not the wrong options, so you must write the distractors yourself.
- Add `labId` when a sandbox lab practises the topic, so the feedback links to it.

**Answer shape must not reveal the answer.** The bank refuses to load if it does, and `node --test test/exam.test.js` checks it. The rules, and why:

- Write every option in a set at about the same length, in the same grammar, with the same punctuation. Do not make the correct one the longest, the most detailed, the only one with a comma, "and", brackets or digits, or the only one without an absolute word (always, never, only, must).
- Do not overcorrect either. Across the whole bank the correct option must be the longest about 25% of the time, the shortest about 25%, and so on (each rank within 9 points). A bank where the answer is "never the longest" is just as guessable. Decide the target rank first and rotate it; then size the distractors around the answer, not the other way round.
- Put specifics in the scenario, not in the answer. If the correct option needs a qualifier ("on the resource group"), give each distractor an equally concrete qualifier.
- No "all of the above", "none of the above" or "both A and B". Do not repeat distinctive words from the stem more in the correct option than in the wrong ones.
- Short options that are product names (tables, roles, record types) cannot be padded; the length-spread rule only applies to phrase-length options.
- Fixing one question changes the bank-level histogram. Run `node scripts/e2e-exam.mjs` for the UI, and `node --test test/exam.test.js` for the rules.

### Sources for exam questions

The Sources card is chosen by the question's `objective` from `OBJECTIVE_REFS` in `server/exam/references.js`; a question can name tighter pages with `refs: ['id', ...]`. Add a page to `CATALOG` (id, the page's own title, path under `learn.microsoft.com/en-us/`), then run `node scripts/check-refs.mjs` (needs the network): it fails on a 404 and reports redirects. A redirect to a generic page means the specific page no longer exists, so pick another. A test requires every skills-measured bullet to have references, every id to resolve, and every catalogue page to be used. Use the page's real title, not a paraphrase.

## Add a study note for the assistant

`server/knowledge/concepts.js`: original paraphrase (do not paste Microsoft text), with trigger `keys`.

## Browser tests and timing

Pages re-render after many actions (`ctx.reloadPage()` shows "Loading…" first), so a script that finds a control and then acts on it in a second step can hit a half-rendered page. In `scripts/e2e-lib.mjs`:

- `click`, `setValue` wait for the control and for no `.loading` element. Do not write a bare `evalJs` that queries a control and then sets it.
- When a step needs several controls (set a window, tick boxes, fill and submit), do the find-and-act in **one** `evalJs` and retry until it returns true (see `untilTrue` in `e2e-labs3.mjs`).
- Use `okSoon(expr, message)` for assertions on page content that appears after an action. A one-shot read races the re-render.
- Never pass a regular expression through a shell heredoc or a JS template literal: backslashes are silently dropped (`s` becomes `s`). Write the script with the Write tool.

## Tracking your progress

`node scripts/progress.mjs` reads the answer markers in `question_sets/` and prints, for each set, how many you got fully right, how many were new to you versus repeats, how many of the repeats you had missed before are now right, and the questions still wrong on the latest attempt (with the lab for each). A question is fully correct only if every answer you gave is marked correct. Use it to refresh `sc200-study-guide.md` after adding a set.
