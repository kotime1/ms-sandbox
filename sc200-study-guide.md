# SC-200 Study Guide: Your Weak Areas

Built from your three practice attempts (`question_sets/set1-3.txt`). Topics are ordered by how often you missed them.

## 1. Where you stand

| Attempt | Fully correct | Notes |
|---|---|---|
| Set 1 | 24 / 50 (48%) | 23 wrong, 3 multi-select questions partly wrong |
| Set 2 | 33 / 50 (66%) | 15 wrong, 2 multi-select questions partly wrong |
| Set 3 | 34 / 50 (68%) | 15 wrong, 1 multi-select question partly wrong |

**Read the improvement with caution.** Sets 2 and 3 repeat many Set 1 questions, so some of the gain is memorised answers. Most of your Set 3 misses were on questions that were new to you:

- ASR vs exploit protection
- Alert notification rules
- Microsoft 365 connector
- Custom log tables
- AirInvestigation
- Troubleshooting-mode KQL
- Blast radius

The concept-level gaps below matter more than the individual questions.

**Pattern across your misses:** you tend to pick the answer that sounds related to the product, not the one that fits the object being configured. Typical examples:

- Choosing a Sentinel role when the object is a Logic App.
- Choosing an alert-level setting when the object is an incident.
- Choosing a Sentinel/Log Analytics column (`TimeGenerated`) when the object is a Defender XDR table (`Timestamp`).

For each question, ask first: **which object am I changing, and which service owns it?**

---

## 2. Tier 1: missed two or more times

### 2.1 Playbook permissions and Sentinel/Azure roles
*(Set 1 Q5, Q8, Q9; Set 2 Q7; Set 3 Q7)*

**Playbook can't act on a VM → grant the playbook's managed identity an RBAC role on the VM** (for example Virtual Machine Contributor at VM scope).

- You answered "give VM1 a managed identity" and "onboard VM1 to Azure Automation". Both are wrong.
- Rule: the actor's identity (the playbook) gets rights on the target (the VM), never the reverse.

**Roles: pick by what you're touching.**

| Goal | Role | Why |
|---|---|---|
| Create/add playbooks | **Logic App Contributor** | A playbook is an Azure Logic App, not a Sentinel resource. You picked Sentinel Contributor (Set 1) and Sentinel Responder (Set 3). |
| Let Sentinel itself run a playbook (the *Azure Security Insights* identity) | **Microsoft Sentinel Automation Contributor** on the playbook's **resource group** | A role on the playbook alone, or Logic App Contributor, leaves the playbook greyed out. |
| Tier 1 analyst runs playbooks on incidents | **Responder + Playbook Operator** (both) | Responder manages incidents. Playbook Operator is what permits running the playbook. |
| Create/delete workbooks | **Sentinel Contributor**, or a lesser Sentinel role **+ Workbook Contributor** | Workbook Contributor is only needed to create or delete. Owner also works. |
| Read-only | Sentinel Reader | |

**Memory hook:** Sentinel roles cover Sentinel objects (incidents, rules, workbooks). Logic App roles cover playbooks. Playbook Operator is the "run" permission.

### 2.2 Playbook triggers and automation rules
*(Set 1 Q6 wrong, Q18 right; Set 2 Q8 right, Q18 wrong; Set 3 Q15 wrong)*

- **Incident-trigger playbook + NRT (or any) analytics rule → add an automation rule with a "Run playbook" action.**
  - You chose "Incident settings" twice.
  - Incident settings only control whether and how incidents are created or grouped. They cannot attach a playbook.
- **"Alert automation (classic)"** is only for playbooks that use the **alert** trigger.
- **Run manually from an incident's Actions menu → the playbook needs the incident trigger.** The alert trigger is for manual runs on alerts, or for rules that don't create incidents. Changing authentication or the identity doesn't fix this.
- Playbooks are Azure Logic Apps.

### 2.3 Azure Arc and onboarding on-prem servers
*(Set 1 Q13, Set 2 Q15)*

- On-prem servers don't appear in the DCR resource picker until they are Azure resources. Install the **Azure Connected Machine agent** (Azure Arc). AMA is deployed afterwards.
- Wrong answers you picked or saw: Windows Event Forwarding (a different architecture), Azure File Sync agent, changing the DCR location.
- Azure VMs work from any region and any Windows OS (client or server) with the AMA connector. You got that one right.

### 2.4 Custom detection rules: how to build them, and which columns
*(Set 1 Q16, Q40, Q41; Set 2 Q17, Q40)*

