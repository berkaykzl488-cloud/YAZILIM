// Egzersiz figürü çizimi: anatomik gövde (kıyafet, gölgelendirme, kas vurguları) ve ekipman.
// Her şey kodla üretilen SVG'dir. Konumlar rig.js'in çözdüğü eklemlerden (J) gelir.
import { svg } from '../../core/ui.js';
import { S, FLOOR, RAD, dir, add, sub, lerp, lerpP, clampN, f1, fp } from './rig.js';

let UID = 0;
export const nextId = () => 'nvf' + (++UID).toString(36) + '-';

// Işık yönü (ışığa doğru birim vektör): önden-yukarıdan
const LIGHT = (() => { const x = 0.37, y = -0.93, l = Math.hypot(x, y); return [x / l, y / l]; })();

// ---------- Şekil yardımcıları ----------
export function smoothClosed(pts) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = 'M' + fp(mid(pts[n - 1], pts[0]));
  for (let i = 0; i < n; i++) d += 'Q' + fp(pts[i]) + ' ' + fp(mid(pts[i], pts[(i + 1) % n]));
  return d + 'Z';
}
function smoothOpen(pts) {
  let d = 'M' + fp(pts[0]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += 'C' + fp([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' + fp([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + fp(p2);
  }
  return d;
}
export function capsule(A, B, r1, r2 = r1) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy) || 0.001;
  const nx = dy / L, ny = -dx / L;
  const a1 = [A[0] + nx * r1, A[1] + ny * r1], a2 = [A[0] - nx * r1, A[1] - ny * r1];
  const b1 = [B[0] + nx * r2, B[1] + ny * r2], b2 = [B[0] - nx * r2, B[1] - ny * r2];
  return `M${fp(a1)}L${fp(b1)}A${f1(r2)} ${f1(r2)} 0 0 1 ${fp(b2)}L${fp(a2)}A${f1(r1)} ${f1(r1)} 0 0 1 ${fp(a1)}Z`;
}
const poly = pts => 'M' + pts.map(fp).join('L') + 'Z';
/** Dönmüş dikdörtgen: merkez q, eksen u, yarı boy hw (u yönünde), yarı yükseklik hh */
function rrect(q, u, hw, hh) {
  const n = [-u[1], u[0]];
  return poly([add(add(q, u, -hw), n, -hh), add(add(q, u, hw), n, -hh), add(add(q, u, hw), n, hh), add(add(q, u, -hw), n, hh)]);
}
const unit = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const el = (tag, cls, attrs = {}) => svg(tag, cls ? { class: cls, ...attrs } : attrs);
const grp = cls => el('g', cls);
const pth = (d, cls, attrs) => el('path', cls, { d, ...attrs });
const circ = (cx, cy, r, cls) => el('circle', cls, { cx, cy, r });
const place = (e, p, a = 0, s = 1) => e.setAttribute('transform', `translate(${fp(p)})` + (a ? ` rotate(${f1(a)})` : '') + (s !== 1 ? ` scale(${s})` : ''));
/** u yönünü (aşağı = +y yerel eksen) SVG dönüş açısına çevirir: yerel +x → u */
const angX = u => Math.atan2(u[1], u[0]) / RAD;

/** Segment çerçevesi: A→B ekseni, n = ön yön (nSign ile), curve = omurga eğriliği */
function frameOf(A, B, nSign = 1, curve = 0) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = uy * nSign, ny = -ux * nSign;
  return { A, L, ux, uy, nx, ny, P(t, o) { const c = curve ? -curve * 7 * Math.sin(Math.PI * clampN(t, 0, 1)) : 0; return [A[0] + ux * L * t + nx * (o + c), A[1] + uy * L * t + ny * (o + c)]; } };
}

/** Profil genişliği (ön, arka) — satırlar arasında kosinüs geçişli */
function pw(prof, t) {
  const n = prof.length;
  if (t <= prof[0][0]) return [prof[0][1], prof[0][2]];
  if (t >= prof[n - 1][0]) return [prof[n - 1][1], prof[n - 1][2]];
  for (let i = 1; i < n; i++) if (t <= prof[i][0]) {
    const a = prof[i - 1], b = prof[i];
    const s = 0.5 - 0.5 * Math.cos(Math.PI * (t - a[0]) / (b[0] - a[0]));
    return [lerp(a[1], b[1], s), lerp(a[2], b[2], s)];
  }
  return [prof[n - 1][1], prof[n - 1][2]];
}
function tsOf(prof) {
  if (!prof._ts) {
    const out = [];
    prof.forEach((r, i) => { out.push(r[0]); if (i < prof.length - 1) out.push((r[0] + prof[i + 1][0]) / 2); });
    prof._ts = out;
  }
  return prof._ts;
}
function capPts(fr, prof, t, s, k) { // s: +1 uç, -1 baş
  const [f, b] = pw(prof, t), r = (f + b) / 2, c = (f - b) / 2, x = r * k / fr.L;
  const P = [fr.P(t + s * x * 0.72, c + s * r * 0.72), fr.P(t + s * x, c), fr.P(t + s * x * 0.72, c - s * r * 0.72)];
  return P;
}
/** Uzvun dış hattı: profil örneklenir, iki uca yuvarlak kapak */
function outlinePath(fr, prof, k0 = 0.95, k1 = 0.95) {
  const ts = tsOf(prof), pts = [];
  for (const t of ts) pts.push(fr.P(t, pw(prof, t)[0]));
  pts.push(...capPts(fr, prof, ts[ts.length - 1], 1, k1));
  for (let i = ts.length - 1; i >= 0; i--) pts.push(fr.P(ts[i], -pw(prof, ts[i])[1]));
  pts.push(...capPts(fr, prof, ts[0], -1, k0));
  return smoothClosed(pts);
}
const bump = u => Math.pow(Math.sin(Math.PI * clampN(u, 0, 1)), 0.7);
/** Kas ya da kıyafet bandı. mode: f (ön kenar), b (arka kenar), c (orta), w (tam genişlik), cap (deltoid başlığı) */
function bandPath(fr, prof, d) {
  const [, t0r, t1, mode, a = 0, b = 0] = d;
  const ts = tsOf(prof), tA = ts[0], n = 7, out = [], inn = [];
  const t0 = Math.max(t0r, tA);
  if (mode === 'cap') {
    for (let i = 0; i <= n; i++) {
      const u = i / n, t = lerp(tA, t1, u), [f, bw] = pw(prof, t), cc = (f - bw) / 2;
      const s = u < 0.38 ? 1 : Math.cos((u - 0.38) / 0.62 * Math.PI / 2);
      out.push(fr.P(t, cc + (f - cc - 0.2) * s)); inn.push(fr.P(t, cc - (bw + cc - 0.2) * s));
    }
    return smoothClosed([...out, ...inn.reverse(), ...capPts(fr, prof, tA, -1, 0.9)]);
  }
  for (let i = 0; i <= n; i++) {
    const u = i / n, t = lerp(t0, t1, u), [f, bw] = pw(prof, t);
    let o1, o2;
    if (mode === 'f') { o1 = f - 0.2; o2 = o1 - a * bump(u); }
    else if (mode === 'b') { o1 = -(bw - 0.2); o2 = o1 + a * bump(u); }
    else if (mode === 'c') { const hw = Math.min(b * bump(u), f - a - 0.3, bw + a - 0.3); o1 = a + Math.max(0, hw); o2 = a - Math.max(0, hw); }
    else { o1 = f + a; o2 = -(bw + a); }
    out.push(fr.P(t, o1)); inn.push(fr.P(t, o2));
  }
  if (mode === 'w' && t0r < tA) return smoothClosed([...out, ...inn.reverse(), ...capPts(fr, prof, tA, -1, b || 0.95)]);
  return smoothClosed([...out, ...inn.reverse()]);
}
function contourPath(fr, prof, lines) {
  let d = '';
  for (const L of lines) d += smoothOpen(L.map(([t, q]) => { const [f, b] = pw(prof, t); return fr.P(t, q >= 0 ? q * f : q * b); }));
  return d;
}

