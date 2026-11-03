# Changelog

One entry per iteration, newest first. **Every iteration must update the docs and add an entry here.**

## Iteration 5: Question set 3 and seven new labs (2026-11-02)

**Summary.** Added `question_sets/set3.txt`. **36 of its 50 questions repeat set 1 or 2 word for word**, so existing labs now also cite them; the 14 genuinely new questions are covered by **7 new labs** (21 total), which brings coverage to **103 of 150** questions (set 3: 35/50). 162 -> **248** unit tests; browser checks 16 + 37 + 33 + **60**. The coverage generator now handles any number of sets.

### New labs
- **Who turned troubleshooting mode on?** (Q46). Mini-KQL gained `parse_json`/`todynamic`, property access (`col.name`, `col["name"]`) and the `(Timestamp, ReportId)=arg_max(...)` form; `arg_max(Timestamp, ...)` now also returns the key column, as in Kusto. DeviceEvents has an `AdditionalFields` column.
- **Cut the delay between a sign-in and the alert** (Q20). Analytics got a **+ Create** flow (scheduled or NRT). NRT is fixed (every minute, one-minute lookback, ingestion time, 50-rule cap); scheduled is 5 minutes to 14 days with lookback >= interval.
- **Email the right people about brute force** (Q3, Q4; set 1 Q17). Email notification rules (device group + severity + recipients), a simulated outbox, a "signed in as" selector and the Manage-security-settings / Global-administrator-for-all-devices rules.
- **Stop email attachments and USB malware** (Q1). Endpoint security policies with the six attack surface reduction capabilities, 19 ASR rules by their real names, Block/Audit/Warn, Warn refused where unsupported, platform limits (ASR is Windows only).
- **Build the SOC manager a workbook** (Q8; set 1 Q10-12; set 2 Q11-13). Workbooks page: Templates / My workbooks, Save, View, Edit, Save as, Done editing, tiles that run a query and draw `render` charts. New Workbook Reader and Workbook Contributor roles.
- **Bring SharePoint and a factory app into Sentinel** (Q11, Q13). Data connectors page (Microsoft 365 connector with app selection; Defender for Office 365 is the decoy), custom table first, then a data collection rule, then ingestion.
- **Search the audit log, keep it for a year** (Q34, Q39; set 1 Q36; set 2 Q39). Purview Audit search with record types, the 180-day range limit, Standard (180 days) vs Premium (one year for Entra ID, Exchange, OneDrive, SharePoint) retention.

### Azure portal restyle
Restyled the Azure side to match a screenshot of portal.azure.com from an exam lab: always-light page, blue header with a global search box, icon buttons, tenant name, and an **All services** landing page (filter box, featured row, category list, two-column service list). Search finds a service and opens its page: Microsoft Sentinel opens in the Defender portal, Entra ID and Access control open IAM. Most services are listed for realism and say they are not simulated. The SIMULATION badge and the lab tabs stay in the header. Coach targets (`nav:azure/iam` and the rest) are unchanged. Hiding the sandbox sidebar on All services had pushed the lab coach off screen (and would have on Home); a hidden sidebar now keeps its grid slot.

### Defender portal restyle
Restyled the Defender side from a screenshot of security.microsoft.com: charcoal header with a centred search box, light page, and the real left menu (Home, Exposure management, Investigation & response, Threat intelligence, Assets, Microsoft Sentinel, Identities, Endpoints, Email & collaboration, Cloud apps, Microsoft Purview, then Cases, SOC optimization, Reports, Learning hub, Trials, System > Settings). Groups start collapsed like the real menu; groups the sandbox does not simulate say so. **The group that holds the current page, or the coach's next target, opens itself**, so the highlight can always find its link. The Defender portal now opens on a **Home** page (dismissible banners, the data-lake promo card, and cards showing real sandbox counts). Header search finds the pages that exist. Page ids and `nav:` coach targets are unchanged.

### Bugs found and fixed
- **Unreachable objective in the browser.** Two labs asked for an answer on pages that never rendered the answer box; every server test passed. The shell now adds the box to any page when the lab has `answers`.
- **Lab setup could not be played by its own UI.** The workbooks lab assigned roles to users the IAM picker could not list; `listPrincipals` now includes directory members.
- **Wrong default search window** on the audit page (it ended two days ago); the window is now "ends N days ago, lasts M days".
- **Ingestion silently dropped every field.** The validator never passes unknown keys, so a free-form record object became `{}`; records are now name/value pairs. A case mismatch between a rule and its table would also have crashed; matching is case-insensitive end to end.
- **Mutation checks.** Breaking retention and the permission rule on purpose made exactly the intended tests fail.
- **Flaky browser tests (about half of runs).** Pages re-render after actions, and scripts acted on half-rendered pages. `click`/`setValue` now wait; multi-control steps act in one evaluation; page assertions poll (`okSoon`). Six consecutive clean runs. This also exposed a latent race in `e2e-labs2`. See AUTHORING_LABS.md.

### Where this goes beyond the docs
- Audit: the `AirInvestigation` record type, and which Entra roles may search, come from the practice questions. I could not confirm them in the Learn pages I could read, so that lab is labelled **Unverified**.
- Workbooks and email notifications: that Microsoft 365 role groups count alongside Entra roles, and the "Sentinel role + Workbook Contributor" rule, are from the questions.
- **Your study guide says email notification rules live under Settings > Microsoft Defender XDR.** The current Learn page puts them at Settings > Endpoints > General > Email notifications. The exam wording is "Defender XDR settings"; the lab explains both.
- Still not built: Q26 (Defender for Identity actions), Q35 (ASIM parser pinning), Q48 (blast radius needs a Sentinel data lake). Nothing has been checked against a live tenant.

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
