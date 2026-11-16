// Egzersiz figürü motoru: sahne kurulumu (otomatik kadraj, zemin, gölge, ekipman, gövde),
// hareket ipuçları (yön oku, başlangıç hayaleti, eklem açısı), animasyon döngüsü, oynatıcı ve kas haritası.
// İskelet/IK rig.js'te, çizim art.js'te. Tüm görseller kodla üretilir; harici görsel yoktur.
import { svg, h, icon } from '../../core/ui.js';
import { load, save } from '../../core/store.js';
import { S, FLOOR, HIP_Y, ANK, RAD, add, sub, lerpP, clampN, f1, fp, solve, compile, poseAt, frameTime, segAt, poseInSeg, pointByName, mergePose } from './rig.js';
import { makeBody, silhouette, PROPS, nextId } from './art.js';

export { S, FLOOR, HIP_Y, ANK, solve, compile, poseAt, frameTime, mergePose };

// Ayrıntı düzeyleri: lg = oynatıcı, md = canlı antrenman, sm = kütüphane küçük resmi
const MODES = {
  lg: { minW: 214, top: 20, floor: 9, cues: true, angle: true, ghost: true },
  md: { minW: 206, top: 8, floor: 8, cues: true },
  sm: { minW: 170, top: 4, floor: 5 },
};
const LOADED = new Set(['barbell', 'barF', 'dumbbell', 'kettlebell']);

// ---------- Paylaşılan SVG tanımları (tek sefer) ----------
let shared = false;
function ensureShared() {
  if (shared || typeof document === 'undefined') return;
  shared = true;
  const s = svg('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden' });
  const d = svg('defs');
  const stop = (o, c, a) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a });
  const sh = svg('radialGradient', { id: 'nvf-shadow' }); sh.append(stop(0, '#000', 0.55), stop(0.6, '#000', 0.25), stop(1, '#000', 0));
  const hd = svg('radialGradient', { id: 'nvf-head', cx: 0.68, cy: 0.3, r: 0.85 }); hd.append(stop(0, '#fff', 0.22), stop(0.45, '#fff', 0), stop(0.85, '#000', 0.16), stop(1, '#000', 0.26));
  const gr = svg('linearGradient', { id: 'nvf-ground', x1: 0, y1: 0, x2: 0, y2: 1 }); gr.append(stop(0, '#2a2a31', 1), stop(1, '#1c1c21', 1));
  d.append(sh, hd, gr); s.append(d);
  document.body.append(s);
}

