// Vücut ölçüleri — ölçüm kaydı, tahmini yağ oranı (US Navy), bel/boy oranı, ilerleme grafikleri ve fotoğraflar.
import { h, icon, mount, backButton, pageHeader, sectionTitle, emptyState, sparkline, fmt } from '../../core/ui.js';
import { subscribe } from '../../core/store.js';
import { getProfile } from '../../core/profile.js';
import {
  KEY, MEASURES, MEASURE_BY_ID, FAT_BANDS, getEntries, series, bodyFatFor, whtr, changes, signed, deltaClass,
  latestValues, essentialMin,
} from './calc.js';
import { lineChart } from './chart.js';
import { openMeasureSheet } from './sheet.js';
import { renderGallery, renderCompare, photoSummary, urlBag, PRIVACY } from './photos.js';

const cm = v => fmt.n(v, Math.abs(v % 1) > 0.001 ? 1 : 0);
const pctTxt = v => '%' + fmt.n(v, 1);
let selected = null; // grafikte seçili ölçü (oturum boyunca hatırlanır)

const labelOf = id => (id === 'fat' ? 'Yağ oranı' : MEASURE_BY_ID[id]?.label || id);
const valTxt = (id, v) => (id === 'fat' ? pctTxt(v) : cm(v) + ' cm');

function infoStrip(items) {
  return h('div', { class: 'info-strip' }, items.filter(Boolean).map(([label, value, cls]) =>
    h('div', null, h('div', { class: 'is-label' }, label), h('div', { class: 'is-value ' + (cls || '') }, value))));
}

/** Renkli bant + işaretçi (kategori ölçeği) */
function scaleBar(bands, value, { min, max, fmtTick = v => fmt.n(v) }) {
  let from = min;
  const segs = bands.map(b => {
    const to = Math.min(b.to, max);
    const s = h('div', { class: 'bd-seg', style: { flex: `${(Math.max(0, to - from) / (max - min)) * 100} 1 0px`, background: b.color } }, h('span', null, b.label));
    from = to;
    return s;
  });
  const p = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const ticks = bands.slice(0, -1).map(b => h('span', { style: { left: ((b.to - min) / (max - min)) * 100 + '%' } }, fmtTick(b.to)));
  return h('div', { class: 'bd-scale' },
    h('div', { class: 'bd-scale-bar' }, segs, h('i', { class: 'bd-marker', style: { left: p + '%' } })),
    h('div', { class: 'bd-ticks' }, ticks));
}

function fatHero(entries, p) {
  const withWaist = entries.filter(e => e.waist > 0);
  const bf = withWaist.length ? bodyFatFor(withWaist.at(-1), entries) : null;
  const need = p.sex === 'female' ? 'bel, kalça ve boyun' : 'bel ve boyun';
  if (!bf) {
    return h('div', { class: 'panel hero bd-hero' },
      h('div', { class: 'row between' }, h('div', { class: 'panel-title', style: 'margin:0' }, icon('target'), 'Tahmini yağ oranı'), h('span', { class: 'badge muted' }, 'eksik ölçü')),
      h('p', { class: 'muted', style: 'margin:10px 0 14px' }, `Yağ oranını hesaplamak için ${need} ölçün gerekiyor. Boyun profilden alınır (${fmt.n(p.heightCm)} cm).`),
      h('button', { class: 'btn primary', onClick: () => openMeasureSheet() }, icon('plus'), 'Ölçü ekle'));
  }
  const fatPts = series(entries, 'fat');
  const ch = changes(fatPts);
  const bands = FAT_BANDS[p.sex === 'female' ? 'female' : 'male'];
  const [min, max] = p.sex === 'female' ? [10, 45] : [3, 40];
  return h('div', { class: 'panel hero bd-hero' },
    h('div', { class: 'row between' },
      h('div', { class: 'panel-title', style: 'margin:0' }, icon('target'), 'Yağ oranı'),
      h('span', { class: 'badge muted' }, 'tahmini')),
    h('div', { class: 'row bd-hero-main' },
      h('div', { class: 'bd-big mono' }, pctTxt(bf.pct)),
      h('div', { class: 'col', style: 'gap:4px' },
        h('span', { class: 'bd-cat', style: { color: bf.cat.color, borderColor: bf.cat.color } }, bf.cat.label),
        ch?.sinceFirst && h('span', { class: 'small ' + deltaClass('fat', ch.sinceFirst.cm) }, `İlk ölçümden ${signed(ch.sinceFirst.cm)} puan`))),
    scaleBar(bands, bf.pct, { min, max }),
    bf.pct < essentialMin(p.sex) && h('p', { class: 'small c-amber', style: 'margin:0 0 10px' }, icon('alert', { size: 15 }), ' Bu değer çok düşük görünüyor. Bel ve boyun ölçülerini tekrar kontrol et.'),
    infoStrip([
      ['Yağ kütlesi', fmt.n(bf.fatKg, 1) + ' kg'],
      ['Yağsız kütle', fmt.n(bf.leanKg, 1) + ' kg'],
      ['Kilo', fmt.n(bf.weightKg, 1) + ' kg'],
    ]),
    h('p', { class: 'tiny muted bd-foot' }, `US Navy yöntemiyle ${fmt.date(withWaist.at(-1).date, 'short')} ölçümünden tahmin edildi. Kilo: ${bf.weightSrc}. Gerçek değer ±3-4 puan farklı olabilir.`));
}