// ---------- Anatomik profiller: [t, ön, arka] ----------
// Yan görünüm (ön = vücudun önü). Ön görünüm uzuvlarda ön = dış yan, arka = iç yan.
const PROF_S = {
  torso: [[-0.06, 8.2, 9.6], [0.08, 8.5, 11.6], [0.24, 8.2, 8.9], [0.42, 8.6, 7.9], [0.6, 9.6, 9.0], [0.78, 11.2, 10.3], [0.92, 9.8, 9.9], [1.03, 5.4, 6.8]],
  upper: [[0, 5.9, 5.9], [0.18, 6.2, 6.0], [0.4, 4.7, 5.3], [0.6, 5.0, 4.6], [0.84, 3.9, 3.8], [1, 3.4, 3.3]],
  fore: [[0, 3.5, 3.4], [0.2, 4.4, 4.0], [0.5, 3.6, 3.3], [0.82, 2.7, 2.5], [1, 2.4, 2.3]],
  thigh: [[0, 7.7, 8.2], [0.28, 8.4, 7.8], [0.6, 7.2, 6.3], [0.86, 5.4, 4.9], [1, 5.0, 4.5]],
  shin: [[0, 4.9, 4.4], [0.24, 4.3, 6.5], [0.5, 3.7, 5.0], [0.8, 2.9, 3.0], [1, 2.6, 2.6]],
};
const PROF_F = {
  upper: [[0, 6.0, 4.6], [0.2, 6.3, 4.8], [0.45, 4.7, 4.4], [0.75, 4.0, 3.8], [1, 3.4, 3.3]],
  fore: [[0, 3.6, 3.4], [0.22, 4.4, 3.9], [0.55, 3.5, 3.1], [1, 2.5, 2.4]],
  thigh: [[0, 8.6, 6.4], [0.3, 8.3, 6.2], [0.6, 6.9, 5.4], [0.86, 5.2, 4.6], [1, 4.8, 4.4]],
  shin: [[0, 4.8, 4.6], [0.25, 5.0, 5.5], [0.55, 3.8, 4.0], [0.85, 2.9, 2.8], [1, 2.6, 2.6]],
};
// Ön görünüm gövde dış hattı (sağ yarı; x yanal, y kalçadan yukarı)
const TORSO_F = [[9.6, -6], [10.7, 2], [10.1, 10], [9.3, 18], [10.5, 26], [12.7, 33], [14.4, 39], [14.8, 42.6], [12.6, 46.6], [7, 48.6], [3.6, 49.5]];
const TORSO_F_SHORTS = [[0, -8.6], [9.9, -6.2], [11.1, 2], [10.8, 7], [10.5, 11.5], [-10.5, 11.5], [-10.8, 7], [-11.1, 2], [-9.9, -6.2]];
const TORSO_F_NECK = [[-5, 49.2], [5, 49.2], [3.4, 45.2], [0, 42.8], [-3.4, 45.2]];
const TORSO_F_ARM = [[7.6, 48.4], [12.6, 46.6], [14.8, 42.6], [14.4, 39], [12.4, 36.2], [10.6, 38.8], [9.4, 44]];

// ---------- Kas yerleşimi ----------
// Uzuv: [segment, t0, t1, mod, a, b]   Ön gövde: ['poly', noktalar, aynala]
const MUS_S = {
  chest: [['torso', 0.62, 0.93, 'f', 6.4]],
  abs: [['torso', 0.24, 0.64, 'f', 3.8]],
  obliques: [['torso', 0.26, 0.62, 'c', 3, 3.4]],
  lats: [['torso', 0.44, 0.9, 'b', 6]],
  upperBack: [['torso', 0.72, 1.0, 'b', 5.4]],
  traps: [['torso', 0.88, 1.05, 'b', 4.2]],
  lowerBack: [['torso', 0.16, 0.52, 'b', 3.6]],
  glutes: [['torso', -0.08, 0.28, 'b', 7.6]],
  hipflex: [['thigh', -0.02, 0.32, 'f', 3.4]],
  shoulders: [['upper', 0, 0.46, 'cap']],
  biceps: [['upper', 0.34, 0.95, 'f', 3.9]],
  triceps: [['upper', 0.2, 0.93, 'b', 4.1]],
  forearms: [['fore', 0.02, 0.74, 'f', 3.4]],
  quads: [['thigh', 0.14, 0.98, 'f', 6.4]],
  hamstrings: [['thigh', 0.12, 0.93, 'b', 5.8]],
  adductors: [['thigh', 0.05, 0.52, 'c', -0.6, 2.6]],
  calves: [['shin', 0.05, 0.68, 'b', 5]],
};
const MUS_F = {
  chest: [['poly', [[1.2, 41.6], [8, 42.3], [12.4, 39.8], [12.6, 35.6], [9.6, 32.4], [4.6, 31.8], [1.2, 33.6]], true]],
  abs: [['poly', [[-4.8, 31], [4.8, 31], [5.2, 22], [4.8, 10], [3, 5], [-3, 5], [-4.8, 10], [-5.2, 22]], false]],
  obliques: [['poly', [[6.2, 29.6], [9.4, 26.6], [9.6, 18], [9.6, 10.4], [6.4, 9], [5.6, 20]], true]],
  lats: [['poly', [[10.4, 30.6], [12.8, 35.4], [13.5, 32.6], [11.6, 25], [9.8, 21.6]], true]],
  traps: [['poly', [[3.6, 49.4], [10.5, 46.8], [12.6, 45.6], [7.4, 45.2], [3.2, 46.4]], true]],
  upperBack: [['poly', [[4, 48.6], [9.4, 46.6], [5.2, 45.8]], true]],
  glutes: [['poly', [[9.4, -4], [10.8, 2], [10.2, 8.4], [8.4, 3]], true]],
  shoulders: [['upper', 0, 0.44, 'cap']],
  biceps: [['upper', 0.32, 0.93, 'c', -0.4, 3.4]],
  triceps: [['upper', 0.24, 0.84, 'f', 2.4]],
  forearms: [['fore', 0.04, 0.72, 'c', 0.2, 3]],
  quads: [['thigh', 0.16, 0.97, 'c', 0.8, 5.6]],
  adductors: [['thigh', 0.02, 0.56, 'b', 3.8]],
  hamstrings: [['thigh', 0.2, 0.86, 'f', 2.2]],
  hipflex: [['thigh', 0.0, 0.3, 'c', -1, 2.8]],
  calves: [['shin', 0.08, 0.62, 'b', 3.4], ['shin', 0.1, 0.55, 'f', 2.4]],
};
// İnce kas hatları (yalnız büyük/orta boy): [[t, oran], ...]  oran>0 ön genişliğin, <0 arka genişliğin kesri
const CON_S = {
  upper: [[[0.28, 0.95], [0.47, 0.15], [0.3, -0.95]]],
  fore: [[[0.08, 0.35], [0.45, -0.05], [0.7, -0.2]]],
  thigh: [[[0.2, 0.5], [0.55, 0.22], [0.9, 0.38]], [[0.9, 0.98], [0.97, 0.55], [1.04, 0.9]]],
  shin: [[[0.08, -0.25], [0.38, 0.05], [0.66, -0.3]]],
};
const CON_F = {
  upper: [[[0.3, 0.95], [0.46, 0.1], [0.32, -0.9]]],
  thigh: [[[0.16, 0.25], [0.55, -0.1], [0.88, 0.12]], [[0.86, 0.55], [0.97, 0], [0.86, -0.55]]],
  shin: [[[0.1, -0.3], [0.45, -0.12], [0.75, -0.3]]],
};
// Kıyafet bantları (şort): [_, t0 (-1 = baştan, kapakla), t1, 'w', büyüme, kapak oranı]
const SHORTS_S = { torso: [0, -1, 0.2, 'w', 0.35, 0.5], thigh: [0, -1, 0.4, 'w', 0.55, 0.95] };
const SHORTS_F = { thigh: [0, -1, 0.34, 'w', 0.6, 0.95] };

