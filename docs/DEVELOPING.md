# Developing

How it fits together, and how to add a lab, a page, an exam question or a practice attempt. For the threat model see [SECURITY.md](SECURITY.md).

## Goal

Make the *motions* of a Sentinel and Defender workflow learnable by hand without a subscription. Fidelity is a means, not the goal: where real product behaviour matters for the exam (a playbook needs the incident trigger; its identity needs a role on the VM) the sandbox reproduces it, and everywhere else it simplifies. Each lab states how well it is backed by Microsoft documentation in its `verification` note, and nothing has been checked against a live tenant.

## Shape

```
 Browser (vanilla ES modules, no build, no innerHTML)
   │  pages follow the Microsoft Defender portal (Sentinel lives there) plus the Azure portal for IAM and Logic Apps
   ▼
 HTTP layer  server/http/app.js     host and origin checks, CSRF, rate limits, JSON only, static files
   ▼
 Session     server/core/session.js one isolated bundle per browser session:
   │            world (state) + event bus + lab-agent + attack-agent + assistant-agent + the practice exam
   ▼
 perform()   server/sim/actions.js  the ONLY write path: validate, authorize, mutate the world
   ▼
 World       server/sim/world.js    plain in-memory data
```

- **Server-side state.** The simulated tenant lives on the server, per session. The browser only renders views and sends actions, so grading cannot be tampered with from devtools, solutions and locked hints never reach the page, and the tests solve every lab through `perform()` without a browser.
- **Actions, not endpoints per feature.** Every state change is a named action with a validation spec (`server/core/validate.js`). A feature adds an action and a page that calls `ctx.act(name, params)`, never an HTTP route.
- **Views.** `server/http/views.js` turns world state into JSON through an explicit field whitelist, so raw world objects never leave the server.
- **Determinism.** Baseline data comes from a seeded generator (`core/util.js`), so every learner and every test sees the same data. Timestamps are relative to lab start.
- **Limits.** 50 live sessions (least recently used is evicted), 2 hour idle expiry, bounded sizes per world.

### The agents

- **lab-agent** (`agents/lab-agent.js`): `start(labId)` builds a fresh world, runs the lab's `setup`, seeds the allowed scenarios. `status()` re-evaluates every objective. `nextStep()` returns the first incomplete step and the `data-target` the UI highlights. `hint()` reveals one tier at a time. Pure navigation steps (`target` starts with `nav:`) are skipped once a later step is done.
- **attack-agent** (`agents/attack-agent.js`): runs scenario functions that only **append synthetic rows, alerts and incidents** to the in-memory world. No network, process or file activity, and it refuses any scenario the active lab did not allow.
- **assistant-agent** (`agents/assistant-agent.js`): sees only what the lab has unlocked. Offline it keyword-matches `knowledge/concepts.js`; with ICA configured it calls Claude through `core/ica-client.js`.

Agents talk through a per-session event bus (`core/bus.js`); user-visible activity is recorded in a ring buffer the coach panel shows.

### Rule engines

A feature with a documented rule set gets its own pure module, separate from `world.js`: `sim/automation.js` (triggers, conditions, ordering), `sim/detections.js` (frequencies, required columns), `sim/disruption.js`, `sim/identity.js`, `sim/ueba.js`, `sim/mcp.js` and others. Each holds the rules (with the Learn page in a comment), validates with portal-style wording, and is paired with `sim/actions-<feature>.js`. `SimError` (`sim/world.js`) is what a learner can get wrong and is shown verbatim.

### Mini-KQL (`server/sim/kql/engine.js`)

A hand-written lexer, parser and interpreter for the subset the labs need: `where project extend summarize sort take top distinct count union render join` (inner and leftouter), common aggregates and functions. Not supported, with a clear error: `lookup let mv-expand parse evaluate`, other join kinds, regex. Errors mimic Log Analytics wording and suggest corrections. Limits: 4000 characters, depth 40, 3M evaluation steps, 1000 rows. A table can carry `scanCost`, so aggregating a huge raw table times out the way a real one does, which is what the summary-rule lab teaches.

### Tables

`server/sim/tables.js` declares simplified schemas. **Advanced hunting is one page** that queries Defender XDR and Sentinel tables together. A table in `OPTIONAL_TABLES` stays hidden until a lab's scenario calls `enableTables(w, 'Name')`, so a schema pane cannot give an answer away. Tables created at run time, such as a summary rule's output, need nothing here.

## Add a lab

