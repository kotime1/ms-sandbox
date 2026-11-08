# SC-200 Study Guide: Your Weak Areas

Built from your six practice attempts, which are stored once in [questions/questions.json](questions/questions.json) (103 distinct questions). Where a fact comes **only** from the marked answer of a practice question and not from its explanation or Microsoft Learn, it is marked **(exam wording)**.

Each topic names the sandbox lab that practises it. Refresh the numbers in section 1 with `npm run progress`, and see which questions have no lab with `npm run coverage`.

## 1. Where you stand

| Attempt | Fully correct | Partly | Wrong | New questions | Score on new ones | Score on repeats |
|---|---|---|---|---|---|---|
| Set 1 | 24 / 50 (48%) | 3 | 23 | 50 | 48% | n/a |
| Set 2 | 33 / 50 (66%) | 1 | 16 | 23 | 52% | 78% (21 of 27) |
| Set 3 | 34 / 50 (68%) | 1 | 15 | 14 | 36% | 81% (29 of 36) |
| Set 4 | 35 / 50 (70%) | 2 | 13 | 9 | 44% | 76% (31 of 41) |
| Set 5 | 41 / 50 (82%) | 1 | 8 | 2 | 50% | 83% (40 of 48) |
| Set 6 | 41 / 50 (82%) | 1 | 8 | 5 | 80% (4 of 5) | 82% (37 of 45) |

**Read the improvement with caution.** The headline climbs from 48% to 82%, but almost all of that is *recall*. In set 6, 45 of the 50 questions were ones you had seen before. The 80% on new questions is 4 of 5, which is too few to mean anything. Across sets 2 to 5, your score on questions that were **new** stayed between 36% and 52%, and that is the number that predicts the exam.

Practice does work on repeats: of the 30 repeats you had previously missed, you got 23 right in set 6. The most useful thing is to **learn the reason** behind each answer, so it carries over to a question worded differently.

There are 103 distinct questions. You have missed 62 of them at least once. **22 are still wrong on your latest attempt.** Section 2 covers them, ranked by how often you have missed them.

**The pattern in your misses:** you pick the answer that sounds related to the product, not the one that fits the object being configured. Typical cases:

- Choosing a Sentinel role when the object is a Logic App.
- Choosing a device action (isolate) when the requirement also covers accounts.
- Choosing a Sentinel/Log Analytics column (`TimeGenerated`) when the object is a Defender XDR table (`Timestamp`).
- Choosing a connector by its **name** instead of by what it carries.
- Choosing the fix for the wrong symptom (the MCP tenant header for a workspace problem).

For each question, ask first: **which object am I changing, and which service owns it?**

---

## 2. Still wrong on your latest attempt (highest priority)

### 2.1 Playbooks, automation rules and their roles (wrong in 5 questions, 12 times)

*Labs:* `playbook-permissions`, `playbook-picker`, `sentinel-rbac`. This is your biggest gap, and set 6 added three more misses (Q7, Q9, Q18).

| The question says | The answer | Why you missed it |
|---|---|---|
| A playbook cannot act on a VM (S1:5, S2:7, S3:5, S5:7) | Grant the **playbook's managed identity** an RBAC role on the VM | You gave the VM an identity, or onboarded it to Automation. The actor's identity gets rights on the target, never the reverse |
| Run a playbook **manually** from an incident's Actions menu (S1:6, S2:8, S6:7) | **Update the playbook to use the incident trigger** | You gave the playbook a Sentinel role. A role does not make it appear; the trigger does |
| An NRT/scheduled rule must use an incident-trigger playbook (S1:18, S2:18, S3:15, S4:18, S6:18) | **Add an automation rule** to the analytics rule | You chose Incident settings, which only shape how incidents are created or grouped |
| Let **Sentinel itself** run a playbook from an automation rule (S2:10, S5:9, S6:9) | **Microsoft Sentinel Automation Contributor** on the playbook's **resource group** | You chose Logic App Contributor, which is for people, not for the Azure Security Insights identity |
| Admin1 must **add** playbooks (S1:9, S3:7) | **Logic App Contributor** | A playbook is a Logic App, not a Sentinel object |