// ---------- Hareket ipuçları (ok + eklem açısı), animasyon başına önbellekli ----------
const cueCache = new WeakMap();
function interior(J, j) {
  let o, a, b;
  if (j === 'knee') { o = J.l1.k; a = J.l1.o; b = J.l1.a; }
  else if (j === 'elb') { o = J.a1.e; a = J.a1.o; b = J.a1.w; }
  else { o = J.hip; a = J.sh; b = J.l1.k; }
  const u = sub(a, o), v = sub(b, o);
  const c = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1);
  return { o, a, b, deg: Math.acos(clampN(c, -1, 1)) / RAD };
}
export function cuesOf(anim) {
  if (cueCache.has(anim)) return cueCache.get(anim);
  const c = compile(anim), cfg = anim.cue || {};
  const loaded = (anim.props || []).some(p => LOADED.has(p.type));
  const Js = c.frames.map(f => solve(f.P));
  let pt = cfg.pt;
  if (!pt) {
    let best = -1;
    for (const [n, w] of [['hip', 1.25], ['sh', 1], ['grip1', loaded ? 1.6 : 0.85], ['knee1', 0.7], ['ank1', 0.55], ['head', 0.8]]) {
      const ps = Js.map(J => pointByName(J, n));
      let m = 0; for (const a of ps) for (const b of ps) m = Math.max(m, Math.hypot(a[0] - b[0], a[1] - b[1]));
      if (m * w > best) { best = m * w; pt = n; }
    }
  }
  const arrows = [];
  if (cfg.arrow !== false) c.segs.forEach((s, i) => {
    if (s.a === s.b || s.len < 420) return;
    const pts = [];
    for (let k = 0; k <= 10; k++) pts.push(pointByName(solve(poseInSeg(anim, i, k / 10)), pt).slice());
    let len = 0; for (let k = 1; k <= 10; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (len < 9) return;
    const ch = sub(pts[10], pts[0]), chL = Math.hypot(...ch);
    const tg = chL > 4 ? ch : sub(pts[6], pts[4]);
    const tl = Math.hypot(...tg) || 1;
    let n = [-tg[1] / tl, tg[0] / tl];
    const Jm = solve(poseInSeg(anim, i, 0.5));
    const body = [Jm.hip, Jm.sh, Jm.head, Jm.l1.k, Jm.l1.a, Jm.a1.e];
    const ctr = [body.reduce((s2, p) => s2 + p[0], 0) / body.length, body.reduce((s2, p) => s2 + p[1], 0) / body.length];
    if ((pts[5][0] - ctr[0]) * n[0] + (pts[5][1] - ctr[1]) * n[1] < 0) n = [-n[0], -n[1]];
    if (cfg.side) n = [-n[0], -n[1]];
    const off = cfg.off ?? (pt.startsWith('grip') && loaded ? 22 : 12);
    arrows.push({ seg: i, pts: pts.slice(1, 10).map(p => add(p, n, off)) });
  });
  // Eklem açısı: en çok değişen eklemin en dar (kilit) karesi
  let ang = null;
  if (cfg.ang !== false && c.view !== 'front') {
    const cands = cfg.ang ? [cfg.ang] : ['knee', 'elb', 'hip'];
    let best = null;
    for (const j of cands) {
      const ds = Js.map(J => interior(J, j).deg);
      const mn = Math.min(...ds), mx = Math.max(...ds);
      if ((cfg.ang || (mx - mn >= 40 && mn >= 55 && mn <= 150)) && (!best || mx - mn > best.range)) best = { j, range: mx - mn, ext: mn };
    }
    if (best) ang = { j: best.j, ext: best.ext, label: Math.round(best.ext / 5) * 5 + '°' };
  }
  // Efor fazları: "nefes ver" geçen fazlar; yoksa başlangıç dışındaki tüm fazlar
  const phases = anim.phases || [];
  let effort = phases.map((p, i) => /nefes ver/i.test(p) ? i : -1).filter(i => i >= 0);
  if (!effort.length) effort = phases.map((_, i) => i).filter(i => i > 0);
  const out = { pt, arrows, ang, effort: new Set(effort) };
  cueCache.set(anim, out);
  return out;
}

// ---------- Otomatik kadraj ----------
const boxCache = new WeakMap();
/** Figür + ekipman + ipuçlarını kapsayan, 240:200 oranlı görüş kutusu. Ölçek modlar arasında sabit tutulur. */
export function fitBox(anim, mode = 'md') {
  const M = MODES[mode] || MODES.md;
  const cache = boxCache.get(anim) || {};
  if (cache[mode]) return cache[mode];
  const c = compile(anim);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const eat = (p, r = 0) => { x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r); };
  for (let i = 0; i <= 28; i++) {
    const J = solve(poseAt(anim, (c.total * i) / 28).pose);
    eat(J.head, S.headR + 2.5); eat(J.hip, 11); eat(J.sh, 11);
    for (const k of [1, 2]) { eat(J['a' + k].hand, 4); eat(J['a' + k].e, 6); eat(J['l' + k].toe, 2); eat(J['l' + k].heel, 2); eat(J['l' + k].k, 6); }
    for (const pc of anim.props || []) for (const q of PROPS[pc.type]?.pts(pc, J) || []) eat(q, q[2] || 0);
  }
  if (M.cues) for (const a of cuesOf(anim).arrows) for (const p of a.pts) eat(p, 4);
  const yb = FLOOR + M.floor;
  x0 -= 8; x1 += 8; y0 -= M.top;
  let w = Math.max(M.minW, x1 - x0, (yb - y0) * 1.2);
  const hh = w / 1.2;
  const box = [(x0 + x1) / 2 - w / 2, yb - hh, w, hh].map(v => Math.round(v * 10) / 10);
  cache[mode] = box; boxCache.set(anim, cache);
  return box;
}

