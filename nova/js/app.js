// NOVA Fit — uygulama kabuğu
import { h, icon, mount } from './core/ui.js';
import * as router from './core/router.js';
import { subscribe } from './core/store.js';
import { levelInfo } from './core/xp.js';
import { getProfile } from './core/profile.js';

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

  // Sol: avatar + selamlama (profilde ad yoksa uygulama adı)
  const who = h('a', { class: 'hdr-who', href: '#/profile', 'aria-label': 'Profil' });
  const paintWho = () => {
    const p = getProfile();
    const hr = new Date().getHours();
    const greet = hr < 5 ? 'İyi geceler' : hr < 12 ? 'Günaydın' : hr < 18 ? 'İyi günler' : 'İyi akşamlar';
    mount(who,
      h('span', { class: 'avatar' }, p.name ? p.name.slice(0, 1).toLocaleUpperCase('tr-TR') : icon('user', { size: 20 })),
      h('span', { class: 'hdr-who-txt' }, h('small', null, greet), h('b', null, p.name || 'NOVA Fit')));
  };
  paintWho();
  subscribe('profile', paintWho);

  const header = h('header', { class: 'app-header' },
    who,
    h('span', { class: 'spacer' }),
    levelChip,
    h('a', { class: 'hdr-icon', href: '#/recipes', 'aria-label': 'Fit tarifler' }, icon('list', { size: 19 })));

  const nav = h('nav', { class: 'app-nav', 'aria-label': 'Ana menü' }, NAV.map(id => {
    const m = MODULES.find(x => x.id === id);
    const label = m.navLabel || m.title;
    return h('a', { class: 'nav-item', href: '#/' + id, dataset: { id }, 'aria-label': label, title: label }, icon(m.icon), h('span', { class: 'nav-label' }, label));
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
    nav.querySelectorAll('.nav-item').forEach(a => { const on = a.dataset.id === id; a.classList.toggle('active', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  });
  setTimeout(() => document.getElementById('boot')?.classList.add('done'), 450);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW kaydı başarısız', e));
  }
}

boot();
