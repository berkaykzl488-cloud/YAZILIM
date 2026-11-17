// Alt sayfalar: öğüne ekle, alışveriş listesine ekle, porsiyon ayarlayıcı.
import { h, icon, mount, fmt, modal, tabs, toast, haptic, clamp } from '../../core/ui.js';
import { todayKey } from '../../core/store.js';
import { MEALS, defaultMeal, addToDiary, toastAction, goDiary, scaledNutrition, qtyText, portionText, addToShopping, isPantryStaple, tint } from './util.js';

/** − 2 porsiyon + ayarlayıcısı. onChange(yeniDeğer) */
export function portionStepper(value, { min = 0.5, max = 24, step = 0.5, onChange, unit = 'porsiyon' } = {}) {
  let v = value;
  const label = h('span', { class: 'rcp-pstep-val', 'aria-live': 'polite' });
  const minus = h('button', { type: 'button', class: 'rcp-pstep-btn', 'aria-label': 'Azalt', onClick: () => set(v - step) }, icon('minus'));
  const plus = h('button', { type: 'button', class: 'rcp-pstep-btn', 'aria-label': 'Artır', onClick: () => set(v + step) }, icon('plus'));
  const paint = () => {
    label.replaceChildren(h('b', null, fmt.n(v, v % 1 ? 1 : 0)), ' ' + unit);
    minus.disabled = v <= min; plus.disabled = v >= max;
  };
  function set(nv) {
    nv = clamp(Math.round(nv / step) * step, min, max);
    if (nv === v) return;
    v = nv; haptic(8); paint(); onChange?.(v);
  }
  paint();
  return h('div', { class: 'rcp-pstep' }, minus, label, plus);
}

/** Öğüne ekle sayfası */
export function openAddToMeal(recipe, { portions = 1 } = {}) {
  let meal = defaultMeal(recipe);
  let por = portions;
  const today = todayKey();
  const dateInp = h('input', { class: 'input', type: 'date', value: today, 'aria-label': 'Tarih' });
  const preview = h('div', { class: 'info-strip rcp-sheet-strip' });
  const paintPreview = () => {
    const n = scaledNutrition(recipe, por);
    mount(preview,
      h('div', null, h('div', { class: 'is-label' }, 'Kalori'), h('div', { class: 'is-value' }, fmt.n(n.kcal))),
      h('div', null, h('div', { class: 'is-label' }, 'Protein'), h('div', { class: 'is-value' }, fmt.n(n.p, n.p % 1 ? 1 : 0) + ' g')),
      h('div', null, h('div', { class: 'is-label' }, 'Karb.'), h('div', { class: 'is-value' }, fmt.n(n.c, n.c % 1 ? 1 : 0) + ' g')),
      h('div', null, h('div', { class: 'is-label' }, 'Yağ'), h('div', { class: 'is-value' }, fmt.n(n.f, n.f % 1 ? 1 : 0) + ' g')));
  };
  paintPreview();

  const body = h('div', { class: 'rcp-sheet' },
    h('div', { class: 'rcp-sheet-recipe' },
      h('div', { class: 'rcp-row-tile', style: { background: tint(recipe.cat) } }, h('span', { 'aria-hidden': 'true' }, recipe.emoji)),
      h('div', { class: 'li-main' }, h('div', { class: 'rcp-row-name' }, recipe.name), h('div', { class: 'li-sub' }, `1 porsiyon ≈ ${recipe.gramsPerServing} g`))),
    h('div', { class: 'field' }, h('span', null, 'Öğün'), tabs(MEALS, meal, id => { meal = id; })),
    h('div', { class: 'grid-2' },
      h('label', { class: 'field' }, h('span', null, 'Tarih'), dateInp),
      h('div', { class: 'field' }, h('span', null, 'Porsiyon'), portionStepper(por, { max: 8, unit: '', onChange: v => { por = v; paintPreview(); } }))),
    preview);

  modal({
    title: 'Öğüne ekle',
    body,
    actions: [
      { label: 'Vazgeç', class: 'ghost' },
      { label: 'Ekle', class: 'primary', icon: 'plus', onClick: () => {
        const date = dateInp.value || today;
        addToDiary(recipe, por, meal, date);
        haptic([10, 40, 10]);
        const when = date === today ? 'bugünkü' : fmt.date(date, 'short') + ' tarihli';
        toastAction(`${recipe.name} ${when} ${MEALS.find(m => m.id === meal).label.toLocaleLowerCase('tr')} öğününe eklendi`, 'Günlüğü gör', goDiary);
      } },
    ],
  });
}

/** Alışveriş listesine ekle: malzemeleri seçtir */
export function openAddToShopping(recipe, portions) {
  const factor = portions / recipe.servings;
  const picks = recipe.ingredients.map(i => ({ ing: i, on: !isPantryStaple(i.name) }));
  const count = h('span');
  const paintCount = () => { count.textContent = String(picks.filter(p => p.on).length); };
  const list = h('div', { class: 'rcp-pick-list' }, picks.map(p => {
    const box = h('span', { class: 'rcp-check' + (p.on ? ' on' : '') }, icon('check'));
    const row = h('button', { type: 'button', class: 'rcp-pick' + (p.on ? '' : ' off'), 'aria-pressed': String(p.on), onClick: () => {
      p.on = !p.on; box.classList.toggle('on', p.on); row.classList.toggle('off', !p.on); row.setAttribute('aria-pressed', String(p.on)); paintCount();
    } }, box, h('span', { class: 'rcp-pick-txt' }, h('b', null, qtyText(p.ing.qty * factor, p.ing.unit)), ' ', p.ing.name));
    return row;
  }));
  paintCount();
  modal({
    title: 'Alışveriş listesine ekle',
    body: h('div', { class: 'rcp-sheet' },
      h('p', { class: 'muted small rcp-sheet-note' }, `${portionText(portions)} için miktarlar. Evde olanların işaretini kaldır.`),
      list),
    actions: [
      { label: 'Vazgeç', class: 'ghost' },
      { label: h('span', null, 'Ekle (', count, ')'), class: 'primary', onClick: () => {
        const items = picks.filter(p => p.on).map(p => ({ name: p.ing.name, qty: Math.round(p.ing.qty * factor * 100) / 100, unit: p.ing.unit, recipe: recipe.name }));
        if (!items.length) { toast('En az bir malzeme seç', { type: 'error' }); return false; }
        addToShopping(items);
        haptic([10, 40, 10]);
        toastAction(`${items.length} malzeme listeye eklendi`, 'Listeyi aç', () => { location.hash = '#/recipes/shopping'; });
      } },
    ],
  });
}
