// Koşu modülü — GPS takip motoru (tekil). Rota değişse de çalışmaya devam eder; ekranlar yalnızca abone olur.
import { load, save, remove } from '../../core/store.js';
import { uid, clamp, fmt } from '../../core/ui.js';
import { kcalFromMET } from '../../core/profile.js';
import { awardXP } from '../../core/xp.js';
import { haversine, bearing, advanceSplits, computeSplits, simplify } from './geo.js';
import { typeOf, metFor, getSettings, putRun, defaultTitle, durWords, paceOf } from './data.js';
import { speak, vibrate } from './voice.js';

const ACTIVE_KEY = 'run.active';
export const MAX_ACC = 35;          // bundan kötü doğruluktaki konumlar rotaya eklenmez (m)
const PACE_WINDOW = 25;             // anlık tempo penceresi (sn)
const AUTO_PAUSE_AFTER = 10000;     // bu kadar hareketsizlikte otomatik duraklat (ms)
const SAVE_EVERY = 5000;            // yarım oturumu kaydetme aralığı (ms)
const STALE_RESTORE = 30 * 60000;   // bu kadar eski "çalışıyor" oturum geri yüklenirken duraklatılır

const r6 = x => Math.round(x * 1e6) / 1e6;

class Tracker {
  constructor() {
    this.subs = new Set();
    this.gps = { status: 'off', fix: null, acc: null, ts: 0, heading: null, error: null };
    this.s = null;
    this.cum = [];
    this.mt = [];
    this.breakSet = new Set();
    this.holders = new Set();
    this.watchId = null;
    this.timer = null;
    this.wake = null;
    this.lastSave = 0;
    this.spikes = 0;
    this.lastMoveTs = 0;
    this.prevRaw = null;
    this.lastAcc = null;
    this.flash = null; // son bölüm bildirimi { split, ts }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { if (this.s?.status === 'running') this._wakeOn(); }
      else this.persist(true);
    });
    window.addEventListener('pagehide', () => this.persist(true));
  }

  // ---------- Abonelik ----------
  on(cb) { this.subs.add(cb); return () => this.subs.delete(cb); }
  emit(type) { for (const cb of [...this.subs]) { try { cb(type, this); } catch (e) { console.error(e); } } }

  get status() { return this.s?.status || 'idle'; }
  get active() { return this.s?.status === 'running' || this.s?.status === 'paused'; }

  // ---------- GPS ----------
  /** Ekran GPS önizlemesi isteyince çağırır; bırakma fonksiyonu döner. */
  hold(reason = 'view') {
    const token = reason + ':' + uid();
    this.holders.add(token);
    this._ensureWatch();
    return () => { this.holders.delete(token); this._maybeStopWatch(); };
  }
  _ensureWatch() {
    if (this.watchId != null) return;
    if (!('geolocation' in navigator)) { this.gps.status = 'unsupported'; this.emit('gps'); return; }
    if (this.gps.status === 'off' || this.gps.status === 'denied' || this.gps.status === 'error') this.gps.status = 'searching';
    try {
      this.watchId = navigator.geolocation.watchPosition(p => this._onPos(p), e => this._onErr(e),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    } catch (e) { this.gps.status = 'error'; this.gps.error = String(e?.message || e); }
    this.emit('gps');
  }
  _maybeStopWatch() {
    if (this.holders.size || this.active || this.watchId == null) return;
    try { navigator.geolocation.clearWatch(this.watchId); } catch { /* yok */ }
    this.watchId = null;
    if (this.gps.status !== 'denied') this.gps.status = 'off';
    this.emit('gps');
  }
  /** İzin reddedildikten sonra yeniden denemek için */
  retryGps() {
    if (this.watchId != null) { try { navigator.geolocation.clearWatch(this.watchId); } catch { /* yok */ } this.watchId = null; }
    this.gps.status = 'searching';
    this._ensureWatch();
  }
  _onPos(p) {
    const c = p.coords;
    // Zaman olarak cihaz saatini kullanıyoruz: bazı cihazlar konum zaman damgasını hatalı/eski verir.
    this.feed({ lat: c.latitude, lng: c.longitude, acc: c.accuracy, alt: c.altitude, altAcc: c.altitudeAccuracy,
      heading: c.heading, speed: c.speed, t: Date.now() });
  }
  _onErr(e) {
    if (e.code === 1) { this.gps.status = 'denied'; this.gps.error = 'Konum izni verilmedi.'; }
    else if (e.code === 3) { if (!this.gps.fix) this.gps.status = 'searching'; }
    else { this.gps.status = 'error'; this.gps.error = 'Konum alınamıyor.'; }
    this.emit('gps');
  }

  /** Bir konum ölçümünü işler (gerçek GPS ya da test kancası). */
  feed(f) {
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng)) return;
    f.acc = Number.isFinite(f.acc) ? f.acc : 50;
    f.t = f.t ?? Date.now();
    const g = this.gps;
    g.fix = f; g.acc = f.acc; g.ts = f.t; g.error = null;
    g.status = f.acc <= 12 ? 'strong' : f.acc <= 22 ? 'good' : f.acc <= MAX_ACC ? 'fair' : 'weak';
    if (Number.isFinite(f.heading) && (f.speed ?? 0) > 0.6) g.heading = f.heading;
    if (this.s?.status === 'running') this._track(f);
    this.emit('fix');
  }

  // ---------- Kayıt ----------
  start(type = getSettings().type) {
    if (this.active) return;
    const now = Date.now();
    const st = getSettings();
    this.s = {
      v: 1, id: uid(), type, status: 'running', startTs: now, endTs: null,
      activeMs: 0, runSince: now, autoPaused: false, newSeg: true,
      points: [], breaks: [], distM: 0, elevGainM: 0, elevLossM: 0, metMin: 0, maxSpeed: 0,
      altS: null, altRef: null, splits: [], mark: { t: 0, alt: null },
      targetPace: st.targetPace || null, rejected: 0, savedAt: now,
    };
    this._rebuild();
    this.lastMoveTs = now;
    this.prevRaw = null;
    this._ensureWatch();
    this._startTimer();
    this._wakeOn();
    // Son konum yeterince taze ve iyiyse başlangıç noktası olarak kullan
    const g = this.gps.fix;
    if (g && now - g.t < 5000 && g.acc <= MAX_ACC) this._track({ ...g, t: now });
    vibrate([60, 40, 60]);
    speak(`${typeOf(type).label} başladı. İyi antrenmanlar.`, { interrupt: true });
    this.persist(true);
    this.emit('status');
  }

  pause() {
    const s = this.s;
    if (!s || s.status !== 'running') return;
    const now = Date.now();
    if (s.runSince) s.activeMs += now - s.runSince;
    s.runSince = null; s.autoPaused = false; s.status = 'paused'; s.newSeg = true;
    this._wakeOff();
    vibrate(80);
    speak('Duraklatıldı.', { interrupt: true });
    this.persist(true);
    this.emit('status');
  }

  resume() {
    const s = this.s;
    if (!s || s.status !== 'paused') return;
    const now = Date.now();
    s.status = 'running'; s.runSince = now; s.newSeg = true; s.autoPaused = false;
    this.lastMoveTs = now;
    this._ensureWatch();
    this._wakeOn();
    vibrate([40, 30, 40]);
    speak('Devam ediliyor.', { interrupt: true });
    this.persist(true);
    this.emit('status');
  }

  finish() {
    const s = this.s;
    if (!s || !this.active) return;
    const now = Date.now();
    if (s.runSince) s.activeMs += now - s.runSince;
    s.runSince = null; s.autoPaused = false; s.status = 'finished'; s.endTs = now;
    const total = s.activeMs / 1000;
    const rem = s.distM - s.splits.length * 1000;
    if (rem >= 50) {
      const last = s.points[s.points.length - 1];
      s.splits.push({ n: s.splits.length + 1, distM: Math.round(rem), sec: Math.round((total - s.mark.t) * 10) / 10,
        elev: last?.[3] != null && s.mark.alt != null ? Math.round(last[3] - s.mark.alt) : null, partial: true });
    }
    this._stopTimer();
    this._wakeOff();
    this._maybeStopWatch();
    vibrate([100, 60, 100, 60, 200]);
    const pace = paceOf(s.distM, total);
    speak(`Aktivite bitti. ${fmt.n(s.distM / 1000, 2).replace(',', ' virgül ')} kilometre, süre ${durWords(total)}.` +
      (s.distM > 200 && !typeOf(s.type).speedMode ? ` Ortalama tempo ${durWords(pace)}.` : ''), { interrupt: true });
    this.persist(true);
    this.emit('status');
  }

  discard() {
    this.s = null;
    this._rebuild();
    this._stopTimer();
    this._wakeOff();
    remove(ACTIVE_KEY);
    this._maybeStopWatch();
    this.emit('status');
  }

  /** Biten oturumu kalıcı kayda dönüştürür ve kaydeder. { run, ok } döner. */
  saveFinished({ title, note } = {}) {
    const s = this.s;
    if (!s || s.status !== 'finished') return null;
    const run = buildRun(s, { title, note });
    const ok = putRun(run);
    const T = typeOf(s.type);
    run.xp = Math.round(10 + (run.distM / 1000) * T.xpPerKm);
    if (run.distM >= 100) awardXP(run.xp, `${T.label} · ${fmt.n(run.distM / 1000, 2)} km`, { once: 'run-' + run.id });
    else run.xp = 0;
    putRun(run);
    this.s = null;
    this._rebuild();
    remove(ACTIVE_KEY);
    this.emit('status');
    return { run, ok };
  }

  // ---------- Türetilmiş değerler ----------
  movingSec(now = Date.now()) {
    const s = this.s;
    if (!s) return 0;
    return (s.activeMs + (s.runSince ? Math.max(0, now - s.runSince) : 0)) / 1000;
  }
  elapsedSec(now = Date.now()) {
    const s = this.s;
    return s ? ((s.endTs || now) - s.startTs) / 1000 : 0;
  }
  kcal() { return this.s ? kcalFromMET(this.s.metMin, 1) : 0; }
  /** Anlık hız (m/sn), son ~25 sn penceresi */
  currentSpeed(now = Date.now()) {
    const s = this.s;
    if (!s || s.status !== 'running' || s.autoPaused) return 0;
    const pts = s.points, n = pts.length - 1;
    if (n < 1 || now - pts[n][2] > 12000) return 0;
    let k = n;
    while (k > 0 && !this.breakSet.has(k) && this.mt[n] - this.mt[k - 1] <= PACE_WINDOW) k--;
    const dt = this.mt[n] - this.mt[k], dd = this.cum[n] - this.cum[k];
    if (dt < 4 || dd < 5) {
      const sp = this.gps.fix?.speed;
      return Number.isFinite(sp) && sp > 0 ? sp : 0;
    }
    return dd / dt;
  }
  avgSpeed() { const t = this.movingSec(); return t > 0 ? this.s.distM / t : 0; }
  /** Hedef tempoya göre fark (sn): + önde, − geride */
  pacerDelta() {
    const s = this.s;
    if (!s?.targetPace || s.distM < 30) return null;
    const expected = (s.distM / 1000) * s.targetPace;
    const sec = expected - this.movingSec();
    return { sec, meters: sec / s.targetPace * 1000 };
  }
  heading() {
    const pts = this.s?.points;
    if (this.gps.heading != null) return this.gps.heading;
    if (pts && pts.length >= 2) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      return bearing(a[0], a[1], b[0], b[1]);
    }
    return null;
  }

  // ---------- İç işleyiş ----------
  _track(f) {
    const s = this.s, T = typeOf(s.type);
    if (f.acc > MAX_ACC) { s.rejected++; return; }
    const raw = this.prevRaw;
    this.prevRaw = f;
    const rawSpeed = raw && f.t > raw.t ? haversine(raw.lat, raw.lng, f.lat, f.lng) / ((f.t - raw.t) / 1000) : 0;
    const pts = s.points, last = pts[pts.length - 1];

    if (!last || s.newSeg) {
      if (s.autoPaused) return;
      if (last) { s.breaks.push(pts.length); this.breakSet.add(pts.length); }
      s.newSeg = false;
      this._push(f, 0);
      this.lastMoveTs = f.t;
      return;
    }
    const dt = (f.t - last[2]) / 1000;
    if (dt < 0.5) return;
    const d = haversine(last[0], last[1], f.lat, f.lng);
    const v = d / dt;
    if (v > T.maxSpeed) {
      // Ardışık sıçramalar gerçek bir yer değişimiyse (ör. tünel çıkışı) yeni segment başlat
      if (++this.spikes >= 5) { this.spikes = 0; s.breaks.push(pts.length); this.breakSet.add(pts.length); this._push(f, 0); }
      s.rejected++;
      return;
    }
    this.spikes = 0;
    const minStep = clamp(Math.max(f.acc, this.lastAcc ?? f.acc) * 0.35, 2.5, 10);
    if (d < minStep) return; // durağan titreşim
    if (s.autoPaused) {
      const moving = Math.max(rawSpeed, f.speed ?? 0) > T.autoPause;
      if (!moving && d < minStep * 2) return;
      s.autoPaused = false; s.runSince = f.t;
      vibrate([40, 30, 40]);
      this.emit('status');
    }
    this.lastMoveTs = f.t;
    this._push(f, d);
  }

  _push(f, d) {
    const s = this.s;
    const alt = Number.isFinite(f.alt) && (f.altAcc == null || f.altAcc < 40) ? Math.round(f.alt * 10) / 10 : null;
    const mt = Math.round(this.movingSec(f.t) * 10) / 10;
    s.points.push([r6(f.lat), r6(f.lng), f.t, alt, mt]);
    const n = s.points.length - 1;
    this.cum.push((n ? this.cum[n - 1] : 0) + d);
    this.mt.push(mt);
    this.lastAcc = f.acc;
    s.distM += d;
    if (n > 0 && d > 0) {
      const dmt = mt - this.mt[n - 1];
      if (dmt > 0) s.metMin += metFor(s.type, d / dmt) * dmt / 60;
    }
    this._elev(alt);
    const v = this.currentSpeed(f.t);
    if (v > s.maxSpeed && v < typeOf(s.type).maxSpeed) s.maxSpeed = v;
    advanceSplits(s, s.points, this.cum, this.mt, n, sp => this._announce(sp));
    s.dirty = true;
  }

  _elev(alt) {
    const s = this.s;
    if (alt == null) return;
    if (s.altS == null) { s.altS = s.altRef = alt; return; }
    s.altS += 0.3 * (alt - s.altS);
    if (s.altS - s.altRef >= 3) { s.elevGainM += s.altS - s.altRef; s.altRef = s.altS; }
    else if (s.altRef - s.altS >= 3) { s.elevLossM += s.altRef - s.altS; s.altRef = s.altS; }
  }

  _announce(sp) {
    const s = this.s, T = typeOf(s.type);
    this.flash = { split: sp, ts: Date.now() };
    vibrate([200, 100, 200]);
    let txt = `${sp.n} kilometre. Süre ${durWords(this.movingSec())}. `;
    txt += T.speedMode ? `Son kilometre hızı ${Math.round(3600 / sp.sec)} kilometre saat.` : `Son kilometre temposu ${durWords(sp.sec)}.`;
    const pd = this.pacerDelta();
    if (pd && Math.abs(pd.sec) >= 3) txt += ` Hedefin ${durWords(Math.abs(pd.sec))} ${pd.sec > 0 ? 'önündesin' : 'gerisindesin'}.`;
    speak(txt);
    this.emit('split');
  }

  _rebuild() {
    const s = this.s;
    this.cum = []; this.mt = []; this.breakSet = new Set(s?.breaks || []);
    if (!s) return;
    const t0 = s.points[0]?.[2] || 0;
    s.points.forEach((p, i) => {
      const prev = s.points[i - 1];
      this.cum.push(i === 0 ? 0 : this.cum[i - 1] + (this.breakSet.has(i) ? 0 : haversine(prev[0], prev[1], p[0], p[1])));
      this.mt.push(p[4] ?? (p[2] - t0) / 1000);
    });
  }

  _startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this._tick(), 1000);
  }
  _stopTimer() { clearInterval(this.timer); this.timer = null; }

  _tick() {
    const s = this.s;
    if (!s) return this._stopTimer();
    const now = Date.now();
    if (s.status === 'running' && !s.autoPaused && getSettings().autoPause && s.points.length &&
        now - this.lastMoveTs > AUTO_PAUSE_AFTER) {
      s.activeMs += now - s.runSince; s.runSince = null; s.autoPaused = true;
      vibrate(80);
      this.emit('status');
    }
    if (now - this.lastSave >= SAVE_EVERY) this.persist();
    this.emit('tick');
  }

  persist(force = false) {
    const s = this.s;
    if (!s) return;
    if (!force && !s.dirty && s.status !== 'running') return;
    s.dirty = false;
    s.savedAt = Date.now();
    this.lastSave = s.savedAt;
    save(ACTIVE_KEY, s);
  }

  /** Açılışta yarım kalan oturumu geri yükler */
  restore() {
    const s = load(ACTIVE_KEY, null);
    if (!s || !Array.isArray(s.points) || !s.id || !['running', 'paused', 'finished'].includes(s.status)) return false;
    s.breaks ||= []; s.splits ||= []; s.mark ||= { t: 0, alt: null };
    if (s.status === 'running' && Date.now() - (s.savedAt || 0) > STALE_RESTORE) {
      if (s.runSince) s.activeMs += Math.max(0, (s.savedAt || s.runSince) - s.runSince);
      s.runSince = null; s.autoPaused = false; s.status = 'paused'; s.newSeg = true;
    }
    if (s.status === 'running') { s.newSeg = true; if (s.autoPaused) { s.autoPaused = false; s.runSince = Date.now(); } }
    this.s = s;
    this._rebuild();
    this.lastMoveTs = Date.now();
    if (this.active) {
      this._startTimer();
      this._ensureWatch();
      if (s.status === 'running') this._wakeOn();
    }
    this.emit('status');
    return true;
  }

  // ---------- Ekran kilidi engelleme ----------
  async _wakeOn() {
    try {
      if (!('wakeLock' in navigator) || this.wake || document.visibilityState !== 'visible') return;
      const w = await navigator.wakeLock.request('screen');
      if (this.s?.status !== 'running') { w.release(); return; }
      this.wake = w;
      w.addEventListener('release', () => { if (this.wake === w) this.wake = null; });
    } catch { /* desteklenmiyor veya reddedildi */ }
  }
  _wakeOff() {
    try { this.wake?.release(); } catch { /* yok */ }
    this.wake = null;
  }
}