Roles by what you are touching:

| Goal | Role | Why |
|---|---|---|
| Create or edit playbooks | **Logic App Contributor** | A playbook is an Azure Logic App |
| Let Sentinel run a playbook from an automation rule | **Sentinel Automation Contributor** on the playbook's resource group | A role on the playbook alone, or Logic App Contributor, leaves it greyed out |
| Tier 1 analyst runs playbooks on incidents | **Responder + Playbook Operator** (both) | Responder manages incidents; Playbook Operator permits running |
| Create or delete workbooks | **Sentinel Contributor** or **Owner**, or a lesser Sentinel role **+ Workbook Contributor** | Workbook Contributor alone is not enough |
| Read only | Sentinel Reader | |

**Memory hook:** Sentinel roles cover Sentinel objects. Logic App roles cover playbooks. Playbook Operator is "run". Automation Contributor is for Sentinel's *own* identity.

Related, from S4:6 and S5:8 (no lab): **create the Logic App first**. A playbook is a Logic App, and it has to exist before an automation rule can run it.

### 2.2 Custom detection columns (wrong 3 of 3 times)

*Lab:* `detect-and-isolate`. S1:40, S5:40 and S6:41 are the same question, and you have missed it every time.

A custom detection query must return `Timestamp`, `ReportId`, and **one column that identifies what to act on** (`DeviceId`, `AccountUpn`, `AccountObjectId`, `RecipientEmailAddress`, ...). The question's own explanation lists them.

- "Mark user as compromised" needs an account column, so the answer is **`AccountUpn` + `ReportId`**.
- "Isolate device" needs `DeviceId`.
- You keep choosing `AlertId` and `TimeGenerated`. Neither is right: `TimeGenerated` is the Sentinel column, and Defender XDR tables use `Timestamp`.
- **Keeping the columns through `summarize`** (S5:21): `project` after a `summarize` fails because the aggregation already removed `Timestamp` and `ReportId`. Use `summarize (Timestamp, ReportId)=arg_max(Timestamp, ReportId), count() by DeviceId`. `distinct` loses the count, and changing the rule frequency changes nothing.

### 2.3 Microsoft incident creation rule (wrong 3 of 5 times)

*Lab:* `entity-mapping`. S3:18, S4:20 and S6:19 all missed.

To create incidents from **Defender for Cloud** alerts, configure **analytics rule logic**: select the product there. A Microsoft incident creation rule has **no query, no alert details and no entity mapping**; those exist only in scheduled and NRT rules. Per the question's explanation, you pick the product under analytics rule logic, such as Defender for Cloud or Microsoft Entra ID Protection.

| Rule type | Query visible? | Entity mapping? | Notes |
|---|---|---|---|
| **Scheduled** | Yes | Yes | Every 5 minutes to 14 days |
| **NRT** | Yes | Yes | Every 1 minute, ingestion time |
| Fusion, ML behavior analytics, anomaly | No | No | Machine learning |
| Microsoft security (incident creation) | No | No | Choose the product and filters |

### 2.4 MITRE ATT&CK coverage (wrong 2 of 3 times; no lab)

*S3:21 and S4:21.* Select a technique in the matrix and read the **technique details pane**: it shows the active detections and the available detections that are not yet enabled. The SOC optimization spider chart is a high-level view and does not give per-technique counts.

### 2.5 Collect investigation package vs the other device actions (wrong in 2 questions)

*Lab:* `triage-ws23`. S1:35 and S4:32 (investigation package), S5:33 (deep analysis).

| You need to... | Use |
|---|---|
| Get a forensic snapshot (processes, connections, scheduled tasks, autoruns) **without** a live session or disrupting the user | **Collect investigation package** |
| Interactively inspect a running process, run commands | **Live response** |
| Detonate an unknown file safely | **Submit for deep analysis**, plus **add an indicator** so devices block it |
| Find the scope of an incident | **Advanced hunting** |
| Chronological activity on one device | **Device timeline** |
| Contain a device | Isolate (disrupts the user, so not the first step when disruption must be minimised) |

