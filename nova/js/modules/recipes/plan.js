// Günlük menü önerisi: kalori hedefine yakın, proteini yüksek 4 öğün. Puanlama engine.js'de (haftalık planla ortak).
import { h, icon, mount, fmt, progressBar, haptic, emptyState } from '../../core/ui.js';
import { load, save, todayKey } from '../../core/store.js';
import { calorieTarget, macroTargets } from '../../core/profile.js';
import { getRecipe } from './data.js';
import { SLOTS, SLOT_PORTIONS, OPTS, pools, totals, score, bestPortions } from './engine.js';
import { MEALS, addToDiary, toastAction, goDiary, scaledNutrition, portionText, recipeRow, weekLinkCard } from './util.js';
import { nav } from './nav.js';

const pick = a => a[Math.floor(Math.random() * a.length)];

export function suggest(opts, target, avoid = new Set()) {
  const P = pools(opts);
  if (SLOTS.some(s => !P[s].length)) return null;
  let best = null;
  for (let i = 0; i < 260; i++) {
    const rs = SLOTS.map(s => {
      const fresh = P[s].filter(r => !avoid.has(r.id));
      return pick(fresh.length ? fresh : P[s]);
    });
    if (rs[1].id === rs[2].id) continue;
    const b = bestPortions(rs, target);
    const sc = b.sc + Math.random() * 0.05;
    if (!best || sc < best.sc) best = { ...b, sc };
  }
  return best?.items || null;
}

function swapSlot(items, slot, opts, target) {
  const P = pools(opts)[slot];
  const others = new Set(items.map(i => i.id));
  const cands = P.filter(r => !others.has(r.id));
  if (!cands.length) return items;
  const scored = cands.map(r => {
    let bestLocal = null;
    for (const p of SLOT_PORTIONS[slot]) {
      const next = items.map(it => (it.slot === slot ? { slot, id: r.id, portions: p } : it));
      const sc = score(totals(next), target);
      if (!bestLocal || sc < bestLocal.sc) bestLocal = { sc, next };
    }
    return bestLocal;
  }).sort((a, b) => a.sc - b.sc);
  return pick(scored.slice(0, 6)).next;
}

