// Geçmiş ve istatistikler: haftalık seri, antrenman takvimi, haftalık hacim, kas dağılımı, oturum detayı
import { h, icon, fmt, mount, backButton, sectionTitle, emptyState, barChart, toast, confirmDialog } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { todayKey, addDays, parseKey } from '../../core/store.js';
import { muscleMap } from './figure.js';
import { EX, GROUPS, groupLabel } from './exercises.js';
import { subNav, activeBanner, exRow } from './kit.js';
import { sessions, weekStreak, weekStart, durationMin, sessionTotals, groupDistribution, deleteSession } from './data.js';

let justFinished = null;
export function markJustFinished(id, prs) { justFinished = { id, prs }; }

const shortMonth = k => parseKey(k).toLocaleDateString('tr-TR', { month: 'short' });

export function renderHistory(el) {
  const list = sessions();
  const head = [h('h1', { class: 'hud-title' }, 'Geçmiş'), h('p', { class: 'hud-sub' }, 'Antrenmanların, gelişimin ve istatistiklerin.'), subNav('history'), activeBanner()];
  if (!list.length) {
    mount(el, ...head, h('div', { class: 'panel' }, emptyState('calendar', 'Henüz antrenman kaydın yok', 'İlk antrenmanını tamamladığında süre, hacim ve gelişim grafiklerin burada görünecek.',
      h('a', { class: 'btn primary', href: '#/workout' }, icon('play'), 'Antrenmana başla'))));
    return;
  }
  const today = todayKey();
  const wk = weekStart(today);
  const thisWeek = list.filter(s => s.date >= wk);
  const total30 = list.filter(s => s.date >= addDays(today, -29));
  const streak = weekStreak(list);

  // Isı şeridi: son 12 hafta (sütun = hafta, satır = gün)
  const byDay = {};
  for (const s of list) byDay[s.date] = (byDay[s.date] || 0) + durationMin(s);
  const start = addDays(wk, -7 * 11);
  const cols = [];
  for (let w = 0; w < 12; w++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const k = addDays(start, w * 7 + d);
      const m = byDay[k] || 0;
      const lvl = k > today ? 'f' : m === 0 ? 0 : m < 25 ? 1 : m < 50 ? 2 : 3;
      cells.push(h('i', { class: 'wk-heat-c l' + lvl, title: `${fmt.date(k, 'short')}: ${m ? m + ' dk' : 'antrenman yok'}` }));
    }
    cols.push(h('div', { class: 'wk-heat-col' }, cells, h('span', { class: 'wk-heat-m' }, w % 4 === 0 ? shortMonth(addDays(start, w * 7)) : '')));
  }

  // Haftalık hacim: son 8 hafta
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const ws = addDays(wk, -7 * i), we = addDays(ws, 6);
    const v = list.filter(s => s.date >= ws && s.date <= we).reduce((a, s) => a + (s.volumeKg || 0), 0);
    weeks.push({ label: parseKey(ws).getDate() + ' ' + shortMonth(ws).slice(0, 3), value: v, highlight: i === 0 });
  }

  const dist = groupDistribution(30, list);
  const maxG = Math.max(1, ...Object.values(dist.groups));
  const topMus = Object.entries(dist.muscles).sort((a, b) => b[1] - a[1]);
  const prim = topMus.slice(0, 4).map(x => x[0]), sec = topMus.slice(4, 9).map(x => x[0]);

  mount(el, ...head,
    h('section', { class: 'panel hero' },
      h('div', { class: 'row between' },
        h('div', null, h('div', { class: 'small muted' }, 'Haftalık seri'), h('div', { class: 'stat-value xl' }, String(streak), h('span', { class: 'stat-unit' }, 'hafta'))),
        h('div', { class: 'wk-flame', 'aria-hidden': 'true' }, icon('flame'))),
      h('p', { class: 'small muted', style: 'margin:6px 0 12px' }, streak ? 'Her hafta en az bir antrenman yaparak serini sürdür.' : 'Bu hafta bir antrenman yaparak yeni bir seri başlat.'),
      h('div', { class: 'info-strip' },
        h('div', null, h('div', { class: 'is-label' }, 'Bu hafta'), h('div', { class: 'is-value' }, `${thisWeek.length} antrenman`)),
        h('div', null, h('div', { class: 'is-label' }, 'Son 30 gün'), h('div', { class: 'is-value' }, `${total30.reduce((a, s) => a + durationMin(s), 0)} dk`)),
        h('div', null, h('div', { class: 'is-label' }, 'Toplam'), h('div', { class: 'is-value' }, `${list.length} antrenman`)))),
    sectionTitle('Antrenman takvimi'),
    h('div', { class: 'panel' },
      h('div', { class: 'wk-heat' }, h('div', { class: 'wk-heat-days' }, ['Pzt', '', 'Çar', '', 'Cum', '', 'Paz'].map(d => h('span', null, d))), cols),
      h('div', { class: 'wk-heat-legend small muted' }, 'Az', [0, 1, 2, 3].map(l => h('i', { class: 'wk-heat-c l' + l })), 'Çok')),
    sectionTitle('Haftalık hacim (kg)'),
    h('div', { class: 'panel' }, barChart(weeks, { height: 130, format: v => fmt.n(v) + ' kg' })),
    sectionTitle('Kas grubu dağılımı (son 30 gün)'),
    h('div', { class: 'panel' },
      Object.keys(dist.groups).length ? h('div', { class: 'wk-dist' },
        h('div', { class: 'wk-dist-bars' }, GROUPS.filter(g => dist.groups[g.id]).sort((a, b) => dist.groups[b.id] - dist.groups[a.id]).map(g => h('div', { class: 'wk-dist-row' },
          h('span', { class: 'wk-dist-l' }, g.label),
          h('span', { class: 'wk-dist-track' }, h('i', { style: { width: (dist.groups[g.id] / maxG * 100) + '%' } })),
          h('span', { class: 'wk-dist-v' }, `${Math.round(dist.groups[g.id])} set`)))),
        h('div', { class: 'wk-mm small-map' }, muscleMap(prim, sec)))
        : h('p', { class: 'muted small' }, 'Son 30 günde antrenman yok.')),
    sectionTitle('Antrenmanlar'),
    h('div', { class: 'panel tight' }, h('div', { class: 'list' }, [...list].reverse().slice(0, 40).map(s => {
      const t = sessionTotals(s);
      return h('a', { class: 'list-item click wk-plain', href: '#/workout/log/' + s.id },
        h('span', { class: 'li-icon' }, icon(s.location === 'gym' ? 'gym' : 'home')),
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, s.name), h('span', { class: 'li-sub' }, `${fmt.date(s.date, 'short')} · ${durationMin(s)} dk · ${t.sets} set`)),
        h('span', { class: 'li-end' }, `${fmt.n(s.volumeKg || 0)} kg`));
    }))));
}

