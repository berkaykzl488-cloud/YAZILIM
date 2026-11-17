// Alışkanlıklar (bırakma) modülü — veri modeli, şablonlar, iyileşme kilometre taşları, hesaplamalar ve başarımlar.
import { load, save, todayKey } from '../../core/store.js';
import { fmt, uid, toast } from '../../core/ui.js';
import { awardXP } from '../../core/xp.js';

export const SEC = 1e3, MIN = 6e4, HOUR = 36e5, DAY = 864e5, WEEK = 7 * DAY, MONTH = 30 * DAY, YEAR = 365 * DAY;
const KEY = 'habits';

// ---------------------------------------------------------------- Şablonlar
// track: iyileşme zaman çizelgesi; organ: rejenerasyon görseli
export const TEMPLATES = [
  { type: 'smoking', name: 'Sigara', icon: 'smoke', unitName: 'sigara', unitsPerDay: 15, costMode: 'pack', packPrice: 100, perPack: 20,
    timePerUnit: 11, timeKind: 'life', track: 'smoking', organ: 'lungs', step: 1, hint: 'İçilmeyen her sigara ≈ 11 dk ömür' },
  { type: 'alcohol', name: 'Alkol', icon: 'wine', unitName: 'kadeh', unitsPerDay: 2, costPerUnit: 150, track: 'alcohol', organ: 'liver', step: 1 },
  { type: 'sugar', name: 'Şeker / tatlı', icon: 'candy', unitName: 'porsiyon', unitsPerDay: 2, costPerUnit: 60, track: 'sugar', organ: 'heart', step: 1 },
  { type: 'fastfood', name: 'Fast food', icon: 'food', unitName: 'öğün', unitsPerDay: 1, costPerUnit: 250, track: 'food', organ: 'heart', step: 1 },
  { type: 'screen', name: 'Sosyal medya / ekran', icon: 'phone', unitName: 'dk', unitsPerDay: 180, costPerUnit: 0, timePerUnit: 1, timeKind: 'time',
    fixedTime: true, track: 'screen', organ: 'brain', step: 15, hint: 'Günlük fazladan ekran süren (dakika)' },
  { type: 'caffeine', name: 'Kafein / enerji içeceği', icon: 'bolt', unitName: 'kutu', unitsPerDay: 2, costPerUnit: 60, track: 'caffeine', organ: 'heart', step: 1 },
  { type: 'gambling', name: 'Kumar / bahis', icon: 'coin', unitName: 'kupon', unitsPerDay: 1, costPerUnit: 200, timePerUnit: 30, timeKind: 'time', track: 'dopamine', organ: 'brain', step: 1 },
  { type: 'nightsnack', name: 'Gece atıştırması', icon: 'moon', unitName: 'atıştırma', unitsPerDay: 1, costPerUnit: 50, track: 'food', organ: 'heart', step: 1 },
  { type: 'porn', name: 'Porno', icon: 'lock', unitName: 'kez', unitsPerDay: 1, costPerUnit: 0, timePerUnit: 20, timeKind: 'time', track: 'dopamine', organ: 'brain', step: 1 },
  { type: 'nails', name: 'Tırnak yeme', icon: 'target', unitName: 'kez', unitsPerDay: 10, costPerUnit: 0, track: 'dopamine', organ: 'brain', step: 1 },
  { type: 'custom', name: 'Özel', icon: 'sparkle', unitName: 'kez', unitsPerDay: 1, costPerUnit: 0, timePerUnit: 0, timeKind: 'time', track: 'dopamine', organ: 'brain', step: 1, custom: true },
];
export const tpl = type => TEMPLATES.find(t => t.type === type) || TEMPLATES[TEMPLATES.length - 1];

export const CUSTOM_ICONS = ['sparkle', 'star', 'flame', 'heart', 'bolt', 'coin', 'phone', 'food', 'wine', 'smoke', 'candy', 'moon', 'target', 'globe', 'layers', 'repeat', 'lock', 'zap'];

