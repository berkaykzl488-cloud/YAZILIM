// Koşu modülü — başlangıç ekranı: tür seçimi, GPS durumu, harita önizlemesi, ayarlar, haftalık özet, Başlat.
import { h, icon, mount, fmt, toast, modal, toggle, progressBar, barChart, confirmDialog, promptNumber, stepper, clamp } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { dateKey, addDays } from '../../core/store.js';
import { tracker } from './tracker.js';
import { MapView, routeThumb } from './map.js';
import { TYPE_LIST, typeOf, getSettings, setSettings, getRuns, weekTotals, weekStart, runDay, km, paceText, paceUnit } from './data.js';
import { rIcon, typeIcon, subNav } from './common.js';
import { speak, voiceSupported } from './voice.js';

const GPS_TEXT = {
  off: ['Kapalı', 'GPS kapalı'],
  searching: ['Aranıyor…', 'GPS sinyali aranıyor'],
  strong: ['Çok iyi', 'GPS sinyali: çok iyi'],
  good: ['İyi', 'GPS sinyali: iyi'],
  fair: ['Orta', 'GPS sinyali: orta'],
  weak: ['Zayıf', 'GPS sinyali: zayıf'],
  denied: ['İzin yok', 'Konum izni verilmedi'],
  error: ['Hata', 'Konum alınamıyor'],
  unsupported: ['Desteklenmiyor', 'Bu cihazda GPS yok'],
};
export const gpsLevel = st => ({ strong: 4, good: 3, fair: 2, weak: 1 }[st] || 0);

export function gpsBars(status) {
  const lv = gpsLevel(status);
  return h('span', { class: 'rn-gpsbars lv' + lv, 'aria-hidden': 'true' }, [1, 2, 3, 4].map(i => h('i', { class: i <= lv ? 'on' : '' })));
}