// Gölgelendirme gradyanı durakları: aydınlık kenar → gövde → gölge → ince kenar ışığı
const SHADE_STOPS = [[0, '#ffffff', 0.32], [0.15, '#ffffff', 0.07], [0.5, '#ffffff', 0], [0.86, '#000000', 0.3], [0.97, '#000000', 0.12], [1, '#ffffff', 0.12]];

// Baş, el ve ayakkabı: yerel koordinatlarda sabit şekiller
const HEAD_S = 'M-0.6 -8.9C4.2 -9.2 7.5 -6.2 7.4 -2.6L7.7 -1.2Q7.9 -0.2 8.6 1.1Q9.6 1.9 8.4 2.5L7.8 2.8Q8.1 3.6 7.6 4.3Q7.9 5 7.4 5.6Q7.2 7.2 5.4 7.6Q3 8.1 1.2 7.4L-1.6 6.4C-6.2 6.6 -8.8 3.4 -8.7 -0.8C-8.6 -5.6 -5.2 -8.7 -0.6 -8.9Z';
const HAIR_S = 'M7.2 -3.6C7 -7.6 3.2 -9.9 -1.2 -9.6C-6.6 -9.2 -9.6 -5 -8.9 0.4C-8.6 2.6 -7.8 3.8 -6.6 4.6C-6.6 2 -5.6 -0.2 -3.6 -1.4C-1.4 -2.8 1.6 -3.2 4.4 -3C5.6 -3 6.6 -3.2 7.2 -3.6Z';
const HEAD_F = 'M0 -9.2C5 -9.2 7.4 -5.6 7.3 -1.2C7.2 3.4 5.2 8.2 0 8.6C-5.2 8.2 -7.2 3.4 -7.3 -1.2C-7.4 -5.6 -5 -9.2 0 -9.2Z';
const HAIR_F = 'M-7.4 -0.6C-8 -6.4 -4.6 -9.9 0 -9.9C4.6 -9.9 8 -6.4 7.4 -0.6C6.6 -3.4 5.2 -5.4 3 -5.8C0.6 -6.2 -1.6 -5.6 -3.4 -5.6C-5.4 -5.4 -6.8 -3.6 -7.4 -0.6Z';
const FIST = 'M-0.6 -2.6C1.4 -3.2 4.2 -3.4 5.7 -2.4C7 -1.4 7 1.6 5.7 2.6C4.2 3.4 1.6 3.3 -0.6 2.7Z';
const PALM = 'M-2.2 -1.4L2.1 -1.4Q3.2 1.8 4.2 3Q7.4 3.1 8.7 4.2Q9 5 8 5L-2.7 5Q-3.3 4.4 -2.9 2.2Z';
const SHOE_S = 'M-3.4 -3.4C-1 -3.9 1.6 -3.6 2.8 -2.8C4.6 -1.4 7 -0.3 9.6 0.5C12 1.1 13.1 2.1 12.9 3L-4.4 3C-5 1 -4.6 -2.2 -3.4 -3.4Z';
const SOLE_S = 'M-4.7 2.3L13 2.3C13.3 3.4 12.8 4 11.8 4L-3.8 4C-4.9 4 -5.1 3.2 -4.7 2.3Z';
const STRIPE_S = 'M0.2 0.8Q4.2 1.6 8.4 0.2';
const SHOE_F = 'M-3 -3C-1 -3.6 1.6 -3.6 3.2 -2.8C4.6 -1.8 5.5 0.6 5.3 2.6L-3.7 2.6C-4.2 0.4 -4 -1.8 -3 -3Z';
const SOLE_F = 'M-3.9 2.2L5.5 2.2C5.7 3.2 5.3 4 4.4 4L-3.2 4C-4 4 -4.3 3 -3.9 2.2Z';

const keyOf = (seg, i) => seg + (seg === 'torso' ? '' : i);

/**
 * Gövde çizicisi. Katmanları döndürür; çağıran sahnede doğru sırayla dizer.
 * mode 'sm' (küçük): gölgelendirme/hat yok, yalnız dolgu + dış hat + kaslar.
 */
