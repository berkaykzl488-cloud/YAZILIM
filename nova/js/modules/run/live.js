// Koşu modülü — canlı kayıt ekranı (tam ekran): süre/mesafe/tempo, harita, duraklat/devam/bitir (basılı tut), ekran kilidi.
import { h, icon, mount, fmt, modal, confirmDialog, toast } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { tracker } from './tracker.js';
import { MapView } from './map.js';
import { typeOf, getSettings, setSettings, km, paceText, paceUnit } from './data.js';
import { rIcon, typeIcon, holdButton, roundButton, metric, splitsTable } from './common.js';
import { gpsBars, gpsLevel } from './idle.js';

export function renderLive() {
  const s = tracker.s;
  const T = typeOf(s.type);
  const speedMode = T.speedMode;
  let mode = getSettings().mapMode === 'map' ? 'map' : 'stats';
  let locked = false;

  // ---------- Üst çubuk ----------
  const statusEl = h('div', { class: 'rn-live-status', role: 'status', 'aria-live': 'polite' });
  const gpsEl = h('div', { class: 'rn-live-gps' });
  const top = h('div', { class: 'rn-live-top' },
    h('button', { class: 'rn-iconbtn', type: 'button', 'aria-label': 'Küçült (kayıt devam eder)', onClick: () => go('home') }, rIcon('min', { size: 22 })),
    h('div', { class: 'rn-live-title' }, typeIcon(s.type, 18), h('span', null, T.label)),
    statusEl,
    gpsEl);

  // ---------- Metrikler ----------
  const mTime = metric('Süre', '00:00', '', 'hero');
  const mDist = metric('Mesafe', '0,00', 'km', 'big');
  const mPace = metric(speedMode ? 'Hız' : 'Tempo', '–', paceUnit(s.type), 'big');
  const mAvg = metric(speedMode ? 'Ort. hız' : 'Ort. tempo', '–', paceUnit(s.type));
  const mKcal = metric('Kalori', '0', 'kcal');
  const mElev = metric('Tırmanış', '0', 'm');
  const mLast = metric(speedMode ? 'Son km hızı' : 'Son km', '–', paceUnit(s.type));
  const pacer = h('div', { class: 'rn-pacer hide', role: 'status' });
  const flash = h('div', { class: 'rn-flash hide', role: 'status', 'aria-live': 'assertive' });

  const stats = h('div', { class: 'rn-live-stats' },
    mTime,
    h('div', { class: 'rn-live-grid main' }, mDist, mPace),
    h('div', { class: 'rn-live-grid sub' }, mAvg, mKcal, mElev, mLast),
    pacer);

  // ---------- Harita ----------
  const mapHost = h('div', { class: 'rn-live-map' });
  const layoutBtn = h('button', { class: 'rn-map-btn rn-layout-btn', type: 'button', onClick: () => setMode(mode === 'map' ? 'stats' : 'map') });

  // ---------- Kontroller ----------
  const controls = h('div', { class: 'rn-live-ctrls' });
  const paintControls = () => {
    const st = tracker.status;
    if (st === 'running') {
      mount(controls,
        roundButton({ label: 'Bölümler', iconName: 'list', cls: 'ghost', onClick: showSplits, aria: 'Kilometre bölümlerini göster' }),
        roundButton({ label: 'Duraklat', iconName: 'pause', cls: 'pause', size: 'lg', onClick: () => tracker.pause() }),
        roundButton({ label: 'Kilitle', iconName: 'lock', cls: 'ghost', onClick: () => setLock(true), aria: 'Ekranı kilitle' }));
    } else if (st === 'paused') {
      mount(controls,
        roundButton({ label: 'Sil', iconName: 'trash', cls: 'danger', aria: 'Kaydı silmeden önce sor', onClick: async () => {
          const ok = await confirmDialog('Bu kayıt tamamen silinecek ve geri alınamaz.', { title: 'Kayıt silinsin mi?', okLabel: 'Sil', danger: true });
          if (ok) { tracker.discard(); toast('Kayıt silindi'); }
        } }),
        roundButton({ label: 'Devam et', iconName: 'play', cls: 'go', size: 'lg', onClick: () => tracker.resume() }),
        holdButton({ label: 'Bitir', sub: 'Basılı tut', cls: 'finish', ms: 1200, iconName: 'flag', aria: 'Bitirmek için basılı tut', onDone: () => tracker.finish() }));
    }
  };

  // ---------- Kilit ----------
  const lockLayer = h('div', { class: 'rn-lock hide', 'aria-hidden': 'true' },
    h('div', { class: 'rn-lock-box' },
      h('p', null, 'Ekran kilitli. Kayıt devam ediyor.'),
      holdButton({ label: 'Kilidi aç', sub: 'Basılı tut', cls: 'unlock', ms: 900, iconName: 'unlock', aria: 'Kilidi açmak için basılı tut', onDone: () => setLock(false) })));
  function setLock(on) {
    locked = on;
    lockLayer.classList.toggle('hide', !on);
    lockLayer.setAttribute('aria-hidden', String(!on));
    root.classList.toggle('locked', on);
    if (on) toast('Ekran kilitlendi');
  }

  const root = h('div', { class: 'rn-live', role: 'dialog', 'aria-label': 'Canlı kayıt' },
    top, stats, h('div', { class: 'rn-live-mapwrap' }, mapHost, layoutBtn, flash), controls, lockLayer);
  document.body.appendChild(root);
  document.documentElement.classList.add('rn-noscroll');
  document.body.classList.add('run-live');

  const map = new MapView(mapHost, { follow: true, live: true, zoom: 16, controls: true });
  map.setFollow(true);

  function setMode(m) {
    mode = m;
    setSettings({ mapMode: m });
    root.classList.toggle('mode-map', m === 'map');
    mount(layoutBtn, rIcon(m === 'map' ? 'min' : 'up', { size: 20 }), h('span', null, m === 'map' ? 'Küçült' : 'Büyüt'));
    layoutBtn.setAttribute('aria-label', m === 'map' ? 'Haritayı küçült' : 'Haritayı büyüt');
  }
  setMode(mode);

  function showSplits() {
    const sp = tracker.s?.splits || [];
    modal({ title: 'Bölümler', body: splitsTable(sp, s.type) });
  }

  // ---------- Güncelleme ----------
  let lastRouteN = -1;
  const paint = () => {
    const ss = tracker.s;
    if (!ss) return;
    const now = Date.now();
    const sec = tracker.movingSec(now);
    mTime.set(fmt.duration(sec));
    mDist.set(km(ss.distM));
    const v = tracker.currentSpeed(now);
    mPace.set(speedMode ? fmt.n(v * 3.6, 1) : (v > 0.3 ? fmt.pace(1000 / v) : "–'––\""));
    mAvg.set(ss.distM > 20 ? paceText(ss.type, ss.distM, sec) : '–');
    mKcal.set(fmt.n(tracker.kcal()));
    mElev.set(fmt.n(ss.elevGainM));
    const lastSp = ss.splits[ss.splits.length - 1];
    mLast.set(lastSp ? paceText(ss.type, lastSp.distM, lastSp.sec) : '–');

    const pd = tracker.pacerDelta();
    if (ss.targetPace) {
      pacer.classList.remove('hide');
      if (!pd) mount(pacer, icon('target', { size: 18 }), h('span', null, `Hedef: ${paceText(ss.type, 1000, ss.targetPace)} ${paceUnit(ss.type)}`));
      else {
        const ahead = pd.sec >= 0;
        pacer.className = 'rn-pacer ' + (ahead ? 'ahead' : 'behind');
        mount(pacer, icon(ahead ? 'up' : 'down', { size: 18 }),
          h('span', null, h('b', null, `${fmt.duration(Math.abs(pd.sec))} ${ahead ? 'öndesin' : 'geridesin'}`),
            ` · ${fmt.n(Math.abs(pd.meters), 0)} m · Hedef ${paceText(ss.type, 1000, ss.targetPace)} ${paceUnit(ss.type)}`));
      }
    }

    const st = ss.status;
    statusEl.className = 'rn-live-status ' + (st === 'running' ? (ss.autoPaused ? 'auto' : 'rec') : 'paused');
    mount(statusEl, h('i', { class: 'rn-dot' }), st === 'running' ? (ss.autoPaused ? 'Otomatik duraklatıldı' : 'Kayıt yapılıyor') : 'Duraklatıldı');
    root.classList.toggle('is-paused', st !== 'running');

    const g = tracker.gps;
    mount(gpsEl, gpsBars(g.status), h('span', { class: 'rn-live-gps-t' }, gpsLevel(g.status) ? 'GPS' : 'GPS yok'));
    gpsEl.setAttribute('aria-label', 'GPS sinyali: ' + ({ 4: 'çok iyi', 3: 'iyi', 2: 'orta', 1: 'zayıf' }[gpsLevel(g.status)] || 'yok'));

    if (ss.points.length !== lastRouteN) {
      lastRouteN = ss.points.length;
      map.setRoute(ss.points, ss.breaks);
    }
    if (g.fix) map.setPosition({ lat: g.fix.lat, lng: g.fix.lng, acc: g.fix.acc, heading: tracker.heading() });

    const fl = tracker.flash;
    if (fl && now - fl.ts < 6000) {
      flash.classList.remove('hide');
      mount(flash, h('b', null, `${fl.split.n}. km`), ` · ${paceText(ss.type, fl.split.distM, fl.split.sec)} ${paceUnit(ss.type)}`);
    } else flash.classList.add('hide');
  };

  paintControls();
  paint();
  const off = tracker.on(type => {
    if (type === 'status') paintControls();
    paint();
  });

  return () => {
    off();
    map.destroy();
    root.remove();
    document.documentElement.classList.remove('rn-noscroll');
    document.body.classList.remove('run-live');
    void locked;
  };
}