function whtrPanel(entries, p) {
  const lv = latestValues(entries);
  if (!lv.waist) return null;
  const w = whtr(lv.waist.v, p.heightCm);
  if (!w) return null;
  const bands = [{ to: 0.4, label: 'Düşük', color: 'var(--blue)' }, { to: 0.5, label: 'Sağlıklı', color: 'var(--lime)' }, { to: 0.6, label: 'Dikkat', color: 'var(--amber)' }, { to: 9, label: 'Risk', color: 'var(--red)' }];
  return h('div', { class: 'panel' },
    h('div', { class: 'row between' },
      h('div', { class: 'panel-title', style: 'margin:0' }, icon('scale'), 'Bel / boy oranı'),
      h('span', { class: 'bd-cat sm', style: { color: w.color, borderColor: w.color } }, w.label)),
    h('div', { class: 'row', style: 'align-items:baseline;margin:8px 0 6px' },
      h('div', { class: 'bd-big sm mono' }, fmt.n(w.r, 2)),
      h('span', { class: 'small muted' }, `${cm(lv.waist.v)} cm bel ÷ ${fmt.n(p.heightCm)} cm boy`)),
    scaleBar(bands, w.r, { min: 0.35, max: 0.7, fmtTick: v => fmt.n(v, 1) }),
    h('p', { class: 'bd-advice' }, w.advice),
    w.r >= 0.5 && h('p', { class: 'small muted', style: 'margin:6px 0 0' }, `Hedef: belin ${cm(Math.floor(w.targetCm))} cm'nin altında olsun (${cm(Math.max(0, lv.waist.v - w.targetCm))} cm kaldı).`));
}

function changeCard(entries) {
  const rows = MEASURES.map(m => ({ m, c: changes(series(entries, m.id)) })).filter(x => x.c?.sinceFirst);
  const firstDate = entries[0]?.date;
  return h('div', { class: 'panel bd-change' },
    h('div', { class: 'panel-title' }, icon('chart'), 'Değişim',
      firstDate && rows.length ? h('span', { class: 'small muted', style: 'font-weight:500;margin-left:auto' }, `İlk ölçüm: ${fmt.date(firstDate, 'short')}`) : null),
    rows.length
      ? h('div', { class: 'bd-diff-row' }, rows.map(({ m, c }) =>
        h('button', { class: 'bd-diff ' + deltaClass(m.id, c.sinceFirst.cm), onClick: () => pick(m.id) },
          h('b', null, m.label), ' ', `${signed(c.sinceFirst.cm)} cm`)))
      : h('p', { class: 'small muted', style: 'margin:0' }, 'İkinci ölçümünü girince her bölgedeki değişimi burada göreceksin.'));
}

let pick = () => {};