/** Oturumdan kalıcı kayıt nesnesi üretir (noktalar sadeleştirilir, istatistikler tam veriden) */
export function buildRun(s, { title, note } = {}) {
  const movingSec = Math.round(s.activeMs / 1000);
  const simp = simplify(s.points, s.breaks, 1.5, 15);
  const splits = s.splits?.length ? s.splits : computeSplits(s.points, s.breaks, movingSec);
  return {
    id: s.id, type: s.type,
    title: (title || '').trim() || defaultTitle(s.type, s.startTs),
    note: (note || '').trim(),
    startTs: s.startTs, endTs: s.endTs || Date.now(),
    movingSec, elapsedSec: Math.round(((s.endTs || Date.now()) - s.startTs) / 1000),
    distM: Math.round(s.distM * 10) / 10,
    elevGainM: Math.round(s.elevGainM || 0), elevLossM: Math.round(s.elevLossM || 0),
    kcal: kcalFromMET(s.metMin || 0, 1),
    maxSpeed: Math.round((s.maxSpeed || 0) * 100) / 100,
    targetPace: s.targetPace || null,
    points: simp.points, breaks: simp.breaks, splits,
  };
}

export const tracker = new Tracker();

// Test/hata ayıklama kancası: konsoldan sahte konum beslemek için
try { window.__novaRun = { tracker, feed: f => tracker.feed({ ...f }) }; } catch { /* yok */ }
