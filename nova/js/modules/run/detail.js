// Koşu modülü — kayıt detayı: harita, istatistikler, bölümler, tempo ve yükseklik grafikleri, GPX, düzenle/sil.
import { h, icon, mount, fmt, toast, modal, confirmDialog, emptyState, sectionTitle } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { MapView, paceGradientCss } from './map.js';
import { areaChart, routeSeries } from './charts.js';
import { runDay, getRun, putRun, deleteRun, typeOf, km, paceText, paceUnit, kmh, downloadGPX } from './data.js';
import { backHeader, typeIcon, splitsTable } from './common.js';

/** Özet istatistik ızgarası (detay ve bitiş ekranında ortak) */
export function statsGrid(run) {
  const T = typeOf(run.type);
  const cell = (label, value, unit = '') => h('div', { class: 'rn-cell' },
    h('div', { class: 'rn-cell-v' }, value, unit && h('span', { class: 'rn-cell-u' }, ' ' + unit)), h('div', { class: 'rn-cell-l' }, label));
  const avgSpeed = run.movingSec > 0 ? run.distM / run.movingSec : 0;
  const full = (run.splits || []).filter(s => !s.partial);
  const best = full.length ? full.reduce((a, b) => (b.sec < a.sec ? b : a)) : null;
  return h('div', { class: 'rn-cells' },
    cell('Mesafe', km(run.distM), 'km'),
    cell('Hareket süresi', fmt.duration(run.movingSec)),
    T.speedMode ? cell('Ort. hız', kmh(avgSpeed), 'km/sa') : cell('Ort. tempo', paceText(run.type, run.distM, run.movingSec), '/km'),
    cell('Kalori', fmt.n(run.kcal), 'kcal'),
    cell('Tırmanış', fmt.n(run.elevGainM || 0), 'm'),
    T.speedMode ? cell('En yüksek hız', kmh(run.maxSpeed), 'km/sa')
      : cell('En iyi km', best ? paceText(run.type, best.distM, best.sec) : '–', best ? '/km' : ''),
    cell('Toplam süre', fmt.duration(run.elapsedSec || (run.endTs - run.startTs) / 1000)),
    T.speedMode ? cell('Ort. tempo', paceText('run', run.distM, run.movingSec), '/km') : cell('Ort. hız', kmh(avgSpeed), 'km/sa'));
}

/** Harita kartı: rotayı sığdırır */
export function routeMap(host, run, { height = 280 } = {}) {
  const box = h('div', { class: 'rn-mapcard', style: { height: height + 'px' } });
  host.appendChild(box);
  if (!run.points?.length) {
    box.appendChild(h('div', { class: 'rn-map-empty' }, icon('map', { size: 28 }), h('span', null, 'Bu kayıtta konum verisi yok')));
    return null;
  }
  const map = new MapView(box, { follow: false, live: false, controls: true });
  map.setRoute(run.points, run.breaks || []);
  map.fit(run.points, 34);
  const legend = h('div', { class: 'rn-legend', 'aria-hidden': 'true' },
    h('span', null, 'Yavaş'), h('i', { style: { background: paceGradientCss() } }), h('span', null, 'Hızlı'));
  box.appendChild(legend);
  return map;
}