1. Create `server/labs/<id>.js` exporting a default object (copy `suppress-app1.js`, the smallest):

| Field | Purpose |
|---|---|
| `id, title, level, minutes, topics, examObjective` | Catalogue card |
| `sourceQuestions` | `{ set1: [n...], ..., setN: [n...] }`: one key per attempt in `questions/questions.json`. Numbers are per attempt. `node scripts/add-set.mjs` writes them; a test fails if a lab is missing a key or names a question that does not exist |
| `verification` | **Required.** `{ level: 'docs' \| 'partial' \| 'exam', note }`. `docs` = checked against Microsoft Learn, `partial` = right idea but simplified, `exam` = only from a practice question (shown as *Unverified*). Never claim a live-tenant check; a test enforces this |
| `answers` | Optional `[{ id, label, placeholder }]`: fields for a finding the learner types in |
| `brief` | Scenario text. State the requirements, not the answer |
| `scenarios` | Attack scenarios the learner may replay (allowlist) |
| `setup(world)` | Mutate the fresh world. Return scenario ids to seed now |
| `objectives[]` | `{ id, text, check(world), optional? }`: outcome-based, evaluated on every state poll |
| `steps[]` | `{ text, target, done(world) }`: the walkthrough. `target` is a `data-target` string |
| `hints` | `{ [objectiveId]: [tier1, tier2, tier3] }`: concept, then where to look, then near-answer |
| `debrief[]` | Shown on completion: why it works, and the distractors |
| `withholdNotes[]` | Concept-note ids that would spell out the answer (hidden from the assistant until done). Each must name a real note |
| `solution(world)` | `[[actionType, params, { fails: /regex/ }?], ...]`. **Tests only**, never serialised |

2. Register it in `server/labs/index.js` and add its start page to `START` in `web/js/pages/home.js`.
3. Run `npm test`. The suite checks every lab automatically: nothing is met at start, the reference solution completes every required objective, every objective has three hints, and notes exist.

**Good objectives.** Grade the **state**, not the clicks, and allow several routes. Add a least-privilege or too-broad objective when the exam trap is "it works but is over-permissioned". A guard objective ("the malware is still blocked") must be gated on the fix it protects, or it passes by doing nothing. Say *what* must be true, never *how*; a test fails if an objective names the role in the reference solution.

**Investigation labs** declare `answers` and compare the learner's finding with a value computed from the world (`foundEquals` in `labs/helpers.js`). Make the tempting wrong answer fail, and test it.

**A deliberate dead end** in `solution`, `['query.run', {...}, { fails: /timed out/ }]`, asserts a step fails for exactly that reason.

## Add an action, a page, a scenario

**Action** (`server/sim/actions.js` or an `actions-<feature>.js` merged into it):

```js
'sentinel.exampleThing': {
  spec: { incidentId: idSpec(), note: { type: 'string', max: 200 } },   // validated, unknown keys dropped
  run({ w }, p) { /* mutate w; throw new SimError('message') for learner errors */ return {}; },
},
```

**Page:** `web/js/pages/<name>.js` exporting `async render(host, param)`, built only with `h()` from `dom.js`. Register the route in `PAGES` in `web/js/main.js` and a menu entry in `web/js/nav.js`. Give controls a `data-target` (`btn:…`, `nav:…`, `row:…`) so the coach can highlight them. Read data with `ctx.view('<name>')` (add the whitelist to `views.js`), write with `ctx.act(type, params)`.

**Scenario** (`server/attacks/scenarios.js`): a function that appends synthetic records or raises an alert or incident. No I/O, RFC 5737 addresses, `contoso.com`. Add its id to a lab's `scenarios`.

**Front-end guardrails** (`test/web-static.test.js`): no `innerHTML`, `eval`, web storage, inline styles or external origins. Use CSS classes.

## Add a practice attempt

Save the pasted results page (50 questions) as a text file, then:

```bash
node scripts/add-set.mjs path/to/attempt.txt          # dry run: new questions, misses, and new questions with no lab
node scripts/add-set.mjs path/to/attempt.txt --write  # adds it to questions/questions.json and every lab's sourceQuestions
npm run progress                                      # accuracy, and the questions still wrong
npm run coverage                                      # questions with no lab, by topic
```

A question matches an existing one when 95% of their distinct words are shared; otherwise it becomes a new question. A new question needs a lab, or a topic in `BACKLOG` in `scripts/coverage.mjs` (a test fails otherwise, and also when a backlog entry is stale). Then update `sc200-study-guide.md` from `npm run progress`.

