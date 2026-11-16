// Besin veritabanı için saf yardımcılar (DOM/depo bağımlılığı yok; Node ile de test edilebilir).

/** Kategori bilgisi: l = etiket, s = kısa kod, h = renk tonu (CSS değişkeni) */
export const CATS = {
  tahil: { l: 'Tahıl ve ekmek', s: 'TA', h: 'var(--amber)' },
  baklagil: { l: 'Baklagil', s: 'BK', h: 'var(--lime)' },
  et: { l: 'Et ve tavuk', s: 'ET', h: 'var(--red)' },
  balik: { l: 'Balık ve deniz ürünü', s: 'BL', h: 'var(--blue)' },
  sut: { l: 'Süt, peynir, yumurta', s: 'SÜ', h: 'var(--text)' },
  kuruyemis: { l: 'Kuruyemiş ve kuru meyve', s: 'KY', h: 'var(--amber)' },
  sos: { l: 'Yağ, sos ve şeker', s: 'YS', h: 'var(--amber)' },
  meyve: { l: 'Meyve', s: 'MY', h: 'var(--magenta)' },
  sebze: { l: 'Sebze', s: 'SB', h: 'var(--lime)' },
  corba: { l: 'Çorba', s: 'ÇR', h: 'var(--amber)' },
  yemek: { l: 'Ev yemeği', s: 'EV', h: 'var(--red)' },
  meze: { l: 'Meze ve salata', s: 'MZ', h: 'var(--lime)' },
  pilav: { l: 'Pilav ve makarna', s: 'PL', h: 'var(--amber)' },
  hamur: { l: 'Börek, pide, hamur işi', s: 'BÖ', h: 'var(--amber)' },
  kebap: { l: 'Kebap, ızgara, döner', s: 'KB', h: 'var(--red)' },
  kahvalti: { l: 'Kahvaltılık', s: 'KH', h: 'var(--amber)' },
  sokak: { l: 'Sokak lezzeti', s: 'SK', h: 'var(--magenta)' },
  tatli: { l: 'Tatlı ve atıştırmalık', s: 'TT', h: 'var(--magenta)' },
  fastfood: { l: 'Fast food ve dünya mutfağı', s: 'FF', h: 'var(--red)' },
  icecek: { l: 'İçecek', s: 'İÇ', h: 'var(--cyan)' },
  alkol: { l: 'Alkollü içecek', s: 'AL', h: 'var(--violet)' },
  takviye: { l: 'Sporcu takviyesi', s: 'TK', h: 'var(--violet)' },
  market: { l: 'Market ürünü', s: 'MR', h: 'var(--cyan)' },
  ozel: { l: 'Kendi besinin', s: 'ÖZ', h: 'var(--lime)' },
  tarif: { l: 'Kendi tarifin', s: 'TR', h: 'var(--lime)' },
  online: { l: 'Online ürün', s: 'ON', h: 'var(--cyan)' },
};

const TR_MAP = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };

