// Telefon ivmeölçeri ile adım algılama (DeviceMotionEvent).
// - StepDetector: saf algoritma (DOM yok) → test edilebilir.
// - pedometer: tekil sensör yöneticisi (start/stop/subscribe); sekme değişse de saymaya devam eder.
// - wakeLock: "ekranı açık tut" yardımcısı.

export const CFG = {
  lpTauMs: 45,          // alçak geçiren filtre zaman sabiti (~3.5 Hz kesim)
  baseTauMs: 1400,      // yerçekimi / DC tabanı takibi
  minAmp: 1.0,          // m/s² — tepe-dip genliği alt sınırı
  ampFactor: 0.42,      // dinamik eşik = ampFactor × ortalama adım genliği
  minIntervalMs: 250,   // en hızlı geçerli adım aralığı
  maxIntervalMs: 2000,  // en yavaş geçerli adım aralığı
  runLength: 5,         // sayıma başlamak için gereken ardışık düzenli adım
  tolerance: 0.25,      // aralık düzenliliği (ortalamadan ±%25)
  ampSpread: 2.4,       // genlik tutarlılığı (ortalamanın 1/x … x katı)
  resetGapMs: 500,      // bu kadar veri gelmezse filtre sıfırlanır (sekme gizlendi vb.)
};

export class StepDetector {
  /** onSteps(times: number[]) — her adımın (performance.now tabanlı) zamanı */
  constructor(onSteps = () => {}, cfg = {}) {
    this.cfg = { ...CFG, ...cfg };
    this.onSteps = onSteps;
    this.avgAmp = 2.5;
    this.avgInt = 0;
    this.reset();
  }

  reset() {
    this.lastT = null; this.lp = 0; this.base = 0; this.signal = 0;
    this.mode = 'valley'; this.pk = -Infinity; this.pkT = 0; this.vl = 0;
    this.run = [];
    this.counting = false; this.lastStepT = null; this.fastHits = 0; this.badHits = 0;
  }

  get threshold() { return Math.max(this.cfg.minAmp, this.cfg.ampFactor * this.avgAmp); }
  /** Yürüyüş kilitli mi (son adım yakın zamanda mı) */
  get locked() { return this.counting; }

  /** mag: ivme büyüklüğü (m/s²), t: ms */
  push(mag, t) {
    const c = this.cfg;
    if (!Number.isFinite(mag) || !Number.isFinite(t)) return;
    if (this.lastT == null || t - this.lastT > c.resetGapMs || t < this.lastT) {
      const keepCounting = this.counting && this.lastStepT != null && t - this.lastStepT < c.maxIntervalMs;
      this.lp = mag; this.base = mag; this.lastT = t; this.signal = 0;
      this.mode = 'valley'; this.vl = 0; this.pk = -Infinity;
      if (!keepCounting) { this.counting = false; this.run = []; }
      return;
    }
    const dt = Math.max(1, Math.min(100, t - this.lastT));
    this.lastT = t;
    this.lp += (mag - this.lp) * (dt / (c.lpTauMs + dt));
    this.base += (this.lp - this.base) * (dt / (c.baseTauMs + dt));
    const s = this.lp - this.base;
    this.signal = s;

    const thr = this.threshold, hyst = Math.max(0.12, thr * 0.22);
    if (this.mode === 'peak') {
      if (s > this.pk) { this.pk = s; this.pkT = t; }
      else if (s < this.pk - hyst) {
        const amp = this.pk - this.vl;
        if (amp >= thr) this._candidate(this.pkT, amp);
        this.mode = 'valley'; this.vl = s;
      }
    } else if (s < this.vl) this.vl = s;
    else if (s > this.vl + hyst) { this.mode = 'peak'; this.pk = s; this.pkT = t; }

    if (this.counting && t - this.lastStepT > c.maxIntervalMs) this._drop();
  }

