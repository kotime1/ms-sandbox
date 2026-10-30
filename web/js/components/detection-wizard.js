// The custom detection rule wizard. Six steps, as documented:
//   1 Prepare the query  2 Alert details  3 Alert enrichment  4 Actions  5 Scope  6 Review and turn on
// https://learn.microsoft.com/en-us/defender-xdr/custom-detection-rules  (2026-09-02)
import { h, badge, clear } from '../dom.js';
import { wizard, row, notSimulated } from './wizard.js';
import { ctx } from '../app.js';

const SEVERITIES = ['Informational', 'Low', 'Medium', 'High'];
const CATEGORIES = ['Collection', 'Command and control', 'Credential access', 'Defense evasion', 'Discovery', 'Execution', 'Exfiltration', 'Exploit', 'Initial access', 'Lateral movement', 'Malware', 'Persistence', 'Privilege escalation', 'Ransomware', 'Suspicious activity', 'Unwanted software'];
const GROUPS = ['Devices', 'Files', 'Users', 'Emails'];
const FREQ_ORDER = ['24h', '12h', '3h', '1h', 'nrt'];

const select = (options, value, onchange) => h('select', { value, onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
const text = (value, onchange, attrs = {}) => h('input', { type: 'text', value, maxlength: '120', oninput: (e) => onchange(e.target.value), ...attrs });

/**
 * Open the wizard. `existing` is a rule from the detections view to edit, `query` pre-fills step 1 (from Advanced hunting).
 */
export async function openDetectionWizard({ query = '', existing = null, devices = [], groups = [] } = {}) {
  const state = existing
    ? { id: existing.id, name: existing.name, query: existing.query, frequency: existing.frequency, alertTitle: existing.alertTitle, severity: existing.severity, category: existing.category, tactic: existing.tactic, techniques: existing.techniques.join(', '), description: existing.description, recommendedActions: existing.recommendedActions, customDetails: existing.customDetails.map((c) => ({ ...c })), entities: existing.entities.map((e) => ({ ...e })), actions: Object.fromEntries(existing.actionDefs.map((a) => [a.type, { ...a }])), scopeType: existing.scope.type, scopeGroups: [...existing.scope.groups] }
    : { name: 'My detection rule', query, frequency: '24h', alertTitle: '', severity: 'Medium', category: 'Suspicious activity', tactic: '', techniques: '', description: '', recommendedActions: '', customDetails: [], entities: [], actions: {}, scopeType: 'all', scopeGroups: [] };
  state.preview = null; // server answer for the current query
  state.previewQuery = null;

  const refreshPreview = async () => {
    if (state.previewQuery === state.query && state.preview) return state.preview;
    const out = await ctx.act('defender.previewDetection', { query: state.query }, { silentError: true, noRefresh: true });
    if (!out.ok) { state.preview = null; state.previewQuery = state.query; state.previewError = out.error.message; return null; }
    state.preview = out.data.preview; state.previewQuery = state.query; state.previewError = null;
    return state.preview;
  };

  const steps = [
    {
      id: 'query', title: 'Prepare the query',
      render(body) {
        const area = h('textarea', { class: 'kql', rows: '9', maxlength: '4000', 'aria-label': 'KQL query', oninput: (e) => { state.query = e.target.value; } });
        area.value = state.query;
        const result = h('div', { class: 'muted small' });
        const run = async () => {
          clear(result).append('Running…');
          state.previewQuery = null;
          const p = await refreshPreview();
          clear(result);
          if (!p) { result.append(h('div', { class: 'form-error', role: 'alert' }, state.previewError)); return; }
          result.append(h('p', null, `${p.rowCount} result row(s) from ${p.tables.join(', ')}. Columns: `, h('code', null, p.columns.join(', '))));
          result.append(p.nrt.allowed ? h('p', { class: 'muted small' }, 'This query can run as Continuous (NRT).') : h('p', { class: 'muted small' }, `Continuous (NRT) is not available: ${p.nrt.reason}`));
        };
        body.append(
          h('h3', null, 'Prepare the query'),
          h('p', { class: 'muted' }, 'Run the query to see its columns. Recommended: return Timestamp, plus DeviceId and ReportId for endpoint tables, and a column that identifies the impacted asset (DeviceId, AccountUpn, RecipientEmailAddress...). After summarize, arg_max(Timestamp, *) keeps them.'),
          area, h('div', { class: 'toolbar' }, h('button', { class: 'btn', type: 'button', onclick: run }, '▶ Run query')), result,
          h('p', { class: 'note small' }, 'Each rule can raise at most 150 alerts per run. Tweak the query so normal, day-to-day activity does not alert.'));
        if (state.query.trim()) run();
      },
      validate: () => (state.query.trim() ? null : 'Enter a query.'),
    },
    {
      id: 'details', title: 'Alert details',
      render(body) {
        const hasNrt = state.preview?.nrt;
        const freq = select(FREQ_ORDER.map((f) => [f, `${state.preview?.frequencies?.[f]?.label ?? f}${state.preview?.frequencies?.[f] ? ` (lookback: ${state.preview.frequencies[f].lookback})` : ''}`]), state.frequency, (v) => { state.frequency = v; paintNrt(); });
        const nrtNote = h('div', { class: 'hint-text' });
        const paintNrt = () => { nrtNote.textContent = state.frequency === 'nrt' && hasNrt && !hasNrt.allowed ? `Continuous (NRT) is not available for this query: ${hasNrt.reason}` : ''; nrtNote.classList.toggle('form-error', Boolean(nrtNote.textContent)); };
        paintNrt();
        body.append(
          h('h3', null, 'Alert details'),
          row('Detection name', text(state.name, (v) => { state.name = v; }), 'Make it unique.'),
          row('Frequency', freq, 'When you save, the rule runs and checks past data; it then runs again at this frequency. Defender data uses a fixed lookback per frequency.'), nrtNote,
          row('Alert title', text(state.alertTitle, (v) => { state.alertTitle = v; }, { placeholder: 'e.g. Brute force on {{DeviceName}}' }), 'Plain text. Use {{Column}} to insert a value from the results (up to three columns). HTML and Markdown do not work.'),
          row('Severity', select(SEVERITIES.map((s) => [s, s]), state.severity, (v) => { state.severity = v; })),
          row('Category', select(CATEGORIES.map((c) => [c, c]), state.category, (v) => { state.category = v; })),
          row('MITRE ATT&CK tactic', text(state.tactic, (v) => { state.tactic = v; }, { placeholder: 'e.g. Credential Access' })),
          row('Techniques', text(state.techniques, (v) => { state.techniques = v; }, { placeholder: 'e.g. T1110, T1078' }), 'Comma separated.'),
          row('Description', h('textarea', { rows: '3', maxlength: '500', oninput: (e) => { state.description = e.target.value; } }, state.description), 'Plain text. {{Column}} works here too.'),
          row('Recommended actions', h('textarea', { rows: '2', maxlength: '500', oninput: (e) => { state.recommendedActions = e.target.value; } }, state.recommendedActions)),
          notSimulated('"Custom" frequency (5 minutes to 14 days) is only for Sentinel-only data; linking a threat analytics report is not available.'));
      },
      validate: () => (!state.name.trim() ? 'Enter a detection name.' : !state.alertTitle.trim() ? 'Enter an alert title.' : null),
    },
    {
      id: 'enrich', title: 'Alert enrichment',
      render(body) {
        const cols = state.preview?.columns ?? [];
        const colSelect = (value, onchange) => select([['', 'Select a column'], ...cols.map((c) => [c, c])], value, onchange);
        const details = h('div', null);
        const entities = h('div', null);
        const paint = () => {
          clear(details).append(...state.customDetails.map((c, i) => h('div', { class: 'wz-pair' },
            row('Key', text(c.key, (v) => { c.key = v; })), row('Parameter', colSelect(c.column, (v) => { c.column = v; })),
            h('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Remove custom detail', onclick: () => { state.customDetails.splice(i, 1); paint(); } }, 'Remove'))));
          clear(entities).append(...state.entities.map((e, i) => h('div', { class: 'wz-pair' },
            row('Entity type', select([['Device', 'Device'], ['Account', 'Account'], ['Mailbox', 'Mailbox']], e.type, (v) => { e.type = v; })), row('Column', colSelect(e.column, (v) => { e.column = v; })),
            h('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Remove entity', onclick: () => { state.entities.splice(i, 1); paint(); } }, 'Remove'))));
        };
        paint();
        body.append(
          h('h3', null, 'Alert enrichment'),
          h('p', { class: 'muted' }, 'Impacted assets are used to group alerts into incidents and to target response actions. You can map one column per entity type.'),
          h('h4', null, 'Impacted assets'), entities,
          h('button', { class: 'btn small', type: 'button', disabled: state.entities.length >= 3, onclick: () => { state.entities.push({ type: 'Device', column: cols.find((c) => c === 'DeviceId') ?? '' }); paint(); } }, '+ Add impacted asset'),
          h('h4', null, `Custom details (${state.customDetails.length}/20)`), h('p', { class: 'muted small' }, 'Key/value pairs shown in the alert side panel. 4 KB total per alert.'), details,
          h('button', { class: 'btn small', type: 'button', disabled: state.customDetails.length >= 20, onclick: () => { state.customDetails.push({ key: '', column: '' }); paint(); } }, '+ Add custom detail'),
          notSimulated('Related evidence (process, file, IP, URL...), and expanded cloud-resource entities.'));
      },
      validate: () => (state.customDetails.some((c) => !c.key.trim() || !c.column) ? 'Each custom detail needs a key and a parameter.' : state.entities.some((e) => !e.column) ? 'Pick a column for each impacted asset.' : null),
    },
    {
      id: 'actions', title: 'Actions',
      render(body) {
        const acts = state.preview?.actions ?? {};
        body.append(h('h3', null, 'Actions'), h('p', { class: 'muted' }, 'Actions apply to the devices, files, users or emails the query returns. An action is unavailable until the query returns the column it needs.'));
        for (const g of GROUPS) {
          const inGroup = Object.entries(acts).filter(([, a]) => a.group === g);
          if (!inGroup.length) continue;
          const sec = h('div', { class: 'action-group' }, h('h4', null, `Actions on ${g.toLowerCase()}`));
          for (const [id, a] of inGroup) {
            const on = Boolean(state.actions[id]);
            const extra = h('span', null);
            const paintExtra = () => {
              clear(extra);
              if (!state.actions[id]) return;
              if (id === 'moveToFolder') extra.append(select(['Junk', 'Inbox', 'Deleted items'].map((f) => [f, f]), state.actions[id].folder ?? 'Inbox', (v) => { state.actions[id].folder = v; }));
              if (id === 'deleteEmail') extra.append(select([['soft', 'Soft delete (Deleted Items)'], ['hard', 'Hard delete']], state.actions[id].mode ?? 'soft', (v) => { state.actions[id].mode = v; }));
            };
            const cb = h('input', { type: 'checkbox', checked: on, disabled: !a.available, 'data-target': `action:${id}`, onchange: (e) => {
              if (e.target.checked) state.actions[id] = { type: id, ...(id === 'moveToFolder' ? { folder: 'Inbox' } : {}), ...(id === 'deleteEmail' ? { mode: 'soft' } : {}) }; else delete state.actions[id];
              paintExtra();
            } });
            sec.append(h('div', { class: `action-item ${a.available ? '' : 'off'}` }, cb,
              h('label', null, h('strong', null, a.label), ' ', h('span', { class: 'muted' }, a.note), ' ', extra),
              a.available ? null : h('span', { class: 'why' }, `Needs ${a.missing.join(' and ')} in the query results.`)));
            paintExtra();
          }
          body.append(sec);
        }
        body.append(notSimulated('Governance actions for SaaS identities (Box, Google Workspace, Salesforce), and approving a block with Remediate permission.'));
      },
    },
    {
      id: 'scope', title: 'Scope',
      render(body) {
        const checks = h('div', null);
        const paint = () => {
          clear(checks);
          if (state.scopeType !== 'groups') return;
          checks.append(...groups.map((g) => h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: state.scopeGroups.includes(g.id), onchange: (e) => { state.scopeGroups = e.target.checked ? [...state.scopeGroups, g.id] : state.scopeGroups.filter((x) => x !== g.id); paint(); } }), ` ${g.name}`)), h('p', { class: 'muted small' }, `Devices in scope: ${devices.filter((d) => (d.groups ?? []).some((x) => state.scopeGroups.includes(x))).map((d) => d.name).join(', ') || 'none'}`));
        };
        paint();
        body.append(
          h('h3', null, 'Scope'),
          h('p', { class: 'muted' }, 'The scope decides which devices the rule covers. It affects rules that check devices; rules that only check mailboxes or accounts are not narrowed by it. The rule only queries and acts on devices in scope.'),
          h('label', { class: 'toggle' }, h('input', { type: 'radio', name: 'scope', checked: state.scopeType === 'all', onchange: () => { state.scopeType = 'all'; paint(); } }), ' All devices'), h('br'),
          h('label', { class: 'toggle' }, h('input', { type: 'radio', name: 'scope', checked: state.scopeType === 'groups', onchange: () => { state.scopeType = 'groups'; paint(); } }), ' Specific device groups'),
          checks);
      },
      validate: () => (state.scopeType === 'groups' && !state.scopeGroups.length ? 'Choose at least one device group, or scope the rule to all devices.' : null),
    },
    {
      id: 'review', title: 'Review and turn on',
      render(body) {
        const chosen = Object.values(state.actions);
        body.append(h('div', { class: 'review' },
          h('h3', null, 'Review'),
          h('dl', null,
            h('dt', null, 'Name'), h('dd', null, state.name),
            h('dt', null, 'Frequency'), h('dd', null, state.preview?.frequencies?.[state.frequency]?.label ?? state.frequency),
            h('dt', null, 'Alert title'), h('dd', null, state.alertTitle),
            h('dt', null, 'Severity / category'), h('dd', null, `${state.severity} / ${state.category}`),
            h('dt', null, 'Impacted assets'), h('dd', null, state.entities.map((e) => `${e.type}: ${e.column}`).join(', ') || 'None'),
            h('dt', null, 'Custom details'), h('dd', null, state.customDetails.map((c) => `${c.key} = ${c.column}`).join(', ') || 'None'),
            h('dt', null, 'Actions'), h('dd', null, chosen.length ? chosen.map((a) => badge(state.preview?.actions?.[a.type]?.label ?? a.type, a.type === 'isolateDevice' ? 'warn' : '')) : 'None'),
            h('dt', null, 'Scope'), h('dd', null, state.scopeType === 'all' ? 'All devices' : state.scopeGroups.map((g) => groups.find((x) => x.id === g)?.name ?? g).join(', '))),
          h('p', { class: 'note small' }, 'Selecting Create saves the rule and runs it immediately. Review the actions: automatic response actions run on every match.'),
          h('h4', null, 'Query'), h('pre', { class: 'code' }, state.query)));
      },
    },
  ];

  // Load the preview before the first paint so steps 2-4 know the columns and which actions are possible.
  if (state.query.trim()) await refreshPreview();

  const wz = wizard({
    title: existing ? `Edit ${existing.name}` : 'Create custom detection rule',
    intro: 'Real path: Investigation & response > Hunting > Custom detection rules > + Create detection rule (or Advanced hunting > Create detection rule).',
    steps, state, finishLabel: existing ? 'Save' : 'Create',
    async onFinish() {
      const o = await ctx.act('defender.saveDetection', {
        ...(state.id ? { id: state.id } : {}),
        name: state.name, query: state.query, frequency: state.frequency, alertTitle: state.alertTitle, severity: state.severity, category: state.category,
        tactic: state.tactic || undefined, techniques: state.techniques.split(',').map((t) => t.trim()).filter(Boolean), description: state.description || undefined, recommendedActions: state.recommendedActions || undefined,
        customDetails: state.customDetails, entities: state.entities, actions: Object.values(state.actions),
        scopeType: state.scopeType, scopeGroups: state.scopeGroups,
      }, { silentError: true });
      if (!o.ok) return o.error.message;
      wz.close();
      ctx.toast(`Detection rule saved. It raised ${o.data.detection.alerts} alert(s).${o.data.warnings.length ? ` ${o.data.warnings.length} suggestion(s): ${o.data.warnings[0]}` : ''}`, 'ok');
      ctx.navigate('defender/rules');
      await ctx.reloadPage();
      return undefined;
    },
  });
  return wz;
}
