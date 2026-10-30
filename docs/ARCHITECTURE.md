# Architecture

## Goal

Make the *motions* of a Sentinel/Defender workflow learnable by hand without a subscription. Fidelity is a means, not the goal: where the real product behaviour matters for the exam (a playbook needs the incident trigger; the identity needs a role on the VM) the sandbox reproduces it faithfully, and everywhere else it simplifies.

## Shape

```
 Browser (vanilla ES modules, no build, no innerHTML)
   │  pages follow the Microsoft Defender portal (Sentinel lives there) plus the Azure portal for IAM/Logic Apps; every button = one API action
   ▼
 HTTP layer  server/http/app.js     host/origin/CSRF checks, rate limits, JSON only, static files
   │
   ▼
 Session     server/core/session.js one isolated bundle per browser session:
   │            world (state) + bus + lab-agent + attack-agent + assistant-agent
   ▼
 perform()   server/sim/actions.js  the ONLY write path: validate → authorize → mutate world
   ▼
 World       server/sim/world.js    plain in-memory data + engine functions
                                    (incidents, automation rules, playbook runs, suppression, detections)
```

### Why server-side state

The simulated tenant lives on the server, per session. The browser only renders views and sends actions. This means: grading cannot be tampered with from devtools, secrets (solutions, hints not yet unlocked) never reach the page, and the same engine is testable without a browser (the tests solve every lab through `perform()`).

### Rule engines

Two feature areas have their own engine modules, separate from `world.js`, because each has real logic and a documented rule set:

- `sim/automation.js`: triggers, the per-trigger condition and operator tables, validation, ordering, expiry and matching (pure functions). The run-time part (`runAutomation`, `updateIncident`) lives in `world.js` because it mutates incidents and runs playbooks. Incident changes made through `sentinel.updateIncident` fire the update trigger, as in the real service.
- `sim/detections.js`: frequencies and lookback, Continuous (NRT) eligibility, the output-column rules for each action, dynamic `{{Column}}` text, scope, de-duplication and the 150-alert cap (pure functions). `runDetections` in `world.js` executes them.
- `sim/world-errors.js` holds `SimError` so engine modules can throw it without a circular import of `world.js`.

The UI mirrors them: `components/wizard.js` is a generic stepper, `detection-wizard.js` is the six-step wizard, `automation-panel.js` is the single-panel rule editor. The wizard asks the server to **preview** the query (`defender.previewDetection`) so which actions and frequencies are available is decided by the server's rules, not duplicated in the browser.

### Splitting by iteration

Actions and scenarios added after iteration 1 live in `server/sim/actions-extra.js`, `actions-automation.js`, `actions-detections.js` and `server/attacks/scenarios-extra.js` and are merged in (`Object.assign`) by the original modules. This keeps each file reviewable. Nothing depends on the split; fold them together if you prefer.

### Actions, not endpoints per feature

Every state change is a named action in `ACTIONS` with a validation spec (`server/core/validate.js`). Adding a feature never adds an HTTP route; it adds an action plus a page that calls `ctx.act(name, params)`. Unknown names are rejected via `Object.hasOwn`.

### Views

`server/http/views.js` converts world state to JSON with an explicit field whitelist. Raw world objects (RNG state, seen-sets, internals) never leave the server.

## The agents

