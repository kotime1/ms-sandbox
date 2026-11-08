// Why each RIGHT choice is right, and why each ordering step sits where it does (see reasons-manage1.js for the format).
export default {
  r018: { right: { 'Collect an investigation package': 'It gathers a ZIP of processes, connections and scheduled tasks without interrupting the user or opening a session, which is what the snapshot needs.' } },
  r019: { right: { 'Submit the file for deep analysis, then add the hash as a block indicator': 'Deep analysis runs the file in a sandbox and reports what it does. Blocking its hash with an indicator then stops it on every device if it proves malicious.' } },
  r020: { right: { 'Flag the key events then enable Only flagged events plus the time bar': 'Flagging marks the events that matter, the filter shows only those, and the time bar brings in the events just before the first one.' } },
  r021: { right: { 'The page for the file entity in the Defender portal': 'A file page shows how many devices have seen the file, when it was first seen and the alerts and devices tied to it.' } },
  r022: { right: { 'The Action center, by using the undo option on the disruption action': 'Disruption actions are listed in the Action center, and an analyst can release the contained device or user there once the threat is cleared.' } },
  r023: { right: {
    'Run a command to list the running processes': 'Live response is an interactive command-line session on the device, so commands such as listing processes run there.',
    'Download a suspicious file from the device': 'Live response can collect files from the device for analysis, which is one of its main uses.',
  } },
  r024: { right: { 'One year': 'Audit (Premium) keeps Exchange, SharePoint, OneDrive and Entra ID records for one year by default, so activity from eleven months ago is still searchable.' } },
  r025: { right: { AirInvestigation: 'This is the record type for automated investigation and response activity in Defender XDR.' } },
  r026: { blanks: {
    a: 'What a user did in Microsoft 365, such as sharing a file externally, is recorded in the Purview Audit log.',
    b: 'How and from where someone authenticated, with the IP address and method, is in the Entra sign-in logs.',
    c: 'Changes to the directory, such as a new app registration, are recorded in the Entra audit logs.',
  } },
  r027: { right: { 'Split the search into smaller searches by location or date range': 'CS007 means the search is too large or complex. Smaller searches by location or date range each fit inside the limits.' } },
  r028: { right: { 'The Microsoft Graph activity logs in the workspace': 'These logs record each Graph API request with its path, method, response code and caller IP, which is the detail the investigation needs.' } },
  r029: { right: { UniqueTokenIdentifier: 'The sign-in activity ID in the Graph activity log matches the unique token identifier of the sign-in that issued the token, which links the call to the sign-in.' } },
  r030: { steps: [
    'Check first that auditing is on, because there is nothing to search if it was never enabled.',
    'Then run the search with the date range and the SharePoint file activities that match the question.',
    'Narrow the results to the site and read who did it and from where.',
    'Export last, so the evidence you found is attached to the incident record.',
  ] },
  r031: { right: { 'A Kerberos ticket was stolen and replayed from another device': 'Pass-the-ticket is an attacker replaying a stolen Kerberos ticket from another machine, which matches one ticket used from two devices.' } },
};
