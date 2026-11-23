// Fit Tarifler — ortak yardımcılar: miktar biçimi, günlüğe yazma, favoriler, alışveriş listesi, kartlar.
import { h, icon, toast, uid, fmt } from '../../core/ui.js';
import { load, save, update } from '../../core/store.js';
import { CAT, norm, totalMin } from './data.js';

export const MEALS = [
  { id: 'breakfast', label: 'Kahvaltı' },
  { id: 'lunch', label: 'Öğle' },
  { id: 'dinner', label: 'Akşam' },
  { id: 'snack', label: 'Ara öğün' },
];
export const MEAL_LABEL = Object.fromEntries(MEALS.map(m => [m.id, m.label]));

export function defaultMeal(r) {
  if (r?.cat === 'kahvalti') return 'breakfast';
  if (['ara', 'smoothie', 'tatli'].includes(r?.cat)) return 'snack';
  const hr = new Date().getHours();
  if (hr < 11) return 'breakfast';
  if (hr < 16) return 'lunch';
  return 'dinner';
}

const r1 = x => Math.round(x * 10) / 10;

// ---------- Miktar biçimi ----------
const FRACS = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
/** 1.5 -> '1½', 0.5 -> '½', 2 -> '2' */
export function fracStr(q) {
  if (!(q > 0)) return '0';
  let whole = Math.floor(q);
  const rest = q - whole;
  let best = FRACS[0];
  for (const f of FRACS) if (Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f;
  if (best[0] === 1) { whole += 1; best = FRACS[0]; }
  if (!whole && !best[1]) return '¼';
  return (whole || '') + best[1];
}

const UNIT_LABEL = { yk: 'yemek kaşığı', tk: 'tatlı kaşığı', 'su bardağı': 'su bardağı', 'çay bardağı': 'çay bardağı', tutam: 'tutam', adet: 'adet', g: 'g', ml: 'ml' };

/** Miktarı birimiyle birlikte okunur metne çevirir */
export function qtyText(qty, unit) {
  if (qty == null || !(qty > 0)) return '';
  if (unit === 'g' || unit === 'ml') {
    if (qty >= 1000) return fmt.n(Math.round(qty / 100) / 10, qty % 1000 < 50 ? 0 : 1) + (unit === 'g' ? ' kg' : ' L');
    const v = qty < 10 ? Math.round(qty * 2) / 2 : qty < 100 ? Math.round(qty) : Math.round(qty / 5) * 5;
    return fmt.n(v, v % 1 ? 1 : 0) + ' ' + unit;
  }
  if (unit === 'tutam') return Math.max(1, Math.round(qty)) + ' tutam';
  return fracStr(qty) + ' ' + (UNIT_LABEL[unit] || unit || '');
}

export const portionText = p => fracStr(p) + ' porsiyon';

export function scaledNutrition(r, portions) {
  const s = r.perServing;
  return { kcal: Math.round(s.kcal * portions), p: r1(s.p * portions), c: r1(s.c * portions), f: r1(s.f * portions), fib: r1(s.fib * portions) };
}

// ---------- Beslenme günlüğü ----------
/** Tarifi beslenme günlüğüne yazar (nutrition modülünün biçimi) */
export function addToDiary(recipe, portions, meal, date) {
  const n = scaledNutrition(recipe, portions);
  const entry = {
    id: uid(), meal, foodId: 'recipe:' + recipe.id, name: recipe.name, brand: 'Tarif',
    grams: Math.round(recipe.gramsPerServing * portions),
    kcal: n.kcal, p: n.p, c: n.c, f: n.f, ts: Date.now(),
  };
  update('nutrition', obj => {
    const all = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    const day = all[date] && typeof all[date] === 'object' ? all[date] : { entries: [], waterMl: 0 };
    if (!Array.isArray(day.entries)) day.entries = [];
    if (day.waterMl == null) day.waterMl = 0;
    day.entries = [...day.entries, entry];
    all[date] = day;
    return all;
  }, {});
  return entry;
}

/** Eylem bağlantılı bildirim */
export function toastAction(msg, label, onClick, type = 'success') {
  toast(msg, { type, ms: 4800 });
  const wrap = document.querySelector('.toast-wrap');
  const t = wrap?.lastElementChild;
  if (t) t.appendChild(h('button', { class: 'rcp-toast-act', type: 'button', onClick: () => { t.remove(); onClick(); } }, label));
}
export const goDiary = () => { location.hash = '#/nutrition'; };

// ---------- Favoriler ----------
export const getFavs = () => { const v = load('recipes.fav', []); return Array.isArray(v) ? v : []; };
export const isFav = id => getFavs().includes(id);
export function toggleFav(id) {
  const favs = getFavs();
  const on = !favs.includes(id);
  save('recipes.fav', on ? [id, ...favs] : favs.filter(x => x !== id));
  return on;
}

// ---------- Alışveriş listesi ----------
export const getShopping = () => { const v = load('recipes.shopping', []); return Array.isArray(v) ? v : []; };
export const saveShopping = list => save('recipes.shopping', list);

/** items: [{name, qty, unit, recipe?}] — aynı ad + birim birleşir */
export function addToShopping(items) {
  const list = getShopping();
  let added = 0;
  for (const it of items) {
    const key = norm(it.name) + '|' + (it.unit || '');
    const ex = list.find(x => norm(x.name) + '|' + (x.unit || '') === key);
    if (ex) {
      if (it.qty != null && ex.qty != null) ex.qty = Math.round((ex.qty + it.qty) * 100) / 100;
      ex.checked = false;
      if (it.recipe && !ex.recipes?.includes(it.recipe)) ex.recipes = [...(ex.recipes || []), it.recipe];
    } else {
      list.push({ id: uid(), name: it.name, qty: it.qty ?? null, unit: it.unit || '', checked: false, recipes: it.recipe ? [it.recipe] : [] });
      added++;
    }
  }
  saveShopping(list);
  return { added, merged: items.length - added };
}

const AISLES = [
  { id: 'pantry', label: 'Baharat, yağ ve sos', emoji: '🧂', re: /(tuz|karabiber|pul biber|toz biber|kimyon|kekik|kuru nane|tarçın|zerdeçal|köri|sumak|muskat|biberiye|defne|yenibahar|vanilya|yağı|yağ\b|salça|sirke|soya sosu|hardal|^bal$|nar ekşisi|tahin|kakao|kabartma|nişasta|kapari|susam|sarımsak tozu|şeker)/ },
  { id: 'produce', label: 'Meyve ve sebze', emoji: '🥕', re: /(domates|biber|soğan|sarımsak|havuç|patates|kabak|patlıcan|ıspanak|brokoli|karnabahar|mantar|marul|roka|salatalık|maydanoz|dereotu|nane yaprağı|kişniş|limon|muz|elma|çilek|yaban mersini|orman meyvesi|avokado|balkabağı|pırasa|enginar|taze fasulye|bezelye|mango|portakal|zencefil|yeşillik|asma yaprağı|kayısı|yeşil soğan)/ },
  { id: 'protein', label: 'Et, tavuk ve balık', emoji: '🍗', re: /(tavuk|dana|kıyma|hindi(?!stan)|somon|levrek|çupra|hamsi|uskumru|mezgit|karides|kalamar|ton balığı|kuşbaşı|bonfile)/ },
  { id: 'dairy', label: 'Süt ürünleri ve yumurta', emoji: '🥚', re: /^(?!.*(badem|soya|hindistan)).*(süt|yoğurt|peynir|lor|kaşar|parmesan|labne|kefir|tereyağı|yumurta)/ },
  { id: 'grains', label: 'Bakliyat, tahıl ve ekmek', emoji: '🌾', re: /(mercimek|nohut|fasulye|barbunya|bulgur|pirinç|kinoa|yulaf|makarna|şehriye|\bun\b|unu|ekmek|lavaş|tarhana|bakla|galeta|bisküvi|irmik)/ },
  { id: 'other', label: 'Diğer', emoji: '🛒', re: /.*/ },
];
export function aisleOf(name) {
  const n = String(name).toLocaleLowerCase('tr');
  return AISLES.find(a => a.re.test(n));
}
export { AISLES };

/** Evde genelde bulunanlar: alışveriş listesine varsayılan olarak eklenmez */
export const isPantryStaple = name => /^(su|sıcak su|soğuk su|buz|tuz)$/.test(String(name).toLocaleLowerCase('tr'));

// ---------- Görsel parçalar ----------
export function tint(cat, a = 0.38) {
  const g = CAT[cat]?.grad || ['#666', '#444'];
  const rgba = (hex, al) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${al})`; };
  return `radial-gradient(120% 90% at 25% 15%, rgba(255,255,255,.12), transparent 60%), linear-gradient(145deg, ${rgba(g[0], a + 0.2)}, ${rgba(g[1], a)})`;
}
export const fullGrad = cat => { const g = CAT[cat]?.grad || ['#666', '#444']; return `linear-gradient(135deg, ${g[0]}, ${g[1]})`; };

export const diffLabel = d => ({ kolay: 'Kolay', orta: 'Orta', zor: 'Zor' }[d] || d);
export const minText = m => (m >= 60 ? `${Math.floor(m / 60)} sa${m % 60 ? ' ' + (m % 60) + ' dk' : ''}` : `${m} dk`);

/** Izgara için tarif kartı */
export function recipeCard(r, { onOpen, fav = false } = {}) {
  return h('a', { class: 'rcp-card', href: '#/recipes/' + r.id, onClick: e => { onOpen?.(r, e); } },
    h('div', { class: 'rcp-card-tile', style: { background: tint(r.cat) } },
      h('span', { class: 'rcp-emoji', 'aria-hidden': 'true' }, r.emoji),
      fav && h('span', { class: 'rcp-card-fav', 'aria-label': 'Favori' }, icon('heart', { size: 14 }))),
    h('div', { class: 'rcp-card-body' },
      h('div', { class: 'rcp-card-name' }, r.name),
      h('div', { class: 'rcp-card-macro' }, icon('flame', { size: 13 }), h('b', null, fmt.n(r.perServing.kcal)), ' kcal', h('span', { class: 'rcp-dot' }), icon('clock', { size: 13 }), minText(totalMin(r))),
      r.cat === 'sos'
        ? h('div', { class: 'rcp-card-meta' }, 'Porsiyon ', h('b', null, r.gramsPerServing + ' g'), h('span', { class: 'rcp-dot' }), r.servings + ' kişilik')
        : h('div', { class: 'rcp-card-meta' }, h('b', null, fmt.n(r.perServing.p) + ' g'), ' protein', h('span', { class: 'rcp-dot' }), diffLabel(r.difficulty))));
}

/** Dokunulabilir küçük bağlantı kartı (sos önerileri, yanına yakışanlar) */
export function linkRow(r, sub) {
  return h('a', { class: 'rcp-link-row', href: '#/recipes/' + r.id },
    h('div', { class: 'rcp-row-tile', style: { background: tint(r.cat) } }, h('span', { 'aria-hidden': 'true' }, r.emoji)),
    h('div', { class: 'li-main' }, h('div', { class: 'rcp-row-name' }, r.name), h('div', { class: 'li-sub' }, sub)),
    h('span', { class: 'rcp-link-chev', 'aria-hidden': 'true' }, icon('right', { size: 18 })));
}

/** Haftalık plan sayfasına giden kart (tarifler ana sayfası, günlük menü) */
export function weekLinkCard(title = 'Haftalık yemek planı', sub = '7 günlük menü ve tek dokunuşla alışveriş listesi') {
  return h('a', { class: 'panel click rcp-week-link', href: '#/recipes/week' },
    h('span', { class: 'rcp-week-link-ic', 'aria-hidden': 'true' }, icon('calendar')),
    h('div', { class: 'li-main' }, h('div', { class: 'rcp-row-name' }, title), h('div', { class: 'li-sub' }, sub)),
    h('span', { class: 'rcp-link-chev', 'aria-hidden': 'true' }, icon('right', { size: 18 })));
}

/** Liste satırı tarzı küçük kart (plan, favori satırı) */
export function recipeRow(r, sub, end = null, onClick = null) {
  return h('div', { class: 'rcp-row' + (onClick ? ' click' : ''), onClick },
    h('div', { class: 'rcp-row-tile', style: { background: tint(r.cat) } }, h('span', { 'aria-hidden': 'true' }, r.emoji)),
    h('div', { class: 'li-main' }, h('div', { class: 'rcp-row-name' }, r.name), h('div', { class: 'li-sub' }, sub)),
    end);
}

// ---------- Oturum içi durum ----------
/** Tarif başına seçilen porsiyon ve işaretlenen malzemeler (sayfalar arasında korunur) */
export const session = { portions: new Map(), checked: new Map() };
export const portionsOf = r => session.portions.get(r.id) ?? r.servings;
