// Tarif listesi: arama, kategori kartları, filtreler, sıralama, favoriler.
import { h, icon, mount, fmt, sectionTitle, emptyState } from '../../core/ui.js';
import { subscribe } from '../../core/store.js';
import { CATS, CAT, allRecipes, matches, totalMin } from './data.js';
import { recipeCard, getFavs, getShopping, fullGrad } from './util.js';
import { nav } from './nav.js';

const FILTERS = [
  { id: 'protein', label: 'Yüksek protein', test: r => r.tags.includes('yüksek protein') },
  { id: 'lowcarb', label: 'Düşük karbonhidrat', test: r => r.tags.includes('düşük karbonhidrat') },
  { id: 'veg', label: 'Vejetaryen', test: r => r.tags.includes('vejetaryen') },
  { id: 'vegan', label: 'Vegan', test: r => r.tags.includes('vegan') },
  { id: 'gf', label: 'Glutensiz', test: r => r.tags.includes('glutensiz') },
  { id: 'quick', label: '15 dk altı', test: r => totalMin(r) <= 15 },
  { id: 'prep', label: 'Haftalık hazırlık', test: r => r.tags.includes('meal prep') },
  { id: 'nosugar', label: 'Şekersiz', test: r => r.tags.includes('şekersiz') },
  { id: 'student', label: 'Öğrenci dostu', test: r => r.tags.includes('öğrenci dostu') },
  { id: 'sweet', label: 'Tatlı', test: r => r.cat === 'tatli' },
];
const SORTS = [
  { id: 'rec', label: 'Önerilen' },
  { id: 'kcal', label: 'Kaloriye göre' },
  { id: 'protein', label: 'Proteine göre' },
  { id: 'time', label: 'Süreye göre' },
];
const PAGE = 24;

// Sayfalar arası korunan durum (tarif detayından dönünce kaldığın yer)
const st = { q: '', cat: null, filters: new Set(), sort: 'rec', shown: PAGE, scroll: 0 };

/** Önerilen sıra: kategoriler arasında dönüşümlü, böylece liste çeşitli görünür */
function recommended(list) {
  const groups = CATS.map(c => list.filter(r => r.cat === c.id));
  const out = [];
  for (let i = 0; out.length < list.length; i++) groups.forEach(g => { if (g[i]) out.push(g[i]); });
  return out;
}

function sorted(list) {
  const l = [...list];
  if (st.sort === 'kcal') return l.sort((a, b) => a.perServing.kcal - b.perServing.kcal);
  if (st.sort === 'protein') return l.sort((a, b) => b.perServing.p - a.perServing.p);
  if (st.sort === 'time') return l.sort((a, b) => totalMin(a) - totalMin(b));
  return st.cat ? l : recommended(l);
}

