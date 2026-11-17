// Haftalık rapor: Pazartesi–Pazar haftanın özeti, geçen haftayla karşılaştırma ve paylaşılabilir görsel.
import { h, icon, mount, fmt, toast, ring, progressBar, sparkline, backButton, pageHeader, emptyState, clamp } from '../../core/ui.js';
import { todayKey, addDays, parseKey } from '../../core/store.js';
import { getProfile } from '../../core/profile.js';
import { computeWeek, weekStartOf, isWeekKey } from './calc.js';
import { drawCard, toBlob, FILE_NAME } from './card.js';

// ---------------------------------------------------------------- Biçim yardımcıları
const MONTH = k => parseKey(k).toLocaleDateString('tr-TR', { month: 'long' });
const DAYNUM = k => parseKey(k).getDate();
const YEAR = k => parseKey(k).getFullYear();
const WEEKDAY_LONG = k => parseKey(k).toLocaleDateString('tr-TR', { weekday: 'long' });
const WEEKDAY_SHORT = k => fmt.date(k, 'weekday');

function rangeText(ws, we, { year = false } = {}) {
  const y = year || YEAR(ws) !== YEAR(todayKey()) ? ' ' + YEAR(we) : '';
  if (MONTH(ws) === MONTH(we)) return `${DAYNUM(ws)}–${DAYNUM(we)} ${MONTH(we)}${y}`;
  return `${DAYNUM(ws)} ${MONTH(ws)} – ${DAYNUM(we)} ${MONTH(we)}${y}`;
}
function weekLabel(w) {
  if (w.isCurrent) return 'Bu hafta';
  if (w.isLast) return 'Geçen hafta';
  const n = Math.round((parseKey(weekStartOf(todayKey())) - parseKey(w.ws)) / (7 * 864e5));
  return `${n} hafta önce`;
}
function durText(sec) {
  const m = Math.round((sec || 0) / 60), hh = Math.floor(m / 60), mm = m % 60;
  return hh ? `${hh} sa ${mm} dk` : `${mm} dk`;
}
const km1 = m => fmt.n((m || 0) / 1000, 1);
const signed = (v, dec = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt.n(Math.abs(v), dec);

/** Geçen haftaya göre değişim: better 'up' | 'down' | null (renk yok) */
function delta(cur, prev, better = 'up') {
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  if (!cur && !prev) return null;
  let txt, dir;
  if (!prev) { txt = 'yeni'; dir = 1; }
  else {
    const pct = ((cur - prev) / Math.abs(prev)) * 100;
    if (Math.abs(pct) < 1) return h('span', { class: 'rp-d flat', title: 'Geçen haftayla aynı' }, '= aynı');
    dir = pct > 0 ? 1 : -1;
    txt = '%' + fmt.n(Math.min(999, Math.abs(pct)));
  }
  const tone = !better ? 'flat' : (dir > 0) === (better === 'up') ? 'good' : 'bad';
  return h('span', { class: 'rp-d ' + tone, title: 'Geçen haftaya göre' }, (dir > 0 ? '▲ ' : '▼ ') + txt);
}

function metric(label, value, unit = '', d = null) {
  return h('div', { class: 'rp-m' },
    h('div', { class: 'rp-m-l' }, label),
    h('div', { class: 'rp-m-v' }, value, unit && h('span', { class: 'rp-m-u' }, unit)),
    d && h('div', { class: 'rp-m-d' }, d));
}

function section(iconName, title, ...body) {
  return h('section', { class: 'panel rp-sec' },
    h('h2', { class: 'panel-title rp-sec-t' }, icon(iconName, { size: 18 }), title), ...body);
}

function none(text, label, href, ic = 'plus') {
  return h('div', { class: 'rp-none' },
    h('p', null, text),
    h('a', { class: 'btn sm ghost', href }, icon(ic), label));
}

// ---------------------------------------------------------------- Bölümler
function heroCard(w, p) {
  const active = new Set([...w.run.days, ...w.workout.days]).size;
  return h('section', { class: 'panel hero rp-hero', 'aria-label': 'Haftanın özeti' },
    h('div', { class: 'rp-hero-top' },
      ring({ value: w.score, max: 100, size: 116, stroke: 11, color: 'var(--accent)',
        center: h('div', { class: 'rp-score' }, h('b', null, String(w.score)), h('small', null, '/ 100')) }),
      h('div', { class: 'grow' },
        h('div', { class: 'rp-hero-k' }, 'Haftalık puan', delta(w.score, p.hasData ? p.score : 0)),
        h('p', { class: 'rp-hero-s' }, w.sentence))),
    h('div', { class: 'info-strip rp-strip' },
      h('div', null, h('div', { class: 'is-label' }, icon('bolt'), 'Aktif gün'), h('div', { class: 'is-value' }, `${active}/${w.elapsed}`)),
      h('div', null, h('div', { class: 'is-label' }, icon('steps'), 'Adım'), h('div', { class: 'is-value' }, `${w.steps.hits} gün`)),
      h('div', null, h('div', { class: 'is-label' }, icon('food'), 'Kalori'), h('div', { class: 'is-value' }, `${w.food.inTarget} gün`))),
    h('p', { class: 'rp-note' },
      w.isCurrent && w.elapsed < 7 ? `Hafta sürüyor: ${w.elapsed}/7 gün geçti. Oklar, geçen haftanın ilk ${w.elapsed} günüyle karşılaştırır. ` : 'Oklar geçen haftayla karşılaştırır. ',
      'Puan; adım, hareket, kalori ve su hedeflerinden hesaplanır.'));
}

function stepsChart(w) {
  const max = Math.max(w.steps.goal * 1.15, ...w.steps.perDay.map(d => d.steps), 1);
  const goalPct = clamp(w.steps.goal / max, 0, 1) * 100;
  const detail = h('p', { class: 'rp-bar-detail', 'aria-live': 'polite' });
  let sel = w.steps.best?.date || w.steps.perDay.find(d => !d.future)?.date;
  const btns = [];
  const pick = date => {
    sel = date;
    btns.forEach(b => b.classList.toggle('sel', b.dataset.date === sel));
    const d = w.steps.perDay.find(x => x.date === sel);
    if (!d) return mount(detail, '');
    mount(detail, h('b', null, `${WEEKDAY_LONG(d.date)} ${DAYNUM(d.date)} ${MONTH(d.date)}`), ': ',
      d.future ? 'henüz gelmedi' : `${fmt.n(d.steps)} adım`,
      d.hit ? h('span', { class: 'rp-d good' }, ' ✓ hedef') : null);
  };
  const cols = w.steps.perDay.map(d => {
    const b = h('button', { type: 'button', class: 'rp-bar' + (d.hit ? ' hit' : '') + (d.future ? ' future' : '') + (d.date === w.today ? ' today' : ''),
      dataset: { date: d.date }, 'aria-label': `${WEEKDAY_LONG(d.date)}: ${d.future ? 'henüz gelmedi' : fmt.n(d.steps) + ' adım'}`,
      onClick: () => pick(d.date) },
    h('span', { class: 'rp-bar-track' }, h('i', { style: { height: (d.future ? 0 : clamp(d.steps / max, 0, 1) * 100) + '%' } })),
    h('span', { class: 'rp-bar-l' }, WEEKDAY_SHORT(d.date)));
    btns.push(b);
    return b;
  });
  const chart = h('div', { class: 'rp-bars', role: 'group', 'aria-label': 'Günlük adım grafiği' },
    h('div', { class: 'rp-goal', style: { bottom: `calc(var(--rp-lab-h) + var(--rp-bar-h) * ${(goalPct / 100).toFixed(4)})` } }), cols);
  pick(sel);
  return [chart,
    h('div', { class: 'rp-legend' }, h('span', null, h('i', { class: 'lg-hit' }), 'Hedef tuttu'), h('span', null, h('i', { class: 'lg-miss' }), 'Hedefin altında'),
      h('span', null, h('i', { class: 'lg-goal' }), `Hedef ${fmt.n(w.steps.goal)}`)),
    detail];
}

function stepsSection(w, p) {
  const s = w.steps;
  if (!s.total) return section('steps', 'Adım', none('Bu hafta adım kaydı yok.', 'Adım ekle', '#/steps'));
  return section('steps', 'Adım',
    h('div', { class: 'rp-grid' },
      metric('Toplam', fmt.n(s.total), 'adım', delta(s.total, p.steps.total)),
      metric('Günlük ortalama', fmt.n(s.avg), 'adım', delta(s.avg, p.steps.avg)),
      metric('Hedefi tutan gün', `${s.hits}/${w.elapsed}`, 'gün', delta(s.hits, p.steps.hits)),
      metric('En iyi gün', s.best ? fmt.n(s.best.steps) : '–', s.best ? WEEKDAY_SHORT(s.best.date) : '')),
    stepsChart(w));
}

function runSection(w, p) {
  const r = w.run;
  if (!r.count) return section('run', 'Koşu', none('Bu hafta koşu ya da yürüyüş kaydı yok.', 'Koşuya başla', '#/run', 'play'));
  return section('run', 'Koşu',
    h('div', { class: 'rp-grid' },
      metric('Toplam mesafe', fmt.n(r.distM / 1000, 2), 'km', delta(r.distM, p.run.distM)),
      metric('Süre', durText(r.sec), '', delta(r.sec, p.run.sec)),
      metric('Ortalama tempo', fmt.pace(r.pace), Number.isFinite(r.pace) ? '/km' : '', Number.isFinite(p.run.pace) && Number.isFinite(r.pace) ? delta(r.pace, p.run.pace, 'down') : null),
      metric('Aktivite', String(r.count), 'kez', delta(r.count, p.run.count))),
    r.longest && h('div', { class: 'list-item rp-li' },
      h('span', { class: 'li-icon' }, icon('trophy')),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, 'En uzun: ' + r.longest.title), h('div', { class: 'li-sub' }, `${WEEKDAY_LONG(r.longest.date)} · ${durText(r.longest.sec)}`)),
      h('div', { class: 'li-end' }, fmt.n(r.longest.distM / 1000, 2) + ' km')));
}