`questions/questions.json` holds each distinct question once: stem, every correct answer, explanation, objective where given, the wrong options when the source listed them (rare), the labs that practise it, and every attempt (set, number, result, what you answered). The raw pasted pages are not kept; they are in git history.

## Add practice-exam questions

Questions live in `server/exam/bank/*.js` (one default-exported array per file, registered in `bank/index.js`). The format is documented at the top of `server/exam/schema.js`; use `ok()`, `no()` and `st()` from `bank/dsl.js`. Four types: `single`, `multi` (the stem says "two" or "three" and `select` matches), `order` (list the steps in the **correct** order; the builder shuffles) and `dropdown` (`{{a}}` blanks in a `template`; also Yes/No tables and KQL with `code: true`).

- `objective` must be one of the skills-measured bullets in `server/exam/objectives.js`, copied exactly. Put the facts a question needs in the `scenario`.
- **Every option needs a `why`, the right one too, and so does every ordering step.** After submitting, each choice shows its own explanation, so the right one says why it is right and a wrong one says why it is wrong; a step says why it belongs at that position. `explanation` is a short summary of the whole question. The bank will not load if one is missing.
- **Where the reasons live.** A wrong option carries its `why` in the question file. The reasons for right options, ordering steps and Yes/No blanks are in `bank/reasons-*.js`, keyed by question id and merged by `bank/index.js`, which refuses a reason with a typo'd option text, a blank that does not exist, the wrong number of step reasons, a reason under 15 characters, or reasons for a question that is not in the bank.
- **Write each reason as that choice's own verdict.** In a Yes/No statement the right and the wrong side must not show the same sentence: one confirms why it is true or false, the other says what is wrong with picking it. A test flags pairs that read almost alike.
- Use `source: 'setN:QM'` when a question is adapted from a practice attempt. Those record only the right answer, so you write the distractors.
- Add `labId` when a lab practises the topic.

**Answer shape must not reveal the answer.** The bank refuses to load if it does. Write every option in a set at about the same length, grammar and punctuation. Do not make the correct one the longest, the most detailed, or the only one with a comma, "and", brackets or digits. Do not overcorrect either: across the bank the correct option must be longest about 25% of the time and shortest about 25% (each length rank within 9 points), because "never the longest" is as guessable as "always the longest". Decide the target rank first and rotate it, then size the distractors around the answer. Put specifics in the scenario, not in the answer. No "all of the above" or "both A and B", and no distinctive stem words repeated more in the correct option. Short product names cannot be padded.

**Sources.** The Sources card comes from the question's `objective` via `OBJECTIVE_REFS` in `server/exam/references.js` (a question can name tighter pages with `refs`). Add a page to `CATALOG` with the page's real title, then run `node scripts/check-refs.mjs` (needs the network): it fails on a 404 and reports redirects. A redirect to a generic page means the specific page is gone.

**Live questions and the tutor** use `server/agents/exam-agent.js` and `exam-tutor.js` through `core/ica-client.js`. Generated questions pass the same validator or are discarded; the tutor can only be reached after a question is submitted. `node --env-file=.env scripts/probe-ica.mjs <models|raw|tutor|generate>` checks the real service.

## Add a study note for the assistant

`server/knowledge/concepts.js`: an original paraphrase (do not paste Microsoft text) with trigger `keys`.

## Tests

- `npm test`: unit, integration, security and front-end guardrail tests.
- `npm run e2e`: every browser script in turn (needs Edge or Chrome; set `BROWSER` to a path if it is elsewhere). They drive the real UI and cover every lab and the exam.

Browser scripts (`scripts/e2e-lib.mjs`): pages re-render after many actions (`ctx.reloadPage()` shows "Loading…" first), so a script that finds a control and acts on it in a second step can hit a half-rendered page.

- `click` and `setValue` wait for the control and for no `.loading` element.
- When a step needs several controls, find and act in **one** `evalJs` and retry until it returns true (`untilTrue` in `e2e-labs3.mjs`).
- Use `okSoon(expr, message)` for content that appears after an action.
- Call `b.open('#/home')` first; the harness starts on a blank page.
- The harness ends the process when a run finishes, so one scenario per run.
- Never put a regular expression in a shell heredoc or a JS template literal: backslashes are dropped (`\s` becomes `s`, `\d` becomes `d`). Write the file with an editor tool and check the text after any scripted edit.
