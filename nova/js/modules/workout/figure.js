// Egzersiz figürü motoru: parametrik 2B insan figürü (eklem açıları + kök konumu),
// iki kemikli ters kinematik (IK), anahtar kare animasyonu, ekipman çizimi ve kas haritası.
// Tüm görseller kodla üretilir; harici görsel yoktur.
import { svg, h, icon } from '../../core/ui.js';

// ---------- Ölçüler (viewBox 240x200 birimi) ----------
export const S = { headR: 8.5, neck: 5, torso: 44, upper: 26, fore: 23, hand: 5, thigh: 37, shin: 36, heel: 4, toe: 12, ankleH: 4, SW: 13, HW: 8 };
export const FLOOR = 186;
export const HIP_Y = FLOOR - S.ankleH - S.shin - S.thigh; // 109
export const ANK = FLOOR - S.ankleH; // 182
const VW = 240, VH = 200;

const RAD = Math.PI / 180;
const dir = a => [Math.sin(a * RAD), Math.cos(a * RAD)]; // 0 = aşağı, +90 = ileri (sağ)
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const lerp = (a, b, e) => a + (b - a) * e;
const lerpP = (a, b, e) => [lerp(a[0], b[0], e), lerp(a[1], b[1], e)];
const angOf = v => Math.atan2(v[0], v[1]) / RAD;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const f1 = n => (Math.round(n * 10) / 10);
const fp = p => f1(p[0]) + ' ' + f1(p[1]);
function wrapNear(v, ref) { while (v - ref > 180) v -= 360; while (v - ref < -180) v += 360; return v; }

const DEF = { view: 'side', r: [120, HIP_Y], t: 0, n: 0, cv: 0, rot: 0, sh: 0, a1: [0, 8], a2: [0, 8], l1: [0, 0, 0], l2: [0, 0, 0], ls: [1, 1], as: [1, 1], rp: 0 };

function clean(o) { for (const k in o) if (o[k] == null) delete o[k]; return o; }
export function mergePose(base = {}, over = {}, view = 'side') {
  const p = { ...DEF, view, ...base, ...over };
  p.ik = clean({ ...(base.ik || {}), ...(over.ik || {}) });
  p.fa = clean({ ...(base.fa || {}), ...(over.fa || {}) });
  p.bend = clean({ ...(base.bend || {}), ...(over.bend || {}) });
  if (over.anc === null) delete p.anc;
  return p;
}

// ---------- Kinematik ----------
function ik2(P, T, L1, L2, bend, mx) {
  const px = P[0] * mx, tx = T[0] * mx;
  const dx = tx - px, dy = T[1] - P[1];
  const d = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / d, uy = dy / d;
  const dd = clampN(d, Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.001);
  const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd);
  const hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const nx = uy, ny = -ux;
  return {
    mid: [(px + ux * a + nx * hh * bend) * mx, P[1] + uy * a + ny * hh * bend],
    end: [(px + ux * dd) * mx, P[1] + uy * dd],
  };
}

function extremities(J) {
  for (const i of [1, 2]) {
    const A = J['a' + i];
    const fd = dir(A.pf);
    A.hand = add(A.w, fd, S.hand);
    A.grip = add(A.w, fd, S.hand * 0.55);
    const L = J['l' + i];
    if (J.F) {
      L.heel = [L.a[0], L.a[1] + S.ankleH];
      L.toe = [L.a[0] + L.mx * 3, L.a[1] + S.ankleH];
    } else {
      const d = dir(L.pft), dn = [-d[1], d[0]];
      L.heel = add(add(L.a, d, -S.heel), dn, S.ankleH);
      L.toe = add(add(L.a, d, S.toe), dn, S.ankleH * 0.7);
    }
  }
}

function pointByName(J, n) {
  const i = n.slice(-1), k = n.slice(0, -1);
  if (n === 'hip') return J.hip;
  if (n === 'sh') return J.sh;
  if (n === 'head') return J.head;
  const map = { toe: ['l', 'toe'], heel: ['l', 'heel'], ank: ['l', 'a'], knee: ['l', 'k'], hand: ['a', 'hand'], wrist: ['a', 'w'], elb: ['a', 'e'], grip: ['a', 'grip'] };
  const m = map[k];
  return m ? J[m[0] + i][m[1]] : J.hip;
}

function allPoints(J) {
  const set = new Set([J.hip, J.sh, J.neckTop, J.head, J.sh1, J.sh2, J.hp1, J.hp2]);
  for (const i of [1, 2]) {
    const A = J['a' + i], L = J['l' + i];
    [A.o, A.e, A.w, A.hand, A.grip, L.o, L.k, L.a, L.heel, L.toe].forEach(p => set.add(p));
  }
  return set;
}

/** Bir pozu eklem konumlarına çevirir */
export function solve(p) {
  const F = p.view === 'front';
  const rho = F ? (p.rot || 0) : 0;
  const tE = p.t + rho;
  const hip = [p.r[0], p.r[1]];
  const td = [Math.sin(tE * RAD), -Math.cos(tE * RAD)];
  const sh = add(hip, td, S.torso);
  const hA = tE + p.n;
  const hd = [Math.sin(hA * RAD), -Math.cos(hA * RAD)];
  const J = { F, p, tE, rho, hip, sh, td, hA, neckTop: add(sh, hd, S.neck), head: add(sh, hd, S.neck + S.headR) };
  const as = p.as || [1, 1], ls = p.ls || [1, 1];
  J.L = { LU: S.upper * as[0], LF: S.fore * as[1], LT: S.thigh * ls[0], LS: S.shin * ls[1] };
  if (F) {
    const perp = [Math.cos(tE * RAD), Math.sin(tE * RAD)];
    const pp = [Math.cos(rho * RAD), Math.sin(rho * RAD)];
    J.perp = perp; J.pp = pp;
    J.sh1 = add(add(sh, perp, S.SW), td, p.sh); J.sh2 = add(add(sh, perp, -S.SW), td, p.sh);
    J.hp1 = add(hip, pp, S.HW); J.hp2 = add(hip, pp, -S.HW);
  } else {
    J.sh1 = sh; J.sh2 = sh; J.hp1 = hip; J.hp2 = hip;
  }
  for (const i of [1, 2]) {
    const mx = F && i === 2 ? -1 : 1;
    const [s, e] = p['a' + i];
    const pu = F ? mx * s - tE : s - tE;
    const pf = pu + (F ? mx * e : e);
    const o = J['sh' + i];
    const el = add(o, dir(pu), J.L.LU), w = add(el, dir(pf), J.L.LF);
    J['a' + i] = { o, e: el, w, pu, pf, mx };
    const [hh, k, a] = p['l' + i];
    const pt = F ? mx * hh - rho : hh - tE;
    const ps = pt - (F ? mx * k : k);
    const pft = ps + 90 - (a || 0);
    const ho = J['hp' + i];
    const kn = add(ho, dir(pt), J.L.LT), an = add(kn, dir(ps), J.L.LS);
    J['l' + i] = { o: ho, k: kn, a: an, pt, ps, pft, mx };
  }
  extremities(J);
  if (p.anc) {
    const q = pointByName(J, p.anc[0]);
    const dx = p.anc[1] - q[0], dy = p.anc[2] - q[1];
    for (const pt of allPoints(J)) { pt[0] += dx; pt[1] += dy; }
  }
  if (p.ik) {
    for (const key of Object.keys(p.ik)) {
      const T = p.ik[key];
      const isArm = key[0] === 'h';
      const i = key[1];
      const limb = J[(isArm ? 'a' : 'l') + i];
      const L1 = isArm ? J.L.LU : J.L.LT, L2 = isArm ? J.L.LF : J.L.LS;
      const bend = p.bend?.[key] ?? (isArm ? -1 : 1);
      const r = ik2(limb.o, T, L1, L2, bend, limb.mx);
      if (isArm) {
        limb.e = r.mid; limb.w = r.end;
        limb.pu = angOf(sub(r.mid, limb.o)); limb.pf = angOf(sub(r.end, r.mid));
      } else {
        limb.k = r.mid; limb.a = r.end;
        limb.pt = angOf(sub(r.mid, limb.o)); limb.ps = angOf(sub(r.end, r.mid));
        limb.pft = p.fa?.[key] ?? 90;
      }
    }
    extremities(J);
  }
  return J;
}

