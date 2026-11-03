// Azure portal > All services: a filterable catalogue grouped by category, with the featured services along the top.
import { h, clear } from '../dom.js';
import { CATEGORIES, SERVICES } from '../azure-services.js';
import { openService } from '../azure-chrome.js';

let category = 'All';
let filter = '';

export async function render(host) {
  const side = h('nav', { class: 'az-cats', 'aria-label': 'Service categories' });
  const body = h('div', { class: 'az-body' });
  const input = h('input', { type: 'search', class: 'az-filter', placeholder: 'Filter services', 'aria-label': 'Filter services', 'data-target': 'input:filter-services', value: filter,
    oninput: (e) => { filter = e.target.value; paint(); } });

  const tile = (s) => h('button', { type: 'button', class: 'az-tile', 'data-target': `service:${s.name}`, onclick: () => openService(s) },
    h('span', { class: `az-glyph tone-${s.tone}`, 'aria-hidden': 'true' }, s.glyph), h('span', null, s.name));
  const row = (s) => h('button', { type: 'button', class: 'az-row', 'data-target': `service:${s.name}`, onclick: () => openService(s) },
    h('span', { class: `az-glyph small tone-${s.tone}`, 'aria-hidden': 'true' }, s.glyph), h('span', null, s.name), s.page ? null : h('span', { class: 'az-ns', title: 'Shown for realism; this service is not simulated.' }, '·'));

  const paint = () => {
    const q = filter.trim().toLowerCase();
    const inCat = (s) => category === 'All' || s.category === category;
    const match = (s) => !q || s.name.toLowerCase().includes(q);
    clear(side).append(...['All', 'Favorites', 'Recents', 'Recommended'].map((c) => cat(c)), h('h2', { class: 'az-h' }, 'Categories'), ...CATEGORIES.map((c) => cat(c)));
    clear(body);
    if (!q && category === 'All') body.append(h('div', { class: 'az-featured' }, SERVICES.filter((s) => s.featured).map(tile)));
    const groups = CATEGORIES.filter((c) => category === 'All' || c === category)
      .map((c) => [c, SERVICES.filter((s) => s.category === c && inCat(s) && match(s))]).filter(([, list]) => list.length);
    if (!groups.length) { body.append(h('div', { class: 'empty' }, category === 'Favorites' || category === 'Recents' || category === 'Recommended' ? `${category} is not simulated.` : 'No services match.')); return; }
    for (const [c, list] of groups) {
      body.append(h('h2', { class: 'az-group' }, `${c} `, h('span', { class: 'muted' }, `(${list.length})`)), h('div', { class: 'az-grid' }, list.map(row)));
    }
  };
  const cat = (c) => h('button', { type: 'button', class: `az-cat ${category === c ? 'active' : ''}`, 'aria-current': category === c ? 'true' : undefined, 'data-target': `cat:${c}`,
    onclick: () => { category = c; paint(); } }, c);

  host.append(h('h1', { class: 'az-title' }, 'All services'), h('div', { class: 'az-layout' }, side, h('div', { class: 'az-main' }, input, body)));
  paint();
}
