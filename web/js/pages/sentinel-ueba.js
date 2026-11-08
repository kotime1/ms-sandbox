// Microsoft Sentinel > Configuration > Settings > Entity behavior configuration.
// UEBA is a workspace switch plus a list of data sources. Once it is on, the page lists the UEBA data sources that are not connected
// yet; a source UEBA does not support is refused by the server with the reason (server/sim/ueba.js).
import { h, badge } from '../dom.js';
import { ctx } from '../app.js';

export async function render(host) {
  const v = await ctx.view('ueba');
  const act = async (type, params) => {
    const o = await ctx.act(type, params, { silentError: true });
    if (!o.ok) { ctx.toast(o.error.message, 'err'); return; }
    await ctx.reloadPage();
  };

  host.append(
    h('h1', null, 'Entity behavior configuration'),
    h('p', { class: 'muted' }, 'Real path: Microsoft Sentinel > Configuration > Settings > Entity behavior configuration. User and Entity Behavior Analytics builds baseline profiles for users and other entities and flags unusual activity.'),
    h('section', { class: 'blade' },
      h('h2', null, 'Entity behavior analytics'),
      h('div', { class: 'row' },
        h('span', null, 'Status'), badge(v.enabled ? 'On' : 'Off', v.enabled ? 'ok' : 'warn'),
        v.enabled ? null : h('button', { class: 'btn primary small', type: 'button', 'data-target': 'btn:ueba-enable', onclick: () => act('ueba.enable', {}) }, 'Turn on entity behavior analytics'))),
    v.enabled ? h('section', { class: 'blade' },
      h('h2', null, 'Connect data sources'),
      v.available.length
        ? h('p', { class: 'note small' }, `UEBA-supported data sources not connected yet: ${v.available.join(', ')}.`)
        : h('p', { class: 'note ok small' }, 'All UEBA-supported data sources are connected.'),
      h('p', { class: 'muted small' }, 'These are the log types your workspace ingests. The page only lets you connect the ones UEBA can use.'),
      v.sources.map((s) => h('div', { class: 'row' },
        h('span', null, s.label), h('span', { class: 'muted small' }, s.note),
        badge(s.connected ? 'Connected' : 'Not connected', s.connected ? 'ok' : ''),
        s.connected
          ? h('button', { class: 'btn small', type: 'button', 'data-target': `btn:ueba-disconnect:${s.id}`, onclick: () => act('ueba.disconnectSource', { source: s.id }) }, 'Disconnect')
          : h('button', { class: 'btn small', type: 'button', 'data-target': `btn:ueba-connect:${s.id}`, onclick: () => act('ueba.connectSource', { source: s.id }) }, 'Connect')))) : null,
    v.enabled ? h('section', { class: 'blade' },
      h('h2', null, 'Microsoft Entra ID'),
      h('p', { class: 'muted small' }, 'UEBA also uses Entra ID to build user profiles. This is a separate step from the data sources above.'),
      h('div', { class: 'row' }, h('span', null, 'Sync user entities'), badge(v.entraSync ? 'On' : 'Off', v.entraSync ? 'ok' : ''),
        h('button', { class: 'btn small', type: 'button', 'data-target': 'btn:ueba-entra', onclick: () => act('ueba.entraSync', { on: !v.entraSync }) }, v.entraSync ? 'Turn off' : 'Turn on'))) : null);
}