/** IK ve çapa sonuçlarını açılara/köke "pişirir" ki kareler arasında yumuşak geçiş olsun */
function bake(p) {
  const J = solve(p);
  const out = { ...p, r: J.hip.slice(), a1: p.a1.slice(), a2: p.a2.slice(), l1: p.l1.slice(), l2: p.l2.slice(), fa: { ...p.fa } };
  for (const i of [1, 2]) {
    const A = J['a' + i], mx = A.mx;
    if (p.ik['h' + i]) {
      let s, e;
      if (J.F) { s = mx * (A.pu + J.tE); e = mx * (A.pf - A.pu); } else { s = A.pu + J.tE; e = A.pf - A.pu; }
      out['a' + i] = [wrapNear(s, p['a' + i][0]), wrapNear(e, 0)];
    }
    const L = J['l' + i];
    if (p.ik['f' + i]) {
      let hh, k, a;
      if (J.F) { hh = mx * (L.pt + J.rho); k = mx * (L.pt - L.ps); a = p['l' + i][2]; }
      else { hh = L.pt + J.tE; k = L.pt - L.ps; a = L.ps + 90 - L.pft; }
      out['l' + i] = [wrapNear(hh, p['l' + i][0]), wrapNear(k, 0), wrapNear(a, 0)];
      out.fa['f' + i] = L.pft;
    }
  }
  return out;
}

function blend(A, B, e) {
  const L2 = (x, y) => x.map((v, i) => lerp(v, y[i] ?? v, e));
  const C = {
    view: A.view, r: lerpP(A.r, B.r, e), t: lerp(A.t, B.t, e), n: lerp(A.n, B.n, e), cv: lerp(A.cv, B.cv, e),
    rot: lerp(A.rot, B.rot, e), sh: lerp(A.sh, B.sh, e), rp: lerp(A.rp, B.rp, e),
    a1: L2(A.a1, B.a1), a2: L2(A.a2, B.a2), l1: L2(A.l1, B.l1), l2: L2(A.l2, B.l2), ls: L2(A.ls, B.ls), as: L2(A.as, B.as),
    ik: {}, fa: {}, bend: { ...A.bend, ...B.bend },
  };
  for (const k in A.ik) if (B.ik[k]) {
    C.ik[k] = lerpP(A.ik[k], B.ik[k], e);
    if (k[0] === 'f') C.fa[k] = lerp(A.fa[k] ?? 90, B.fa[k] ?? 90, e);
  }
  if (A.anc && B.anc && A.anc[0] === B.anc[0]) C.anc = [A.anc[0], lerp(A.anc[1], B.anc[1], e), lerp(A.anc[2], B.anc[2], e)];
  return C;
}

const EASE = {
  sine: x => 0.5 - 0.5 * Math.cos(Math.PI * x),
  lin: x => x,
  out: x => 1 - (1 - x) * (1 - x),
  in: x => x * x,
};

const compiled = new WeakMap();
/** anim: { view, base, props, phases, frames:[{p, d, hold, ph, ease}] } */
export function compile(anim) {
  if (compiled.has(anim)) return compiled.get(anim);
  const view = anim.view || 'side';
  const frames = anim.frames.map(f => ({ ...f, P: bake(mergePose(anim.base, f.p, view)) }));
  const segs = [];
  const n = frames.length;
  const same = JSON.stringify(frames[0].P) === JSON.stringify(frames[n - 1].P);
  frames.forEach((f, i) => {
    if (f.hold) segs.push({ a: i, b: i, len: f.hold, ph: f.ph ?? 0 });
    const j = (i + 1) % n;
    if (n === 1) return;
    let len = frames[j].d ?? 900;
    if (j === 0 && same) len = 0;
    if (len > 0) segs.push({ a: i, b: j, len, ph: frames[j].ph ?? 0, ease: EASE[frames[j].ease || 'sine'] });
  });
  if (!segs.length) segs.push({ a: 0, b: 0, len: 1000, ph: frames[0].ph ?? 0 });
  const total = segs.reduce((s, x) => s + x.len, 0);
  const c = { frames, segs, total, view };
  compiled.set(anim, c);
  return c;
}

export function poseAt(anim, ms) {
  const c = compile(anim);
  let t = ((ms % c.total) + c.total) % c.total;
  for (const s of c.segs) {
    if (t <= s.len) {
      const A = c.frames[s.a].P;
      if (s.a === s.b) return { pose: A, phase: s.ph };
      return { pose: blend(A, c.frames[s.b].P, s.ease(t / s.len)), phase: s.ph };
    }
    t -= s.len;
  }
  const last = c.segs[c.segs.length - 1];
  return { pose: c.frames[last.b].P, phase: last.ph };
}

/** Kare başlangıç zamanı (ms) — kare i'ye varılan an */
export function frameTime(anim, i) {
  const c = compile(anim);
  let t = 0;
  for (const s of c.segs) { if (s.a === i && s.b === i) return t; if (s.b === i && s.a !== i) { t += s.len; return t; } t += s.len; }
  return 0;
}

// ---------- Şekil yardımcıları ----------
function smoothClosed(pts) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = 'M' + fp(mid(pts[n - 1], pts[0]));
  for (let i = 0; i < n; i++) d += 'Q' + fp(pts[i]) + ' ' + fp(mid(pts[i], pts[(i + 1) % n]));
  return d + 'Z';
}

/** Profil tabanlı uzuv: prof = [[t, ön, arka], ...], nSign: ön yön işareti, curve: omurga eğriliği */
function profilePath(A, B, prof, nSign = 1, curve = 0) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = uy * nSign, ny = -ux * nSign;
  const P = (t, o) => { const c = curve ? -curve * 7 * Math.sin(Math.PI * clampN(t, 0, 1)) : 0; return [A[0] + ux * L * t + nx * (o + c), A[1] + uy * L * t + ny * (o + c)]; };
  const fr = prof.map(([t, f]) => P(t, f));
  const bk = prof.slice().reverse().map(([t, , b]) => P(t, -b));
  const t0 = prof[0], t1 = prof[prof.length - 1];
  const capE = P(t1[0] + ((t1[1] + t1[2]) / 2) / L * 0.85, (t1[1] - t1[2]) / 2);
  const capS = P(t0[0] - ((t0[1] + t0[2]) / 2) / L * 0.85, (t0[1] - t0[2]) / 2);
  return smoothClosed([...fr, capE, ...bk, capS]);
}

