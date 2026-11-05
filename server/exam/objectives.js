// SC-200 skills measured, as published on Microsoft Learn (study guide updated 21 Oct 2026).
// Every exam question names one of these bullets, so coverage can be checked by test and the weights
// below are the official domain ranges. Wording is Microsoft's; do not paraphrase it.

export const DOMAINS = {
  manage: { label: 'Manage a security operations environment', min: 40, max: 45, target: 42 },
  respond: { label: 'Respond to security incidents', min: 35, max: 40, target: 38 },
  hunt: { label: 'Perform threat hunting', min: 20, max: 25, target: 20 },
};

export const OBJECTIVES = [
  { domain: 'manage', group: 'Configure automation for Microsoft Defender XDR and Microsoft Sentinel', bullets: [
    'Configure email notifications in Microsoft Defender XDR, including incidents, actions, and threat analytics',
    'Configure alert notifications in Microsoft Defender XDR, including tuning, suppression, and correlation',
    'Configure Microsoft Defender for Endpoint advanced features',
    'Configure rules settings in Microsoft Defender for Endpoint',
    'Configure custom data collection in Microsoft Defender for Endpoint',
    'Configure security policies for Microsoft Defender for Endpoint, including attack surface reduction (ASR) rules',
    'Manage automated investigation and response capabilities in Microsoft Defender XDR',
    'Configure automatic attack disruption in Microsoft Defender XDR',
    'Configure and manage device groups, permissions, and automation levels in Microsoft Defender for Endpoint',
    'Create and configure automation rules in Microsoft Sentinel',
    'Create and configure Microsoft Sentinel playbooks',
  ] },
  { domain: 'manage', group: 'Configure the Microsoft Sentinel SIEM and platform', bullets: [
    'Specify Microsoft Sentinel roles',
    'Manage data retention for XDR and Microsoft Sentinel tables, including Analytics, Data lake, and XDR tiers',
    'Create and configure Microsoft Sentinel workbooks',
    'Optimize the Microsoft Sentinel platform, including SOC optimization recommendations',
  ] },
  { domain: 'manage', group: 'Ingest data into the Microsoft Sentinel SIEM and platform', bullets: [
    'Select data connectors based on data source requirements, including Windows logs and security events',
    'Configure collection of Windows Security events by using Windows Security Events via AMA, including data collection rules',
    'Plan and configure collection of Windows Security events by using Windows Event Forwarding (WEF)',
    'Plan and configure Syslog via AMA and Common Event Format (CEF) via AMA connectors',
    'Configure collection of Azure activity logs by using Azure Policy and resource diagnostic settings',
    'Ingest threat indicators into Microsoft Sentinel',
    'Create custom log tables in the workspace to store ingested data',
  ] },
  { domain: 'manage', group: 'Configure detections', bullets: [
    'Create custom detection rules by using Advanced Hunting in Microsoft Defender XDR',
    'Manage custom detection rules in Microsoft Defender XDR',
    'Configure and manage analytics rules in Microsoft Sentinel SIEM, including scheduled, near-real time (NRT), threat intelligence, and machine learning',
    'Analyze attack vector coverage by using the MITRE ATT&CK matrix',
    'Configure anomalies in Microsoft Sentinel',
  ] },
  { domain: 'respond', group: 'Respond to alerts and incidents in Microsoft Defender XDR', bullets: [
    'Investigate and remediate threats by using Microsoft Defender for Office 365, including automatic attack disruption',
    'Investigate and remediate threats or compromised entities identified by Microsoft Purview',
    'Investigate and remediate alerts and incidents identified by Microsoft Defender for Cloud workload protections',
    'Investigate and remediate security risks identified by Microsoft Defender for Cloud Apps',
    'Investigate and remediate compromised identities that are identified by Microsoft Entra ID',
    'Investigate and remediate security alerts from Microsoft Defender for Identity',
    'Investigate and remediate alerts and incidents identified by Microsoft Sentinel',
    'Investigate incidents by using agentic AI, including embedded Microsoft Security Copilot',
    'Investigate complex attacks, such as multi-stage, multi-domain, and lateral movement',
    'Manage security incidents by using case management',
  ] },
  { domain: 'respond', group: 'Respond to alerts and incidents in Microsoft Defender for Endpoint', bullets: [
    'Investigate device timelines',
    'Perform actions on the device, including live response and collecting investigation packages',
    'Perform evidence and entity investigation',
    'Investigate and remediate incidents identified by automatic attack disruption',
  ] },
  { domain: 'respond', group: 'Investigate Microsoft 365 activities to identify threats', bullets: [
    'Investigate threats by using Microsoft Purview Audit',
    'Investigate threats by using Content search in Microsoft Purview eDiscovery',
    'Investigate threats by using Microsoft Graph activity logs',
  ] },
  { domain: 'hunt', group: 'Detect threats by using Microsoft Defender XDR', bullets: [
    'Identify the appropriate table to use in a KQL query',
    'Identify threats by using Kusto Query Language (KQL)',
    'Create Advanced Hunting queries',
    'Interpret threat analytics in Microsoft Defender XDR',
    'Create hunting graphs, including blast radius',
    'Analyze relationships between entities by using Sentinel Graph',
  ] },
  { domain: 'hunt', group: 'Detect threats by using the Microsoft Sentinel platform', bullets: [
    'Create and monitor hunting queries',
    'Create and manage KQL jobs in Data lake',
    'Create and manage Summary rule tables for querying',
    'Hunt for threats by using Notebooks, including connection to the Sentinel MCP Server',
  ] },
];

/** bullet text -> domain key */
export const BULLET_DOMAIN = new Map(OBJECTIVES.flatMap((g) => g.bullets.map((b) => [b, g.domain])));
export const DOMAIN_KEYS = Object.keys(DOMAINS);