export const REASON_SUGGEST = {
  smoking: ['Rahat nefes almak', 'Ailem için', 'Kokudan kurtulmak', 'Para biriktirmek', 'Daha iyi koşmak', 'Uzun yaşamak'],
  alcohol: ['Net bir zihin', 'Daha iyi uyku', 'Karaciğerim için', 'Para biriktirmek', 'İlişkilerim için', 'Sabahları zinde uyanmak'],
  sugar: ['Dengeli enerji', 'Kilo vermek', 'Diş sağlığı', 'Daha iyi cilt', 'Diyabet riskini azaltmak'],
  food: ['Daha hafif hissetmek', 'Kilo vermek', 'Para biriktirmek', 'Daha iyi uyku', 'Kalbim için'],
  caffeine: ['Derin uyku', 'Daha az kaygı', 'Doğal enerji', 'Bağımlı olmamak', 'Para biriktirmek'],
  screen: ['Odaklanmak', 'Ailemle zaman', 'Daha iyi uyku', 'Kıyaslamayı bırakmak', 'Kitap okumak', 'Spor için zaman'],
  dopamine: ['Kontrolü geri almak', 'Kendime saygı', 'Daha fazla enerji', 'İlişkilerim için', 'Para ve zaman', 'Odaklanmak'],
};

export const TRIGGERS = [
  { id: 'stres', label: 'Stres' }, { id: 'sikinti', label: 'Can sıkıntısı' }, { id: 'sosyal', label: 'Sosyal ortam' },
  { id: 'kahve', label: 'Kahve sonrası' }, { id: 'yemek', label: 'Yemek sonrası' }, { id: 'alkol', label: 'Alkol' },
  { id: 'yorgunluk', label: 'Yorgunluk' }, { id: 'kaygi', label: 'Kaygı' }, { id: 'yalnizlik', label: 'Yalnızlık' },
  { id: 'ofke', label: 'Öfke' }, { id: 'uyanis', label: 'Uyanınca' }, { id: 'ekran', label: 'Telefon / ekran' },
  { id: 'kutlama', label: 'Kutlama' }, { id: 'rutin', label: 'Rutin / alışkanlık' }, { id: 'diger', label: 'Diğer' },
];
export const triggerLabel = id => TRIGGERS.find(t => t.id === id)?.label || id || '—';

export const DISTRACTIONS = [
  '10 şınav çek', 'Bir bardak soğuk su iç', '2 dakika tempolu yürü', '20 squat yap', 'Yüzünü soğuk suyla yıka',
  'Bir arkadaşına mesaj at', '5 derin nefes al, omuzlarını bırak', 'Bir sakız çiğne ya da nane ye', 'En sevdiğin şarkıyı aç',
  'Etrafında gördüğün 5 şeyi say', 'Dişlerini fırçala', '30 saniye plank yap', 'Pencereyi aç, temiz hava al',
  'Bugün için minnettar olduğun 3 şeyi yaz', 'Bir meyve ye', 'Masanı ya da odanı 2 dk topla', 'Ellerini meşgul et: bir şey çiz',
  '1 dakika boyunca germe hareketi yap', 'Merdivenlerden bir kat in-çık', 'Kendine sesli olarak "geçecek" de',
];