export function renderDetail(el, id) {
  const run = getRun(id);
  if (!run) {
    mount(el, h('div', { class: 'rn-page' }, backHeader('Kayıt bulunamadı', '', { to: 'run/history' }),
      h('div', { class: 'panel' }, emptyState('alert', 'Bu kayıt artık yok', 'Silinmiş olabilir. Geçmiş listesinden başka bir kayıt seçebilirsin.',
        h('button', { class: 'btn primary', type: 'button', onClick: () => go('run/history') }, 'Geçmişe dön')))));
    return () => {};
  }
  const T = typeOf(run.type);
  let map = null;

  const editBtn = h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Başlığı ve notu düzenle', onClick: () => edit() }, icon('edit', { size: 20 }));
  const titleEl = h('div');
  const paintTitle = () => mount(titleEl, backHeader(run.title,
    `${T.label} · ${fmt.date(runDay(run), 'full')} · ${fmt.time(run.startTs)}–${fmt.time(run.endTs)}`,
    { to: 'run/history', right: editBtn }),
    run.note ? h('p', { class: 'rn-notetext' }, run.note) : null);
  paintTitle();

  const mapHost = h('div');
  const series = routeSeries(run);
  let paceChart = null, elevChart = null;
  if (series) {
    const valid = series.pace.filter(Number.isFinite).sort((a, b) => a - b);
    if (valid.length > 2) {
      const lo = valid[Math.floor(valid.length * 0.05)] * 0.85, hi = valid[Math.floor(valid.length * 0.95)] * 1.15;
      const avgPace = run.movingSec / (run.distM / 1000);
      paceChart = T.speedMode
        ? areaChart(series.xs, series.speed.map(v => v * 3.6), { color: 'var(--accent)', fmtY: v => fmt.n(v, 0) + ' km/sa', avg: run.distM / run.movingSec * 3.6, avgLabel: 'ort.' })
        : areaChart(series.xs, series.pace.map(p => (Number.isFinite(p) ? Math.min(hi, Math.max(lo, p)) : NaN)),
          { color: 'var(--accent)', invert: true, fmtY: v => fmt.pace(v), avg: avgPace, avgLabel: 'ort.' });
    }
    if (series.elev) elevChart = areaChart(series.xs, series.elev, { color: 'var(--lime)', fmtY: v => fmt.n(v, 0) + ' m' });
  }

  mount(el, h('div', { class: 'rn-page' },
    titleEl,
    mapHost,
    h('div', { class: 'panel' }, statsGrid(run)),
    sectionTitle('Bölümler'),
    h('div', { class: 'panel' }, splitsTable(run.splits, run.type)),
    sectionTitle(T.speedMode ? 'Hız' : 'Tempo'),
    h('div', { class: 'panel' }, paceChart || h('p', { class: 'muted small', style: 'margin:0' }, 'Grafik için yeterli veri yok.')),
    sectionTitle('Yükseklik'),
    h('div', { class: 'panel' }, elevChart
      ? [elevChart, h('p', { class: 'muted small', style: 'margin:8px 0 0' }, `Toplam tırmanış ${fmt.n(run.elevGainM || 0)} m · iniş ${fmt.n(run.elevLossM || 0)} m`)]
      : h('p', { class: 'muted small', style: 'margin:0' }, 'Bu kayıtta yükseklik verisi yok. Bazı telefonlar yükseklik bilgisi vermez.')),
    h('div', { class: 'rn-actions' },
      h('button', { class: 'btn block', type: 'button', disabled: !run.points?.length, onClick: () => {
        const name = downloadGPX(run);
        toast(`GPX dosyası indirildi: ${name}`, { type: 'success' });
      } }, icon('download', { size: 20 }), 'GPX olarak indir'),
      h('button', { class: 'btn danger block', type: 'button', onClick: async () => {
        const ok = await confirmDialog(`“${run.title}” kalıcı olarak silinecek. Bu işlem geri alınamaz.`, { title: 'Kayıt silinsin mi?', okLabel: 'Sil', danger: true });
        if (!ok) return;
        deleteRun(run.id);
        toast('Kayıt silindi', { type: 'success' });
        go('run/history');
      } }, icon('trash', { size: 20 }), 'Kaydı sil'))));

  map = routeMap(mapHost, run, { height: 300 });

  function edit() {
    const ti = h('input', { class: 'input', value: run.title, maxlength: 80, 'aria-label': 'Başlık' });
    const no = h('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder: 'Nasıl geçti?', 'aria-label': 'Not' });
    no.value = run.note || '';
    modal({
      title: 'Düzenle',
      body: h('div', null, h('label', { class: 'field' }, h('span', null, 'Başlık'), ti), h('label', { class: 'field' }, h('span', null, 'Not'), no)),
      actions: [
        { label: 'Vazgeç', class: 'ghost' },
        { label: 'Kaydet', class: 'primary', onClick: () => {
          run.title = ti.value.trim() || run.title;
          run.note = no.value.trim();
          putRun(run);
          paintTitle();
          toast('Değişiklikler kaydedildi', { type: 'success' });
        } },
      ],
    });
  }

  return () => { map?.destroy(); };
}

