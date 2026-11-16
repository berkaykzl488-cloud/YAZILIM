// Koşu modülü — kütüphanesiz canvas harita: Web-Mercator karoları (CARTO koyu), camgöbeği renk tonu,
// tempoya göre renklenen parlak rota, başlangıç/bitiş işaretleri, nabız atan konum, sürükle/yakınlaştır, takip modu.
// Karolar yüklenemezse (çevrimdışı) çizilmiş ızgara zemin kullanılır; rota her durumda görünür.
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

// Tempo renk skalası: yavaş (macenta) -> orta (camgöbeği) -> hızlı (limon)
const STOPS = [[0, [255, 43, 214]], [0.35, [139, 92, 255]], [0.6, [0, 240, 255]], [1, [182, 255, 59]]];
function rampColor(t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i], f = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * f)).join(',')})`;
    }
  }
  return 'rgb(182,255,59)';
}
export const PACE_GRADIENT_CSS = `linear-gradient(90deg, ${STOPS.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`;
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
    this.offlineBadge = h('div', { class: 'rn-map-offline hide' }, icon('globe', { size: 14 }), 'Harita yüklenemedi · ızgara gösteriliyor');
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
    if (this._pendingFit) this.fit(this._pendingFit.points, this._pendingFit.pad);
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
  fit(points, pad = 36) {
    if (!points?.length) return;
    if (this.W < 10 || this.H < 10) { this._pendingFit = { points, pad }; return; }
    this._pendingFit = null;
    const b = boundsOf(points);
    const [x0, y1] = project(b.minLat, b.minLng), [x1, y0] = project(b.maxLat, b.maxLng);
    const dx = Math.max(x1 - x0, 1e-9), dy = Math.max(y1 - y0, 1e-9);
    const z = Math.log2(Math.min((this.W - pad * 2) / (dx * TILE), (this.H - pad * 2) / (dy * TILE)));
    this.zoom = clamp(Math.min(z, 17), MIN_Z, MAX_Z);
    this.cx = (x0 + x1) / 2; this.cy = (y0 + y1) / 2;
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
    // Canlı modda nabız animasyonu ~30 fps ile sınırlı (pil dostu)
    const livePulse = this.o.live && this.pos && now - (this._lastDraw || 0) > 33;
    if (this.dirty || livePulse) { this.dirty = false; this._lastDraw = now; this.draw(now); }
    this.raf = requestAnimationFrame(this._loop);
  }

  draw(now = performance.now()) {
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ws = TILE * 2 ** this.zoom;
    const ox = this.cx * ws - W / 2, oy = this.cy * ws - H / 2;
    const toScreen = (x, y) => [x * ws - ox, y * ws - oy];

    // Zemin
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#020812'); bg.addColorStop(1, '#040616');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const drewTiles = this._drawTiles(ws, ox, oy);
    this._drawGrid(ws, ox, oy, drewTiles);

    // Kenar kararması
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(2,4,10,0)'); vg.addColorStop(1, 'rgba(2,4,10,.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (this.route) this._drawRoute(toScreen);
    if (this.pos) this._drawPos(toScreen, ws, now);

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
    if (any) {
      // Camgöbeği renk tonu: rengi değiştir, hafif aydınlat
      ctx.save();
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = '#00cfff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(0, 60, 90, .22)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return any;
  }

  _drawGrid(ws, ox, oy, overTiles) {
    const { ctx, W, H } = this;
    // ~56-112 px aralıklı dünya hizalı ızgara
    let k = Math.ceil(Math.log2(ws / 112));
    const step = ws / 2 ** k;
    const a = overTiles ? 0.05 : 0.09, A = overTiles ? 0.1 : 0.2;
    const startX = Math.floor(ox / step), startY = Math.floor(oy / step);
    ctx.lineWidth = 1;
    for (let i = startX; i * step - ox <= W; i++) {
      const x = Math.round(i * step - ox) + 0.5;
      ctx.strokeStyle = `rgba(0,240,255,${i % 4 === 0 ? A : a})`;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let j = startY; j * step - oy <= H; j++) {
      const y = Math.round(j * step - oy) + 0.5;
      ctx.strokeStyle = `rgba(0,240,255,${j % 4 === 0 ? A : a})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    if (!overTiles) {
      // Kesişim noktaları
      ctx.fillStyle = 'rgba(0,240,255,.35)';
      for (let i = startX; i * step - ox <= W; i++) {
        if (i % 4) continue;
        for (let j = startY; j * step - oy <= H; j++) {
          if (j % 4) continue;
          ctx.fillRect(Math.round(i * step - ox) - 1, Math.round(j * step - oy) - 1, 3, 3);
        }
      }
    }
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
    // Parlama katmanları
    path();
    ctx.strokeStyle = 'rgba(0,240,255,.10)'; ctx.lineWidth = 16; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,240,255,.18)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = 'rgba(2,6,16,.85)'; ctx.lineWidth = 6; ctx.stroke();
    // Tempoya göre renkli çizgi (renk kovalarına göre toplu çizim)
    ctx.lineWidth = 4;
    ctx.shadowBlur = 8;
    for (let b = 0; b < BUCKETS; b++) {
      const col = rampColor(b / (BUCKETS - 1));
      ctx.strokeStyle = col; ctx.shadowColor = col;
      ctx.beginPath();
      let has = false;
      for (let i = 1; i < n; i++) {
        if (breaks.has(i) || bucket[i] !== b) continue;
        ctx.moveTo(S[i - 1][0], S[i - 1][1]); ctx.lineTo(S[i][0], S[i][1]);
        has = true;
      }
      if (has) ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // İnce beyaz çekirdek
    path();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    // Başlangıç
    const [sx, sy] = S[0];
    this._marker(sx, sy, '#b6ff3b', 'B');
    // Bitiş (canlı modda gösterilmez)
    if (!this.o.live && n > 1) {
      const [ex, ey] = S[n - 1];
      ctx.save();
      ctx.translate(ex, ey);
      ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#0a0414'; ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      // Dama deseni
      ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.clip();
      for (let i = -2; i < 2; i++) for (let j = -2; j < 2; j++) {
        ctx.fillStyle = (i + j) & 1 ? '#ff2bd6' : '#ffffff';
        ctx.fillRect(i * 3.25, j * 3.25, 3.25, 3.25);
      }
      ctx.restore();
    }
  }

  _marker(x, y, color, label) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = '#04100a'; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = '700 11px Rajdhani, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
    ctx.restore();
  }

  _drawPos(toScreen, ws, now) {
    const { ctx } = this;
    const { p, acc, heading, lat } = this.pos;
    const [x, y] = toScreen(p[0], p[1]);
    const mpp = metersPerPx(lat, ws);
    ctx.save();
    // Doğruluk dairesi
    if (acc) {
      const r = clamp(acc / mpp, 0, 400);
      if (r > 12) {
        ctx.fillStyle = 'rgba(0,240,255,.08)'; ctx.strokeStyle = 'rgba(0,240,255,.35)'; ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // Yön konisi
    if (heading != null && Number.isFinite(heading)) {
      const a = (heading - 90) * Math.PI / 180;
      const g = ctx.createRadialGradient(x, y, 4, x, y, 44);
      g.addColorStop(0, 'rgba(0,240,255,.55)'); g.addColorStop(1, 'rgba(0,240,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 44, a - 0.45, a + 0.45); ctx.closePath(); ctx.fill();
    }
    // Nabız halkası
    if (this.o.live) {
      const ph = (now % 1800) / 1800;
      ctx.strokeStyle = `rgba(0,240,255,${0.6 * (1 - ph)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 9 + ph * 26, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#00d8ff';
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
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
  const gid = 'rg' + Math.random().toString(36).slice(2, 8);
  s.innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b6ff3b"/><stop offset=".5" stop-color="#00f0ff"/><stop offset="1" stop-color="#ff2bd6"/></linearGradient></defs>` +
    `<path d="${d}" fill="none" stroke="rgba(0,240,255,.25)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="url(#${gid})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
}

export { unproject };
