// Merkez: tüm modüllerin günlük özetini tek holografik kokpitte birleştirir.
import { h, svg, icon, fmt, sectionTitle, progressBar, barChart, clamp } from '../../core/ui.js';
import { todayKey, lastNDays, subscribe } from '../../core/store.js';
import { getProfile, calorieTarget, bmr, waterTarget } from '../../core/profile.js';
import { levelInfo, getXP } from '../../core/xp.js';
import { getModule, go } from '../../core/router.js';

const TILE_MODULES = ['steps', 'run', 'workout', 'nutrition', 'habits'];
const ACTIVE_KCAL_GOAL = 500;

const call = (id, fn, ...args) => {
  try { return getModule(id)?.[fn]?.(...args) ?? null; } catch (e) { console.warn(id, fn, e); return null; }
};

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'İyi geceler';
  if (hr < 12) return 'Günaydın';
  if (hr < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

function burnedToday(key) {
  return ['steps', 'run', 'workout'].reduce((s, id) => s + (Number(call(id, 'burned', key)) || 0), 0);
}

/** Üç iç içe halka: adım, beslenme, aktif yakım */
function tripleRing(rings, size = 210, centerNode) {
  const c = size / 2, stroke = 13, gap = 5;
  const g = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'tri-ring' });
  const defs = svg('defs');
  g.appendChild(defs);
  rings.forEach((r, i) => {
    const rad = c - stroke / 2 - i * (stroke + gap) - 4;
    const circ = 2 * Math.PI * rad;
    const id = 'rg' + i;
    defs.appendChild(svg('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 },
      svg('stop', { offset: 0, 'stop-color': r.c1 }), svg('stop', { offset: 1, 'stop-color': r.c2 })));
    g.appendChild(svg('circle', { cx: c, cy: c, r: rad, fill: 'none', stroke: r.c1, 'stroke-opacity': .12, 'stroke-width': stroke }));
    const arc = svg('circle', { cx: c, cy: c, r: rad, fill: 'none', stroke: `url(#${id})`, 'stroke-width': stroke, 'stroke-linecap': 'round',
      'stroke-dasharray': circ, 'stroke-dashoffset': circ, transform: `rotate(-90 ${c} ${c})`,
      style: `filter: drop-shadow(0 0 6px ${r.c1}); transition: stroke-dashoffset 1.4s cubic-bezier(.2,.8,.2,1) ${i * 0.15}s` });
    g.appendChild(arc);
    requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', circ * (1 - clamp(r.p, 0, 1)))));
  });
  // dış tik halkası
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, r1 = c - 1, r2 = c - (i % 5 ? 3 : 6);
    g.appendChild(svg('line', { x1: c + Math.cos(a) * r1, y1: c + Math.sin(a) * r1, x2: c + Math.cos(a) * r2, y2: c + Math.sin(a) * r2, stroke: 'rgba(0,240,255,.35)', 'stroke-width': 1 }));
  }
  return h('div', { class: 'tri-ring-wrap', style: { width: size + 'px', height: size + 'px' } }, g, h('div', { class: 'tri-center' }, centerNode));
}

function legendItem(color, label, value, sub) {
  return h('div', { class: 'dash-legend' },
    h('i', { style: { background: color, boxShadow: `0 0 8px ${color}` } }),
    h('div', { class: 'grow' }, h('div', { class: 'small muted' }, label), h('div', { class: 'display dash-legend-v' }, value, sub && h('span', { class: 'stat-unit' }, sub))));
}

function moduleTile(id, key) {
  const s = call(id, 'summary', key);
  const m = getModule(id);
  if (!m) return null;
  const color = s?.color || 'var(--cyan)';
  return h('a', { class: 'panel tight click dash-tile', href: '#/' + id, style: { '--tile-c': color } },
    h('div', { class: 'row between' },
      h('span', { class: 'dash-tile-ic', style: { color } }, icon(s?.icon || m.icon)),
      s?.progress != null && h('span', { class: 'mono tiny', style: { color } }, Math.round(clamp(s.progress, 0, 9.99) * 100) + '%')),
    h('div', { class: 'stat-label', style: 'margin-top:8px' }, s?.label || m.title),
    s ? h('div', { class: 'stat-value' }, s.value ?? '–', s.unit && h('span', { class: 'stat-unit' }, s.unit))
      : h('div', { class: 'stat-value dim' }, '—'),
    h('div', { class: 'small muted dash-tile-sub' }, s?.sub || (s ? '' : 'Henüz veri yok')),
    s?.progress != null && progressBar(s.progress, 1, { color, thin: true }));
}

