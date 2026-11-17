// Beslenme modülü: günlük kalori/makro takibi, su, haftalık özet, kendi besinlerin ve tariflerin.
import { h, icon, mount, fmt, ring, toast, haptic, sectionTitle, emptyState, clamp } from '../../core/ui.js';
import { subscribe, todayKey, addDays } from '../../core/store.js';
import { getModule, go } from '../../core/router.js';
import { macroTargets } from '../../core/profile.js';
import * as D from './diary.js';
import { openSearch, openFoodSheet, openEntry, openQuickAdd, openCustomEditor, openRecipeEditor, emoCircle, foodEmoji, macroLine, unitOf } from './sheets.js';
import { dbCount, dbLoaded, CATS } from './db.js';

let viewDk = null;
let libTab = 'favs';

/** O gün diğer modüllerde yakılan aktif kalori */
function burnedOn(dk) {
  let sum = 0;
  for (const id of ['steps', 'run', 'workout']) {
    try { const v = +getModule(id)?.burned?.(dk); if (Number.isFinite(v) && v > 0) sum += v; } catch { /* modül yok */ }
  }
  return Math.round(sum);
}

function dayLabel(dk) {
  const t = todayKey();
  if (dk === t) return 'Bugün';
  if (dk === addDays(t, -1)) return 'Dün';
  if (dk === addDays(t, 1)) return 'Yarın';
  return fmt.date(dk, 'weekday');
}

const g0 = v => fmt.n(v, 0);

function scanFlow(dk, meal) {
  const add = (food, grams, m) => {
    D.addEntry(dk, food, grams, m);
    haptic(); toast(`${food.name} eklendi · ${fmt.n(D.calc(food, grams).kcal)} kcal`, { type: 'success' });
  };
  const show = f => openFoodSheet(f, { dk, meal, onConfirm: add });
  import('./scanner.js').then(m => m.openScanner({ onFood: show, onMissing: code => openCustomEditor({ code, onSaved: show }) }));
}

