// Koşu modülü — bitiş özeti, geçmiş listesi ve rekorlar/istatistik ekranları.
import { h, icon, mount, fmt, toast, confirmDialog, emptyState, sectionTitle, barChart, tabs } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { tracker, buildRun } from './tracker.js';
import { routeThumb } from './map.js';
import { TYPE_LIST, typeOf, getRuns, records, totals, weeklySeries, monthlySeries, runDay, km, paceText, paceUnit, defaultTitle } from './data.js';
import { typeIcon, subNav, splitsTable } from './common.js';
import { statsGrid, routeMap } from './detail.js';

// ---------- Bitiş özeti ----------
export function renderSummary(el) {
  const s = tracker.s;
  const T = typeOf(s.type);
  const preview = buildRun(s, {});
  const xp = preview.distM >= 100 ? Math.round(10 + (preview.distM / 1000) * T.xpPerKm) : 0;
  const titleIn = h('input', { class: 'input', value: defaultTitle(s.type, s.startTs), maxlength: 80, 'aria-label': 'Başlık' });
  const noteIn = h('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder: 'Nasıl geçti? (isteğe bağlı)', 'aria-label': 'Not' });
  const mapHost = h('div');
  let map = null;

  const saveBtn = h('button', { class: 'btn primary lg block', type: 'button', onClick: () => {
    saveBtn.disabled = true;
    const res = tracker.saveFinished({ title: titleIn.value, note: noteIn.value });
    if (!res) { saveBtn.disabled = false; return; }
    if (!res.ok) toast('Cihaz hafızası dolu olabilir; kayıt kalıcı olarak saklanamadı', { type: 'error', ms: 5000 });
    else toast('Aktivite kaydedildi', { type: 'success' });
    go('run/detail/' + res.run.id);
  } }, icon('check', { size: 22 }), 'Kaydet');

  mount(el, h('div', { class: 'rn-page' },
    h('div', { class: 'rn-done-head' },
      h('span', { class: 'rn-done-ic' }, typeIcon(s.type, 26)),
      h('div', null, h('h1', { class: 'hud-title', style: 'margin:0' }, 'Tebrikler!'),
        h('p', { class: 'hud-sub', style: 'margin:0' }, `${T.label} tamamlandı · ${fmt.dateTime(s.startTs)}`))),
    mapHost,
    h('div', { class: 'panel' }, statsGrid(preview),
      xp ? h('div', { class: 'rn-xp' }, icon('star', { size: 18 }), `Kaydedince ${xp} XP kazanacaksın`) : h('div', { class: 'rn-xp muted' }, 'Puan için en az 100 m gerekir')),
    h('div', { class: 'panel' },
      h('label', { class: 'field' }, h('span', null, 'Başlık'), titleIn),
      h('label', { class: 'field', style: 'margin:0' }, h('span', null, 'Not'), noteIn)),
    saveBtn,
    h('button', { class: 'btn danger block rn-discard', type: 'button', onClick: async () => {
      const ok = await confirmDialog('Bu aktivite kaydedilmeden silinecek. Bu işlem geri alınamaz.', { title: 'Kaydetmeden silinsin mi?', okLabel: 'Sil', danger: true });
      if (ok) { tracker.discard(); toast('Aktivite silindi'); }
    } }, icon('trash', { size: 20 }), 'Kaydetmeden sil'),
    sectionTitle('Bölümler'),
    h('div', { class: 'panel' }, splitsTable(preview.splits, s.type))));
  map = routeMap(mapHost, preview, { height: 240 });
  return () => map?.destroy();
}

// ---------- Geçmiş ----------
export function renderHistory(el) {
  let filter = 'all';
  const body = h('div');
  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Türe göre filtrele' });
  const paintChips = () => mount(chips, [['all', 'Tümü'], ...TYPE_LIST.map(T => [T.id, T.label])].map(([id, label]) =>
    h('button', { class: 'chip' + (filter === id ? ' active' : ''), type: 'button', role: 'radio', 'aria-checked': String(filter === id),
      onClick: () => { filter = id; paintChips(); paint(); } }, id !== 'all' ? typeIcon(id, 16) : null, label)));

  const paint = () => {
    const all = getRuns();
    const runs = filter === 'all' ? all : all.filter(r => r.type === filter);
    if (!runs.length) {
      mount(body, h('div', { class: 'panel' }, emptyState('run', all.length ? 'Bu türde kayıt yok' : 'Henüz kayıt yok',
        all.length ? 'Başka bir tür seç ya da yeni bir aktivite başlat.' : 'İlk aktiviteni kaydetmek için Başla bölümünden “Başlat”a dokun.',
        h('button', { class: 'btn primary', type: 'button', onClick: () => go('run') }, icon('play', { size: 18 }), 'Aktivite başlat'))));
      return;
    }
    const groups = new Map();
    for (const r of runs) {
      const k = runDay(r).slice(0, 7);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    mount(body, [...groups.entries()].map(([k, list]) => {
      const [y, m] = k.split('-').map(Number);
      const t = totals(list);
      return h('section', { class: 'rn-month' },
        h('div', { class: 'rn-month-head' },
          h('h2', null, new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })),
          h('span', null, `${km(t.distM)} km · ${t.count} aktivite`)),
        h('div', { class: 'panel tight rn-list' }, list.map(r => h('button', { class: 'rn-item', type: 'button', onClick: () => go('run/detail/' + r.id),
          'aria-label': `${r.title}, ${km(r.distM)} kilometre, ${fmt.dateTime(r.startTs)}` },
          h('span', { class: 'rn-thumbbox' }, routeThumb(r.points, r.breaks, { w: 52, h: 52 }), h('span', { class: 'rn-thumb-type' }, typeIcon(r.type, 14))),
          h('span', { class: 'rn-item-main' },
            h('span', { class: 'rn-item-t' }, r.title),
            h('span', { class: 'rn-item-s' }, `${fmt.dateTime(r.startTs)} · ${fmt.duration(r.movingSec)}`)),
          h('span', { class: 'rn-item-end' },
            h('span', { class: 'rn-item-km' }, km(r.distM), h('small', null, ' km')),
            h('span', { class: 'rn-item-p' }, `${paceText(r.type, r.distM, r.movingSec)} ${paceUnit(r.type)}`))))));
    }));
  };
  paintChips();
  paint();
  mount(el, h('div', { class: 'rn-page' },
    h('h1', { class: 'hud-title' }, 'Koşu'),
    h('p', { class: 'hud-sub' }, 'Kaydettiğin tüm aktiviteler.'),
    subNav('history'), chips, body));
  return () => {};
}

