// Koşu modülü — kütüphanesiz canvas harita: Web-Mercator karoları (CARTO koyu), tempoya göre renklenen rota,
// başlangıç/bitiş işaretleri, konum noktası + doğruluk dairesi, sürükle/kıstır/çift dokun yakınlaştır, takip modu.
// Karolar yüklenemezse (çevrimdışı) sade koyu zemin + ince ızgara çizilir; rota her durumda görünür.
import { h, icon, clamp } from '../../core/ui.js';
import { project, unproject, metersPerPx, cumDist, movingTimes, rollingSpeeds, boundsOf } from './geo.js';

const TILE = 256;
const MIN_Z = 3, MAX_Z = 19;
const TILE_URL = (s, z, x, y) => `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png`;
const SUBS = 'abcd';

// Karo önbelleği tüm haritalar arasında ortak
const cache = new Map(); // key -> { img, ok, fail, used }
let netOk = 0, netFail = 0;
function getTile(z, x, y, onLoad) {
  const n = 1 << z;
  x = ((x % n) + n) % n;
  if (y < 0 || y >= n) return null;
  const key = z + '/' + x + '/' + y;
  let t = cache.get(key);
  if (t) {
    t.used = performance.now();
    if (t.fail && performance.now() - t.failAt > 30000) { cache.delete(key); t = null; }
    else { if (!t.ok && !t.fail) t.waiters.add(onLoad); return t; }
  }
  const img = new Image();
  img.decoding = 'async';
  t = { img, ok: false, fail: false, used: performance.now(), waiters: new Set([onLoad]) };
  img.onload = () => { t.ok = true; netOk++; netFail = 0; t.waiters.forEach(f => f()); t.waiters.clear(); };
  img.onerror = () => { t.fail = true; t.failAt = performance.now(); netFail++; t.waiters.forEach(f => f()); t.waiters.clear(); };
  img.src = TILE_URL(SUBS[(x + y) % 4], z, x, y);
  cache.set(key, t);
  if (cache.size > 400) {
    const old = [...cache.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, 100);
    old.forEach(([k]) => cache.delete(k));
  }
  return t;
}
const tilesOffline = () => netFail >= 4 && netOk === 0 || netFail >= 12;

