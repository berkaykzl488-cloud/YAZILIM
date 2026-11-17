// Haftalık yemek planı: 7 gün × 4 öğün, kilitle/değiştir/porsiyon, toplu hazırlık,
// haftanın alışveriş listesi ve günü günlüğe ekleme. Kayıt: recipes.weekPlan[haftaBaşı].
import { h, icon, mount, fmt, progressBar, haptic, emptyState, modal, toast, confirmDialog, tabs, toggle } from '../../core/ui.js';
import { load, update, todayKey, addDays, parseKey, daysBetween } from '../../core/store.js';
import { calorieTarget, macroTargets } from '../../core/profile.js';
import { getRecipe, totalMin, norm, matches } from './data.js';
import {
  MEAL_LABEL, addToDiary, toastAction, goDiary, scaledNutrition, portionText, tint, qtyText, aisleOf, AISLES,
  addToShopping, getShopping, isPantryStaple, session, minText,
} from './util.js';
import { OPTS, SLOTS, pools, totals, dayFit, generateWeek, rankForSlot, useCounts, weekIssues, mainProtein, PROTEIN_LABEL } from './engine.js';
import { portionStepper } from './sheets.js';
import { nav } from './nav.js';

const KEY = 'recipes.weekPlan';
const KEEP_WEEKS = 8;

/** Haftanın pazartesisi */
export function weekStart(key = todayKey()) {
  const wd = (parseKey(key).getDay() + 6) % 7;
  return addDays(key, -wd);
}
const dayLong = key => parseKey(key).toLocaleDateString('tr-TR', { weekday: 'long' });
const monthLong = key => parseKey(key).toLocaleDateString('tr-TR', { month: 'long' });
function rangeText(start) {
  const end = addDays(start, 6);
  const d1 = parseKey(start).getDate(), d2 = parseKey(end).getDate();
  return monthLong(start) === monthLong(end) ? `${d1}–${d2} ${monthLong(end)}` : `${d1} ${monthLong(start)} – ${d2} ${monthLong(end)}`;
}

