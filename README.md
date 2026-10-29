# SC-200 Sandbox

A mock lab environment for studying the Microsoft SC-200 (Security Operations Analyst) exam and similar ones, with no Azure subscription needed.

> **This is not a replica of Microsoft Sentinel.** It mimics the *environment*: the portals, the menus, the buttons, the error messages, the order you click things in. The aim is kinesthetic learning. Your hands learn the route, and the grading checks that you understood *why*. Schemas, KQL and RBAC are deliberately simplified; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#fidelity-what-is-and-is-not-simulated).

## Quick start

Requires Node.js 22+ (developed on 24). There are **no dependencies to install**.

```bash
npm start            # http://127.0.0.1:3000
npm test             # 72 unit/integration/security tests
node scripts/e2e.mjs # drives the real UI in headless Edge/Chrome (optional)
```

Open the page, pick a lab, and work through it in the simulated portals. The right-hand **Lab coach** panel shows the brief, your objectives, a gold-pulsing highlight on the next control to use, graded hints, and the assistant.

## The three agents

| Agent | Role | Where |
|---|---|---|
| **lab-agent** | Sets up each lab, knows which control comes next, grades the *state* of the environment, serves hints (3 tiers per objective) | [server/agents/lab-agent.js](server/agents/lab-agent.js) |
| **attack-agent** | Writes synthetic attacker activity (sign-ins, alerts, incidents, Graph calls) into the sandbox. Used by lab setup and the "Replay" buttons. Only runs scenarios the active lab allows | [server/agents/attack-agent.js](server/agents/attack-agent.js) |
| **assistant-agent** | Answers questions during a lab. Works offline from built-in notes; uses Claude only if you set `ANTHROPIC_API_KEY`. Coaches, does not hand over the answer | [server/agents/assistant-agent.js](server/agents/assistant-agent.js) |

They talk over a per-session event bus ([server/core/bus.js](server/core/bus.js)); the "Agent activity" drawer in the coach panel shows it.

## Labs (iteration 1)

Inspired by (not copies of) the practice questions in `questions.txt`.

| Lab | Level | Practices | Source Qs |
|---|---|---|---|
| Silence App1 without going blind | Beginner | Defender suppression rules, tuning | 3, 25 |
| Least privilege for the SOC | Beginner | Sentinel roles, RBAC scope | 8, 9 |
| The containment playbook that will not run | Intermediate | Playbook triggers, managed identity, RBAC, automation rules | 5, 6, 7, 18 |
| Hunt it, then make it automatic | Intermediate | Advanced hunting, custom detections, isolate action | 16, 40, 41, 42 |
| Three questions for the logs | Intermediate | KQL: union, AzureActivity, Graph logs | 38, 39, 44, 47, 48 |

Labs are graded on the **outcome** (what changed in the environment), not the click order, so there are many valid paths, and "works but too broad" fails the least-privilege objectives on purpose.

## Optional: Claude-powered assistant

```bash
cp .env.example .env     # add ANTHROPIC_API_KEY=...
node --env-file=.env server/index.js
```

The key is read from the environment only. It is never sent to the browser or logged. The model only sees the lab brief, objectives and hints *you already unlocked*; never the solution. Set `ASSISTANT_PROVIDER=local` to force offline mode.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it fits together, fidelity limits
- [docs/SECURITY.md](docs/SECURITY.md): threat model and every control, with the tests that prove it
- [docs/AUTHORING_LABS.md](docs/AUTHORING_LABS.md): add a lab, scenario, action or page
- [docs/CHANGELOG.md](docs/CHANGELOG.md): **summary of changes per iteration (updated every iteration)**

## Project rule: docs move with the code

Every iteration must update the docs and add an entry to [docs/CHANGELOG.md](docs/CHANGELOG.md) before it is considered done.

## Layout

```
server/  core/ (bus, session, validation)   sim/ (world, actions, KQL engine, RBAC, tables)
         agents/  attacks/  labs/  knowledge/  http/
web/     index.html  css/  js/ (dom, api, main, pages/, components/)
test/    kql, labs, http (security), web-static (front-end guardrails)
scripts/ e2e.mjs
docs/
```