function capsule(A, B, r1, r2 = r1) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy) || 0.001;
  const nx = dy / L, ny = -dx / L;
  const a1 = [A[0] + nx * r1, A[1] + ny * r1], a2 = [A[0] - nx * r1, A[1] - ny * r1];
  const b1 = [B[0] + nx * r2, B[1] + ny * r2], b2 = [B[0] - nx * r2, B[1] - ny * r2];
  return `M${fp(a1)}L${fp(b1)}A${f1(r2)} ${f1(r2)} 0 0 1 ${fp(b2)}L${fp(a2)}A${f1(r1)} ${f1(r1)} 0 0 1 ${fp(a1)}Z`;
}

// Yan görünüm profilleri
const PROF = {
  torso: [[-0.03, 8, 10], [0.1, 8.8, 11.5], [0.3, 8, 8.4], [0.55, 9.2, 8.6], [0.76, 11, 9.8], [0.94, 8, 9.4], [1.02, 5, 6]],
  thigh: [[0, 8, 8.6], [0.35, 8.2, 7.6], [0.8, 5.8, 5.3], [1, 4.8, 4.8]],
  shin: [[0, 4.8, 4.8], [0.3, 4.2, 6], [0.75, 3, 3.4], [1, 2.8, 2.8]],
  upper: [[0, 5.6, 5.6], [0.4, 5, 5.4], [1, 3.7, 3.7]],
  fore: [[0, 3.9, 3.9], [0.3, 4.1, 4.1], [1, 2.7, 2.7]],
};
const PROF_F = {
  thigh: [[0, 8.4, 6.4], [0.4, 7.2, 5.6], [0.85, 5, 4.6], [1, 4.6, 4.6]],
  shin: [[0, 4.6, 4.6], [0.3, 5.4, 4.6], [0.8, 3.2, 3], [1, 2.8, 2.8]],
  upper: [[0, 5.8, 5.2], [0.45, 5, 4.8], [1, 3.6, 3.6]],
  fore: [[0, 3.9, 3.9], [0.3, 4.1, 4.1], [1, 2.7, 2.7]],
};

// ---------- Kas yerleşimi (figür üzerinde) ----------
const MUS_SIDE = {
  chest: [['torso', 0.78, 7, 7, 4.4]],
  abs: [['torso', 0.4, 5.4, 10, 3.2]],
  obliques: [['torso', 0.42, 0.5, 9, 4.6]],
  lats: [['torso', 0.64, -4.6, 10, 4.4]],
  upperBack: [['torso', 0.85, -6, 6, 4]],
  traps: [['torso', 1.0, -4, 5, 3.2]],
  lowerBack: [['torso', 0.27, -6, 7, 3]],
  glutes: [['torso', 0.06, -7.8, 7, 5.4]],
  hipflex: [['thigh', 0.1, 3.8, 5, 3]],
  shoulders: [['upper', 0.1, 0, 6.6, 6]],
  biceps: [['upper', 0.52, 2.3, 8, 3]],
  triceps: [['upper', 0.5, -2.6, 8, 3]],
  forearms: [['fore', 0.35, 0, 6.5, 3]],
  quads: [['thigh', 0.45, 3.2, 12, 4]],
  hamstrings: [['thigh', 0.5, -3.4, 11, 3.8]],
  adductors: [['thigh', 0.3, 0, 8, 2.6]],
  calves: [['shin', 0.3, -3, 7, 3]],
};
const MUS_FRONT = {
  chest: [['torso', 0.78, 6.5, 4.6, 6, true]],
  abs: [['torso', 0.42, 0, 11, 4.4]],
  obliques: [['torso', 0.45, 9, 8, 2.4, true]],
  lats: [['torso', 0.66, 10.5, 9, 2.6, true]],
  traps: [['torso', 1.0, 6, 2.6, 4, true]],
  upperBack: [['torso', 0.88, 8.5, 3, 3.5, true]],
  glutes: [['torso', 0.02, 9.5, 4, 4.4, true]],
  shoulders: [['upper', 0.08, 0, 6.4, 6.2]],
  biceps: [['upper', 0.5, 0, 8, 3.2]],
  triceps: [['upper', 0.5, 0, 8, 3]],
  forearms: [['fore', 0.35, 0, 6.5, 3]],
  quads: [['thigh', 0.45, 0.8, 12, 4.4]],
  adductors: [['thigh', 0.3, -3, 8, 2.4]],
  hamstrings: [['thigh', 0.55, 0, 10, 3]],
  calves: [['shin', 0.3, 1.8, 7, 2.8]],
  hipflex: [['thigh', 0.1, -1, 4, 3]],
};