function workoutSection(w, p) {
  const x = w.workout;
  if (!x.count) return section('dumbbell', 'Antrenman', none('Bu hafta antrenman kaydı yok.', 'Antrenmana başla', '#/workout', 'play'));
  const top = x.groups.slice(0, 4), mx = Math.max(1, ...top.map(g => g.sets));
  return section('dumbbell', 'Antrenman',
    h('div', { class: 'rp-grid' },
      metric('Antrenman', String(x.count), 'kez', delta(x.count, p.workout.count)),
      metric('Toplam süre', fmt.n(x.mins), 'dk', delta(x.mins, p.workout.mins)),
      metric('Kaldırılan ağırlık', fmt.n(x.volume), 'kg', delta(x.volume, p.workout.volume)),
      metric('Set', fmt.n(x.sets), 'set', delta(x.sets, p.workout.sets))),
    top.length ? h('div', { class: 'rp-groups' },
      h('div', { class: 'rp-sub-t' }, 'En çok çalışan bölgeler'),
      top.map(g => h('div', { class: 'rp-grp' },
        h('span', { class: 'rp-grp-n' }, g.label),
        h('span', { class: 'grow' }, progressBar(g.sets, mx)),
        h('span', { class: 'rp-grp-v' }, `${g.sets} set`)))) : null);
}

