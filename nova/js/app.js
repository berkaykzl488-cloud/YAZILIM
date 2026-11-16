// NOVA Fit — uygulama kabuğu
import { h, icon, mount } from './core/ui.js';
import * as router from './core/router.js';
import { subscribe } from './core/store.js';
import { levelInfo } from './core/xp.js';

import dashboard from './modules/dashboard/index.js';
import steps from './modules/steps/index.js';
import run from './modules/run/index.js';
import workout from './modules/workout/index.js';
import nutrition from './modules/nutrition/index.js';
import habits from './modules/habits/index.js';
import profile from './modules/profile/index.js';
import recipes from './modules/recipes/index.js';

const MODULES = [dashboard, steps, run, workout, nutrition, habits, recipes, profile];
const NAV = ['home', 'steps', 'run', 'workout', 'nutrition', 'habits'];

function loadCss(id) {
  if (document.getElementById('css-' + id)) return;
  document.head.appendChild(h('link', { id: 'css-' + id, rel: 'stylesheet', href: `css/${id}.css` }));
}

function buildShell() {
  const levelChip = h('a', { class: 'hdr-level', href: '#/profile', 'aria-label': 'Seviyen' });
  const paintLevel = () => {
    const l = levelInfo();
    mount(levelChip, icon('star', { size: 14 }), `Seviye ${l.level}`);
  };
  paintLevel();
  subscribe('xp', paintLevel);

  const clock = h('span', { class: 'hdr-clock' });
  const tick = () => { clock.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); };
  tick(); setInterval(tick, 15000);

  const header = h('header', { class: 'app-header' },
    h('a', { class: 'app-logo', href: '#/home', 'aria-label': 'Ana sayfa' }, 'NOVA', h('span', null, ' FIT')),
    h('span', { class: 'spacer' }),
    clock,
    levelChip,
    h('a', { class: 'hdr-icon', href: '#/profile', 'aria-label': 'Profil' }, icon('user', { size: 18 })));

  const nav = h('nav', { class: 'app-nav', 'aria-label': 'Ana gezinme' }, NAV.map(id => {
    const m = MODULES.find(x => x.id === id);
    return h('a', { class: 'nav-item', href: '#/' + id, dataset: { id } }, icon(m.icon), h('span', { class: 'nav-label' }, m.navLabel || m.title));
  }));

  const view = h('main', { id: 'view' });
  document.getElementById('app').replaceChildren(header, view, nav);
  return { nav, view };
}

async function boot() {
  const { nav, view } = buildShell();
  for (const m of MODULES) {
    if (m.css) loadCss(m.id);
    router.register(m);
  }
  for (const m of MODULES) {
    try { await m.init?.(); } catch (e) { console.error('init hatası', m.id, e); }
  }
  router.start(view, id => {
    nav.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.id === id));
  });
  setTimeout(() => document.getElementById('boot')?.classList.add('done'), 450);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW kaydı başarısız', e));
  }
}

boot();
