# Changelog

One entry per iteration, newest first. **Every iteration must update the docs and add an entry here.**

## Iteration 4: Custom detection wizard and automation rules (2026-10-30)

**Summary.** Rebuilt the two most-used SC-200 screens against Microsoft Learn. Both had been a single small dialog. 130 → **162** unit tests; browser checks 16 + 37 + **33**.

### Custom detection rules (six-step wizard)
- Steps as documented: prepare query, alert details, alert enrichment, actions, scope, review. Reached from **Advanced hunting > Create detection rule** (query carried in) or **Custom detection rules > + Create detection rule**.
- Frequencies with their fixed lookback (24h/30 days, 12h/48 h, 3h/12 h, hourly/4 h), and **Continuous (NRT)** only for a single supported table with no join, union or comments. The wizard greys it out and says why.
- **Actions are gated on the output columns they need** and say exactly which is missing: device (DeviceId), file (a hash), user (account object id / SID), email (NetworkMessageId + RecipientEmailAddress).
- Dynamic `{{Column}}` alert titles (max 3 columns), up to 20 custom details, impacted-asset mapping, device-group scope, the 150-alert cap, and de-duplication of identical events.
- **Behaviour change:** Timestamp / ReportId / an entity column are now **warnings**, not errors, because current Learn says "recommend". The practice questions say "must"; the lab explains both.

### Automation rules (single panel)
- Three triggers, the documented condition and operator tables per trigger, AND conditions (case insensitive), five actions (assign owner, change status, change severity, add tags, run playbook), reorderable, with **rule expiration** and **order** (each trigger type is its own queue; later rules see earlier changes).
- **Closing an incident needs a classification** (five documented reasons). The alert trigger allows only Run playbook and only the analytic-rule-name condition.
- Playbooks Sentinel cannot run are **greyed out**, with a **Manage playbook permissions** link that grants the role in place (needs Owner on the resource group) and keeps what you typed.
- Incident changes by an analyst fire the **update trigger**; changes made by a rule fire it too ("Updated by: Automation rule"), with the cascade capped at 5 so rules cannot loop forever.
- The old `createAutomationRule` call still works (builds a normal rule), so earlier labs are unchanged.

### Supporting changes
- Validator: nested `object` specs (depth-limited), array `min`, still null-prototype at every level.
- `SimError` moved to its own module; `h()` makes every element null-safe.
- Alert tuning rules no longer apply to alerts raised by custom detections (docs), with a test that fails without the fix.
- Labs updated to the real wording; `playbook-permissions` downgraded from "Matches Learn" to "Simplified" because its managed-identity claim comes only from the practice question. `detect-and-isolate` is now "Matches Learn".
- New: `scripts/e2e-wizards.mjs`, a stray-text check ("null"/"undefined" on screen) in the shared harness, and evalJs errors that name the failing script.

### Bugs found and fixed
- **Stray "null" printed on the automation panel.** Not caught by any assertion; found by looking at a screenshot. Fixed at the root in `h()`, plus a permanent check.
- **A regex lost its backslash** when written through a shell (`[w.()-]` instead of `[\w.()-]`), so every resource group with a hyphen was rejected. Caught by the browser suite; added a unit test and scanned the code for the same mistake.
- **Scope preview in the wizard never updated** (the checkbox changed state but did not repaint).
- **Grant-permission discarded the user's input** by reopening the panel; now it refreshes in place.
- A test's rejected setup call masqueraded as an engine failure; setup helpers now assert.
- Rule names with `+`, `#`, `&`, `|` or `=` were refused; widened (still no markup characters).

### Still simplified
OR condition groups, custom-details and entity-property conditions, tags "collection" operators, incident tasks and Simple Flows; Sentinel custom frequency and SaaS governance actions; scheduled execution (rules run on save and when a scenario asks). Details and sources: [FIDELITY.md](FIDELITY.md) section 7. **Nothing has been checked against a live tenant.**

## Iteration 3: Rebuild against Microsoft Learn (2026-10-30)

**Summary.** Audited the sandbox against Microsoft Learn (see [FIDELITY.md](FIDELITY.md)) and rebuilt the parts that did not match. The decision logic mostly held; the portal structure and one lab did not. Followed your three decisions: teach the **product** for `unblock-lob1`, keep `hunting-favorites` **labelled unverified**, and **rebuild the shell**. 126 → **130** tests; browser checks 16 + **35**.

### Changed
- **One Defender portal.** Navigation now uses Microsoft's own section names (Investigation & response, Assets, Microsoft Sentinel > Threat management / Configuration, System > Settings). Azure stays separate for IAM and Logic Apps. Source: the Sentinel-in-Defender navigation table; Sentinel leaves the Azure portal after 31 March 2027.
- **Advanced hunting is one page** for Defender and Sentinel tables, queryable together (`union SigninLogs, DeviceLogonEvents`). The old per-surface restriction is gone.
- **Incidents & alerts is one page** with Incidents and Alerts tabs.
- **"Alert suppression" is now "Alert tuning"** in the UI, with Hide alert / Resolve alert. The docs say the feature was "previously alert suppression".
- **`unblock-lob1` teaches the product:** a file indicator with the Allow action, scoped to device groups; a group scope beats All devices; Block needs the "Allow or block file" advanced feature. The Tenant Allow/Block List stays but is labelled as an **email** feature and refuses a file Allow with an explanation.
- **Verification labels** on every lab (*Matches Learn* / *Simplified* / *Unverified*), on the card and in the coach. `hunting-favorites` and `approve-devices` show *Unverified*.
- Lab and page wording updated to the documented names ("Tune alert", "Add item", "Impacted assets").

### Added
- `docs/FIDELITY.md`: the audit ledger with a source and date for every finding, what was fixed, and what is still open.
- Device groups on devices, an "Allow or block file" feature toggle, and an effective-file-state engine (`effectiveFileState`) that applies the documented precedence.
- `web/js/nav.js`, `web/js/verification.js`, `scripts/screenshot.mjs`.
- Coach targets can have **aliases**, so a merged menu entry still answers to the old page ids.
- 4 tests for the indicator model and the email-list behavior; 2 for verification labels.

### Found and fixed along the way
- A shell-quoting slip left an unescaped apostrophe in a lab string and broke three test files at load. Caught by the suite, fixed by rewording.
- I misread a screenshot as a coach-highlight bug. Checking the DOM showed the highlight was correct, so no code was changed.

### Still open
See the end of [FIDELITY.md](FIDELITY.md): the custom-detection, automation-rule and summary-rule wizards are much simpler than the real ones; the device package is not downloaded from the Action center; entity mapping is a toggle; several tables have fewer columns than the real ones; case management, SOC optimization, the data lake and Security Copilot are not built. **Nothing has been checked against a live tenant.**

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