export function makeBody({ F, mode, muscles, uid, defs }) {
  const rich = mode !== 'sm';
  const P1 = new Set(muscles?.p || []), S1 = new Set(muscles?.s || []);
  const lvOf = id => P1.has(id) ? 'p' : S1.has(id) ? 's' : null;
  const PR = F ? PROF_F : PROF_S, MD = F ? MUS_F : MUS_S, CON = F ? CON_F : CON_S, SHORTS = F ? SHORTS_F : SHORTS_S;
  const segs = [];

  function gradient(key) {
    const gr = el('linearGradient', null, { id: uid + 'g' + key, gradientUnits: 'userSpaceOnUse' });
    for (const [o, c, a] of SHADE_STOPS) gr.append(el('stop', null, { offset: o, 'stop-color': c, 'stop-opacity': a }));
    defs.append(gr);
    return gr;
  }
  function musFor(seg) {
    const out = [];
    for (const [id, list] of Object.entries(MD)) {
      const lv = lvOf(id); if (!lv) continue;
      for (const d of list) if (d[0] === seg) out.push({ d, lv, id });
    }
    out.sort((a, b) => (a.lv === 'p') - (b.lv === 'p')); // ana kaslar üstte
    return out;
  }
  function mkSeg(seg, i, kind, g, olG) {
    const key = keyOf(seg, i);
    const s = { seg, i, key, prof: PR[seg], ol: el('path', 'ol'), fill: el('path', kind), bands: [], mus: [], con: null, shade: null, grad: null };
    olG.append(s.ol); g.append(s.fill);
    if (SHORTS[seg]) { const e = el('path', 'cl-s'); g.append(e); s.bands.push({ e, d: SHORTS[seg] }); }
    if (!F && seg === 'torso') { const e = el('path', 'sk'); g.append(e); s.bands.push({ e, d: ['f', 0.9, 1.08, 'f', 2.4] }); }
    for (const m of musFor(seg)) { const e = el('path', 'mus mus-' + m.lv); g.append(e); s.mus.push({ e, d: m.d }); }
    if (rich && CON[seg]) { s.con = el('path', 'con'); g.append(s.con); }
    if (rich) { s.grad = gradient(key); s.shade = el('path', 'shade', { fill: `url(#${uid}g${key})` }); g.append(s.shade); }
    segs.push(s);
    return s;
  }

  // ---- Katmanlar ----
  const L = {}; // ad → { g, ol }
  const limbG = (name, far) => { const g = grp('limb ' + (far ? 'far' : 'near')); const ol = grp('ol-g'); return (L[name] = { g, ol }); };

  // Gövde + boyun + baş
  const T = limbG('torso', false);
  const neckOl = el('path', 'ol'), neck = el('path', 'sk');
  T.ol.append(neckOl); T.g.append(neck);
  let torsoSeg = null, ft = null;
  if (F) {
    ft = { ol: el('path', 'ol'), fill: el('path', 'cl'), shorts: el('path', 'cl-s'), neckS: el('path', 'sk'), arm1: el('path', 'sk'), arm2: el('path', 'sk'), mus: [], abl: null, shade: null, grad: null };
    T.ol.append(ft.ol); T.g.append(ft.fill, ft.neckS, ft.arm1, ft.arm2, ft.shorts);
    for (const [id, list] of Object.entries(MD)) {
      const lv = lvOf(id); if (!lv) continue;
      for (const d of list) if (d[0] === 'poly') for (const m of d[2] ? [1, -1] : [1]) { const e = el('path', 'mus mus-' + lv); T.g.append(e); ft.mus.push({ e, pts: d[1], m }); }
    }
    if (rich && P1.has('abs')) { ft.abl = el('path', 'mus-line'); T.g.append(ft.abl); }
    if (rich) { ft.grad = gradient('torso'); ft.shade = el('path', 'shade', { fill: `url(#${uid}gtorso)` }); T.g.append(ft.shade); }
  } else {
    torsoSeg = mkSeg('torso', 0, 'cl', T.g, T.ol);
  }
  const head = grp('head');
  const ears = F ? [el('ellipse', 'ear', { cx: 7.1, cy: 0.6, rx: 1.4, ry: 2.3 }), el('ellipse', 'ear', { cx: -7.1, cy: 0.6, rx: 1.4, ry: 2.3 })] : [];
  head.append(...ears, pth(F ? HEAD_F : HEAD_S, 'hd'));
  if (rich) head.append(pth(F ? HEAD_F : HEAD_S, 'hd-shade'));
  if (!F) head.append(el('ellipse', 'ear', { cx: -1.8, cy: 0.6, rx: 1.5, ry: 2.4 }), el('ellipse', 'eye', { cx: 5.3, cy: -0.4, rx: 0.55, ry: 0.75 }));
  else if (rich) head.append(pth('M0.2 -0.4L0.9 2.6L-0.3 2.9', 'nose'));
  head.append(pth(F ? HAIR_F : HAIR_S, 'hair'));
  T.g.append(head);

  // Kollar ve bacaklar
  const arms = {}, legs = {};
  for (const i of [1, 2]) {
    const far = !F && i === 2;
    const A = limbG('arm' + i, far);
    arms[i] = { up: mkSeg('upper', i, 'sk', A.g, A.ol), fo: mkSeg('fore', i, 'sk', A.g, A.ol), hand: pth(FIST, 'hand') };
    A.g.append(arms[i].hand);
    const G = limbG('leg' + i, far);
    legs[i] = { th: mkSeg('thigh', i, 'sk', G.g, G.ol), sn: mkSeg('shin', i, 'sk', G.g, G.ol), shoe: grp('shoe') };
    legs[i].shoe.append(pth(F ? SHOE_F : SHOE_S, 'shoe-up'), pth(F ? SOLE_F : SOLE_S, 'shoe-sole'));
    if (!F && rich) legs[i].shoe.append(pth(STRIPE_S, 'shoe-stripe'));
    G.g.append(legs[i].shoe);
  }

  // ---- Çizim ----
  function frameFor(J, seg, i) {
    if (seg === 'torso') return frameOf(J.hip, J.sh, -1, J.p.cv || 0);
    const A = J['a' + i], Lg = J['l' + i], nS = F && i === 2 ? -1 : 1;
    if (seg === 'upper') return frameOf(A.o, A.e, nS);
    if (seg === 'fore') return frameOf(A.e, A.w, nS);
    if (seg === 'thigh') return frameOf(Lg.o, Lg.k, nS);
    return frameOf(Lg.k, Lg.a, nS);
  }
  function shadeGrad(gr, shade, c, n, w) {
    const k = n[0] * LIGHT[0] + n[1] * LIGHT[1], s = k >= 0 ? 1 : -1;
    const a = add(c, n, s * w), b = add(c, n, -s * w);
    gr.setAttribute('x1', f1(a[0])); gr.setAttribute('y1', f1(a[1])); gr.setAttribute('x2', f1(b[0])); gr.setAttribute('y2', f1(b[1]));
    shade.setAttribute('opacity', f1(0.5 + 0.5 * Math.abs(k)));
  }
  function drawSeg(s, J) {
    const fr = frameFor(J, s.seg, s.i);
    const d = outlinePath(fr, s.prof, s.seg === 'torso' ? 0.5 : 0.95, 0.95);
    s.ol.setAttribute('d', d); s.fill.setAttribute('d', d);
    for (const b of s.bands) b.e.setAttribute('d', bandPath(fr, s.prof, b.d));
    for (const m of s.mus) m.e.setAttribute('d', bandPath(fr, s.prof, m.d));
    if (s.con) s.con.setAttribute('d', contourPath(fr, s.prof, CON[s.seg]));
    if (s.shade) {
      s.shade.setAttribute('d', d);
      const [f, b] = pw(s.prof, 0.5);
      shadeGrad(s.grad, s.shade, fr.P(0.5, (f - b) / 2), [fr.nx, fr.ny], (f + b) / 2 + 0.6);
    }
  }
  function drawFrontTorso(J) {
    const td = J.td, pp = J.perp, hip = J.hip, top = J.p.sh || 0;
    const B = (x, y) => { const yy = y + top * clampN((y - 30) / 14, 0, 1); return [hip[0] + pp[0] * x + td[0] * yy, hip[1] + pp[1] * x + td[1] * yy]; };
    const mirror = pts => pts.map(([x, y]) => [-x, y]).reverse();
    const outline = smoothClosed([...TORSO_F, ...mirror(TORSO_F), [0, -8.6]].map(p => B(...p)));
    ft.ol.setAttribute('d', outline); ft.fill.setAttribute('d', outline);
    ft.shorts.setAttribute('d', smoothClosed(TORSO_F_SHORTS.map(p => B(...p))));
    ft.neckS.setAttribute('d', smoothClosed(TORSO_F_NECK.map(p => B(...p))));
    ft.arm1.setAttribute('d', smoothClosed(TORSO_F_ARM.map(p => B(...p))));
    ft.arm2.setAttribute('d', smoothClosed(mirror(TORSO_F_ARM).map(p => B(...p))));
    for (const m of ft.mus) m.e.setAttribute('d', smoothClosed(m.pts.map(([x, y]) => B(x * m.m, y))));
    if (ft.abl) ft.abl.setAttribute('d', [[[0, 30], [0, 6]], [[-4.6, 23.4], [4.6, 23.4]], [[-4.8, 16], [4.8, 16]], [[-4.2, 9], [4.2, 9]]].map(l => 'M' + l.map(p => fp(B(...p))).join('L')).join(''));
    if (ft.shade) { ft.shade.setAttribute('d', outline); shadeGrad(ft.grad, ft.shade, B(0, 24), pp, 14); }
  }

  function draw(J) {
    if (F) drawFrontTorso(J); else drawSeg(torsoSeg, J);
    const nd = capsule(J.sh, J.neckTop, F ? 3.9 : 3.7, 3.4);
    neckOl.setAttribute('d', nd); neck.setAttribute('d', nd);
    place(head, J.head, J.hA, 1.07);
    const faceR = Math.sign(J.head[0] - J.hip[0]) || 1;
    for (const i of [1, 2]) {
      const A = J['a' + i], Lg = J['l' + i], ar = arms[i], lg = legs[i];
      drawSeg(ar.up, J); drawSeg(ar.fo, J);
      const fd = dir(A.pf);
      if (!F && A.hand[1] > FLOOR - 1.5 && fd[1] > 0.7) {
        ar.hand.setAttribute('d', PALM);
        ar.hand.setAttribute('transform', `translate(${f1(A.w[0])} ${f1(FLOOR - 5)}) scale(${faceR} 1)`);
      } else {
        ar.hand.setAttribute('d', FIST);
        place(ar.hand, A.w, angX(fd));
      }
      drawSeg(lg.th, J); drawSeg(lg.sn, J);
      if (F) lg.shoe.setAttribute('transform', `translate(${fp(Lg.a)}) scale(${Lg.mx} 1)`);
      else place(lg.shoe, Lg.a, 90 - Lg.pft);
    }
  }
  return { layers: L, draw };
}

