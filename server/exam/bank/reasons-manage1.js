// Why each RIGHT choice is right, and why each ordering step sits where it does. Merged into the questions by bank/index.js.
//   right:  { 'exact option text': 'why' }       single and multi
//   steps:  ['why step 1', 'why step 2', ...]    order, in the correct order
//   blanks: { a: 'why the right pick is right' } dropdown, by blank id
// Say WHY, do not repeat the option. A wrong choice already carries its own reason in the question file.
export default {
  m001: { right: { 'Microsoft Sentinel Automation Contributor on RG-Playbooks for the Azure Security Insights identity': 'An automation rule runs the playbook as the Azure Security Insights service principal, and this role on the resource group is what lets that identity trigger playbooks there.' } },
  m002: { right: { 'Microsoft Sentinel Responder on the workspace and Microsoft Sentinel Playbook Operator on the playbook resource group': 'Responder lets the analysts triage incidents and Playbook Operator lets them run playbooks by hand. Together they meet the need without any rights to edit rules or playbooks.' } },
  m003: { right: { 'Grant the identity of PB-Restart an Azure RBAC role such as Virtual Machine Contributor': 'The playbook acts through its own managed identity, so that identity needs an RBAC role on the VM it restarts. Scope it to VM1 and no wider.' } },
  m004: { right: { 'An automation rule for this analytics rule with the Run playbook action': 'Automation rules are the mechanism that attaches an incident-trigger playbook to incidents from a given analytics rule. Incident settings do not run playbooks.' } },
  m005: { right: { 'A Logic App that starts with the Microsoft Sentinel incident trigger': 'A playbook is a Logic App, and it must use the incident trigger to be offered for an incident automation rule. It has to exist before it can be selected.' } },
  m006: { right: {
    'Assign owner': 'Assign owner is a built-in automation rule action that sets who owns the incident, which covers the Tier 1 assignment.',
    'Change status': 'Change status is a built-in action that moves the incident to Active, so no playbook is needed for this.',
  } },
  m007: { blanks: {
    a: 'Automation rules support an incident updated trigger as well as incident created and alert created.',
    b: 'The order number sets the sequence. Rules run from the lowest number up, so an earlier rule can change what a later one sees.',
    c: 'An automation rule acts on incidents. The query belongs to the analytics rule, which is edited in the rule itself.',
    d: 'Entity-trigger playbooks are run by hand from an entity page. Automation rules only run incident or alert trigger playbooks.',
  } },
  m008: { steps: [
    'The playbook has to exist first, with the incident trigger, because everything later refers to it.',
    'The Teams action is what the playbook does. Saving it makes the workflow available to select.',
    'Sentinel runs the playbook as its own identity, so that identity needs the role on the resource group before the playbook can be chosen.',
    'The automation rule defines when to react: when an incident is created, optionally with conditions.',
    'The Run playbook action goes last because it needs both the rule and a playbook Sentinel is allowed to run.',
  ] },
  m009: { right: { 'Require approval for remediation in core operating system folders': 'This level asks an analyst to approve changes only in core operating system folders, such as those on a domain controller, and lets everything else remediate automatically.' } },
  m010: { right: { 'The Servers device group': 'Device groups are matched in rank order and the first rule that matches wins. Servers has rank 1, so SRV-FIN-01 stops there and never reaches Finance.' } },
  m011: { right: { 'Audit mode': 'Audit mode records what the rule would have blocked without blocking it, so you can find the impact on the line-of-business macros before enforcing.' } },
  m012: { blanks: {
    a: 'IP and URL indicators only take effect when Custom network indicators is turned on in Advanced features.',
    b: 'Network protection must be in block mode on the device for the IP and URL blocks to be enforced, so they are not enforced when it is not.',
    c: 'File indicators depend on Defender Antivirus cloud-delivered protection, so with it off the block is not enforced.',
  } },
  m013: { right: { 'Edit the indicator and assign it a valid scope that lists the target device groups': 'An indicator with no valid target applies to no device and shows as Inactive. Giving it a scope of device groups is what makes it active.' } },
  m014: { right: { 'A threat analytics email notification rule filtered by report type or tag': 'Threat analytics has its own notification rules for new and updated reports, and you can filter them by report type or tag such as ransomware.' } },
  m015: { right: {
    'A Defender for Identity sensor is installed on a domain controller': 'The sensor on a domain controller is what carries out the Disable user action against Active Directory.',
    'A valid action account is configured for Defender for Identity': 'The sensor performs remediation as the action account, so that account must exist and have the right to disable users.',
  } },
  m016: { right: { 'No automated investigation starts on the device and analysts must investigate manually': 'In a group set to No automated response, automated investigation does not run, so the alert has to be investigated and remediated by an analyst.' } },
  m017: { steps: [
    'IP and URL indicators do nothing until this advanced feature is on, so it comes before creating one.',
    'Enforcement happens on the device through Network protection in block mode, so set it before relying on the indicator.',
    'With the prerequisites in place, create the indicator with the Block execution action.',
    'Verify last: confirm the indicator is Active and that a connection to the address is actually blocked.',
  ] },
  m018: { right: { 'A suppression rule scoped to Dev-Devices that has the action Resolve alert': 'A suppression rule matches this alert on these devices and resolves it automatically, which removes the daily noise and keeps a record for audit.' } },
};
