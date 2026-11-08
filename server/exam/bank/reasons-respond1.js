// Why each RIGHT choice is right, and why each ordering step sits where it does (see reasons-manage1.js for the format).
export default {
  r001: { right: { 'Disable user': 'For an on-premises Active Directory account under active attack, Disable user stops it from signing in or reaching network resources.' } },
  r002: { right: { 'Modification to sensitive groups': 'This Defender for Identity report lists changes to sensitive groups such as Enterprise Admins over the period you pick.' } },
  r003: { right: { 'Confirm the user as compromised and revoke the active sign-in sessions': 'Confirming compromise raises the user risk, and revoking sessions invalidates the tokens the attacker already holds, which ends the existing access.' } },
  r004: { right: { 'Require the user to re-register MFA methods': 'The attacker added their own authenticator, and a password reset does not remove it. Requiring re-registration clears the registered methods.' } },
  r005: { right: { 'Take a remediation action on the message from Threat Explorer': 'Threat Explorer finds delivered messages and lets you soft delete, move or quarantine them from every mailbox that received them.' } },
  r006: { right: { 'Ban the app from the OAuth apps page in the portal': 'Banning an OAuth app revokes the consent users gave it and blocks anyone from granting it again.' } },
  r007: { right: { 'The investigation graph view': 'The investigation graph draws the incident entities and how they relate to alerts and events. It works because the rule has entity mapping.' } },
  r008: { right: { 'Microsoft Defender XDR': 'Security Copilot reads Defender incidents, alerts and devices through this plugin. Without it the embedded experience has no Defender data.' } },
  r009: { right: { 'Open the attack story and the incident graph, then the device timeline': 'The incident has already correlated the email, sign-in and device alerts into one story, so start there and drill into the device timeline for detail.' } },
  r010: { right: {
    'Review logon events for the account on other devices': 'Where else the account logged on shows how far the attacker moved, for example in DeviceLogonEvents.',
    'Check the lateral movement paths report for affected accounts': 'The report shows which sensitive accounts and machines are reachable from the affected ones, which sets the scope of the movement.',
  } },
  r011: { right: {
    'Classify it as a true positive with a phishing determination': 'Recording the classification and determination keeps reporting consistent across the SOC.',
    'Assign the incident to the analyst and add a closing comment': 'An owner and a closing comment leave an audit trail of who handled the incident and what was found.',
  } },
  r012: { right: { 'An insider risk management policy for departing users': 'Insider risk management has a template for data theft by departing users, and it scores activity such as large downloads around a resignation.' } },
  r013: { right: { 'The Microsoft Purview portal and the Defender portal': 'DLP alerts are shown in the Purview portal and also in the Defender portal alongside other alerts, so the SOC can review them together.' } },
  r014: { right: { 'Block outbound traffic to that IP address in a network security group': 'A targeted rule stops the command-and-control traffic while the VM keeps serving the application, so availability is kept.' } },
  r015: { blanks: {
    a: 'Automatic attack disruption can contain a user account when the signals show a high-confidence attack such as ransomware.',
    b: 'Disruption acts automatically to limit the spread of the attack, so it does not wait for an analyst to approve each action.',
    c: 'Analysts can review disruption actions in the Action center and release a contained asset once they have checked that the threat is gone.',
  } },
  r016: { steps: [
    'Confirm it is a true positive first, so you do not take action on something that is not an attack.',
    'Contain next to stop the spread while you work out the detail.',
    'Then hunt for related activity from the same entities to find the full scope.',
    'Remediate and recover once you know what was affected, so nothing is missed.',
    'Close last, with the classification and a summary comment, so the record is accurate.',
  ] },
  r017: { blanks: {
    a: 'Disable user works on Active Directory accounts and stops sign-in and access to network resources.',
    b: 'Revoke session works on Entra ID accounts, where it invalidates the tokens the attacker is using.',
  } },
};
