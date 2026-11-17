// Vücut ölçüleri — veri erişimi ve hesaplar (US Navy yağ oranı, bel/boy oranı, değişimler).
import { load, save, update } from '../../core/store.js';
import { getProfile } from '../../core/profile.js';
import { uid, fmt } from '../../core/ui.js';

export const KEY = 'body.measures';

/** goodDir: azalma iyi (-1), artış iyi (+1), nötr (0) */
export const MEASURES = [
  { id: 'waist', label: 'Bel', hint: 'Göbek hizasından, nefesini verdikten sonra, karnını içine çekmeden.', min: 40, max: 200, goodDir: -1 },
  { id: 'neck', label: 'Boyun', hint: 'Gırtlağın hemen altından, metre hafif eğik (öne doğru aşağı).', min: 20, max: 70, goodDir: -1 },
  { id: 'hips', label: 'Kalça', hint: 'Kalçanın en geniş yerinden, ayaklar bitişik.', min: 50, max: 200, goodDir: -1 },
  { id: 'chest', label: 'Göğüs', hint: 'Meme ucu hizasından, kollar yanda, normal nefeste.', min: 50, max: 200, goodDir: 1 },
  { id: 'shoulders', label: 'Omuz', hint: 'İki omzun en dış noktasından, sırttan dolaşarak.', min: 60, max: 200, goodDir: 1 },
  { id: 'arm', label: 'Kol', hint: 'Pazının en kalın yerinden, kol gevşek ve yanda.', min: 15, max: 70, goodDir: 1 },
  { id: 'thigh', label: 'Bacak', hint: 'Uyluğun en kalın yerinden, kasık çizgisinin biraz altı.', min: 30, max: 100, goodDir: 0 },
  { id: 'calf', label: 'Baldır', hint: 'Baldırın en kalın yerinden, ayakta dururken.', min: 20, max: 70, goodDir: 0 },
];
export const MEASURE_BY_ID = Object.fromEntries(MEASURES.map(m => [m.id, m]));

export const getEntries = () => load(KEY, []).slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));

export function saveEntry(entry) {
  const e = { ...entry, id: entry.id || uid() };
  update(KEY, list => [...list.filter(x => x.id !== e.id), e], []);
  return e;
}
export function deleteEntry(id) {
  update(KEY, list => list.filter(x => x.id !== id), []);
}
export const replaceAll = list => save(KEY, list);

const num = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** Bir ölçünün tarih sıralı değerleri: [{date, v}] */
export function series(entries, id) {
  if (id === 'fat') return entries.map(e => ({ date: e.date, v: bodyFatFor(e, entries)?.pct ?? null })).filter(x => x.v != null);
  return entries.filter(e => num(e[id]) != null).map(e => ({ date: e.date, v: e[id] }));
}

/** Son kilo: girilen tarihe kadar olan kayıtlardan; yoksa kilo takibi / profil */
export function weightOn(dateKeyStr = null, entry = null) {
  if (entry && num(entry.weightKg)) return { kg: entry.weightKg, src: 'ölçüm kaydı' };
  const w = load('weight', []).filter(x => num(x.kg) && (!dateKeyStr || x.date <= dateKeyStr)).sort((a, b) => a.date.localeCompare(b.date));
  if (w.length) return { kg: w.at(-1).kg, src: 'kilo takibi' };
  const all = load('weight', []).filter(x => num(x.kg)).sort((a, b) => a.date.localeCompare(b.date));
  if (all.length) return { kg: all[0].kg, src: 'kilo takibi' };
  return { kg: getProfile().weightKg, src: 'profil' };
}

/** En son bilinen değer (kayıt bazında eksik alanlar önceki kayıtlardan tamamlanır) */
export function latestValues(entries, upToDate = null) {
  const out = {};
  for (const e of entries) {
    if (upToDate && e.date > upToDate) break;
    for (const m of MEASURES) if (num(e[m.id]) != null) out[m.id] = { v: e[m.id], date: e.date };
  }
  return out;
}

/**
 * US Navy formülü (cm):
 *  Erkek: %YO = 495 / (1.0324 − 0.19077·log10(bel − boyun) + 0.15456·log10(boy)) − 450
 *  Kadın: %YO = 495 / (1.29579 − 0.35004·log10(bel + kalça − boyun) + 0.22100·log10(boy)) − 450
 */