export function renderIdle(el) {
  const st = getSettings();
  let type = st.type;
  let release = null, map = null;
  const cleanups = [];

  // ---------- Tür seçimi ----------
  const typeWrap = h('div', { class: 'rn-types', role: 'radiogroup', 'aria-label': 'Aktivite türü' });
  const paintTypes = () => mount(typeWrap, TYPE_LIST.map(T => h('button', {
    class: 'rn-type' + (T.id === type ? ' active' : ''), type: 'button', role: 'radio', 'aria-checked': String(T.id === type),
    onClick: () => { type = T.id; setSettings({ type }); paintTypes(); paintPace(); },
  }, typeIcon(T.id, 24), h('span', null, T.label))));
  paintTypes();

  // ---------- GPS ----------
  const gpsChip = h('div', { class: 'rn-gpschip', role: 'status', 'aria-live': 'polite' });
  const gpsHelp = h('div', { class: 'rn-gpshelp' });
  const mapHost = h('div', { class: 'rn-idle-map' });

  const startGps = () => { if (!release) release = tracker.hold('idle'); };
  const paintGps = () => {
    const g = tracker.gps;
    const [short] = GPS_TEXT[g.status] || GPS_TEXT.off;
    mount(gpsChip, gpsBars(g.status), h('span', null, 'GPS: ', h('b', null, short)),
      g.acc && gpsLevel(g.status) ? h('span', { class: 'rn-gpsacc' }, '±' + Math.round(g.acc) + ' m') : null);
    gpsChip.className = 'rn-gpschip lv' + gpsLevel(g.status);
    if (g.status === 'denied') {
      mount(gpsHelp, h('div', { class: 'rn-note err' }, icon('alert', { size: 20 }),
        h('div', null, h('b', null, 'Konum izni kapalı'),
          h('p', null, 'Rotanı kaydedebilmek için konum izni gerekiyor. Tarayıcı ayarlarından bu siteye konum izni ver, sonra tekrar dene.'),
          h('button', { class: 'btn sm', type: 'button', onClick: () => tracker.retryGps() }, icon('refresh', { size: 16 }), 'Tekrar dene'))));
    } else if (g.status === 'unsupported' || g.status === 'error') {
      mount(gpsHelp, h('div', { class: 'rn-note err' }, icon('alert', { size: 20 }),
        h('div', null, h('b', null, GPS_TEXT[g.status][1]),
          h('p', null, 'Konum servislerinin açık olduğundan emin ol. Açık alanda sinyal daha hızlı bulunur.'),
          g.status === 'error' ? h('button', { class: 'btn sm', type: 'button', onClick: () => tracker.retryGps() }, icon('refresh', { size: 16 }), 'Tekrar dene') : null)));
    } else if (g.status === 'off') {
      mount(gpsHelp, h('div', { class: 'rn-note' }, rIcon('gps', { size: 20 }),
        h('div', null, h('b', null, 'Konum izni gerekli'),
          h('p', null, 'Mesafe ve rotanı ölçmek için telefonun konumunu kullanırız. Konum yalnızca bu cihazda saklanır.'),
          h('button', { class: 'btn sm primary', type: 'button', onClick: startGps }, rIcon('gps', { size: 16 }), 'Konumu aç'))));
    } else if (g.status === 'searching' || g.status === 'weak') {
      mount(gpsHelp, h('p', { class: 'rn-hint' }, g.status === 'weak'
        ? 'Sinyal zayıf. Açık bir alana geçmek ölçümü iyileştirir.'
        : 'Sinyal aranıyor. Bu birkaç saniye sürebilir; açık alanda daha hızlıdır.'));
    } else mount(gpsHelp);

    if (g.fix && map) {
      const first = !map._hadFix;
      map._hadFix = true;
      map.setPosition({ lat: g.fix.lat, lng: g.fix.lng, acc: g.fix.acc, heading: g.heading });
      if (first) map.centerOn(g.fix.lat, g.fix.lng, 16);
    }
  };

  // ---------- Başlat ----------
  const doStart = () => { tracker.start(type); };
  const startBtn = h('button', { class: 'btn primary lg block rn-start', type: 'button', onClick: async () => {
    const g = tracker.gps;
    if (g.status === 'denied') { toast('Konum izni olmadan rota kaydedilemez', { type: 'error' }); return; }
    if (g.status === 'unsupported') { toast('Bu cihazda GPS bulunmuyor', { type: 'error' }); return; }
    startGps();
    if (!gpsLevel(g.status) || g.status === 'weak') {
      const ok = await confirmDialog('GPS sinyali henüz yeterli değil. Yine de başlatırsan süre hemen başlar, rota sinyal bulununca çizilir.',
        { title: 'Sinyal bekleniyor', okLabel: 'Yine de başlat', cancelLabel: 'Bekle' });
      if (!ok) return;
    }
    doStart();
  } }, icon('play', { size: 22 }), 'Başlat');

  // ---------- Ayarlar ----------
  const paceBtn = h('button', { class: 'btn sm ghost rn-pacebtn', type: 'button', onClick: () => editTargetPace(type, paintPace) });
  function paintPace() {
    const tp = getSettings().targetPace;
    mount(paceBtn, tp ? paceText(type, 1000, tp) + ' ' + paceUnit(type) : 'Kapalı', icon('right', { size: 16 }));
    paceBtn.setAttribute('aria-label', 'Hedef tempo: ' + (tp ? paceText(type, 1000, tp) + ' ' + paceUnit(type) : 'kapalı') + '. Değiştir');
  }
  paintPace();
  const setRow = (ic, title, sub, control) => h('div', { class: 'rn-setrow' },
    h('span', { class: 'rn-setrow-ic' }, rIcon(ic, { size: 20 })),
    h('div', { class: 'grow' }, h('div', { class: 'rn-setrow-t' }, title), h('div', { class: 'rn-setrow-s' }, sub)), control);
  const settings = h('div', { class: 'panel rn-settings' },
    h('h2', { class: 'panel-title' }, 'Ayarlar'),
    setRow('speaker', 'Sesli bildirim', voiceSupported() ? 'Her kilometrede süre ve tempo okunur' : 'Bu tarayıcı sesli okumayı desteklemiyor',
      h('div', { class: 'row gap-s' },
        voiceSupported() ? h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': 'Sesi dene',
          onClick: () => speak('1 kilometre. Tempo 5 dakika 30 saniye.', { force: true, interrupt: true }) }, 'Dene') : null,
        labeled(toggle(st.voice, v => setSettings({ voice: v })), 'Sesli bildirim'))),
    setRow('vibrate', 'Titreşim', 'Her kilometrede ve duraklatınca titrer', labeled(toggle(st.vibrate, v => setSettings({ vibrate: v })), 'Titreşim')),
    setRow('pause', 'Otomatik duraklat', 'Durduğunda süre kendiliğinden durur', labeled(toggle(st.autoPause, v => setSettings({ autoPause: v })), 'Otomatik duraklat')),
    setRow('target', 'Hedef tempo', 'Önde mi geride mi olduğunu gösterir', paceBtn));

  // ---------- Bu hafta ----------
  const weekBox = h('div');
  const paintWeek = () => {
    const runs = getRuns();
    const today = dateKey();
    const wt = weekTotals(today, runs);
    const goalKm = getSettings().weeklyGoalKm;
    const ws = weekStart(today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    const data = days.map(k => ({ label: fmt.date(k, 'weekday'), value: runs.filter(r => runDay(r) === k).reduce((s, r) => s + r.distM, 0) / 1000, highlight: k === today }));
    const last = runs[0];
    mount(weekBox,
      h('div', { class: 'panel' },
        h('div', { class: 'row between' }, h('h2', { class: 'panel-title', style: 'margin:0' }, 'Bu hafta'),
          h('button', { class: 'btn sm ghost', type: 'button', onClick: async () => {
            const v = await promptNumber({ title: 'Haftalık hedef', label: 'Hedef mesafe', unit: 'km', value: goalKm, min: 1, max: 500, step: 1 });
            if (v != null) { setSettings({ weeklyGoalKm: Math.round(v) }); toast('Haftalık hedef kaydedildi', { type: 'success' }); paintWeek(); }
          } }, 'Hedefi değiştir')),
        h('div', { class: 'rn-week-head' },
          h('span', { class: 'rn-week-km' }, km(wt.distM)), h('span', { class: 'rn-week-goal' }, `/ ${goalKm} km`)),
        progressBar(wt.distM / 1000, goalKm, { color: 'var(--magenta)' }),
        h('div', { class: 'grid-3 rn-week-stats' },
          miniStat('Aktivite', String(wt.count)), miniStat('Süre', fmt.duration(wt.sec)), miniStat('Kalori', fmt.n(wt.kcal))),
        barChart(data, { height: 96, format: v => fmt.n(v, 2) + ' km' })),
      last ? h('div', { class: 'panel click rn-last', role: 'button', tabindex: '0', 'aria-label': 'Son aktiviteyi aç: ' + last.title,
        onClick: () => go('run/detail/' + last.id), onKeydown: e => { if (e.key === 'Enter') go('run/detail/' + last.id); } },
        h('div', { class: 'rn-thumbbox' }, routeThumb(last.points, last.breaks, { w: 56, h: 56 })),
        h('div', { class: 'grow' }, h('div', { class: 'rn-last-k' }, 'Son aktivite'), h('div', { class: 'li-title' }, last.title),
          h('div', { class: 'li-sub' }, `${fmt.dateTime(last.startTs)} · ${fmt.duration(last.movingSec)}`)),
        h('div', { class: 'li-end' }, km(last.distM), h('small', { class: 'muted' }, ' km'))) : null);
  };
  paintWeek();

  mount(el,
    h('div', { class: 'rn-page' },
      h('h1', { class: 'hud-title' }, 'Koşu'),
      h('p', { class: 'hud-sub' }, 'Rotanı GPS ile kaydet, tempo ve mesafeni anlık gör.'),
      subNav(''),
      typeWrap,
      h('div', { class: 'rn-idle-mapwrap' }, mapHost, gpsChip),
      gpsHelp,
      startBtn,
      settings,
      weekBox));

  map = new MapView(mapHost, { follow: true, live: true, zoom: 15, controls: true });
  map.setFollow(true);

  cleanups.push(tracker.on(type => { if (type === 'gps' || type === 'fix') paintGps(); }));
  paintGps();

  // İzin daha önce verildiyse GPS'i hemen aç; verilmediyse kullanıcının dokunmasını bekle
  try {
    navigator.permissions?.query({ name: 'geolocation' }).then(p => {
      if (p.state === 'granted') startGps();
      else if (p.state === 'denied') { tracker.gps.status = 'denied'; paintGps(); }
    }).catch(() => {});
  } catch { /* desteklenmiyor */ }
  if (tracker.gps.fix || tracker.watchId != null) startGps();

  return () => { cleanups.forEach(f => f()); release?.(); map?.destroy(); };
}

