// Defender for Identity actions: respond to a compromised account, download a report. Rules: identity.js.

import { idSpec } from '../core/validate.js';
import { SimError } from './world.js';
import { ACTIONS, applyAction, getReport, downloadReport } from './identity.js';

const iso = { type: 'string', min: 10, max: 30, pattern: /^[0-9T:.\-Z+]+$/ };
const find = (w, id) => w.identity.accounts.find((a) => a.id === id) ?? null;

export const IDENTITY_ACTIONS = {
  // Assets > Identities > the account > Actions. Authorized by the signed-in person's roles; executed by the sensor on a domain controller.
  'identity.respond': {
    spec: { accountId: idSpec(), action: { type: 'enum', values: ACTIONS } },
    run({ w }, p) {
      const acct = find(w, p.accountId);
      if (!acct) throw new SimError('Account not found', 'NotFound');
      const next = applyAction(acct, p.action);
      Object.assign(acct, next);
      w.identity.actionLog.push({ accountId: acct.id, action: p.action, at: Date.now() });
      if (w.identity.actionLog.length > 100) w.identity.actionLog.shift();
      return { account: { id: acct.id, enabled: acct.enabled } };
    },
  },
  // Reports > Identities > Report management > Download. The sandbox records that it was downloaded and returns the row count.
  'identity.downloadReport': {
    spec: { reportId: idSpec(), from: iso, to: iso },
    run({ w }, p) {
      const report = getReport(p.reportId);
      const rows = downloadReport(report, w.identity.reportRows[p.reportId] ?? [], { from: new Date(p.from), to: new Date(p.to), now: Date.now() });
      w.identity.downloads.push({ reportId: p.reportId, rows: rows.length, accounts: [...new Set(rows.map((r) => r.account))].sort() });
      if (w.identity.downloads.length > 40) w.identity.downloads.shift();
      return { rows: rows.length, preview: rows.slice(0, 50).map((r) => ({ at: r.at.toISOString(), account: r.account, detail: r.detail })) };
    },
  },
  // The alert's own "download detailed report" button. The format is fixed.
  'identity.downloadAlertReport': {
    spec: { alertId: idSpec() },
    run({ w }, p) {
      const alert = w.identity.alerts.find((a) => a.id === p.alertId);
      if (!alert) throw new SimError('Alert not found', 'NotFound');
      alert.reportDownloaded = true;
      return { file: `${alert.id}-detailed-report.xlsx` };
    },
  },
};