An entity recorded in an incident neither analyses nor blocks a file.

### 2.6 Purview Audit (wrong in 2 questions)

*Lab:* `audit-log`.

- **Who can search (S1:36, S4:35):** the marked answer is Admin1, Admin2 and Admin3 (Global Administrator, Security Administrator and Exchange Administrator) **(exam wording)**. Learn says the requirement is the **Audit Logs** or **View-Only Audit Logs** role, and does not list Entra roles. Remember the marked answer for the exam.
- **Record type for Defender XDR activity (S3:34):** `AirInvestigation`. You chose `SecurityComplianceCenterEOPCmdlet`, which is for cmdlets an admin ran **(exam wording)**.
- **Retention:** Audit (Standard) = **180 days**. Audit (Premium) = **1 year** by default for Entra ID, Exchange, SharePoint and OneDrive. A single search covers at most 180 days.
- **Export limit (S6:37, new):** the portal export is capped at **50,000 records**, so with Audit (Standard) and no upgrade you **split the search into smaller time ranges** and export each one.

### 2.7 Graph activity logs and tokens (wrong 2 of 4 times)

*Lab:* `follow-the-token`. S4:37 and S6:35: to find the Graph API requests made by the same access token as a sign-in, filter on **`SignInActivityId`**. You chose `SessionId`. The sign-in log's unique token identifier matches the Graph log's `SignInActivityId`.

### 2.8 Sentinel MCP server (wrong 2 of 2 times; new lab)

*Lab:* `mcp-workspace` (S1:50, S4:48, S6:49). Two separate controls:

| Symptom | Fix |
|---|---|
| Results come from different **workspaces** (two workspaces, one tenant) | Run **`list_sentinel_workspaces`**, then put the **workspace ID in the prompt** |
| Calls authenticate to the wrong **tenant** (signed in as a guest) | Add the **`x-mcp-client-tenant-id`** header to the MCP server definition |
| Both (S6:49) | The header **and** the workspace ID in the prompt |

You chose the tenant header for a workspace problem twice. The header controls *authentication*, not *which workspace is queried*. Using `default` as the workspace ID does not pin it.

### 2.9 Other questions still wrong

| Topic | Answer | Lab |
|---|---|---|
| **UEBA data sources** (S6:12, new) | **Azure Activity** and **Security Events**. Microsoft 365 is not one of the two | `ueba-sources` |
| Review the result of a KQL query a user ran (S4:40, S6:40) | **Advanced Hunting** in the Defender portal, not Sentinel | `kql-investigation` |
| Changes to the Enterprise Admins group over 14 days (S6:23) | The Defender for Identity **Modifications to sensitive groups** report. Not a Provisioning analysis workbook | `identity-response` |
| Devices that cannot run an agent send CEF (S4:13) | Deploy a **Linux machine** as a log forwarder | `cef-and-tables` |
| Automation rule **Incident provider** condition (S4:5) | The marked answer is **Microsoft Sentinel + Microsoft Defender for Office 365**. The explanation lists Sentinel and Microsoft 365 Defender, and says the list does not depend on connectors **(exam wording)** | none |
| Stop a built-in **ASIM** parser updating (S3:35, S5:37; pick both) | Build a **custom unifying parser** including the built-in one, **and** redeploy with `CallerContext = Any` and `SourceSpecificParser = Any` | none |
| **View blast radius** unavailable (S3:48, S5:44) | Configure Sentinel to use a **data lake**. UEBA, "go hunt" and a custom detection do not enable it | none |

---

## 3. Questions with no lab yet

Run `npm run coverage` for the current list. Most of what remains is Purview (insider risk, DLP, eDiscovery), connector recall, and the items in the last table above.

