// Menü öneri motoru (günlük ve haftalık plan ortak): tarif havuzları, besin toplamı, puanlama,
// porsiyon eniyileme, ana protein tespiti ve 7 günlük plan üretimi. DOM kullanmaz.
import { allRecipes, getRecipe, totalMin } from './data.js';
import { scaledNutrition } from './util.js';

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const SLOT_CATS = {
  breakfast: ['kahvalti'],
  lunch: ['salata', 'mealprep', 'tavuk', 'baklagil', 'balik', 'et'],
  dinner: ['tavuk', 'et', 'balik', 'baklagil', 'sebze', 'mealprep'],
  snack: ['ara', 'smoothie', 'tatli'],
};
export const SLOT_PORTIONS = { breakfast: [1, 1.5, 2], lunch: [1, 1.5, 2], dinner: [1, 1.5, 2], snack: [1, 1.5, 2] };

const low = s => String(s).toLocaleLowerCase('tr');
// Pahalı sayılan malzemeler: bunları içermeyen tarifler "bütçe dostu"
const PRICEY = /(somon|levrek|çupra|karides|kalamar|bonfile|biftek|kuzu|dana|ceviz|badem|fındık|kaju|antep|avokado|kinoa|chia|protein tozu|parmesan|hindistan cevizi|yaban mersini|orman meyve|mango)/;
export const isBudget = r => !r.ingredients.some(i => PRICEY.test(low(i.name)));

export const OPTS = [
  { id: 'veg', label: 'Vejetaryen', test: r => r.tags.includes('vejetaryen') },
  { id: 'vegan', label: 'Vegan', test: r => r.tags.includes('vegan') },
  { id: 'gf', label: 'Glutensiz', test: r => r.tags.includes('glutensiz') },
  { id: 'quick', label: '30 dk altı', test: r => totalMin(r) <= 30 },
  { id: 'student', label: 'Öğrenci dostu', test: r => r.tags.includes('öğrenci dostu') || totalMin(r) <= 20 },
  { id: 'budget', label: 'Bütçe dostu', test: isBudget },
];

export function pools(opts) {
  const tests = OPTS.filter(o => opts.includes(o.id)).map(o => o.test);
  const ok = r => tests.every(t => t(r));
  const out = {};
  for (const s of SLOTS) {
    out[s] = allRecipes().filter(r => SLOT_CATS[s].includes(r.cat) && ok(r));
    // Kahvaltıda seçenek azsa smoothie'lerle tamamla
    if (s === 'breakfast' && out[s].length < 4) out[s].push(...allRecipes().filter(r => r.cat === 'smoothie' && ok(r)));
  }
  return out;
}

export function totals(items) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const it of items) {
    const r = getRecipe(it.id);
    if (!r) continue;
    const n = scaledNutrition(r, it.portions);
    t.kcal += n.kcal; t.p += n.p; t.c += n.c; t.f += n.f;
  }
  return t;
}

export function score(t, target) {
  const kErr = Math.abs(t.kcal - target.kcal) / target.kcal;
  const pShort = Math.max(0, target.protein - t.p) / target.protein;
  const pOver = Math.max(0, t.p - target.protein * 1.3) / target.protein;
  const fOver = Math.max(0, t.f - target.fat * 1.3) / target.fat;
  return kErr * 3 + pShort * 2.2 + pOver * 0.6 + fOver * 0.6;
}

/** Günün hedefe uyumu: kalori ±%10 içinde ve protein hedefin en az %90'ı */
export function dayFit(t, target) {
  const kcalOk = Math.abs(t.kcal - target.kcal) <= target.kcal * 0.1;
  const protOk = t.p >= target.protein * 0.9;
  return { kcalOk, protOk, ok: kcalOk && protOk };
}

/**
 * recipes: SLOTS sırasıyla tarifler. fixed[k] doluysa o öğünün porsiyonu sabit kalır.
 * En düşük puanlı porsiyon kombinasyonunu döner: { sc, items:[{slot,id,portions}] }
 */
export function bestPortions(recipes, target, fixed = []) {
  let best = null;
  const n = SLOTS.length;
  const acc = new Array(n);
  const rec = (i, kcal, p, c, f) => {
    if (i === n) {
      const sc = score({ kcal, p, c, f }, target);
      if (!best || sc < best.sc) best = { sc, portions: [...acc] };
      return;
    }
    const s = recipes[i].perServing;
    for (const q of fixed[i] != null ? [fixed[i]] : SLOT_PORTIONS[SLOTS[i]]) {
      acc[i] = q;
      rec(i + 1, kcal + s.kcal * q, p + s.p * q, c + s.c * q, f + s.f * q);
    }
  };
  rec(0, 0, 0, 0, 0);
  return { sc: best.sc, items: SLOTS.map((s, k) => ({ slot: s, id: recipes[k].id, portions: best.portions[k] })) };
}