- **lab-agent** (`agents/lab-agent.js`): `start(labId)` builds a fresh World, runs `lab.setup(world)`, tells the attack-agent which scenarios are allowed and seeds the initial ones. `status()` re-evaluates every objective's `check(world)`. `nextStep()` returns the first incomplete step and its `target`, a `data-target` string the UI highlights. `hint()` reveals one tier at a time and records usage.
- **attack-agent** (`agents/attack-agent.js`): runs scenario functions from `attacks/scenarios.js`. Scenarios only **append synthetic rows/alerts/incidents** to the in-memory world; there is no network, process or file activity. It refuses any scenario the active lab did not allow.
- **assistant-agent** (`agents/assistant-agent.js`): reads only `lab.context` from the lab-agent. Provider is `local` (keyword-matched notes in `knowledge/concepts.js`) or `claude` (Messages API). See [SECURITY.md](SECURITY.md#assistant-agent).

Agents communicate through `EventBus.request()/handle()` (RPC) and `emit()/on()`; user-visible activity is recorded in a ring buffer (`bus.record`) that the UI shows.

## Mini-KQL (`server/sim/kql/engine.js`)

A hand-written lexer → parser → AST interpreter. Supported: `where/filter`, `project`, `project-away/keep`, `extend`, `summarize` (`count countif dcount count_distinct sum avg min max make_set make_list arg_max arg_min`), `sort/order by`, `take/limit`, `top`, `distinct`, `count`, `union`, `render`; operators `== != =~ !~ < > <= >= contains has startswith endswith in between` (+ `!` forms), `and/or`, arithmetic; functions like `ago bin now strlen tolower toupper tostring toint isempty isnotempty iff coalesce strcat substring round`.

`join` (iteration 2) supports `kind=inner|leftouter`, a parenthesised right-hand sub-query, and `on Col` or `on $left.A == $right.B`. A right-side column whose name clashes gets a numeric suffix (`BehaviorId1`), as in real Kusto.

Not supported on purpose (clear error): `lookup`, `let`, `mv-expand`, `parse`, `evaluate`, other join kinds, regex. Errors mimic Log Analytics wording and suggest corrections ("Did you mean 'IPAddress'?").

Safety limits: 4000-char queries, nesting depth 40, 3M evaluation steps, 1000 result rows, 50k groups, 100k join rows; no `eval`; own-property lookups only.

**Scan cost.** A table can carry a `scanCost`. Reading it charges `rows × scanCost` evaluation steps up front, so aggregating a huge raw table "times out" exactly as it does on a real high-volume custom table, while a small summary table does not. This is what makes the summary-rule lab teach something. Backend jobs (a summary rule's own query) run with `noScanCost`.

## Tables: one hunting page, optional tables, runtime tables

`server/sim/tables.js` declares the schemas. **Advanced hunting is one page** that queries Defender XDR tables and Sentinel workspace tables together (the docs call it "unified advanced hunting for SIEM, Defender, and the data lake"). `SURFACES` survives only to group the schema pane by source ("Microsoft Sentinel" / "Microsoft Defender XDR"); the `surface` argument on `query.run` is accepted for backward compatibility and ignored.

Some tables are **optional** (`OPTIONAL_TABLES`): hidden from the schema browser and from queries until a lab's scenario calls `enableTables(w, ...)`. This keeps labs from giving away their answer through the schema (a lab about "which table has behaviour titles" would otherwise list it up front) and keeps unrelated labs uncluttered. **Runtime tables** (a summary rule's destination) are created by the learner and become visible through `visibleTables()`.

## Findings

Some objectives are facts, not state changes ("who edited the rule", "how many requests"). These use the `findings.report` action. The learner types an answer into an answer box; the lab's `check` compares it with the server's own data, and the expected value is never sent to the browser. A lab opts in with `answers: [{ id, label }]`.

## The coach and walkthrough steps

`nextStep()` returns the first incomplete step. **Pure navigation steps** (`target` starts with `nav:`) are skippable once any later step is done, so a learner who reached the right page another way is not told to go back. Steps that change the environment are never skipped.

## Fidelity: what is and is not simulated

| Area | Faithful where it teaches | Simplified |
|---|---|---|
| Playbooks | Trigger type decides availability; managed identity required; RBAC on the *target* decides success; `AuthorizationFailed` wording. Automation rules run as the Azure Security Insights identity, which needs a role on the playbook's **resource group** (a role on the playbook itself does not count) | Playbook actions are a fixed list per lab |
| Allow/Block, indicators | An allow entry releases a file immediately; an indicator is Inactive until it has a valid target (derived, never stored) | One tenant, device groups are a fixed pair |
| Device onboarding | Devices can be listed but unapproved, and then report nothing | No real sensor |
| Summary rules | Aggregating the raw table times out; the rule writes a new `_CL` table that queries instantly | The rule runs once on save, not on a schedule |
| RBAC | Built-in role descriptions, scope inheritance, privileged flag | Action model is coarse (`vm.restart`, `playbook.run`...), not the full RBAC action set |
| Suppression rules | Title + IOC + scope; apply to *future* alerts | Only process IOC; one alert source |
| Custom detections | Required columns (`Timestamp`, `ReportId`, entity column); isolate needs `DeviceId` | Runs on save/scenario instead of on a schedule |
| Tables | Real names and the columns labs need | Far fewer columns; synthetic data; RFC 5737 IPs |
| KQL | Operators above | A subset (see above) |

## Determinism

Baseline data is generated from a seeded PRNG (`core/util.js`), so every learner and every test run sees the same dataset. Timestamps are relative to "now" at lab start.

## Limits (resource bounds)

50 live sessions (LRU eviction), 2h idle expiry, 500 incidents/200 role assignments/etc. per world (`world.js` `MAX`), 500-entry action log, 200-entry agent feed.
