// "Create new automation rule" panel.
// Real path: Microsoft Sentinel > Configuration > Automation > Create > Automation rule  (Defender portal)
// https://learn.microsoft.com/en-us/azure/sentinel/create-manage-use-automation-rules  (2026-07-01)
import { h, clear } from '../dom.js';
import { modal, field } from './modal.js';
import { notSimulated } from './wizard.js';
import { ctx } from '../app.js';

const TRIGGERS = [['incidentCreated', 'When incident is created'], ['incidentUpdated', 'When incident is updated'], ['alertCreated', 'When alert is created']];
const ACTION_TYPES = [['assignOwner', 'Assign owner'], ['changeStatus', 'Change status'], ['changeSeverity', 'Change severity'], ['addTags', 'Add tags'], ['runPlaybook', 'Run playbook']];
const SEVERITIES = ['Informational', 'Low', 'Medium', 'High'];
const STATUSES = ['New', 'Active', 'Closed'];
const CLASSIFICATIONS = ['True Positive - suspicious activity', 'Benign Positive - suspicious but expected', 'False Positive - incorrect alert logic', 'False Positive - incorrect data', 'Undetermined'];
const UPDATED_BY = ['Application', 'User', 'Playbook', 'Automation rule', 'Alert grouping', 'Other'];

const select = (options, value, onchange, attrs = {}) => h('select', { onchange: (e) => onchange(e.target.value), ...attrs }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));

/**
 * @param meta   { conditions: { [trigger]: [{id,label,kind,values,operators:[{id,label}]}] }, analyticsRules, playbooks, owners, nextOrder }
 * @param existing a rule from the automation view to edit, or null
 */
