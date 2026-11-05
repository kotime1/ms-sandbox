# SC-200 Study Guide: Your Weak Areas

Built from your five practice attempts (`question_sets/set1-5.txt`), and checked against Microsoft Learn where I could. Where a fact comes **only** from the practice questions and I could not confirm it in the docs, it is marked **(exam wording)**.

Each topic names the sandbox lab that practises it (see `docs/COVERAGE.md`). Regenerate the numbers in section 1 with `node scripts/progress.mjs` after adding a set. Run the lab, then retake the question.

## 1. Where you stand

| Attempt | Fully correct | Partly | Wrong | New-to-you questions | Score on new ones | Score on repeats |
|---|---|---|---|---|---|---|
| Set 1 | 24 / 50 (48%) | 3 | 23 | 50 | 48% | n/a |
| Set 2 | 33 / 50 (66%) | 1 | 16 | 23 | 52% | 78% (21 of 27) |
| Set 3 | 34 / 50 (68%) | 1 | 15 | 14 | 36% | 81% (29 of 36) |
| Set 4 | 35 / 50 (70%) | 2 | 13 | 9 | 44% | 76% (31 of 41) |
| Set 5 | 41 / 50 (82%) | 1 | 8 | 2 | 50% | 83% (40 of 48) |

**Read the improvement with caution.** The headline climbs from 48% to 82%, but almost all of that is *recall*. In set 5, 48 of the 50 questions were ones you had seen before. On questions that were **new** to you, your score has stayed between 36% and 52% across every set. That is the number that predicts the exam, and it has not moved.

What the data does show is that practice works on repeats: of the 28 repeats you had previously missed, you got 22 right in set 5. So the most useful thing now is to **learn the reason** behind each answer, so it carries over to a question worded differently.

There are 98 distinct questions across the five sets. You have missed 60 of them at least once. **22 are still wrong on your most recent attempt**; section 2 covers those first.

**Pattern across your misses:** you tend to pick the answer that sounds related to the product, not the one that fits the object being configured. Typical examples:

- Choosing a Sentinel role when the object is a Logic App.
- Choosing a device action (isolate) when the requirement also covers accounts.
- Choosing a Sentinel/Log Analytics column (`TimeGenerated`) when the object is a Defender XDR table (`Timestamp`).
- Choosing a plausible connector by its **name** (Defender for Office 365 for SharePoint events; a table named after Entra ID Protection) instead of by what it carries.

For each question, ask first: **which object am I changing, and which service owns it?**

---

## 2. Still wrong on your latest attempt (highest priority)

Ordered by how often you have missed them. The lab is the quickest way to make the reason stick.

### 2.1 Playbook permissions and Sentinel/Azure roles
*Missed: Set 1 Q5, Q9; Set 2 Q7, Q9; Set 3 Q5, Q7; Set 4 Q7; Set 5 Q7, Q9, Q10.* Labs: `playbook-permissions`, `playbook-picker`, `sentinel-rbac`, `workbooks`.

This is your biggest recurring gap: **wrong 3 of 4 times** on the VM1 question.

**Playbook can't act on a VM → grant the playbook's managed identity an RBAC role on the VM** (for example Virtual Machine Contributor at VM scope).

- You answered "give VM1 a managed identity" and "onboard VM1 to Azure Automation". Both are wrong.
- Rule: the actor's identity (the playbook) gets rights on the target (the VM), never the reverse.

**Roles: pick by what you're touching.**

