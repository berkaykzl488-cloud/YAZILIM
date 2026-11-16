// Fit Tarifler — kategori bilgisi, tembel veri yükleme ve arama yardımcıları.

export const CATS = [
  { id: 'kahvalti', label: 'Kahvaltı', emoji: '🍳', grad: ['#ff9d45', '#f06418'] },
  { id: 'corba', label: 'Çorba', emoji: '🥣', grad: ['#ffc24f', '#e48b17'] },
  { id: 'tavuk', label: 'Tavuk', emoji: '🍗', grad: ['#ff7550', '#d63c2a'] },
  { id: 'et', label: 'Et ve hindi', emoji: '🥩', grad: ['#e9566a', '#a8283c'] },
  { id: 'balik', label: 'Balık', emoji: '🐟', grad: ['#52aaff', '#2a66d4'] },
  { id: 'baklagil', label: 'Baklagil', emoji: '🫘', grad: ['#4fcf86', '#1f8f52'] },
  { id: 'sebze', label: 'Sebze yemekleri', emoji: '🫑', grad: ['#8fd65a', '#3e9b3a'] },
  { id: 'salata', label: 'Salata ve kase', emoji: '🥗', grad: ['#3ccfb4', '#178f7c'] },
  { id: 'mealprep', label: 'Haftalık hazırlık', emoji: '🍱', grad: ['#9184ff', '#5a46d6'] },
  { id: 'ara', label: 'Ara öğün', emoji: '🥜', grad: ['#d3a06d', '#94643c'] },
  { id: 'smoothie', label: 'Smoothie ve shake', emoji: '🥤', grad: ['#ff72a8', '#d23d78'] },
  { id: 'tatli', label: 'Fit tatlılar', emoji: '🍰', grad: ['#c472ff', '#8240d6'] },
];
export const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));

const FILES = {
  kahvalti: () => import('./data/kahvalti.js'),
  corba: () => import('./data/corba.js'),
  tavuk: () => import('./data/tavuk.js'),
  et: () => import('./data/et.js'),
  balik: () => import('./data/balik.js'),
  baklagil: () => import('./data/baklagil.js'),
  sebze: () => import('./data/sebze.js'),
  salata: () => import('./data/salata.js'),
  mealprep: () => import('./data/mealprep.js'),
  ara: () => import('./data/ara.js'),
  smoothie: () => import('./data/smoothie.js'),
  tatli: () => import('./data/tatli.js'),
};

let all = null, byId = null, loading = null;

/** Tüm tarifleri yükler (ilk çağrıda dinamik import, sonra önbellek) */
export function loadAll() {
  if (all) return Promise.resolve(all);
  loading ||= Promise.all(CATS.map(c => FILES[c.id]().then(m => m.default))).then(parts => {
    all = parts.flat();
    byId = new Map(all.map(r => [r.id, r]));
    all.forEach(r => { r._hay = norm([r.name, CAT[r.cat]?.label, ...r.tags, ...r.ingredients.map(i => i.name)].join(' ')); });
    return all;
  });
  return loading;
}
export const getRecipe = id => byId?.get(id) || null;
export const allRecipes = () => all || [];
export const totalMin = r => r.prepMin + r.cookMin;

/** Türkçe karakter duyarsız küçük harf: "İçli Köfte" -> "icli kofte" */
export function norm(s) {
  return String(s || '')
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/[ıi̇]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Her kelime ad, kategori, etiket ya da malzemede geçmeli */
export function matches(r, query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  return words.every(w => r._hay.includes(w));
}
