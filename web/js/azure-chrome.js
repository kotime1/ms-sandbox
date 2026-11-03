// The Azure portal header: menu button, "Microsoft Azure", the global search box, the icon buttons and the signed-in tenant.
// It reproduces the layout of portal.azure.com. The icon buttons are decoration only (the sandbox has no Cloud Shell, settings or
// feedback), and say so; search and the menu button work.
import { h, clear } from './dom.js';
import { ctx } from './app.js';
import { searchServices } from './azure-services.js';

/** Open a catalogue entry: a sandbox page, a page in the Defender portal, or an explanation that it is not simulated. */
export function openService(s) {
  if (!s.page) { ctx.toast(`${s.name} is not simulated in this sandbox. Try Resource groups, Access control (IAM), Logic apps or Microsoft Sentinel.`, 'info'); return; }
  if (s.page.startsWith('defender:')) { if (s.note) ctx.toast(s.note, 'info'); ctx.navigate(s.page.slice('defender:'.length)); return; }
  ctx.navigate(s.page);
}

const icon = (glyph, label, extra = {}) => h('button', { type: 'button', class: 'az-icon', 'aria-label': `${label} (not simulated)`, title: `${label}: not simulated`, ...extra }, glyph);

export function azureHeader(portalTabs) {
  const results = h('ul', { class: 'az-results', role: 'listbox', 'aria-label': 'Search results', hidden: true });
  const input = h('input', { type: 'search', class: 'az-search', placeholder: 'Search resources, services, and docs (G+/)', 'aria-label': 'Search resources, services, and docs', 'data-target': 'input:global-search', autocomplete: 'off' });
  const close = () => { results.hidden = true; };
  const paint = () => {
    const found = searchServices(input.value);
    clear(results);
    if (!input.value.trim()) { close(); return; }
    results.hidden = false;
    if (!found.length) { results.append(h('li', { class: 'az-none' }, 'No results found')); return; }
    results.append(...found.map((s) => h('li', { role: 'option' }, h('button', { type: 'button', class: 'az-result', 'data-target': `result:${s.name}`, onclick: () => { close(); input.value = ''; openService(s); } },
      h('span', { class: `az-glyph small tone-${s.tone}`, 'aria-hidden': 'true' }, s.glyph), h('span', null, s.name), h('span', { class: 'muted small' }, s.category)))));
  };
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; close(); }
    if (e.key === 'Enter') { const first = searchServices(input.value)[0]; if (first) { close(); input.value = ''; openService(first); } }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest?.('.az-searchbox')) close(); });

  return [
    h('button', { type: 'button', class: 'az-menu', 'aria-label': 'Portal menu', 'data-target': 'btn:portal-menu', onclick: () => ctx.navigate('azure/services') }, '☰'),
    h('a', { class: 'az-brand', href: '#/azure/services', 'data-target': 'nav:azure/services' }, 'Microsoft Azure'),
    h('div', { class: 'az-searchbox' }, input, results),
    h('div', { class: 'az-icons' }, icon('>_', 'Cloud Shell'), icon('⚑', 'Directories + subscriptions'), icon('🔔', 'Notifications'), icon('⚙', 'Settings'), icon('?', 'Help + support'), icon('☺', 'Feedback')),
    h('div', { class: 'az-user' }, h('span', null, 'admin1@contoso.com'), h('span', { class: 'az-tenant' }, 'CONTOSO (CONTOSO.COM)'), h('span', { class: 'az-avatar', 'aria-hidden': 'true' }, 'A')),
    // The lab tabs stay reachable (they are the sandbox's own chrome, not the portal's), in a small strip at the end.
    h('div', { class: 'az-sim' }, h('span', { class: 'sim-badge', title: 'This is a simulation that mimics portal workflows. It is not the real product and nothing here touches a real tenant.' }, 'SIMULATION'), portalTabs),
  ];
}