| Goal | Role | Why |
|---|---|---|
| Create/add playbooks | **Logic App Contributor** | A playbook is an Azure Logic App, not a Sentinel resource. You picked Sentinel Contributor (Set 1) and Sentinel Responder (Set 3). |
| Let Sentinel itself run a playbook from an automation rule (the *Azure Security Insights* identity) | **Microsoft Sentinel Automation Contributor** on the playbook's **resource group** | A role on the playbook alone, or Logic App Contributor, leaves the playbook greyed out. You picked Logic App Contributor again in Set 5 Q9. |
| Tier 1 analyst runs playbooks on incidents | **Responder + Playbook Operator** (both) | Responder manages incidents. Playbook Operator is what permits running the playbook. |
| Create/delete workbooks | **Sentinel Contributor** or **Owner**, or a lesser Sentinel role **+ Workbook Contributor** | Workbook Contributor on its own is not enough. Set 5 Q10: **User1 (Owner), User3 (Contributor), User4 (Reader + Workbook Contributor)**; User2 (Responder only) cannot. |
| Read-only | Sentinel Reader (or Workbook Reader for workbooks) | |

**Memory hook:** Sentinel roles cover Sentinel objects (incidents, rules, workbooks). Logic App roles cover playbooks. Playbook Operator is the "run" permission. Automation Contributor is the one for Sentinel's *own* identity.

### 2.2 Automatic attack disruption (and device isolation vs accounts)
*Missed: Set 1 Q1, Set 5 Q4 (right in Set 2).* Lab: `attack-disruption`.

The requirement is "contain devices **and** disable compromised accounts, with minimal user disruption". Device isolation alone only addresses devices, so it can't be the answer.

