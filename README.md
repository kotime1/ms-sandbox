# SC-200 Sandbox

A mock lab environment for studying the Microsoft SC-200 (Security Operations Analyst) exam and similar ones, with no Azure subscription needed.

> **This is not a replica of Microsoft Sentinel.** It mimics the *environment* (a single Microsoft Defender portal, where Sentinel now lives, plus the Azure portal for IAM and Logic Apps): the portals, the menus, the buttons, the error messages, the order you click things in. The aim is kinesthetic learning. Your hands learn the route, and the grading checks that you understood *why*. Schemas, KQL and RBAC are deliberately simplified; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#fidelity-what-is-and-is-not-simulated).

## Quick start

Requires Node.js 22+ (developed on 24). There are **no dependencies to install**.

```bash
npm start            # http://127.0.0.1:3000
npm test                         # 162 unit, integration and security tests
node scripts/e2e.mjs             # plays iteration-1 labs through the real UI in headless Edge/Chrome (optional)
node scripts/e2e-labs2.mjs       # plays the iteration-2 labs the same way (optional)
node scripts/e2e-wizards.mjs     # drives the custom detection wizard and the automation rule panel (optional)
node scripts/coverage.mjs        # regenerates docs/COVERAGE.md (a test fails if it is stale)
node scripts/screenshot.mjs      # saves PNGs of key pages to ./screenshots (optional)
```

Open the page, pick a lab, and work through it in the simulated portals. The right-hand **Lab coach** panel shows the brief, your objectives, a gold-pulsing highlight on the next control to use, graded hints, and the assistant.

## The three agents

| Agent | Role | Where |
|---|---|---|
| **lab-agent** | Sets up each lab, knows which control comes next, grades the *state* of the environment, serves hints (3 tiers per objective) | [server/agents/lab-agent.js](server/agents/lab-agent.js) |
| **attack-agent** | Writes synthetic attacker activity (sign-ins, alerts, incidents, Graph calls) into the sandbox. Used by lab setup and the "Replay" buttons. Only runs scenarios the active lab allows | [server/agents/attack-agent.js](server/agents/attack-agent.js) |
| **assistant-agent** | Answers questions during a lab. Works offline from built-in notes; uses Claude only if you set `ANTHROPIC_API_KEY`. Coaches, does not hand over the answer | [server/agents/assistant-agent.js](server/agents/assistant-agent.js) |

They talk over a per-session event bus ([server/core/bus.js](server/core/bus.js)); the "Agent activity" drawer in the coach panel shows it.

## Labs

14 labs, inspired by (not copies of) the practice questions in [question_sets/](question_sets/). The two sets overlap heavily (27 of set 2's 50 questions repeat set 1 word for word), so one lab usually serves several questions. **[docs/COVERAGE.md](docs/COVERAGE.md) maps every question to a lab and lists what is still missing.**

| Lab | Level | Practices |
|---|---|---|
| Silence App1 without going blind | Beginner | Defender suppression rules, tuning |
| Unblock LOB1, keep blocking malware | Beginner | Tenant Allow/Block List, indicators and their targets |
| The devices that never raise alerts | Beginner | Device approval |
| Least privilege for the SOC | Beginner | Sentinel roles, RBAC scope |
| Queries that run when you open Hunting | Beginner | Hunting favorites |
| The containment playbook that will not run | Intermediate | Playbook trigger, managed identity, RBAC on the target |
| The playbook that is not in the list | Intermediate | Letting Sentinel itself run a playbook (resource-group scope) |
| Which incidents can you actually investigate? | Intermediate | Rule types, entity mapping |
| Hunt it, then make it automatic | Intermediate | Advanced hunting, custom detections, isolate |
| Three questions for the logs | Intermediate | KQL: union, AzureActivity, Graph logs |
| Join behaviours to their entities | Intermediate | UEBA behaviours, KQL `join` |
| Queries that time out | Intermediate | Summary rules for high-volume tables |
| Triage WS-23 | Intermediate | Device timeline, investigation package, deep analysis, indicators, response restraint |
| Follow one token through Graph | Advanced | Graph activity logs, sign-in correlation |

Each lab shows a **verification level**: *Matches Microsoft Learn*, *Simplified vs Learn*, or *Unverified* (comes from a practice question only). Nothing has been checked against a live tenant; see [docs/FIDELITY.md](docs/FIDELITY.md).

Labs are graded on the **outcome** (what changed in the environment), not the click order, so there are many valid paths, and "works but too broad" fails the least-privilege objectives on purpose. Investigation labs ask you to *report a finding* (who, how many); the expected value stays on the server.

## Optional: Claude-powered assistant

```bash
cp .env.example .env     # add ANTHROPIC_API_KEY=...
node --env-file=.env server/index.js
```

The key is read from the environment only. It is never sent to the browser or logged. The model only sees the lab brief, objectives and hints *you already unlocked*; never the solution. Set `ASSISTANT_PROVIDER=local` to force offline mode.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it fits together, fidelity limits
- [docs/SECURITY.md](docs/SECURITY.md): threat model and every control, with the tests that prove it
- [docs/FIDELITY.md](docs/FIDELITY.md): **how closely each behavior matches Microsoft Learn**, what was wrong, and what is still simplified
- [docs/COVERAGE.md](docs/COVERAGE.md): which practice question maps to which lab, duplicates between sets, and the backlog (generated)
- [docs/AUTHORING_LABS.md](docs/AUTHORING_LABS.md): add a lab, scenario, action or page
- [docs/CHANGELOG.md](docs/CHANGELOG.md): **summary of changes per iteration (updated every iteration)**

## Project rule: docs move with the code

Every iteration must update the docs and add an entry to [docs/CHANGELOG.md](docs/CHANGELOG.md) before it is considered done.

## Layout

```
server/  core/ (bus, session, validation)   sim/ (world, actions, KQL engine, RBAC, tables)
         agents/  attacks/  labs/  knowledge/  http/
web/     index.html  css/  js/ (dom, api, main, pages/, components/)
test/    kql, labs, labs2 (trap paths), http (security), web-static (front-end guardrails)
scripts/ e2e-lib.mjs  e2e.mjs  e2e-labs2.mjs  e2e-wizards.mjs  coverage.mjs  screenshot.mjs
question_sets/  set1.txt  set2.txt   (the source practice questions)
docs/
```