// ---------- Ekipman ----------
const PROPS = {
  barbell(c) { // yan görünüm: plaka uçtan
    const g = svg('g', { class: 'eq' });
    const r = c.r || 15;
    const plate = svg('circle', { r, class: 'eq-plate' });
    const inner = svg('circle', { r: r * 0.42, class: 'eq-ring' });
    const hub = svg('circle', { r: 2.4, class: 'eq-hub' });
    g.append(plate, inner, hub);
    return { front: true, el: g, upd(J) { const p = c.at === 'back' ? add(add(J.sh, J.td, -4), [Math.cos(J.tE * RAD), Math.sin(J.tE * RAD)], -7) : J.a1.grip; [plate, inner, hub].forEach(e => { e.setAttribute('cx', f1(p[0])); e.setAttribute('cy', f1(p[1])); }); } };
  },
  barF(c) { // ön görünüm: yatay bar + plakalar
    const g = svg('g', { class: 'eq' });
    const bar = svg('path', { class: 'eq-bar' }), pl = svg('path', { class: 'eq-plateF' });
    g.append(bar, pl);
    const ext = c.ext || 30, thin = c.light;
    return { front: true, el: g, upd(J) {
      let A = J.a1.grip, B = J.a2.grip;
      if (c.at === 'back') { A = add(J.sh1, J.td, 2); B = add(J.sh2, J.td, 2); }
      const dx = A[0] - B[0], dy = A[1] - B[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const e1 = [A[0] + ux * ext, A[1] + uy * ext], e2 = [B[0] - ux * ext, B[1] - uy * ext];
      bar.setAttribute('d', `M${fp(e1)}L${fp(e2)}`);
      const ph = thin ? 7 : 13, pw = thin ? 3 : 4.5;
      const plate = (p, s) => { const q = [p[0] - ux * s * 6, p[1] - uy * s * 6]; return `M${fp([q[0] - uy * ph, q[1] + ux * ph])}L${fp([q[0] + uy * ph, q[1] - ux * ph])}`; };
      pl.setAttribute('d', plate(e1, 1) + plate(e2, -1));
      pl.setAttribute('stroke-width', pw * 2);
    } };
  },
  dumbbell(c) { // her iki ele; yan görünümde 3/4 perspektif
    const g = svg('g', { class: 'eq' });
    const parts = [1, 2].map(i => {
      const gg = svg('g', { class: i === 2 && !c.front ? 'eq-far' : '' });
      const handle = svg('path', { class: 'eq-bar' }), h1 = svg('path', { class: 'eq-head' }), h2 = svg('path', { class: 'eq-head' });
      gg.append(handle, h1, h2); g.append(gg);
      return { handle, h1, h2, i };
    });
    return { front: true, el: g, upd(J) {
      for (const pr of parts) {
        if (c.only && c.only !== pr.i) { pr.handle.setAttribute('d', ''); pr.h1.setAttribute('d', ''); pr.h2.setAttribute('d', ''); continue; }
        const A = J['a' + pr.i];
        const p = A.grip;
        let ax;
        if (c.neutral) { const d = dir(A.pf); ax = [-d[1], d[0]]; } // ön koluna dik (çekiç tutuş)
        else if (J.F) { const d = dir(A.pf); ax = [d[1], -d[0]]; }
        else ax = [0.82, -0.57];
        const hl = c.neutral || J.F ? 7.5 : 5.5;
        const e1 = add(p, ax, hl), e2 = add(p, ax, -hl);
        pr.handle.setAttribute('d', `M${fp(e1)}L${fp(e2)}`);
        const hw = 5.2, hh = 3;
        const head = q => { const a = add(q, ax, -hh / 2), b = add(q, ax, hh / 2); const nx = [-ax[1] * hw, ax[0] * hw]; return `M${fp(add(a, nx))}L${fp(add(b, nx))}L${fp(add(b, nx, -1))}L${fp(add(a, nx, -1))}Z`; };
        pr.h1.setAttribute('d', head(add(p, ax, hl + 1)));
        pr.h2.setAttribute('d', head(add(p, ax, -hl - 1)));
      }
    } };
  },
  kettlebell(c) {
    const g = svg('g', { class: 'eq' });
    const bell = svg('circle', { r: 8.5, class: 'eq-head' }), hnd = svg('path', { class: 'eq-handle' });
    g.append(hnd, bell);
    return { front: true, el: g, upd(J) {
      const A = J.a1;
      const p = J.F ? lerpP(J.a1.grip, J.a2.grip, 0.5) : A.grip;
      const d = c.hang ? [0, 1] : dir(A.pf);
      const ctr = add(p, d, 11);
      bell.setAttribute('cx', f1(ctr[0])); bell.setAttribute('cy', f1(ctr[1]));
      const nx = [-d[1], d[0]];
      const s1 = add(add(p, d, 4), nx, 5), s2 = add(add(p, d, 4), nx, -5);
      hnd.setAttribute('d', `M${fp(s1)}Q${fp(add(p, d, -4))} ${fp(s2)}`);
    } };
  },
  bench(c) { // düz/eğimli sehpa. x: başlangıç, w: uzunluk, y: üst yüzey, ang: eğim (sol uçtan yukarı), seat: oturak
    const g = svg('g', { class: 'eq-static' });
    const y = c.y ?? 150, x = c.x ?? 70, w = c.w ?? 90;
    let d = '';
    if (c.ang) {
      const piv = [x + (c.seat ?? 28), y];
      const end = [piv[0] - Math.cos(c.ang * RAD) * w, piv[1] - Math.sin(c.ang * RAD) * w];
      d += `M${fp(piv)}L${fp(end)}`; // sırt
      g.append(svg('path', { d: `M${x + (c.seat ?? 28) + 2} ${y}L${x + (c.seat ?? 28) + 30} ${y}`, class: 'eq-pad' }));
      g.append(svg('path', { d, class: 'eq-pad' }));
      g.append(svg('path', { d: `M${piv[0] + 14} ${y + 4}L${piv[0] + 14} ${FLOOR}M${f1(lerp(piv[0], end[0], 0.6))} ${f1(lerp(piv[1], end[1], 0.6) + 4)}L${f1(lerp(piv[0], end[0], 0.6))} ${FLOOR}M${piv[0] - 22} ${FLOOR}L${piv[0] + 34} ${FLOOR}`, class: 'eq-frame' }));
    } else {
      g.append(svg('path', { d: `M${x + 10} ${y + 3}L${x + 10} ${FLOOR}M${x + w - 10} ${y + 3}L${x + w - 10} ${FLOOR}M${x + 2} ${FLOOR}L${x + 18} ${FLOOR}M${x + w - 18} ${FLOOR}L${x + w - 2} ${FLOOR}`, class: 'eq-frame' }));
      g.append(svg('path', { d: `M${x} ${y + 3}L${x + w} ${y + 3}`, class: 'eq-pad' }));
    }
    return { front: false, el: g };
  },
  box(c) {
    const x = c.x, w = c.w ?? 44, hh = c.h ?? 34;
    return { front: false, el: svg('rect', { x, y: FLOOR - hh, width: w, height: hh, rx: 4, class: 'eq-box' }) };
  },
  wall(c) {
    return { front: false, el: svg('path', { d: `M${c.x} 20L${c.x} ${FLOOR}`, class: 'eq-wall' }) };
  },
  mat(c) {
    return { front: false, el: svg('rect', { x: c.x ?? 40, y: FLOOR - 2.5, width: c.w ?? 160, height: 3, rx: 1.5, class: 'eq-mat' }) };
  },
  pullbar(c) { // yan: bar uçtan görünür + taşıyıcı
    const g = svg('g', { class: 'eq-static' });
    const x = c.x, y = c.y;
    if (c.front) {
      g.append(svg('path', { d: `M${x - 60} ${y}L${x + 60} ${y}`, class: 'eq-barS' }));
      g.append(svg('path', { d: `M${x - 62} ${y - 4}L${x - 62} ${FLOOR}M${x + 62} ${y - 4}L${x + 62} ${FLOOR}`, class: 'eq-frame' }));
    } else {
      g.append(svg('path', { d: `M${x} ${y}L${x + 36} ${y}M${x + 36} ${y - 6}L${x + 36} ${FLOOR}`, class: 'eq-frame' }));
      g.append(svg('circle', { cx: x, cy: y, r: 3.2, class: 'eq-hub' }));
    }
    return { front: false, el: g };
  },
  dipbar(c) {
    const g = svg('g', { class: 'eq-static' });
    g.append(svg('path', { d: `M${c.x} ${c.y}L${c.x + 4} ${FLOOR}M${c.x - 14} ${FLOOR}L${c.x + 18} ${FLOOR}`, class: 'eq-frame' }));
    g.append(svg('circle', { cx: c.x, cy: c.y, r: 3.6, class: 'eq-hub' }));
    return { front: false, el: g };
  },
  cable(c) { // kule + makara + kablo eldeki tutamağa
    const g = svg('g', { class: 'eq' });
    const tx = c.x, py = c.y;
    const tower = svg('path', { d: `M${tx + (c.side ?? 1) * 6} 22L${tx + (c.side ?? 1) * 6} ${FLOOR}M${tx + (c.side ?? 1) * 6 - 8} ${FLOOR}L${tx + (c.side ?? 1) * 6 + 8} ${FLOOR}`, class: 'eq-frame' });
    const stack = svg('rect', { x: tx + (c.side ?? 1) * 6 - 4, y: FLOOR - 40, width: 8, height: 34, rx: 1.5, class: 'eq-stack' });
    const pulley = svg('circle', { cx: tx, cy: py, r: 3.6, class: 'eq-hub' });
    const cab = svg('path', { class: 'eq-cable' });
    const hnd = svg('path', { class: 'eq-handle' });
    g.append(tower, stack, cab, pulley, hnd);
    return { front: true, el: g, upd(J) {
      const hand = c.hand === 2 ? J.a2.grip : (c.both && J.F ? null : J.a1.grip);
      const p = hand || lerpP(J.a1.grip, J.a2.grip, 0.5);
      let q = p;
      if (c.attach === 'ankle') q = J.l1.a;
      cab.setAttribute('d', `M${tx} ${py}L${fp(q)}`);
      const d = sub(q, [tx, py]); const L = Math.hypot(...d) || 1; const nx = [-d[1] / L, d[0] / L];
      hnd.setAttribute('d', c.rope ? `M${fp(q)}L${fp(add(add(q, nx, 4), d, 6 / L))}M${fp(q)}L${fp(add(add(q, nx, -4), d, 6 / L))}` : `M${fp(add(q, nx, 5))}L${fp(add(q, nx, -5))}`);
    } };
  },
  band(c) { // direnç bandı: sabit nokta ya da ayak altından ele
    const g = svg('g', { class: 'eq' });
    const pth = svg('path', { class: 'eq-band' });
    g.append(pth);
    return { front: !c.back, el: g, upd(J) {
      const handsF = J.F ? [J.a1.grip, J.a2.grip] : [J.a1.grip];
      let d = '';
      for (const [idx, p] of handsF.entries()) {
        let a;
        if (c.from === 'feet') a = J.F ? (idx ? J.l2.heel : J.l1.heel) : [lerp(J.l1.heel[0], J.l1.toe[0], 0.4), FLOOR - 1];
        else a = c.from;
        if (c.pair) { const q = J.F ? (idx ? J.a1.grip : J.a2.grip) : p; d += `M${fp(p)}L${fp(q)}`; continue; }
        d += `M${fp(a)}L${fp(p)}`;
      }
      if (c.pair && J.F) d = `M${fp(J.a1.grip)}L${fp(J.a2.grip)}`;
      if (c.legs) d = `M${fp(lerpP(J.l1.k, J.l1.a, 0.15))}L${fp(lerpP(J.l2.k, J.l2.a, 0.15))}`;
      pth.setAttribute('d', d);
    } };
  },
  seat(c) { // makine oturağı ve sırtlık
    const g = svg('g', { class: 'eq-static' });
    const x = c.x, y = c.y, w = c.w ?? 34;
    g.append(svg('path', { d: `M${x} ${y}L${x + w} ${y}`, class: 'eq-pad' }));
    if (c.back) g.append(svg('path', { d: `M${x + (c.backX ?? 0)} ${y - 3}L${x + (c.backX ?? 0) - Math.sin((c.backAng ?? 8) * RAD) * c.back} ${y - 3 - Math.cos((c.backAng ?? 8) * RAD) * c.back}`, class: 'eq-pad' }));
    g.append(svg('path', { d: `M${x + w / 2} ${y + 4}L${x + w / 2} ${FLOOR}M${x + w / 2 - 14} ${FLOOR}L${x + w / 2 + 14} ${FLOOR}`, class: 'eq-frame' }));
    return { front: false, el: g };
  },
  pad(c) { // uzuva bağlı makine pedi (leg ext/curl)
    const g = svg('g', { class: 'eq' });
    const pad = svg('circle', { r: c.r || 4.5, class: 'eq-roll' });
    const arm = svg('path', { class: 'eq-frame' });
    g.append(arm, pad);
    return { front: true, el: g, upd(J) {
      const L = J.l1; const d = sub(L.a, L.k); const Ln = Math.hypot(...d) || 1;
      const nrm = [d[1] / Ln, -d[0] / Ln];
      const p = add(L.a, nrm, c.side ?? 6);
      pad.setAttribute('cx', f1(p[0])); pad.setAttribute('cy', f1(p[1]));
      arm.setAttribute('d', `M${c.px} ${c.py}L${fp(p)}`);
    } };
  },
  legpress(c) {
    const g = svg('g', { class: 'eq' });
    const rail = svg('path', { d: `M${c.x0} ${c.y0}L${c.x1} ${c.y1}`, class: 'eq-frame' });
    const seat = svg('path', { d: c.seat, class: 'eq-pad' });
    const plate = svg('path', { class: 'eq-pad' });
    g.append(rail, seat, plate);
    return { front: true, el: g, upd(J) {
      const L = J.l1; const d = sub(L.toe, L.heel); const Ln = Math.hypot(...d) || 1; const u = [d[0] / Ln, d[1] / Ln];
      const nrm = [-u[1], u[0]];
      const a = add(add(L.heel, u, -6), nrm, 3), b = add(add(L.toe, u, 6), nrm, 3);
      plate.setAttribute('d', `M${fp(a)}L${fp(b)}`);
    } };
  },
  rower(c) {
    const g = svg('g', { class: 'eq' });
    g.append(svg('path', { d: `M30 ${FLOOR - 14}L200 ${FLOOR - 14}M40 ${FLOOR - 14}L40 ${FLOOR}M190 ${FLOOR - 14}L190 ${FLOOR}`, class: 'eq-frame' }));
    g.append(svg('circle', { cx: 205, cy: FLOOR - 26, r: 14, class: 'eq-plate' }));
    g.append(svg('path', { d: `M170 ${FLOOR - 14}L176 ${FLOOR - 32}`, class: 'eq-frame' }));
    const seat = svg('rect', { width: 22, height: 5, rx: 2, class: 'eq-seat' });
    const chain = svg('path', { class: 'eq-cable' });
    g.append(seat, chain);
    return { front: false, el: g, upd(J) {
      seat.setAttribute('x', f1(J.hip[0] - 12)); seat.setAttribute('y', f1(FLOOR - 19));
      const p = J.a1.grip; chain.setAttribute('d', `M205 ${FLOOR - 30}L${fp(p)}`);
    } };
  },
  rope(c) { // atlama ipi: rp açısıyla döner
    const g = svg('g', { class: 'eq' });
    const pth = svg('path', { class: 'eq-rope' });
    g.append(pth);
    return { front: true, el: g, upd(J) {
      const p = J.a1.grip; const ctr = [J.hip[0] + 4, J.hip[1] - 4];
      const a = J.p.rp * RAD;
      const R = 86;
      const q = [ctr[0] + Math.sin(a) * R * 0.55, ctr[1] + Math.cos(a) * R];
      const ctrl = [q[0] + Math.sin(a) * 10, q[1] + Math.cos(a) * 6];
      pth.setAttribute('d', `M${fp(p)}Q${fp(ctrl)} ${fp(q)}`);
    } };
  },
  pulldown(c) { // ön görünüm lat çekiş barı
    const g = svg('g', { class: 'eq' });
    const bar = svg('path', { class: 'eq-bar' }), cab = svg('path', { class: 'eq-cable' });
    g.append(svg('path', { d: `M${c.x - 70} 14L${c.x + 70} 14`, class: 'eq-frame' }), svg('circle', { cx: c.x, cy: 14, r: 4, class: 'eq-hub' }), cab, bar);
    return { front: true, el: g, upd(J) {
      const A = J.a1.grip, B = J.a2.grip; const m = lerpP(A, B, 0.5);
      bar.setAttribute('d', `M${fp([A[0] + 9, A[1] + 3])}Q${fp([m[0], m[1] - 4])} ${fp([B[0] - 9, B[1] + 3])}`);
      cab.setAttribute('d', `M${c.x} 14L${fp([m[0], m[1] - 2])}`);
    } };
  },
  crossover(c) { // ön görünüm iki kule
    const g = svg('g', { class: 'eq' });
    const L = svg('path', { class: 'eq-cable' }), R = svg('path', { class: 'eq-cable' });
    g.append(svg('path', { d: `M22 16L22 ${FLOOR}M218 16L218 ${FLOOR}M12 ${FLOOR}L32 ${FLOOR}M208 ${FLOOR}L228 ${FLOOR}`, class: 'eq-frame' }),
      svg('circle', { cx: 26, cy: c.y, r: 4, class: 'eq-hub' }), svg('circle', { cx: 214, cy: c.y, r: 4, class: 'eq-hub' }), L, R);
    return { front: false, el: g, upd(J) { R.setAttribute('d', `M214 ${c.y}L${fp(J.a1.grip)}`); L.setAttribute('d', `M26 ${c.y}L${fp(J.a2.grip)}`); } };
  },
  wheel() {
    const g = svg('g', { class: 'eq' });
    const w = svg('circle', { r: 7, class: 'eq-plate' }), hb = svg('circle', { r: 2, class: 'eq-hub' });
    g.append(w, hb);
    return { front: true, el: g, upd(J) { const p = J.a1.grip; [w, hb].forEach(e => { e.setAttribute('cx', f1(p[0] + 2)); e.setAttribute('cy', f1(FLOOR - 7)); }); } };
  },
};

// ---------- Sahne oluşturma ----------
function el(tag, cls) { return svg(tag, { class: cls }); }

function buildFigure(anim, muscles, mode) {
  const view = anim.view || 'side';
  const F = view === 'front';
  const root = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'fig-svg fig-' + mode, 'aria-hidden': 'true' });
  const floorY = FLOOR;
  root.append(svg('path', { d: `M8 ${floorY}L232 ${floorY}`, class: 'fig-floor' }));
  const shadow = svg('ellipse', { cy: floorY + 1, rx: 40, ry: 3.2, class: 'fig-shadow' });
  root.append(shadow);
  const props = (anim.props || []).map(pc => ({ cfg: pc, ...PROPS[pc.type](pc) }));
  const back = svg('g', { class: 'fig-props-b' }), front = svg('g', { class: 'fig-props-f' });
  props.forEach(pr => (pr.front ? front : back).append(pr.el));
  root.append(back);
  const fig = svg('g', { class: 'fig' });
  root.append(fig);
  root.append(front);

  const P = { primary: new Set(muscles?.p || []), secondary: new Set(muscles?.s || []) };
  const place = F ? MUS_FRONT : MUS_SIDE;
  const groups = {};
  const mkLimb = (name, cls) => { const g = svg('g', { class: 'limb ' + cls }); groups[name] = g; return g; };
  // Çizim sırası
  const order = F ? ['leg2', 'leg1', 'torso', 'arm2', 'arm1'] : ['arm2', 'leg2', 'torso', 'leg1', 'arm1'];
  const parts = {};
  for (const name of order) {
    const far = !F && name.endsWith('2');
    const g = mkLimb(name, far ? 'far' : 'near');
    fig.append(g);
    if (name === 'torso') {
      parts.neck = el('path', 'body');
      parts.torso = el('path', 'body');
      parts.head = el('ellipse', 'body');
      parts.face = el('path', 'face');
      g.append(parts.neck, parts.torso, parts.head, parts.face);
    } else if (name.startsWith('arm')) {
      const i = name.slice(-1);
      parts['up' + i] = el('path', 'body'); parts['fo' + i] = el('path', 'body'); parts['hd' + i] = el('path', 'body');
      g.append(parts['up' + i], parts['fo' + i], parts['hd' + i]);
    } else {
      const i = name.slice(-1);
      parts['th' + i] = el('path', 'body'); parts['sn' + i] = el('path', 'body'); parts['ft' + i] = el('path', 'body');
      g.append(parts['th' + i], parts['sn' + i], parts['ft' + i]);
    }
  }
  // Kas katmanları
  const mus = [];
  for (const [id, defs] of Object.entries(place)) {
    const lvl = P.primary.has(id) ? 'p' : P.secondary.has(id) ? 's' : null;
    if (!lvl) continue;
    for (const d of defs) {
      const [seg, t, o, rx, ry, mirror] = d;
      const targets = seg === 'torso' ? [['torso', 1]] : (seg === 'upper' || seg === 'fore') ? [['arm1', 1], ['arm2', 2]] : [['leg1', 1], ['leg2', 2]];
      for (const [gname, i] of targets) {
        const sides = seg === 'torso' && mirror ? [1, -1] : [1];
        for (const sgn of sides) {
          const e = svg('ellipse', { rx, ry, class: 'mus mus-' + lvl });
          // uzuvlarda kas, ilgili uzuv parçasının hemen üstüne
          const g = groups[gname];
          g.append(e);
          mus.push({ e, seg, t, o: o * sgn, i });
        }
      }
    }
  }
  // Kasları uzuv şekillerinin üstünde ama bir sonraki parça (ör. ön kol) altında tutmak için yeniden sırala
  for (const i of ['1', '2']) {
    const ga = groups['arm' + i]; if (ga) { ga.append(parts['up' + i]); mus.filter(m => m.seg === 'upper' && String(m.i) === i).forEach(m => ga.append(m.e)); ga.append(parts['fo' + i]); mus.filter(m => m.seg === 'fore' && String(m.i) === i).forEach(m => ga.append(m.e)); ga.append(parts['hd' + i]); }
    const gl = groups['leg' + i]; if (gl) { gl.append(parts['th' + i]); mus.filter(m => m.seg === 'thigh' && String(m.i) === i).forEach(m => gl.append(m.e)); gl.append(parts['sn' + i]); mus.filter(m => m.seg === 'shin' && String(m.i) === i).forEach(m => gl.append(m.e)); gl.append(parts['ft' + i]); }
  }

  function segFrame(J, seg, i) {
    if (seg === 'torso') return { A: J.hip, B: J.sh, nS: -1 };
    const A = J['a' + i], L = J['l' + i];
    const nS = F && i === 2 ? -1 : 1;
    if (seg === 'upper') return { A: A.o, B: A.e, nS };
    if (seg === 'fore') return { A: A.e, B: A.w, nS };
    if (seg === 'thigh') return { A: L.o, B: L.k, nS };
    return { A: L.k, B: L.a, nS };
  }

  function draw(J) {
    const p = J.p;
    // Gövde
    if (F) {
      const td = J.td, pp = J.perp, hip = J.hip;
      const B = (x, y) => [hip[0] + pp[0] * x + td[0] * y, hip[1] + pp[1] * x + td[1] * y];
      const top = p.sh || 0;
      const R = [[9.5, -3], [10.6, 6], [8.6, 18], [10.4, 30], [13.2, 38 + top * 0.5], [15.6, 43 + top], [9, 47 + top], [4, 48.5 + top]];
      const pts = [...R.map(([x, y]) => B(x, y)), ...R.slice().reverse().map(([x, y]) => B(-x, y)), B(0, -6)];
      parts.torso.setAttribute('d', smoothClosed(pts));
      parts.neck.setAttribute('d', capsule(J.sh, J.neckTop, 3.6));
      parts.head.setAttribute('cx', f1(J.head[0])); parts.head.setAttribute('cy', f1(J.head[1]));
      parts.head.setAttribute('rx', 7.6); parts.head.setAttribute('ry', 9);
      parts.head.setAttribute('transform', `rotate(${f1(J.hA)} ${f1(J.head[0])} ${f1(J.head[1])})`);
      parts.face.setAttribute('d', '');
    } else {
      parts.torso.setAttribute('d', profilePath(J.hip, J.sh, PROF.torso, -1, p.cv || 0));
      parts.neck.setAttribute('d', capsule(J.sh, J.neckTop, 3.8));
      parts.head.setAttribute('cx', f1(J.head[0])); parts.head.setAttribute('cy', f1(J.head[1]));
      parts.head.setAttribute('rx', 7.8); parts.head.setAttribute('ry', 9);
      parts.head.setAttribute('transform', `rotate(${f1(J.hA)} ${f1(J.head[0])} ${f1(J.head[1])})`);
      // yüz yönü: küçük burun çıkıntısı
      const fr = [Math.cos(J.hA * RAD), Math.sin(J.hA * RAD)], up = [Math.sin(J.hA * RAD), -Math.cos(J.hA * RAD)];
      const nb = add(add(J.head, fr, 7.2), up, 0.5);
      parts.face.setAttribute('d', `M${fp(add(nb, up, 1.6))}L${fp(add(add(nb, fr, 2.2), up, -1.2))}L${fp(add(nb, up, -2.4))}Z`);
    }
    const PR = F ? PROF_F : PROF;
    for (const i of [1, 2]) {
      const A = J['a' + i], L = J['l' + i];
      const nS = F && i === 2 ? -1 : 1;
      parts['up' + i].setAttribute('d', profilePath(A.o, A.e, PR.upper, nS));
      parts['fo' + i].setAttribute('d', profilePath(A.e, A.w, PR.fore, nS));
      parts['hd' + i].setAttribute('d', capsule(A.w, A.hand, 3.1, 2.6));
      parts['th' + i].setAttribute('d', profilePath(L.o, L.k, PR.thigh, nS));
      parts['sn' + i].setAttribute('d', profilePath(L.k, L.a, PR.shin, nS));
      if (F) {
        const c = [L.a[0] + L.mx * 1.5, L.a[1] + 2.2];
        parts['ft' + i].setAttribute('d', capsule([c[0] - L.mx * 2, c[1]], [c[0] + L.mx * 3, c[1] + 0.6], 2.6, 2.4));
      } else {
        const d = dir(L.pft), dn = [-d[1], d[0]];
        const pts = [add(add(L.a, d, -3.4), dn, -1.5), L.heel, add(L.heel, d, 2), L.toe, add(L.toe, dn, -3.2), add(add(L.a, d, 4), dn, -0.6)];
        parts['ft' + i].setAttribute('d', smoothClosed(pts));
      }
    }
    for (const m of mus) {
      const { A, B, nS } = segFrame(J, m.seg, m.i);
      const dx = B[0] - A[0], dy = B[1] - A[1], Ln = Math.hypot(dx, dy) || 1;
      const ux = dx / Ln, uy = dy / Ln, nx = uy * nS, ny = -ux * nS;
      let o = m.o;
      if (F && m.seg === 'torso') { // ön görünümde yanal ofset dik yönde
        const pp = J.perp; const cx = A[0] + ux * Ln * m.t + pp[0] * o, cy = A[1] + uy * Ln * m.t + pp[1] * o;
        m.e.setAttribute('cx', f1(cx)); m.e.setAttribute('cy', f1(cy));
        m.e.setAttribute('transform', `rotate(${f1(Math.atan2(uy, ux) / RAD)} ${f1(cx)} ${f1(cy)})`);
        continue;
      }
      if (m.seg === 'torso' && p.cv) o += -(p.cv) * 7 * Math.sin(Math.PI * m.t);
      const cx = A[0] + ux * Ln * m.t + nx * o, cy = A[1] + uy * Ln * m.t + ny * o;
      m.e.setAttribute('cx', f1(cx)); m.e.setAttribute('cy', f1(cy));
      m.e.setAttribute('transform', `rotate(${f1(Math.atan2(uy, ux) / RAD)} ${f1(cx)} ${f1(cy)})`);
    }
    // Gölge
    const low = Math.max(J.l1.heel[1], J.l1.toe[1], J.l2.heel[1], J.l2.toe[1], J.a1.hand[1], J.a2.hand[1], J.hip[1] + 10);
    const air = clampN((FLOOR - low) / 30, 0, 1);
    const xs = [J.l1.toe[0], J.l2.heel[0], J.hip[0], J.sh[0]];
    const minX = Math.min(...xs, J.head[0]), maxX = Math.max(...xs, J.head[0]);
    shadow.setAttribute('cx', f1((minX + maxX) / 2));
    shadow.setAttribute('rx', f1(clampN((maxX - minX) / 2 + 14, 22, 100) * (1 - air * 0.4)));
    shadow.setAttribute('opacity', f1(1 - air * 0.6));
    for (const pr of props) pr.upd?.(J);
  }
  return { root, draw };
}

