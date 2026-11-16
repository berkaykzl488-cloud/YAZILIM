// Koşu modülü — coğrafi hesaplar: Haversine, Web-Mercator, rota analizi (kümülatif mesafe, bölümler, en iyi efor, sadeleştirme).
// Nokta biçimi: [lat, lng, t(ms epoch), alt(m|null), mt(hareket saniyesi)]

const RAD = Math.PI / 180;
export const EARTH_R = 6371008.8;
export const MAX_LAT = 85.05112878;

export function haversine(a1, o1, a2, o2) {
  const dLat = (a2 - a1) * RAD, dLng = (o2 - o1) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * RAD) * Math.cos(a2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a1, o1, a2, o2) {
  const y = Math.sin((o2 - o1) * RAD) * Math.cos(a2 * RAD);
  const x = Math.cos(a1 * RAD) * Math.sin(a2 * RAD) - Math.sin(a1 * RAD) * Math.cos(a2 * RAD) * Math.cos((o2 - o1) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** lat/lng -> normalize dünya koordinatı [0..1, 0..1] (Web-Mercator) */
export function project(lat, lng) {
  const s = Math.sin(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * RAD);
  return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}
export function unproject(x, y) {
  const n = Math.PI - 2 * Math.PI * y;
  return [Math.atan(Math.sinh(n)) / RAD, x * 360 - 180];
}
/** Belirli dünya genişliğinde (px) bir pikselin metre karşılığı */
export const metersPerPx = (lat, worldPx) => Math.cos(lat * RAD) * 2 * Math.PI * EARTH_R / worldPx;

/** Noktanın hareket süresi (sn). Eski/harici kayıtlarda mt yoksa duvar saatinden türetilir. */
export const mtOf = (p, t0) => (p[4] != null ? p[4] : (p[2] - t0) / 1000);

/** Kümülatif mesafe dizisi. breaks: yeni segmentin başladığı nokta indeksleri (aradaki mesafe sayılmaz). */
export function cumDist(points, breaks = []) {
  const br = new Set(breaks);
  const cum = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cum[i] = cum[i - 1] + (br.has(i) ? 0 : haversine(a[0], a[1], b[0], b[1]));
  }
  return cum;
}

/** Hareket süresi dizisi */
export function movingTimes(points) {
  const t0 = points[0]?.[2] || 0;
  return Float64Array.from(points, p => mtOf(p, t0));
}

/**
 * Km bölümlerini ilerletir (canlı ve toplu kullanımda ortak).
 * state: { splits: [], mark: { t, alt } }, n: yeni eklenen nokta indeksi
 */
export function advanceSplits(state, points, cum, mt, n, onSplit) {
  if (n < 1) return;
  const a = points[n - 1], b = points[n];
  if (state.mark.alt == null && b[3] != null) state.mark.alt = b[3];
  while (cum[n] >= (state.splits.length + 1) * 1000 && cum[n] > cum[n - 1]) {
    const target = (state.splits.length + 1) * 1000;
    const f = Math.max(0, Math.min(1, (target - cum[n - 1]) / (cum[n] - cum[n - 1])));
    const tCross = mt[n - 1] + f * (mt[n] - mt[n - 1]);
    const altCross = a[3] != null && b[3] != null ? a[3] + f * (b[3] - a[3]) : (b[3] ?? null);
    const sp = {
      n: state.splits.length + 1, distM: 1000, sec: Math.round((tCross - state.mark.t) * 10) / 10,
      elev: altCross != null && state.mark.alt != null ? Math.round(altCross - state.mark.alt) : null,
    };
    state.splits.push(sp);
    state.mark = { t: tCross, alt: altCross ?? state.mark.alt };
    onSplit?.(sp);
  }
}

/** Tüm rota için bölümler (+ son kısmi bölüm) */
export function computeSplits(points, breaks = [], totalSec = null) {
  if (points.length < 2) return [];
  const cum = cumDist(points, breaks), mt = movingTimes(points);
  const st = { splits: [], mark: { t: 0, alt: points[0][3] ?? null } };
  for (let i = 1; i < points.length; i++) advanceSplits(st, points, cum, mt, i);
  const rem = cum[cum.length - 1] - st.splits.length * 1000;
  if (rem >= 50) {
    const end = totalSec ?? mt[mt.length - 1];
    const lastAlt = points[points.length - 1][3];
    st.splits.push({ n: st.splits.length + 1, distM: Math.round(rem), sec: Math.round((end - st.mark.t) * 10) / 10,
      elev: lastAlt != null && st.mark.alt != null ? Math.round(lastAlt - st.mark.alt) : null, partial: true });
  }
  return st.splits;
}

/** Rota içinde D metrenin en hızlı geçildiği bölüm: { sec, i, j } | null */
export function bestEffort(points, cum, mt, D) {
  const n = points.length;
  if (n < 2 || cum[n - 1] < D) return null;
  let best = null, i = 0;
  for (let j = 1; j < n; j++) {
    while (i + 1 < j && cum[j] - cum[i + 1] >= D) i++;
    const dd = cum[j] - cum[i];
    if (dd < D) continue;
    const sec = (mt[j] - mt[i]) * D / dd;
    if (sec > 0 && (!best || sec < best.sec)) best = { sec, i, j };
  }
  return best;
}

/** Her nokta için geriye dönük pencere hızı (m/sn) */
export function rollingSpeeds(points, cum, mt, breaks = [], windowSec = 20) {
  const br = new Set(breaks), n = points.length, out = new Float32Array(n);
  let k = 0, segStart = 0;
  for (let i = 0; i < n; i++) {
    if (br.has(i)) { segStart = i; k = i; }
    if (k < segStart) k = segStart;
    while (k < i - 1 && mt[i] - mt[k + 1] >= windowSec) k++;
    const dt = mt[i] - mt[k], dd = cum[i] - cum[k];
    out[i] = dt > 0.5 ? dd / dt : (i > 0 ? out[i - 1] : 0);
  }
  if (n > 1) out[0] = out[1];
  return out;
}

/** Douglas-Peucker sadeleştirme (segment başına) + en fazla maxGapSec'de bir nokta korunur */
export function simplify(points, breaks = [], tolM = 1.5, maxGapSec = 15) {
  const n = points.length;
  if (n < 3) return { points: points.slice(), breaks: breaks.slice() };
  const keep = new Uint8Array(n);
  const lat0 = points[0][0] * RAD;
  const kx = Math.cos(lat0) * EARTH_R * RAD, ky = EARTH_R * RAD;
  const X = i => points[i][1] * kx, Y = i => points[i][0] * ky;
  const bounds = [0, ...breaks.filter(b => b > 0 && b < n), n].sort((a, b) => a - b);
  for (let s = 0; s < bounds.length - 1; s++) {
    const a0 = bounds[s], b0 = bounds[s + 1] - 1;
    keep[a0] = keep[b0] = 1;
    const stack = [[a0, b0]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (b - a < 2) continue;
      const ax = X(a), ay = Y(a), bx = X(b), by = Y(b);
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const px = X(i) - ax, py = Y(i) - ay;
        let d;
        if (L2 === 0) d = Math.hypot(px, py);
        else { const t = Math.max(0, Math.min(1, (px * dx + py * dy) / L2)); d = Math.hypot(px - t * dx, py - t * dy); }
        if (d > md) { md = d; mi = i; }
      }
      if (md > tolM) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
  }
  const t0 = points[0][2];
  let lastMt = -1e9;
  for (let i = 0; i < n; i++) {
    const m = mtOf(points[i], t0);
    if (keep[i]) lastMt = m;
    else if (m - lastMt >= maxGapSec) { keep[i] = 1; lastMt = m; }
  }
  const map = new Int32Array(n);
  const out = [];
  for (let i = 0; i < n; i++) { map[i] = out.length; if (keep[i]) out.push(points[i]); }
  return { points: out, breaks: breaks.filter(b => b > 0 && b < n).map(b => map[b]) };
}

/** Sınır kutusu: { minLat, maxLat, minLng, maxLng } */
export function boundsOf(points) {
  let a = 90, b = -90, c = 180, d = -180;
  for (const p of points) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; if (p[1] < c) c = p[1]; if (p[1] > d) d = p[1]; }
  return { minLat: a, maxLat: b, minLng: c, maxLng: d };
}

/** Yükseklik verisini hafif yumuşatır (null'ları atlar) */
export function smoothAlt(points, alpha = 0.25) {
  let s = null;
  return points.map(p => {
    if (p[3] == null) return s;
    s = s == null ? p[3] : s + alpha * (p[3] - s);
    return s;
  });
}