export function renderBrowse(el) {
  const all = allRecipes();
  const isDefault = () => !st.q && !st.cat && !st.filters.size;

  const openCard = () => { st.scroll = window.scrollY; };

  // --- Üst kısım ---
  const shopCount = h('span', { class: 'rcp-count-badge hide' });
  const paintShopCount = () => {
    const n = getShopping().filter(x => !x.checked).length;
    shopCount.textContent = n > 99 ? '99+' : String(n);
    shopCount.classList.toggle('hide', !n);
  };
  paintShopCount();
  const head = h('div', { class: 'rcp-head' },
    h('div', { class: 'grow' }, h('h1', { class: 'hud-title' }, 'Fit Tarifler'), h('p', { class: 'hud-sub' }, `${all.length} sağlıklı tarif · çorbadan tatlıya`)),
    h('a', { class: 'rcp-icon-btn', href: '#/recipes/shopping', 'aria-label': 'Alışveriş listesi' }, icon('list'), shopCount));

  const input = h('input', { class: 'input', type: 'search', placeholder: 'Tarif ya da malzeme ara', value: st.q, 'aria-label': 'Tarif ara', enterkeyhint: 'search' });
  const clearBtn = h('button', { class: 'rcp-search-clear' + (st.q ? '' : ' hide'), type: 'button', 'aria-label': 'Aramayı temizle', onClick: () => { input.value = ''; st.q = ''; clearBtn.classList.add('hide'); st.shown = PAGE; paint(); input.focus(); } }, icon('x', { size: 16 }));
  let deb;
  input.addEventListener('input', () => {
    clearBtn.classList.toggle('hide', !input.value);
    clearTimeout(deb);
    deb = setTimeout(() => { st.q = input.value.trim(); st.shown = PAGE; paint(); }, 160);
  });
  const search = h('div', { class: 'search-box rcp-search' }, icon('search'), input, clearBtn);

  // --- Varsayılan görünüm blokları ---
  const intro = h('div');
  function paintIntro() {
    if (!isDefault()) { intro.replaceChildren(); return; }
    const favs = getFavs().map(id => all.find(r => r.id === id)).filter(Boolean);
    mount(intro,
      h('a', { class: 'panel hero rcp-plan-hero', href: '#/recipes/plan' },
        h('div', { class: 'grow' },
          h('div', { class: 'rcp-hero-kicker' }, 'Bugün ne yesem?'),
          h('div', { class: 'rcp-hero-title' }, 'Hedefine göre günlük menü'),
          h('div', { class: 'rcp-hero-sub' }, 'Kalori ve protein hedefine uygun 4 öğün önerelim.'),
          h('span', { class: 'btn primary sm rcp-hero-btn' }, icon('sparkle'), 'Menü öner')),
        h('div', { class: 'rcp-hero-emoji', 'aria-hidden': 'true' }, '🥗')),
      favs.length ? [
        sectionTitle('Favorilerin', h('span', { class: 'muted small' }, favs.length + ' tarif')),
        h('div', { class: 'rcp-hscroll' }, favs.map(r => recipeCard(r, { fav: true, onOpen: openCard }))),
      ] : null,
      sectionTitle('Kategoriler'),
      h('div', { class: 'rcp-cats' }, CATS.map(c => {
        const n = all.filter(r => r.cat === c.id).length;
        return h('button', { class: 'rcp-cat', type: 'button', style: { background: fullGrad(c.id) }, onClick: () => { st.cat = c.id; st.shown = PAGE; paint(); resHead.scrollIntoView({ block: 'start' }); } },
          h('span', { class: 'rcp-cat-txt' }, h('b', null, c.label), h('small', null, n + ' tarif')),
          h('span', { class: 'rcp-cat-emoji', 'aria-hidden': 'true' }, c.emoji));
      })));
  }

  // --- Kontroller ---
  const catChips = h('div', { class: 'chips rcp-chips' });
  const filterChips = h('div', { class: 'chips rcp-chips' });
  const sortSel = h('select', { class: 'select rcp-sort', 'aria-label': 'Sıralama' }, SORTS.map(s => h('option', { value: s.id, selected: s.id === st.sort }, s.label)));
  sortSel.addEventListener('change', () => { st.sort = sortSel.value; st.shown = PAGE; paintResults(); });
  const countEl = h('span', { class: 'muted small' });
  const results = h('div', { class: 'rcp-results' });

  function paintChips() {
    mount(catChips,
      h('button', { class: 'chip' + (!st.cat ? ' active' : ''), type: 'button', onClick: () => { st.cat = null; st.shown = PAGE; paint(); } }, 'Tümü'),
      CATS.map(c => h('button', { class: 'chip' + (st.cat === c.id ? ' active' : ''), type: 'button', 'aria-pressed': String(st.cat === c.id),
        onClick: () => { st.cat = st.cat === c.id ? null : c.id; st.shown = PAGE; paint(); } }, h('span', { 'aria-hidden': 'true' }, c.emoji), c.label)));
    mount(filterChips, FILTERS.map(f => h('button', { class: 'chip rcp-fchip' + (st.filters.has(f.id) ? ' active' : ''), type: 'button', 'aria-pressed': String(st.filters.has(f.id)),
      onClick: () => { st.filters.has(f.id) ? st.filters.delete(f.id) : st.filters.add(f.id); st.shown = PAGE; paint(); } },
      st.filters.has(f.id) && icon('check'), f.label)));
  }

  function filtered() {
    const fs = FILTERS.filter(f => st.filters.has(f.id));
    return all.filter(r => (!st.cat || r.cat === st.cat) && fs.every(f => f.test(r)) && matches(r, st.q));
  }

  function paintResults() {
    const list = sorted(filtered());
    countEl.textContent = list.length + ' tarif';
    if (!list.length) {
      mount(results, h('div', { class: 'panel' }, emptyState('search', 'Sonuç bulunamadı', 'Farklı bir kelime dene ya da bazı filtreleri kaldır.',
        h('button', { class: 'btn primary', type: 'button', onClick: resetAll }, 'Filtreleri temizle'))));
      return;
    }
    const favs = new Set(getFavs());
    const shown = list.slice(0, st.shown);
    mount(results,
      h('div', { class: 'rcp-grid' }, shown.map(r => recipeCard(r, { fav: favs.has(r.id), onOpen: openCard }))),
      list.length > shown.length && h('button', { class: 'btn ghost block rcp-more', type: 'button', onClick: () => { st.shown += PAGE; paintResults(); } },
        `Daha fazla göster (${list.length - shown.length})`));
  }

  function resetAll() {
    st.q = ''; st.cat = null; st.filters.clear(); st.shown = PAGE;
    input.value = ''; clearBtn.classList.add('hide');
    paint();
  }

  const activeBar = h('div');
  function paintActive() {
    if (isDefault()) { activeBar.replaceChildren(); return; }
    const parts = [st.cat && CAT[st.cat].label, ...FILTERS.filter(f => st.filters.has(f.id)).map(f => f.label)].filter(Boolean);
    mount(activeBar, h('div', { class: 'rcp-active' },
      h('span', { class: 'grow small muted' }, st.q ? `“${st.q}” için sonuçlar` : parts.join(' · ')),
      h('button', { class: 'rcp-linkbtn', type: 'button', onClick: resetAll }, 'Temizle')));
  }

  const resHead = h('div', { class: 'rcp-results-head' }, sectionTitle('Tüm tarifler', countEl));
  function paint() {
    paintIntro(); paintChips(); paintActive(); paintResults();
    resHead.querySelector('.st-text').textContent = isDefault() ? 'Tüm tarifler' : 'Tarifler';
  }

  el.append(
    nav.exitButton(),
    head,
    search,
    intro,
    resHead,
    catChips,
    filterChips,
    h('div', { class: 'row rcp-sortrow' }, h('span', { class: 'small muted grow' }, 'Sırala'), sortSel),
    activeBar,
    results);

  paint();

  if (st.scroll && nav.cameFrom('#/recipes/')) requestAnimationFrame(() => window.scrollTo(0, st.scroll));
  st.scroll = 0;

  const unsubs = [subscribe('recipes.shopping', paintShopCount)];
  return () => { clearTimeout(deb); unsubs.forEach(u => u()); };
}
