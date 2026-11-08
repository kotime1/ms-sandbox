# SC-200 Sandbox

A mock lab environment for studying the Microsoft SC-200 (Security Operations Analyst) exam, with no Azure subscription needed.

> **This is not a replica of Microsoft Sentinel.** It mimics the *environment*: a single Microsoft Defender portal (where Sentinel now lives) plus the Azure portal for IAM and Logic Apps, with their menus, buttons, error messages and the order you click things in. The aim is learning by hand: your hands learn the route, and the grading checks that you understood *why*. Schemas, KQL and RBAC are deliberately simplified, and nothing has been checked against a live tenant. Everything runs in memory on your machine; no tenant or real data is involved.

## Start

Requires Node.js 22.9 or newer (developed on 24). There are **no dependencies to install**.

```bash
npm start              # http://127.0.0.1:3000   (loads .env if there is one)
npm run dev            # the same, restarting when files change
npm test               # unit, integration, security and front-end guardrail tests
npm run e2e            # drives every lab and the exam through the real UI in headless Edge or Chrome (optional)
```

## What you can do with it

**1. Hands-on labs** (the *Labs* tab). 28 labs, each a scenario you solve by clicking through the simulated portals. The **Lab coach** panel shows the brief, your objectives, a gold highlight on the next control, graded hints and an assistant. Labs are graded on the **outcome** (what changed in the environment), not the click order, so there are many valid paths, and "works but too broad" fails the least-privilege objectives on purpose. Investigation labs ask you to report a finding; the expected value stays on the server. Each lab shows a **verification level**: *Matches Microsoft Learn*, *Simplified vs Learn*, or *Unverified* (comes from a practice question only).

| Area | Labs |
|---|---|
| Playbooks, automation and roles | playbook permissions, playbook picker, least privilege for the SOC, workbooks |
| Detections and analytics | hunt then automate (custom detections), NRT vs scheduled rules, entity mapping, troubleshooting mode |
| Defender for Endpoint | suppression rules, unblocking a file, device approval, triaging a device, ASR rules, email notifications, threat analytics notifications, attack disruption |
| Identity and Purview | Defender for Identity actions and reports, Purview audit |
| Data ingestion | Microsoft 365 and custom tables, CEF and Linux forwarders, Azure Arc and the collection-rule picker |
| Hunting and the data lake | KQL (union, Graph, Azure Activity), UEBA behaviours, UEBA data sources, summary rules, hunting favorites, Graph token correlation, Sentinel MCP server |

**2. A practice exam** (the *Practice exam* tab). Builds an SC-200-style exam on request, 10 to 50 questions (50 by default), following the published weights (Manage 40–45%, Respond 35–40%, Hunt 20–25%). Four formats: choose one, choose several, put steps in order, and complete dropdown selections (Yes/No tables, KQL with blanks). After you submit, the answer card marks each choice in place (right in green, your wrong pick in red) with **its own explanation under it, the right one included**; an ordering question says why each step sits where it does. Below it, a **Sources** card lists Microsoft Learn pages for the skill, and an **Ask the tutor** card lets you ask follow-up questions about that one question.

- 96 questions, each tied to one of the 54 skills-measured bullets. The bank refuses to load if a correct answer can be guessed from its shape (length, punctuation, hedging, repeated stem words).
- Answers, explanations and sources stay on the server until you submit. Nothing is stored in the browser.
- With IBM Consulting Advantage configured, a checkbox adds freshly written questions (about 40% of the exam); they pass the same checks or are discarded, are labelled "Written by Claude", and can contain mistakes.

**3. A study guide** ([sc200-study-guide.md](sc200-study-guide.md)). Built from six real practice attempts: where you stand, the questions you keep missing ranked by how often, the reason behind each answer, and a study plan that points at the lab for each topic. All attempts are stored once in [questions/questions.json](questions/questions.json) (103 distinct questions); `npm run progress` prints your accuracy and `npm run coverage` lists the questions that have no lab.

## Optional: Claude through IBM Consulting Advantage

The assistant and the exam's generated questions and tutor use Claude only if you configure it; everything works offline without it.

```bash
cp .env.example .env     # add ICA_API_KEY=...
node --env-file=.env scripts/probe-ica.mjs models    # lists the Claude models your key can use; set ICA_MODEL to one
npm start
```

The key is read from the environment only and is sent only to the ICA API. It is never sent to the browser, put in a prompt, or logged. The lab assistant sees only the brief, objectives and hints you already unlocked, never the solution. `ASSISTANT_PROVIDER=local` and `EXAM_PROVIDER=local` force offline mode. See [.env.example](.env.example).

## Documentation

- [docs/SECURITY.md](docs/SECURITY.md): the threat model and every control, with the tests that prove it
- [docs/DEVELOPING.md](docs/DEVELOPING.md): how it fits together, and how to add a lab, a page, an exam question or a practice attempt
- [sc200-study-guide.md](sc200-study-guide.md): your weak areas and a study plan

## Layout

```
server/    core/ (bus, session, validation, ica-client)   sim/ (world, actions, KQL engine, rule engines, tables)
           agents/ (lab, attack, assistant, exam, tutor)  labs/  attacks/  exam/ (bank, grading, references)  knowledge/  http/
web/       index.html  css/  js/ (dom, api, main, nav, pages/, components/)
questions/ questions.json   (every distinct practice question and every attempt)
test/      unit, integration, security and front-end guardrail tests
scripts/   add-set  progress  coverage  check-refs  probe-ica  screenshot  screenshot-exam  e2e-all  e2e*.mjs
docs/      SECURITY.md  DEVELOPING.md
```
