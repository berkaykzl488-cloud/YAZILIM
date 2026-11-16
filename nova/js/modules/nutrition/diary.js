// Beslenme günlüğü verisi: günlük kayıtlar, su, favoriler, son yenenler, kendi besinlerin ve tariflerin.
import { load, save, update, todayKey, addDays } from '../../core/store.js';
import { uid } from '../../core/ui.js';
import { calorieTarget, waterTarget } from '../../core/profile.js';
import { awardXP } from '../../core/xp.js';

export const MEALS = [
  { id: 'breakfast', l: 'Kahvaltı', e: '🍳', h: 'var(--amber)' },
  { id: 'lunch', l: 'Öğle yemeği', e: '🥗', h: 'var(--lime)' },
  { id: 'dinner', l: 'Akşam yemeği', e: '🍲', h: 'var(--accent)' },
  { id: 'snack', l: 'Ara öğün', e: '🍎', h: 'var(--magenta)' },
];
export const mealById = id => MEALS.find(m => m.id === id) || MEALS[3];

/** Saate göre öneri öğün */
export function defaultMeal(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 630) return 'breakfast';
  if (m < 900) return 'lunch';
  if (m < 1050) return 'snack';
  if (m < 1320) return 'dinner';
  return 'snack';
}

const K = { diary: 'nutrition', favs: 'nutrition.favs', recent: 'nutrition.recent', custom: 'foods.custom', recipes: 'nutrition.recipes', cache: 'foods.cache' };
export const KEYS = K;

const r1 = v => Math.round((+v || 0) * 10) / 10;

function normDay(d) {
  const day = d && typeof d === 'object' ? d : {};
  return { entries: Array.isArray(day.entries) ? day.entries.filter(e => e && typeof e === 'object') : [], waterMl: +day.waterMl || 0 };
}

export function getDay(dk) { return normDay(load(K.diary, {})?.[dk]); }

export function updateDay(dk, fn) {
  update(K.diary, all => {
    all = all && typeof all === 'object' ? all : {};
    const d = normDay(all[dk]);
    fn(d);
    if (!d.entries.length && !d.waterMl) delete all[dk]; else all[dk] = d;
    return all;
  }, {});
  if (dk === todayKey()) checkXP(dk);
}

/** Kayıt toplamları */
export function totals(entries) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const e of entries) { t.kcal += +e.kcal || 0; t.p += +e.p || 0; t.c += +e.c || 0; t.f += +e.f || 0; }
  return { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f) };
}

export function dayTotals(dk) {
  const d = getDay(dk);
  return { ...totals(d.entries), waterMl: d.waterMl, count: d.entries.length };
}

/** Besin + miktar → değerler */
export function calc(food, grams) {
  const k = (+grams || 0) / 100;
  return { kcal: Math.round((food.kcal || 0) * k), p: r1((food.p || 0) * k), c: r1((food.c || 0) * k), f: r1((food.f || 0) * k) };
}

/** Kaydın 100 g/ml başına değerleri (tarif modülünün yazdığı kayıtlarda per yoktur → orantıdan çıkarılır) */
export function per100(e) {
  if (Array.isArray(e.per)) return { kcal: e.per[0], p: e.per[1], c: e.per[2], f: e.per[3] };
  const g = +e.grams;
  if (!(g > 0)) return null;
  const k = 100 / g;
  return { kcal: (+e.kcal || 0) * k, p: (+e.p || 0) * k, c: (+e.c || 0) * k, f: (+e.f || 0) * k };
}

export function makeEntry(food, grams, meal) {
  const v = calc(food, grams);
  return {
    id: uid(), meal, foodId: food.id, name: food.name, brand: food.brand || '', grams: Math.round(grams * 10) / 10,
    unit: food.unit || 'g', ...v, ts: Date.now(), per: [food.kcal, food.p, food.c, food.f],
  };
}

export function addEntry(dk, food, grams, meal) {
  const e = makeEntry(food, grams, meal);
  updateDay(dk, d => d.entries.push(e));
  pushRecent(food);
  return e;
}

export function addQuick(dk, { name, kcal, p = 0, c = 0, f = 0, meal }) {
  const e = { id: uid(), meal, foodId: 'quick', name: name || 'Hızlı kalori', brand: '', grams: 0, kcal: Math.round(kcal), p: r1(p), c: r1(c), f: r1(f), ts: Date.now(), quick: true };
  updateDay(dk, d => d.entries.push(e));
  return e;
}

export function editEntry(dk, id, patch) {
  updateDay(dk, d => {
    const e = d.entries.find(x => x.id === id);
    if (!e) return;
    if (patch.grams != null && !e.quick) {
      const base = per100(e);
      if (base) Object.assign(e, calc(base, patch.grams), { grams: Math.round(patch.grams * 10) / 10 });
      if (!e.per && base) e.per = [base.kcal, base.p, base.c, base.f].map(r1);
    }
    for (const k of ['meal', 'name', 'kcal', 'p', 'c', 'f']) if (patch[k] != null) e[k] = k === 'kcal' ? Math.round(patch[k]) : (typeof patch[k] === 'number' ? r1(patch[k]) : patch[k]);
  });
}