/** Türkçe karakterlere duyarsız, küçük harfli, sadece harf/rakam + boşluk */
export function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ışğüöçâîû]/g, c => TR_MAP[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ve ')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

export const slug = s => norm(s).replace(/%/g, '').replace(/\s+/g, '-');

const num = v => (v == null || v === '' || v === '-' ? undefined : +v);

/**
 * Metin biçimli veri dosyasını ayrıştırır.
 * Başlık:  "# kategori [ml] [~]"
 * Satır:   "Ad [@Marka]; kcal p c f [lif şeker tuz]; 1 kase=250, 1 tas=300; [ml|g|~|!] [anahtar kelimeler]"
 * Tüm değerler 100 g / 100 ml içindir.
 */
export function parseData(text) {
  const out = [];
  let cat = 'yemek', unitDef = 'g', approxDef = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('#')) {
      const parts = line.slice(1).trim().split(/\s+/);
      cat = parts[0];
      unitDef = parts.includes('ml') ? 'ml' : 'g';
      approxDef = parts.includes('~');
      continue;
    }
    const [namePart, numPart = '', portPart = '', extraPart = ''] = line.split(';').map(s => s.trim());
    let name = namePart, brand;
    const at = namePart.indexOf('@');
    if (at > 0) { name = namePart.slice(0, at).trim(); brand = namePart.slice(at + 1).trim(); }
    const n = numPart.split(/\s+/).map(num);
    const extras = extraPart ? extraPart.split(/\s+/) : [];
    let unit = unitDef, approx = approxDef;
    const keys = [];
    for (const x of extras) {
      if (x === 'ml' || x === 'g') unit = x;
      else if (x === '~') approx = true;
      else if (x === '!') approx = false;
      else if (x) keys.push(x);
    }
    const portions = portPart ? portPart.split(',').map(p => {
      const [l, g] = p.split('=').map(s => s.trim());
      return { l, g: +g };
    }).filter(p => p.l && p.g > 0) : [];
    const item = {
      id: slug(`${cat} ${brand || ''} ${name}`),
      name, cat, kcal: n[0], p: n[1], c: n[2], f: n[3], unit, portions,
    };
    if (brand) item.brand = brand;
    if (n[4] != null) item.fib = n[4];
    if (n[5] != null) item.sug = n[5];
    if (n[6] != null) item.salt = n[6];
    if (approx) item.approx = true;
    if (keys.length) item.keys = keys.join(' ');
    out.push(item);
  }
  return out;
}

/** Sınırlı Damerau (OSA) mesafesi; max aşılırsa max+1 döner */
export function osa(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: lb + 1 }, (_, i) => i), cur;
  for (let i = 1; i <= la; i++) {
    cur = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[lb];
}

/** Tek bir sorgu kelimesinin bir kelimeye uyum puanı (0 = uyum yok) */
export function tokScore(q, t) {
  if (t === q) return 100;
  if (t.startsWith(q)) return 70 + Math.min(20, q.length * 4) - Math.min(12, t.length - q.length);
  if (q.length >= 3 && t.includes(q)) return 48;
  if (q.length >= 4) {
    const maxD = q.length >= 7 ? 2 : 1;
    let d = osa(q, t, maxD);
    if (d > maxD && t.length > q.length) d = Math.min(osa(q, t.slice(0, q.length), maxD), osa(q, t.slice(0, q.length + 1), maxD));
    if (d <= maxD) return 42 - d * 8;
  }
  return 0;
}

/** Arama dizini kaydı */
export function indexItem(item) {
  const nameN = norm(item.name);
  const all = norm(`${item.name} ${item.brand || ''} ${item.keys || ''}`);
  return { item, nameN, toks: [...new Set(all.split(' ').filter(Boolean))], brandN: norm(item.brand || '') };
}

/** Dizinde arama: tüm sorgu kelimeleri bir yerde eşleşmeli */
export function searchIndex(index, query, { limit = 60, boost = null } = {}) {
  const qn = norm(query);
  if (!qn) return [];
  const qt = qn.split(' ').filter(Boolean);
  const res = [];
  for (const e of index) {
    let total = 0, ok = true;
    for (const q of qt) {
      let best = 0;
      for (const t of e.toks) { const s = tokScore(q, t); if (s > best) { best = s; if (s === 100) break; } }
      if (!best) { ok = false; break; }
      total += best;
    }
    if (!ok) continue;
    if (e.nameN.startsWith(qn)) total += 30;
    else if (e.nameN.includes(qn)) total += 10;
    if (e.brandN && qt.length === 1 && e.brandN === qn) total += 5;
    if (!e.item.brand) total += 3;
    total -= e.toks.length * 0.8;
    if (boost) total += boost(e.item) || 0;
    res.push({ item: e.item, score: total });
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, limit).map(r => r.item);
}

/** Atwater tahmini (iki yöntem): standart ve lif düzeltmeli */
export function atwater(x) {
  const std = 4 * (x.p || 0) + 4 * (x.c || 0) + 9 * (x.f || 0);
  const fib = Math.min(x.fib || 0, x.c || 0);
  const adj = 4 * (x.p || 0) + 4 * ((x.c || 0) - fib) + 2 * fib + 9 * (x.f || 0);
  return { std, adj };
}