export function openAutomationPanel({ meta: initialMeta, existing = null, grantPermission }) {
  let meta = initialMeta; // refreshed in place after "Manage playbook permissions"
  const state = existing
    ? { id: existing.id, name: existing.name, trigger: existing.trigger, conditions: existing.conditions.map((c) => ({ ...c, values: [...c.values] })), actions: existing.actions.map((a) => ({ ...a, tags: a.tags ? [...a.tags] : undefined })), expires: existing.expiresAt ? new Date(existing.expiresAt).toISOString().slice(0, 16) : '', order: existing.order }
    : { name: '', trigger: 'incidentCreated', conditions: [], actions: [], expires: '', order: null };

  const condBox = h('div', null);
  const actBox = h('div', null);
  const orderInput = h('input', { type: 'number', min: '1', max: '1000', value: String(state.order ?? meta.nextOrder[state.trigger] ?? 1), oninput: (e) => { state.order = Number(e.target.value) || null; } });
  let m;

  const propsFor = () => meta.conditions[state.trigger] ?? [];
  const paintConditions = () => {
    const props = propsFor();
    clear(condBox);
    if (state.trigger === 'alertCreated') condBox.append(h('p', { class: 'muted small' }, 'Rules for "When alert is created" support only the Analytic rule name condition.'));
    state.conditions.forEach((c, i) => {
      const prop = props.find((p) => p.id === c.property) ?? props[0];
      if (!prop) return;
      const ops = prop.operators;
      if (!ops.some((o) => o.id === c.operator)) c.operator = ops[0].id;
      const needsValue = c.operator !== 'changed';
      let valueEl;
      if (!needsValue) valueEl = h('span', { class: 'muted' }, '(any change)');
      else if (prop.kind === 'enum') valueEl = select(prop.values.map((v) => [v, v]), c.values[0] ?? prop.values[0], (v) => { c.values = [v]; }, { 'aria-label': 'Value' });
      else if (prop.kind === 'rule') valueEl = h('select', { multiple: true, size: '4', 'aria-label': 'Analytic rule names', onchange: (e) => { c.values = [...e.target.selectedOptions].map((o) => o.value); } }, meta.analyticsRules.map((r) => h('option', { value: r.name, selected: c.values.includes(r.name) }, r.name)));
      else valueEl = h('input', { type: 'text', value: c.values.join(', '), maxlength: '120', 'aria-label': 'Value', placeholder: 'value (separate several with commas)', oninput: (e) => { c.values = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); } });
      condBox.append(h('div', { class: 'wz-pair auto-cond' },
        h('div', null, h('label', null, 'If'), select(props.map((p) => [p.id, p.label]), prop.id, (v) => { c.property = v; c.values = []; paintConditions(); }, { 'aria-label': 'Property' })),
        h('div', null, h('label', null, 'Operator'), select(ops.map((o) => [o.id, o.label]), c.operator, (v) => { c.operator = v; paintConditions(); }, { 'aria-label': 'Operator' })),
        h('div', null, h('label', null, 'Value'), valueEl),
        h('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Remove condition', onclick: () => { state.conditions.splice(i, 1); paintConditions(); } }, 'Remove')));
    });
    const canAdd = props.length > 0 && (state.trigger !== 'alertCreated' || state.conditions.length < 1);
    condBox.append(h('button', { class: 'btn small', type: 'button', disabled: !canAdd, 'data-target': 'btn:add-condition', onclick: () => { state.conditions.push({ property: props[0].id, operator: props[0].operators[0].id, values: [] }); paintConditions(); } }, '+ Add condition (AND)'));
  };

  const playbookOptions = () => meta.playbooks.filter((p) => p.trigger === (state.trigger === 'alertCreated' ? 'alert' : 'incident'));
  const paintActions = () => {
    clear(actBox);
    const allowed = state.trigger === 'alertCreated' ? ACTION_TYPES.filter(([t]) => t === 'runPlaybook') : ACTION_TYPES;
    state.actions.forEach((a, i) => {
      if (!allowed.some(([t]) => t === a.type)) { state.actions.splice(i, 1); return; }
      const fields = h('div', { class: 'grow' });
      if (a.type === 'assignOwner') fields.append(select([['', 'Select an owner'], ...meta.owners.map((o) => [o, o])], a.owner ?? '', (v) => { a.owner = v; }, { 'aria-label': 'Owner' }));
      if (a.type === 'changeSeverity') fields.append(select(SEVERITIES.map((s) => [s, s]), a.severity ?? 'Medium', (v) => { a.severity = v; }, { 'aria-label': 'Severity' }));
      if (a.type === 'addTags') fields.append(h('input', { type: 'text', value: (a.tags ?? []).join(', '), maxlength: '120', placeholder: 'tag1, tag2', 'aria-label': 'Tags', oninput: (e) => { a.tags = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); } }));
      if (a.type === 'changeStatus') {
        const closing = h('div', null);
        const paintClose = () => {
          clear(closing);
          if (a.status === 'Closed') closing.append(
            select([['', 'Select classification'], ...CLASSIFICATIONS.map((c) => [c, c])], a.classification ?? '', (v) => { a.classification = v; }, { 'aria-label': 'Classification' }),
            h('input', { type: 'text', value: a.comment ?? '', maxlength: '300', placeholder: 'Comment', 'aria-label': 'Comment', oninput: (e) => { a.comment = e.target.value; } }),
            h('p', { class: 'muted small' }, 'Closing an incident needs a classification (closing reason).'));
        };
        fields.append(select(STATUSES.map((s) => [s, s]), a.status ?? 'Active', (v) => { a.status = v; paintClose(); }, { 'aria-label': 'Status' }), closing);
        a.status ??= 'Active';
        paintClose();
      }
      if (a.type === 'runPlaybook') {
        const opts = playbookOptions();
        // Playbooks that Sentinel cannot run are listed but unavailable, with a link to grant permission: as in the portal.
        const sel = h('select', { 'aria-label': 'Playbook', 'data-target': 'select:playbook', onchange: (e) => { a.playbookId = e.target.value; } },
          h('option', { value: '' }, 'Select a playbook'),
          ...opts.map((p) => h('option', { value: p.id, selected: a.playbookId === p.id, disabled: !p.sentinelCanRun }, p.sentinelCanRun ? p.name : `${p.name} (unavailable)`)));
        const lacking = opts.filter((p) => !p.sentinelCanRun);
        fields.append(sel,
          lacking.length ? h('p', { class: 'note small' }, 'Microsoft Sentinel does not have permission to run the greyed-out playbooks. ',
            h('a', { href: '#', 'data-target': 'link:manage-playbook-permissions', onclick: async (e) => {
              e.preventDefault();
              const ok = await grantPermission(lacking, m);
              if (!ok) return;
              // Stay in this panel with everything the user typed: only the playbook list changes.
              const fresh = await ctx.view('sentinel-config');
              meta = fresh.automationMeta;
              paintActions();
            } }, 'Manage playbook permissions')) : null,
          opts.length ? null : h('p', { class: 'muted small' }, `No playbooks start with the Microsoft Sentinel ${state.trigger === 'alertCreated' ? 'alert' : 'incident'} trigger.`));
      }
      actBox.append(h('div', { class: 'wz-pair auto-act' },
        h('div', null, h('label', null, `Action ${i + 1}`), select(allowed, a.type, (v) => { a.type = v; Object.keys(a).forEach((k) => { if (k !== 'type') delete a[k]; }); paintActions(); }, { 'aria-label': 'Action' })),
        fields,
        h('span', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', 'aria-label': 'Move action up', disabled: i === 0, onclick: () => { [state.actions[i - 1], state.actions[i]] = [state.actions[i], state.actions[i - 1]]; paintActions(); } }, '↑'),
          h('button', { class: 'btn small', type: 'button', 'aria-label': 'Move action down', disabled: i === state.actions.length - 1, onclick: () => { [state.actions[i + 1], state.actions[i]] = [state.actions[i], state.actions[i + 1]]; paintActions(); } }, '↓'),
          h('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Remove action', onclick: () => { state.actions.splice(i, 1); paintActions(); } }, 'Remove'))));
    });
    actBox.append(h('button', { class: 'btn small', type: 'button', 'data-target': 'btn:add-action', onclick: () => { state.actions.push({ type: allowed[0][0] }); paintActions(); } }, '+ Add action'));
  };

  const nameEl = h('input', { type: 'text', value: state.name, maxlength: '80', placeholder: 'Automation rule name', oninput: (e) => { state.name = e.target.value; } });
  const trigEl = select(TRIGGERS, state.trigger, (v) => {
    state.trigger = v;
    state.conditions = []; // conditions depend on the trigger
    if (v === 'alertCreated') state.actions = state.actions.filter((a) => a.type === 'runPlaybook');
    if (!existing) { state.order = null; orderInput.value = String(meta.nextOrder[v] ?? 1); }
    paintConditions(); paintActions();
  }, { 'aria-label': 'Trigger', 'data-target': 'select:trigger' });
  const expEl = h('input', { type: 'datetime-local', value: state.expires, oninput: (e) => { state.expires = e.target.value; }, 'aria-label': 'Rule expiration' });

  paintConditions(); paintActions();
  m = modal({
    title: existing ? `Edit ${existing.name}` : 'Create new automation rule', wide: true,
    content: [
      field('Automation rule name', nameEl),
      field('Trigger', trigEl, 'Incident triggers can run any action. The alert trigger can only run a playbook.'),
      h('div', { class: 'field' }, h('strong', null, 'Conditions'), h('p', { class: 'muted small' }, 'All conditions must be true (AND). Matching is case insensitive. Several values on one condition are ORed.'), condBox),
      h('div', { class: 'field' }, h('strong', null, 'Actions'), h('p', { class: 'muted small' }, 'Actions run in the order listed.'), actBox),
      field('Rule expiration', expEl, 'Leave empty for Indefinite. After this time the rule is disabled.'),
      field('Order', orderInput, 'Rules of the same trigger type run in this order; later rules see the changes earlier rules made.'),
      notSimulated('OR condition groups, custom-details and entity-property conditions, incident tasks, and the Simple Flows (case) actions.'),
    ],
    buttons: [
      { label: 'Cancel', onClick: (x) => x.close() },
      { label: 'Apply', primary: true, target: 'btn:apply-automation', onClick: async (x) => {
        const payload = {
          ...(state.id ? { id: state.id } : {}),
          name: state.name, trigger: state.trigger,
          conditions: state.conditions.map((c) => ({ property: c.property, operator: c.operator, values: c.operator === 'changed' ? [] : c.values })),
          actions: state.actions.map((a) => ({ ...a })),
          ...(state.expires ? { expiresAt: new Date(state.expires).getTime() } : {}),
          ...(state.order ? { order: state.order } : {}),
        };
        const out = await ctx.act('sentinel.saveAutomationRule', payload, { silentError: true });
        if (!out.ok) { x.setError(out.error.message); return; }
        x.close(); ctx.toast('Automation rule saved', 'ok'); await ctx.reloadPage();
      } },
    ],
  });
  return m;
}