export function deleteEntry(dk, id) { updateDay(dk, d => { d.entries = d.entries.filter(x => x.id !== id); }); }

export function copyMeal(fromDk, toDk, meal) {
  const src = getDay(fromDk).entries.filter(e => e.meal === meal);
  if (!src.length) return 0;
  updateDay(toDk, d => { for (const e of src) d.entries.push({ ...e, id: uid(), ts: Date.now() }); });
  return src.length;
}

export function setWater(dk, ml) { updateDay(dk, d => { d.waterMl = Math.max(0, Math.min(10000, Math.round(ml))); }); }

// ---------- XP ----------
export function checkXP(dk) {
  const d = getDay(dk);
  const meals = new Set(d.entries.map(e => e.meal));
  if (meals.size >= 3) awardXP(30, 'Beslenme: 3 öğün kaydettin', { once: `nutrition-meals-${dk}` });
  if (d.waterMl >= waterTarget()) awardXP(15, 'Su hedefine ulaştın', { once: `nutrition-water-${dk}` });
}

// ---------- Kütüphane ----------
const SNAP_KEYS = ['id', 'name', 'brand', 'cat', 'kcal', 'p', 'c', 'f', 'fib', 'sug', 'salt', 'unit', 'portions', 'approx', 'src', 'code', 'img'];
export function snap(food) {
  const o = {};
  for (const k of SNAP_KEYS) if (food[k] != null && food[k] !== '') o[k] = food[k];
  return o;
}

export function pushRecent(food) {
  if (!food?.id || food.id === 'quick') return;
  update(K.recent, list => [snap(food), ...(Array.isArray(list) ? list : []).filter(x => x.id !== food.id)].slice(0, 40), []);
}
export const getRecent = () => load(K.recent, []);

export const getFavs = () => load(K.favs, {});
export const isFav = id => !!getFavs()[id];
export function toggleFav(food) {
  let on = false;
  update(K.favs, f => {
    f = f && typeof f === 'object' ? f : {};
    if (f[food.id]) delete f[food.id]; else { f[food.id] = { ...snap(food), favTs: Date.now() }; on = true; }
    return f;
  }, {});
  return on;
}

export const getCustom = () => load(K.custom, []);
export function saveCustom(food) {
  update(K.custom, list => {
    list = Array.isArray(list) ? list : [];
    const i = list.findIndex(x => x.id === food.id);
    if (i >= 0) list[i] = food; else list.unshift(food);
    return list;
  }, []);
}
export function deleteCustom(id) { update(K.custom, list => (list || []).filter(x => x.id !== id), []); }

export const getRecipes = () => load(K.recipes, []);
export function saveRecipe(r) {
  update(K.recipes, list => {
    list = Array.isArray(list) ? list : [];
    const i = list.findIndex(x => x.id === r.id);
    if (i >= 0) list[i] = r; else list.unshift(r);
    return list;
  }, []);
}
export function deleteRecipe(id) { update(K.recipes, list => (list || []).filter(x => x.id !== id), []); }

/** Tarifi (malzeme listesi) besine dönüştürür: 100 g başına değerler + 1 porsiyon */
export function recipeToFood(r) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, g: 0 };
  for (const it of r.items || []) { t.kcal += it.kcal; t.p += it.p; t.c += it.c; t.f += it.f; t.g += it.grams; }
  const totalG = +r.cookedG > 0 ? +r.cookedG : t.g;
  const servings = Math.max(1, +r.servings || 1);
  const k = totalG > 0 ? 100 / totalG : 0;
  return {
    id: 'r-' + r.id, name: r.name, cat: 'tarif', src: 'recipe', unit: 'g',
    kcal: Math.round(t.kcal * k), p: r1(t.p * k), c: r1(t.c * k), f: r1(t.f * k),
    portions: totalG > 0 ? [{ l: '1 porsiyon', g: Math.round(totalG / servings) }] : [],
    totals: { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f), g: Math.round(t.g) }, servings, totalG,
  };
}

// ---------- Open Food Facts önbelleği ----------
export function getCache() { return load(K.cache, {}); }
export function cacheFood(food) {
  if (!food?.code) return;
  update(K.cache, c => {
    c = c && typeof c === 'object' ? c : {};
    c[food.code] = { ...snap(food), cachedAt: Date.now() };
    const keys = Object.keys(c);
    if (keys.length > 300) keys.sort((a, b) => (c[a].cachedAt || 0) - (c[b].cachedAt || 0)).slice(0, keys.length - 300).forEach(k => delete c[k]);
    return c;
  }, {});
}

// ---------- Haftalık ----------
export function week(endDk) {
  const out = [];
  for (let i = 6; i >= 0; i--) { const dk = addDays(endDk, -i); out.push({ dk, ...dayTotals(dk) }); }
  return out;
}

export { calorieTarget, waterTarget };