- **Exam answer (exam wording): "Advanced features in Microsoft Defender for Identity".** I could not find a toggle with that name in the Learn pages on configuring attack disruption. What Learn does document is what has to be in place:
  - The products are deployed. Defender for Endpoint contains or isolates devices; **Defender for Identity disables on-premises accounts**; Entra ID revokes sessions or suspends users.
  - **Standard discovery** is set for the automatic *Contain device* action.
  - Device groups are on an automation level that allows it. **A group set to "No automated response" is excluded.**
  - For Defender for Identity: the **sensor on the domain controller**, a **valid action account** (by default the sensor's local system account) and **domain controller auditing**.
- Disabling an account hosted in Active Directory is carried out by the Defender for Identity sensor on a domain controller.

### 2.3 Custom detection rules: columns, and keeping them through an aggregation
*Missed: Set 1 Q16, Q40, Q41; Set 2 Q17, Q40; Set 5 Q21, Q40.* Labs: `detect-and-isolate`, `troubleshooting-mode`.

- **Start in Advanced hunting → Create detection rule** (or Custom detection rules → Create). You picked "Rules → Advanced settings" twice. Rules is for editing rules that already exist.
- **The query should return** `Timestamp`, `ReportId`, and one entity identifier column such as `DeviceId`, `AccountUpn`, `AccountObjectId` or `RecipientEmailAddress`. (The current Learn page says "recommend"; the exam says "must". Return all three.)
- You repeatedly chose **`AlertId`** and **`TimeGenerated`**. Neither is the answer. `TimeGenerated` belongs to Sentinel/Log Analytics tables; Defender XDR hunting uses `Timestamp`.
- "Mark user as compromised" needs an account column, so the answer is `AccountUpn` + `ReportId`. "Isolate device" needs `DeviceId`.
- **New in Set 5 Q21: keeping the columns after `summarize`.** `project Timestamp, DeviceId, ReportId` *after* a `summarize` fails, because the aggregation already removed `Timestamp` and `ReportId`. Use:

```kusto
DeviceLogonEvents
| where ActionType == "LogonFailed"
| summarize (Timestamp, ReportId)=arg_max(Timestamp, ReportId), count() by DeviceId
| where count_ > 3
```

  `arg_max` keeps the most recent `Timestamp` and `ReportId` per device while you still aggregate. `distinct` returns the columns but loses the count. Changing the rule frequency does not affect validation.

### 2.4 Defender for Identity: which action, which report
*Missed: Set 1 Q24, Q28 (right later); Set 4 Q25, Q26.* Lab: `identity-response`.

On a compromised **on-premises Active Directory** account whose activity is ongoing:

| Action | Active Directory | Microsoft Entra ID |
|---|---|---|
| **Disable** | Yes. Prevents sign-in and access to network resources | Yes |
| Revoke session | **No** (and it would not stop new authentications) | Yes |
| Mark as compromised | **No** | Yes |
| Force password change | Yes | Yes |

So the answer for an ongoing on-premises attack is **Disable**.

- **Reports** are under **Reports → Identities → Report management**: *Summary*, *Modification to sensitive groups*, *Passwords exposed in cleartext*. "Who changed Enterprise Admins in the last 14 days" is **Modification to sensitive groups**. Not an Entra provisioning workbook, an identity posture assessment, or the Cloud Discovery dashboard.
- The detailed *alert* report downloads as **XLSX (exam wording)**. The Learn reports page does not state a format.

### 2.5 Analytics rule types and MITRE coverage
*Missed: Set 2 Q19, Q21; Set 3 Q18, Q21; Set 4 Q20, Q21.* Labs: `entity-mapping`, `nrt-rule`. **MITRE coverage has no lab yet.**

| Rule type | Query logic visible? | Entity mapping? | Notes |
|---|---|---|---|
| **Scheduled** | Yes | Yes | Run every 5 minutes to 14 days; lookback must be at least the interval |
| **NRT** | Yes | Yes | Runs every **1 minute**, **1-minute lookback**, uses **ingestion time**; at most 50 rules |
| Fusion | No (ML) | No | Multistage attack correlation |
| ML behavior analytics | No (ML) | No | |
| Microsoft security (incident creation) | No query | No | You only choose the product and filters under **analytics rule logic** |
| Anomaly | No (read-only ML) | No | |

- Needs 1-minute detection with ingestion-time evaluation → **NRT**, not scheduled. A scheduled rule can't run faster than every 5 minutes.
- Only incidents from rules with entity mapping (scheduled and NRT) can be investigated in the investigation graph.
- Microsoft incident creation rule: pick the product in **analytics rule logic**, not "a rule query".
- **MITRE ATT&CK coverage:** select a technique in the matrix → the **technique details pane** shows active detections and available-but-not-enabled detections. SOC optimization spider charts are high-level and don't give per-technique counts. *Missed twice (Set 3 Q21, Set 4 Q21).*

### 2.6 Collect investigation package vs the other device actions
*Missed: Set 1 Q30, Q32, Q35; Set 2 Q29; Set 4 Q32; Set 5 Q33.* Lab: `triage-ws23`.

| You need to… | Use |
|---|---|
| Get a forensic snapshot of a device (processes, connections, scheduled tasks, autoruns) **without** a live session or disrupting the user | **Collect investigation package** (downloads a ZIP) |
| Interactively inspect a running process, run commands, collect files remotely | **Live response** |
| Detonate an unknown file safely in a sandbox | **Submit for deep analysis** (plus **add an indicator** so future detections use the hash) |
| Find the *scope* of an incident | **Advanced hunting** (KQL) |
| Chronological activity on one device, including interactive sign-ins | **Device timeline** |
| Contain a device | Isolate (disrupts the user, so not the first step when disruption must be minimised) |

- Set 5 Q33: you chose "add the file hash as an incident entity in Microsoft Sentinel". The answer is **deep analysis + indicator**: an entity records, but does not analyse or block.
- Device inventory lists assets. It doesn't tell you which ones are in the incident.
- **Timeline "clean breach timeline":** flag key events → enable **Only flagged events** → use the time bar to show events before the flagged one.

### 2.7 Purview Audit
*Missed: Set 1 Q36; Set 2 Q39; Set 3 Q34, Q39; Set 4 Q35; Set 5 Q39.* Lab: `audit-log`.

- **Retention:** Audit (Standard) = **180 days**. **Audit (Premium)** = **1 year** by default for Entra ID, Exchange, SharePoint and OneDrive records (other services stay at 180 days; up to 10 years with a policy and an add-on licence). `Search-UnifiedAuditLog` and the Management Activity API only read the same log; they do not extend retention. *You missed this three times.*
- A single search covers at most **180 days**.
- **`AirInvestigation`** is the record type for Defender XDR automated investigation and response **(exam wording)**. You chose `SecurityComplianceCenterEOPCmdlet`, which is for Security & Compliance cmdlets an admin ran.
- **Who can search (Set 1 Q36, Set 4 Q35):** the bank's answer is Global Admin, Security Admin and Exchange Admin **(exam wording)**. Learn says the requirement is the **Audit Logs** or **View-Only Audit Logs** role; it does not list Entra roles. Remember the bank's answer for the exam. You missed it twice.

| Question | Source |
|---|---|
| What did a user or app *do* in M365 (file shared, mailbox access) | **Purview Audit log** |
| How and when did they authenticate | Entra sign-in logs |
| Directory changes (app registration, role assignment) | Entra audit logs |
| Risky OAuth apps and cloud usage | Defender for Cloud Apps |

### 2.8 Connector choice (by what it carries, not its name)
*Missed: Set 3 Q11 and Set 4 Q12; Set 1 Q13, Q14.* Labs: `ingest-data`, `cef-and-tables`, `arc-servers`.

- **SharePoint Online events** → the **Microsoft 365 (formerly Office 365)** connector, which covers Exchange, SharePoint and Teams and writes to `OfficeActivity`. You picked **Defender for Office 365** twice; that connector is about email threat protection. *Missed twice.*
- **Entra ID Protection** detections land in **`SecurityAlert`** (exam wording). There is no table named after the connector.
- **CEF from network devices** → deploy a **Linux machine as a log forwarder** first (devices can't run the agent). The *CEF via AMA* connector writes to `CommonSecurityLog`. Not the Windows "Security Events via AMA" connector.
- **On-premises servers missing from the DCR resource picker** → install the **Azure Connected Machine agent (Azure Arc)**. The picker lists Azure VMs and Arc-enabled servers only. Windows Event Forwarding, moving the rule to another resource group, and the Azure File Sync agent do not fix it. A rule can sit in any resource group in the same tenant; its region must match the workspace.
- **Custom JSON via the Logs Ingestion API + DCR** → **create the custom table first** (it defines the column names and types; names end in `_CL`).

### 2.9 Email notifications: three different places
*Missed: Set 3 Q3; Set 1 Q17 (right later). New in Set 4/5.* Labs: `email-notifications`, `threat-analytics-notify`.

I previously said these all live under "Defender XDR settings". That was too simple. There are two areas:

| Rule | Where | Filters |
|---|---|---|
| **Alert notifications** (alerts on devices) | Settings → **Endpoints** → General → Email notifications | **Device group** and **severity**, plus recipients |
| **Threat analytics** (new or updated reports) | Settings → **Microsoft Defender XDR** → General → Email notifications → *Threat analytics* tab | All reports, or a **report type or tag**; name accepts English letters and numbers only |
| **Vulnerabilities** | The *Vulnerabilities* tab beside it | New vulnerability events |

- To limit noise to a set of machines: **device group + recipients**. Severity alone can't guarantee device scoping.
- To be told about new or updated threat reports: a **threat analytics** rule. A vulnerabilities rule, an alert rule, a custom detection or a Sentinel automation rule do not do this.
- **Who can create them:** Manage security settings or a higher role (such as Security Administrator). A rule for **all devices** needs Global administrator. Set 3 Q4: User1 (Global Administrator) and User2 (Security Administrator) can; User3 (Security Reader) cannot.

---

## 3. Questions with no lab yet (still missed)

I have not built labs for these. They are ordered by how often you have missed them.

### 3.1 Playbooks and automation rules
*Set 1 Q6, Q18; Set 2 Q18; Set 3 Q15; Set 4 Q5, Q6.* Partly covered by `playbook-picker`.

- **Incident-trigger playbook + a scheduled or NRT rule → add an automation rule with a "Run playbook" action.** Incident settings only control whether and how incidents are created or grouped; they can't attach a playbook.
- **"Alert automation (classic)"** is only for playbooks using the **alert** trigger.
- **Manual run from an incident's Actions menu → the playbook needs the incident trigger.**
- **Create the Logic App first** (Set 4 Q6): a playbook *is* a Logic App; you create it before an automation rule can run it.
- **Incident provider condition** (Set 4 Q5): Learn shows this condition only for workspaces **not onboarded** to the Defender portal, and offers two providers, **Microsoft Sentinel** and **Microsoft Defender XDR**, whatever connectors are enabled. The marked exam answer also includes Microsoft Defender for Office 365, which the docs do not list **(exam wording)**.

### 3.2 ASIM parser updates (missed twice) and blast radius (missed twice)
*Set 3 Q35, Set 5 Q37; Set 3 Q48, Set 5 Q44.*

- **Stop a built-in ASIM parser updating automatically** (pick **both** correct choices; you gave only one in Set 5): build a **custom unifying parser** that includes the built-in version you want, **and/or** redeploy with `CallerContext = Any` and `SourceSpecificParser = Any`. `CallerContext = Built-in` does not stop updates.
- **"View blast radius" unavailable** → configure Sentinel to use a **data lake** (graph infrastructure). Enabling UEBA, running "go hunt", or a custom detection does not enable it.

### 3.3 Purview: insider risk, DLP, eDiscovery
*Set 1 Q22, Q23, Q37; Set 2 Q22, Q33-35; missed Set 1 Q22, Set 2 Q22, Set 4 Q23.*

- "Did a departing user download lots of SharePoint files in the 30-90 days before leaving?" → **Insider risk management** policy (Data theft by departing users). You picked a Defender for Cloud Apps file policy.
- To show insider-risk alerts as incidents in Defender → enable **Share user risk details with other security solutions**.
- **DLP alerts** can be reviewed in the **Purview portal** and the **Defender portal**. Not the Microsoft 365 admin center. *Missed twice.*
- **eDiscovery CS007** (search too large or complex) → split into smaller searches by location, custodian or date range.

### 3.4 Smaller items

| Topic | Answer | Missed |
|---|---|---|
| MCP targeting a specific workspace | Use **`list_sentinel_workspaces`** and put the workspace ID in the prompt. The tenant-ID header controls authentication, not workspace choice. | Set 1 Q50, Set 4 Q48 (twice) |
| Two user nodes in the hunting graph (`user1` vs `user1@contoso.com`) | **Sync user entities with Microsoft Entra ID** | Set 2 Q45 |
| Threat intelligence platform to Sentinel (Set 5 Q13) | **Register an app in Microsoft Entra ID first** (application ID and secret), enter them in the platform, then enable the *Threat Intelligence Platforms* connector. | new in Set 5 |
| Microsoft-curated indicators | Install the *Threat Intelligence* solution from the Content hub, then the **Premium Defender Threat Intelligence** connector. TAXII = external feeds; Upload API = custom development. | Set 1 Q15 |
| Key Vault diagnostics for current and future vaults | **Azure Policy** (with a remediation task for existing resources). | Set 1 Q14 |
| Security Copilot embedded in Defender | Enable the **Microsoft Defender XDR plugin** in Security Copilot. | Set 2 Q26 |
| Devices not reporting alerts | Bank answer: **approve the devices on the Configuration management page** (low confidence; verify in docs). | Set 2 Q6 |
| IoC shows "inactive" | Configure a **valid target** (scope). There is no "enable" toggle. | Set 1 Q4 |
| ASR vs exploit protection | **ASR rules** target behaviours (executable content from email, unsigned processes from USB). Exploit protection addresses exploit techniques; controlled folder access protects folders; block at first sight is cloud-based blocking (not part of ASR). | Set 3 Q1 |

---

## 4. Quick-recall confusion pairs

| Often confused | Distinction |
|---|---|
| Sentinel Contributor / Responder vs Logic App Contributor | Sentinel objects vs the playbook (a Logic App) |
| Playbook Operator vs Automation Contributor | Operator: a user can run playbooks. Automation Contributor: Sentinel's own identity can run them (set on the RG). |
| Workbook Contributor vs Sentinel Contributor | Workbook Contributor alone can't create workbooks; it needs a Sentinel role beside it (or use Sentinel Contributor / Owner). |
| Incident settings vs automation rule | Settings shape incident creation. Automation rules attach playbooks. |
| `Timestamp` vs `TimeGenerated` | Defender XDR hunting vs Log Analytics/Sentinel |
| `ReportId` vs `AlertId` | ReportId is what custom detections need |
| `project` vs `arg_max` after `summarize` | `project` can't restore removed columns; `arg_max(Timestamp, ReportId)` keeps them |
| Audit Standard vs Premium | 180 days vs 1 year (Entra, Exchange, SharePoint, OneDrive) |
| Investigation package vs live response vs deep analysis | Snapshot ZIP vs interactive remote session vs file sandbox |
| Scheduled vs NRT | Configurable (5 min to 14 days) vs fixed 1-minute / ingestion-time |
| Arc agent vs AMA | Arc makes the machine an Azure resource. AMA then collects data. |
| Microsoft 365 connector vs Defender for Office 365 connector | Audit activity for Exchange/SharePoint/Teams vs email threat protection |
| Disable vs Revoke session vs Mark as compromised | For on-premises AD: only Disable (and Force password change) work. Revoke and Mark as compromised are Entra ID only. |
| Alert notification rule vs threat analytics rule | Device group + severity (Endpoints settings) vs report type or tag (Defender XDR settings) |
| Purview portal vs Microsoft 365 admin center | Compliance/DLP/audit lives in Purview (and DLP also in Defender) |

---

## 5. Suggested study plan

Order follows how often each area is still missed. For each lab: do it, read the debrief, then retake the matching question and say the object and owning service before choosing.

1. **Day 1, roles and playbooks** (section 2.1, 3.1): `playbook-permissions`, `playbook-picker`, `sentinel-rbac`, `workbooks`. This is the largest gap.
2. **Day 2, detections** (2.3, 2.5): `detect-and-isolate`, `nrt-rule`, `entity-mapping`. Write the `arg_max` tuple form until you don't have to think about it.
3. **Day 3, identity and containment** (2.2, 2.4): `attack-disruption`, `identity-response`.
4. **Day 4, investigation tooling** (2.6, 2.9): `triage-ws23`, `email-notifications`, `threat-analytics-notify`.
5. **Day 5, ingestion and audit** (2.7, 2.8): `ingest-data`, `cef-and-tables`, `arc-servers`, `audit-log`.
6. **Day 6, the topics with no lab** (section 3): read them; they are short.
7. **Then retake the sets**, and track your score on the questions that are **new** to you, not the repeats.

**Microsoft Learn pages referenced:**

- Automatic attack disruption, and Configure automatic attack disruption (Defender XDR)
- Remediation actions in Microsoft Defender for Identity; Manage reports (Defender for Identity)
- Get email notifications for Threat analytics updates; Configure email alert notifications
- Connect Microsoft Sentinel with a Windows agent-based connector (Azure Arc requirement)
- Ingest syslog and CEF messages to Microsoft Sentinel with the Azure Monitor Agent
- Logs Ingestion API in Azure Monitor
- Visualize your data using workbooks in Microsoft Sentinel
- Learn about auditing solutions in Microsoft Purview; Search the audit log
- Create and use Microsoft Sentinel automation rules
- Types of analytics rules; Near-real-time rules

**Solid now (no action needed):**

- Summary rules, KQL jobs and `AzureActivity`/Graph log queries
- Link Graph requests to a sign-in with `SignInActivityId` (one miss in Set 4)
- Device onboarding platforms (Windows, macOS, Linux, iOS, Android)
- Reset MFA registration for a compromised cloud identity
- Tenant Allow/Block List, suppression rules, hunting favorites
- UEBA `BehaviorInfo` + `BehaviorEntities` join