export function renderLog(el, id) {
  const s = sessions().find(x => x.id === id);
  if (!s) {
    mount(el, backButton('workout/history'), h('div', { class: 'panel' }, emptyState('calendar', 'Antrenman bulunamadı', 'Bu kayıt silinmiş olabilir.', h('a', { class: 'btn primary', href: '#/workout/history' }, 'Geçmişe dön'))));
    return;
  }
  const fresh = justFinished?.id === id ? justFinished : null;
  justFinished = null;
  const t = sessionTotals(s);
  const prs = s.prs || [];
  mount(el,
    backButton(fresh ? 'workout' : 'workout/history', fresh ? 'Antrenmanlara dön' : 'Geri'),
    fresh ? h('section', { class: 'panel hero wk-done-hero' },
      h('div', { class: 'wk-done-ic' }, icon('trophy')),
      h('h1', { class: 'hud-title' }, 'Tebrikler!'),
      h('p', { class: 'muted', style: 'margin:0' }, 'Antrenmanını tamamladın ve kaydettik.')) : h('h1', { class: 'hud-title' }, s.name),
    h('p', { class: 'hud-sub' }, `${fresh ? s.name + ' · ' : ''}${fmt.date(s.date)} · ${fmt.time(s.startTs)}`),
    h('div', { class: 'grid-2 wk-sum' },
      h('div', { class: 'panel tight' }, h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Süre'), h('div', { class: 'stat-value xl' }, String(durationMin(s)), h('span', { class: 'stat-unit' }, 'dk')))),
      h('div', { class: 'panel tight' }, h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Toplam hacim'), h('div', { class: 'stat-value xl' }, fmt.n(s.volumeKg || 0), h('span', { class: 'stat-unit' }, 'kg')))),
      h('div', { class: 'panel tight' }, h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Yakılan enerji'), h('div', { class: 'stat-value xl' }, fmt.n(s.kcal || 0), h('span', { class: 'stat-unit' }, 'kcal')))),
      h('div', { class: 'panel tight' }, h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Tamamlanan set'), h('div', { class: 'stat-value xl' }, String(t.sets), h('span', { class: 'stat-unit' }, 'set'))))),
    prs.length ? [sectionTitle('Yeni kişisel rekorlar'), h('div', { class: 'panel' }, h('ul', { class: 'wk-bullets ok' }, prs.map(p => h('li', null, icon('trophy'), h('span', null, EX[p]?.name || p)))))] : null,
    sectionTitle('Egzersizler'),
    h('div', { class: 'panel tight' }, h('div', { class: 'list' }, s.exercises.map(x => {
      const e = EX[x.exId];
      if (!e) return null;
      const txt = x.sets.map(st => e.type === 'time' ? `${st.sec} sn` : st.kg ? `${fmt.n(st.kg, st.kg % 1 ? 1 : 0)}×${st.reps}` : `${st.reps} tekrar`).join(' · ');
      return exRow(e, txt);
    }))),
    fresh ? h('a', { class: 'btn primary block lg', href: '#/workout/history' }, icon('chart'), 'Geçmişi gör') : null,
    h('button', { class: 'btn danger block wk-del', type: 'button', onClick: async () => {
      if (await confirmDialog('Bu antrenman kaydı silinsin mi? Bu işlem geri alınamaz.', { title: 'Kaydı sil', okLabel: 'Sil', danger: true })) {
        deleteSession(id); toast('Antrenman kaydı silindi'); go('workout/history');
      }
    } }, icon('trash'), 'Kaydı sil'));
}