// ---------------------------------------------------------------- İyileşme zaman çizelgeleri
// [süre(ms), başlık, açıklama] — genel bilgi, tıbbi tavsiye değildir.
const T = (t, title, desc) => ({ t, title, desc });
export const TRACKS = {
  smoking: [
    T(20 * MIN, 'Nabız ve tansiyon', 'Nabız ve kan basıncı normale doğru düşmeye başlar.'),
    T(8 * HOUR, 'Karbonmonoksit', 'Kandaki karbonmonoksit seviyesi normale iner, oksijen düzeyi yükselir.'),
    T(24 * HOUR, 'Kalp krizi riski', 'Kalp krizi riski azalmaya başlar.'),
    T(48 * HOUR, 'Tat ve koku', 'Sinir uçları toparlanır; tat ve koku duyusu keskinleşir.'),
    T(72 * HOUR, 'Rahat nefes', 'Bronşlar gevşer, nefes almak kolaylaşır; enerji artar.'),
    T(2 * WEEK, 'Dolaşım', 'Kan dolaşımı iyileşir, yürüme ve egzersiz kolaylaşır.'),
    T(12 * WEEK, 'Akciğer fonksiyonu', '2–12 hafta içinde akciğer fonksiyonu belirgin şekilde artar.'),
    T(9 * MONTH, 'Öksürük ve nefes darlığı', '1–9 ay içinde öksürük ve nefes darlığı azalır; akciğer temizlenir.'),
    T(YEAR, 'Koroner risk yarıya', 'Koroner kalp hastalığı riski sigara içen birinin yaklaşık yarısına iner.'),
    T(5 * YEAR, 'İnme riski', 'İnme riski sigara içmeyen birinin düzeyine yaklaşır.'),
    T(10 * YEAR, 'Akciğer kanseri', 'Akciğer kanserinden ölüm riski yaklaşık yarıya iner.'),
    T(15 * YEAR, 'Tam koroner iyileşme', 'Koroner kalp hastalığı riski hiç içmemiş birinin düzeyine iner.'),
  ],
  alcohol: [
    T(12 * HOUR, 'Kan şekeri', 'Vücut alkolü büyük ölçüde atar, kan şekeri dengelenmeye başlar.'),
    T(72 * HOUR, 'Yoksunluğun zirvesi', 'Fiziksel yoksunluk belirtileri genelde 1–3 günde zirve yapar ve azalır.'),
    T(WEEK, 'Uyku kalitesi', 'REM uykusu toparlanır; daha dinlenmiş uyanırsın.'),
    T(2 * WEEK, 'Mide ve cilt', 'Mide tahrişi ve reflü azalır; cilt daha nemli görünür.'),
    T(MONTH, 'Karaciğer', 'Karaciğer yağlanması gerilemeye başlayabilir; tansiyon düşebilir.'),
    T(3 * MONTH, 'Kan değerleri', 'Kan değerleri, enerji ve ruh hali belirgin şekilde iyileşir.'),
    T(6 * MONTH, 'Bağışıklık', 'Bağışıklık sistemi güçlenir, enfeksiyonlara direnç artar.'),
    T(YEAR, 'Uzun vadeli risk', 'Karaciğer hastalığı ve bazı kanser riskleri azalmaya devam eder.'),
  ],
  sugar: [
    T(24 * HOUR, 'Kan şekeri dalgası', 'Ani kan şekeri yükselip düşmeleri azalmaya başlar.'),
    T(3 * DAY, 'En zor kısım', 'İstekler bu günlerde zirve yapabilir — normaldir, geçecek.'),
    T(WEEK, 'Tat hassasiyeti', 'Damak tadı hassaslaşır; meyveler daha tatlı gelir.'),
    T(2 * WEEK, 'Dengeli enerji', 'Öğleden sonra çöküşleri azalır, enerji daha dengeli olur.'),
    T(MONTH, 'Cilt ve dişler', 'Cilt ve diş sağlığında iyileşme; tatlı isteği belirgin azalır.'),
    T(3 * MONTH, 'İnsülin duyarlılığı', 'İnsülin duyarlılığı ve kilo kontrolünde ilerleme görülebilir.'),
    T(YEAR, 'Metabolik risk', 'Tip 2 diyabet ve kalp-damar hastalığı riski azalır.'),
  ],
  food: [
    T(24 * HOUR, 'Sodyum düşer', 'Tuz alımı azalır, şişkinlik hafiflemeye başlar.'),
    T(3 * DAY, 'Su tutulumu', 'Vücuttaki fazla su atılır, daha hafif hissedersin.'),
    T(WEEK, 'Sindirim', 'Sindirim düzenlenir, uyku ve enerji dengelenir.'),
    T(2 * WEEK, 'Damak sadeleşir', 'İşlenmiş gıda isteği azalır, sade tatlar keyif verir.'),
    T(MONTH, 'Tansiyon ve kilo', 'Tansiyon ve kilo yönetiminde ilerleme görülebilir.'),
    T(3 * MONTH, 'Kan değerleri', 'Kolesterol ve kan yağlarında iyileşme görülebilir.'),
    T(YEAR, 'Kalp sağlığı', 'Kalp-damar hastalığı riski azalır.'),
  ],
  caffeine: [
    T(12 * HOUR, 'Yoksunluk başlar', 'Baş ağrısı, yorgunluk görülebilir — vücut yeniden ayarlanıyor.'),
    T(48 * HOUR, 'Zirve', 'Belirtiler genelde 1–2. günde zirve yapar. Bol su iç.'),
    T(WEEK, 'Belirtiler geçer', 'Baş ağrısı ve halsizlik çoğunlukla 2–9 gün içinde geçer.'),
    T(2 * WEEK, 'Derin uyku', 'Uyku derinleşir, uykuya dalmak kolaylaşır.'),
    T(MONTH, 'Doğal enerji', 'Enerji doğal ritmine döner; kaygı ve çarpıntı azalabilir.'),
    T(3 * MONTH, 'Yeni denge', 'Kafeinsiz yaşam yeni normalin olur.'),
  ],
  screen: [
    T(24 * HOUR, 'Farkındalık', 'Telefona uzanma refleksini fark etmeye başlarsın.'),
    T(3 * DAY, 'Uyku', 'Yatmadan önce ekran azalınca uykuya dalmak kolaylaşabilir.'),
    T(WEEK, 'Dikkat süresi', 'Dikkat süren uzamaya, sıkılma toleransın artmaya başlar.'),
    T(2 * WEEK, 'Ruh hali', 'Kendini başkalarıyla kıyaslama azalır, ruh hali dengelenir.'),
    T(MONTH, 'Yeni rutinler', 'Boşalan zamana yeni ve tatmin edici rutinler yerleşir.'),
    T(3 * MONTH, 'Derin odak', 'Uzun süreli odaklanma ve derin çalışma kapasiten artar.'),
    T(6 * MONTH, 'Kalıcı denge', 'Teknolojiyle bilinçli ve dengeli bir ilişki kurarsın.'),
  ],
  dopamine: [
    T(24 * HOUR, 'İlk gün', 'İlk adım atıldı: farkındalık ve kararlılık.'),
    T(3 * DAY, 'Dalga dönemi', 'İstek dalgaları en yoğun olabilir — her biri geçicidir.'),
    T(WEEK, 'Dürtü kontrolü', 'Dürtü kontrolü güçlenmeye başlar.'),
    T(2 * WEEK, 'Ödül dengesi', 'Beynin ödül sistemi dengelenmeye başlar.'),
    T(MONTH, 'Yeni alışkanlıklar', 'Yerine koyduğun yeni alışkanlıklar oturmaya başlar.'),
    T(3 * MONTH, '90 gün', 'Birçok kişi için istekler belirgin şekilde azalır.'),
    T(6 * MONTH, 'Sağlam zemin', 'Yeni davranışlar otomatikleşir.'),
    T(YEAR, 'Yeni kimlik', 'Bir yıl: bu artık senin yeni yaşam biçimin.'),
  ],
};