  _drop() {
    this.counting = false; this.run = []; this.fastHits = 0; this.badHits = 0;
    this.avgAmp = this.avgAmp * 0.5 + 2.5 * 0.5; // eşiği yavaşça varsayılana döndür
  }

  _candidate(t, amp) {
    const c = this.cfg;
    if (this.counting) {
      const d = t - this.lastStepT;
      if (d < c.minIntervalMs) {
        if (amp < this.avgAmp * 0.6) return;             // ikincil tümsek (topuk vuruşu) — yok say
        if (++this.fastHits >= 3) { this._drop(); this._search(t, amp); }
        return;
      }
      if (d > c.maxIntervalMs) { this._drop(); this._search(t, amp); return; }
      // Kilitliyken de ritim ve genlik tutarlı olmalı; üst üste iki düzensiz tepe → kilit düşer
      const irregular = (this.avgInt && (d < this.avgInt * 0.6 || d > this.avgInt * 1.65)) ||
        amp > this.avgAmp * 2.6 || amp < this.avgAmp / 2.6;
      if (irregular) {
        if (++this.badHits >= 2) { this._drop(); this._search(t, amp); }
        return;
      }
      this.fastHits = 0; this.badHits = 0;
      this.avgInt = this.avgInt ? this.avgInt * 0.8 + d * 0.2 : d;
      this.avgAmp = this.avgAmp * 0.85 + amp * 0.15;
      this.lastStepT = t;
      this.onSteps([t]);
      return;
    }
    this._search(t, amp);
  }

  _search(t, amp) {
    const c = this.cfg, cur = { t, amp };
    const last = this.run[this.run.length - 1];
    if (!last) { this.run = [cur]; return; }
    const d = t - last.t;
    if (d < c.minIntervalMs) {
      if (amp < last.amp * 0.6) return;                   // ikincil tümsek
      this.run = [cur]; return;                           // çok hızlı → sallama, diziyi boz
    }
    if (d > c.maxIntervalMs) { this.run = [cur]; return; }
    if (this.run.length >= 2) {
      const ints = [];
      for (let i = 1; i < this.run.length; i++) ints.push(this.run[i].t - this.run[i - 1].t);
      const mean = ints.reduce((a, b) => a + b, 0) / ints.length;
      const ma = this.run.reduce((a, r) => a + r.amp, 0) / this.run.length;
      if (Math.abs(d - mean) > c.tolerance * mean || amp > ma * c.ampSpread || amp < ma / c.ampSpread) {
        this.run = [last, cur]; return;                   // düzensiz → son iki tepeden yeniden başla
      }
    }
    this.run.push(cur);
    if (this.run.length >= c.runLength) {
      const run = this.run;
      this.counting = true;
      this.lastStepT = t;
      this.fastHits = 0; this.badHits = 0;
      this.avgInt = (run[run.length - 1].t - run[0].t) / (run.length - 1);
      this.avgAmp = this.avgAmp * 0.4 + (run.reduce((a, r) => a + r.amp, 0) / run.length) * 0.6;
      this.run = [];
      this.onSteps(run.map(r => r.t));                    // geriye dönük say
    }
  }
}

// ---------------------------------------------------------------------------
// Sensör yöneticisi (tekil)
const subs = new Set();
const sigSubs = new Set();
let state = 'off';
let attached = false;
let gotData = false;
let noDataTimer = null;
let sessionSteps = 0;
const recent = []; // son adımların perf zamanları (kadans)

const detector = new StepDetector(times => {
  const nowPerf = performance.now(), nowWall = Date.now();
  sessionSteps += times.length;
  for (const t of times) recent.push(t);
  while (recent.length > 40) recent.shift();
  const wall = times.map(t => Math.round(nowWall - (nowPerf - t)));
  emit({ type: 'steps', n: times.length, times: wall, perf: times });
});