function foodSection(w, p) {
  const f = w.food;
  if (!f.logged && !f.waterDays) return section('food', 'Beslenme', none('Bu hafta yemek ya da su kaydı yok.', 'Yemek ekle', '#/nutrition'));
  const diffP = f.logged ? Math.round(((f.avgKcal - f.target) / f.target) * 100) : 0;
  const macro = (label, v, t, color) => h('div', { class: 'rp-mac' },
    h('div', { class: 'rp-mac-l' }, label),
    h('div', { class: 'rp-mac-v' }, fmt.n(v), h('small', null, ` / ${fmt.n(t)} g`)),
    progressBar(v, t, { color, thin: true }));
  return section('food', 'Beslenme',
    f.logged ? h('div', { class: 'rp-kcal' },
      h('div', { class: 'row between' },
        h('div', null, h('div', { class: 'rp-m-l' }, 'Günlük ortalama kalori'),
          h('div', { class: 'rp-m-v big' }, fmt.n(f.avgKcal), h('span', { class: 'rp-m-u' }, `/ ${fmt.n(f.target)} kcal`))),
        h('span', { class: 'badge ' + (Math.abs(diffP) <= 10 ? 'lime' : diffP > 0 ? 'red' : 'amber') },
          Math.abs(diffP) <= 10 ? 'Hedefte' : diffP > 0 ? `%${diffP} fazla` : `%${-diffP} az`)),
      progressBar(f.avgKcal, f.target, { color: Math.abs(diffP) <= 10 ? 'var(--lime)' : diffP > 0 ? 'var(--red)' : 'var(--accent)' }),
      h('div', { class: 'rp-macs' },
        macro('Protein', f.avgP, f.macros.protein, 'var(--magenta)'),
        macro('Karbonhidrat', f.avgC, f.macros.carbs, 'var(--amber)'),
        macro('Yağ', f.avgF, f.macros.fat, 'var(--blue)'))) : h('p', { class: 'rp-note' }, 'Bu hafta yemek kaydı yok; yalnız su kaydın var.'),
    h('div', { class: 'rp-grid' },
      metric('Hedefe uyan gün (±%10)', `${f.inTarget}/${w.elapsed}`, 'gün', delta(f.inTarget, p.food.inTarget)),
      metric('Kayıtlı gün', `${f.logged}/${w.elapsed}`, 'gün', delta(f.logged, p.food.logged)),
      metric('Su ortalaması', f.waterDays ? fmt.n(f.avgWater / 1000, 1) : '–', f.waterDays ? `/ ${fmt.n(f.waterTarget / 1000, 1)} L` : '', delta(f.avgWater, p.food.avgWater)),
      metric('Su hedefi tutan gün', `${f.waterHits}/${w.elapsed}`, 'gün', delta(f.waterHits, p.food.waterHits))));
}