export const BADGES_DAY = [
  { key: 'd1', t: DAY, label: '1 Gün', xp: 20 },
  { key: 'd3', t: 3 * DAY, label: '3 Gün', xp: 30 },
  { key: 'w1', t: WEEK, label: '1 Hafta', xp: 50 },
  { key: 'w2', t: 2 * WEEK, label: '2 Hafta', xp: 70 },
  { key: 'm1', t: MONTH, label: '1 Ay', xp: 120 },
  { key: 'm3', t: 3 * MONTH, label: '3 Ay', xp: 200 },
  { key: 'm6', t: 6 * MONTH, label: '6 Ay', xp: 300 },
  { key: 'y1', t: YEAR, label: '1 Yıl', xp: 500 },
];
export const BADGES_MONEY = [100, 500, 1000, 5000, 10000, 25000].map((amt, i) => ({ key: 'tl' + amt, amt, label: fmt.money(amt), xp: [25, 40, 60, 100, 150, 250][i] }));

// ---------------------------------------------------------------- Depo
export const all = () => {
  const d = load(KEY, { list: [] });
  if (!Array.isArray(d.list)) d.list = [];
  return d;
};
export const list = () => all().list;
export const active = () => list().filter(x => !x.archived);
export const get = id => list().find(x => x.id === id) || null;

