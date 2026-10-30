import { h, clear, safeContainer } from './dom.js';
import * as api from './api.js';
import { ctx } from './app.js';
import { SECTIONS, AZURE, isAzure, matches } from './nav.js';
import { renderLabPanel, noteFeed, feedCursor, resetFeed, applyGlow } from './components/lab-panel.js';

// ---- routing -------------------------------------------------------------------------------
// Hash routes: #/home, #/azure/resources, #/azure/logicapp/<slug>, #/sentinel/incidents ...
// Two top-level places, as in real life: the Defender portal (where Sentinel now lives) and the Azure portal
// (where IAM and Logic Apps live). Navigation labels come from nav.js.
const PORTALS = {
  home: { label: 'Labs', cls: 'p-home', start: 'home' },
  defender: { label: 'Microsoft Defender portal', cls: 'p-defender', start: 'defender/alerts' },
  azure: { label: 'Azure portal', cls: 'p-azure', start: 'azure/resources' },
};
const portalOf = (key) => (key === 'home' ? 'home' : isAzure(key) ? 'azure' : 'defender');

const PAGES = {
  home: () => import('./pages/home.js'),
  'azure/resources': () => import('./pages/azure-resources.js'),
  'azure/iam': () => import('./pages/azure-iam.js'),
  'azure/logicapp': () => import('./pages/azure-logicapp.js'),
  'sentinel/incidents': () => import('./pages/sentinel-incidents.js'),
  'sentinel/logs': () => import('./pages/sentinel-logs.js'),
  'sentinel/hunting': () => import('./pages/sentinel-hunting.js'),
  'sentinel/summary': () => import('./pages/sentinel-summary.js'),
  'sentinel/analytics': () => import('./pages/sentinel-analytics.js'),
  'sentinel/automation': () => import('./pages/sentinel-automation.js'),
  'defender/alerts': () => import('./pages/defender-alerts.js'),
  'defender/hunting': () => import('./pages/defender-hunting.js'),
  'defender/devices': () => import('./pages/defender-devices.js'),
  'defender/rules': () => import('./pages/defender-rules.js'),
};

function parseRoute() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home';
  if (!/^[a-z0-9/_-]{1,80}$/i.test(raw)) return { key: 'home', param: null, path: 'home' };
  const parts = raw.split('/');
  const key = parts.length === 3 ? `${parts[0]}/${parts[1]}` : raw;
  if (!Object.hasOwn(PAGES, key)) return { key: 'home', param: null, path: 'home' };
  return { key, param: parts[2] ?? null, path: raw };
}

const shell = {};
let renderToken = 0;

async function renderPage() {
  const token = ++renderToken;
  const { key, param, path } = parseRoute();
  const portal = portalOf(key);
  ctx.route = path;
  document.body.className = PORTALS[portal].cls;
  renderChrome(portal, path);
  clear(shell.main);
  shell.main.append(h('div', { class: 'loading' }, 'Loading…'));
  try {
    const mod = await PAGES[key]();
    if (token !== renderToken) return;
    const page = safeContainer('div', { class: 'page' });
    await mod.render(page, param);
    if (token !== renderToken) return;
    clear(shell.main).append(page);
    if (ctx.lab && portal !== 'home') api.post('/api/action', { type: 'ui.visit', params: { page: path } }).then(() => ctx.refresh());
  } catch (e) {
    if (token !== renderToken) return;
    clear(shell.main).append(h('div', { class: 'page' }, h('div', { class: 'form-error', role: 'alert' }, e.message || 'This page failed to load.')));
  }
  applyGlow(ctx.lab?.next?.target);
}

function renderChrome(portal, path) {
  clear(shell.top).append(
    h('a', { class: 'brand', href: '#/home', 'data-target': 'nav:home' }, 'SC-200 Sandbox'),
    h('span', { class: 'sim-badge', title: 'This is a simulation that mimics portal workflows. It is not the real product and nothing here touches a real tenant.' }, 'SIMULATION'),
    h('nav', { class: 'portal-tabs', 'aria-label': 'Portals' }, ['home', 'defender', 'azure'].map((p) => h('a', {
      href: `#/${PORTALS[p].start}`, class: p === portal ? 'active' : '', 'aria-current': p === portal ? 'page' : undefined,
    }, PORTALS[p].label))),
    h('span', { class: 'who' }, 'admin1@contoso.com'),
  );
  clear(shell.nav);
  shell.nav.hidden = portal === 'home';
  if (portal === 'home') return;
  const sections = portal === 'azure' ? [AZURE] : SECTIONS;
  for (const sec of sections) {
    shell.nav.append(h('div', { class: 'nav-title' }, sec.title));
    for (const it of sec.items) {
      const active = matches(it, path);
      shell.nav.append(h('a', {
        href: `#/${it.id}`, class: active ? 'active' : '',
        // The coach targets the internal id of the page; alias ids resolve to this same menu entry.
        'data-target': `nav:${it.id}`,
        // A merged menu entry answers to every page id that now lives under it (e.g. nav:sentinel/logs -> Advanced hunting).
        'data-target-aliases': (it.aliases ?? []).map((a) => `nav:${a}`).join(' ') || undefined,
        'aria-current': active ? 'page' : undefined,
      }, it.label));
    }
  }
}

// ---- state refresh -------------------------------------------------------------------------
ctx.refresh = async () => {
  const out = await api.get(`/api/state?after=${feedCursor()}`);
  if (!out.ok) return;
  ctx.lab = out.data.lab;
  noteFeed(out.data.feed);
  renderLabPanel(shell.panel);
  applyGlow(ctx.lab?.next?.target);
};
ctx.reloadPage = () => renderPage();
ctx.navigate = (path) => { location.hash = `#/${path}`; };
ctx.showGuide = true;
ctx.feed = [];

ctx.toast = (text, kind = 'info') => {
  const t = h('div', { class: `toast ${kind}` }, String(text));
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'hint' ? 12000 : 5000);
};

ctx.startLab = async (labId) => {
  const out = await api.post('/api/lab/start', { labId });
  if (!out.ok) { ctx.toast(out.error.message, 'error'); return false; }
  resetFeed();
  await ctx.refresh();
  return true;
};

// ---- boot ----------------------------------------------------------------------------------
async function boot() {
  const app = document.getElementById('app');
  shell.top = h('header', { class: 'topbar' });
  shell.nav = h('aside', { class: 'sidenav', 'aria-label': 'Section navigation' });
  shell.main = h('main', { class: 'content', id: 'main' });
  shell.panel = safeContainer('aside', { class: 'labpanel', 'aria-label': 'Lab coach' });
  app.append(h('a', { class: 'skip', href: '#main' }, 'Skip to content'), shell.top, h('div', { class: 'layout' }, shell.nav, shell.main, shell.panel));
  try {
    const s = await api.startSession();
    ctx.assistant = s.assistant;
    ctx.labs = s.labs;
  } catch (e) {
    app.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'form-error' }, e.message)));
    return;
  }
  await ctx.refresh();
  window.addEventListener('hashchange', renderPage);
  await renderPage();
}
boot();