// ---------- Ana protein ----------
const PROTEINS = [
  ['balik', 'Balık', /(somon|levrek|çupra|hamsi|uskumru|mezgit|ton balığı|karides|kalamar|balık|alabalık)/],
  ['tavuk', 'Tavuk', /tavuk/],
  ['hindi', 'Hindi', /hindi(?!stan)/],
  ['kirmizi', 'Kırmızı et', /(dana|kıyma|kuşbaşı|bonfile|biftek|kuzu|sucuk)/],
  ['baklagil', 'Baklagil', /(mercimek|nohut|fasulye|barbunya|bakla|börülce|edamame|tofu)/],
  ['yumurta', 'Yumurta', /yumurta/],
  ['sut', 'Süt ürünü', /(lor|süzme|peynir|yoğurt|kefir|labne|protein tozu)/],
];
export const PROTEIN_LABEL = Object.fromEntries([...PROTEINS.map(p => [p[0], p[1]]), ['diger', 'Sebze ağırlıklı']]);

/** Tarifin ana protein kaynağı ('tavuk', 'balik', … ya da 'diger') */
export function mainProtein(r) {
  if (!r) return 'diger';
  if (r._prot) return r._prot;
  const names = r.ingredients.map(i => low(i.name)).join(' · ');
  r._prot = (PROTEINS.find(p => p[2].test(names)) || ['diger'])[0];
  return r._prot;
}

export const isPrepable = r => r.cat === 'mealprep' || r.tags.includes('meal prep');

// ---------- Haftalık plan ----------
/** Toplu hazırlık modunda aynı öğle yemeğini paylaşan gün grupları (Pzt–Çar, Per–Cum, Cmt–Paz) */
export const PREP_BLOCKS = [[0, 1, 2], [3, 4], [5, 6]];

const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];

/** Plandaki tarif kullanım sayısı; toplu hazırlık grubu tek pişirme sayılır */
export function useCounts(days, skip = () => false) {
  const counts = new Map();
  const groups = new Set();
  days.forEach((d, di) => d.items.forEach(it => {
    if (!it || skip(it, di)) return;
    if (it.prep) { if (groups.has(it.prep)) return; groups.add(it.prep); }
    counts.set(it.id, (counts.get(it.id) || 0) + 1);
  }));
  return counts;
}

/** Çeşitlilik cezası: dün akşamki ana protein, aynı gün öğle-akşam, dünkü öğle */
function varietyPenalty(rs, prevDay, lunchIsPrep) {
  let pen = 0;
  const pl = mainProtein(rs[1]), pd = mainProtein(rs[2]);
  if (prevDay) {
    const prevD = mainProtein(getRecipe(prevDay.items[2]?.id));
    const prevL = mainProtein(getRecipe(prevDay.items[1]?.id));
    if (pd !== 'diger' && pd === prevD) pen += 0.6;
    if (!lunchIsPrep && pl !== 'diger' && pl === prevL) pen += 0.15;
  }
  if (pl !== 'diger' && pl === pd) pen += 0.15;
  return pen;
}

/**
 * 7 günlük plan üretir.
 * prev: önceki günler ([{items}]) — kilitli öğünler (locked) aynen korunur, diğerleri mümkünse tekrarlanmaz.
 * Döner: { days: [{ items:[{slot,id,portions,locked?,prep?}] }] } ya da uygun tarif yoksa null.
 */
