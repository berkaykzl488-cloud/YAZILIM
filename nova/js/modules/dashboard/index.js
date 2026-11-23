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
    g.appendChild(svg('circle', { cx: c, cy: c, r: rad, fill: 'none', stroke: r.c1, 'stroke-opacity': .16, 'stroke-width': stroke }));
    const arc = svg('circle', { cx: c, cy: c, r: rad, fill: 'none', stroke: `url(#${id})`, 'stroke-width': stroke, 'stroke-linecap': 'round',
      'stroke-dasharray': circ, 'stroke-dashoffset': circ, transform: `rotate(-90 ${c} ${c})`,
      style: `transition: stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1) ${i * 0.12}s` });
    g.appendChild(arc);
    requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', circ * (1 - clamp(r.p, 0, 1)))));
  });
  return h('div', { class: 'tri-ring-wrap', style: { width: size + 'px', height: size + 'px' } }, g, h('div', { class: 'tri-center' }, centerNode));
}

function legendItem(color, label, value, sub) {
  return h('div', { class: 'dash-legend' },
    h('i', { style: { background: color } }),
    h('div', { class: 'grow' }, h('div', { class: 'small muted' }, label), h('div', { class: 'display dash-legend-v' }, value, sub && h('span', { class: 'stat-unit' }, sub))));
}