// ---------- Ortak animasyon döngüsü ----------
const active = new Set();
let raf = 0;
function loop(now) {
  raf = 0;
  for (const p of active) {
    if (!p.root.isConnected) { if (p._seen) { active.delete(p); io?.unobserve(p.host); } continue; }
    p._seen = true;
    p._tick(now);
  }
  if (active.size) raf = requestAnimationFrame(loop);
}
function wake() { if (!raf && active.size) raf = requestAnimationFrame(loop); }
const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
  for (const en of entries) {
    const p = en.target.__fig; if (!p) continue;
    p.visible = en.isIntersecting;
    p._sync();
  }
}, { rootMargin: '80px' }) : null;

const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animasyonlu figür. mode: 'lg' | 'md' | 'sm'
 * Döner: { el, play(), pause(), toggle(), setSpeed(x), playing, onPhase, seekFrame(i) }
 */
export function figure(anim, { mode = 'md', muscles = null, autoplay = true, speed = 1, onPhase = null, lazy = mode === 'sm', startMs = 0 } = {}) {
  const host = h('div', { class: 'fig-host fig-host-' + mode });
  let scene = null;
  const ctl = {
    el: host, host, root: host, playing: autoplay && !reduced, visible: !lazy, speed, t: startMs, last: 0, lastDraw: 0, phase: -1, onPhase,
    _ensure() { if (!scene) { scene = buildFigure(anim, muscles, mode); host.append(scene.root); this.render(); } },
    render() {
      if (!scene) return;
      const { pose, phase } = poseAt(anim, this.t);
      scene.draw(solve(pose));
      if (phase !== this.phase) { this.phase = phase; this.onPhase?.(phase); }
    },
    _tick(now) {
      if (!this.last) this.last = now;
      const dt = Math.min(100, now - this.last); this.last = now;
      this.t += dt * this.speed;
      if (mode === 'sm' && now - this.lastDraw < 40) return;
      this.lastDraw = now;
      this.render();
    },
    _sync() {
      if (this.visible) this._ensure();
      if (this.playing && this.visible) { this.last = 0; active.add(this); wake(); } else active.delete(this);
    },
    play() { this.playing = true; this._sync(); },
    pause() { this.playing = false; this._sync(); },
    toggle() { this.playing ? this.pause() : this.play(); return this.playing; },
    setSpeed(x) { this.speed = x; },
    seekFrame(i) { this.t = frameTime(anim, i) + 1; this.render(); },
    destroy() { active.delete(this); io?.unobserve(host); },
  };
  host.__fig = ctl;
  if (lazy && io) io.observe(host); else { ctl.visible = true; ctl._ensure(); }
  ctl._sync();
  return ctl;
}

