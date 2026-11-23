// Yerel besin veritabanı (ilk aramada yüklenir) + Open Food Facts çevrimiçi katmanı.
import { parseData, indexItem, searchIndex, norm, CATS } from './parse.js';
import { getCustom, getRecipes, recipeToFood, getCache, getRecent, getFavs, cacheFood } from './diary.js';

const FILES = ['ingredients', 'dishes', 'meals', 'drinks', 'market'];
let dbPromise = null;
let DB = [], INDEX = [], BY_ID = new Map();

export function loadDB() {
  if (!dbPromise) {
    dbPromise = Promise.all(FILES.map(f => import(`./data/${f}.js`)))
      .then(mods => {
        DB = mods.flatMap(m => parseData(m.default)).map(x => ({ ...x, src: 'local' }));
        INDEX = DB.map(indexItem);
        BY_ID = new Map(DB.map(x => [x.id, x]));
        return DB;
      })
      .catch(e => { dbPromise = null; throw e; });
  }
  return dbPromise;
}
export const dbLoaded = () => DB.length > 0;
export const dbCount = () => DB.length;
export const getLocal = id => BY_ID.get(id);

/** Kullanıcıya ait besinler: kendi besinlerin, tariflerin, önbellekteki online ürünler */
function userFoods() {
  const custom = getCustom().map(x => ({ ...x, cat: 'ozel', src: 'custom' }));
  const recipes = getRecipes().map(recipeToFood);
  const cached = Object.values(getCache()).map(x => ({ ...x, src: 'off', cat: 'online' }));
  return [...custom, ...recipes, ...cached];
}

/** Yerel arama: veritabanı + kullanıcı besinleri. Son yenenler ve favoriler öne çıkar. */
export function searchLocal(q, limit = 60) {
  const recent = new Set(getRecent().map(x => x.id));
  const favs = getFavs();
  const boost = it => (favs[it.id] ? 14 : 0) + (recent.has(it.id) ? 8 : 0) + (it.src === 'custom' || it.src === 'recipe' ? 6 : 0);
  const user = userFoods().map(indexItem);
  return searchIndex([...user, ...INDEX], q, { limit, boost });
}

export function findFood(id) {
  if (!id) return null;
  return BY_ID.get(id) || userFoods().find(x => x.id === id) || getFavs()[id] || getRecent().find(x => x.id === id) || null;
}

export { CATS, norm };

// ---------- Open Food Facts ----------
const OFF = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_tr,brands,nutriments,serving_size,quantity,image_small_url';

export class NetError extends Error {
  constructor(kind, msg) { super(msg); this.kind = kind; }
}

async function getJSON(url, { signal, timeout = 8000 } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new NetError('offline', 'İnternet bağlantısı yok');
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const t = setTimeout(() => { timedOut = true; ctl.abort(); }, timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new NetError(res.status === 404 ? 'notfound' : 'http', 'Sunucu yanıt vermedi (' + res.status + ')');
    return await res.json();
  } catch (e) {
    if (e instanceof NetError) throw e;
    if (signal?.aborted) throw new NetError('aborted', 'İptal edildi');
    if (timedOut) throw new NetError('timeout', 'Bağlantı çok yavaş, zaman aşımı');
    throw new NetError('network', 'Bağlantı kurulamadı');
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

const n = v => { const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v; return Number.isFinite(x) ? x : undefined; };
const r1 = v => (v == null ? undefined : Math.round(v * 10) / 10);

/** "250 ml", "30g", "1 bar (40 g)" → { g, ml } */
function parseAmount(s) {
  if (!s) return null;
  const str = String(s).toLowerCase().replace(',', '.');
  const m = str.match(/\(([\d.]+)\s*(g|gr|ml|cl|l|kg)\)/) || str.match(/([\d.]+)\s*(g|gr|ml|cl|l|kg)\b/);
  if (!m) return null;
  let v = parseFloat(m[1]); const u = m[2];
  if (!(v > 0)) return null;
  if (u === 'kg') v *= 1000; if (u === 'l') v *= 1000; if (u === 'cl') v *= 10;
  return { v: Math.round(v), ml: ['ml', 'cl', 'l'].includes(u) };
}

export function mapOFF(p) {
  if (!p) return null;
  const nm = p.nutriments || {};
  let kcal = n(nm['energy-kcal_100g']);
  if (kcal == null) {
    const e = n(nm.energy_100g);
    if (e != null) kcal = String(nm.energy_unit || 'kJ').toLowerCase() === 'kcal' ? e : e / 4.184;
  }
  const name = (p.product_name_tr || p.product_name || '').trim();
  if (!name || kcal == null) return null;
  const serving = parseAmount(p.serving_size), qty = parseAmount(p.quantity);
  const unit = (serving?.ml || qty?.ml) ? 'ml' : 'g';
  const portions = [];
  if (serving && serving.v <= 1500) portions.push({ l: `1 porsiyon (${serving.v} ${unit})`, g: serving.v });
  if (qty && qty.v <= 2000 && qty.v !== serving?.v) portions.push({ l: `1 paket (${qty.v} ${unit})`, g: qty.v });
  const brand = String(p.brands || '').split(',')[0].trim();
  const food = {
    id: 'off-' + p.code, code: String(p.code || ''), name, cat: 'online', src: 'off', unit,
    kcal: Math.round(kcal), p: r1(n(nm.proteins_100g) || 0), c: r1(n(nm.carbohydrates_100g) || 0), f: r1(n(nm.fat_100g) || 0),
    portions,
  };
  if (brand) food.brand = brand;
  const fib = n(nm.fiber_100g), sug = n(nm.sugars_100g), salt = n(nm.salt_100g);
  if (fib != null) food.fib = r1(fib);
  if (sug != null) food.sug = r1(sug);
  if (salt != null) food.salt = Math.round(salt * 100) / 100;
  if (p.image_small_url) food.img = p.image_small_url;
  return food;
}

export async function searchOnline(q, { signal } = {}) {
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${FIELDS}`;
  const data = await getJSON(url, { signal });
  const seen = new Set();
  return (data.products || []).map(mapOFF).filter(f => f && !seen.has(f.code) && seen.add(f.code));
}

/** Barkod: önce kendi besinlerin, sonra önbellek, sonra Open Food Facts */
export async function lookupBarcode(code, { signal } = {}) {
  code = String(code).replace(/\D/g, '');
  const own = getCustom().find(x => x.code === code);
  if (own) return { ...own, cat: 'ozel', src: 'custom' };
  const cached = getCache()[code];
  if (cached) return { ...cached, src: 'off', cat: 'online' };
  try {
    const data = await getJSON(`${OFF}/api/v2/product/${code}.json?fields=${FIELDS}`, { signal });
    if (data.status !== 1 && data.status !== 'success') return null;
    const food = mapOFF({ ...data.product, code: data.product?.code || code });
    if (food) cacheFood(food);
    return food;
  } catch (e) {
    if (e.kind === 'notfound') return null;
    throw e;
  }
}

export const isBarcode = q => /^\d{8,14}$/.test(String(q).replace(/\s/g, ''));