- "Did a departing user download lots of SharePoint files in the 30 to 90 days before leaving?" is an **Insider risk management** policy (data theft by departing users).
- To show insider-risk alerts as incidents in Defender, enable **Share user risk details with other security solutions**.
- **DLP alerts** can be reviewed in the **Purview portal** and the **Defender portal**, not the Microsoft 365 admin center.
- **eDiscovery CS007** (search too large or complex): split into smaller searches by location, custodian or date range.
- **Deception rules** (S6:6) are created in **Microsoft Defender for Endpoint**. Defender for Identity has honeytoken accounts, which are a different feature.
- To open the **entity page for an external IP** from incident evidence (S6:30), select the IP in the alert process tree.
- A **threat intelligence platform** pushing to Sentinel (S5:13): register an app in Entra ID first, enter its ID and secret in the platform, then enable the connector.
- **Key Vault diagnostics** for current and future vaults (S1:14): Azure Policy, with a remediation task for existing resources.
- **Security Copilot** embedded in Defender (S2:26): enable the Defender XDR plugin.

---

## 4. Quick-recall confusion pairs

| Often confused | Distinction |
|---|---|
| Sentinel Contributor / Responder vs Logic App Contributor | Sentinel objects vs the playbook (a Logic App) |
| Playbook Operator vs Automation Contributor | A user can run playbooks vs Sentinel's own identity can run them (set on the resource group) |
| Incident settings vs automation rule | Settings shape incident creation. Automation rules attach playbooks |
| Incident trigger vs alert trigger playbook | Incident: manual run from the incident and automation rules. Alert: classic alert automation |
| `Timestamp` vs `TimeGenerated` | Defender XDR hunting vs Log Analytics and Sentinel |
| `ReportId` vs `AlertId` | ReportId is what custom detections need |
| `project` vs `arg_max` after `summarize` | `project` cannot restore removed columns; `arg_max(Timestamp, ReportId)` keeps them |
| Microsoft incident creation vs scheduled rule | Pick a product vs write a query (only scheduled has entity mapping) |
| Audit Standard vs Premium | 180 days vs 1 year |
| Investigation package vs live response vs deep analysis | Snapshot ZIP vs interactive session vs file sandbox |
| Scheduled vs NRT | 5 minutes to 14 days vs 1 minute, ingestion time |
| Arc agent vs AMA | Arc makes the machine an Azure resource; AMA then collects |
| Microsoft 365 connector vs Defender for Office 365 | Audit activity for Exchange, SharePoint and Teams vs email threat protection |
| Disable vs Revoke session vs Mark as compromised | On-premises AD: only Disable (and Force password change). Revoke and Mark as compromised are Entra ID only |
| Alert notification rule vs threat analytics rule | Device group and severity (Endpoints settings) vs report type or tag (Defender XDR settings) |
| MCP tenant header vs workspace ID | Which tenant the call signs in to vs which workspace it queries |
| UEBA data sources vs what you ingest | Only Azure Activity and Security Events, not everything with user activity |

---

## 5. Suggested study plan

Order follows how often each area is still missed. For each lab: do it, read the debrief, then retake the matching question and say the object and owning service before choosing.

1. **Day 1, playbooks and roles** (2.1): `playbook-permissions`, `playbook-picker`, `sentinel-rbac`. The largest gap.
2. **Day 2, detections** (2.2, 2.3, 2.4): `detect-and-isolate`, `entity-mapping`, `nrt-rule`. Write the `arg_max` tuple form until you do not have to think about it.
3. **Day 3, device and identity response** (2.5, and `attack-disruption`, `identity-response`): `triage-ws23`.
4. **Day 4, audit and logs** (2.6, 2.7): `audit-log`, `follow-the-token`.
5. **Day 5, the newest items** (2.8, 2.9): `mcp-workspace`, `ueba-sources`, `cef-and-tables`.
6. **Day 6, the topics with no lab** (section 3). They are short.
7. **Then retake**, and track your score on the questions that are **new** to you, not the repeats.

**Solid now (no action needed):** summary rules, KQL jobs and `AzureActivity`/Graph log queries; device onboarding platforms; resetting MFA registration for a compromised cloud identity; Tenant Allow/Block List, suppression rules, hunting favorites; the UEBA `BehaviorInfo` + `BehaviorEntities` join.

**Adding a new attempt:** save the pasted results page as a text file and run `node scripts/add-set.mjs <file> --write`. It adds the attempt, links repeats to their labs, and lists the new questions that need a lab.