function chartSection(entries) {
  const opts = [...MEASURES.map(m => m.id), 'fat'].filter(id => series(entries, id).length);
  if (!opts.length) return null;
  if (!opts.includes(selected)) selected = opts.includes('waist') ? 'waist' : opts[0];
  const s = series(entries, selected);
  const c = changes(s);
  const dPct = x => (x ? ` (${signed(x.pct)}%)` : '');
  const unit = selected === 'fat' ? 'puan' : 'cm';
  return [
    sectionTitle('İlerleme grafiği'),
    h('div', { class: 'chips bd-chips', role: 'tablist', 'aria-label': 'Ölçü seç' }, opts.map(id =>
      h('button', { class: 'chip' + (id === selected ? ' active' : ''), role: 'tab', 'aria-selected': String(id === selected), onClick: () => pick(id) }, labelOf(id)))),
    h('div', { class: 'panel bd-chart-panel', id: 'bd-chart' },
      h('div', { class: 'row between', style: 'align-items:baseline' },
        h('div', null, h('div', { class: 'stat-label' }, labelOf(selected) + (selected === 'fat' ? ' (tahmini)' : '')), h('div', { class: 'stat-value' }, valTxt(selected, c.last.v))),
        h('span', { class: 'small muted' }, `${s.length} ölçüm`)),
      s.length > 1 ? lineChart(s, { unit, dec: 1, fmtV: v => valTxt(selected, v) }) : h('p', { class: 'small muted bd-one' }, 'Grafik için en az 2 ölçüm gerekli. Bir sonraki ölçümünü 1-2 hafta sonra al.'),
      infoStrip([
        ['İlk ölçümden', c.sinceFirst ? signed(c.sinceFirst.cm) + ' ' + unit : '—', c.sinceFirst ? deltaClass(selected, c.sinceFirst.cm) : 'muted'],
        ['Öncekinden', c.sinceLast ? signed(c.sinceLast.cm) + ' ' + unit : '—', c.sinceLast ? deltaClass(selected, c.sinceLast.cm) : 'muted'],
      ]),
      selected !== 'fat' && (c.sinceFirst || c.sinceLast) && h('p', { class: 'tiny muted', style: 'margin:8px 0 0' },
        c.sinceFirst ? `İlk ölçüme göre${dPct(c.sinceFirst)}` : '', c.sinceFirst && c.sinceLast ? ' · ' : '', c.sinceLast ? `öncekine göre${dPct(c.sinceLast)}` : '')),
  ];
}

function measureTiles(entries) {
  const tiles = MEASURES.map(m => {
    const s = series(entries, m.id);
    if (!s.length) return null;
    const c = changes(s);
    return h('button', { class: 'panel tight click bd-tile', onClick: () => pick(m.id), 'aria-label': `${m.label} grafiğini göster` },
      h('div', { class: 'row between' }, h('span', { class: 'stat-label' }, m.label),
        c.sinceLast && h('span', { class: 'tiny ' + deltaClass(m.id, c.sinceLast.cm) }, signed(c.sinceLast.cm) + ' cm')),
      h('div', { class: 'stat-value' }, cm(c.last.v), h('span', { class: 'stat-unit' }, 'cm')),
      s.length > 1 ? sparkline(s.map(x => x.v), { width: 140, height: 34, color: 'var(--accent)' }) : h('div', { class: 'bd-spark-ph tiny dim' }, 'Tek ölçüm'),
      h('div', { class: 'tiny muted' }, c.sinceFirst ? `İlk: ${signed(c.sinceFirst.cm)} cm (${signed(c.sinceFirst.pct)}%)` : fmt.date(c.last.date, 'short')));
  }).filter(Boolean);
  return tiles.length ? [sectionTitle('Bölgeler'), h('div', { class: 'grid-2 bd-tiles' }, tiles)] : null;
}

function historyList(entries, showAll) {
  const list = entries.slice().reverse();
  const shown = showAll.v ? list : list.slice(0, 8);
  const ul = h('div', { class: 'list' }, shown.map(e => {
    const parts = MEASURES.filter(m => e[m.id] > 0).map(m => `${m.label} ${cm(e[m.id])}`);
    return h('button', { class: 'list-item click bd-li', onClick: () => openMeasureSheet(e), 'aria-label': `${fmt.date(e.date, 'short')} ölçümünü düzenle` },
      h('span', { class: 'li-icon' }, icon('calendar')),
      h('div', { class: 'li-main' },
        h('div', { class: 'li-title' }, fmt.date(e.date, 'long')),
        h('div', { class: 'li-sub' }, parts.join(' · ') + (e.weightKg ? ` · ${fmt.n(e.weightKg, 1)} kg` : '')),
        e.note && h('div', { class: 'li-sub dim' }, e.note)),
      h('span', { class: 'li-end muted' }, icon('edit', { size: 18 })));
  }));
  return [
    sectionTitle('Geçmiş', h('span', { class: 'small muted' }, `${entries.length} kayıt`)),
    h('div', { class: 'panel tight' }, ul,
      list.length > 8 && h('button', { class: 'btn ghost block sm', style: 'margin-top:8px', onClick: () => { showAll.v = !showAll.v; showAll.repaint(); } }, showAll.v ? 'Daha az göster' : `Tümünü göster (${list.length})`)),
  ];
}

