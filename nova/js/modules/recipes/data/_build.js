// Tarif verisi için kısa yazım biçimini tam nesneye çeviren yardımcı (DOM'suz; Node'da da çalışır).
//
// Satır biçimi:
// [id, ad, emoji, etiketKodları, porsiyon, hazırlıkDk, pişirmeDk, zorluk,
//  ['miktar birim malzeme|not', ...], ['adım', ...], ['ipucu', ...] | null,
//  [kcal, protein, karbonhidrat, yağ, lif], porsiyonGramı, yanınaYakışır?, uyduğuKategoriler?]
// Son iki alan yalnız soslar içindir: 'Izgara tavukla…', 'tavuk et salata'.

export const UNITS = ['su bardağı', 'çay bardağı', 'tutam', 'adet', 'yk', 'tk', 'ml', 'g'];

export const TAG_CODES = {
  yp: 'yüksek protein',
  dk: 'düşük karbonhidrat',
  vj: 'vejetaryen',
  vg: 'vegan',
  gs: 'glutensiz',
  hz: 'hızlı',
  mp: 'meal prep',
  sz: 'şekersiz',
  od: 'öğrenci dostu',
  so: 'sos',
};
export const TAG_ORDER = Object.values(TAG_CODES);

function parseQty(s) {
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return a / b;
  }
  return Number(s.replace(',', '.'));
}

/** '1/2 su bardağı yulaf ezmesi|ince' -> { name, qty, unit, note } */
export function parseIngredient(str) {
  const [main, note] = str.split('|');
  const m = main.trim().match(/^(\d+(?:[.,]\d+)?(?:\/\d+)?)\s+(.*)$/);
  if (!m) throw new Error('Malzeme miktarı okunamadı: ' + str);
  const qty = parseQty(m[1]);
  let rest = m[2];
  const unit = UNITS.find(u => rest === u || rest.startsWith(u + ' '));
  if (!unit) throw new Error('Birim bulunamadı: ' + str);
  rest = rest.slice(unit.length).trim();
  const ing = { name: rest, qty, unit };
  if (note && note.trim()) ing.note = note.trim();
  return ing;
}

/** Tag kodlarını ve beslenme değerlerinden türeyen etiketleri birleştirir */
function buildTags(codes, ps, totalMin, cat) {
  const set = new Set();
  if (cat === 'sos') set.add('sos');
  for (const c of String(codes || '').split(/\s+/).filter(Boolean)) {
    if (!TAG_CODES[c]) throw new Error('Bilinmeyen etiket kodu: ' + c);
    set.add(TAG_CODES[c]);
  }
  if (set.has('vegan')) set.add('vejetaryen');
  const pShare = ps.kcal ? (ps.p * 4) / ps.kcal : 0;
  const cShare = ps.kcal ? (ps.c * 4) / ps.kcal : 0;
  if (ps.p >= 25 || (ps.p >= 15 && pShare >= 0.3)) set.add('yüksek protein');
  if (ps.c <= 20 && cShare <= 0.25) set.add('düşük karbonhidrat');
  if (totalMin <= 20) set.add('hızlı');
  return TAG_ORDER.filter(t => set.has(t));
}

export function build(cat, rows) {
  return rows.map(r => {
    const [id, name, emoji, codes, servings, prepMin, cookMin, difficulty, ings, steps, tips, nut, gramsPerServing, pairs, goes] = r;
    const [kcal, p, c, f, fib] = nut;
    const perServing = { kcal, p, c, f, fib };
    const out = {
      id, name, cat, emoji,
      tags: buildTags(codes, perServing, prepMin + cookMin, cat),
      servings, prepMin, cookMin, difficulty,
      ingredients: ings.map(parseIngredient),
      steps,
      perServing,
      gramsPerServing,
    };
    if (tips && tips.length) out.tips = tips;
    if (pairs) out.pairs = pairs;
    if (goes) out.goes = goes.split(/\s+/).filter(Boolean);
    return out;
  });
}
