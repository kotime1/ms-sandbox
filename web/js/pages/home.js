import { h, badge } from '../dom.js';
import { ctx } from '../app.js';
import { levelOf } from '../verification.js';

const START = {
  'suppress-app1': 'defender/alerts', 'sentinel-rbac': 'azure/iam', 'playbook-permissions': 'azure/resources', 'detect-and-isolate': 'defender/hunting', 'kql-investigation': 'sentinel/logs',
  'unblock-lob1': 'defender/rules', 'approve-devices': 'defender/devices', 'playbook-picker': 'sentinel/automation', 'entity-mapping': 'sentinel/incidents',
  'ueba-join': 'defender/hunting', 'hunting-favorites': 'sentinel/hunting', 'summary-rule': 'sentinel/logs', 'triage-ws23': 'defender/devices', 'follow-the-token': 'sentinel/logs',
};

// Question numbers are per set (the two sets overlap heavily), so show them as "S1: 3, 25 · S2: 4".
const fmtQuestions = (q) => ['set1', 'set2'].filter((k) => q[k]?.length).map((k) => `${k.replace('set', 'Set ')}: ${q[k].join(', ')}`).join(' · ');

export async function render(host) {
  const active = ctx.lab?.briefing?.id;
  host.append(
    h('h1', null, 'Hands-on SC-200 labs'),
    h('p', { class: 'lede' }, 'Click through a simulated Microsoft Defender portal (where Microsoft Sentinel now lives) and the Azure portal. Each lab sets a scenario, lets an attack-agent generate activity, and grades what you actually changed. Menu names follow Microsoft Learn; the screens are simplified and nothing here has been checked against a live tenant. Each lab says how well it is backed by the docs.'),
    h('div', { class: 'cards' }, ctx.labs.map((l) => h('article', { class: `card ${active === l.id ? 'current' : ''}` },
      h('h2', null, l.title),
      h('div', { class: 'chips' }, badge(l.level), badge(`${l.minutes} min`), badge(levelOf(l.verification).label, levelOf(l.verification).kind), ...l.topics.slice(0, 3).map((t) => badge(t, 'topic'))),
      l.verification?.level === 'exam' ? h('p', { class: 'note small' }, l.verification.note) : null,
      h('p', { class: 'muted small' }, `Exam area: ${l.examObjective}`),
      h('p', { class: 'muted small' }, `Inspired by practice questions — ${fmtQuestions(l.sourceQuestions)}`),
      h('button', { class: 'btn primary', type: 'button', 'data-target': `btn:start:${l.id}`, onclick: async () => {
        if (active && active !== l.id && !confirm('Starting a new lab resets the simulated environment. Continue?')) return;
        if (await ctx.startLab(l.id)) ctx.navigate(START[l.id] ?? 'azure/resources');
      } }, active === l.id ? 'Restart lab' : 'Start lab')))),
    h('p', { class: 'muted small foot' }, 'Everything runs against an in-memory simulator on your machine. No Azure subscription, tenant or real data is involved.'));
}