function weightSection(w) {
  const x = w.weight;
  if (!x) return section('scale', 'Kilo', none('Bu hafta tartı kaydı yok.', 'Kilo kaydet', '#/profile', 'scale'));
  const goal = getProfile().goal;
  const better = goal === 'gain' ? 'up' : goal === 'maintain' ? null : 'down';
  const ch = Math.round(x.change * 10) / 10;
  const tone = !ch || !better ? 'flat' : (ch > 0) === (better === 'up') ? 'good' : 'bad';
  return section('scale', 'Kilo',
    h('div', { class: 'rp-weight' },
      h('div', { class: 'grow' },
        h('div', { class: 'rp-m-l' }, x.values.length > 1 ? 'Hafta başı → hafta sonu' : 'Bu haftaki tartı'),
        h('div', { class: 'rp-m-v big' }, x.values.length > 1 ? `${fmt.n(x.start, 1)} → ${fmt.n(x.end, 1)}` : fmt.n(x.end, 1), h('span', { class: 'rp-m-u' }, 'kg')),
        x.values.length > 1
          ? h('span', { class: 'rp-d ' + tone }, ch ? `${ch > 0 ? '▲' : '▼'} ${signed(ch)} kg` : '= değişmedi')
          : h('span', { class: 'rp-d flat' }, 'Değişimi görmek için en az iki tartı gerekli')),
      x.values.length > 1 ? h('div', { class: 'rp-spark' }, sparkline(x.values, { width: 120, height: 48, color: 'var(--accent)' })) : null),
    h('p', { class: 'rp-note' }, `${x.count} tartı kaydı`));
}

function habitsSection(w) {
  const x = w.habits;
  if (!x.list.length) return section('shield', 'Alışkanlıklar', none('Bırakmak istediğin bir alışkanlık ekle, temiz günlerin burada görünsün.', 'Alışkanlık ekle', '#/habits/new'));
  return section('shield', 'Alışkanlıklar',
    x.saved > 0 ? h('div', { class: 'rp-money' }, icon('coin', { size: 20 }), h('span', null, 'Bu hafta biriktirdiğin: '), h('b', null, fmt.money(x.saved))) : null,
    h('div', { class: 'list' }, x.list.map(hb => h('a', { class: 'list-item click rp-li', href: '#/habits/' + encodeURIComponent(hb.id) },
      h('span', { class: 'li-icon' }, icon(hb.icon)),
      h('div', { class: 'li-main' },
        h('div', { class: 'li-title' }, hb.name),
        h('div', { class: 'li-sub' }, `${hb.clean}/${hb.possible} temiz gün` + (hb.slips ? ` · ${hb.slips} kayma` : ''))),
      h('div', { class: 'li-end' + (hb.possible && hb.clean === hb.possible ? ' c-lime' : '') }, hb.saved > 0 ? fmt.money(hb.saved) : `${hb.clean} gün`)))));
}