// ---------- Sahne ----------
function buildScene(anim, muscles, mode) {
  ensureShared();
  const M = MODES[mode] || MODES.md;
  const F = (anim.view || 'side') === 'front';
  const vb = fitBox(anim, mode);
  const uid = nextId();
  const root = svg('svg', { viewBox: vb.join(' '), class: 'fig-svg fig-' + mode, 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMax meet' });
  const defs = svg('defs');
  root.append(defs);
  const xl = vb[0] - 30, xr = vb[0] + vb[2] + 30;
  root.append(svg('path', { d: `M${f1(xl)} ${FLOOR}H${f1(xr)}V${f1(vb[1] + vb[3] + 4)}H${f1(xl)}Z`, class: 'fig-ground' }),
    svg('path', { d: `M${f1(xl)} ${FLOOR}H${f1(xr)}`, class: 'fig-floor' }));
  const shadow = svg('ellipse', { cy: FLOOR + 0.6, rx: 40, ry: 4, class: 'fig-shadow' });

  const props = (anim.props || []).filter(pc => PROPS[pc.type]).map(pc => PROPS[pc.type].make(pc));
  const back = svg('g', { class: 'fig-props-b' }), front = svg('g', { class: 'fig-props-f' });
  props.forEach(pr => { if (pr.bg) back.append(pr.bg); (pr.front ? front : back).append(pr.el); });
  root.append(shadow, back);

  let ghost = null;
  if (M.ghost) {
    ghost = svg('path', { class: 'fig-ghost', d: silhouette(solve(compile(anim).frames[0].P)) });
    root.append(ghost);
  }

  const body = makeBody({ F, mode, muscles, uid, defs });
  const fig = svg('g', { class: 'fig' });
  const L = body.layers, both = n => [L[n].ol, L[n].g];
  if (F) fig.append(...both('leg2'), ...both('leg1'), ...both('torso'), ...both('arm2'), ...both('arm1'));
  else fig.append(...both('arm2'), ...both('leg2'), L.leg1.ol, ...both('torso'), L.leg1.g, ...both('arm1'));
  root.append(fig, front);

  // İpuçları katmanı
  const cues = M.cues ? cuesOf(anim) : null;
  const arrows = [];
  let angG = null, angArc = null, angTxt = null;
  if (cues) {
    const cg = svg('g', { class: 'fig-cues' });
    for (const a of cues.arrows) {
      const p = a.pts, n = p.length;
      let d = 'M' + fp(p[0]);
      for (let i = 1; i < n - 1; i++) d += 'Q' + fp(p[i]) + ' ' + fp(lerpP(p[i], p[i + 1], 0.5));
      d += 'L' + fp(p[n - 1]);
      const tg = sub(p[n - 1], p[n - 3]), tl = Math.hypot(...tg) || 1, u = [tg[0] / tl, tg[1] / tl], nn = [-u[1], u[0]];
      const tip = add(p[n - 1], u, 3.6), b1 = add(add(p[n - 1], u, -1.2), nn, 3), b2 = add(add(p[n - 1], u, -1.2), nn, -3);
      const g = svg('g', { class: 'cue-arrow', opacity: 0 });
      g.append(svg('path', { d, class: 'cue-line' }), svg('path', { d: `M${fp(tip)}L${fp(b1)}L${fp(b2)}Z`, class: 'cue-head' }));
      cg.append(g);
      arrows.push({ seg: a.seg, g, on: 0 });
    }
    if (M.angle && cues.ang) {
      angG = svg('g', { class: 'cue-ang', opacity: 0 });
      angArc = svg('path', { class: 'cue-arc' });
      const lab = svg('g', { class: 'cue-lab' });
      const w = cues.ang.label.length * 3.7 + 5;
      lab.append(svg('rect', { x: -w / 2, y: -5, width: w, height: 10, rx: 5 }), svg('text', { x: 0, y: 2.3, 'text-anchor': 'middle' }, cues.ang.label));
      angTxt = lab;
      angG.append(angArc, lab);
      cg.append(angG);
    }
    root.append(cg);
  }

  let pulse = 0.82;
  function draw(J, t = 0, phase = 0) {
    body.draw(J);
    // Gölge: gövdenin yere izdüşümü, havadayken küçülüp açılır
    const pts = [J.l1.toe, J.l1.heel, J.l2.toe, J.l2.heel, J.hip, J.sh, J.head, J.a1.hand, J.a2.hand];
    const low = Math.max(...pts.map(p => p[1]));
    const air = clampN((FLOOR - low) / 30, 0, 1);
    const xs = pts.filter(p => p[1] > FLOOR - 60).map(p => p[0]);
    const mn = Math.min(...(xs.length ? xs : [J.hip[0]])), mx = Math.max(...(xs.length ? xs : [J.hip[0]]));
    shadow.setAttribute('cx', f1((mn + mx) / 2));
    shadow.setAttribute('rx', f1(clampN((mx - mn) / 2 + 12, 18, 110) * (1 - air * 0.35)));
    shadow.setAttribute('opacity', f1(1 - air * 0.6));
    for (const pr of props) pr.upd?.(J);
    if (!cues) return;
    // Yön oku: hareket dilimi boyunca görünür; bekleme dilimlerinde bir sonraki hareketi soluk gösterir
    const sa = segAt(anim, t), c = compile(anim);
    let target = -1, op = 0;
    if (sa.seg.a !== sa.seg.b) { target = sa.i; op = Math.min(1, sa.u / 0.12, (1 - sa.u) / 0.1); }
    else {
      for (let k = 1; k <= c.segs.length; k++) { const j = (sa.i + k) % c.segs.length; if (c.segs[j].a !== c.segs[j].b) { target = j; break; } }
      op = 0.55 * Math.min(1, sa.u / 0.3 + 0.35);
    }
    for (const a of arrows) {
      const v = a.seg === target ? clampN(op, 0, 1) : 0;
      if (Math.abs(v - a.on) > 0.02 || (v === 0) !== (a.on === 0)) { a.on = v; a.g.setAttribute('opacity', f1(v)); }
    }
    if (angG) {
      const r = interior(J, cues.ang.j);
      const o = clampN(1 - (r.deg - cues.ang.ext) / 9, 0, 1);
      angG.setAttribute('opacity', f1(o));
      if (o > 0) {
        const u = sub(r.a, r.o), v = sub(r.b, r.o), lu = Math.hypot(...u) || 1, lv = Math.hypot(...v) || 1;
        const ua = [u[0] / lu, u[1] / lu], va = [v[0] / lv, v[1] / lv], R = 8;
        const cr = ua[0] * va[1] - ua[1] * va[0];
        angArc.setAttribute('d', `M${fp(add(r.o, ua, R))}A${R} ${R} 0 0 ${cr > 0 ? 1 : 0} ${fp(add(r.o, va, R))}`);
        let bs = [ua[0] + va[0], ua[1] + va[1]]; const bl = Math.hypot(...bs) || 1; bs = [bs[0] / bl, bs[1] / bl];
        const lp = add(r.o, bs, -13);
        angTxt.setAttribute('transform', `translate(${fp(lp)})`);
      }
    }
    // Ana kaslar efor fazında hafifçe nabız atar
    const want = cues.effort.has(phase) ? 0.86 + 0.14 * Math.sin(t / 1000 * Math.PI * 2 * 1.1) : 0.8;
    pulse += (want - pulse) * 0.25;
    root.style.setProperty('--mp', f1(pulse * 100) / 100);
  }
  return { root, draw, ghost };
}

// ---------- Ortak animasyon döngüsü ----------
const active = new Set();
let raf = 0;
function loop(now) {
  raf = 0;
  for (const p of active) {
    if (!p.host.isConnected) { if (p._seen) { active.delete(p); io?.unobserve(p.host); } continue; }
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
}, { rootMargin: '60px' }) : null;

export const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animasyonlu figür. mode: 'lg' | 'md' | 'sm'
 * Döner: { el, play(), pause(), toggle(), setSpeed(x), playing, onPhase, seekFrame(i), setGhost(on) }
 */
export function figure(anim, { mode = 'md', muscles = null, autoplay = true, speed = 1, onPhase = null, lazy = mode === 'sm', startMs = 0 } = {}) {
  const host = h('div', { class: 'fig-host fig-host-' + mode });
  let scene = null;
  const ctl = {
    el: host, host, playing: autoplay && !reducedMotion, visible: !lazy, speed, t: startMs, last: 0, lastDraw: 0, phase: -1, onPhase, ghostOn: false,
    _ensure() { if (!scene) { scene = buildScene(anim, muscles, mode); host.append(scene.root); this.setGhost(this.ghostOn); this.render(); } },
    render() {
      if (!scene) return;
      const { pose, phase } = poseAt(anim, this.t);
      scene.draw(solve(pose), this.t, phase);
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
    setGhost(on) { this.ghostOn = !!on; if (scene?.ghost) scene.ghost.classList.toggle('on', this.ghostOn); },
    destroy() { active.delete(this); io?.unobserve(host); },
  };
  host.__fig = ctl;
  if (lazy && io) io.observe(host); else { ctl.visible = true; ctl._ensure(); }
  ctl._sync();
  return ctl;
}

/** Tek kare (statik) figür */
export function figureStatic(anim, frameIndex = 0, { muscles = null, mode = 'md' } = {}) {
  const sc = buildScene(anim, muscles, mode);
  const fi = Math.min(frameIndex, compile(anim).frames.length - 1);
  const t = frameTime(anim, fi) + 1;
  const { pose, phase } = poseAt(anim, t);
  sc.draw(solve(pose), t, phase);
  return sc.root;
}

const GHOST_KEY = 'workout.figGhost';
/**
 * Oynatıcı: büyük figür + oynat/duraklat + hız + başlangıç hayaleti + senkron faz listesi.
 * Hareket azaltma tercihinde: kilit poz durağan gösterilir, fazlar düğmeyle gezilir.
 */
export function player(anim, { muscles, phases = anim.phases || [] } = {}) {
  const c = compile(anim);
  const frameOfPhase = i => c.frames.findIndex(f => (f.ph ?? 0) === i);
  const btns = [];
  const list = h('ol', { class: 'phase-list' }, phases.map((p, i) => {
    const b = h('button', { type: 'button', class: 'phase', disabled: frameOfPhase(i) < 0 }, h('span', { class: 'phase-n' }, String(i + 1)), h('span', null, p));
    btns.push(b);
    return h('li', null, b);
  }));
  const label = h('div', { class: 'fig-phase-label', 'aria-live': 'polite' });
  const fg = figure(anim, { mode: 'lg', muscles, onPhase: i => {
    btns.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-current', k === i ? 'step' : 'false'); });
    label.textContent = phases[i] ? `${i + 1}. ${phases[i]}` : '';
  } });
  const ghostPref = load(GHOST_KEY, null);
  fg.setGhost(ghostPref ?? reducedMotion);
  if (reducedMotion) { const k = frameOfPhase(1); fg.seekFrame(k >= 0 ? k : 0); } else fg.render();
  const setPlayIcon = () => { playBtn.replaceChildren(icon(fg.playing ? 'pause' : 'play')); playBtn.setAttribute('aria-label', fg.playing ? 'Duraklat' : 'Oynat'); };
  const playBtn = h('button', { class: 'btn icon sm', type: 'button', onClick: () => { fg.toggle(); setPlayIcon(); } });
  setPlayIcon();
  const speeds = [0.5, 1, 1.5];
  const sp = h('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Hız' }, speeds.map(s => h('button', {
    type: 'button', class: 'seg-btn' + (s === 1 ? ' on' : ''), 'aria-pressed': String(s === 1),
    onClick: e => { fg.setSpeed(s); sp.querySelectorAll('.seg-btn').forEach(b => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); },
  }, String(s).replace('.', ',') + '×')));
  const ghostBtn = h('button', { type: 'button', class: 'chip fig-ghost-btn' + (fg.ghostOn ? ' active' : ''), 'aria-pressed': String(fg.ghostOn), onClick: () => {
    fg.setGhost(!fg.ghostOn); save(GHOST_KEY, fg.ghostOn);
    ghostBtn.classList.toggle('active', fg.ghostOn); ghostBtn.setAttribute('aria-pressed', String(fg.ghostOn));
    if (!fg.playing) fg.render();
  } }, 'Başlangıcı göster');
  btns.forEach((b, i) => b.addEventListener('click', () => {
    const fi = frameOfPhase(i);
    if (fi < 0) return;
    fg.seekFrame(fi);
    if (fg.playing) { fg.pause(); setPlayIcon(); }
  }));
  const stage = h('div', { class: 'fig-stage' }, fg.el, label);
  const ctrls = h('div', { class: 'fig-ctrls' }, playBtn, sp, h('span', { class: 'grow' }), ghostBtn);
  const note = reducedMotion ? h('p', { class: 'small muted fig-rm-note' }, 'Hareket azaltma açık: adımlara dokunarak pozları gez.') : null;
  return { el: h('div', { class: 'fig-player' }, stage, ctrls, note, list), fig: fg };
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
