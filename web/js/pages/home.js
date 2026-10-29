import { h, badge } from '../dom.js';
import { ctx } from '../app.js';

const START = { 'suppress-app1': 'defender/alerts', 'sentinel-rbac': 'azure/iam', 'playbook-permissions': 'azure/resources', 'detect-and-isolate': 'defender/hunting', 'kql-investigation': 'sentinel/logs' };

export async function render(host) {
  const active = ctx.lab?.briefing?.id;
  host.append(
    h('h1', null, 'Hands-on SC-200 labs'),
    h('p', { class: 'lede' }, 'Click through a simulated Microsoft Sentinel and Defender environment. Each lab sets a scenario, lets an attack-agent generate activity, and grades what you actually changed. The portals here mimic the real workflow so your hands learn the route; they do not replicate the products.'),
    h('div', { class: 'cards' }, ctx.labs.map((l) => h('article', { class: `card ${active === l.id ? 'current' : ''}` },
      h('h2', null, l.title),
      h('div', { class: 'chips' }, badge(l.level), badge(`${l.minutes} min`), ...l.topics.slice(0, 3).map((t) => badge(t, 'topic'))),
      h('p', { class: 'muted small' }, `Exam area: ${l.examObjective}`),
      h('p', { class: 'muted small' }, `Inspired by practice questions: ${l.sourceQuestions.join(', ')}`),
      h('button', { class: 'btn primary', type: 'button', 'data-target': `btn:start:${l.id}`, onclick: async () => {
        if (active && active !== l.id && !confirm('Starting a new lab resets the simulated environment. Continue?')) return;
        if (await ctx.startLab(l.id)) ctx.navigate(START[l.id] ?? 'azure/resources');
      } }, active === l.id ? 'Restart lab' : 'Start lab')))),
    h('p', { class: 'muted small foot' }, 'Everything runs against an in-memory simulator on your machine. No Azure subscription, tenant or real data is involved.'));
}
