# SC-200 Sandbox

A mock lab environment for studying the Microsoft SC-200 (Security Operations Analyst) exam and similar ones, with no Azure subscription needed.

> **This is not a replica of Microsoft Sentinel.** It mimics the *environment* (a single Microsoft Defender portal, where Sentinel now lives, plus the Azure portal for IAM and Logic Apps): the portals, the menus, the buttons, the error messages, the order you click things in. The aim is kinesthetic learning. Your hands learn the route, and the grading checks that you understood *why*. Schemas, KQL and RBAC are deliberately simplified; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#fidelity-what-is-and-is-not-simulated).

## Quick start

Requires Node.js 22+ (developed on 24). There are **no dependencies to install**.

```bash
npm start            # http://127.0.0.1:3000
npm test                         # 318 unit, integration and security tests
node scripts/e2e.mjs             # plays iteration-1 labs through the real UI in headless Edge/Chrome (optional)
node scripts/e2e-labs2.mjs       # plays the iteration-2 labs the same way (optional)
node scripts/e2e-wizards.mjs     # drives the custom detection wizard and the automation rule panel (optional)
node scripts/e2e-labs3.mjs       # drives the set 3 labs through the real UI: ASR, workbooks, connectors, audit... (optional)
node scripts/coverage.mjs        # regenerates docs/COVERAGE.md (a test fails if it is stale)
node scripts/screenshot.mjs      # saves PNGs of key pages to ./screenshots (optional)
```

Open the page, pick a lab, and work through it in the simulated portals. The right-hand **Lab coach** panel shows the brief, your objectives, a gold-pulsing highlight on the next control to use, graded hints, and the assistant.

## The three agents

| Agent | Role | Where |
|---|---|---|
| **lab-agent** | Sets up each lab, knows which control comes next, grades the *state* of the environment, serves hints (3 tiers per objective) | [server/agents/lab-agent.js](server/agents/lab-agent.js) |
| **attack-agent** | Writes synthetic attacker activity (sign-ins, alerts, incidents, Graph calls) into the sandbox. Used by lab setup and the "Replay" buttons. Only runs scenarios the active lab allows | [server/agents/attack-agent.js](server/agents/attack-agent.js) |
| **assistant-agent** | Answers questions during a lab. Works offline from built-in notes; uses Claude (through IBM Consulting Advantage) only if you set `ICA_API_KEY` and `ICA_MODEL`. Coaches, does not hand over the answer | [server/agents/assistant-agent.js](server/agents/assistant-agent.js) |

They talk over a per-session event bus ([server/core/bus.js](server/core/bus.js)); the "Agent activity" drawer in the coach panel shows it.

## Labs

26 labs, inspired by (not copies of) the practice questions in [question_sets/](question_sets/). The three sets overlap heavily (27 of set 2's and 36 of set 3's 50 questions repeat an earlier set word for word), so one lab usually serves several questions. **[docs/COVERAGE.md](docs/COVERAGE.md) maps every question to a lab and lists what is still missing.**

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
| Who turned troubleshooting mode on? | Intermediate | Hunting `DeviceEvents`, `parse_json`, `arg_max` |
| Cut the delay between a sign-in and the alert | Intermediate | NRT vs scheduled analytics rules, ingestion time |
| Email the right people about brute force | Beginner | Email notification rules, device groups, who can change settings |
| Stop email attachments and USB malware | Beginner | Attack surface reduction rules vs exploit protection and controlled folder access |
| Build the SOC manager a workbook | Beginner | Workbook templates, clone, Workbook Contributor |
| Bring SharePoint and a factory app into Sentinel | Intermediate | Microsoft 365 connector, custom table first, data collection rules |
| Search the audit log, keep it for a year | Intermediate | Purview Audit (Standard vs Premium), record types, who can search |
| Get told when a new threat report lands | Beginner | Threat analytics notification rules vs alert and vulnerability rules |
| Firewall logs in, and where did Entra ID Protection go? | Intermediate | CEF via AMA, Linux log forwarder, which table a connector writes to |
| Stop a stolen service account, then find who changed Enterprise Admins | Intermediate | Defender for Identity actions per identity source, identity reports |
| Contain the device and disable the account, automatically | Intermediate | Automatic attack disruption and its prerequisites |
| Why are my on-premises servers missing from the picker? | Beginner | Azure Arc, Azure Monitor Agent, data collection rule picker |

Each lab shows a **verification level**: *Matches Microsoft Learn*, *Simplified vs Learn*, or *Unverified* (comes from a practice question only). Nothing has been checked against a live tenant; see [docs/FIDELITY.md](docs/FIDELITY.md).

Labs are graded on the **outcome** (what changed in the environment), not the click order, so there are many valid paths, and "works but too broad" fails the least-privilege objectives on purpose. Investigation labs ask you to *report a finding* (who, how many); the expected value stays on the server.

## Practice exam

The **Practice exam** tab builds an SC-200-style exam on request (10 to 50 questions, 50 by default). Questions follow the published domain weights (Manage 40–45%, Respond 35–40%, Hunt 20–25%, so 21 / 19 / 10 for 50) and come in four formats: choose one, choose several, put steps in order, and complete dropdown selections (including Yes/No tables and KQL with blanks). Most carry a scenario. After you submit, the answer card itself shows the result: each choice is marked in place (the right one in green, your wrong pick in red) with its own explanation under it, the right one included. For an ordering question every step says why it belongs at that position. A short summary follows the verdict. Sources and the tutor are separate cards below it.

- The built-in bank is in [server/exam/bank/](server/exam/bank/): original questions written for this sandbox, plus some adapted from [question_sets/](question_sets/) (those files only record the right answers, so the wrong options are new). Every one of the 54 skills-measured bullets has at least one question.
- **Answers cannot be guessed from their shape.** The bank refuses to load if a correct answer is distinguishable by length, punctuation, hedging or repeated stem words, and a bank-wide check keeps the correct option's length rank near 25% for each of longest to shortest. Option order is shuffled for every exam.
- With IBM Consulting Advantage configured (`ICA_API_KEY` and `ICA_MODEL`), a checkbox adds freshly written questions (about 40% of the exam). They pass the same checks or are discarded, are labelled "Written by Claude", and can contain mistakes. See [.env.example](.env.example).
- **Sources and references.** After you submit, a card lists Microsoft Learn pages for the skill the question tests (a curated, link-checked table in [server/exam/references.js](server/exam/references.js); a Claude-written question gets the same pages for its skill and cannot add its own links), plus the matching sandbox lab.
- **Ask the tutor.** Below the sources, a chat card lets you ask follow-up questions about that one question. It sees the question, the correct answer and what you chose, but only after you have submitted, so it cannot reveal anything early. It needs ICA configured; without it the card says so. It can be wrong, and it is told to point you at the sources when unsure.
- Answers are held on the server for the session. Nothing is stored in the browser, and the answer key is never sent before you submit.

## Optional: Claude-powered assistant

```bash
cp .env.example .env     # add ICA_API_KEY=... (then: node --env-file=.env scripts/ica-models.mjs, and set ICA_MODEL)
npm start                 # loads .env automatically (Node 22.9+); `npm run dev` restarts on file changes
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
test/    kql, labs, labs2 (trap paths), automation, detections, workbooks, ingestion, audit, ta-notifications, cef, identity, disruption, arc, http (security), web-static (front-end guardrails)
scripts/ e2e-lib.mjs  e2e.mjs  e2e-labs2.mjs  e2e-labs3.mjs  e2e-wizards.mjs  coverage.mjs  screenshot.mjs
question_sets/  set1.txt ... set5.txt   (the source practice questions)
docs/
```