/** Hayalet (başlangıç pozu) için tek parça siluet yolu */
export function silhouette(J) {
  const F = J.F, PR = F ? PROF_F : PROF_S;
  let d = '';
  if (F) {
    const td = J.td, pp = J.perp, hip = J.hip;
    const B = (x, y) => [hip[0] + pp[0] * x + td[0] * y, hip[1] + pp[1] * x + td[1] * y];
    d += smoothClosed([...TORSO_F, ...TORSO_F.map(([x, y]) => [-x, y]).reverse(), [0, -8.6]].map(p => B(...p)));
  } else d += outlinePath(frameOf(J.hip, J.sh, -1, J.p.cv || 0), PR.torso, 0.5);
  d += capsule(J.sh, J.neckTop, 3.7) + `M${fp(add(J.head, [9.2, 0]))}A9.2 9.2 0 1 0 ${fp(add(J.head, [-9.2, 0]))}A9.2 9.2 0 1 0 ${fp(add(J.head, [9.2, 0]))}Z`;
  for (const i of [1, 2]) {
    const A = J['a' + i], Lg = J['l' + i], nS = F && i === 2 ? -1 : 1;
    d += outlinePath(frameOf(A.o, A.e, nS), PR.upper) + outlinePath(frameOf(A.e, A.w, nS), PR.fore) + capsule(A.w, A.hand, 3, 2.6);
    d += outlinePath(frameOf(Lg.o, Lg.k, nS), PR.thigh) + outlinePath(frameOf(Lg.k, Lg.a, nS), PR.shin) + capsule(Lg.heel, Lg.toe, 2.6, 2);
  }
  return d;
}

// ======================= EKİPMAN =======================
// Her tür: make(c) → { el, front, bg?, upd?(J) }, pts(c, J) → kadraja girecek [x, y, r] noktaları
const fwd = J => [Math.cos(J.tE * RAD), Math.sin(J.tE * RAD)];
const arc = (r, a0, a1) => { const p = a => [r * Math.cos(a * RAD), r * Math.sin(a * RAD)]; return `M${fp(p(a0))}A${f1(r)} ${f1(r)} 0 0 1 ${fp(p(a1))}`; };
const hexPts = (r, cx = 0, cy = 0) => [0, 60, 120, 180, 240, 300].map(a => [cx + r * Math.cos((a + 30) * RAD), cy + r * Math.sin((a + 30) * RAD)]);
const steel = (d = '') => [pth(d, 'eq-steel'), pth(d, 'eq-steel-hi')];
const setD = (els, d) => els.forEach(e => e.setAttribute('d', d));

function barbellAt(c, J) {
  if (c.at === 'back') return add(add(J.sh, J.td, -4), fwd(J), -7);
  if (c.at === 'hip') return add(add(J.hip, J.td, 6), fwd(J), 13);
  return J.a1.grip;
}
function barFEnds(c, J) {
  let A = J.a1.grip, B = J.a2.grip;
  if (c.at === 'back') { A = add(J.sh1, J.td, 2); B = add(J.sh2, J.td, 2); }
  const u = unit(sub(A, B)), ext = c.ext || 30;
  return { A, B, u, e1: add(A, u, ext), e2: add(B, u, -ext), ext };
}
function kbGeom(J, c) {
  const p = J.F ? lerpP(J.a1.grip, J.a2.grip, 0.5) : J.a1.grip;
  const d = c.hang ? [0, 1] : dir(J.a1.pf);
  return { p, d };
}
function cableEnd(c, J) {
  if (c.attach === 'ankle') return J.l1.a;
  if (c.hand === 2) return J.a2.grip;
  if (c.both && J.F) return lerpP(J.a1.grip, J.a2.grip, 0.5);
  return J.a1.grip;
}
function bandEnds(c, J) {
  if (c.legs) return [[lerpP(J.l1.k, J.l1.a, 0.18), lerpP(J.l2.k, J.l2.a, 0.18)]];
  const hands = J.F ? [J.a1.grip, J.a2.grip] : [J.a1.grip];
  return hands.map((p, i) => {
    let a;
    if (c.from === 'feet') a = J.F ? (i ? J.l2.heel : J.l1.heel) : [lerp(J.l1.heel[0], J.l1.toe[0], 0.45), FLOOR - 0.5];
    else a = c.from;
    return [a, p];
  });
}

