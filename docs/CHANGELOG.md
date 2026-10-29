# Changelog

One entry per iteration, newest first. **Every iteration must update the docs and add an entry here.**

## Iteration 2: Question set 2 and nine new labs (2026-10-29)

**Summary.** Added `question_sets/set2.txt` (moved `questions.txt` to `question_sets/set1.txt`). The sets overlap: **27 of set 2's 50 questions are word-for-word repeats of set 1** and 23 are new, so labs are keyed to both sets. Added **9 labs** (14 total), which cover **59 of the 100 questions** (set 1: 29/50, set 2: 30/50). Added `join` to mini-KQL and the simulator features the new labs need.

### Added
- **Labs:** *Unblock LOB1* (Tenant Allow/Block List, indicator targets), *The devices that never raise alerts* (device approval), *The playbook that is not in the list* (Sentinel's own identity needs a role on the resource group), *Which incidents can you actually investigate?* (entity mapping by rule type), *Join behaviours to their entities* (UEBA, `join`), *Queries that run when you open Hunting* (favorites), *Queries that time out* (summary rules), *Triage WS-23* (timeline, investigation package, deep analysis, indicator, restraint, plus a `DeviceEvents` platform bonus), *Follow one token through Graph* (`SignInActivityId`).
- **Mini-KQL:** `join` (`inner`/`leftouter`, `on Col` and `on $left.A == $right.B`, suffixed column clashes), a per-table `scanCost` that makes aggregating a huge raw table time out.
- **Simulator:** allow/block list, indicators (Active only with a target), files with a verdict that is hidden until deep analysis, device approval, investigation packages, device timelines with flagging, workbooks model, hunting favorites that run on opening the blade, summary rules that materialise a new table, entity-mapping flag on rules, and the Azure Security Insights identity in automation.
- **Findings:** `findings.report` + `answers` on a lab, for objectives that are facts ("who", "how many") checked against server-side data.
- **Optional tables** (hidden until a lab enables them) and runtime tables (summary-rule output), so the schema browser never gives away an answer.
- **UI:** Hunting and Summary rules pages, the device page (timeline, flags, package), Tenant Allow/Block List, files and indicators on *Rules & lists*, device approval banner, an answer box component, and per-set question numbers on lab cards.
- **Coach:** navigation steps are skippable once a later step is done; state-changing steps never are.
- **Tooling:** `scripts/coverage.mjs` generates `docs/COVERAGE.md` (a test fails if it is stale); `scripts/e2e-lib.mjs` shared browser harness; `scripts/e2e-labs2.mjs` plays the new labs through the real UI.
- **Tests:** 72 → **126**. New `test/labs2.test.js` covers the plausible-but-wrong path of every new lab (an indicator with no target, isolating instead of approving, a role on the playbook instead of the resource group, counting the Android phone...). Browser: 16 + **28** checks.

### Security issues and bugs found and fixed
- **Answer leak through a second note and the objective text** (*playbook-picker*): withheld one note but a different note named the role, and an objective said which identity holds it. Fixed both; added tests that every `withholdNotes` id is real and that no objective names the solution's role.
- **`withholdNotes` typos would silently disable the guard:** eight lab ids pointed at notes that did not exist. Wrote the notes; added the test.
- **Lab truth in API views:** file verdicts and sandbox behaviours are now sent only after deep analysis; `investigable` and findings are never sent. Test added.
- **Literal "null" rendered on the Rules page** (native `Element.append` stringifies `null`). Fixed at the root with a safe container, not per call site. While fixing it I introduced infinite recursion (the helper called the overridden method); caught by the browser run immediately and fixed by calling the native method.
- **Two controls shared one coach target** (`btn:deep-analysis` on both "Open" and the dialog's submit), so the highlight and a click could land on the wrong one. Gave them distinct targets.
- **Guard objectives that passed by doing nothing** ("malware still blocked", "no analytics rule created") were caught by the suite's start-state check and now require the fix they protect.
- **Summary rule destination was pre-created**, which both blocked the learner's rule and revealed the answer in the schema browser. Removed.

### Known gaps / next iteration candidates
See **[COVERAGE.md](COVERAGE.md)**. Largest unmet topics: Purview (insider risk, DLP, audit, eDiscovery; 10 questions), Sentinel workbooks (6), data connectors (AMA/Arc/DCR/Policy; 3), Defender XDR portal (3), Defender for Identity (2).
- Workbooks exist in the world model but have no UI yet.
- Summary rules run once on save rather than on a schedule.
- `lookup` and other `join` kinds are unsupported.
- Narrow/mobile layouts are still untested.

## Iteration 1: Foundation (2026-10-29)

**Summary.** First working version: a hardened local server, a simulated Sentinel/Defender/Azure environment with clickable portals, a mini-KQL engine, the three agents, and five labs derived from `questions.txt`.

### Added
- **Server** (Node 24, zero dependencies): HTTP layer with Host/Origin/CSRF checks, strict CSP, rate limits, size limits, safe static serving.
- **Simulator**: in-memory per-session world (Azure resources/RBAC, Sentinel incidents/rules/automation/playbook runs, Defender alerts/devices/suppression/custom detections); every write goes through a validated action registry.
- **Mini-KQL engine**: where, project, extend, summarize (incl. `arg_max`, `count_distinct`), sort, take, top, distinct, union, render; helpful errors; DoS limits.
- **Agents**: lab-agent (setup, outcome grading, step guidance, 3-tier hints), attack-agent (allowlisted synthetic scenarios), assistant-agent (offline notes; optional Claude).
- **Front-end**: Azure / Sentinel / Defender portal skins; Logs & Advanced hunting editor with table and chart results; IAM role-assignment dialog; Logic App blade; incident Actions menu; suppression and detection dialogs; Lab coach panel with pulsing next-click highlight.
- **Labs**: Silence App1 (Q3, Q25), Least privilege for the SOC (Q8, Q9), Playbook that will not run (Q5–Q7, Q18), Hunt then automate (Q16, Q40–42), Three questions for the logs (Q38, Q39, Q44, Q47, Q48).
- **Tests**: 72 (KQL engine, every lab solved via the real action path + failure/"too broad" paths, HTTP security, front-end static guardrails, Claude-provider data boundary). `scripts/e2e.mjs` drives the real UI in headless Edge/Chrome (16 checks).
- **Docs**: README, ARCHITECTURE, SECURITY (threat model → control → test), AUTHORING_LABS.

### Security issues found and fixed during development
- KQL function/aggregate lookup used plain property access, so `constructor(...)` resolved through `Object.prototype`. Now `Object.hasOwn` only (test added).
- Offline study notes spelled out lab answers to the assistant. Added `withholdNotes` so they're hidden until the lab is complete (test added).
- 413 responses reset the connection instead of replying; now a clean `Connection: close` reply (test added).
- A modal-button handler read `event.currentTarget` after `await`, leaving dialog buttons disabled after a failed submit. Fixed and covered in e2e.

### Known gaps / next iteration candidates
- Questions not yet turned into labs: workbooks & `render` (Q10–12), data connectors/AMA/Arc/Azure Policy (Q13–15), Defender XDR automatic attack disruption & IoCs (Q1, Q4), insider risk (Q22–23, Q29), investigation package / live response (Q30–35), UEBA behaviours, data-lake KQL jobs, summary rules, MCP (Q45–50).
- `join` is not implemented in mini-KQL (clear error message directs to `union`).
- No persistence across server restarts; no progress history.
- Layout was only checked at desktop width in headless Edge; narrow/mobile layouts are untested.