export default {
  id: 'nutrition',
  title: 'Beslenme',
  navLabel: 'Beslenme',
  icon: 'food',
  css: true,

  render(el, params = []) {
    const today = todayKey();
    viewDk = today;
    const root = h('div', { class: 'nut' });
    el.appendChild(root);
    let first = true, raf = 0;

    const paint = () => {
      const dk = viewDk;
      const day = D.getDay(dk);
      const tot = D.totals(day.entries);
      const tgt = macroTargets();
      const target = D.calorieTarget();
      const burned = burnedOn(dk);
      const left = target - tot.kcal;
      if (!first) root.classList.add('nut-still');

      // --- Tarih çubuğu ---
      const dateBar = h('div', { class: 'nut-datebar' },
        h('button', { class: 'nut-dbtn', type: 'button', 'aria-label': 'Önceki gün', onClick: () => { viewDk = addDays(viewDk, -1); paint(); } }, icon('left')),
        h('button', { class: 'nut-dlabel', type: 'button', 'aria-label': 'Bugüne dön', onClick: () => { viewDk = todayKey(); paint(); } },
          h('b', null, dayLabel(dk)), h('span', null, fmt.date(dk, 'long'))),
        h('button', { class: 'nut-dbtn', type: 'button', 'aria-label': 'Sonraki gün', onClick: () => { viewDk = addDays(viewDk, 1); paint(); } }, icon('right')));

      // --- Günün özeti (hero) ---
      const over = left < 0;
      const pct = target ? Math.round(tot.kcal / target * 100) : 0;
      const macroRow = (label, val, goal, col) => h('div', { class: 'nut-macro' },
        h('div', { class: 'nut-macro-top' }, h('span', null, label), h('span', { class: 'mono' }, h('b', null, g0(val)), ` / ${g0(goal)} g`)),
        h('div', { class: 'nut-bar' }, h('i', { style: { width: clamp(goal ? val / goal : 0, 0, 1) * 100 + '%', background: col } })));
      const hero = h('section', { class: 'panel hero nut-hero', 'aria-label': 'Günün özeti' },
        h('div', { class: 'nut-hero-top' },
          h('div', { class: 'grow' },
            h('div', { class: 'nut-hero-label' }, over ? 'Hedefin üzerindesin' : 'Kalan kalori'),
            h('div', { class: 'nut-hero-num' + (over ? ' over' : '') }, g0(Math.abs(left)), h('small', null, 'kcal')),
            h('div', { class: 'nut-hero-sub' }, `Günlük hedef ${g0(target)} kcal`)),
          ring({ value: tot.kcal, max: target, size: 104, stroke: 10, color: over ? 'var(--red)' : 'var(--accent)', track: 'rgba(255,255,255,.08)',
            center: h('div', { class: 'nut-ring-c' }, h('b', null, `%${pct}`), h('span', null, 'yenildi')) })),
        h('div', { class: 'info-strip nut-strip' },
          h('div', null, h('div', { class: 'is-label' }, icon('food'), 'Yenilen'), h('div', { class: 'is-value' }, g0(tot.kcal))),
          h('div', null, h('div', { class: 'is-label' }, icon('flame'), 'Yakılan'), h('div', { class: 'is-value' }, g0(burned))),
          h('div', { title: 'Yenilen eksi hareketle yakılan' }, h('div', { class: 'is-label' }, icon('scale'), 'Net'), h('div', { class: 'is-value' }, g0(tot.kcal - burned)))),
        h('div', { class: 'nut-macros' },
          macroRow('Protein', tot.p, tgt.protein, 'var(--blue)'),
          macroRow('Karbonhidrat', tot.c, tgt.carbs, 'var(--amber)'),
          macroRow('Yağ', tot.f, tgt.fat, 'var(--magenta)')));

      // --- Ana eylem ---
      const actions = h('div', { class: 'nut-actions' },
        h('button', { class: 'btn primary lg block', type: 'button', onClick: () => openSearch({ dk, meal: D.defaultMeal() }) }, icon('plus'), 'Yemek ekle'),
        h('div', { class: 'grid-2' },
          h('button', { class: 'btn ghost', type: 'button', onClick: () => scanFlow(dk, D.defaultMeal()) }, icon('barcode'), 'Barkod okut'),
          h('button', { class: 'btn ghost', type: 'button', onClick: () => openQuickAdd({ dk }) }, icon('bolt'), 'Hızlı kalori')));

      // --- Fit tarifler kartı ---
      const fit = h('a', { class: 'nut-fit', href: '#/recipes' },
        h('div', { class: 'grow' }, h('b', null, 'Fit tarifler'), h('span', null, 'Sporcular için sağlıklı tarifler. Tek dokunuşla günlüğe ekle.'),
          h('span', { class: 'nut-fit-cta' }, 'Tariflere göz at', icon('right'))),
        h('div', { class: 'nut-fit-emo', 'aria-hidden': 'true' }, '🥗'));

      // --- Öğünler ---
      const yest = D.getDay(addDays(dk, -1));
      const mealCard = m => {
        const items = day.entries.filter(e => e.meal === m.id).sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const t = D.totals(items);
        const yCount = yest.entries.filter(e => e.meal === m.id).length;
        return h('section', { class: 'panel nut-meal', 'aria-label': m.l },
          h('div', { class: 'nut-meal-head' },
            emoCircle(m.e, m.h, 44),
            h('div', { class: 'grow' }, h('h3', null, m.l), h('div', { class: 'nut-meal-sub' }, items.length ? macroLine(t) : 'Henüz bir şey eklenmedi')),
            h('div', { class: 'nut-meal-kcal' }, h('b', null, g0(t.kcal)), h('span', null, 'kcal'))),
          items.length ? h('div', { class: 'list nut-entries' }, items.map(e => h('button', { class: 'list-item click', type: 'button', onClick: () => openEntry(dk, e), 'aria-label': `${e.name}, ${g0(e.kcal)} kcal. Düzenle` },
            h('div', { class: 'li-main' },
              h('div', { class: 'li-title' }, e.name),
              h('div', { class: 'li-sub' }, [e.quick || !(e.grams > 0) ? 'Hızlı kayıt' : `${fmt.n(e.grams, e.grams % 1 ? 1 : 0)} ${e.unit === 'ml' ? 'ml' : 'g'}`, e.brand].filter(Boolean).join(' · '))),
            h('div', { class: 'li-end' }, g0(e.kcal), h('span', { class: 'nut-unit' }, ' kcal'))))) : null,
          h('div', { class: 'nut-meal-foot' },
            h('button', { class: 'btn sm nut-add', type: 'button', onClick: () => openSearch({ dk, meal: m.id }), 'aria-label': `${m.l} için yemek ekle` }, icon('plus'), 'Ekle'),
            yCount ? h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': `Dünkü ${m.l.toLocaleLowerCase('tr')} kayıtlarını kopyala`, onClick: () => {
              const n = D.copyMeal(addDays(dk, -1), dk, m.id);
              toast(`${n} kayıt dünden kopyalandı`, { type: 'success' });
            } }, icon('repeat'), 'Dünden kopyala') : null));
      };

      // --- Su ---
      const wT = D.waterTarget();
      const glasses = Math.max(4, Math.ceil(wT / 250));
      const filled = Math.floor(day.waterMl / 250);
      const water = h('section', { class: 'panel nut-water', 'aria-label': 'Su' },
        h('div', { class: 'nut-meal-head' },
          emoCircle('💧', 'var(--blue)', 44),
          h('div', { class: 'grow' }, h('h3', null, 'Su'), h('div', { class: 'nut-meal-sub' }, day.waterMl >= wT ? 'Bugünkü su hedefine ulaştın' : `${g0(Math.max(0, wT - day.waterMl))} ml kaldı`)),
          h('div', { class: 'nut-meal-kcal' }, h('b', null, fmt.n(day.waterMl / 1000, 2)), h('span', null, `/ ${fmt.n(wT / 1000, 1)} L`))),
        h('div', { class: 'nut-glasses', role: 'group', 'aria-label': 'Bardaklar' }, Array.from({ length: glasses }, (_, i) => h('button', {
          class: 'nut-glass' + (i < filled ? ' on' : ''), type: 'button', 'aria-label': `${i + 1}. bardak${i < filled ? ' (içildi)' : ''}`,
          onClick: () => { const ml = i + 1 === filled ? i * 250 : (i + 1) * 250; D.setWater(dk, ml); haptic(); },
        }, h('i')))),
        h('div', { class: 'grid-2', style: 'margin-top:12px' },
          h('button', { class: 'btn ghost', type: 'button', 'aria-label': '250 ml su çıkar', disabled: day.waterMl <= 0, onClick: () => D.setWater(dk, day.waterMl - 250) }, icon('minus'), '250 ml'),
          h('button', { class: 'btn', type: 'button', 'aria-label': '250 ml su ekle', onClick: () => { D.setWater(dk, day.waterMl + 250); haptic(); } }, icon('plus'), '250 ml')));

      // --- Haftalık ---
      const wk = D.week(dk);
      const mx = Math.max(target * 1.25, ...wk.map(d => d.kcal));
      const logged = wk.filter(d => d.count > 0);
      const avg = k => logged.length ? logged.reduce((s, d) => s + d[k], 0) / logged.length : 0;
      const weekEl = h('section', { class: 'panel nut-week', 'aria-label': 'Haftalık özet' },
        h('div', { class: 'row between', style: 'margin-bottom:6px' }, h('h3', { class: 'nut-h3' }, 'Son 7 gün'), h('span', { class: 'small muted' }, h('i', { class: 'nut-dash' }), ` Hedef ${g0(target)}`)),
        h('div', { class: 'nut-chart' },
          h('div', { class: 'nut-target', style: { bottom: `calc(${target / mx * 100}% )` } }),
          wk.map(d => h('button', { class: 'nut-col' + (d.dk === dk ? ' sel' : '') + (d.kcal > target ? ' over' : ''), type: 'button', 'aria-label': `${fmt.date(d.dk, 'long')}: ${g0(d.kcal)} kcal`, onClick: () => { viewDk = d.dk; paint(); } },
            h('span', { class: 'nut-col-v' }, d.kcal ? g0(d.kcal) : ''),
            h('i', { style: { height: (d.kcal / mx * 100) + '%' } }),
            h('span', { class: 'nut-col-l' }, fmt.date(d.dk, 'weekday'))))),
        h('div', { class: 'info-strip nut-strip', style: 'margin-top:12px' },
          h('div', null, h('div', { class: 'is-label' }, 'Ort. kalori'), h('div', { class: 'is-value' }, g0(avg('kcal')))),
          h('div', null, h('div', { class: 'is-label' }, 'Protein'), h('div', { class: 'is-value' }, g0(avg('p')), h('small', null, ' g'))),
          h('div', null, h('div', { class: 'is-label' }, 'Karb.'), h('div', { class: 'is-value' }, g0(avg('c')), h('small', null, ' g'))),
          h('div', null, h('div', { class: 'is-label' }, 'Yağ'), h('div', { class: 'is-value' }, g0(avg('f')), h('small', null, ' g')))),
        h('p', { class: 'small muted', style: 'margin:8px 2px 0' }, logged.length ? `Ortalamalar kayıt girilen ${logged.length} güne göre.` : 'Bu hafta henüz kayıt yok.'));

      // --- Kütüphanem ---
      const lib = h('section', { class: 'nut-lib' });
      const paintLib = () => {
        const addTo = (food, grams, m) => { D.addEntry(viewDk, food, grams, m); haptic(); toast(`${food.name} eklendi`, { type: 'success' }); };
        const openF = f => openFoodSheet(f, { dk: viewDk, meal: D.defaultMeal(), onConfirm: addTo });
        const itemRow = (f, onClick, end, sub) => h('div', { class: 'list-item nut-lrow' },
          h('button', { class: 'nut-lmain', type: 'button', onClick },
            emoCircle(f.cat === 'tarif' ? '📖' : foodEmoji(f), CATS[f.cat]?.h, 40),
            h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, f.name), h('div', { class: 'li-sub' }, sub || [f.brand, `100 ${unitOf(f)} = ${g0(f.kcal)} kcal`].filter(Boolean).join(' · '))),
            end ? null : h('span', { class: 'nut-chev' }, icon('right'))),
          end);
        const tabsDef = [['favs', 'Favoriler'], ['recent', 'Son yenenler'], ['mine', 'Besinlerim'], ['recipes', 'Tariflerim']];
        let content;
        if (libTab === 'favs') {
          const favs = Object.values(D.getFavs()).sort((a, b) => (b.favTs || 0) - (a.favTs || 0));
          content = favs.length ? h('div', { class: 'list' }, favs.slice(0, 20).map(f => itemRow(f, () => openF(f))))
            : emptyState('star', 'Favorin yok', 'Sık yediğin bir şeyi açıp yıldıza dokun, burada hızlıca bulursun.', h('button', { class: 'btn primary sm', type: 'button', onClick: () => openSearch({ dk: viewDk }) }, icon('search'), 'Yemek ara'));
        } else if (libTab === 'recent') {
          const rec = D.getRecent();
          content = rec.length ? h('div', { class: 'list' }, rec.slice(0, 15).map(f => itemRow(f, () => openF(f))))
            : emptyState('clock', 'Henüz kayıt yok', 'Eklediğin yemekler burada listelenir, tekrar eklemek kolaylaşır.', h('button', { class: 'btn primary sm', type: 'button', onClick: () => openSearch({ dk: viewDk }) }, icon('plus'), 'Yemek ekle'));
        } else if (libTab === 'mine') {
          const mine = D.getCustom();
          content = h('div', null,
            mine.length ? h('div', { class: 'list' }, mine.map(f => itemRow({ ...f, cat: 'ozel', src: 'custom' }, () => openF({ ...f, cat: 'ozel', src: 'custom' }),
              h('button', { type: 'button', class: 'btn icon ghost', 'aria-label': `${f.name} besinini düzenle`, onClick: () => openCustomEditor({ food: f }) }, icon('edit')))))
              : emptyState('edit', 'Kendi besinin yok', 'Listede olmayan bir ürünü paketteki etiketten ekleyebilirsin.'),
            h('button', { class: 'btn ghost block', type: 'button', onClick: () => openCustomEditor({}) }, icon('plus'), 'Yeni besin oluştur'));
        } else {
          const recs = D.getRecipes();
          content = h('div', null,
            recs.length ? h('div', { class: 'list' }, recs.map(r => {
              const f = D.recipeToFood(r);
              const per = f.portions[0] ? D.calc(f, f.portions[0].g).kcal : 0;
              return itemRow(f, () => openF(f),
                h('button', { type: 'button', class: 'btn icon ghost', 'aria-label': `${r.name} tarifini düzenle`, onClick: () => openRecipeEditor(r) }, icon('edit')),
                `${r.servings} porsiyon · porsiyonu ${g0(per)} kcal`);
            })) : emptyState('list', 'Kendi tarifin yok', 'Evde yaptığın yemeğin malzemelerini gir, porsiyon başına kaloriyi biz hesaplayalım.'),
            h('button', { class: 'btn ghost block', type: 'button', onClick: () => openRecipeEditor() }, icon('plus'), 'Yeni tarif oluştur'));
        }
        mount(lib,
          h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Kütüphanem' }, tabsDef.map(([id, l]) => h('button', { class: 'chip' + (libTab === id ? ' active' : ''), type: 'button', role: 'tab', 'aria-selected': String(libTab === id), onClick: () => { libTab = id; paintLib(); } }, l))),
          h('div', { class: 'panel tight' }, content));
      };
      paintLib();

      mount(root,
        h('div', { class: 'nut-head' }, h('h1', { class: 'hud-title' }, 'Beslenme'), dateBar),
        hero, actions, fit,
        sectionTitle('Öğünler'),
        D.MEALS.map(mealCard),
        sectionTitle('Su'), water,
        sectionTitle('Haftalık özet'), weekEl,
        sectionTitle('Kütüphanem'), lib,
        h('p', { class: 'nut-foot-note' }, dbLoaded()
          ? `Uygulamada ${fmt.n(dbCount())} yiyecek ve içecek var. Bulamadıklarını internetten (Open Food Facts) arıyoruz.`
          : 'Uygulamada 1.000’den fazla yiyecek ve içecek var. Bulamadıklarını internetten (Open Food Facts) arıyoruz.'));

      if (first) first = false;
      else requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('nut-still'))));
    };

    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); };
    const unsubs = [D.KEYS.diary, D.KEYS.favs, D.KEYS.recent, D.KEYS.custom, D.KEYS.recipes, 'profile'].map(k => subscribe(k, schedule));
    paint();

    // Doğrudan bağlantılar: #/nutrition/add, #/nutrition/scan, #/nutrition/water
    if (params[0] === 'add') setTimeout(() => openSearch({ dk: viewDk, meal: D.MEALS.some(m => m.id === params[1]) ? params[1] : D.defaultMeal() }), 60);
    if (params[0] === 'scan') setTimeout(() => scanFlow(viewDk, D.defaultMeal()), 60);
    if (params[0] === 'quick') setTimeout(() => openQuickAdd({ dk: viewDk }), 60);

    return () => { unsubs.forEach(u => u()); cancelAnimationFrame(raf); };
  },

  summary(dateKey) {
    const t = D.dayTotals(dateKey);
    const target = D.calorieTarget();
    return {
      label: 'Beslenme', value: fmt.n(t.kcal), unit: 'kcal', sub: `hedef ${fmt.n(target)}`,
      progress: target ? clamp(t.kcal / target, 0, 1) : null, color: 'var(--amber)', icon: 'food',
    };
  },

  intake(dateKey) {
    const t = D.dayTotals(dateKey);
    return { kcal: t.kcal, protein: t.p, carbs: t.c, fat: t.f, waterMl: t.waterMl };
  },
};
