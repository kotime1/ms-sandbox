# Changelog

One entry per iteration, newest first. **Every iteration must update the docs and add an entry here.**

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