export function renderPlan(el) {
  const mt = macroTargets();
  const target = { kcal: calorieTarget(), protein: mt.protein, carbs: mt.carbs, fat: mt.fat };
  const saved = load('recipes.plan', null);
  const state = {
    opts: Array.isArray(saved?.opts) ? saved.opts : [],
    items: saved?.date === todayKey() && Array.isArray(saved.items) && saved.items.every(i => getRecipe(i.id)) ? saved.items : null,
  };
  const persist = () => save('recipes.plan', { date: todayKey(), opts: state.opts, items: state.items });
  if (!state.items) { state.items = suggest(state.opts, target); persist(); }

  const summary = h('div');
  const optChips = h('div', { class: 'chips rcp-chips' });
  const mealsEl = h('div', { class: 'rcp-plan-meals' });
  const actions = h('div', { class: 'grid-2 rcp-plan-actions' });

  function regenerate() {
    const avoid = new Set((state.items || []).map(i => i.id));
    state.items = suggest(state.opts, target, avoid);
    persist(); haptic(10); paint();
  }

  function paintSummary() {
    if (!state.items) { summary.replaceChildren(); return; }
    const t = totals(state.items);
    const row = (label, val, goal, unit, color) => h('div', { class: 'rcp-plan-bar' },
      h('div', { class: 'row between' }, h('span', { class: 'small' }, label),
        h('span', { class: 'small' }, h('b', null, fmt.n(val)), h('span', { class: 'muted' }, ` / ${fmt.n(goal)} ${unit}`))),
      progressBar(val, goal, { color, thin: true }));
    const diff = Math.round(t.kcal - target.kcal);
    mount(summary, h('div', { class: 'panel hero rcp-plan-sum' },
      h('div', { class: 'rcp-plan-sum-top' },
        h('div', null,
          h('div', { class: 'muted small' }, 'Menünün toplamı'),
          h('div', { class: 'rcp-big' }, fmt.n(t.kcal), h('span', null, 'kcal'))),
        h('div', { class: 'rcp-plan-diff ' + (Math.abs(diff) <= target.kcal * 0.06 ? 'ok' : 'warn') },
          Math.abs(diff) <= target.kcal * 0.06 ? 'Hedefe uygun' : diff > 0 ? `${fmt.n(diff)} kcal fazla` : `${fmt.n(-diff)} kcal eksik`)),
      row('Kalori', t.kcal, target.kcal, 'kcal', 'var(--accent)'),
      row('Protein', t.p, target.protein, 'g', 'var(--lime)'),
      row('Karbonhidrat', t.c, target.carbs, 'g', 'var(--amber)'),
      row('Yağ', t.f, target.fat, 'g', 'var(--violet)')));
  }

  function paintOpts() {
    mount(optChips, OPTS.map(o => h('button', { type: 'button', class: 'chip' + (state.opts.includes(o.id) ? ' active' : ''), 'aria-pressed': String(state.opts.includes(o.id)), onClick: () => {
      state.opts = state.opts.includes(o.id) ? state.opts.filter(x => x !== o.id) : [...state.opts, o.id];
      state.items = suggest(state.opts, target);
      persist(); paint();
    } }, state.opts.includes(o.id) && icon('check'), o.label)));
  }

  function paintMeals() {
    if (!state.items) {
      mount(mealsEl, h('div', { class: 'panel' }, emptyState('search', 'Uygun menü bulunamadı', 'Seçtiğin filtrelerle her öğün için tarif bulamadık. Birkaç filtreyi kaldırmayı dene.')));
      return;
    }
    mount(mealsEl, state.items.map(it => {
      const r = getRecipe(it.id);
      const n = scaledNutrition(r, it.portions);
      return h('div', { class: 'rcp-plan-meal' },
        h('div', { class: 'rcp-plan-slot' }, MEALS.find(m => m.id === it.slot).label),
        recipeRow(r, `${portionText(it.portions)} · ${fmt.n(n.kcal)} kcal · ${fmt.n(n.p)} g protein`,
          h('button', { type: 'button', class: 'rcp-round-btn sm', 'aria-label': MEALS.find(m => m.id === it.slot).label + ' için başka tarif öner', onClick: e => {
            e.stopPropagation();
            state.items = swapSlot(state.items, it.slot, state.opts, target);
            persist(); haptic(8); paint();
          } }, icon('refresh')),
          () => { location.hash = '#/recipes/' + r.id; }));
    }));
  }

  function paintActions() {
    mount(actions,
      h('button', { type: 'button', class: 'btn', onClick: regenerate }, icon('refresh'), 'Yenile'),
      h('button', { type: 'button', class: 'btn primary', disabled: !state.items, onClick: () => {
        const today = todayKey();
        state.items.forEach(it => addToDiary(getRecipe(it.id), it.portions, it.slot, today));
        haptic([10, 40, 10]);
        toastAction('4 öğün bugünün günlüğüne eklendi', 'Günlüğü gör', goDiary);
      } }, icon('plus'), 'Bugüne ekle'));
  }

  function paint() { paintSummary(); paintOpts(); paintMeals(); paintActions(); }

  el.append(
    nav.button('recipes', 'Geri'),
    h('h1', { class: 'hud-title' }, 'Günlük menü önerisi'),
    h('p', { class: 'hud-sub' }, `Hedefin: ${fmt.n(target.kcal)} kcal ve ${fmt.n(target.protein)} g protein. Profilindeki bilgilere göre hesaplanır.`),
    summary,
    h('div', { class: 'small muted rcp-plan-optlabel' }, 'Tercihler'),
    optChips,
    mealsEl,
    actions,
    weekLinkCard('Bütün haftayı planla', '7 günlük menü, toplu hazırlık ve haftanın alışveriş listesi'),
    h('p', { class: 'tiny dim rcp-disclaimer' }, 'Öneriler porsiyonları hedefine göre ayarlar; tarife dokunarak ayrıntıları görebilirsin.'));
  paint();
}