export const PROPS = {
  barbell: {
    make(c) {
      const r = c.r || 15, g = grp('eq');
      g.append(circ(0, 0, r, 'eq-plate'), circ(0, 0, r * 0.84, 'eq-plate-in'), circ(0, 0, r * 0.44, 'eq-plate-hub'),
        pth(arc(r * 0.92, 250, 330), 'eq-hl'), circ(0, 0, 3.6, 'eq-sleeve'), circ(0, 0, 1.7, 'eq-hole'));
      return { front: true, el: g, upd(J) { place(g, barbellAt(c, J)); } };
    },
    pts: (c, J) => [[...barbellAt(c, J), (c.r || 15) + 1]],
  },
  barF: {
    make(c) {
      const g = grp('eq'), bar = steel(), sleeves = pth('', 'eq-sleeveS'), plates = pth('', 'eq-plateF'), plates2 = pth('', 'eq-plateF2'), collars = pth('', 'eq-collar');
      g.append(...bar, sleeves, plates, plates2, collars);
      return { front: true, el: g, upd(J) {
        const { A, B, u, e1, e2, ext } = barFEnds(c, J);
        setD(bar, `M${fp(add(A, u, ext - 16))}L${fp(add(B, u, -(ext - 16)))}`);
        sleeves.setAttribute('d', `M${fp(add(A, u, ext - 16))}L${fp(e1)}M${fp(add(B, u, -(ext - 16)))}L${fp(e2)}`);
        const big = c.light ? 7 : 13.5, small = c.light ? 5 : 9.5;
        const pl = (s, at, hh) => rrect(s > 0 ? add(A, u, at) : add(B, u, -at), u, 2.2, hh);
        plates.setAttribute('d', pl(1, ext - 11, big) + pl(-1, ext - 11, big));
        plates2.setAttribute('d', c.light ? '' : pl(1, ext - 6.6, small) + pl(-1, ext - 6.6, small));
        collars.setAttribute('d', pl(1, ext - 14.4, 3.2) + pl(-1, ext - 14.4, 3.2));
      } };
    },
    pts: (c, J) => { const { e1, e2 } = barFEnds(c, J); const r = c.light ? 8 : 14; return [[...e1, r], [...e2, r]]; },
  },
  dumbbell: {
    make(c) {
      const g = grp('eq');
      const parts = [1, 2].map(i => {
        const end = grp(i === 2 && !c.front ? 'eq-far' : ''), prof = grp(i === 2 && !c.front ? 'eq-far' : '');
        end.append(pth(poly(hexPts(6.2, 1.8, -1.5)), 'eq-iron-d'), pth(poly(hexPts(6.2)), 'eq-iron'), pth(poly(hexPts(4.4)), 'eq-iron-in'), pth(arc(5.4, 250, 320), 'eq-hl'));
        const head = x => pth(`M${x - 2.7} -5.6h5.4v11.2h-5.4z`, 'eq-iron') ;
        const facet = x => pth(`M${x - 2.7} -2.8h5.4M${x - 2.7} 2.8h5.4`, 'eq-facet');
        prof.append(pth('M-7.6 0H7.6', 'eq-steel'), pth('M-7.6 -0.5H7.6', 'eq-steel-hi'), head(-10.3), head(10.3), facet(-10.3), facet(10.3), pth('M-7.9 -3.2v6.4M7.9 -3.2v6.4', 'eq-collarS'));
        g.append(end, prof);
        return { end, prof, i };
      });
      return { front: true, el: g, upd(J) {
        for (const pr of parts) {
          const hide = c.only && c.only !== pr.i;
          const A = J['a' + pr.i], useProf = c.neutral || J.F;
          pr.end.style.display = hide || useProf ? 'none' : '';
          pr.prof.style.display = hide || !useProf ? 'none' : '';
          if (hide) continue;
          if (useProf) { const d = dir(A.pf); place(pr.prof, A.grip, angX(c.neutral && !J.F ? [-d[1], d[0]] : [d[1], -d[0]])); }
          else place(pr.end, A.grip);
        }
      } };
    },
    pts: (c, J) => [1, 2].filter(i => !c.only || c.only === i).map(i => [...J['a' + i].grip, 13]),
  },
  kettlebell: {
    make(c) {
      const g = grp('eq');
      g.append(pth('M-5.2 6.4C-6.6 0.4 -4.8 -2.3 0 -2.3C4.8 -2.3 6.6 0.4 5.2 6.4', 'eq-kb-h'),
        pth('M-6.2 20.4C-10.8 17.4 -10.6 9.4 -6.4 6.4C-2.6 3.6 2.6 3.6 6.4 6.4C10.6 9.4 10.8 17.4 6.2 20.4Z', 'eq-iron'),
        pth('M3.6 7.2C6.8 8.6 8.4 11.4 8.1 14.4', 'eq-hl'), pth('M-5.6 20.4H5.6', 'eq-kb-base'));
      return { front: true, el: g, upd(J) { const { p, d } = kbGeom(J, c); place(g, p, Math.atan2(-d[0], d[1]) / RAD); } };
    },
    pts: (c, J) => { const { p, d } = kbGeom(J, c); return [[...add(p, d, 12), 11]]; },
  },
  bench: {
    make(c) {
      const g = grp('eq-static');
      const y = c.y ?? 150, x = c.x ?? 70, w = c.w ?? 90, ft = FLOOR;
      const leg = lx => [pth(`M${lx - 1.7} ${y + 6}h3.4V${ft - 2.6}h-3.4z`, 'eq-frameF'), pth(`M${lx - 9} ${ft - 3.2}h18a1.6 1.6 0 0 1 0 3.2h-18a1.6 1.6 0 0 1 0-3.2z`, 'eq-foot')];
      if (c.ang) {
        const sx = c.seat ?? 28, piv = [x + sx, y];
        const v = [-Math.cos(c.ang * RAD), -Math.sin(c.ang * RAD)], end = add(piv, v, w);
        let n = [-v[1], v[0]]; if (n[1] < 0) n = [-n[0], -n[1]];
        const back = poly([add(piv, v, 2), end, add(end, n, 6.4), add(add(piv, v, 2), n, 6.4)]);
        const mid = add(add(piv, v, w * 0.58), n, 6);
        g.append(pth(`M${f1(mid[0])} ${f1(mid[1])}L${f1(mid[0] - 3)} ${ft - 2}`, 'eq-frame'), pth(`M${piv[0] + 14} ${y + 6}V${ft - 2}`, 'eq-frame'),
          pth(`M${f1(mid[0] - 12)} ${ft - 1.6}H${piv[0] + 30}`, 'eq-frame'),
          pth(back, 'eq-pad'), pth(`M${fp(add(add(piv, v, 4), n, 0.9))}L${fp(add(end, n, 0.9))}`, 'eq-pad-hi'),
          pth(`M${piv[0] + 1} ${y}h30a3 3 0 0 1 3 3v3.2h-33z`, 'eq-pad'), pth(`M${piv[0] + 3} ${y + 0.9}h27`, 'eq-pad-hi'));
      } else {
        g.append(...leg(x + 11), ...leg(x + w - 11), pth(`M${x + 8} ${y + 6}h${w - 16}v3h-${w - 16}z`, 'eq-frameF'),
          pth(`M${x + 2.6} ${y}h${w - 5.2}a2.6 2.6 0 0 1 2.6 2.6v3.6h-${w}v-3.6a2.6 2.6 0 0 1 2.6-2.6z`, 'eq-pad'), pth(`M${x + 3} ${y + 0.9}h${w - 6}`, 'eq-pad-hi'));
      }
      return { front: false, el: g };
    },
    pts: c => { const x = c.x ?? 70, w = c.w ?? 90, y = c.y ?? 150; if (c.ang) { const sx = c.seat ?? 28; return [[x + sx - Math.cos(c.ang * RAD) * w, y - Math.sin(c.ang * RAD) * w, 3], [x + sx + 34, FLOOR, 0]]; } return [[x, y, 1], [x + w, FLOOR, 1]]; },
  },
  box: {
    make(c) {
      const x = c.x, w = c.w ?? 44, hh = c.h ?? 34, y = FLOOR - hh, g = grp('eq-static');
      g.append(pth(`M${x + 2} ${y}h${w - 4}a2 2 0 0 1 2 2V${FLOOR}h-${w}V${y + 2}a2 2 0 0 1 2-2z`, 'eq-box'), pth(`M${x + 1.5} ${y + 1}h${w - 3}`, 'eq-pad-hi'));
      if (w >= 24 && hh >= 20) g.append(pth(`M${x + 4} ${y + 5}h${w - 8}V${FLOOR - 3}h-${w - 8}z`, 'eq-box-in'), pth(`M${x + w / 2 - w * 0.17} ${y + 7}h${w * 0.34}a1.6 1.6 0 0 1 0 3.2h-${w * 0.34}a1.6 1.6 0 0 1 0-3.2z`, 'eq-slot'));
      return { front: false, el: g };
    },
    pts: c => [[c.x, FLOOR - (c.h ?? 34), 1], [c.x + (c.w ?? 44), FLOOR, 1]],
  },
  wall: {
    make(c) { const g = grp('eq-static'); g.append(pth(`M${c.x - 10} 0H${c.x}V${FLOOR}H${c.x - 10}z`, 'eq-wall'), pth(`M${c.x} 0V${FLOOR}`, 'eq-wall-edge')); return { front: false, el: g }; },
    pts: c => [[c.x - 3, FLOOR - 60, 0]],
  },
  mat: {
    make(c) { const x = c.x ?? 40, w = c.w ?? 160, g = grp('eq-static'); g.append(pth(`M${x + 1.4} ${FLOOR - 2.4}h${w - 2.8}a1.4 1.4 0 0 1 1.4 1.4V${FLOOR + 0.8}h-${w}V${FLOOR - 1}a1.4 1.4 0 0 1 1.4-1.4z`, 'eq-mat'), pth(`M${x + 1.6} ${FLOOR - 2}h${w - 3.2}`, 'eq-mat-hi')); return { front: false, el: g }; },
    pts: () => [],
  },
  pullbar: {
    make(c) {
      const g = grp('eq-static'), x = c.x, y = c.y;
      const upright = (ux, top) => [pth(`M${ux - 2} ${top}h4V${FLOOR - 2.6}h-4z`, 'eq-frameF'), pth(`M${ux - 11} ${FLOOR - 3.2}h22a1.6 1.6 0 0 1 0 3.2h-22a1.6 1.6 0 0 1 0-3.2z`, 'eq-foot')];
      if (c.front) g.append(...upright(x - 64, y - 6), ...upright(x + 64, y - 6), ...steel(`M${x - 64} ${y}H${x + 64}`), pth(`M${x - 66} ${y - 3}h4v6h-4zM${x + 62} ${y - 3}h4v6h-4z`, 'eq-frameF'));
      else {
        const dx = c.dx ?? 36, ux = x + dx;
        g.append(...upright(ux, y - 7), pth(`M${x} ${y}L${ux} ${y}`, 'eq-frame'), circ(x, y, 3, 'eq-barEnd'), circ(x, y, 1.2, 'eq-hole'));
      }
      return { front: false, el: g };
    },
    pts: c => c.front ? [[c.x - 66, c.y, 5], [c.x + 66, c.y, 5]] : [[c.x, c.y, 6]],
  },
  dipbar: {
    make(c) { const g = grp('eq-static'); g.append(pth(`M${c.x} ${c.y}L${c.x + 4} ${FLOOR - 2}`, 'eq-frame'), pth(`M${c.x - 12} ${FLOOR - 3.2}h30a1.6 1.6 0 0 1 0 3.2h-30a1.6 1.6 0 0 1 0-3.2z`, 'eq-foot'), circ(c.x, c.y, 3.6, 'eq-barEnd'), circ(c.x, c.y, 1.4, 'eq-hole')); return { front: false, el: g }; },
    pts: c => [[c.x, c.y, 6]],
  },
  cable: {
    make(c) {
      const tx = c.x, py = c.y, sd = c.side ?? 1, cx = tx + sd * 7, top = Math.min(py, 24) - 8;
      const bg = grp('eq-static');
      bg.append(pth(`M${cx - 4.5} ${top}h9V${FLOOR - 2.6}h-9z`, 'eq-frameF'), pth(`M${cx - 12} ${FLOOR - 3.2}h24a1.6 1.6 0 0 1 0 3.2h-24a1.6 1.6 0 0 1 0-3.2z`, 'eq-foot'));
      let st = ''; for (let k = 0; k < 9; k++) st += `M${cx - 3.4} ${FLOOR - 8 - k * 3.6}h6.8v2.8h-6.8z`;
      bg.append(pth(st, 'eq-stack'), pth(`M${cx} ${top + 6}V${FLOOR - 40}`, 'eq-cable'));
      const g = grp('eq'), cab = pth('', 'eq-cable'), hnd = pth('', c.rope ? 'eq-rope2' : 'eq-handle'), knobs = pth('', 'eq-knob');
      g.append(circ(tx, py, 4.2, 'eq-pulley'), circ(tx, py, 1.5, 'eq-hole'), cab, hnd, knobs);
      return { front: true, el: g, bg, upd(J) {
        const q = cableEnd(c, J), v = unit(sub(q, [tx, py])), n = [-v[1], v[0]];
        const start = add([tx, py], n, c.attach === 'ankle' ? 0 : 0);
        cab.setAttribute('d', `M${fp(start)}L${fp(q)}`);
        if (c.rope) {
          const a = add(add(q, n, 4.5), v, 7), b = add(add(q, n, -4.5), v, 7);
          hnd.setAttribute('d', `M${fp(add(q, v, -2))}L${fp(a)}M${fp(add(q, v, -2))}L${fp(b)}`);
          knobs.setAttribute('d', capsule(a, add(a, v, 0.1), 1.6) + capsule(b, add(b, v, 0.1), 1.6));
        } else if (c.attach === 'ankle') {
          hnd.setAttribute('d', ''); knobs.setAttribute('d', capsule(add(q, n, 3.6), add(q, n, -3.6), 1.9));
        } else {
          hnd.setAttribute('d', `M${fp(add(q, v, -4))}L${fp(add(add(q, n, 4.6), v, 1))}L${fp(add(add(q, n, -4.6), v, 1))}Z`); knobs.setAttribute('d', '');
        }
      } };
    },
    pts: c => [[c.x, c.y, 6]],
  },
  band: {
    make(c) {
      const g = grp('eq'), b = pth('', 'eq-band'), hi = pth('', 'eq-band-hi');
      g.append(b, hi);
      return { front: !c.back, el: g, upd(J) {
        let d = '';
        for (const [a, p] of bandEnds(c, J)) {
          const m = lerpP(a, p, 0.5), Ln = Math.hypot(p[0] - a[0], p[1] - a[1]);
          const sag = c.legs ? 0 : Math.min(3, Ln * 0.03);
          d += `M${fp(a)}Q${fp([m[0], m[1] + sag])} ${fp(p)}`;
        }
        b.setAttribute('d', d); hi.setAttribute('d', d);
      } };
    },
    pts: (c, J) => bandEnds(c, J).flat().map(p => [...p, 2]),
  },
  seat: {
    make(c) {
      const g = grp('eq-static'), x = c.x, y = c.y, w = c.w ?? 34;
      g.append(pth(`M${x + w / 2 - 1.8} ${y + 5}h3.6V${FLOOR - 2.6}h-3.6z`, 'eq-frameF'), pth(`M${x + w / 2 - 14} ${FLOOR - 3.2}h28a1.6 1.6 0 0 1 0 3.2h-28a1.6 1.6 0 0 1 0-3.2z`, 'eq-foot'));
      if (c.back) {
        const a = (c.backAng ?? 8) * RAD, bx = x + (c.backX ?? 0), b0 = [bx, y - 2], v = [-Math.sin(a), -Math.cos(a)], b1 = add(b0, v, c.back), n = [-v[1], v[0]];
        g.append(pth(`M${fp(add(b0, n, 1))}L${fp(b0)}L${fp(add(b0, [0, 6], 1))}`, 'eq-frame'), pth(poly([add(b0, n, 0), add(b1, n, 0), add(b1, n, -6), add(b0, n, -6)]), 'eq-pad'));
      }
      g.append(pth(`M${x + 2.4} ${y}h${w - 4.8}a2.4 2.4 0 0 1 2.4 2.4V${y + 5.6}h-${w}V${y + 2.4}a2.4 2.4 0 0 1 2.4-2.4z`, 'eq-pad'), pth(`M${x + 3} ${y + 0.9}h${w - 6}`, 'eq-pad-hi'));
      return { front: false, el: g };
    },
    pts: c => [[c.x, c.y - (c.back || 0), 1], [c.x + (c.w ?? 34), FLOOR, 0]],
  },
  pad: {
    make(c) {
      const g = grp('eq'), arm = pth('', 'eq-frame'), roll = circ(0, 0, c.r || 4.6, 'eq-roll'), ring = circ(0, 0, (c.r || 4.6) * 0.45, 'eq-roll-in');
      g.append(arm, circ(c.px, c.py, 3.2, 'eq-pulley'), roll, ring);
      return { front: true, el: g, upd(J) {
        const L = J.l1, d = unit(sub(L.a, L.k)), p = add(L.a, [d[1], -d[0]], c.side ?? 6);
        [roll, ring].forEach(e => { e.setAttribute('cx', f1(p[0])); e.setAttribute('cy', f1(p[1])); });
        arm.setAttribute('d', `M${c.px} ${c.py}L${fp(p)}`);
      } };
    },
    pts: c => [[c.px, c.py, 4]],
  },
  legpress: {
    make(c) {
      const g = grp('eq'), rail = pth('', 'eq-frame'), plate = pth('', 'eq-pad'), seat = pth(c.seat, 'eq-padS');
      g.append(rail, seat, plate);
      return { front: true, el: g, upd(J) {
        const L = J.l1, u = unit(sub(L.toe, L.heel)), n = [-u[1], u[0]];
        const a = add(add(L.heel, u, -7), n, 2.4), b = add(add(L.toe, u, 7), n, 2.4);
        plate.setAttribute('d', poly([a, b, add(b, n, 4.4), add(a, n, 4.4)]));
        const m = lerpP(a, b, 0.5), q = add(m, n, 4.4);
        rail.setAttribute('d', `M${fp(q)}L${f1(q[0] + (FLOOR - q[1]) * 0.9)} ${FLOOR - 1}M${f1(q[0] + 10)} ${f1(q[1] + 10)}L${f1(q[0] + 60)} ${f1(q[1] - 40)}`);
      } };
    },
    pts: (c, J) => [[...J.l1.toe, 10], [...J.l1.heel, 8]],
  },
  rower: {
    make() {
      const g = grp('eq');
      g.append(pth(`M32 ${FLOOR - 16}H198v4H32z`, 'eq-frameF'), pth(`M40 ${FLOOR - 12}V${FLOOR - 1}M188 ${FLOOR - 12}V${FLOOR - 1}`, 'eq-frame'),
        circ(205, FLOOR - 26, 14, 'eq-plate'), circ(205, FLOOR - 26, 10, 'eq-plate-in'), circ(205, FLOOR - 26, 2.6, 'eq-sleeve'), pth(arc(13, 250, 320), 'eq-hl'),
        pth(`M196 ${FLOOR - 38}L186 ${FLOOR - 66}`, 'eq-frame'), pth(`M180 ${FLOOR - 72}h12v8h-12z`, 'eq-box'));
      const seat = pth('', 'eq-pad'), chain = pth('', 'eq-cable'), hnd = pth('', 'eq-handle');
      g.append(seat, chain, hnd);
      return { front: false, el: g, upd(J) {
        const sx = J.hip[0] - 12;
        seat.setAttribute('d', `M${f1(sx)} ${FLOOR - 21}h22a2 2 0 0 1 2 2v3h-26v-3a2 2 0 0 1 2-2z`);
        const p = J.a1.grip; chain.setAttribute('d', `M205 ${FLOOR - 30}L${fp(p)}`);
        hnd.setAttribute('d', capsule([p[0], p[1] - 0.1], [p[0], p[1] + 0.1], 2.4));
      } };
    },
    pts: () => [[32, FLOOR - 16, 0], [219, FLOOR - 40, 0]],
  },
  rope: {
    make() {
      const g = grp('eq'), r = pth('', 'eq-jrope'), hd = pth('', 'eq-knob');
      g.append(r, hd);
      return { front: true, el: g, upd(J) {
        const p = J.a1.grip, ctr = [J.hip[0] + 4, J.hip[1] - 4], a = J.p.rp * RAD, R = 86;
        const q = [ctr[0] + Math.sin(a) * R * 0.55, ctr[1] + Math.cos(a) * R];
        const ctrl = [q[0] + Math.sin(a) * 10, q[1] + Math.cos(a) * 6];
        r.setAttribute('d', `M${fp(p)}Q${fp(ctrl)} ${fp(q)}`);
        const fd = dir(J.a1.pf);
        hd.setAttribute('d', capsule(add(p, fd, -3), add(p, fd, 3), 1.5));
      } };
    },
    pts: J => [],
  },
  pulldown: {
    make(c) {
      const g = grp('eq'), bar = steel(), grips = pth('', 'eq-grip'), cab = pth('', 'eq-cable');
      g.append(pth(`M${c.x - 70} 10h140v5h-140z`, 'eq-frameF'), circ(c.x, 18, 4.2, 'eq-pulley'), circ(c.x, 18, 1.5, 'eq-hole'), cab, ...bar, grips);
      return { front: true, el: g, upd(J) {
        const A = J.a1.grip, B = J.a2.grip, m = lerpP(A, B, 0.5);
        const a = [A[0] + 10, A[1] + 3.5], b = [B[0] - 10, B[1] + 3.5];
        setD(bar, `M${fp(a)}Q${fp([m[0], m[1] - 5])} ${fp(b)}`);
        grips.setAttribute('d', capsule([A[0] - 3.5, A[1] + 0.6], [A[0] + 4.5, A[1] + 2.2], 1.6) + capsule([B[0] + 3.5, B[1] + 0.6], [B[0] - 4.5, B[1] + 2.2], 1.6));
        cab.setAttribute('d', `M${c.x} 18L${fp([m[0], m[1] - 2.5])}`);
      } };
    },
    pts: (c, J) => [[c.x - 20, 10, 2], [J.a1.grip[0] + 12, J.a1.grip[1], 3], [J.a2.grip[0] - 12, J.a2.grip[1], 3]],
  },
  crossover: {
    make(c) {
      const bg = grp('eq-static');
      for (const x of [22, 218]) bg.append(pth(`M${x - 4.5} 14h9V${FLOOR - 2.6}h-9z`, 'eq-frameF'), pth(`M${x - 11} ${FLOOR - 3.2}h22a1.6 1.6 0 0 1 0 3.2h-22a1.6 1.6 0 0 1 0-3.2z`, 'eq-foot'));
      const g = grp('eq'), L = pth('', 'eq-cable'), R = pth('', 'eq-cable'), hd = pth('', 'eq-handle');
      g.append(circ(26, c.y, 4.2, 'eq-pulley'), circ(214, c.y, 4.2, 'eq-pulley'), L, R, hd);
      return { front: true, el: g, bg, upd(J) {
        const r = J.a1.grip, l = J.a2.grip;
        R.setAttribute('d', `M214 ${c.y}L${fp(r)}`); L.setAttribute('d', `M26 ${c.y}L${fp(l)}`);
        const tri = (q, from) => { const v = unit(sub(q, from)), n = [-v[1], v[0]]; return `M${fp(add(q, v, -4))}L${fp(add(add(q, n, 4.2), v, 1))}L${fp(add(add(q, n, -4.2), v, 1))}Z`; };
        hd.setAttribute('d', tri(r, [214, c.y]) + tri(l, [26, c.y]));
      } };
    },
    pts: c => [[26, c.y, 6], [214, c.y, 6]],
  },
  lever: {
    make(c) {
      const g = grp('eq'), arm = pth('', 'eq-lever'), hd = pth('', 'eq-grip');
      g.append(circ(c.px, c.py, 4, 'eq-pulley'), arm, hd);
      return { front: !!c.front, el: g, upd(J) {
        const p = J.a1.grip; arm.setAttribute('d', `M${c.px} ${c.py}L${fp(p)}`);
        hd.setAttribute('d', capsule([p[0], p[1] - 4], [p[0], p[1] + 4], 2));
      } };
    },
    pts: c => [[c.px, c.py, 5]],
  },
  path: {
    make(c) { return { front: !!c.front, el: pth(c.d, c.cls === 'eq-pad' ? 'eq-padS' : c.cls || 'eq-frame') }; },
    pts: () => [],
  },
  wheel: {
    make() {
      const g = grp('eq');
      g.append(circ(0, 0, 7, 'eq-wheel'), circ(0, 0, 4.2, 'eq-plate-in'), circ(0, 0, 1.8, 'eq-sleeve'));
      return { front: true, el: g, upd(J) { place(g, [J.a1.grip[0] + 2, FLOOR - 7]); } };
    },
    pts: J => [],
  },
};