export function mutate(id, fn) {
  const d = all();
  const hb = d.list.find(x => x.id === id);
  if (!hb) return null;
  fn(hb);
  save(KEY, d);
  return hb;
}

export function create(data) {
  const d = all();
  const now = Date.now();
  const hb = normalize({ id: uid(), createdAt: now, relapses: [], cravings: [], badges: {}, archived: false, ...data });
  hb.firstQuitAt = hb.quitAt;
  d.list.push(hb);
  save(KEY, d);
  return hb;
}

export function removeHabit(id) {
  const d = all();
  d.list = d.list.filter(x => x.id !== id);
  save(KEY, d);
}

function normalize(hb) {
  hb.relapses ||= []; hb.cravings ||= []; hb.reasons ||= []; hb.badges ||= {};
  hb.unitsPerDay = +hb.unitsPerDay || 0;
  hb.costPerDay = +hb.costPerDay || 0;
  hb.timePerUnit = +hb.timePerUnit || 0;
  return hb;
}

/** Kayma kaydı: sayacı sıfırlar, geçmişi ve en iyi seriyi korur */
export function recordRelapse(id, { ts = Date.now(), note = '' } = {}) {
  return mutate(id, hb => {
    const at = Math.max(hb.quitAt, Math.min(ts, Date.now()));
    hb.relapses.push({ ts: at, note: note.trim(), streakMs: at - hb.quitAt, startedAt: hb.quitAt });
    hb.quitAt = at;
  });
}

export function addCraving(id, { intensity = 5, trigger = '', note = '', resisted = true, sos = false, ts = Date.now() } = {}) {
  const c = { id: uid(), ts, intensity: +intensity, trigger, note: note.trim(), resisted: !!resisted, sos };
  mutate(id, hb => { hb.cravings.push(c); });
  return c;
}

export function removeCraving(id, cid) {
  mutate(id, hb => { hb.cravings = hb.cravings.filter(c => c.id !== cid); });
}

// ---------------------------------------------------------------- Hesaplamalar
export function stats(hb, now = Date.now()) {
  const t = tpl(hb.type);
  const ms = Math.max(0, now - hb.quitAt);
  const days = ms / DAY;
  const past = hb.relapses.reduce((s, r) => s + (r.streakMs || 0), 0);
  const totalMs = past + ms;
  const units = days * hb.unitsPerDay;
  const best = Math.max(ms, ...hb.relapses.map(r => r.streakMs || 0));
  const timeline = TRACKS[t.track] || TRACKS.dopamine;
  let done = 0;
  while (done < timeline.length && ms >= timeline[done].t) done++;
  const next = timeline[done] || null;
  const prevT = done ? timeline[done - 1].t : 0;
  const nextProgress = next ? (ms - prevT) / (next.t - prevT) : 1;
  return {
    ms, days, totalMs, best,
    cleanDays: Math.floor(days),
    units,
    saved: days * hb.costPerDay,
    totalSaved: (totalMs / DAY) * hb.costPerDay,
    regainMin: units * hb.timePerUnit,
    attempts: hb.relapses.length + 1,
    timeline, done, next, nextProgress,
    recovery: (done + (next ? nextProgress : 0)) / timeline.length,
  };
}