// ---------- Rekorlar ve istatistik ----------
export function renderStats(el) {
  const all = getRuns();
  let type = all[0]?.type || 'run';
  let range = 'week';
  const body = h('div');
  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Aktivite türü' });
  const paintChips = () => mount(chips, TYPE_LIST.map(T => h('button', {
    class: 'chip' + (type === T.id ? ' active' : ''), type: 'button', role: 'radio', 'aria-checked': String(type === T.id),
    onClick: () => { type = T.id; paintChips(); paint(); } }, typeIcon(T.id, 16), T.label)));

  const recRow = (ic, label, value, sub, run) => h(run ? 'button' : 'div', {
    class: 'rn-rec' + (run ? ' click' : ''), type: run ? 'button' : null, onClick: run ? () => go('run/detail/' + run.id) : null,
    'aria-label': run ? `${label}: ${value}. Kaydı aç` : null },
    h('span', { class: 'rn-rec-ic' }, icon(ic, { size: 20 })),
    h('span', { class: 'rn-rec-main' }, h('span', { class: 'rn-rec-l' }, label), h('span', { class: 'rn-rec-s' }, sub || '')),
    h('span', { class: 'rn-rec-v' }, value),
    run ? icon('right', { size: 18 }) : null);

  const paint = () => {
    const runs = getRuns().filter(r => r.type === type);
    const T = typeOf(type);
    if (!runs.length) {
      mount(body, h('div', { class: 'panel' }, emptyState('trophy', `${T.label} rekoru yok`,
        'Rekorların ve haftalık grafiklerin burada görünecek. İlk aktiviteni kaydederek başla.',
        h('button', { class: 'btn primary', type: 'button', onClick: () => go('run') }, icon('play', { size: 18 }), 'Aktivite başlat'))));
      return;
    }
    const rec = records(type, runs);
    const t = totals(runs);
    const weekly = weeklySeries(12, runs).map((w, i, a) => ({ label: i % 2 === (a.length - 1) % 2 ? w.label : '', value: w.distM / 1000, highlight: i === a.length - 1 }));
    const monthly = monthlySeries(12, runs).map((m, i, a) => ({ label: m.label.slice(0, 3), value: m.distM / 1000, highlight: i === a.length - 1 }));
    const chartBox = h('div');
    const paintChart = () => mount(chartBox, barChart(range === 'week' ? weekly : monthly, { height: 140, format: v => fmt.n(v, 1) + ' km' }),
      h('p', { class: 'muted small', style: 'margin:8px 0 0' }, range === 'week' ? 'Son 12 hafta, km (etiket: haftanın ilk günü)' : 'Son 12 ay, km'));
    paintChart();
    const effortRows = rec.efforts.map(e => e.best
      ? recRow('timer', `En hızlı ${e.label}`, fmt.duration(e.best.sec), `${fmt.date(runDay(e.best.run), 'short')} · ${paceText(type, e.D, e.best.sec)} ${paceUnit(type)}`, e.best.run)
      : recRow('timer', `En hızlı ${e.label}`, '–', 'Henüz bu mesafeye ulaşmadın', null));
    mount(body,
      h('div', { class: 'panel rn-tot' },
        h('div', { class: 'rn-tot-c' }, h('b', null, km(t.distM)), h('span', null, 'Toplam km')),
        h('div', { class: 'rn-tot-c' }, h('b', null, String(t.count)), h('span', null, 'Aktivite')),
        h('div', { class: 'rn-tot-c' }, h('b', null, fmt.duration(t.sec)), h('span', null, 'Toplam süre'))),
      sectionTitle('Kişisel rekorlar'),
      h('div', { class: 'panel tight rn-recs' },
        effortRows,
        rec.longest && recRow('map', 'En uzun mesafe', km(rec.longest.distM) + ' km', fmt.date(runDay(rec.longest), 'short'), rec.longest),
        rec.longestTime && recRow('clock', 'En uzun süre', fmt.duration(rec.longestTime.movingSec), fmt.date(runDay(rec.longestTime), 'short'), rec.longestTime),
        rec.bigWeek && recRow('calendar', 'En çok km yapılan hafta', km(rec.bigWeek.distM) + ' km', fmt.date(rec.bigWeek.key, 'short') + ' haftası', null),
        rec.mostElev && recRow('up', 'En çok tırmanış', fmt.n(rec.mostElev.elevGainM) + ' m', fmt.date(runDay(rec.mostElev), 'short'), rec.mostElev)),
      sectionTitle('Mesafe'),
      h('div', { class: 'panel' }, tabs([{ id: 'week', label: 'Haftalık' }, { id: 'month', label: 'Aylık' }], range, id => { range = id; paintChart(); }), chartBox));
  };
  paintChips();
  paint();
  mount(el, h('div', { class: 'rn-page' },
    h('h1', { class: 'hud-title' }, 'Koşu'),
    h('p', { class: 'hud-sub' }, 'En iyi derecelerin ve ilerlemen.'),
    subNav('stats'), chips, body));
  return () => {};
}