/** Tek kare (statik) figür */
export function figureStatic(anim, frameIndex = 0, { muscles = null, mode = 'md' } = {}) {
  const sc = buildFigure(anim, muscles, mode);
  const c = compile(anim);
  sc.draw(solve(c.frames[Math.min(frameIndex, c.frames.length - 1)].P));
  return sc.root;
}

/**
 * Oynatıcı: büyük figür + oynat/duraklat + hız + senkron faz listesi
 */
export function player(anim, { muscles, phases = anim.phases || [] } = {}) {
  const list = h('ol', { class: 'phase-list' }, phases.map((p, i) => h('li', { class: 'phase', dataset: { i } }, h('span', { class: 'phase-n' }, String(i + 1)), h('span', null, p))));
  const label = h('div', { class: 'fig-phase-label', 'aria-live': 'polite' });
  const fg = figure(anim, { mode: 'lg', muscles, onPhase: i => {
    list.querySelectorAll('.phase').forEach((li, k) => li.classList.toggle('on', k === i));
    label.textContent = phases[i] ? `${i + 1}. ${phases[i]}` : '';
  } });
  fg.render();
  const playBtn = h('button', { class: 'btn icon sm', type: 'button', 'aria-label': 'Duraklat', onClick: () => {
    const on = fg.toggle();
    playBtn.replaceChildren(icon(on ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', on ? 'Duraklat' : 'Oynat');
  } }, icon(fg.playing ? 'pause' : 'play'));
  if (!fg.playing) playBtn.setAttribute('aria-label', 'Oynat');
  const speeds = [0.5, 1, 1.5];
  const sp = h('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Hız' }, speeds.map(s => h('button', {
    type: 'button', class: 'seg-btn' + (s === 1 ? ' on' : ''), 'aria-pressed': String(s === 1),
    onClick: e => { fg.setSpeed(s); sp.querySelectorAll('.seg-btn').forEach(b => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); },
  }, String(s).replace('.', ',') + '×')));
  list.querySelectorAll('.phase').forEach((li, i) => {
    li.addEventListener('click', () => {
      const c = compile(anim);
      const fi = c.frames.findIndex(f => (f.ph ?? 0) === i);
      if (fi >= 0) { fg.seekFrame(fi); if (fg.playing) { fg.pause(); playBtn.replaceChildren(icon('play')); playBtn.setAttribute('aria-label', 'Oynat'); } }
    });
  });
  const stage = h('div', { class: 'fig-stage' }, fg.el, label);
  const ctrls = h('div', { class: 'fig-ctrls' }, playBtn, h('span', { class: 'grow small muted' }, 'Hız'), sp);
  return { el: h('div', { class: 'fig-player' }, stage, ctrls, list), fig: fg };
}

// ---------- Kas haritası (ön/arka) ----------
const MAP_FRONT = {
  shoulders: [['e', 27, 47, 7, 7, 0]],
  chest: [['e', 40, 55, 10.5, 7.5, -6]],
  biceps: [['e', 22.5, 67, 4.3, 10, 10]],
  forearms: [['e', 17.5, 104, 3.8, 12, 9]],
  abs: [['r', 43.5, 70, 13, 36]],
  obliques: [['e', 36.5, 90, 3.6, 11, -8]],
  lats: [['e', 32, 69, 3, 8, -10]],
  traps: [['e', 42, 39, 5, 3, -25]],
  hipflex: [['e', 41, 121, 5, 4, 20]],
  quads: [['e', 40.5, 146, 7, 18, 5]],
  adductors: [['e', 46.8, 136, 2.8, 10, 0]],
  calves: [['e', 40, 180, 3.6, 10, 2]],
};
const MAP_BACK = {
  traps: [['p', 'M50 31L36 43L50 70L64 43Z']],
  shoulders: [['e', 27, 47, 7, 7, 0]],
  upperBack: [['e', 42.5, 58, 5.5, 8, 0]],
  lats: [['e', 36, 77, 6.5, 13, 12]],
  triceps: [['e', 22.5, 67, 4.3, 10, 10]],
  forearms: [['e', 17.5, 104, 3.8, 12, 9]],
  lowerBack: [['e', 45.5, 96, 3.6, 9, 0]],
  glutes: [['e', 41.5, 121, 8.5, 9, 0]],
  hamstrings: [['e', 41, 151, 6.4, 16.5, 4]],
  calves: [['e', 40.5, 177, 5, 10.5, 2]],
};

function bodySil(g) {
  const parts = [
    svg('circle', { cx: 50, cy: 17, r: 10.5 }),
    svg('path', { d: 'M45 26L55 26L56 36L44 36Z' }),
    svg('path', { d: 'M24 41Q50 33 76 41Q81 46 78 58L71 64Q68 84 66 100Q69 110 68 121L50 129L32 121Q31 110 34 100Q32 84 29 64L22 58Q19 46 24 41Z' }),
    svg('path', { d: 'M23 45Q18 52 18 64L15 86Q12 104 12 126L16 128Q20 106 22 88L28 68Z' }),
    svg('path', { d: 'M77 45Q82 52 82 64L85 86Q88 104 88 126L84 128Q80 106 78 88L72 68Z' }),
    svg('path', { d: 'M32 119Q32 140 35 164Q35 180 37 198L44 198Q44 180 46 164Q49 142 50 128Z' }),
    svg('path', { d: 'M68 119Q68 140 65 164Q65 180 63 198L56 198Q56 180 54 164Q51 142 50 128Z' }),
  ];
  parts.forEach(p => { p.setAttribute('class', 'mm-body'); g.append(p); });
}

function mapRegions(g, defs, P, S2) {
  for (const [id, shapes] of Object.entries(defs)) {
    const lvl = P.has(id) ? 'p' : S2.has(id) ? 's' : 'n';
    for (const s of shapes) {
      const mk = mirror => {
        let e;
        if (s[0] === 'e') {
          const cx = mirror ? 100 - s[1] : s[1];
          e = svg('ellipse', { cx, cy: s[2], rx: s[3], ry: s[4], transform: `rotate(${mirror ? -s[5] : s[5]} ${cx} ${s[2]})` });
        } else if (s[0] === 'r') {
          e = svg('rect', { x: s[1], y: s[2], width: s[3], height: s[4], rx: 4 });
          if (mirror) return null;
        } else {
          if (mirror) return null;
          e = svg('path', { d: s[1] });
        }
        e.setAttribute('class', 'mm-m mm-' + lvl);
        g.append(e);
        return e;
      };
      mk(false); mk(true);
    }
  }
  if (defs === MAP_FRONT) {
    const lv = P.has('abs') ? 'p' : S2.has('abs') ? 's' : 'n';
    g.append(svg('path', { d: 'M50 71L50 105M44 82L56 82M44 93L56 93', class: 'mm-line mm-line-' + lv }));
  }
}

export function muscleMap(primary = [], secondary = []) {
  const P = new Set(primary), S2 = new Set(secondary);
  const root = svg('svg', { viewBox: '0 0 220 214', class: 'mm-svg', role: 'img', 'aria-label': 'Çalışan kaslar haritası' });
  const gf = svg('g', { transform: 'translate(6 2)' }), gb = svg('g', { transform: 'translate(114 2)' });
  bodySil(gf); bodySil(gb);
  mapRegions(gf, MAP_FRONT, P, S2);
  mapRegions(gb, MAP_BACK, P, S2);
  root.append(gf, gb,
    svg('text', { x: 56, y: 212, 'text-anchor': 'middle', class: 'mm-lbl' }, 'Ön'),
    svg('text', { x: 164, y: 212, 'text-anchor': 'middle', class: 'mm-lbl' }, 'Arka'));
  return root;
}