export function generateWeek({ opts = [], prep = false, target, prev = null, rnd = Math.random, iters = 220 }) {
  const P = pools(opts);
  if (SLOTS.some(s => !P[s].length)) return null;
  const days = Array.from({ length: 7 }, () => ({ items: SLOTS.map(() => null) }));
  const avoid = new Set();

  // 1) Kilitli öğünler
  (prev || []).forEach((d, di) => (d?.items || []).forEach(it => {
    if (!it || !getRecipe(it.id)) return;
    const k = SLOTS.indexOf(it.slot);
    if (k < 0 || di > 6) return;
    if (it.locked) days[di].items[k] = { ...it };
    else avoid.add(it.id);
  }));
  const counts = useCounts(days);
  const uses = id => counts.get(id) || 0;
  const inc = id => counts.set(id, uses(id) + 1);

  // 2) Toplu hazırlık: blok başına bir öğle yemeği, bir kez pişir
  if (prep) {
    const used = new Set();
    PREP_BLOCKS.forEach((block, bi) => {
      const free = block.filter(di => !days[di].items[1]);
      if (free.length < 2) return;
      let cands = P.lunch.filter(r => isPrepable(r) && !uses(r.id) && !used.has(r.id));
      if (!cands.length) cands = P.lunch.filter(r => !uses(r.id) && !used.has(r.id));
      if (!cands.length) return;
      const fresh = cands.filter(r => !avoid.has(r.id));
      // Proteini yoğun olanlardan seç (doyurucu ve hedefe yaklaştırır)
      const sorted = (fresh.length ? fresh : cands).slice().sort((a, b) => b.perServing.p / b.perServing.kcal - a.perServing.p / a.perServing.kcal);
      const r = pick(sorted.slice(0, Math.max(3, Math.ceil(sorted.length / 2))), rnd);
      used.add(r.id);
      inc(r.id);
      const gid = 'g' + bi + '-' + Math.floor(rnd() * 1e6).toString(36);
      free.forEach(di => { days[di].items[1] = { slot: 'lunch', id: r.id, portions: null, prep: gid, _free: true }; });
    });
  }

  // 3) Günleri sırayla doldur
  for (let di = 0; di < 7; di++) {
    const day = days[di];
    const fixedR = day.items.map(it => (it ? getRecipe(it.id) : null));
    const fixedP = day.items.map(it => (it && it.locked ? it.portions : null));
    const lunchIsPrep = !!day.items[1]?.prep;
    const prevDay = di > 0 ? days[di - 1] : null;
    const candFor = (s, taken) => {
      const ok = P[s].filter(r => uses(r.id) < 2 && !taken.has(r.id));
      const fresh = ok.filter(r => !uses(r.id) && !avoid.has(r.id));
      if (fresh.length && rnd() < 0.85) return pick(fresh, rnd);
      if (ok.length) return pick(ok, rnd);
      const any = P[s].filter(r => !taken.has(r.id));
      return pick(any.length ? any : P[s], rnd);
    };
    let best = null;
    for (let i = 0; i < iters; i++) {
      const taken = new Set(fixedR.filter(Boolean).map(r => r.id));
      const rs = SLOTS.map((s, k) => {
        if (fixedR[k]) return fixedR[k];
        const r = candFor(s, taken);
        taken.add(r.id);
        return r;
      });
      if (rs[1].id === rs[2].id) continue;
      let pen = varietyPenalty(rs, prevDay, lunchIsPrep);
      rs.forEach((r, k) => { if (!fixedR[k] && uses(r.id) === 1) pen += 0.08; });
      const b = bestPortions(rs, target, fixedP);
      const sc = b.sc + pen + rnd() * 0.03;
      if (!best || sc < best.sc) best = { sc, items: b.items };
      if (fixedR.every(Boolean)) break; // her öğün sabit: tek deneme yeter
    }
    if (!best) {
      // Seçenekler çok dar (ör. öğle ve akşam havuzu tek tarif): kuralı gevşet
      const rs = SLOTS.map((s, k) => fixedR[k] || P[s][0]);
      best = bestPortions(rs, target, fixedP);
    }
    day.items = best.items.map((it, k) => {
      const old = day.items[k];
      if (old) {
        const out = { ...old, portions: old.locked ? old.portions : it.portions };
        delete out._free;
        return out;
      }
      inc(it.id);
      return { slot: it.slot, id: it.id, portions: it.portions };
    });
  }
  return { days };
}

/** Bir öğüne aday tarifleri günün hedefe uyumuna göre sıralar */
export function rankForSlot(dayItems, slot, cands, target) {
  const k = SLOTS.indexOf(slot);
  const fixedP = dayItems.map((it, i) => (i === k ? null : it.portions));
  const base = dayItems.map(it => getRecipe(it.id));
  return cands.map(r => {
    const rs = base.map((x, i) => (i === k ? r : x));
    const b = bestPortions(rs, target, fixedP);
    const portions = b.items[k].portions;
    const t = totals(b.items);
    return { r, portions, sc: b.sc, t };
  }).sort((a, b) => a.sc - b.sc);
}

/** Planın çeşitlilik kurallarını denetler; kullanıcıya gösterilecek notlar döner */
export function weekIssues(days, dayName = i => String(i + 1)) {
  const out = [];
  const counts = useCounts(days);
  for (const [id, n] of counts) if (n > 2) out.push({ type: 'repeat', id, n, text: `${getRecipe(id)?.name || id} bu hafta ${n} kez var.` });
  for (let i = 1; i < days.length; i++) {
    const a = mainProtein(getRecipe(days[i - 1].items[2]?.id)), b = mainProtein(getRecipe(days[i].items[2]?.id));
    if (a !== 'diger' && a === b) out.push({ type: 'protein', day: i, text: `${dayName(i - 1)} ve ${dayName(i)} akşamlarında ana protein aynı (${PROTEIN_LABEL[a].toLocaleLowerCase('tr')}).` });
  }
  return out;
}
