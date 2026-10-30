# Fidelity ledger

How closely the sandbox matches the real products, checked against Microsoft Learn. Nothing here was checked against a live tenant.

- **Audited:** 2026-10-30, against pages dated June to October 2026 (page dates are in each row).
- **Updated:** 2026-10-30, after the iteration-3 rebuild. Rows marked **Fixed** were wrong when first audited and have since been changed; the original finding is kept so you can see what was wrong.
- **Method:** each simulated behavior was compared with the cited page. "Match" means the page says the same thing. It does not mean the UI looks the same.
- **Not audited yet:** KQL schemas, error message wording, and the Purview, Entra, Defender for Identity and Cloud Apps areas (not built).

Status key: **Match** · **Partial** (right idea, wrong detail) · **Wrong** (contradicts the docs) · **Unverified** (no source found yet)

## 1. Structural findings

| # | Finding | Status | Evidence |
|---|---|---|---|
| S1 | The sandbox had three separate portals (Azure, Sentinel, Defender). Real Sentinel is moving into the Defender portal. After **March 31, 2027** it is supported there only. | **Fixed**: one Defender portal plus a separate Azure portal for IAM and Logic Apps | [Sentinel in the Defender portal](https://learn.microsoft.com/en-us/azure/sentinel/microsoft-sentinel-defender-portal) (2026-06-18) |
| S2 | The current SC-200 skills list (effective **21 Oct 2026**) is organised around Defender, with Sentinel as a section. Weights: manage a security operations environment 40-45%, respond to incidents 35-40%, threat hunting 20-25%. | Informs scope | [SC-200 study guide](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/sc-200) |
| S3 | The Defender portal's Sentinel menu uses these names: **Investigation & response** > Incidents & alerts, Hunting > Advanced hunting, Custom detection rules; **Microsoft Sentinel** > Threat management (Workbooks, Hunting, Notebooks, MITRE ATT&CK), Content management, Configuration (Data connectors, Analytics, Watchlists, Automation, Summary rules); **System** > Settings. The sandbox's nav labels and groupings did not follow this. | **Fixed**: `web/js/nav.js` uses these section names | same page, "Quick reference" |
| S4 | Case management, SOC optimization, the data lake and Security Copilot are first-class parts of the Defender experience and the exam. The sandbox has none. | Missing | same page; SC-200 skills list |

## 2. Behavior audit, lab by lab

### unblock-lob1 (Tenant Allow/Block List, indicators) - **redesigned in iteration 3** (original findings below)

| Behavior in the sandbox | Status | What the docs say |
|---|---|---|
| The Tenant Allow/Block List is where you allow a file that Defender blocked on an endpoint | **Wrong** | The list is a **Defender for Office 365 / Exchange Online Protection** feature and its file entries apply to **email attachments** (hash matching on files extracted during message analysis). Path: Email & collaboration > Policies & rules > Threat policies > Rules > Tenant Allow/Block Lists. [tenant-allow-block-list-files-configure](https://learn.microsoft.com/en-us/defender-office-365/tenant-allow-block-list-files-configure) (2026-07-03) |
| You can add an Allow entry for a file directly | **Wrong** | "You can't create allow entries for files directly in the Tenant Allow/Block List." Allow entries are created from the **Submissions** page by submitting a blocked file as "I've confirmed it's clean" and choosing **Allow this file**. Block entries can be added directly. Same page |
| Allow entry offers 30 days / never / remove after inactive | **Partial** | Allow expiry: 1, 7, 30 days, 45 days after last used (default), or a specific date up to 30 days. Block: 1, 7, 30 (default), never, or a date up to 90 days. Same page |
| An Allow entry releases a file at once | **Unverified** | The page says an entry is active within 5 minutes. It says nothing about releasing an already-blocked endpoint file |
| For an **endpoint** file wrongly blocked, the real mechanism | Not modelled | A **file indicator with the Allow action** in Defender for Endpoint (System > Settings > Endpoints > Indicators > File hashes, scoped to device groups). Per the docs an Allow indicator wins over Defender Antivirus blocking, but a certificate Block indicator overrides a file Allow indicator. [indicator-file](https://learn.microsoft.com/en-us/defender-endpoint/indicator-file) (2026-07-03) |
| An indicator is "Inactive" until it has a target | **Unverified** | The file-indicator page describes a **Scope** (device group) and an expiry but no Active/Inactive status. The claim comes from your question rationale only. Worth checking in a tenant |
| Indicator actions are allow / alert / block | **Partial** | Real actions: Allow, Audit, Warn, Block execution, **Block and remediate**, with an optional alert. Hash types SHA-256 / SHA-1 / MD5, and a more secure hash wins a conflict |
| File indicators work on any file | **Partial** | PE files only on Windows (.exe, .dll); different types on macOS and Linux. Needs behavior monitoring, cloud protection and file hash computation |

**Consequence:** this lab teaches the wrong tool. Your question's rationale (set 2, Q1) says "Edit the Tenant Allow/Block List". The docs describe the list as an email-filtering feature. Either the question is loosely worded or it targets the unified Defender allow/block experience that I could not find. **Decision needed from you**, see section 4.

### playbook-permissions and playbook-picker - **mostly matches**

| Behavior | Status | Source |
|---|---|---|
| Sentinel runs incident-trigger playbooks (manually or from an automation rule) through its own service account, which needs the **Microsoft Sentinel Automation Contributor** role on the **resource group** holding the playbook | **Match** | [automate-responses-with-playbooks](https://learn.microsoft.com/en-us/azure/sentinel/automation/automate-responses-with-playbooks) (2026-06-12); [automate-incident-handling-with-automation-rules](https://learn.microsoft.com/en-us/azure/sentinel/automate-incident-handling-with-automation-rules) (updated 2026-06-30) |
| Playbooks you cannot use appear **greyed out** in the automation rule's action list; a **Manage playbook permissions** link lets you grant it on the spot, and needs **Owner** on the resource group | **Match** (the sandbox lacks the link) | automation-rules page |
| Granting a role on the playbook resource itself, or Logic App Contributor, does not make it selectable | **Unverified** | Stated in your question rationale only; the docs say the grant is on the resource group |
| The user needs Playbook Operator to run a playbook, Responder to open the incident, and Logic App Contributor on the resource group | **Partial** | Roles table matches. The sandbox does not enforce the Logic App Contributor requirement on the user |
| Only incident-trigger playbooks run from incident-trigger automation rules; only alert-trigger from alert-trigger rules | **Match** | automation-rules page |
| The alert trigger is for alerts from rules that **do not create incidents** | **Partial** | Docs: this is the main reason to use it, and it matters most when onboarded to the Defender portal, where incident creation rules in Sentinel **must be disabled**. The sandbox only calls the alert trigger the "manual" one |
| An enhanced alert trigger exists for Defender-portal automation across Sentinel, Defender and XDR | Missing | automation-rules page |
| Automation rule triggers are **When incident is created**, **When incident is updated**, **When alert is created**; conditions include analytics rule name (contains, starts with, ...) and tags; actions include tasks, status, severity, owner, tags, run playbook; there is an **order**, an **expiration date**, and a per-trigger queue | **Partial** | The sandbox has one trigger, one condition and one action, with an order number |
| A playbook run takes time; an automation rule moves on after 2 minutes | Missing | automation-rules page |
| Playbook actions use a **managed identity** | **Unverified** | Not covered by the pages I fetched. The sandbox's "no managed identity, no run" error is invented wording |

### detect-and-isolate (custom detections) - **partial**

| Behavior | Status | Source |
|---|---|---|
| Create from **Advanced hunting > Create detection rule**, or from **Custom detection rules > + Create detection rule** | **Match** (the sandbox has only the first) | [custom-detection-rules](https://learn.microsoft.com/en-us/defender-xdr/custom-detection-rules) (2026-09-02) |
| The query must return `Timestamp` and `ReportId` | **Partial / changed** | Docs now say "we **recommend**" `Timestamp` or `TimeGenerated`; `DeviceId` and `ReportId` for Defender for Endpoint tables, so alerts get the right device-group scope and process tree. Your practice question says "must". The exam may still say "must" |
| An entity column is required | **Partial** | Entity columns are used to **map impacted assets** in the wizard (and are chosen manually for Sentinel data). Not described as a hard requirement |
| Rule frequency | **Wrong** | Every 24 h / 12 h / 3 h / hourly / **Continuous (NRT)** / **Custom** (Sentinel data only, 5 min to 14 days), each with a fixed lookback. The sandbox runs once on save |
| Wizard steps | **Wrong** | Six steps: prepare query, alert details, **alert enrichment** (dynamic title with `{{Column}}`, custom details, entity mapping), actions, **scope**, review. The sandbox has one small dialog |
| Device actions | **Partial** | Isolate device, **Collect investigation package**, **Run antivirus scan**, **Initiate investigation**, **Restrict app execution**. The sandbox has only isolate. Also file actions (Allow/Block, Quarantine), user actions (Mark compromised, Disable user, Reset authentication) and email actions. None modelled |
| 150 alerts per run cap; permission on all devices in scope needed | Missing | same page |
| Continuous (NRT) works only on one table, with supported operators, no join or union | Missing | same page |

### suppress-app1 - **not audited**
I did not fetch the Defender for Endpoint alert-suppression page. Status: **Unverified**.

### sentinel-rbac - **mostly matches**
The role descriptions come from Microsoft's wording and agree with the roles table above. Responder "lets you access an incident in order to run a playbook manually, but doesn't allow you to run the playbook"; Playbook Operator "lets you run a playbook manually". **Match.**

### hunting-favorites - **cannot be verified, likely wrong**

| Behavior | Status | Source |
|---|---|---|
| Favorites run automatically when the Hunting blade opens | **Unverified** | Not in the current [hunts](https://learn.microsoft.com/en-us/azure/sentinel/hunts) page (2026-07-01). The page describes **Run all queries** and **Run selected queries** buttons you press yourself |
| The Hunting experience | **Wrong** | Current model is **Hunts**: hypothesis, multiple persisted query tabs, bookmarks, entities, comments, create incidents, hypothesis state, hunting metrics. Location: Microsoft Sentinel > Threat management > Hunting. The sandbox has a flat list with stars |
| Bookmarks | Missing | hunts page |

Your set 2 Q46 says favorites run each time the blade opens. This may be true of the older Azure-portal blade and not of the current docs. **Needs a tenant check.** Until then this lab is marked Unverified.

### summary-rule - **partial**

| Behavior | Status | Source |
|---|---|---|
| Path | **Wrong** in the sandbox | Defender portal: **Microsoft Sentinel > Configuration > Summary rules** (the workspace must first be onboarded to the Defender portal) |
| Wizard fields | **Partial** | Name, description, destination table (**existing** or **new** custom log table, named `<name>_CL`), SummaryLogs diagnostic setting prompt, summary logic with **Preview results**, then scheduling: frequency, delay in minutes, start time; then review and save. The sandbox has no description, no existing-table option, no preview, no scheduling |
| Destination stored in the **Analytics** plan | **Match** | [summary-rules](https://learn.microsoft.com/en-us/azure/sentinel/summary-rules) (2026-07-02) |
| Content hub provides summary rule templates | Missing | same page |
| Role: **Microsoft Sentinel Contributor** | Missing | same page |
| Interactive queries on the raw table "time out" | Simulated | This is a teaching device; real behavior depends on volume |

### triage-ws23 (device page) - **partial**

| Behavior | Status | Source |
|---|---|---|
| Device page response actions: **Collect investigation package**, **Isolate device**, Run antivirus scan, Restrict app execution, Initiate live response session, Initiate automated investigation, Action center | **Partial** (sandbox has package and isolate only) | [respond-machine-alerts](https://learn.microsoft.com/en-us/defender-endpoint/respond-machine-alerts) (2026-07-23) |
| The package is **downloaded from the Action center** after collection | **Wrong** in the sandbox, which shows the contents instantly | same page |
| Package contents | **Partial** | Includes a `CollectionSummaryReport.xls` listing each data point and its status. The sandbox's 13-item list is from memory and unverified against the page's table |
| Isolation, live response and containment of IP/user | Mostly missing | Live response is "instant access to a device through a remote shell"; automatic attack disruption can isolate devices, contain IPs and contain users, with exclusions via device tags |
| Timeline flag / only-flagged filter / events-before | **Unverified** | Not found in the pages fetched. From your question rationale only |

### unverified, not fetched
KQL table schemas (`SigninLogs`, `AzureActivity`, `MicrosoftGraphActivityLogs`, `Behavior*`, `Device*`), `SignInActivityId` correlation, entity mapping by rule type, UEBA behavior tables, the "devices pending approval" flow, and the `DeviceEvents` platform coverage. Each currently rests on your question rationales.

## 3. Summary

| | Count |
|---|---|
| Labs whose core behavior matches the docs | 2 (`playbook-permissions`, `playbook-picker`; plus `sentinel-rbac`) |
| Labs that are partial | 3 (`detect-and-isolate`, `summary-rule`, `triage-ws23`) |
| Labs likely teaching the wrong tool | 1 (`unblock-lob1`) |
| Labs that cannot be verified from the docs | 1 (`hunting-favorites`) and 7 more not fetched |
| Whole-product gaps | Portal structure, case management, SOC optimization, data lake, Security Copilot, Purview, Entra ID Protection, Defender for Identity |

The decision logic (which role, which trigger, which scope) is mostly right. The **surface** is wrong: wrong portal layout, wrong menu names, and wizards much simpler than the real ones. Two behaviors your question rationales state do not appear in the current docs and need a tenant check.

## 4. Decisions needed

1. **`unblock-lob1`:** set 2 Q1 and set 1 Q4 say "Tenant Allow/Block List" for an endpoint file. The docs say that list is email-only. Should the lab follow the **question** (so the exam answer is practised) or the **product** (a file indicator with the Allow action)? I recommend teaching the product and noting the exam wording in the debrief.
2. **Hunting favorites (set 2 Q46):** keep as "exam says so, unverified" or remove until checked?
3. **Rebuild the shell** into one Defender portal layout using the real menu names (finding S1, S3). This changes every page and the coach's targets.

## 5. Next steps, in order

1. Fix the lab that teaches the wrong tool (`unblock-lob1`) once you decide item 4.1.
2. Rebuild the shell to the Defender-portal navigation, keeping a read-only Azure page only for IAM and Logic Apps, which are Azure resources.
3. Rebuild the custom-detection wizard, automation-rule wizard, summary-rule wizard and device page to the documented steps.
4. Add a `source` and `verified` field to every action and every lab, and show "unverified" in the UI.
5. Fetch the remaining pages (suppression rules, device groups and automation levels, entity mapping, UEBA, Graph activity logs, workbooks) and extend this ledger.


## 6. Iteration 3 changes (2026-10-30)

| Change | Why | Status |
|---|---|---|
| One **Defender portal** shell with Microsoft's section names (Investigation & response, Assets, Microsoft Sentinel, System > Settings); Azure kept separate for IAM and Logic Apps | S1, S3 | Fixed |
| **Advanced hunting is one page** that queries Defender and Sentinel tables together; schema pane grouped by source. The old "surfaces" are accepted but ignored | Docs: "Unified advanced hunting for SIEM, Defender, and the data lake" | Fixed |
| **Incidents & alerts is one page** with Incidents and Alerts tabs | Docs: unified incident queue | Fixed |
| "Alert suppression" renamed **Alert tuning** (Tune alert; actions Hide alert / Resolve alert; Set as behavior shown but not simulated) | [investigate-alerts](https://learn.microsoft.com/en-us/defender-xdr/investigate-alerts) (updated 2026-10-19) says the feature was "previously alert suppression" | Fixed in the UI. Internal action names still say suppression |
| **unblock-lob1 now teaches the file indicator** (Allow action, scoped to device groups, group scope beats All devices, Block needs the "Allow or block file" advanced feature). The Tenant Allow/Block List stays, labelled as an email feature, and refuses a file Allow with an explanation | Decision 1 (product over exam wording) | Fixed |
| Every lab shows a **verification level** (Matches Learn / Simplified / Unverified) on its card and in the coach | Decision 2 | Done |
| `hunting-favorites` is labelled **Unverified** | Decision 2 | Done, awaiting a tenant check |

### Still open after iteration 3

| Item | Notes |
|---|---|
| Custom detection wizard has one dialog; the real one has six steps, frequencies (24h, 12h, 3h, hourly, Continuous NRT, Custom), alert enrichment, scope and many actions | Not rebuilt |
| Automation rule wizard: one trigger, one condition, one action; real one has three triggers, conditions on tags and entities, tasks/status/severity/owner/tag actions, order, expiry | Not rebuilt |
| Summary rule wizard: no scheduling, preview or existing-table option | Not rebuilt |
| Device page: package is shown instantly; real flow downloads it from the Action center | Not rebuilt |
| Analytics rules page is read-only; entity mapping is a toggle, not the real "Alert enhancement > Entity mapping" editor (up to 10 mappings, 3 identifiers each) | Not rebuilt |
| BehaviorInfo and BehaviorEntities have fewer columns than the real preview tables (BehaviorInfo has `AccountUpn`, `ServiceSource`, `StartTime`, ... ) | Simplified |
| MicrosoftGraphActivityLogs: many real columns are missing (`UniqueTokenId`, `Roles`, `Scopes`, `ClientAuthMethod`, ...) | Simplified |
| Case management, SOC optimization, data lake tiers, Security Copilot, Sentinel graph | Not built |
| Anything checked against a live tenant | Nothing yet |