function moduleTile(id, key) {
  const s = call(id, 'summary', key);
  const m = getModule(id);
  if (!m) return null;
  const color = s?.color || 'var(--cyan)';
  return h('a', { class: 'panel tight click dash-tile', href: '#/' + id, style: { '--tile-c': color } },
    h('div', { class: 'row between' },
      h('span', { class: 'dash-tile-ic', style: { color, background: `color-mix(in srgb, ${color} 16%, transparent)` } }, icon(s?.icon || m.icon)),
      s?.progress != null && h('span', { class: 'dash-tile-pct' }, Math.round(clamp(s.progress, 0, 9.99) * 100) + '%')),
    h('div', { class: 'stat-label', style: 'margin-top:8px' }, s?.label || m.title),
    s ? h('div', { class: 'stat-value' }, s.value ?? '–', s.unit && h('span', { class: 'stat-unit' }, s.unit))
      : h('div', { class: 'stat-value dim' }, '—'),
    h('div', { class: 'small muted dash-tile-sub' }, s?.sub || (s ? '' : 'Henüz veri yok')),
    s?.progress != null && progressBar(s.progress, 1, { color, thin: true }));
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
    let filter = 'all';

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

      const chip = (label, ic, path) => h('a', { class: 'dash-pill', href: '#/' + path }, icon(ic, { size: 16 }), label);
      const groups = { all: TILE_MODULES, activity: ['steps', 'run', 'workout'], food: ['nutrition'], habit: ['habits'] };
      const tileGrid = h('div', { class: 'grid-2' });
      const paintTiles = g => tileGrid.replaceChildren(...groups[g].map(id => moduleTile(id, key)).filter(Boolean));
      paintTiles(filter);
      const filterChips = h('div', { class: 'chips' }, [['all', 'Tümü'], ['activity', 'Aktivite'], ['food', 'Beslenme'], ['habit', 'Alışkanlık']].map(([id, label]) =>
        h('button', { class: 'chip' + (id === filter ? ' active' : ''), type: 'button', 'aria-pressed': String(id === filter), onClick: e => {
          filter = id;
          filterChips.querySelectorAll('.chip').forEach(c => { const on = c === e.currentTarget; c.classList.toggle('active', on); c.setAttribute('aria-pressed', String(on)); });
          paintTiles(id);
        } }, label)));

      el.replaceChildren(
        h('div', { class: 'dash-hero-head' },
          h('h1', { class: 'hud-title' }, 'Bugün'),
          h('div', { class: 'small muted' }, fmt.date(key, 'full'))),

        !p.onboarded && h('a', { class: 'panel click dash-onboard', href: '#/profile' },
          h('div', { class: 'row' }, h('span', { class: 'li-icon' }, icon('user')),
            h('div', { class: 'grow' }, h('div', { class: 'li-title' }, 'Profilini tamamla'),
              h('div', { class: 'li-sub' }, 'Boy, kilo ve hedefini gir; kalori hedefin sana göre hesaplansın')),
            icon('right', { size: 20 }))),

        // ---- Öne çıkan kart ----
        h('div', { class: 'panel hero dash-core' },
          h('div', { class: 'info-strip' },
            h('div', null, h('div', { class: 'is-label' }, icon('steps'), 'Adım'), h('div', { class: 'is-value' }, fmt.n(steps))),
            h('div', null, h('div', { class: 'is-label' }, icon('flame'), 'Kalori'), h('div', { class: 'is-value' }, fmt.n(intake.kcal))),
            h('div', null, h('div', { class: 'is-label' }, icon('water'), 'Su'), h('div', { class: 'is-value' }, fmt.n((intake.waterMl || 0) / 1000, 1) + ' L'))),
          h('div', { class: 'dash-core-body' },
            tripleRing([
              { p: pSteps, c1: '#ff7a1a', c2: '#ffa64d' },
              { p: pFood, c1: '#4ea8ff', c2: '#7cc0ff' },
              { p: pActive, c1: '#3fd17f', c2: '#7be3a8' },
            ], 196, h('div', null,
              h('div', { class: 'small muted' }, 'Günlük skor'),
              h('div', { class: 'dash-score' }, String(score), h('small', null, '%')),
              h('div', { class: 'small', style: 'color:var(--accent);font-weight:600' }, score >= 80 ? 'Harika gidiyorsun' : score >= 50 ? 'İyi gidiyor' : score > 0 ? 'Biraz daha hareket' : 'Güne başla'))),
            h('div', { class: 'dash-legends' },
              legendItem('#ff7a1a', 'Adım', fmt.n(steps), `/ ${fmt.n(p.stepGoal)}`),
              legendItem('#4ea8ff', 'Yenilen kalori', fmt.n(intake.kcal), `/ ${fmt.n(target)} kcal`),
              legendItem('#3fd17f', 'Hareketle yakılan', fmt.n(active), `/ ${ACTIVE_KCAL_GOAL} kcal`))),
          h('div', { class: 'dash-pills' },
            chip('Koşu', 'run', 'run'), chip('Antrenman', 'dumbbell', 'workout'), chip('Öğün', 'food', 'nutrition'), chip('Tarif', 'list', 'recipes'))),

        // ---- Enerji dengesi ----
        h('div', { class: 'panel dash-energy' },
          h('div', { class: 'row between' },
            h('div', { class: 'panel-title', style: 'margin:0' }, 'Kalori dengesi'),
            h('span', { class: 'badge ' + (net > 0 ? 'red' : 'lime') }, net > 0 ? 'Fazla' : 'Açık')),
          h('div', { class: 'dash-energy-row' },
            h('div', null, h('div', { class: 'stat-label' }, 'Yenilen'), h('div', { class: 'dash-big' }, fmt.n(intake.kcal))),
            h('span', { class: 'dash-op' }, '−'),
            h('div', null, h('div', { class: 'stat-label' }, 'Harcanan'), h('div', { class: 'dash-big' }, fmt.n(totalBurn))),
            h('span', { class: 'dash-op' }, '='),
            h('div', null, h('div', { class: 'stat-label' }, 'Fark'), h('div', { class: 'dash-big ' + (net > 0 ? 'c-red' : 'c-lime') }, (net > 0 ? '+' : '') + fmt.n(net)))),
          h('div', { class: 'small muted' }, `Harcanan = dinlenirken ${fmt.n(base)} + hareketle ${fmt.n(active)} kcal`),
          h('div', { class: 'divider' }),
          h('div', { class: 'grid-3 small' },
            h('div', null, h('div', { class: 'muted' }, 'Protein'), h('b', { class: 'mono' }, fmt.n(intake.protein) + ' g')),
            h('div', null, h('div', { class: 'muted' }, 'Karbonhidrat'), h('b', { class: 'mono' }, fmt.n(intake.carbs) + ' g')),
            h('div', null, h('div', { class: 'muted' }, 'Yağ'), h('b', { class: 'mono' }, fmt.n(intake.fat) + ' g')))),

        // ---- Bölümler ----
        sectionTitle('Bölümler'),
        filterChips,
        tileGrid,

        // ---- Tarif kartı ----
        h('a', { class: 'dash-recipe', href: '#/recipes' },
          h('div', { class: 'grow' },
            h('div', { class: 'dash-recipe-t' }, 'Fit tarifler'),
            h('div', { class: 'dash-recipe-s' }, 'Kahvaltıdan tatlıya sağlıklı, yüksek proteinli tarifler'),
            h('span', { class: 'dash-recipe-b' }, 'Tariflere bak', icon('right', { size: 16 }))),
          h('span', { class: 'dash-recipe-e', 'aria-hidden': 'true' }, '🥗')),

        // ---- Araçlar ----
        sectionTitle('Araçlar'),
        h('div', { class: 'dash-tools' }, [
          ['report', 'chart', 'Haftalık rapor'], ['body', 'scale', 'Ölçüler'],
          ['recipes/week', 'calendar', 'Haftalık menü'], ['reminders', 'clock', 'Hatırlatıcı'],
        ].map(([path, ic, label]) => h('a', { class: 'dash-tool', href: '#/' + path }, h('span', null, icon(ic)), label))),

        // ---- Haftalık ----
        sectionTitle('Son 7 gün adım', h('a', { class: 'small', href: '#/steps' }, 'Tümünü gör')),
        h('div', { class: 'panel' },
          barChart(hist.map(d => ({ label: fmt.date(d.date, 'weekday'), value: d.steps, highlight: d.date === key })), { height: 110 }),
          h('div', { class: 'row between mt small muted' },
            h('span', null, 'Ortalama ', h('b', { class: 'mono', style: 'color:var(--text)' }, fmt.n(hist.reduce((s, d) => s + d.steps, 0) / Math.max(1, hist.length)))),
            h('span', null, 'Toplam ', h('b', { class: 'mono', style: 'color:var(--text)' }, fmt.n(hist.reduce((s, d) => s + d.steps, 0)))))),

        // ---- Seviye ----
        sectionTitle('Seviyen'),
        h('a', { class: 'panel hero violet click dash-rank', href: '#/profile' },
          h('div', { class: 'row' },
            h('div', { class: 'dash-lv' }, h('small', null, 'Seviye'), String(lv.level)),
            h('div', { class: 'grow' },
              h('div', { class: 'li-title' }, lv.rank.name),
              h('div', { class: 'li-sub' }, `${fmt.n(lv.total)} puan · sonraki seviyeye ${fmt.n(lv.next - lv.total)} puan`),
              h('div', { class: 'mt' }, progressBar(lv.progress, 1, { color: 'var(--violet)' })))),
          (getXP().log || []).slice(0, 3).length ? h('div', { class: 'list mt' }, getXP().log.slice(0, 3).map(x =>
            h('div', { class: 'list-item', style: 'padding:6px 2px;min-height:0' }, h('span', { class: 'grow small' }, x.reason || 'Puan'), h('span', { class: 'mono small c-amber' }, '+' + x.amount)))) : null),
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
