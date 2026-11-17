// Modül içi ortak arayüz parçaları: alt menü, devam eden antrenman bandı, kart, ses, egzersiz seçici.
import { h, icon, fmt, modal, haptic } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { figure, figureStatic } from './figure.js';
import { EXERCISES, EX, GROUPS, EQUIP, LEVELS, groupLabel, equipLabel, norm, fitsLoc } from './exercises.js';
import { getActive, durationMin } from './data.js';

export const link = (path, ...children) => h('a', { href: '#/workout' + (path ? '/' + path : ''), class: 'wk-link' }, ...children);

/** Ana bölümler arasında geçiş (Plan · Egzersizler · Geçmiş) */
export function subNav(active) {
  const items = [{ id: '', label: 'Plan' }, { id: 'lib', label: 'Egzersizler' }, { id: 'history', label: 'Geçmiş' }];
  return h('nav', { class: 'tabs wk-subnav', 'aria-label': 'Antrenman bölümleri' }, items.map(it => h('a', {
    class: 'tab' + (it.id === active ? ' active' : ''), href: '#/workout' + (it.id ? '/' + it.id : ''), 'aria-current': it.id === active ? 'page' : null,
  }, it.label)));
}

/** Devam eden antrenman bandı */
export function activeBanner() {
  const a = getActive();
  if (!a) return null;
  const done = a.exercises.filter(x => x.sets.some(s => s.done)).length;
  const timeEl = h('span', null, fmt.duration((Date.now() - a.startTs) / 1000));
  const iv = setInterval(() => { if (!timeEl.isConnected) return clearInterval(iv); timeEl.textContent = fmt.duration((Date.now() - a.startTs) / 1000); }, 1000);
  return h('a', { class: 'wk-banner', href: '#/workout/session' },
    h('span', { class: 'wk-banner-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'grow' }, h('b', null, 'Devam eden antrenman'), h('small', null, a.name, ' · ', timeEl, ' · ', `${done}/${a.exercises.length} egzersiz`)),
    h('span', { class: 'btn primary sm' }, 'Devam et', icon('right')));
}

export const eqText = e => e.eq.map(equipLabel).join(', ');
export const targetText = t => t.sec && !t.reps ? `${t.sets} × ${t.sec} sn` : `${t.sets} × ${t.reps} tekrar`;

/** Egzersiz kartı (kütüphane ızgarası) — görünür olunca canlanan küçük animasyon */
export function exCard(e, { onClick } = {}) {
  const fg = figure(e.anim, { mode: 'sm', muscles: e.muscles, lazy: true });
  return h('button', { type: 'button', class: 'wk-card', onClick: onClick || (() => go('workout/ex/' + e.id)), 'aria-label': e.name },
    h('div', { class: 'wk-card-fig' }, fg.el),
    h('div', { class: 'wk-card-body' },
      h('div', { class: 'wk-card-title' }, e.name),
      h('div', { class: 'wk-card-sub' }, groupLabel(e.group), ' · ', LEVELS[e.lvl])));
}

/** Liste satırı: küçük statik figür + ad + alt metin */
export function exRow(e, sub, { onClick, end } = {}) {
  return h('button', { type: 'button', class: 'list-item click wk-row', onClick: onClick || (() => go('workout/ex/' + e.id)) },
    h('span', { class: 'wk-row-fig' }, figureStatic(e.anim, 1, { muscles: e.muscles, mode: 'sm' })),
    h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, e.name), h('span', { class: 'li-sub' }, sub)),
    end ?? icon('right', { cls: 'wk-chev' }));
}

// ---------- Ses ve titreşim ----------
let actx = null;
export function unlockAudio() {
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { /* yok */ }
}
export function beep({ freq = 880, ms = 160, times = 1, gap = 120 } = {}) {
  try {
    unlockAudio();
    if (!actx) return;
    for (let i = 0; i < times; i++) {
      const t0 = actx.currentTime + i * (ms + gap) / 1000;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
      o.connect(g).connect(actx.destination);
      o.start(t0); o.stop(t0 + ms / 1000 + 0.02);
    }
  } catch { /* ses yok */ }
}
export function alertEnd() { beep({ freq: 1046, ms: 180, times: 2 }); haptic([200, 100, 200]); }

// ---------- Egzersiz seçici ----------
/** Arama + kas grubu filtresiyle egzersiz seçme penceresi. onPick(e) */
export function pickExercise({ title = 'Egzersiz ekle', loc = 'all', group = null, onPick }) {
  let q = '', g = group;
  const list = h('div', { class: 'list wk-pick-list' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Egzersiz ara', 'aria-label': 'Egzersiz ara', onInput: e => { q = e.target.value; paint(); } });
  const chips = h('div', { class: 'chips' });
  const paintChips = () => chips.replaceChildren(...[{ id: null, label: 'Tümü' }, ...GROUPS].map(x => h('button', {
    type: 'button', class: 'chip' + (g === x.id ? ' active' : ''), 'aria-pressed': String(g === x.id), onClick: () => { g = x.id; paintChips(); paint(); },
  }, x.label)));
  let close;
  function paint() {
    const nq = norm(q);
    const res = EXERCISES.filter(e => (!g || e.group === g) && fitsLoc(e, loc) && (!nq || norm(e.name + ' ' + groupLabel(e.group)).includes(nq)));
    list.replaceChildren(...(res.length ? res.slice(0, 60).map(e => exRow(e, `${groupLabel(e.group)} · ${eqText(e)}`, { onClick: () => { close(); onPick(e); }, end: icon('plus', { cls: 'wk-chev' }) }))
      : [h('p', { class: 'muted center' }, 'Sonuç bulunamadı. Aramayı ya da filtreyi değiştir.')]));
  }
  paintChips(); paint();
  close = modal({ title, body: h('div', null, h('div', { class: 'search-box' }, icon('search'), search), h('div', { class: 'mt' }, chips), list) });
  return close;
}

/** Egzersizin "Nasıl yapılır?" penceresi */
export function howTo(e) {
  modal({ title: e.name, body: h('div', { class: 'wk-howto' },
    h('div', { class: 'wk-howto-fig' }, figure(e.anim, { mode: 'md', muscles: e.muscles }).el),
    h('ol', { class: 'wk-steps' }, e.steps.map(s => h('li', null, s))),
    h('p', { class: 'small muted' }, h('b', null, 'Nefes: '), e.breath)),
    actions: [{ label: 'Tamam', class: 'primary' }] });
}

export { EX };
export const sessionMins = s => durationMin(s);