function xpSection(w, p) {
  const x = w.xp;
  if (!x.count) return section('star', 'Kazanılan puan', h('p', { class: 'rp-note' }, 'Bu hafta puan kazanılmadı. Hedeflerini tuttukça puan kazanırsın.'));
  return section('star', 'Kazanılan puan',
    h('div', { class: 'rp-grid' },
      metric('Toplam', '+' + fmt.n(x.total), 'puan', delta(x.total, p.xp.total)),
      metric('Ödül sayısı', fmt.n(x.count), 'kez', delta(x.count, p.xp.count))),
    h('div', { class: 'list' }, x.top.map(t => h('div', { class: 'list-item rp-li' },
      h('span', { class: 'li-icon' }, icon('sparkle')),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, t.reason), h('div', { class: 'li-sub' }, `${t.n} kez`)),
      h('div', { class: 'li-end c-amber' }, '+' + fmt.n(t.amount))))));
}

// ---------------------------------------------------------------- Paylaşılabilir görsel
function cardData(w, p) {
  const ch = w.weight ? Math.round(w.weight.change * 10) / 10 : 0;
  const goal = getProfile().goal;
  const wTone = !ch || goal === 'maintain' ? 'muted' : (ch < 0) === (goal !== 'gain') ? 'good' : 'bad';
  const xpD = p.xp.total ? Math.round(((w.xp.total - p.xp.total) / p.xp.total) * 100) : null;
  return {
    range: rangeText(w.ws, w.we, { year: true }),
    label: weekLabel(w),
    score: w.score,
    sentence: w.sentence,
    tiles: [
      { label: 'Adım', value: fmt.n(w.steps.total), unit: 'adım', sub: `${w.steps.hits} gün hedefte`, tone: w.steps.hits ? 'good' : 'muted' },
      { label: 'Koşu', value: km1(w.run.distM), unit: 'km', sub: w.run.count ? `${w.run.count} aktivite · ${durText(w.run.sec)}` : 'Koşu yok', tone: 'muted' },
      { label: 'Antrenman', value: String(w.workout.count), unit: 'kez', sub: w.workout.count ? `${fmt.n(w.workout.mins)} dk · ${fmt.n(w.workout.volume)} kg` : 'Antrenman yok', tone: 'muted' },
      { label: 'Kalori', value: w.food.logged ? fmt.n(w.food.avgKcal) : '–', unit: 'kcal/gün', sub: w.food.logged ? `Hedefe ${w.food.inTarget} gün uydu` : 'Kayıt yok', tone: w.food.inTarget ? 'good' : 'muted' },
      { label: 'Kilo', value: w.weight && w.weight.values.length > 1 ? signed(ch) : w.weight ? fmt.n(w.weight.end, 1) : '–', unit: 'kg',
        sub: w.weight ? (w.weight.values.length > 1 ? `${fmt.n(w.weight.start, 1)} → ${fmt.n(w.weight.end, 1)} kg` : 'Tek tartı') : 'Tartı yok', tone: wTone },
      { label: 'Kazanılan puan', value: '+' + fmt.n(w.xp.total), unit: 'puan',
        sub: xpD == null ? `${w.xp.count} ödül` : `${xpD >= 0 ? '▲' : '▼'} %${fmt.n(Math.abs(xpD))} geçen haftaya göre`, tone: xpD == null ? 'muted' : xpD >= 0 ? 'good' : 'bad' },
    ],
    bars: w.steps.perDay.map(d => ({ v: d.steps, hit: d.hit })),
  };
}

function canShareFiles() {
  try {
    return !!navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/png' })], FILE_NAME, { type: 'image/png' })] });
  } catch { return false; }
}

