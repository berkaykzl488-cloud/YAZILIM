// Egzersiz kütüphanesi ve egzersiz detay sayfası
import { h, icon, fmt, mount, backButton, sectionTitle, sparkline, emptyState, toast } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { load, save } from '../../core/store.js';
import { player, muscleMap } from './figure.js';
import { EXERCISES, EX, GROUPS, EQUIP, MUSCLES, LEVELS, LOCS, groupLabel, equipLabel, norm, fitsLoc } from './exercises.js';
import { subNav, activeBanner, exCard, eqText } from './kit.js';
import { historyFor, bestFor, getActive, setActive, makeEntry, startSession, getLoc } from './data.js';

const FKEY = 'workout.libFilter';

export function renderLibrary(el) {
  const st = { q: '', loc: 'all', group: null, eq: null, ...load(FKEY, {}) };
  st.q = '';
  const grid = h('div', { class: 'wk-grid' });
  const count = h('p', { class: 'small muted wk-count', 'aria-live': 'polite' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Egzersiz ya da kas ara (ör. squat, göğüs)', 'aria-label': 'Egzersiz ara', onInput: e => { st.q = e.target.value; paint(); } });
  const locRow = h('div', { class: 'chips' }), groupRow = h('div', { class: 'chips' }), eqRow = h('div', { class: 'chips' });

  const chipRow = (row, items, key) => {
    row.replaceChildren(...items.map(x => h('button', { type: 'button', class: 'chip' + (st[key] === x.id ? ' active' : ''), 'aria-pressed': String(st[key] === x.id),
      onClick: () => { st[key] = st[key] === x.id && x.id !== null && key !== 'loc' ? null : x.id; save(FKEY, { loc: st.loc, group: st.group, eq: st.eq }); paintChips(); paint(); } }, x.label)));
  };
  function paintChips() {
    chipRow(locRow, [{ id: 'all', label: 'Tümü' }, { id: 'home', label: 'Evde' }, { id: 'gym', label: 'Salonda' }], 'loc');
    chipRow(groupRow, [{ id: null, label: 'Tüm kaslar' }, ...GROUPS], 'group');
    chipRow(eqRow, [{ id: null, label: 'Tüm ekipman' }, ...EQUIP], 'eq');
  }
  function paint() {
    const nq = norm(st.q);
    const res = EXERCISES.filter(e => fitsLoc(e, st.loc) && (!st.group || e.group === st.group) && (!st.eq || e.eq.includes(st.eq)) &&
      (!nq || norm([e.name, groupLabel(e.group), ...e.muscles.p.map(m => MUSCLES[m]), eqText(e)].join(' ')).includes(nq)));
    count.textContent = `${res.length} egzersiz`;
    if (!res.length) {
      mount(grid, h('div', { class: 'wk-grid-empty' }, emptyState('search', 'Sonuç yok', 'Aramayı kısalt ya da filtreleri temizle.',
        h('button', { class: 'btn primary', type: 'button', onClick: () => { Object.assign(st, { q: '', loc: 'all', group: null, eq: null }); search.value = ''; save(FKEY, {}); paintChips(); paint(); } }, 'Filtreleri temizle'))));
      return;
    }
    mount(grid, res.map(e => exCard(e)));
  }
  paintChips(); paint();
  mount(el,
    h('h1', { class: 'hud-title' }, 'Egzersizler'),
    h('p', { class: 'hud-sub' }, 'Her hareketin nasıl yapıldığını animasyonla izle.'),
    subNav('lib'), activeBanner(),
    h('div', { class: 'search-box' }, icon('search'), search),
    h('div', { class: 'wk-filters' }, locRow, groupRow, eqRow),
    count, grid);
}

export function renderDetail(el, id) {
  const e = EX[id];
  if (!e) {
    mount(el, backButton('workout/lib'), h('div', { class: 'panel' }, emptyState('search', 'Egzersiz bulunamadı', 'Bu egzersiz kütüphanede yok.', h('a', { class: 'btn primary', href: '#/workout/lib' }, 'Egzersizlere dön'))));
    return;
  }
  const pl = player(e.anim, { muscles: e.muscles, phases: e.anim.phases });
  const addBtn = h('button', { class: 'btn primary block lg', type: 'button', onClick: () => {
    const a = getActive();
    if (a) {
      a.exercises.push(makeEntry(e.id)); a.cur = a.exercises.length - 1; setActive(a);
      toast(`${e.name} antrenmana eklendi`, { type: 'success' });
    } else {
      startSession({ name: e.name, location: e.loc === 'gym' ? 'gym' : e.loc === 'home' ? 'home' : getLoc(), items: [{ id: e.id }] });
      toast('Antrenman başladı', { type: 'success' });
    }
    go('workout/session');
  } }, icon(getActive() ? 'plus' : 'play'), getActive() ? 'Antrenmana ekle' : 'Bu egzersizle başla');

  const badges = h('div', { class: 'row wrap gap-s wk-badges' },
    h('span', { class: 'badge' }, groupLabel(e.group)),
    h('span', { class: 'badge muted' }, LEVELS[e.lvl]),
    h('span', { class: 'badge muted' }, LOCS[e.loc]),
    ...e.eq.map(q => h('span', { class: 'badge muted' }, equipLabel(q))));

  const def = e.type === 'time' ? `${e.def.sets} set × ${e.def.sec} sn` : `${e.def.sets} set × ${e.def.reps} tekrar`;

  mount(el,
    backButton(),
    h('h1', { class: 'hud-title' }, e.name),
    badges,
    h('div', { class: 'panel wk-player-panel' }, pl.el),
    h('div', { class: 'info-strip wk-strip' },
      h('div', null, h('div', { class: 'is-label' }, icon('repeat'), 'Önerilen'), h('div', { class: 'is-value' }, def)),
      h('div', null, h('div', { class: 'is-label' }, icon('clock'), 'Dinlenme'), h('div', { class: 'is-value' }, `${e.def.rest} sn`))),
    addBtn,
    sectionTitle('Nasıl yapılır?'),
    h('div', { class: 'panel' },
      h('ol', { class: 'wk-steps' }, e.steps.map(s => h('li', null, s))),
      h('div', { class: 'wk-breath' }, icon('wind'), h('span', null, h('b', null, 'Nefes: '), e.breath))),
    sectionTitle('Çalışan kaslar'),
    h('div', { class: 'panel wk-muscles' },
      h('div', { class: 'wk-mm' }, muscleMap(e.muscles.p, e.muscles.s)),
      h('div', { class: 'wk-mm-legend' },
        h('div', null, h('span', { class: 'wk-dot p' }), h('b', null, 'Ana kaslar')),
        h('p', null, e.muscles.p.map(m => MUSCLES[m]).join(', ')),
        e.muscles.s.length ? [h('div', null, h('span', { class: 'wk-dot s' }), h('b', null, 'Yardımcı kaslar')), h('p', null, e.muscles.s.map(m => MUSCLES[m]).join(', '))] : null)),
    sectionTitle('İpuçları'),
    h('div', { class: 'panel' }, h('ul', { class: 'wk-bullets ok' }, e.tips.map(t => h('li', null, icon('check'), h('span', null, t))))),
    sectionTitle('Sık yapılan hatalar'),
    h('div', { class: 'panel' }, h('ul', { class: 'wk-bullets bad' }, e.mistakes.map(t => h('li', null, icon('x'), h('span', null, t))))),
    sectionTitle('Senin geçmişin'),
    historyPanel(e));
}

function historyPanel(e) {
  const hist = historyFor(e.id);
  if (!hist.length) {
    return h('div', { class: 'panel' }, emptyState('chart', 'Henüz kayıt yok', 'Bu egzersizi bir antrenmanda yaptığında en iyi setin ve gelişimin burada görünür.'));
  }
  const b = bestFor(e.id);
  const timed = e.type === 'time';
  const usesKg = b.kg > 0;
  const series = hist.map(x => timed ? x.bestSec : usesKg ? x.e1rm : x.bestReps);
  const unit = timed ? 'sn' : usesKg ? 'kg' : 'tekrar';
  const best = timed ? `${b.sec} sn` : usesKg && b.bestSet ? `${fmt.n(b.bestSet.kg, b.bestSet.kg % 1 ? 1 : 0)} kg × ${b.bestSet.reps}` : `${b.reps} tekrar`;
  return h('div', { class: 'panel' },
    h('div', { class: 'grid-2' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'En iyi set'), h('div', { class: 'stat-value' }, best)),
      usesKg ? h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Tahmini 1 tekrar max.'), h('div', { class: 'stat-value' }, fmt.n(b.e1rm, 1), h('span', { class: 'stat-unit' }, 'kg')))
        : h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Kaç kez yaptın'), h('div', { class: 'stat-value' }, String(hist.length), h('span', { class: 'stat-unit' }, 'antrenman')))),
    series.length > 1 ? h('div', { class: 'wk-spark' }, h('div', { class: 'small muted' }, `Gelişim (${unit})`), sparkline(series, { width: 300, height: 56 })) : h('p', { class: 'small muted' }, 'Gelişim grafiği için en az iki antrenman gerekli.'),
    h('div', { class: 'list' }, hist.slice(-5).reverse().map(x => h('div', { class: 'list-item' },
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, fmt.date(x.date, 'short')),
        h('div', { class: 'li-sub' }, x.sets.map(s => timed ? `${s.sec} sn` : s.kg ? `${fmt.n(s.kg, s.kg % 1 ? 1 : 0)}×${s.reps}` : `${s.reps}`).join(' · '))),
      usesKg ? h('div', { class: 'li-end' }, `${Math.round(x.e1rm)} kg`) : null))));
}