// ---------- Kayıt ----------
const loadAllWeeks = () => { const v = load(KEY, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };

function validWeek(w) {
  if (!w || !Array.isArray(w.days) || w.days.length !== 7) return null;
  for (const d of w.days) {
    if (!d || !Array.isArray(d.items) || d.items.length !== 4) return null;
    if (d.items.some((it, k) => !it || it.slot !== SLOTS[k] || !getRecipe(it.id) || !(it.portions > 0))) return null;
  }
  return { ...w, opts: Array.isArray(w.opts) ? w.opts : [], prep: !!w.prep };
}

/** Son kullanılan tercihler (yeni hafta için varsayılan) */
function lastPrefs() {
  const all = loadAllWeeks();
  const latest = Object.keys(all).sort().pop();
  const w = latest && all[latest];
  return { opts: Array.isArray(w?.opts) ? w.opts.filter(o => OPTS.some(x => x.id === o)) : [], prep: !!w?.prep };
}

function persistWeek(start, w) {
  const minKey = addDays(weekStart(), -7 * KEEP_WEEKS);
  update(KEY, all => {
    const out = all && typeof all === 'object' && !Array.isArray(all) ? all : {};
    Object.keys(out).forEach(k => { if (k < minKey) delete out[k]; });
    if (w) out[start] = { ...w, updatedAt: Date.now() }; else delete out[start];
    return out;
  }, {});
}

// ---------- Hesaplar ----------
const isStaple = name => isPantryStaple(name) || /^(tuz|karabiber|pul biber|.*toz biber|kimyon|kekik|kuru kekik|kuru nane|tarçın|zerdeçal|köri|sumak|muskat|biberiye|defne yaprağı|yenibahar|vanilya|sarımsak tozu|zencefil tozu|kırmızı toz biber|isot|baharat.*|.*baharatı)$/.test(String(name).toLocaleLowerCase('tr'));

/** Planın malzemelerini birleştirir: aynı ad + birim toplanır */
function mergeIngredients(days, { skipStaples = true } = {}) {
  const map = new Map();
  days.forEach(d => d.items.forEach(it => {
    const r = getRecipe(it.id);
    if (!r) return;
    const f = it.portions / r.servings;
    for (const ing of r.ingredients) {
      if (skipStaples && isStaple(ing.name)) continue;
      const key = norm(ing.name) + '|' + (ing.unit || '');
      const ex = map.get(key);
      if (ex) { ex.qty += ing.qty * f; ex.recipes.add(r.name); }
      else map.set(key, { key, name: ing.name, unit: ing.unit, qty: ing.qty * f, recipes: new Set([r.name]) });
    }
  }));
  return [...map.values()].map(x => ({ ...x, qty: Math.round(x.qty * 100) / 100 }));
}

/** Metne dokununca da değişen açma/kapama satırı */
function toggleRow(label, sub, val, onChange, emoji = null) {
  const t = toggle(val, onChange);
  const inp = t.querySelector('input');
  inp.setAttribute('aria-label', label);
  return h('div', { class: 'rcp-wk-prep', onClick: e => { if (!e.target.closest('.toggle')) inp.click(); } },
    emoji && h('span', { class: 'rcp-wk-prep-ic', 'aria-hidden': 'true' }, emoji),
    h('span', { class: 'li-main' }, h('span', { class: 'rcp-wk-prep-t' }, label), sub && h('span', { class: 'li-sub' }, sub)),
    t);
}

// Sayfalar arası korunan seçim
const ui = { week: 'this', day: null, start: null };

export function renderWeek(el) {
  const mt = macroTargets();
  const target = { kcal: calorieTarget(), protein: mt.protein, carbs: mt.carbs, fat: mt.fat };
  const today = todayKey();
  const thisStart = weekStart(today);
  let start = null, plan = null;

  const dayKey = i => addDays(start, i);
  const dayShort = i => fmt.date(dayKey(i), 'weekday');
  const isPast = i => dayKey(i) < today;
  const persist = () => persistWeek(start, plan);

  function openWeek(which) {
    ui.week = which;
    start = which === 'next' ? addDays(thisStart, 7) : thisStart;
    plan = validWeek(loadAllWeeks()[start]);
    if (ui.start !== start || ui.day == null) {
      ui.start = start;
      const ti = daysBetween(start, today);
      ui.day = ti >= 0 && ti < 7 ? ti : 0;
    }
    paint();
  }

  // ---------- Üst kısım ----------
  const backBtn = nav.cameFrom('#/recipes') ? nav.button('recipes', 'Geri') : nav.exitButton('Geri');
  const weekTabs = tabs([{ id: 'this', label: 'Bu hafta' }, { id: 'next', label: 'Gelecek hafta' }], ui.week, id => openWeek(id));
  weekTabs.classList.add('rcp-wk-tabs');
  const rangeEl = h('p', { class: 'hud-sub rcp-wk-range' });
  const body = h('div');

  // ---------- Tercihler ----------
  function prefsBlock(opts, prep, onChange) {
    const chips = h('div', { class: 'chips rcp-chips' }, OPTS.map(o => {
      const on = opts.includes(o.id);
      return h('button', { type: 'button', class: 'chip' + (on ? ' active' : ''), 'aria-pressed': String(on), onClick: () => {
        onChange(on ? opts.filter(x => x !== o.id) : [...opts, o.id], prep);
      } }, on && icon('check'), o.label);
    }));
    const prepRow = toggleRow('Toplu hazırlık (meal prep)', 'Öğle yemeğini bir kez pişir, 2–3 gün ye', prep, v => onChange(opts, v), '🍱');
    return [h('div', { class: 'small muted rcp-plan-optlabel' }, 'Tercihler'), chips, prepRow];
  }

  // ---------- Plan oluşturma ----------
  function build(opts, prep, prev = null) {
    const res = generateWeek({ opts, prep, target, prev });
    if (!res) return null;
    const old = plan;
    return {
      opts, prep, createdAt: old?.createdAt || Date.now(),
      days: res.days.map((d, i) => ({ items: d.items, ...(old?.days?.[i]?.diaryAt ? { diaryAt: old.days[i].diaryAt } : {}) })),
      ...(old?.shopAt ? { shopAt: old.shopAt } : {}),
    };
  }

  function regenerate(opts = plan.opts, prep = plan.prep, msg = 'Plan yenilendi') {
    const before = structuredClone(plan);
    // Toplu hazırlık modu değişince eski grup bilgisi geçersiz: kilitli grupları çöz
    const prev = plan.days.map(d => ({ items: d.items.map(it => (prep !== plan.prep && it.prep ? { ...it, locked: false } : it)) }));
    const next = build(opts, prep, prev);
    if (!next) { toast('Bu tercihlerle plan oluşturulamadı. Birkaç tercihi kaldırmayı dene.', { type: 'error' }); return; }
    if (!prep) next.days.forEach(d => d.items.forEach(it => { delete it.prep; }));
    plan = next; persist(); haptic(10); paint();
    toastAction(msg, 'Geri al', () => { plan = before; persist(); paint(); }, 'success');
  }

  function paintSetup() {
    const prefs = lastPrefs();
    let opts = prefs.opts, prep = prefs.prep;
    const prefWrap = h('div');
    const paintPrefs = () => mount(prefWrap, prefsBlock(opts, prep, (o, p) => { opts = o; prep = p; paintPrefs(); }));
    paintPrefs();
    mount(body,
      h('div', { class: 'panel hero rcp-wk-setup' },
        h('div', { class: 'rcp-hero-kicker' }, ui.week === 'next' ? 'Gelecek hafta' : 'Bu hafta'),
        h('div', { class: 'rcp-hero-title' }, 'Haftanı birlikte planlayalım'),
        h('p', { class: 'rcp-hero-sub' }, `Her gün için kahvaltı, öğle, akşam ve ara öğün seçeriz. Günlük toplam ${fmt.n(target.kcal)} kcal ve ${fmt.n(target.protein)} g protein hedefine yakın olur.`),
        h('ul', { class: 'rcp-wk-points' },
          h('li', null, icon('check'), 'Bir tarif haftada en fazla 2 kez'),
          h('li', null, icon('check'), 'Ardışık akşamlarda farklı protein'),
          h('li', null, icon('check'), 'Tek dokunuşla haftanın alışveriş listesi'))),
      prefWrap,
      h('button', { type: 'button', class: 'btn primary lg block rcp-wk-create', onClick: () => {
        const next = build(opts, prep);
        if (!next) { toast('Bu tercihlerle plan oluşturulamadı. Birkaç tercihi kaldırmayı dene.', { type: 'error' }); return; }
        plan = next; persist(); haptic([10, 40, 10]); paint();
        toast('Haftalık planın hazır', { type: 'success' });
      } }, icon('sparkle'), 'Haftalık planı oluştur'));
  }

  // ---------- Plan görünümü ----------
  const dayTotals = i => totals(plan.days[i].items);

  function overview() {
    const ts = plan.days.map((_, i) => dayTotals(i));
    const avgK = ts.reduce((a, t) => a + t.kcal, 0) / 7, avgP = ts.reduce((a, t) => a + t.p, 0) / 7;
    const okDays = ts.filter(t => dayFit(t, target).ok).length;
    const distinct = new Set(plan.days.flatMap(d => d.items.map(i => i.id))).size;
    return h('div', { class: 'info-strip rcp-wk-strip' },
      h('div', null, h('div', { class: 'is-label' }, 'Ort. kalori'), h('div', { class: 'is-value' }, fmt.n(avgK))),
      h('div', null, h('div', { class: 'is-label' }, 'Ort. protein'), h('div', { class: 'is-value' }, fmt.n(avgP) + ' g')),
      h('div', null, h('div', { class: 'is-label' }, 'Uygun gün'), h('div', { class: 'is-value' }, `${okDays}/7`)),
      h('div', null, h('div', { class: 'is-label' }, 'Tarif'), h('div', { class: 'is-value' }, distinct)));
  }

  function dayChips() {
    return h('div', { class: 'rcp-wk-days', role: 'tablist', 'aria-label': 'Günler' }, plan.days.map((d, i) => {
      const k = dayKey(i);
      const fit = dayFit(dayTotals(i), target);
      const sel = i === ui.day;
      return h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(sel),
        'aria-label': `${dayLong(k)} ${fmt.date(k, 'short')}${k === today ? ', bugün' : ''}${fit.ok ? ', hedefe uygun' : ''}`,
        class: 'rcp-wk-day' + (sel ? ' active' : '') + (k === today ? ' today' : '') + (isPast(i) ? ' past' : ''),
        onClick: () => { ui.day = i; haptic(6); paint(); },
      },
        h('span', { class: 'rcp-wk-day-w' }, dayShort(i)),
        h('span', { class: 'rcp-wk-day-n' }, parseKey(k).getDate()),
        h('i', { class: 'rcp-wk-day-dot ' + (fit.ok ? 'ok' : 'warn'), 'aria-hidden': 'true' }));
    }));
  }

  const sumEl = h('div');
  function paintDaySummary() {
    const i = ui.day, k = dayKey(i);
    const t = dayTotals(i);
    const diff = Math.round(t.kcal - target.kcal);
    const fit = dayFit(t, target);
    const row = (label, val, goal, unit, color) => h('div', { class: 'rcp-plan-bar' },
      h('div', { class: 'row between' }, h('span', { class: 'small' }, label),
        h('span', { class: 'small' }, h('b', null, fmt.n(val)), h('span', { class: 'muted' }, ` / ${fmt.n(goal)} ${unit}`))),
      progressBar(val, goal, { color, thin: true }));
    const badge = Math.abs(diff) <= target.kcal * 0.1
      ? (fit.protOk ? 'Hedefe uygun' : 'Protein biraz az')
      : diff > 0 ? `${fmt.n(diff)} kcal fazla` : `${fmt.n(-diff)} kcal eksik`;
    mount(sumEl, h('div', { class: 'panel hero rcp-plan-sum rcp-wk-sum' },
      h('div', { class: 'rcp-plan-sum-top' },
        h('div', null,
          h('div', { class: 'muted small' }, `${dayLong(k)}, ${fmt.date(k, 'short')}${k === today ? ' · bugün' : ''}`),
          h('div', { class: 'rcp-big' }, fmt.n(t.kcal), h('span', null, 'kcal'))),
        h('div', { class: 'rcp-plan-diff ' + (fit.ok ? 'ok' : 'warn') }, badge)),
      row('Kalori', t.kcal, target.kcal, 'kcal', 'var(--accent)'),
      row('Protein', t.p, target.protein, 'g', 'var(--lime)'),
      row('Karbonhidrat', t.c, target.carbs, 'g', 'var(--amber)'),
      row('Yağ', t.f, target.fat, 'g', 'var(--violet)')));
  }

  const groupDays = gid => plan.days.map((d, i) => (d.items.some(x => x.prep === gid) ? i : -1)).filter(i => i >= 0);
  const forGroup = (di, slot, fn) => {
    const it = plan.days[di].items.find(x => x.slot === slot);
    (it.prep ? groupDays(it.prep) : [di]).forEach(d => fn(plan.days[d].items.find(x => x.slot === slot), d));
  };

  function mealCard(di, it) {
    const r = getRecipe(it.id);
    const sub = h('div', { class: 'li-sub' });
    const paintSub = () => {
      const n = scaledNutrition(r, it.portions);
      sub.textContent = `${fmt.n(n.kcal)} kcal · ${fmt.n(n.p)} g protein · ${minText(totalMin(r))}`;
    };
    paintSub();
    const gDays = it.prep ? groupDays(it.prep) : [];
    const lockBtn = h('button', {
      type: 'button', class: 'rcp-round-btn sm rcp-wk-lock' + (it.locked ? ' on' : ''), 'aria-pressed': String(!!it.locked),
      'aria-label': `${MEAL_LABEL[it.slot]} öğününü ${it.locked ? 'kilitten çıkar' : 'kilitle'}`,
      onClick: e => {
        e.stopPropagation();
        const on = !it.locked;
        forGroup(di, it.slot, x => { x.locked = on; });
        persist(); haptic(8); paintMeals();
        toast(on ? 'Öğün kilitlendi; “Yenile” onu korur' : 'Kilit kaldırıldı', { type: 'info', ms: 1800 });
      },
    }, icon('lock'));
    const swapBtn = h('button', { type: 'button', class: 'rcp-round-btn sm', 'aria-label': `${MEAL_LABEL[it.slot]} için başka tarif seç`, onClick: e => { e.stopPropagation(); openPicker(di, it.slot); } }, icon('refresh'));
    const cookPortions = it.prep ? gDays.reduce((a, d) => a + plan.days[d].items[1].portions, 0) : it.portions;
    const cookBtn = h('button', { type: 'button', class: 'btn sm rcp-wk-cook', 'aria-label': `Pişirmeye başla: ${r.name}`, onClick: () => {
      session.portions.set(r.id, Math.max(0.5, Math.round(cookPortions * 2) / 2));
      location.hash = `#/recipes/${r.id}/cook`;
    } }, icon('play'), h('span', null, 'Pişir', h('span', { class: 'rcp-wk-xs-hide' }, 'meye başla')));
    const stepper = portionStepper(it.portions, { min: 0.5, max: 4, step: 0.5, unit: 'porsiyon', onChange: v => {
      it.portions = v; persist(); paintSub(); paintDaySummary(); refreshChrome();
    } });
    stepper.classList.add('rcp-wk-pstep');
    stepper.setAttribute('aria-label', 'Porsiyon');

    return h('article', { class: 'rcp-plan-meal rcp-wk-meal' + (it.locked ? ' locked' : '') },
      h('div', { class: 'rcp-wk-meal-head' },
        h('span', { class: 'rcp-plan-slot' }, MEAL_LABEL[it.slot]),
        it.prep && h('span', { class: 'rcp-wk-badge prep' }, `🍱 ${gDays.length} gün · bir kez pişir`),
        it.locked && h('span', { class: 'rcp-wk-badge lock' }, icon('lock', { size: 12 }), 'Kilitli')),
      h('div', { class: 'rcp-row click', onClick: () => { location.hash = '#/recipes/' + r.id; } },
        h('div', { class: 'rcp-row-tile', style: { background: tint(r.cat) } }, h('span', { 'aria-hidden': 'true' }, r.emoji)),
        h('div', { class: 'li-main' }, h('div', { class: 'rcp-row-name' }, r.name), sub),
        lockBtn, swapBtn),
      h('div', { class: 'rcp-wk-meal-foot' }, stepper, cookBtn),
      it.prep && gDays.length > 1 && gDays[0] === di
        ? h('p', { class: 'tiny muted rcp-wk-prepnote' }, `${gDays.map(dayShort).join(', ')} öğlenleri için toplam ${fmt.n(cookPortions, cookPortions % 1 ? 1 : 0)} porsiyon pişir; buzdolabında saklanır.`)
        : null);
  }

  const mealsEl = h('div', { class: 'rcp-plan-meals' });
  function paintMeals() {
    const d = plan.days[ui.day];
    mount(mealsEl, d.items.map(it => mealCard(ui.day, it)));
  }

  const diaryEl = h('div', { class: 'rcp-wk-diary' });
  function paintDiary() {
    const i = ui.day, k = dayKey(i), d = plan.days[i];
    const isToday = k === today;
    mount(diaryEl,
      h('button', { type: 'button', class: 'btn block ' + (d.diaryAt ? 'ghost' : 'primary'), onClick: () => addDayToDiary(i) },
        icon(d.diaryAt ? 'check' : 'plus'),
        d.diaryAt ? 'Günlüğe eklendi' : isToday ? 'Bugünü günlüğe ekle' : 'Bu günü günlüğe ekle'),
      h('p', { class: 'tiny muted rcp-wk-diary-note' }, d.diaryAt
        ? `${fmt.dateTime(d.diaryAt)} tarihinde eklendi. Tekrar eklemek için dokun.`
        : `4 öğün ${isToday ? 'bugünün' : fmt.date(k, 'short') + ' tarihli'} beslenme günlüğüne yazılır.`));
  }

  async function addDayToDiary(i) {
    const k = dayKey(i), d = plan.days[i];
    if (d.diaryAt && !(await confirmDialog('Bu günün öğünlerini daha önce günlüğe ekledin. Tekrar eklersen kayıtlar iki kez görünür.', { title: 'Tekrar eklensin mi?', okLabel: 'Yine de ekle' }))) return;
    d.items.forEach(it => addToDiary(getRecipe(it.id), it.portions, it.slot, k));
    d.diaryAt = Date.now();
    persist(); haptic([10, 40, 10]); paintDiary();
    toastAction(k === today ? '4 öğün bugünün günlüğüne eklendi' : `4 öğün ${fmt.date(k, 'short')} günlüğüne eklendi`, 'Günlüğü gör', goDiary);
  }

  const chromeEl = h('div');
  const chipsEl = h('div');
  function refreshChrome() {
    const issues = weekIssues(plan.days, i => dayLong(dayKey(i)));
    mount(chromeEl, overview(),
      issues.length ? h('div', { class: 'panel tight rcp-wk-issues' },
        h('div', { class: 'panel-title' }, icon('info'), 'Çeşitlilik notu'),
        h('ul', null, issues.slice(0, 4).map(x => h('li', null, x.text))),
        h('p', { class: 'tiny muted' }, 'Seçtiğin tercihlerle yeterince farklı tarif yok. Bir tercihi kaldırırsan çeşitlilik artar.')) : null);
    mount(chipsEl, dayChips());
  }

  function paintPlan() {
    const prefWrap = h('div', null, prefsBlock(plan.opts, plan.prep, (o, p) => regenerate(o, p, 'Plan tercihlerine göre yenilendi')));
    paintDaySummary(); paintMeals(); paintDiary(); refreshChrome();
    const lockedN = plan.days.reduce((a, d) => a + d.items.filter(i => i.locked).length, 0);
    mount(body,
      chromeEl,
      chipsEl,
      sumEl,
      mealsEl,
      diaryEl,
      h('div', { class: 'rcp-sec-head rcp-wk-sec' }, h('h2', null, 'Hafta'), h('span', { class: 'muted small' }, lockedN ? `${lockedN} kilitli öğün korunur` : 'Kilitlediğin öğünler korunur')),
      h('div', { class: 'rcp-wk-actions' },
        h('button', { type: 'button', class: 'btn primary block', onClick: openShopping }, icon('list'), 'Haftanın alışveriş listesi'),
        h('button', { type: 'button', class: 'btn block', onClick: () => regenerate() }, icon('refresh'), 'Yenile')),
      prefWrap,
      h('button', { type: 'button', class: 'rcp-linkbtn rcp-wk-del', onClick: async () => {
        if (!(await confirmDialog(`${rangeText(start)} haftasının planı silinsin mi? Günlüğe eklediklerin silinmez.`, { title: 'Planı sil', okLabel: 'Sil', danger: true }))) return;
        plan = null; persistWeek(start, null); paint();
        toast('Plan silindi', { type: 'success' });
      } }, icon('trash'), 'Bu haftanın planını sil'),
      h('p', { class: 'tiny dim rcp-disclaimer' }, 'Porsiyonlar günlük hedefine göre ayarlanır. Bir öğüne dokunarak tarifi görebilirsin.'));
  }

  // ---------- Öğün değiştirme ----------
  function openPicker(di, slot) {
    const day = plan.days[di];
    const cur = day.items.find(x => x.slot === slot);
    const k = SLOTS.indexOf(slot);
    const others = new Set(day.items.filter((_, i) => i !== k).map(x => x.id));
    // Bu öğün (ve toplu hazırlık grubu) hariç kullanım sayıları
    const counts = useCounts(plan.days, (it, d) => it.slot === slot && (cur.prep ? it.prep === cur.prep : d === di));
    const pool = pools(plan.opts)[slot].filter(r => r.id !== cur.id && !others.has(r.id) && (counts.get(r.id) || 0) < 2);
    const ranked = rankForSlot(day.items, slot, pool, target);
    let q = '';
    const listEl = h('div', { class: 'rcp-wk-picker', role: 'list' });
    const paintList = () => {
      const l = ranked.filter(x => matches(x.r, q)).slice(0, 40);
      if (!l.length) { mount(listEl, emptyState('search', 'Tarif bulunamadı', 'Başka bir kelime dene.')); return; }
      mount(listEl, l.map((x, idx) => {
        const fit = dayFit(x.t, target);
        const n = scaledNutrition(x.r, x.portions);
        const used = counts.get(x.r.id) || 0;
        return h('button', { type: 'button', role: 'listitem', class: 'rcp-wk-pick', onClick: () => { close(); apply(x); } },
          h('div', { class: 'rcp-row-tile', style: { background: tint(x.r.cat) } }, h('span', { 'aria-hidden': 'true' }, x.r.emoji)),
          h('span', { class: 'li-main' },
            h('span', { class: 'rcp-row-name' }, x.r.name),
            h('span', { class: 'li-sub' }, `${portionText(x.portions)} · ${fmt.n(n.kcal)} kcal · ${fmt.n(n.p)} g protein${used ? ' · bu hafta 1 kez var' : ''}`)),
          h('span', { class: 'rcp-wk-fit ' + (fit.ok ? 'ok' : 'warn') }, idx === 0 && fit.ok ? 'En uygun' : `${fmt.n(x.t.kcal)} kcal`));
      }));
    };
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Tarif ara', 'aria-label': 'Tarif ara', onInput: e => { q = e.target.value; paintList(); } });
    paintList();
    const close = modal({
      title: `${MEAL_LABEL[slot]} · ${dayLong(dayKey(di))}`,
      body: h('div', { class: 'rcp-sheet' },
        h('p', { class: 'muted small rcp-sheet-note' }, `Günün hedefe uyumuna göre sıralandı. Sağdaki değer, seçersen günün toplamı.${cur.prep ? ' Toplu hazırlık günlerinin hepsi değişir.' : ''}`),
        h('div', { class: 'search-box rcp-search rcp-wk-psearch' }, icon('search'), search),
        listEl),
      actions: [{ label: 'Vazgeç', class: 'ghost' }],
    });

    function apply(x) {
      const before = structuredClone(plan);
      forGroup(di, slot, (it, d) => {
        it.id = x.r.id;
        if (d === di) it.portions = x.portions;
        else {
          const best = rankForSlot(plan.days[d].items, slot, [x.r], target)[0];
          it.portions = best.portions;
        }
      });
      persist(); haptic(8); paint();
      toastAction(`${MEAL_LABEL[slot]}: ${x.r.name}`, 'Geri al', () => { plan = before; persist(); paint(); }, 'success');
    }
  }

  // ---------- Haftanın alışveriş listesi ----------
  function openShopping() {
    const pastN = start === thisStart ? Math.max(0, daysBetween(start, today)) : 0;
    const st = { skipStaples: true, fromToday: pastN > 0 };
    const off = new Set();
    const stripEl = h('div', { class: 'info-strip rcp-sheet-strip' });
    const noteEl = h('p', { class: 'muted small rcp-sheet-note' });
    const listEl = h('div', { class: 'rcp-pick-list rcp-wk-shoplist' });
    const count = h('span');
    let items = [];

    const paintS = () => {
      const days = st.fromToday ? plan.days.slice(pastN) : plan.days;
      items = mergeIngredients(days, { skipStaples: st.skipStaples });
      const existing = new Set(getShopping().map(x => norm(x.name) + '|' + (x.unit || '')));
      const inList = items.filter(x => existing.has(x.key)).length;
      const groups = AISLES.map(a => ({ a, list: items.filter(it => aisleOf(it.name).id === a.id) })).filter(g => g.list.length);
      const recipesN = new Set(days.flatMap(d => d.items.map(i => i.id))).size;
      mount(stripEl,
        h('div', null, h('div', { class: 'is-label' }, 'Malzeme'), h('div', { class: 'is-value' }, items.length)),
        h('div', null, h('div', { class: 'is-label' }, 'Tarif'), h('div', { class: 'is-value' }, recipesN)),
        h('div', null, h('div', { class: 'is-label' }, 'Reyon'), h('div', { class: 'is-value' }, groups.length)),
        h('div', null, h('div', { class: 'is-label' }, 'Gün'), h('div', { class: 'is-value' }, days.length)));
      noteEl.textContent = (inList ? `${inList} malzeme listende zaten var; miktarlar toplanır. ` : '') + 'Evde olanların işaretini kaldır.';
      mount(listEl, groups.map(g => h('section', { class: 'rcp-wk-shopgrp' },
        h('div', { class: 'rcp-aisle-head' }, h('span', { 'aria-hidden': 'true' }, g.a.emoji), g.a.label, h('span', { class: 'muted' }, g.list.length)),
        g.list.map(it => {
          const on = !off.has(it.key);
          const box = h('span', { class: 'rcp-check' + (on ? ' on' : '') }, icon('check'));
          const row = h('button', { type: 'button', class: 'rcp-pick' + (on ? '' : ' off'), 'aria-pressed': String(on), onClick: () => {
            off.has(it.key) ? off.delete(it.key) : off.add(it.key);
            const now = !off.has(it.key);
            box.classList.toggle('on', now); row.classList.toggle('off', !now); row.setAttribute('aria-pressed', String(now)); paintCount();
          } }, box, h('span', { class: 'rcp-pick-txt' }, h('b', null, qtyText(it.qty, it.unit)), ' ', it.name,
            h('small', { class: 'rcp-wk-from' }, [...it.recipes].slice(0, 2).join(', ') + (it.recipes.size > 2 ? ` +${it.recipes.size - 2}` : ''))));
          return row;
        }))));
      paintCount();
    };
    const paintCount = () => { count.textContent = String(items.filter(x => !off.has(x.key)).length); };

    const optRow = (label, sub, val, onChange) => { const r = toggleRow(label, sub, val, onChange); r.classList.add('rcp-wk-opt'); return r; };

    paintS();
    modal({
      title: 'Haftanın alışveriş listesi',
      body: h('div', { class: 'rcp-sheet' },
        stripEl,
        h('div', { class: 'rcp-wk-opts' },
          optRow('Tuz, su ve baharatları çıkar', 'Evde genelde bulunanlar', st.skipStaples, v => { st.skipStaples = v; paintS(); }),
          pastN > 0 && optRow('Yalnız bugün ve sonrası', `Geçen ${pastN} gün dahil edilmez`, st.fromToday, v => { st.fromToday = v; paintS(); })),
        noteEl,
        listEl),
      actions: [
        { label: 'Vazgeç', class: 'ghost' },
        { label: h('span', null, 'Listeye ekle (', count, ')'), class: 'primary', onClick: close => {
          const pickItems = items.filter(x => !off.has(x.key));
          if (!pickItems.length) { toast('En az bir malzeme seç', { type: 'error' }); return false; }
          const go = () => {
            const res = addToShopping(pickItems.map(x => ({ name: x.name, qty: x.qty, unit: x.unit, recipe: `Haftalık plan (${rangeText(start)})` })));
            plan.shopAt = Date.now(); persist(); haptic([10, 40, 10]); close();
            toastAction(`${res.added} yeni malzeme eklendi${res.merged ? `, ${res.merged} tanesi birleşti` : ''}`, 'Listeyi aç', () => { location.hash = '#/recipes/shopping'; });
          };
          if (plan.shopAt) {
            confirmDialog('Bu haftanın malzemelerini daha önce listeye ekledin. Tekrar eklersen miktarlar artar.', { title: 'Tekrar eklensin mi?', okLabel: 'Yine de ekle' }).then(ok => { if (ok) go(); });
            return false;
          }
          go();
          return false;
        } },
      ],
    });
  }

  function paint() {
    rangeEl.textContent = rangeText(start) + (plan ? ` · günde ${fmt.n(target.kcal)} kcal, ${fmt.n(target.protein)} g protein` : '');
    if (!plan) paintSetup(); else paintPlan();
  }

  el.append(
    backBtn,
    h('h1', { class: 'hud-title' }, 'Haftalık yemek planı'),
    rangeEl,
    weekTabs,
    body);
  openWeek(ui.week);
}

// Test ve diğer modüller için
export const _internal = { mergeIngredients, isStaple, validWeek, KEY, mainProtein, PROTEIN_LABEL };