function labeled(toggleEl, label) {
  toggleEl.querySelector('input')?.setAttribute('aria-label', label);
  return toggleEl;
}
const miniStat = (label, value) => h('div', { class: 'rn-mini' }, h('div', { class: 'rn-mini-v' }, value), h('div', { class: 'rn-mini-l' }, label));

/** Hedef tempo (ya da bisiklette hedef hız) diyaloğu */
function editTargetPace(type, after) {
  const T = typeOf(type);
  const cur = getSettings().targetPace || (T.speedMode ? 3600 / 20 : T.id === 'run' ? 330 : 600);
  let mins = Math.floor(cur / 60), secs = Math.round(cur % 60), speed = Math.round(3600 / cur);
  const body = T.speedMode
    ? h('div', { class: 'field' }, h('span', null, 'Hedef hız (km/sa)'), stepper(speed, { min: 5, max: 60, step: 1, onChange: v => { speed = v; } }))
    : h('div', null,
      h('p', { class: 'muted small', style: 'margin:0 0 12px' }, 'Kilometre başına hedef süreni seç.'),
      h('div', { class: 'row', style: 'gap:16px' },
        h('div', { class: 'field' }, h('span', null, 'Dakika'), stepper(mins, { min: 2, max: 20, step: 1, onChange: v => { mins = v; } })),
        h('div', { class: 'field' }, h('span', null, 'Saniye'), stepper(secs, { min: 0, max: 55, step: 5, onChange: v => { secs = v; } }))));
  modal({
    title: T.speedMode ? 'Hedef hız' : 'Hedef tempo',
    body,
    actions: [
      { label: 'Hedefi kaldır', class: 'ghost', onClick: () => { setSettings({ targetPace: null }); toast('Hedef kaldırıldı'); after(); } },
      { label: 'Kaydet', class: 'primary', onClick: () => {
        const tp = T.speedMode ? 3600 / clamp(speed, 5, 60) : clamp(mins * 60 + secs, 120, 1200);
        setSettings({ targetPace: tp });
        toast('Hedef kaydedildi', { type: 'success' });
        after();
      } },
    ],
  });
}