/** Süreyi kısa metne çevirir: '3 g 4 sa', '5 sa 12 dk', '12 dk' */
export function span(ms, parts = 2) {
  ms = Math.max(0, ms);
  const units = [[YEAR, 'yıl'], [DAY, 'g'], [HOUR, 'sa'], [MIN, 'dk'], [SEC, 'sn']];
  const out = [];
  for (const [u, l] of units) {
    if (ms >= u || (out.length && out.length < parts)) {
      const v = Math.floor(ms / u);
      ms -= v * u;
      if (v || out.length) out.push(`${v} ${l}`);
      if (out.length >= parts) break;
    }
  }
  return out.filter(s => !s.startsWith('0 ')).join(' ') || '0 dk';
}

/** Uzun süre adı (zaman çizelgesi düğümleri için): '20 dk', '8 sa', '2 hafta', '1 ay' */
export function spanLabel(ms) {
  if (ms < HOUR) return Math.round(ms / MIN) + ' dk';
  if (ms < 2 * DAY + 1) return Math.round(ms / HOUR) + ' sa';
  if (ms < WEEK) return Math.round(ms / DAY) + ' gün';
  if (ms < MONTH && ms % WEEK === 0) return ms / WEEK + ' hafta';
  if (ms < 12 * WEEK + 1 && ms % WEEK === 0) return ms / WEEK + ' hafta';
  if (ms < YEAR) return Math.round(ms / MONTH) + ' ay';
  return Math.round(ms / YEAR) + ' yıl';
}

export function clockParts(ms) {
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
export const pad2 = n => String(n).padStart(2, '0');
export const compactClock = ms => { const c = clockParts(ms); return `${c.d} gün ${pad2(c.h)}:${pad2(c.m)}:${pad2(c.s)}`; };

export function fmtUnits(hb, n) {
  if (hb.unitName === 'dk') return span(n * MIN);
  return `${fmt.n(n, n < 10 && n % 1 ? 1 : 0)} ${hb.unitName}`;
}

// ---------------------------------------------------------------- Başarımlar
/** Yeni kazanılan rozetleri işaretler, XP verir. Yeni rozetlerin listesini döner. */
export function checkAchievements(id, { quiet = false } = {}) {
  const hb = get(id);
  if (!hb || hb.archived) return [];
  const s = stats(hb);
  const fresh = [];
  for (const b of BADGES_DAY) if (s.ms >= b.t && !hb.badges?.[b.key]) fresh.push(b);
  if (hb.costPerDay > 0) for (const b of BADGES_MONEY) if (s.totalSaved >= b.amt && !hb.badges?.[b.key]) fresh.push(b);
  if (!fresh.length) return [];
  const now = Date.now();
  mutate(id, x => { x.badges ||= {}; fresh.forEach(b => { x.badges[b.key] = now; }); });
  let xp = 0;
  for (const b of fresh) if (awardXP(b.xp, `Bırakma · ${hb.name} · ${b.label}`, { once: `habits:${id}:${b.key}`, silent: true })) xp += b.xp;
  if (!quiet) {
    const names = fresh.map(b => b.label).join(', ');
    toast(`Rozet açıldı · ${hb.name}: ${names}${xp ? ` · +${xp} XP` : ''}`, { type: 'xp', ms: 3800 });
  }
  return fresh;
}

export function checkAll(opts) {
  active().forEach(hb => checkAchievements(hb.id, opts));
}

/** Direnilen istek için günlük küçük ödül */
export function rewardResist(hb) {
  return awardXP(5, `Bırakma · istek yenildi (${hb.name})`, { once: `habits:${hb.id}:resist:${todayKey()}` });
}

// ---------------------------------------------------------------- Yardımcılar
export const toLocalInput = ts => {
  const d = new Date(ts), p = pad2;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = str => {
  const t = new Date(str).getTime();
  return Number.isFinite(t) ? t : null;
};
