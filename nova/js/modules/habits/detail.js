// Alışkanlık detay ekranı: canlı sayaç, iyileşme görseli, sağlık zaman çizelgesi, istekler, rozetler, nedenler
import { h, icon, mount, fmt, modal, confirmDialog, toast, tabs, progressBar, barChart, ring, emptyState, backButton } from '../../core/ui.js';
import { go } from '../../core/router.js';
import {
  tpl, get, mutate, removeHabit, stats, span, spanLabel, clockParts, pad2, fmtUnits, triggerLabel,
  BADGES_DAY, BADGES_MONEY, checkAchievements, removeCraving, DAY,
} from './data.js';
import { organViz } from './viz.js';
import { cravingDialog, relapseDialog } from './dialogs.js';

let lastTab = 'health';
let showAll = false;

export function renderDetail(el, id) {
  let hb = get(id);
  if (!hb) {
    mount(el, backButton('habits'),
      h('div', { class: 'panel' }, emptyState('alert', 'Kayıt bulunamadı', 'Bu alışkanlık silinmiş olabilir.',
        h('a', { class: 'btn primary', href: '#/habits' }, 'Listeye dön'))));
    return () => {};
  }
  checkAchievements(id);
  hb = get(id);
  const t = tpl(hb.type);
  let viz, live = {}, timer;

  const refresh = () => { hb = get(id); if (!hb) { go('habits'); return; } draw(); };

  function moreMenu() {
    const close = modal({
      title: hb.name,
      body: h('div', { class: 'list' },
        h('button', { class: 'list-item click hb-menu-item', onClick: () => { close(); go(`habits/${id}/edit`); } },
          h('span', { class: 'li-icon' }, icon('edit')), h('span', { class: 'li-main li-title' }, 'Bilgileri düzenle')),
        h('button', { class: 'list-item click hb-menu-item', onClick: async () => {
          close();
          const ok = await confirmDialog(hb.archived ? 'Bu alışkanlık yeniden aktif listeye alınsın mı?' : 'Arşive alınan alışkanlık listede gizlenir. Verilerin silinmez; istediğin zaman geri alabilirsin.',
            { title: hb.archived ? 'Arşivden çıkar' : 'Arşive al', okLabel: hb.archived ? 'Geri al' : 'Arşive al' });
          if (!ok) return;
          mutate(id, x => { x.archived = !x.archived; });
          toast(hb.archived ? 'Arşivden çıkarıldı' : 'Arşive alındı', { type: 'success' });
          hb.archived ? refresh() : go('habits');
        } }, h('span', { class: 'li-icon' }, icon('layers')), h('span', { class: 'li-main li-title' }, hb.archived ? 'Arşivden çıkar' : 'Arşive al')),
        h('button', { class: 'list-item click hb-menu-item danger', onClick: async () => {
          close();
          const ok = await confirmDialog(`"${hb.name}" ve tüm geçmişi (istekler, kaymalar, rozetler) kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
            { title: 'Silinsin mi?', okLabel: 'Sil', danger: true });
          if (!ok) return;
          removeHabit(id);
          toast('Silindi', { type: 'success' });
          go('habits');
        } }, h('span', { class: 'li-icon' }, icon('trash')), h('span', { class: 'li-main li-title' }, 'Sil'))),
    });
  }

  // ---------------------------------------------------- canlı bölüm
  function hero(s) {
    viz = organViz(t.organ, s.recovery, { size: 148 });
    live.pct = h('b', { class: 'hb-pct-num' });
    live.nextTitle = h('div', { class: 'hb-next-title' });
    live.nextEta = h('div', { class: 'hb-next-eta' });
    live.nextBar = h('div', { class: 'hb-next-bar' });
    live.clock = ['d', 'h', 'm', 's'].map(() => h('b'));
    const seg = (i, label) => h('div', { class: 'hb-clk-seg' }, live.clock[i], h('span', null, label));
    return h('section', { class: 'panel hb-hero' },
      h('div', { class: 'hb-hero-top' },
        viz.el,
        h('div', { class: 'hb-hero-side' },
          h('div', { class: 'hb-label' }, `${viz.label} iyileşmesi`),
          h('div', { class: 'hb-pct' }, live.pct, h('span', null, '%')),
          h('div', { class: 'hb-label', style: 'margin-top:8px' }, 'Sıradaki adım'),
          live.nextTitle, live.nextBar, live.nextEta)),
      h('div', { class: 'hb-label hb-clk-title' }, h('span', { class: 'hb-live-dot' }), 'Temiz geçen süre'),
      h('div', { class: 'hb-clock', role: 'timer', 'aria-live': 'off' },
        seg(0, 'gün'), seg(1, 'saat'), seg(2, 'dakika'), seg(3, 'saniye')));
  }

  function statCards() {
    live.saved = h('div', { class: 'hb-stat-v c-lime' });
    live.units = h('div', { class: 'hb-stat-v' });
    live.regain = h('div', { class: 'hb-stat-v' });
    const unitLabel = hb.type === 'smoking' ? 'İçilmeyen sigara' : hb.unitName === 'dk' ? 'Ekrandan kazanılan süre' : `Kaçınılan ${hb.unitName}`;
    const regainLabel = t.timeKind === 'life' ? 'Kazanılan ömür (tahmini)' : 'Geri kazanılan zaman';
    const cards = [
      h('div', { class: 'hb-stat' }, h('span', { class: 'hb-stat-ic lime' }, icon('coin')), h('div', null, live.saved, h('div', { class: 'hb-stat-l' }, 'Biriktirilen para'))),
      h('div', { class: 'hb-stat' }, h('span', { class: 'hb-stat-ic' }, icon(hb.icon)), h('div', null, live.units, h('div', { class: 'hb-stat-l' }, unitLabel))),
    ];
    if (hb.timePerUnit > 0 && hb.unitName !== 'dk') cards.push(h('div', { class: 'hb-stat' }, h('span', { class: 'hb-stat-ic violet' }, icon('clock')), h('div', null, live.regain, h('div', { class: 'hb-stat-l' }, regainLabel))));
    return h('div', { class: 'hb-stats' + (cards.length === 3 ? ' three' : '') }, cards);
  }

  function tick() {
    hb = get(id) || hb;
    const s = stats(hb);
    const c = clockParts(s.ms);
    live.clock[0].textContent = c.d; live.clock[1].textContent = pad2(c.h); live.clock[2].textContent = pad2(c.m); live.clock[3].textContent = pad2(c.s);
    live.pct.textContent = Math.floor(s.recovery * 100);
    live.saved.textContent = hb.costPerDay > 0 ? fmt.money(s.saved) : '—';
    live.units.textContent = hb.unitName === 'dk' ? fmtUnits(hb, s.units) : fmt.n(Math.floor(s.units));
    live.regain.textContent = span(s.regainMin * 6e4);
    if (s.next) {
      live.nextTitle.textContent = `${spanLabel(s.next.t)} · ${s.next.title}`;
      live.nextEta.textContent = `%${Math.floor(s.nextProgress * 100)} · ${span(s.next.t - s.ms)} kaldı`;
      live.nextBar.style.setProperty('--p', (s.nextProgress * 100).toFixed(2) + '%');
    } else {
      live.nextTitle.textContent = 'Tüm adımlar tamamlandı';
      live.nextEta.textContent = 'Harika bir iş çıkardın!';
      live.nextBar.style.setProperty('--p', '100%');
    }
    viz?.set(s.recovery);
    // Yeni bir zaman eşiği geçildiyse (ör. saniye 0'da) rozetleri ve çizelgeyi yenile
    if (s.done !== live.done) {
      if (live.done != null) { checkAchievements(id); hb = get(id); if (lastTab === 'health' || lastTab === 'badges') drawTab(); }
      live.done = s.done;
    }
    if (c.s === 0 && c.m % 5 === 0) checkAchievements(id);
  }

  // ---------------------------------------------------- sekmeler
  const tabBody = h('div', { class: 'hb-tabbody' });

  function healthTab() {
    const s = stats(hb);
    return [
      h('ol', { class: 'hb-tl' }, s.timeline.map((m, i) => {
        const state = i < s.done ? 'done' : i === s.done ? 'cur' : 'lock';
        return h('li', { class: 'hb-tl-item ' + state },
          h('span', { class: 'hb-tl-node' }, icon(state === 'done' ? 'check' : state === 'cur' ? 'clock' : 'lock')),
          h('div', { class: 'hb-tl-body' },
            h('div', { class: 'hb-tl-head' }, h('span', { class: 'hb-tl-time' }, spanLabel(m.t)),
              state === 'done' && h('span', { class: 'hb-tl-tag ok' }, 'Tamamlandı'),
              state === 'cur' && h('span', { class: 'hb-tl-tag' }, `%${Math.floor(s.nextProgress * 100)}`)),
            h('div', { class: 'hb-tl-title' }, m.title),
            h('p', { class: 'hb-tl-desc' }, m.desc),
            state === 'cur' && h('div', null, progressBar(s.nextProgress, 1), h('div', { class: 'muted small', style: 'margin-top:6px' }, `${span(m.t - s.ms)} kaldı`))));
      })),
      h('p', { class: 'hb-disclaimer' }, icon('info'), h('span', null,
        'Bu bilgiler genel bilgidir, tıbbi tavsiye değildir. Süreler kişiden kişiye değişir.',
        t.track === 'alcohol' ? ' Uzun süredir yoğun alkol kullanıyorsan bırakmadan önce mutlaka bir doktora danış.' : '')),
    ];
  }

  function cravingsTab() {
    const cr = [...hb.cravings].sort((a, b) => b.ts - a.ts);
    const addBtn = h('button', { class: 'btn primary block', onClick: () => cravingDialog(hb, { onSaved: refresh }) }, icon('plus'), 'İstek kaydet');
    if (!cr.length) {
      return [h('div', { class: 'panel' }, emptyState('wind', 'Henüz istek kaydı yok',
        'İstek geldiğinde kaydet: ne zaman ve neden geldiğini görürsen daha kolay önlem alırsın.', addBtn)), relapseHistory()];
    }
    const resisted = cr.filter(c => c.resisted).length;
    const ratio = resisted / cr.length;
    const avg = cr.reduce((s, c) => s + c.intensity, 0) / cr.length;
    const week = cr.filter(c => c.ts > Date.now() - 7 * DAY).length;
    const hours = Array.from({ length: 24 }, () => 0);
    cr.forEach(c => { hours[new Date(c.ts).getHours()]++; });
    const peak = hours.indexOf(Math.max(...hours));
    const trig = {};
    cr.forEach(c => { if (c.trigger) trig[c.trigger] = (trig[c.trigger] || 0) + 1; });
    const topTrig = Object.entries(trig).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxTrig = topTrig[0]?.[1] || 1;

    return [
      addBtn,
      h('div', { class: 'panel hb-insight mt' },
        ring({ value: ratio * 100, max: 100, size: 96, stroke: 9, color: 'var(--lime)', glow: false, track: 'rgba(255,255,255,.08)',
          center: h('div', null, h('div', { class: 'hb-ring-v' }, `%${Math.round(ratio * 100)}`), h('div', { class: 'hb-ring-l' }, 'atlatıldı')) }),
        h('div', { class: 'hb-insight-grid' },
          h('div', null, h('b', null, String(cr.length)), h('span', null, 'toplam istek')),
          h('div', null, h('b', null, String(resisted)), h('span', null, 'atlatılan')),
          h('div', null, h('b', null, fmt.n(avg, 1)), h('span', null, 'ort. şiddet')),
          h('div', null, h('b', null, String(week)), h('span', null, 'son 7 gün')))),
      h('div', { class: 'panel' },
        h('div', { class: 'hb-panel-h' }, 'İsteklerin saatlere göre dağılımı'),
        h('p', { class: 'muted small', style: 'margin:0 0 6px' }, `En çok saat ${pad2(peak)}:00 civarında geliyor.`),
        h('div', { class: 'hb-hours' }, barChart(hours.map((v, i) => ({ label: i % 6 === 0 ? pad2(i) : '', value: v, highlight: i === peak && v > 0 })), { height: 110 }))),
      h('div', { class: 'panel' },
        h('div', { class: 'hb-panel-h' }, 'En sık tetikleyiciler'),
        topTrig.length ? h('div', { class: 'hb-trig' }, topTrig.map(([k, v]) => h('div', { class: 'hb-trig-row' },
          h('div', { class: 'row between' }, h('span', null, triggerLabel(k)), h('span', { class: 'mono muted' }, `${v}×`)),
          progressBar(v, maxTrig, { thin: true }))))
          : h('p', { class: 'muted small', style: 'margin:0' }, 'İstek kaydederken tetikleyici seçersen burada görünür.')),
      h('div', { class: 'panel' },
        h('div', { class: 'hb-panel-h' }, 'Son istekler'),
        h('div', { class: 'list' }, cr.slice(0, showAll ? 200 : 6).map(c => h('div', { class: 'list-item hb-cr-item' },
          h('span', { class: 'hb-cr-int', style: { '--c': c.intensity >= 8 ? 'var(--red)' : c.intensity >= 5 ? 'var(--amber)' : 'var(--lime)' } }, String(c.intensity)),
          h('div', { class: 'li-main' },
            h('div', { class: 'li-title' }, c.trigger ? triggerLabel(c.trigger) : 'İstek', c.sos && h('span', { class: 'badge magenta', style: 'margin-left:8px' }, 'Acil destek')),
            h('div', { class: 'li-sub' }, fmt.dateTime(c.ts) + (c.note ? ' · ' + c.note : ''))),
          h('span', { class: 'badge ' + (c.resisted ? 'lime' : 'amber') }, c.resisted ? 'Atlattı' : 'Yaptı'),
          h('button', { class: 'btn ghost icon sm', 'aria-label': 'İsteği sil', onClick: async () => {
            if (!await confirmDialog('Bu istek kaydı silinsin mi?', { title: 'Kaydı sil', okLabel: 'Sil', danger: true })) return;
            removeCraving(id, c.id); toast('Kayıt silindi', { type: 'success' }); refresh();
          } }, icon('trash'))))),
        cr.length > 6 && h('button', { class: 'btn ghost block sm mt', onClick: () => { showAll = !showAll; drawTab(); } },
          showAll ? 'Daha az göster' : `Tümünü göster (${cr.length})`)),
      relapseHistory(),
    ];
  }

  function relapseHistory() {
    const rel = [...hb.relapses].sort((a, b) => b.ts - a.ts);
    return h('div', { class: 'panel' },
      h('div', { class: 'hb-panel-h' }, 'Deneme geçmişi'),
      h('div', { class: 'list' },
        h('div', { class: 'list-item' }, h('span', { class: 'li-icon hb-li-violet' }, icon('play')),
          h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, `Deneme ${rel.length + 1} · şu anki`), h('div', { class: 'li-sub' }, 'Başlangıç: ' + fmt.dateTime(hb.quitAt))),
          h('span', { class: 'li-end c-lime' }, span(Date.now() - hb.quitAt))),
        rel.map((r, i) => h('div', { class: 'list-item' }, h('span', { class: 'li-icon hb-li-dim' }, icon('repeat')),
          h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, `Deneme ${rel.length - i}`),
            h('div', { class: 'li-sub' }, fmt.dateTime(r.ts) + (r.note ? ' · ' + r.note : ''))),
          h('span', { class: 'li-end muted' }, span(r.streakMs))))),
      !rel.length && h('p', { class: 'muted small', style: 'margin:8px 0 0' }, 'Hiç kayma yok. Böyle devam!'));
  }

  function badgesTab() {
    const s = stats(hb);
    const tile = (b, earned, prog, sub) => h('div', { class: 'hb-badge' + (earned ? ' on' : '') },
      h('div', { class: 'hb-badge-hex' }, icon(earned ? (b.amt ? 'coin' : 'trophy') : 'lock')),
      h('div', { class: 'hb-badge-name' }, b.label),
      h('div', { class: 'hb-badge-sub' }, earned ? (hb.badges[b.key] ? fmt.date(new Date(hb.badges[b.key]).toISOString().slice(0, 10), 'short') : 'Kazanıldı') : sub),
      !earned && h('div', { class: 'hb-badge-prog' }, h('i', { style: { width: Math.min(100, prog * 100).toFixed(1) + '%' } })));
    const dayTiles = BADGES_DAY.map(b => tile(b, !!hb.badges[b.key], s.ms / b.t, `%${Math.floor(Math.min(1, s.ms / b.t) * 100)}`));
    const moneyTiles = hb.costPerDay > 0 ? BADGES_MONEY.map(b => tile(b, !!hb.badges[b.key], s.totalSaved / b.amt, `${fmt.money(Math.max(0, b.amt - s.totalSaved))} kaldı`)) : [];
    const earned = Object.keys(hb.badges).length;
    return [
      h('p', { class: 'muted', style: 'margin:0 0 10px' }, `${earned} rozet kazandın. Her rozet XP verir; kazandığın rozetler kayma olsa da silinmez.`),
      h('div', { class: 'hb-panel-h' }, 'Temiz süre rozetleri'),
      h('div', { class: 'hb-badges' }, dayTiles),
      moneyTiles.length ? [h('div', { class: 'hb-panel-h mt' }, 'Birikim rozetleri'), h('div', { class: 'hb-badges' }, moneyTiles)] : null,
    ];
  }

  function reasonsTab() {
    return [
      hb.reasons.length
        ? h('div', { class: 'hb-reasons' }, hb.reasons.map((r, i) => h('div', { class: 'hb-reason-card' }, h('span', { class: 'hb-reason-n' }, pad2(i + 1)), h('span', null, r))))
        : h('div', { class: 'panel' }, emptyState('heart', 'Henüz neden eklemedin', 'Nedenlerini yazarsan, istek geldiğinde sana hatırlatırız.',
          h('button', { class: 'btn primary', onClick: () => go(`habits/${id}/edit`) }, icon('plus'), 'Neden ekle'))),
      hb.motivation && h('blockquote', { class: 'hb-quote' }, hb.motivation),
      hb.reasons.length && h('button', { class: 'btn ghost block mt', onClick: () => go(`habits/${id}/edit`) }, icon('edit'), 'Nedenleri düzenle'),
    ];
  }

  function drawTab() {
    const fn = { health: healthTab, cravings: cravingsTab, badges: badgesTab, reasons: reasonsTab }[lastTab] || healthTab;
    mount(tabBody, fn());
  }

  // ---------------------------------------------------- ana çizim
  function draw() {
    const s = stats(hb);
    live = {};
    mount(el,
      backButton('habits'),
      h('div', { class: 'hb-titlerow' },
        h('span', { class: 'hb-ic-sm' }, icon(hb.icon)),
        h('h1', { class: 'hb-title' }, hb.name),
        h('button', { class: 'btn ghost icon', 'aria-label': 'Diğer işlemler', onClick: moreMenu }, icon('more'))),
      hb.archived && h('div', { class: 'hb-note amber' }, icon('layers'), 'Bu alışkanlık arşivde. Menüden geri alabilirsin.'),
      hero(s),
      statCards(),
      h('a', { class: 'hb-sos', href: `#/habits/${id}/sos` },
        h('span', { class: 'hb-sos-orb' }, icon('wind')),
        h('span', { class: 'hb-sos-txt' }, h('b', null, 'İstek geldi'), h('span', null, 'Acil destek: nefes egzersizi ve 5 dakikalık geri sayım')),
        icon('right')),
      h('div', { class: 'hb-actions' },
        h('button', { class: 'btn ghost', onClick: () => cravingDialog(hb, { onSaved: () => { lastTab = 'cravings'; refresh(); } }) }, icon('plus'), 'İstek kaydet'),
        h('button', { class: 'btn ghost hb-btn-relapse', onClick: () => relapseDialog(hb, { onDone: () => { refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }) }, icon('refresh'), 'Kaydım')),
      h('div', { class: 'hb-streaks' },
        h('div', null, h('b', null, span(s.ms, 1)), h('span', null, 'Şu anki seri')),
        h('div', null, h('b', null, span(s.best, 1)), h('span', null, 'En iyi seri')),
        h('div', null, h('b', null, String(s.attempts)), h('span', null, 'Deneme'))),
      h('div', { class: 'hb-tabs' }, tabs([
        { id: 'health', label: 'Sağlık' }, { id: 'cravings', label: 'İstekler' }, { id: 'badges', label: 'Rozetler' }, { id: 'reasons', label: 'Nedenler' },
      ], lastTab, v => { lastTab = v; drawTab(); })),
      tabBody);
    drawTab();
    tick();
  }

  draw();
  timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}

