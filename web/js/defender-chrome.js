// The Microsoft Defender portal header: waffle menu, "Microsoft Defender", a centred search box and the icon buttons.
// Search finds the pages the sandbox simulates. The icon buttons are decoration only and say so.
import { h, clear } from './dom.js';
import { ctx } from './app.js';
import { SECTIONS, LINKS } from './nav.js';

const PAGES = [...SECTIONS.flatMap((g) => g.items.map((it) => ({ id: it.id, label: it.label.split(' > ').pop(), path: it.label, group: g.title }))),
  ...LINKS.filter((l) => l.id).map((l) => ({ id: l.id, label: l.label.split(' > ').pop(), path: l.label, group: 'Settings' }))];

export const findPages = (q, limit = 8) => {
  const n = q.trim().toLowerCase();
  if (!n) return [];
  return PAGES.filter((p) => p.label.toLowerCase().includes(n) || p.path.toLowerCase().includes(n) || p.group.toLowerCase().includes(n)).slice(0, limit);
};

const icon = (glyph, label) => h('button', { type: 'button', class: 'df-icon', 'aria-label': `${label} (not simulated)`, title: `${label}: not simulated` }, glyph);

export function defenderHeader(portalTabs) {
  const results = h('ul', { class: 'df-results', role: 'listbox', 'aria-label': 'Search results', hidden: true });
  const input = h('input', { type: 'search', class: 'df-search', placeholder: 'Search', 'aria-label': 'Search', 'data-target': 'input:defender-search', autocomplete: 'off' });
  const close = () => { results.hidden = true; };
  const go = (p) => { close(); input.value = ''; ctx.navigate(p.id); };
  const paint = () => {
    const found = findPages(input.value);
    clear(results);
    if (!input.value.trim()) { close(); return; }
    results.hidden = false;
    if (!found.length) { results.append(h('li', { class: 'df-none' }, 'No results found')); return; }
    results.append(...found.map((p) => h('li', { role: 'option' }, h('button', { type: 'button', class: 'df-result', 'data-target': `result:${p.path}`, onclick: () => go(p) }, h('span', null, p.label), h('span', { class: 'muted small' }, p.group)))));
  };
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; close(); }
    if (e.key === 'Enter') { const f = findPages(input.value)[0]; if (f) go(f); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest?.('.df-searchbox')) close(); });
  return [
    h('a', { class: 'df-waffle', href: '#/home', 'aria-label': 'Back to the labs', title: 'Back to the labs', 'data-target': 'nav:home' }, '⋮⋮⋮'),
    h('a', { class: 'df-brand', href: '#/defender/home' }, 'Microsoft Defender'),
    h('div', { class: 'df-searchbox' }, input, results),
    h('div', { class: 'df-icons' }, icon('🔔', 'Notifications'), icon('⚙', 'Settings'), icon('?', 'Help')),
    h('span', { class: 'df-avatar', title: 'admin1@contoso.com' }, 'A1'),
    h('div', { class: 'df-sim' }, h('span', { class: 'sim-badge', title: 'This is a simulation that mimics portal workflows. It is not the real product and nothing here touches a real tenant.' }, 'SIMULATION'), portalTabs),
  ];
}