- **Start in Advanced hunting → Export → Create detection rule.** You picked "Rules → Advanced settings" twice. Rules is for editing rules that already exist.
- **The query must return:**
  1. `Timestamp`
  2. `ReportId`
  3. One entity identifier column, for example `DeviceId`, `DeviceName`, `AccountUpn`, `AccountObjectId`, `RecipientEmailAddress`
- You repeatedly chose **`AlertId`** and **`TimeGenerated`**. Neither is the answer.
  - `AlertId` is not required.
  - `TimeGenerated` belongs to Sentinel/Log Analytics tables. Defender XDR advanced hunting uses `Timestamp`.
- "Mark user as compromised" needs an account column, so the answer is `AccountUpn` + `ReportId`.
- "Isolate affected devices" needs a device column (`DeviceId`).

### 2.5 DeviceEvents and Android/iOS
*(Set 1 Q43, Set 2 Q42)*

- Android devices can be onboarded to Defender for Endpoint, but they do **not** populate `DeviceEvents`.
- Query output covers Windows (Enterprise and Pro) and macOS only.
- Don't confuse "can be onboarded" (Windows, Server, macOS, Linux, iOS, Android: you got that right) with "generates this table".

### 2.6 KQL basics: first line, operators
*(Set 2 Q41, Set 3 Q42; Set 1 Q44)*

- **Every query starts with a table name.** `DeviceEvents` is the first line. `where` filters come after it. You picked the filter both times.
- `union` = combine rows from several tables (search an IP across three tables). `join` = match rows between two tables on a key. `lookup` = enrich a fact table from a dimension table. `extend` = add a calculated column.
- `render timechart` makes the chart.
- `=~` is case-insensitive equals. `has` is a whole-term match. `!=` is not-equal.

### 2.7 Purview Audit
*(Set 2 Q39, Set 3 Q34, Q39; Set 1 Q36)*

- **Retention:**
  - Audit (Standard) = 180 days.
  - **Audit (Premium)** = 1 year by default for Entra ID, Exchange, SharePoint and OneDrive.
  - You answered `Search-UnifiedAuditLog` (Set 2) and "Standard" (Set 3). Neither changes retention. `Search-UnifiedAuditLog` and the Management Activity API only query or export the same log.
- **`AirInvestigation`** is the record type for Defender XDR automated investigation and response activity. You chose `SecurityComplianceCenterEOPCmdlet`.
- **Which log answers which question:**

| Question | Source |
|---|---|
| What did a user or app *do* in M365 (file shared, mailbox access, etc.) | **Purview Audit log** |
| How and when did they authenticate | Entra sign-in logs |
| Directory changes (app registration, role assignment) | Entra audit logs |
| Risky OAuth apps and cloud usage | Defender for Cloud Apps |

- **Who can search the audit log (Set 1 Q36):** the bank's answer is Global Admin, Security Admin and Exchange Admin. The explanation is thin and I'd double-check the exact role requirements (View-Only Audit Logs / Audit Logs) in the docs. For the exam, remember the bank's answer.

### 2.8 Collect investigation package vs the other device actions
*(Set 1 Q30, Q32, Q35; Set 2 Q29)*