export function navyBodyFat({ sex, heightCm, waist, neck, hips }) {
  if (!num(heightCm) || !num(waist) || !num(neck)) return null;
  let d;
  if (sex === 'female') {
    if (!num(hips)) return null;
    const x = waist + hips - neck;
    if (x <= 0) return null;
    d = 1.29579 - 0.35004 * Math.log10(x) + 0.221 * Math.log10(heightCm);
  } else {
    const x = waist - neck;
    if (x <= 0) return null;
    d = 1.0324 - 0.19077 * Math.log10(x) + 0.15456 * Math.log10(heightCm);
  }
  const pct = 495 / d - 450;
  return Number.isFinite(pct) ? Math.max(2, Math.min(60, pct)) : null;
}

/** Kategori sınırları (ACE tablosuna göre sadeleştirilmiş) */
export const FAT_BANDS = {
  male: [{ to: 14, label: 'Atletik', color: 'var(--blue)' }, { to: 18, label: 'Fit', color: 'var(--lime)' }, { to: 25, label: 'Normal', color: 'var(--amber)' }, { to: 99, label: 'Yüksek', color: 'var(--red)' }],
  female: [{ to: 21, label: 'Atletik', color: 'var(--blue)' }, { to: 25, label: 'Fit', color: 'var(--lime)' }, { to: 32, label: 'Normal', color: 'var(--amber)' }, { to: 99, label: 'Yüksek', color: 'var(--red)' }],
};
export const fatCategory = (pct, sex) => (FAT_BANDS[sex === 'female' ? 'female' : 'male']).find(b => pct < b.to);
export const essentialMin = sex => (sex === 'female' ? 13 : 5);

/** Bir kayıt için yağ oranı (eksik bel/boyun/kalça o tarihe kadarki son değerlerden alınır) */
export function bodyFatFor(entry, entries) {
  const p = getProfile();
  const lv = latestValues(entries, entry.date);
  const pick = id => (num(entry[id]) ?? lv[id]?.v ?? null);
  if (num(entry.waist) == null) return null; // her yağ noktası gerçek bir bel ölçümüne dayansın
  const pct = navyBodyFat({ sex: p.sex, heightCm: p.heightCm, waist: pick('waist'), neck: pick('neck'), hips: pick('hips') });
  if (pct == null) return null;
  const w = weightOn(entry.date, entry);
  const fatKg = w.kg * pct / 100;
  return { pct, cat: fatCategory(pct, p.sex), weightKg: w.kg, weightSrc: w.src, fatKg, leanKg: w.kg - fatKg };
}

export function whtr(waist, heightCm = getProfile().heightCm) {
  if (!num(waist) || !num(heightCm)) return null;
  const r = waist / heightCm;
  let label, color, advice;
  if (r < 0.4) { label = 'Düşük'; color = 'var(--blue)'; advice = 'Bel ölçün boyuna göre oldukça ince. Yeterli beslendiğinden emin ol.'; }
  else if (r < 0.5) { label = 'Sağlıklı'; color = 'var(--lime)'; advice = 'Harika! 0,5\'in altı sağlıklı kabul edilir. Bu aralığı korumaya çalış.'; }
  else if (r < 0.6) { label = 'Dikkat'; color = 'var(--amber)'; advice = '0,5\'in altı sağlıklı kabul edilir. Belini birkaç santim inceltmek riski azaltır.'; }
  else { label = 'Yüksek risk'; color = 'var(--red)'; advice = '0,6 üstü kalp-damar riskini artırır. Beslenme ve hareketle beli inceltmek öncelik olmalı.'; }
  const targetCm = heightCm * 0.5;
  return { r, label, color, advice, targetCm };
}

/** Değişim: ilk kayda ve bir önceki kayda göre */
export function changes(s) {
  if (!s.length) return null;
  const last = s.at(-1), first = s[0], prev = s.length > 1 ? s.at(-2) : null;
  const d = (a, b) => ({ cm: a.v - b.v, pct: b.v ? (a.v - b.v) / b.v * 100 : 0 });
  return { first, last, prev, sinceFirst: s.length > 1 ? d(last, first) : null, sinceLast: prev ? d(last, prev) : null };
}

/** '−3,5' / '+1,2' / '0' */
export function signed(v, dec = 1) {
  const r = +v.toFixed(dec);
  if (r === 0) return fmt.n(0, dec);
  return (r > 0 ? '+' : '−') + fmt.n(Math.abs(r), dec);
}
/** Değişimin rengi: hedef yönüne göre */
export function deltaClass(id, cm) {
  const g = id === 'fat' ? -1 : (MEASURE_BY_ID[id]?.goodDir ?? 0);
  if (Math.abs(cm) < 0.05 || !g) return 'muted';
  return Math.sign(cm) === g ? 'c-lime' : 'c-amber';
}

/** '12,5' -> 12.5 ; boş -> null ; geçersiz -> NaN */
export function parseNum(str) {
  const s = String(str ?? '').trim().replace(',', '.');
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}