function quick(label, ic, path, cls = '') {
  return h('a', { class: 'dash-quick ' + cls, href: '#/' + path }, h('span', null, icon(ic)), label);
}

export default {
  id: 'home',
  title: 'Merkez',
  navLabel: 'Merkez',
  icon: 'home',
  css: true,

  render(el) {
    const key = todayKey();
    const p = getProfile();

    const draw = () => {
      const steps = Number(call('steps', 'stepsFor', key)) || 0;
      const intake = call('nutrition', 'intake', key) || { kcal: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0 };
      const active = Math.round(burnedToday(key));
      const target = calorieTarget(p);
      const base = bmr(p);
      const totalBurn = base + active;
      const net = Math.round(intake.kcal - totalBurn);
      const water = waterTarget(p);

      const pSteps = steps / (p.stepGoal || 10000);
      const pFood = intake.kcal / target;
      const pActive = active / ACTIVE_KCAL_GOAL;
      const pWater = (intake.waterMl || 0) / water;
      // Biyo-senkron skoru: hedeflere yakınlık (beslenmede aşım ceza)
      const foodScore = pFood <= 1 ? pFood : Math.max(0, 2 - pFood);
      const score = Math.round(100 * (clamp(pSteps, 0, 1) * 0.3 + clamp(pActive, 0, 1) * 0.25 + foodScore * 0.25 + clamp(pWater, 0, 1) * 0.2));

      const lv = levelInfo();
      const days = lastNDays(7);
      const hist = call('steps', 'history', 7) || days.map(d => ({ date: d, steps: Number(call('steps', 'stepsFor', d)) || 0 }));

      el.replaceChildren(
        // ---- Karşılama ----
        h('div', { class: 'dash-hero-head' },
          h('div', { class: 'small muted' }, fmt.date(key, 'full')),
          h('h1', { class: 'hud-title', style: 'margin-top:4px' }, p.name ? `${greeting()}, ${p.name}` : greeting()),
          h('div', { class: 'small muted' }, 'Bugünkü özetin aşağıda.')),

        !p.onboarded && h('a', { class: 'panel magenta click dash-onboard', href: '#/profile' },
          h('div', { class: 'row' }, h('span', { class: 'li-icon', style: 'color:var(--magenta)' }, icon('cpu')),
            h('div', { class: 'grow' }, h('div', { class: 'li-title' }, 'Profilini tamamla'),
              h('div', { class: 'li-sub' }, 'Boy, kilo ve hedefini gir; günlük kalori hedefin sana göre hesaplansın')),
            icon('right', { size: 20 }))),

        // ---- Ana halka ----
        h('div', { class: 'panel scan dash-core' },
          h('div', { class: 'panel-title' }, icon('target', { size: 16 }), 'Bugün'),
          h('div', { class: 'dash-core-body' },
            tripleRing([
              { p: pSteps, c1: '#00f0ff', c2: '#3b8bff' },
              { p: pFood, c1: '#ffb020', c2: '#ff6a00' },
              { p: pActive, c1: '#ff2bd6', c2: '#8b5cff' },
            ], 200, h('div', null,
              h('div', { class: 'small muted' }, 'Günlük skor'),
              h('div', { class: 'dash-score' }, String(score), h('small', null, '%')),
              h('div', { class: 'small c-cyan' }, score >= 80 ? 'Harika gidiyorsun' : score >= 50 ? 'İyi gidiyor' : score > 0 ? 'Biraz daha hareket' : 'Güne başla'))),
            h('div', { class: 'dash-legends' },
              legendItem('var(--cyan)', 'Adım', fmt.n(steps), `/ ${fmt.n(p.stepGoal)}`),
              legendItem('var(--amber)', 'Yenilen kalori', fmt.n(intake.kcal), `/ ${fmt.n(target)} kcal`),
              legendItem('var(--magenta)', 'Hareketle yakılan', fmt.n(active), `/ ${ACTIVE_KCAL_GOAL} kcal`)))),

        // ---- Enerji dengesi ----
        h('div', { class: 'grid-3' },
          h('div', { class: 'panel tight center' }, h('div', { class: 'stat-label' }, 'Yenilen'), h('div', { class: 'stat-value c-amber' }, fmt.n(intake.kcal)), h('div', { class: 'tiny muted' }, 'kcal')),
          h('div', { class: 'panel tight center' }, h('div', { class: 'stat-label' }, 'Harcanan'), h('div', { class: 'stat-value c-magenta' }, fmt.n(totalBurn)), h('div', { class: 'tiny muted' }, 'kcal')),
          h('div', { class: 'panel tight center' }, h('div', { class: 'stat-label' }, 'Fark'), h('div', { class: 'stat-value ' + (net > 0 ? 'c-red' : 'c-lime') }, (net > 0 ? '+' : '') + fmt.n(net)), h('div', { class: 'tiny muted' }, net > 0 ? 'kcal fazla' : 'kcal açık'))),

        // ---- Su + makro şeridi ----
        h('a', { class: 'panel tight click dash-water', href: '#/nutrition' },
          h('div', { class: 'row between' },
            h('div', { class: 'row gap-s' }, h('span', { class: 'c-cyan' }, icon('water', { size: 18 })), h('span', { class: 'stat-label' }, 'Su')),
            h('span', { class: 'mono small' }, `${fmt.n((intake.waterMl || 0) / 1000, 2)} / ${fmt.n(water / 1000, 1)} L`)),
          h('div', { class: 'mt' }, progressBar(intake.waterMl || 0, water, { color: 'var(--cyan)' })),
          h('div', { class: 'grid-3 mt small' },
            h('div', null, h('span', { class: 'muted' }, 'Protein '), h('b', { class: 'mono' }, fmt.n(intake.protein) + 'g')),
            h('div', null, h('span', { class: 'muted' }, 'Karb '), h('b', { class: 'mono' }, fmt.n(intake.carbs) + 'g')),
            h('div', null, h('span', { class: 'muted' }, 'Yağ '), h('b', { class: 'mono' }, fmt.n(intake.fat) + 'g')))),

        // ---- Hızlı komutlar ----
        sectionTitle('Hızlı başlat'),
        h('div', { class: 'dash-quicks' },
          quick('Koşu başlat', 'run', 'run', 'q-mag'),
          quick('Antrenman', 'dumbbell', 'workout', 'q-lime'),
          quick('Öğün ekle', 'food', 'nutrition', 'q-amb'),
          quick('Alışkanlık', 'shield', 'habits', 'q-vio')),

        // ---- Modüller ----
        sectionTitle('Bugünün özeti'),
        h('div', { class: 'grid-2' }, TILE_MODULES.map(id => moduleTile(id, key))),

        // ---- Haftalık ----
        sectionTitle('Son 7 gün adım', h('a', { class: 'small', href: '#/steps' }, 'Tümünü gör')),
        h('div', { class: 'panel' },
          barChart(hist.map(d => ({ label: fmt.date(d.date, 'weekday'), value: d.steps, highlight: d.date === key })), { height: 110 }),
          h('div', { class: 'row between mt small muted' },
            h('span', null, 'Ortalama ', h('b', { class: 'mono c-cyan' }, fmt.n(hist.reduce((s, d) => s + d.steps, 0) / Math.max(1, hist.length)))),
            h('span', null, 'Toplam ', h('b', { class: 'mono' }, fmt.n(hist.reduce((s, d) => s + d.steps, 0)))))),

        // ---- Seviye ----
        sectionTitle('Seviyen'),
        h('a', { class: 'panel click dash-rank', href: '#/profile' },
          h('div', { class: 'row' },
            h('div', { class: 'dash-lv' }, h('small', null, 'Seviye'), String(lv.level)),
            h('div', { class: 'grow' },
              h('div', { class: 'li-title', style: { color: lv.rank.color } }, lv.rank.name),
              h('div', { class: 'li-sub' }, `${fmt.n(lv.total)} puan · sonraki seviyeye ${fmt.n(lv.next - lv.total)} puan`),
              h('div', { class: 'mt' }, progressBar(lv.progress, 1, { color: 'var(--magenta)' })))),
          (getXP().log || []).slice(0, 3).length ? h('div', { class: 'list mt' }, getXP().log.slice(0, 3).map(x =>
            h('div', { class: 'list-item', style: 'padding:6px 2px' }, h('span', { class: 'grow small' }, x.reason || 'Puan'), h('span', { class: 'mono small c-magenta' }, '+' + x.amount)))) : null),
      );
    };

    draw();
    // Veri değişince (ör. adım sayar canlı sayarken) paneli yumuşakça tazele
    let t;
    const unsub = subscribe('*', (_v, k) => {
      if (['ui', 'run.active', 'workout.active'].includes(k)) return;
      clearTimeout(t); t = setTimeout(draw, 1500);
    });
    return () => { unsub(); clearTimeout(t); };
  },
};