function shareSection(w, p) {
  const data = cardData(w, p);
  const canvas = h('canvas', { class: 'rp-canvas', width: 1080, height: 1350, role: 'img', 'aria-label': `Haftalık özet görseli: ${data.range}. ${data.sentence}` });
  const draw = () => { try { drawCard(canvas, data); } catch (e) { console.error('rapor görseli', e); } };
  draw();
  document.fonts?.ready?.then(draw).catch(() => {});

  const download = async () => {
    try {
      const blob = await toBlob(canvas);
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: FILE_NAME, style: 'display:none' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Görsel indirildi', { type: 'success' });
    } catch (e) { toast('Görsel indirilemedi', { type: 'error' }); }
  };
  const share = async () => {
    try {
      const blob = await toBlob(canvas);
      const file = new File([blob], FILE_NAME, { type: 'image/png' });
      if (!navigator.canShare?.({ files: [file] })) return download();
      await navigator.share({ files: [file], title: 'NOVA Fit haftalık rapor', text: data.sentence });
    } catch (e) {
      if (e?.name !== 'AbortError') toast('Paylaşılamadı. Görseli indirip paylaşabilirsin.', { type: 'error' });
    }
  };
  const shareable = canShareFiles();
  return h('section', { class: 'panel rp-share', 'aria-label': 'Paylaşılabilir görsel' },
    h('h2', { class: 'panel-title rp-sec-t' }, icon('share', { size: 18 }), 'Paylaşılabilir görsel'),
    h('p', { class: 'rp-note', style: 'margin-top:0' }, 'Haftanın özetini görsel olarak paylaş ya da telefonuna kaydet.'),
    h('div', { class: 'rp-canvas-wrap' }, canvas),
    h('div', { class: 'rp-share-btns' },
      shareable && h('button', { class: 'btn primary', type: 'button', onClick: share }, icon('share'), 'Paylaş'),
      h('button', { class: 'btn ' + (shareable ? 'ghost' : 'primary'), type: 'button', onClick: download }, icon('download'), 'İndir')));
}

// ---------------------------------------------------------------- Sayfa
function weekNav(w) {
  const curWs = weekStartOf(todayKey());
  const goWeek = ws => location.replace('#/report' + (ws === curWs ? '' : '/' + ws));
  return h('nav', { class: 'rp-week', 'aria-label': 'Hafta seçimi' },
    h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Önceki hafta', onClick: () => goWeek(addDays(w.ws, -7)) }, icon('left')),
    h('div', { class: 'rp-week-c' },
      h('b', null, weekLabel(w)),
      h('span', null, rangeText(w.ws, w.we))),
    h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Sonraki hafta', disabled: w.isCurrent || w.isFuture, onClick: () => goWeek(addDays(w.ws, 7)) }, icon('right')));
}

function emptyWeek(w) {
  return h('div', { class: 'panel rp-empty' },
    emptyState('chart', w.isCurrent ? 'Bu hafta henüz kayıt yok' : 'Bu hafta için kayıt yok',
      'Adımlarını, koşunu, antrenmanını ya da yemeğini kaydettikçe raporun burada oluşur.',
      h('div', { class: 'rp-empty-btns' },
        h('a', { class: 'btn primary', href: '#/steps' }, icon('steps'), 'Adım ekle'),
        h('a', { class: 'btn', href: '#/run' }, icon('run'), 'Koşuya başla'),
        h('a', { class: 'btn', href: '#/workout' }, icon('dumbbell'), 'Antrenman'),
        h('a', { class: 'btn', href: '#/nutrition' }, icon('food'), 'Yemek ekle'))),
    !w.isCurrent && h('button', { class: 'btn ghost block', type: 'button', onClick: () => location.replace('#/report') }, icon('calendar'), 'Bu haftaya dön'));
}

function render(el, params = []) {
  const curWs = weekStartOf(todayKey());
  let ws = isWeekKey(params[0]) ? weekStartOf(params[0]) : curWs;
  if (ws > curWs) ws = curWs;
  const w = computeWeek(ws);
  const prevWs = addDays(ws, -7);
  // Süren haftayı geçen haftanın aynı sayıda günüyle karşılaştır (adil kıyas)
  const p = computeWeek(prevWs, w.isCurrent && w.elapsed < 7 ? { until: addDays(prevWs, w.elapsed - 1) } : {});

  mount(el,
    backButton(),
    pageHeader('Haftalık Rapor', 'Pazartesi–Pazar haftanın özeti'),
    weekNav(w),
    w.hasData
      ? [heroCard(w, p), stepsSection(w, p), runSection(w, p), workoutSection(w, p), foodSection(w, p), weightSection(w), habitsSection(w), xpSection(w, p), shareSection(w, p)]
      : emptyWeek(w));
}

export default {
  id: 'report',
  title: 'Haftalık Rapor',
  navLabel: 'Rapor',
  icon: 'chart',
  css: true,
  render,
};