function emit(ev) { subs.forEach(cb => { try { cb(ev); } catch (e) { console.error(e); } }); }
function setState(s) {
  if (state === s) return;
  state = s;
  emit({ type: 'state', state: s });
}

function onMotion(e) {
  let a = e.accelerationIncludingGravity;
  if (!a || a.x == null) a = e.acceleration;
  if (!a || a.x == null || a.y == null || a.z == null) return;
  const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  const t = performance.now();
  if (!gotData) { gotData = true; clearTimeout(noDataTimer); }
  if (state !== 'active') setState('active');
  const wasLocked = detector.locked;
  detector.push(mag, t);
  if (wasLocked !== detector.locked) emit({ type: 'lock', locked: detector.locked });
  if (sigSubs.size) sigSubs.forEach(cb => cb(detector.signal, detector.threshold, t));
}

function attach() {
  if (attached) return;
  window.addEventListener('devicemotion', onMotion);
  attached = true;
}
function detach() {
  window.removeEventListener('devicemotion', onMotion);
  attached = false;
}

const needsPermissionApi = () => typeof window !== 'undefined' && typeof window.DeviceMotionEvent?.requestPermission === 'function';

export const pedometer = {
  get state() { return state; },
  get running() { return attached && (state === 'active' || state === 'starting' || state === 'nosensor'); },
  get locked() { return detector.locked && state === 'active'; },
  get sessionSteps() { return sessionSteps; },
  get detector() { return detector; },
  needsPermission: needsPermissionApi,

  /** gesture: kullanıcı dokunuşundan mı çağrıldı (iOS izni için gerekli) */
  async start({ gesture = false } = {}) {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) { setState('unsupported'); return false; }
    if (!window.isSecureContext) { setState('insecure'); return false; }
    if (needsPermissionApi()) {
      if (!gesture) {
        // İzin daha önce verildiyse olaylar gelir ve durum kendiliğinden 'active' olur.
        attach();
        if (!gotData) setState('needs-permission');
        return false;
      }
      try {
        const r = await window.DeviceMotionEvent.requestPermission();
        if (r !== 'granted') { detach(); setState('denied'); return false; }
      } catch {
        setState('needs-permission'); return false;
      }
    }
    attach();
    if (state !== 'active') {
      setState('starting');
      clearTimeout(noDataTimer);
      noDataTimer = setTimeout(() => { if (!gotData && attached) setState('nosensor'); }, 3000);
    }
    return true;
  },

  stop() {
    clearTimeout(noDataTimer);
    detach();
    gotData = false;
    detector.reset();
    recent.length = 0;
    setState('off');
  },

  /** cb({type:'steps'|'state'|'lock', ...}) — abonelikten çıkma fonksiyonu döner */
  subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
  /** Canlı filtrelenmiş sinyal: cb(signal, threshold, perfT) */
  onSignal(cb) { sigSubs.add(cb); return () => sigSubs.delete(cb); },

  /** adım/dk (son ~12 sn) */
  cadence() {
    const now = performance.now();
    if (!recent.length || now - recent[recent.length - 1] > 3000) return 0;
    const win = recent.filter(t => now - t < 12000);
    if (win.length < 3) return 0;
    return Math.round(((win.length - 1) * 60000) / (win[win.length - 1] - win[0]));
  },
};

// ---------------------------------------------------------------------------
// Ekranı açık tut (Screen Wake Lock API)
let lock = null, wantLock = false;
export const wakeLock = {
  get supported() { return typeof navigator !== 'undefined' && 'wakeLock' in navigator; },
  get active() { return !!lock && !lock.released; },
  async set(on) {
    wantLock = on;
    if (!this.supported) return false;
    if (!on) { try { await lock?.release(); } catch { /* yok */ } lock = null; return false; }
    if (this.active) return true;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener?.('release', () => { lock = null; });
      return true;
    } catch { return false; }
  },
};
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantLock && !wakeLock.active) wakeLock.set(true);
  });
}
