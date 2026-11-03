// The Microsoft Defender portal left menu: Home, collapsible groups, then plain links. Mirrors the real menu's order and names.
// Each page link keeps the coach target `nav:<page id>` it always had. A closed group would hide its links from the coach, so the
// group that holds the current page, or the coach's next target, opens itself.
import { h, clear } from './dom.js';
import { ctx } from './app.js';
import { SECTIONS, LINKS, DEFENDER_HOME, matches } from './nav.js';

const open = new Set(); // group titles the learner has opened; survives re-renders

const targetPage = () => {
  const t = ctx.lab?.next?.target;
  return typeof t === 'string' && t.startsWith('nav:') ? t.slice(4) : null;
};

const link = (it, path, extra = {}) => {
  const active = matches(it, path);
  return h('a', {
    href: `#/${it.id}`, class: `dn-link ${active ? 'active' : ''}`,
    'data-target': `nav:${it.id}`,
    'data-target-aliases': (it.aliases ?? []).map((a) => `nav:${a}`).join(' ') || undefined,
    'aria-current': active ? 'page' : undefined, ...extra,
  }, it.label);
};

export function renderDefenderNav(host, path) {
  const want = targetPage();
  clear(host);
  host.append(h('a', { href: `#/${DEFENDER_HOME.id}`, class: `dn-home ${path === DEFENDER_HOME.id ? 'active' : ''}`, 'data-target': `nav:${DEFENDER_HOME.id}`, 'aria-current': path === DEFENDER_HOME.id ? 'page' : undefined }, h('span', { class: 'dn-ico', 'aria-hidden': 'true' }, '⌂'), DEFENDER_HOME.label));

  for (const g of SECTIONS) {
    const holdsPage = g.items.some((it) => matches(it, path));
    const holdsTarget = Boolean(want) && g.items.some((it) => matches(it, want));
    const isOpen = open.has(g.title) || holdsPage || holdsTarget; // always a real boolean: it becomes aria-expanded
    const head = h('button', { type: 'button', class: `dn-group ${isOpen ? 'open' : ''}`, 'aria-expanded': String(isOpen), 'data-target': `group:${g.title}`,
      onclick: () => { if (!g.items.length) { ctx.toast(`${g.title} is not simulated in this sandbox.`, 'info'); return; } open.has(g.title) ? open.delete(g.title) : open.add(g.title); renderDefenderNav(host, path); } },
      h('span', { class: 'dn-ico', 'aria-hidden': 'true' }, g.icon), h('span', { class: 'dn-label' }, g.title), h('span', { class: 'dn-chev', 'aria-hidden': 'true' }, isOpen ? '⌃' : '⌄'));
    host.append(head);
    if (isOpen && g.items.length) host.append(h('div', { class: 'dn-sub' }, g.items.map((it) => link(it, path))));
  }

  host.append(h('hr', { class: 'dn-rule' }));
  for (const l of LINKS) {
    if (l.id) host.append(h('a', { href: `#/${l.id}`, class: `dn-plain ${matches(l, path) ? 'active' : ''}`, 'data-target': `nav:${l.id}`, 'aria-current': matches(l, path) ? 'page' : undefined }, h('span', { class: 'dn-ico', 'aria-hidden': 'true' }, l.icon), l.label));
    else host.append(h('button', { type: 'button', class: 'dn-plain', onclick: () => ctx.toast(`${l.label} is not simulated in this sandbox.`, 'info') }, h('span', { class: 'dn-ico', 'aria-hidden': 'true' }, l.icon), l.label));
  }
}