| You need to… | Use |
|---|---|
| Get a forensic snapshot of a device (processes, connections, scheduled tasks, autoruns) **without** a live session or disrupting the user | **Collect investigation package** (downloads a ZIP) |
| Interactively inspect a running process, run commands, collect files remotely | **Live response** |
| Detonate an unknown file safely in a sandbox | **Submit for deep analysis** (plus "add indicator" so future detections use the hash) |
| Find the *scope* of an incident (which devices, users or processes) | **Advanced hunting** (KQL) |
| Chronological activity on one device, including interactive sign-ins | **Device timeline** |
| Contain a device | Isolate (disrupts the user, so it's not the "first step" when disruption must be minimised) |

- You picked "isolate" (Set 2) when the requirement said minimise user impact.
- You picked "Export inventory" (Set 1) when a snapshot of device state was needed.
- Device inventory lists assets. It doesn't tell you which ones are in the incident.
- **Timeline "clean breach timeline":** flag key events → enable **Only flagged events** → use the time bar to show events before the flagged one. Exporting gives a static file and no filtering.

### 2.9 Incident-level email notifications
*(Set 1 Q17, Set 3 Q3)*

- Notification rules live in **Microsoft Defender portal → Settings → Microsoft Defender XDR** (not Email & collaboration settings).
- To limit noise for a specific set of machines, scope the rule by **device group** and choose **which users to notify**. Severity filtering alone can't guarantee device scoping, and you picked it in Set 3.

---

## 3. Tier 2: missed once, mostly on newer content

### 3.1 Analytics rule types
*(Set 2 Q19, Q21; Set 3 Q18, Q20, Q21; Set 1 Q19 right)*

| Rule type | Query logic visible? | Entity mapping? | Notes |
|---|---|---|---|
| **Scheduled** | Yes | Yes | Configurable schedule and lookback |
| **NRT** | Yes | Yes | Runs every **1 minute**, **1-minute lookback**, uses **ingestion time** |
| Fusion | No (ML) | No | Multistage attack correlation |
| ML behavior analytics | No (ML) | No | |
| Microsoft security (incident creation) | No query | No | You only choose the product and filters under **analytics rule logic** |
| Anomaly | No (read-only ML) | No | |

- Needs 1-minute detection with ingestion-time evaluation → **NRT**, not scheduled (Set 3 Q20).
- Only incidents from rules with entity mapping (scheduled and NRT) can be investigated in the investigation graph (Set 2 Q21). You picked "Rule4 only".
- Microsoft incident creation rule: pick the product in **analytics rule logic**, not "a rule query" (Set 3 Q18).
- **MITRE ATT&CK coverage:** select a technique → **details pane** shows active detections and available-but-not-enabled detections. SOC optimization spider charts are high-level and don't give per-technique counts (Set 3 Q21).

### 3.2 Workbooks
*(Set 2 Q12, Set 3 Q10)*

- SOC manager metrics (incidents created over time, mean time to triage) → **Security operations efficiency** template, not "Incident Overview". You missed this twice.
- Templates are read-only. **Clone** a template first, then customise.
- A workbook visualises over time. A notebook is for programmatic hunting. A playbook is automation.

### 3.3 Ingestion edge cases
*(Set 1 Q14, Q15; Set 3 Q11, Q13, Q35)*

- **Key Vault diagnostic logs for current and future vaults** → **Azure Policy** (the connector's built-in policy, with remediation task for existing resources). Not per-vault diagnostic settings.
- **Microsoft-curated threat indicators** → install the *Threat Intelligence* solution from Content hub, then connect the **Premium Defender Threat Intelligence** connector.
  - TAXII = external feeds.
  - Upload API = custom development.
  - Threat Intelligence Platforms = Graph indicators API, extra configuration.
- **SharePoint Online events** → **Microsoft 365** connector (covers Exchange, Teams, SharePoint). You picked the Defender for Office 365 connector.
- **Custom JSON via Logs Ingestion API + DCR** → **create the custom table first** (it defines column names and types). A DCR for AMA custom text logs is for files on monitored machines, not this scenario.
- **ASIM built-in parsers: stop automatic updates.** Either:
  - add a custom unifying parser that includes the built-in version you want, or
  - redeploy with `CallerContext = Any` and `SourceSpecificParser = Any`.
  - `CallerContext = Built-in` does not stop updates.

### 3.4 Purview: insider risk, DLP, eDiscovery
*(Set 1 Q22, Q23, Q37; Set 2 Q22)*

- "Did a departing user download lots of SharePoint files in the 30-90 days before leaving?" → **Insider risk management** policy (Data theft by departing users). You picked Defender for Cloud Apps file policy twice.
- To show insider-risk alerts as incidents in Defender → enable **Share user risk details with other security solutions** (you got this right).
- **DLP alerts** can be reviewed in the **Purview portal** and the **Defender portal**. Not the Microsoft 365 admin center (you picked it in Set 2).
- **eDiscovery CS007** (search too large or complex) → split into smaller searches by location, custodian or date range.

### 3.5 Defender XDR / Endpoint specifics

| Topic | Answer | Missed |
|---|---|---|
| ASR vs Exploit protection | **ASR rules** target behaviours (executable content from email, unsigned processes from USB). Exploit protection addresses exploit techniques. Controlled folder access protects folders. Block at first sight is cloud-based blocking. | Set 3 Q1 |
| Automatic attack disruption | Enable under **Advanced features in Defender for Identity**. Device isolation alone only addresses devices. | Set 1 Q1 |
| IoC shows "inactive" | Configure a **valid target** (scope). There is no "enable" toggle. | Set 1 Q4 |
| Defender for Identity detailed alert report | **XLSX** | Set 1 Q24 |
| Unified incident view across MDE, MDI, MDA | **Incidents & alerts** | right |
| Devices not reporting alerts | Bank answer: **approve the devices on the Configuration management page**. Low confidence, so verify in docs. | Set 2 Q6 |
| Security Copilot embedded in Defender portal | Enable the **Microsoft Defender XDR plugin** in Security Copilot. Connecting Sentinel doesn't enable it. | Set 2 Q26 |
| Compromised cloud identity: strong re-auth | **Reset MFA registration**. Blocking via Conditional Access doesn't remediate risk, and dismissing the risk clears it unverified. | right |
| Compromised on-prem AD account, activity ongoing | **Disable the account**. Revoking sessions doesn't stop new authentications. | right |

### 3.6 Hunting and Sentinel platform

| Topic | Answer | Missed |
|---|---|---|
| `MicrosoftGraphActivityLogs` failed requests | `ResponseStatusCode == 401 or == 403` (never `and`). Use `count_distinct(RequestId)` by `AppId, ServicePrincipalId, UserId`. | Set 1 Q38 |
| Link Graph requests to a suspicious sign-in token | **`SignInActivityId`** | right |
| Who edited a Sentinel analytics rule | `AzureActivity` with `OperationNameValue startswith "MICROSOFT.SECURITYINSIGHTS/ALERTRULES/WRITE"` and `ActivityStatusValue contains "Succeeded"` | right |
| macOS troubleshooting-mode events | `ActionType == "AntivirusTroubleshootModeEvent"`, then parse `AdditionalFields` | Set 3 Q46 |
| UEBA behaviour title/description | **`BehaviorInfo`** (joined with `BehaviorEntities` for users/devices/IPs) | Set 1 Q45 |
| Two user nodes in hunting graph (`user1` vs `user1@contoso.com`) | **Sync user entities with Microsoft Entra ID** | Set 2 Q45 |
| "View blast radius" unavailable | Configure Sentinel to use a **data lake** (graph infrastructure). UEBA doesn't enable it. | Set 3 Q48 |
| Hunting queries that run every time you open Hunting | Add them as **Favorites** (not analytics rules, which run continuously) | Set 2 Q46 |
| MCP targeting a specific workspace | Use **`list_sentinel_workspaces`** and put the workspace ID in the prompt. The tenant-ID header controls authentication, not workspace choice. | Set 1 Q50 |
| Long-range queries time out on huge raw tables | Query the **summary rule's destination table**. Summary rules (scheduled aggregation into an analytics-tier table) are the feature, not search jobs or analytics rules. | right |
| KQL job append fails with schema error | Make the query output column names and types **match the destination table** | right |

---

## 4. Quick-recall confusion pairs

| Often confused | Distinction |
|---|---|
| Sentinel Contributor / Responder vs Logic App Contributor | Sentinel objects vs the playbook (a Logic App) |
| Playbook Operator vs Automation Contributor | Operator: a user can run playbooks. Automation Contributor: Sentinel's own identity can run them (set on the RG). |
| Incident settings vs automation rule | Settings shape incident creation. Automation rules attach playbooks. |
| `Timestamp` vs `TimeGenerated` | Defender XDR hunting vs Log Analytics/Sentinel |
| `ReportId` vs `AlertId` | ReportId is required for custom detections |
| Audit Standard vs Premium | 180 days vs 1 year |
| Investigation package vs live response vs deep analysis | Snapshot ZIP vs interactive remote session vs file sandbox |
| Scheduled vs NRT | Configurable schedule vs fixed 1-minute / ingestion-time |
| Arc agent vs AMA | Arc makes the machine an Azure resource. AMA then collects data. |
| Purview portal vs Microsoft 365 admin center | Compliance/DLP/audit lives in Purview (and DLP also in Defender) |

---

## 5. Suggested study plan

1. **Day 1, Sentinel automation and RBAC:** sections 2.1 and 2.2. Practise in your sandbox (`server/sim/rbac.js` and the Logic App/IAM pages): create a playbook, give its managed identity a role, wire it through an automation rule.
2. **Day 2, Detections:** sections 2.4, 3.1 and 3.2. Build a hunting query that returns `Timestamp`, `ReportId` and `DeviceId`, then turn it into a detection rule with an isolate action.
3. **Day 3, Investigation tooling:** sections 2.8, 2.9 and 3.5. Use the action-comparison table until you can pick the tool without thinking.
4. **Day 4, Purview and ingestion:** sections 2.3, 2.7, 3.3 and 3.4.
5. **Day 5, KQL and hunting tables:** sections 2.5, 2.6 and 3.6.
6. **Then retake the sets** and, for each miss, state the object and the owning service before choosing an answer.

**Microsoft Learn modules referenced in your sets:**

- Threat response with Microsoft Sentinel playbooks
- Understand Microsoft Sentinel permissions and roles
- Types of analytics rules
- Automation in Microsoft Sentinel
- Explore advanced hunting
- Configure and manage automation using Microsoft Defender for Endpoint
- Learn about auditing solutions in Microsoft Purview

**Still solid (no action needed):**

- Workbook basics (`render`, clone template)
- Summary rules and KQL jobs
- Logic Apps as the playbook engine
- `AzureActivity` audit query
- Reset MFA registration for compromised cloud identity
- Tenant Allow/Block List
- Suppression rules
