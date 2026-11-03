// Microsoft Defender portal > Home. Follows the layout of the real landing page: dismissible banners, a promotional card, the
// Guided tour / What's new / Community / Add cards row, then dashboard cards. The cards show real numbers from the sandbox.
// Promotions and most links are not simulated; they say so.
import { h } from '../dom.js';
import { ctx } from '../app.js';

const dismissed = new Set(); // per page load, like closing a banner

const dismissible = (id, kind, content, action) => (dismissed.has(id) ? null : h('div', { class: `dh-banner ${kind}`, role: 'note' },
  h('span', { class: 'dh-info', 'aria-hidden': 'true' }, 'ⓘ'), h('span', { class: 'dh-text' }, content), action ?? null,
  h('button', { type: 'button', class: 'dh-x', 'aria-label': 'Dismiss', 'data-target': `btn:dismiss:${id}`, onclick: (e) => { dismissed.add(id); e.currentTarget.closest('.dh-banner').remove(); } }, '✕')));

const nope = (what) => () => ctx.toast(`${what} is not simulated in this sandbox.`, 'info');

const card = (title, body) => h('section', { class: 'dh-card' }, h('header', null, h('span', null, title), h('span', { class: 'dh-dots', 'aria-hidden': 'true' }, '···')), h('div', { class: 'dh-body' }, body));
const stat = (label, value, tone) => h('div', { class: `dh-stat ${tone ?? ''}` }, h('span', { class: 'dh-stat-l' }, label), h('span', { class: 'dh-stat-n' }, String(value)));

export async function render(host) {
  const v = await ctx.view('defender-home');
  let hero = null;
  const heroCard = () => {
    if (dismissed.has('hero')) return null;
    hero = h('section', { class: 'dh-hero' },
      h('button', { type: 'button', class: 'dh-x hero-x', 'aria-label': 'Close', 'data-target': 'btn:dismiss:hero', onclick: () => { dismissed.add('hero'); hero.remove(); } }, '✕'),
      h('div', { class: 'dh-hero-art', 'aria-hidden': 'true' }, '◔'),
      h('div', { class: 'dh-hero-copy' },
        h('h2', null, 'Get powerful graphs with Microsoft Sentinel data lake'),
        h('p', null, 'Set up the data lake right here in Defender to get cost-effective storage that you can query and analyze using KQL and notebooks. As your data grows, we’ll build graphs that enable visual investigations and smarter AI agents.'),
        h('button', { type: 'button', class: 'btn primary', onclick: nope('The Microsoft Sentinel data lake') }, 'Get started')));
    return hero;
  };
  host.append(
    h('div', { class: 'dh-head' }, h('h1', null, 'Home'), h('span', { class: 'dh-dark muted' }, 'Dark mode ☾')),
    dismissible('mdi', 'warn', ['Protect your identities and identity infrastructure by activating Microsoft Defender for Identity sensors. ', h('a', { href: '#/defender/home', onclick: (e) => { e.preventDefault(); nope('Defender for Identity sensors')(); } }, 'Learn More.')]),
    dismissible('ignite', 'info', 'Explore the latest security solutions at Microsoft Ignite. Discover cutting-edge strategies for securing agentic AI in deep technical sessions and live demos.'),
    heroCard(),
    h('div', { class: 'dh-tools' }, ...['Guided tour ⌄', 'What’s new ?', 'Community', '+ Add cards'].map((t) => h('button', { type: 'button', class: 'dh-tool', onclick: nope(t.replace(/[^A-Za-z’' ]/g, '').trim()) }, t))),
    h('div', { class: 'dh-cards' },
      card('Incidents', [h('div', { class: 'dh-big' }, `${v.incidents.open} open incident${v.incidents.open === 1 ? '' : 's'}`), h('div', { class: 'dh-sub muted' }, 'Sentinel and Defender, one queue'),
        h('div', { class: 'dh-stats' }, stat('High severity', v.incidents.high, 'red'), stat('Open', v.incidents.open, 'amber')),
        h('a', { class: 'btn', href: '#/defender/alerts', 'data-target': 'link:home-incidents' }, 'Go to Incidents & alerts')]),
      card('Devices', [h('div', { class: 'dh-big' }, `${v.devices.total} devices`), h('div', { class: 'dh-sub muted' }, v.devices.pending ? `${v.devices.pending} waiting for approval` : 'All onboarded'),
        h('div', { class: 'dh-stats' }, stat('Onboarded', v.devices.total - v.devices.pending, 'green'), stat('Pending', v.devices.pending, 'amber')),
        h('a', { class: 'btn', href: '#/defender/devices' }, 'Go to Devices')]),
      card('Microsoft Sentinel automation', [h('div', { class: 'dh-big' }, `${v.automationRules} automation rules`), h('div', { class: 'dh-sub muted' }, 'Last 24 hours'),
        h('div', { class: 'dh-stats' }, stat('Data connectors', `${v.connectors.connected}/${v.connectors.total}`, 'green'), stat('Workbooks', v.workbooks)),
        h('a', { class: 'btn', href: '#/sentinel/automation' }, 'Go to Automation')])));
}