// Tempo renk skalası: yavaş (sarı) -> orta (turuncu vurgu) -> hızlı (kırmızı-pembe). Renkler çekirdek CSS değişkenlerinden okunur.
function cssVar(name, fb) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb; } catch { return fb; }
}
function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
let STOPS = null;
function stops() {
  if (!STOPS) STOPS = [[0, cssVar('--amber', '#ffc04d')], [0.5, cssVar('--accent', '#ff7a1a')], [1, cssVar('--magenta', '#ff5277')]]
    .map(([t, c]) => [t, hexRgb(c) || [200, 200, 200]]);
  return STOPS;
}
function rampColor(t) {
  const S = stops();
  t = clamp(t, 0, 1);
  for (let i = 1; i < S.length; i++) {
    if (t <= S[i][0]) {
      const [t0, c0] = S[i - 1], [t1, c1] = S[i], f = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * f)).join(',')})`;
    }
  }
  return `rgb(${S[S.length - 1][1].join(',')})`;
}
export const paceGradientCss = () => `linear-gradient(90deg, ${stops().map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`;
const BUCKETS = 10;

export class MapView {
  /**
   * opts: { interactive, follow, controls, live (konum işareti animasyonu), zoom, center: [lat,lng], onFollowChange }
   */
  constructor(host, opts = {}) {
    this.o = { interactive: true, follow: false, controls: true, live: false, zoom: 15, ...opts };
    this.zoom = this.o.zoom;
    const c = this.o.center ? project(...this.o.center) : project(41.0, 29.0);
    this.cx = c[0]; this.cy = c[1];
    this.follow = !!this.o.follow;
    this.route = null;
    this.pos = null;
    this.dirty = true;
    this.anim = null;
    this.pointers = new Map();
    this.destroyed = false;

    this.canvas = h('canvas', { class: 'rn-map-canvas', 'aria-label': 'Rota haritası', role: 'img' });
    this.ctx = this.canvas.getContext('2d');
    this.offlineBadge = h('div', { class: 'rn-map-offline hide', title: 'İnternet yok; rota yine de çiziliyor' }, 'Harita yüklenemedi');
    this.recenterBtn = h('button', { class: 'rn-map-btn rn-map-recenter hide', type: 'button', 'aria-label': 'Konumuma ortala',
      onClick: () => this.setFollow(true) }, icon('target', { size: 20 }), h('span', null, 'Ortala'));
    const controls = this.o.controls ? h('div', { class: 'rn-map-ctrls' },
      h('button', { class: 'rn-map-btn', type: 'button', 'aria-label': 'Yakınlaştır', onClick: () => this.zoomBy(1) }, icon('plus', { size: 20 })),
      h('button', { class: 'rn-map-btn', type: 'button', 'aria-label': 'Uzaklaştır', onClick: () => this.zoomBy(-1) }, icon('minus', { size: 20 }))) : null;
    this.el = h('div', { class: 'rn-map' }, this.canvas, this.offlineBadge, controls, this.recenterBtn,
      h('div', { class: 'rn-map-attr' }, '© ', h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, 'OpenStreetMap'),
        ' © ', h('a', { href: 'https://carto.com/attributions', target: '_blank', rel: 'noopener' }, 'CARTO')));
    host.appendChild(this.el);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    if (this.o.interactive) this._bindInput();
    this.resize();
    this._loop = this._loop.bind(this);
    this.raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.el.remove();
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height); this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    if (this._pendingFit) this.fit(this._pendingFit.points, this._pendingFit.pad, this._pendingFit.padTop);
    this.dirty = true;
  }

  // ---------- Veri ----------
  /** points: [[lat,lng,t,alt,mt]], breaks: [i] */
  setRoute(points, breaks = []) {
    if (!points?.length) { this.route = null; this.dirty = true; return; }
    const proj = points.map(p => project(p[0], p[1]));
    const cum = cumDist(points, breaks), mt = movingTimes(points);
    const sp = rollingSpeeds(points, cum, mt, breaks, 20);
    const sorted = Array.from(sp).filter(v => v > 0.2).sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.1)] ?? 0, hi = sorted[Math.floor(sorted.length * 0.9)] ?? 1;
    const bucket = Array.from(sp, v => (hi - lo > 0.05 ? Math.round(clamp((v - lo) / (hi - lo), 0, 1) * (BUCKETS - 1)) : Math.round(BUCKETS * 0.6)));
    this.route = { proj, breaks: new Set(breaks), bucket, n: points.length };
    this.dirty = true;
  }
  /** pos: { lat, lng, acc, heading } */
  setPosition(pos) {
    this.pos = pos ? { ...pos, p: project(pos.lat, pos.lng) } : null;
    if (this.pos && this.follow) this._panTo(this.pos.p, 350);
    this.dirty = true;
  }
  setFollow(on) {
    this.follow = on;
    this.recenterBtn.classList.toggle('hide', on || !this.o.follow);
    if (on && this.pos) { this._panTo(this.pos.p, 400); if (this.zoom < 15) this._zoomTo(16, this.W / 2, this.H / 2, 400); }
    this.o.onFollowChange?.(on);
  }
  /** Rotayı görünüme sığdırır */
  fit(points, pad = 36, padTop = pad) {
    if (!points?.length) return;
    if (this.W < 10 || this.H < 10) { this._pendingFit = { points, pad, padTop }; return; }
    this._pendingFit = null;
    const b = boundsOf(points);
    const [x0, y1] = project(b.minLat, b.minLng), [x1, y0] = project(b.maxLat, b.maxLng);
    const dx = Math.max(x1 - x0, 1e-9), dy = Math.max(y1 - y0, 1e-9);
    const availH = Math.max(40, this.H - pad - padTop);
    const z = Math.log2(Math.min((this.W - pad * 2) / (dx * TILE), availH / (dy * TILE)));
    this.zoom = clamp(Math.min(z, 17), MIN_Z, MAX_Z);
    const ws = TILE * 2 ** this.zoom;
    this.cx = (x0 + x1) / 2; this.cy = (y0 + y1) / 2 - (padTop - pad) / 2 / ws;
    this.dirty = true;
  }
  centerOn(lat, lng, zoom) {
    [this.cx, this.cy] = project(lat, lng);
    if (zoom != null) this.zoom = zoom;
    this.dirty = true;
  }

  // ---------- Etkileşim ----------
  zoomBy(dz) { this._zoomTo(clamp(Math.round(this.zoom + dz), MIN_Z, MAX_Z), this.W / 2, this.H / 2, 250); }

  _zoomTo(z, px, py, ms = 0) {
    z = clamp(z, MIN_Z, MAX_Z);
    if (this.follow && this.pos) { px = this.W / 2; py = this.H / 2; }
    const from = { zoom: this.zoom, cx: this.cx, cy: this.cy };
    const ws0 = TILE * 2 ** from.zoom;
    const wx = from.cx + (px - this.W / 2) / ws0, wy = from.cy + (py - this.H / 2) / ws0;
    const target = zz => {
      if (this.follow && this.pos) return this.pos.p;
      const ws = TILE * 2 ** zz; return [wx - (px - this.W / 2) / ws, wy - (py - this.H / 2) / ws];
    };
    if (!ms) { this.zoom = z; [this.cx, this.cy] = target(z); this.dirty = true; return; }
    const t0 = performance.now();
    this._animKind = 'zoom';
    this.anim = now => {
      const f = clamp((now - t0) / ms, 0, 1), e = 1 - (1 - f) ** 3;
      this.zoom = from.zoom + (z - from.zoom) * e;
      [this.cx, this.cy] = target(this.zoom);
      return f < 1;
    };
  }
  _panTo([x, y], ms = 300) {
    const fx = this.cx, fy = this.cy, t0 = performance.now();
    if (this.anim && this._animKind === 'zoom') { this.cx = x; this.cy = y; return; }
    this._animKind = 'pan';
    this.anim = now => {
      const f = clamp((now - t0) / ms, 0, 1), e = 1 - (1 - f) ** 3;
      this.cx = fx + (x - fx) * e; this.cy = fy + (y - fy) * e;
      return f < 1;
    };
  }

  _bindInput() {
    const c = this.canvas;
    let pinch = null, lastTap = null, moved = 0;
    const local = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const stopFollow = () => { if (this.follow) { this.follow = false; this.recenterBtn.classList.toggle('hide', !this.o.follow); this.o.onFollowChange?.(false); } };
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, local(e));
      this.anim = null;
      moved = 0;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const ws = TILE * 2 ** this.zoom;
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z: this.zoom,
          wx: this.cx + (mid[0] - this.W / 2) / ws, wy: this.cy + (mid[1] - this.H / 2) / ws };
      }
    });
    c.addEventListener('pointermove', e => {
      if (!this.pointers.has(e.pointerId)) return;
      const prev = this.pointers.get(e.pointerId), cur = local(e);
      this.pointers.set(e.pointerId, cur);
      if (this.pointers.size >= 2 && pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.zoom = clamp(pinch.z + Math.log2(d / pinch.d), MIN_Z, MAX_Z);
        const ws = TILE * 2 ** this.zoom;
        if (this.follow && this.pos) { /* takipte merkez konumda kalır */ }
        else { this.cx = pinch.wx - (mid[0] - this.W / 2) / ws; this.cy = pinch.wy - (mid[1] - this.H / 2) / ws; }
        moved += 10;
        this.dirty = true;
      } else if (this.pointers.size === 1) {
        const dx = cur[0] - prev[0], dy = cur[1] - prev[1];
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 6) {
          stopFollow();
          const ws = TILE * 2 ** this.zoom;
          this.cx -= dx / ws; this.cy -= dy / ws;
          this.dirty = true;
        }
      }
    });
    const up = e => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) pinch = null;
      if (e.type === 'pointerup' && moved < 8 && this.pointers.size === 0) {
        const now = performance.now();
        if (lastTap && now - lastTap.t < 320 && Math.hypot(p[0] - lastTap.p[0], p[1] - lastTap.p[1]) < 30) {
          this._zoomTo(Math.round(this.zoom) + 1, p[0], p[1], 250);
          lastTap = null;
        } else lastTap = { t: now, p };
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const [px, py] = local(e);
      this.anim = null;
      this._zoomTo(this.zoom - e.deltaY * 0.0025, px, py, 0);
    }, { passive: false });
    c.addEventListener('dblclick', e => e.preventDefault());
  }

  // ---------- Çizim ----------
  _loop(now) {
    if (this.destroyed) return;
    if (this.anim) { if (!this.anim(now)) { this.anim = null; this._animKind = null; } this.dirty = true; }
    if (this.dirty) { this.dirty = false; this.draw(now); }
    this.raf = requestAnimationFrame(this._loop);
  }

  draw(now = performance.now()) {
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ws = TILE * 2 ** this.zoom;
    const ox = this.cx * ws - W / 2, oy = this.cy * ws - H / 2;
    const toScreen = (x, y) => [x * ws - ox, y * ws - oy];

    // Zemin (CARTO koyu karo tonuna yakın)
    ctx.fillStyle = cssVar('--bg-2', '#141417');
    ctx.fillRect(0, 0, W, H);

    const drewTiles = this._drawTiles(ws, ox, oy);
    if (!drewTiles) this._drawGrid(ws, ox, oy);

    if (this.route) this._drawRoute(toScreen);
    if (this.pos) this._drawPos(toScreen, ws);

    this.offlineBadge.classList.toggle('hide', !tilesOffline());
  }

  _drawTiles(ws, ox, oy) {
    const { ctx, W, H } = this;
    const tz = clamp(Math.round(this.zoom), MIN_Z, MAX_Z);
    const scale = 2 ** (this.zoom - tz), ts = TILE * scale;
    const x0 = Math.floor(ox / ts), y0 = Math.floor(oy / ts), x1 = Math.floor((ox + W) / ts), y1 = Math.floor((oy + H) / ts);
    const redraw = () => { this.dirty = true; };
    let any = false;
    ctx.imageSmoothingEnabled = true;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const sx = tx * ts - ox, sy = ty * ts - oy;
        const t = getTile(tz, tx, ty, redraw);
        if (!t) continue;
        if (t.ok) { ctx.drawImage(t.img, sx, sy, ts + 0.5, ts + 0.5); any = true; continue; }
        // Ebeveyn karodan geçici görüntü
        for (let up = 1; up <= 4 && tz - up >= MIN_Z; up++) {
          const pz = tz - up, f = 2 ** up;
          const px = Math.floor(tx / f), py = Math.floor(ty / f);
          const n = 1 << pz;
          const key = pz + '/' + (((px % n) + n) % n) + '/' + py;
          const pt = cache.get(key);
          if (pt?.ok) {
            const sub = pt.img.naturalWidth / f;
            ctx.drawImage(pt.img, (tx - px * f) * sub, (ty - py * f) * sub, sub, sub, sx, sy, ts + 0.5, ts + 0.5);
            any = true;
            break;
          }
        }
      }
    }
    return any;
  }

  _drawGrid(ws, ox, oy) {
    const { ctx, W, H } = this;
    // Karo yokken yön duygusu için dünya hizalı ince ızgara (~56-112 px)
    const k = Math.ceil(Math.log2(ws / 112));
    const step = ws / 2 ** k;
    const startX = Math.floor(ox / step), startY = Math.floor(oy / step);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = startX; i * step - ox <= W; i++) { const x = Math.round(i * step - ox) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let j = startY; j * step - oy <= H; j++) { const y = Math.round(j * step - oy) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.stroke();
  }

  _drawRoute(toScreen) {
    const { ctx } = this;
    const { proj, breaks, bucket, n } = this.route;
    if (n < 1) return;
    const S = proj.map(p => toScreen(p[0], p[1]));
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (i === 0 || breaks.has(i)) ctx.moveTo(S[i][0], S[i][1]); else ctx.lineTo(S[i][0], S[i][1]);
      }
    };
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // Koyu kenarlık: her zeminde okunabilirlik
    path();
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 7.5; ctx.stroke();
    // Tempoya göre renkli çizgi (renk kovalarına göre toplu çizim)
    ctx.lineWidth = 4.5;
    for (let b = 0; b < BUCKETS; b++) {
      ctx.strokeStyle = rampColor(b / (BUCKETS - 1));
      ctx.beginPath();
      let has = false;
      for (let i = 1; i < n; i++) {
        if (breaks.has(i) || bucket[i] !== b) continue;
        ctx.moveTo(S[i - 1][0], S[i - 1][1]); ctx.lineTo(S[i][0], S[i][1]);
        has = true;
      }
      if (has) ctx.stroke();
    }
    ctx.restore();

    // Başlangıç: yeşil nokta
    this._marker(S[0][0], S[0][1], cssVar('--lime', '#3fd17f'));
    // Bitiş: dama bayrağı (canlı modda gösterilmez)
    if (!this.o.live && n > 1) {
      const [ex, ey] = S[n - 1];
      ctx.save();
      ctx.translate(ex, ey);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.clip();
      for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) {
        ctx.fillStyle = (i + j) & 1 ? '#111' : '#fff';
        ctx.fillRect(i * 2.5, j * 2.5, 2.5, 2.5);
      }
      ctx.restore();
    }
  }

  _marker(x, y, color) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawPos(toScreen, ws) {
    const { ctx } = this;
    const { p, acc, heading, lat } = this.pos;
    const [x, y] = toScreen(p[0], p[1]);
    const mpp = metersPerPx(lat, ws);
    const accent = hexRgb(cssVar('--accent', '#ff7a1a')) || [255, 122, 26];
    const A = a => `rgba(${accent.join(',')},${a})`;
    ctx.save();
    if (acc) {
      const r = clamp(acc / mpp, 0, 600);
      if (r > 11) {
        ctx.fillStyle = A(0.12); ctx.strokeStyle = A(0.4); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    if (heading != null && Number.isFinite(heading)) {
      const a = (heading - 90) * Math.PI / 180;
      const g = ctx.createRadialGradient(x, y, 6, x, y, 40);
      g.addColorStop(0, A(0.45)); g.addColorStop(1, A(0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 40, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.arc(x, y + 1, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, 9.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = A(1);
    ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
/** Liste küçük resmi: rotanın SVG çizimi (karo yok) */
export function routeThumb(points, breaks = [], { w = 64, h: hh = 64, pad = 6 } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${hh}`);
  s.setAttribute('width', w); s.setAttribute('height', hh);
  s.setAttribute('class', 'rn-thumb');
  s.setAttribute('aria-hidden', 'true');
  if (!points || points.length < 2) return s;
  const step = Math.max(1, Math.floor(points.length / 160));
  const pr = [];
  for (let i = 0; i < points.length; i += step) pr.push([project(points[i][0], points[i][1]), i]);
  pr.push([project(points[points.length - 1][0], points[points.length - 1][1]), points.length - 1]);
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const [[x, y]] of pr) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const sc = Math.min((w - pad * 2) / Math.max(x1 - x0, 1e-9), (hh - pad * 2) / Math.max(y1 - y0, 1e-9));
  const offX = (w - (x1 - x0) * sc) / 2, offY = (hh - (y1 - y0) * sc) / 2;
  const br = new Set(breaks);
  let d = '', prevI = -1;
  for (const [[x, y], i] of pr) {
    let isBreak = false;
    for (let k = prevI + 1; k <= i; k++) if (br.has(k)) isBreak = true;
    d += (d === '' || isBreak ? 'M' : 'L') + ((x - x0) * sc + offX).toFixed(1) + ' ' + ((y - y0) * sc + offY).toFixed(1);
    prevI = i;
  }
  s.innerHTML = `<path d="${d}" fill="none" style="stroke:var(--accent)" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
}

export { unproject };
