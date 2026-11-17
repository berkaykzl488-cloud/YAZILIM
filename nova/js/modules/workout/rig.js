// Egzersiz figürü iskeleti: ölçüler, eklem açılarından konum çözümü (iki kemikli IK),
// anahtar kareleri "pişirme", kareler arası geçiş ve zaman çizelgesi. Çizim yapmaz.
// ---------- Ölçüler (viewBox 240x200 birimi) ----------
export const S = { headR: 8.5, neck: 5, torso: 44, upper: 26, fore: 23, hand: 5, thigh: 37, shin: 36, heel: 4, toe: 12, ankleH: 4, SW: 13, HW: 8 };
export const FLOOR = 186;
export const HIP_Y = FLOOR - S.ankleH - S.shin - S.thigh; // 109
export const ANK = FLOOR - S.ankleH; // 182


export const RAD = Math.PI / 180;
export const dir = a => [Math.sin(a * RAD), Math.cos(a * RAD)]; // 0 = aşağı, +90 = ileri (sağ)
export const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const lerp = (a, b, e) => a + (b - a) * e;
export const lerpP = (a, b, e) => [lerp(a[0], b[0], e), lerp(a[1], b[1], e)];
export const angOf = v => Math.atan2(v[0], v[1]) / RAD;
export const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
export const f1 = n => (Math.round(n * 10) / 10);
export const fp = p => f1(p[0]) + ' ' + f1(p[1]);
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

export function pointByName(J, n) {
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

export const EASE = {
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
  const same = anim.cut || JSON.stringify(frames[0].P) === JSON.stringify(frames[n - 1].P);
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

/** Verilen andaki zaman dilimi: { i: dilim sırası, u: 0..1 ilerleme, seg } */
export function segAt(anim, ms) {
  const c = compile(anim);
  let t = ((ms % c.total) + c.total) % c.total;
  for (let i = 0; i < c.segs.length; i++) {
    const s = c.segs[i];
    if (t <= s.len) return { i, u: s.len ? t / s.len : 1, seg: s };
    t -= s.len;
  }
  const i = c.segs.length - 1;
  return { i, u: 1, seg: c.segs[i] };
}

/** Dilim içindeki ara poz (dilimin kendi yumuşatmasıyla) */
export function poseInSeg(anim, i, u) {
  const c = compile(anim), s = c.segs[i];
  const A = c.frames[s.a].P;
  if (s.a === s.b) return A;
  return blend(A, c.frames[s.b].P, s.ease(u));
}
