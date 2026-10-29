import { h, badge, fmtTime } from '../dom.js';
import { table } from '../components/table.js';
import { ctx } from '../app.js';

export async function render(host) {
  // Opening the blade runs every favorite query: that is the behaviour this page mimics (and a lab teaches).
  const opened = await ctx.act('sentinel.openHunting', {}, { noRefresh: true, silentError: true });
  const v = await ctx.view('sentinel-hunting');
  const ran = opened.ok ? opened.data.ran.length : 0;
  await ctx.refresh();

  host.append(
    h('h1', null, 'Hunting'),
    h('p', { class: 'muted' }, ran ? `${ran} favorite quer${ran === 1 ? 'y' : 'ies'} ran when this blade opened.` : 'Queries marked as favorites run automatically each time you open this blade.'),
    v.queries.length
      ? table([
        { key: 'favorite', label: '', render: (q) => h('button', { class: 'icon-btn', type: 'button', 'data-target': `btn:fav:${q.id}`, 'aria-pressed': String(q.favorite), 'aria-label': `${q.favorite ? 'Remove' : 'Add'} ${q.name} ${q.favorite ? 'from' : 'to'} favorites`, onclick: async () => {
          const o = await ctx.act('sentinel.toggleFavorite', { queryId: q.id, favorite: !q.favorite });
          if (o.ok) await ctx.reloadPage();
        } }, q.favorite ? '★' : '☆') },
        { key: 'name', label: 'Query' },
        { key: 'tactics', label: 'Tactics', render: (q) => q.tactics.join(', ') },
        { key: 'lastRun', label: 'Last run', render: (q) => (q.lastRun ? h('span', null, fmtTime(q.lastRun.at)) : h('span', { class: 'muted' }, 'Never')) },
        { key: 'results', label: 'Results', render: (q) => (q.lastRun?.error ? badge('Error', 'warn') : q.lastRun ? badge(String(q.lastRun.count), 'ok') : '') },
        { key: 'query', label: 'KQL', render: (q) => h('code', { class: 'inline-q' }, q.query) },
      ], v.queries, { rowTarget: (q) => `row:hunt:${q.id}` })
      : h('div', { class: 'empty' }, 'No saved hunting queries in this lab.'));
}