function photosCard(isAlive, bag) {
  const thumbs = h('div', { class: 'bd-mini-thumbs' });
  const sub = h('div', { class: 'li-sub' }, 'Yükleniyor…');
  const card = h('a', { class: 'panel click bd-photo-card', href: '#/body/photos' },
    h('div', { class: 'row' },
      h('span', { class: 'li-icon' }, icon('camera')),
      h('div', { class: 'grow' }, h('div', { class: 'li-title' }, 'İlerleme fotoğrafları'), sub),
      icon('right', { size: 20 })),
    thumbs,
    h('p', { class: 'tiny muted', style: 'margin:10px 0 0' }, icon('lock', { size: 12 }), ' ', PRIVACY));
  photoSummary().then(s => {
    if (!isAlive()) return;
    if (!s) { sub.textContent = 'Bu tarayıcıda fotoğraf saklanamıyor'; return; }
    sub.textContent = s.count ? `${s.count} fotoğraf · karşılaştır ve gör` : 'Ön, yan, arka fotoğraf ekle';
    mount(thumbs, s.latest.map(r => h('img', { src: bag.get(r), alt: '' })));
  });
  return card;
}

function renderMain(el) {
  let alive = true;
  const bag = urlBag();
  const showAll = { v: false, repaint: () => paint() };
  pick = id => {
    selected = id; paint();
    requestAnimationFrame(() => document.getElementById('bd-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const addBtn = () => h('button', { class: 'btn primary sm', onClick: () => openMeasureSheet() }, icon('plus'), 'Ölçü ekle');

  function paint() {
    const entries = getEntries();
    const p = getProfile();
    if (!entries.length) {
      mount(el, backButton(), pageHeader('Vücut Ölçüleri', 'Bel, göğüs, kol… değişimini takip et', addBtn()),
        h('div', { class: 'panel hero' }, emptyState('scale', 'Henüz ölçüm yok',
          'Bir mezura al; belini, boynunu ve kalçanı ölç. Tahmini yağ oranını ve haftalık değişimini burada gör.',
          h('button', { class: 'btn primary', onClick: () => openMeasureSheet() }, icon('plus'), 'İlk ölçümü ekle'))),
        h('div', { class: 'panel tight bd-howto' },
          h('div', { class: 'panel-title' }, icon('info'), 'İpucu'),
          h('p', { class: 'small muted', style: 'margin:0' }, 'Haftada bir, aynı gün ve saatte (tercihen sabah, aç karnına) ölç. Mezurayı sıkmadan, yere paralel tut.')),
        photosCard(() => alive, bag));
      return;
    }
    const last = entries.at(-1);
    mount(el,
      backButton(),
      pageHeader('Vücut Ölçüleri', `Son ölçüm: ${fmt.date(last.date, 'short')}`, addBtn()),
      fatHero(entries, p),
      whtrPanel(entries, p),
      changeCard(entries),
      chartSection(entries),
      measureTiles(entries),
      sectionTitle('Fotoğraflar'),
      photosCard(() => alive, bag),
      historyList(entries, showAll));
  }
  paint();
  const unsubs = [subscribe(KEY, paint), subscribe('profile', paint), subscribe('weight', paint)];
  return () => { alive = false; unsubs.forEach(u => u()); bag.clear(); };
}

export default {
  id: 'body',
  title: 'Vücut Ölçüleri',
  navLabel: 'Ölçüler',
  icon: 'scale',
  css: true,
  render(el, params = []) {
    if (params[0] === 'photos') return renderGallery(el);
    if (params[0] === 'compare') return renderCompare(el);
    return renderMain(el);
  },
  summary() {
    const entries = getEntries();
    if (!entries.length) return null;
    const lv = latestValues(entries);
    const withWaist = entries.filter(e => e.waist > 0);
    const bf = withWaist.length ? bodyFatFor(withWaist.at(-1), entries) : null;
    if (lv.waist) return { label: 'Bel', value: cm(lv.waist.v), unit: 'cm', sub: bf ? `Yağ ${pctTxt(bf.pct)} (tahmini)` : fmt.date(lv.waist.date, 'short'), progress: null, color: 'var(--violet)', icon: 'scale' };
    const first = MEASURES.find(m => lv[m.id]);
    return { label: first.label, value: cm(lv[first.id].v), unit: 'cm', sub: fmt.date(lv[first.id].date, 'short'), progress: null, color: 'var(--violet)', icon: 'scale' };
  },
};
