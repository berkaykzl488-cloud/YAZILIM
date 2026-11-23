// Alt sayfalar: yemek arama, porsiyon seçimi, hızlı kalori, kendi besinin, kendi tarifin.
import { h, icon, mount, modal, toast, fmt, uid, haptic, confirmDialog, emptyState } from '../../core/ui.js';
import { todayKey } from '../../core/store.js';
import { go } from '../../core/router.js';
import { loadDB, searchLocal, searchOnline, lookupBarcode, findFood, isBarcode, CATS, dbCount } from './db.js';
import * as D from './diary.js';

// ---------- Ortak yardımcılar ----------
const EMO = {
  tahil: '🍞', baklagil: '🥣', et: '🍗', balik: '🐟', sut: '🧀', kuruyemis: '🥜', sos: '🧂', meyve: '🍎', sebze: '🥦',
  corba: '🍜', yemek: '🍲', meze: '🥗', pilav: '🍝', hamur: '🥟', kebap: '🍢', kahvalti: '🍳', sokak: '🌯', tatli: '🍰',
  fastfood: '🍔', icecek: '🥤', alkol: '🍷', takviye: '💪', market: '🛒', ozel: '✏️', tarif: '📖', online: '🌐',
};
export function foodEmoji(f) {
  const n = (f.name || '').toLocaleLowerCase('tr');
  if (/kahve|latte|espresso|cappuccino|americano|mocha|macchiato|nescaf/.test(n)) return '☕';
  if (/çay|tea/.test(n) && f.unit === 'ml') return '🍵';
  if (/süt|ayran|kefir/.test(n) && f.unit === 'ml') return '🥛';
  if (/su$|maden suyu|^su /.test(n)) return '💧';
  if (/bira/.test(n)) return '🍺';
  if (/yumurta|omlet|menemen/.test(n)) return '🍳';
  if (/pizza/.test(n)) return '🍕';
  if (/çikolata|gofret|bar\b/.test(n) && f.cat === 'market') return '🍫';
  if (/cips/.test(f.keys || '')) return '🥔';
  if (String(f.foodId || '').startsWith('recipe:')) return '🥗';
  return EMO[f.cat] || '🍽️';
}
export const emoCircle = (e, hue = 'var(--accent)', size = 42) =>
  h('span', { class: 'nut-emo', style: { '--hue': hue, width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.48) + 'px' }, 'aria-hidden': 'true' }, e);

const g1 = v => fmt.n(v, v > 0 && v < 10 ? 1 : 0);
export const unitOf = f => (f.unit === 'ml' ? 'ml' : 'g');
export const macroLine = x => `P ${g1(x.p)} g · K ${g1(x.c)} g · Y ${g1(x.f)} g`;
const parseNum = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };

/** Çekirdek modal üstüne sınıf ekleyen alt sayfa */
export function sheet(title, body, { cls = '', onClose } = {}) {
  const close = modal({ title, body, onClose });
  const m = body.closest('.modal');
  if (m) m.classList.add('nut-sheet', ...cls.split(' ').filter(Boolean));
  return close;
}

function numField(label, value, { unit = '', step = 'any', ph = '', id } = {}) {
  const inp = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: value ?? '', placeholder: ph, id, autocomplete: 'off', enterkeyhint: 'next' });
  return { el: h('label', { class: 'field' }, h('span', null, label + (unit ? ` (${unit})` : '')), inp), inp };
}

// ---------- Arama ----------
/**
 * openSearch({ dk, meal, pick }) — pick(food, grams) verilirse tarif malzemesi seçme modunda çalışır.
 */
export function openSearch({ dk = todayKey(), meal = D.defaultMeal(), pick = null, query = '' } = {}) {
  let curMeal = meal, tab = 'recent', q = query, ctl = null, onlineTimer = null, debounce = null;
  let online = { state: 'idle', items: [], err: '' };

  const input = h('input', { class: 'input', type: 'search', placeholder: 'Yemek veya ürün ara', 'aria-label': 'Yemek ara', value: q, autocomplete: 'off', enterkeyhint: 'search' });
  const clearBtn = h('button', { class: 'nut-clear', type: 'button', 'aria-label': 'Aramayı temizle', onClick: () => { input.value = ''; onInput(); input.focus(); } }, icon('x'));
  const scanBtn = h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Barkod okut', title: 'Barkod okut', onClick: () => {
    import('./scanner.js').then(m => m.openScanner({ onFood: f => openItem(f), onMissing: code => openCustomEditor({ code, onSaved: f => openItem(f) }) }));
  } }, icon('barcode'));
  const mealRow = h('div', { class: 'chips nut-meal-chips', role: 'radiogroup', 'aria-label': 'Öğün' });
  const results = h('div', { class: 'nut-results' });
  const body = h('div', { class: 'nut-search' },
    h('div', { class: 'nut-search-top' },
      pick ? null : mealRow,
      h('div', { class: 'row', style: 'gap:8px' }, h('div', { class: 'search-box grow' }, icon('search'), input, clearBtn), scanBtn)),
    results);

  function paintMeals() {
    mount(mealRow, D.MEALS.map(m => h('button', { class: 'chip' + (m.id === curMeal ? ' active' : ''), type: 'button', role: 'radio', 'aria-checked': String(m.id === curMeal),
      onClick: () => { curMeal = m.id; paintMeals(); } }, m.e + ' ' + m.l)));
  }

  const onPicked = (food, grams, mealSel) => {
    if (pick) { pick(food, grams); close(); return; }
    D.addEntry(dk, food, grams, mealSel || curMeal);
    haptic();
    toast(`${food.name} eklendi · ${fmt.n(D.calc(food, grams).kcal)} kcal`, { type: 'success' });
    close();
  };
  const openItem = food => openFoodSheet(food, { meal: curMeal, pick: !!pick, onConfirm: onPicked });

  function row(food) {
    const portion = food.portions?.[0];
    const sub = [food.brand, portion ? `${portion.l} = ${fmt.n(D.calc(food, portion.g).kcal)} kcal` : null].filter(Boolean).join(' · ');
    const badges = [];
    if (food.src === 'off') badges.push(h('span', { class: 'badge' }, 'Online'));
    if (food.src === 'custom') badges.push(h('span', { class: 'badge lime' }, 'Benim'));
    if (food.src === 'recipe') badges.push(h('span', { class: 'badge lime' }, 'Tarifim'));
    if (food.approx) badges.push(h('span', { class: 'badge muted', title: 'Yaklaşık değer' }, '≈'));
    const pic = food.img ? h('img', { class: 'nut-img', src: food.img, alt: '', loading: 'lazy', onError: e => e.target.replaceWith(emoCircle(foodEmoji(food), CATS[food.cat]?.h)) }) : emoCircle(foodEmoji(food), CATS[food.cat]?.h);
    return h('button', { class: 'list-item click nut-row', type: 'button', onClick: () => openItem(food) },
      pic,
      h('div', { class: 'li-main' },
        h('div', { class: 'li-title' }, food.name, ' ', badges),
        h('div', { class: 'li-sub' }, sub || CATS[food.cat]?.l || '')),
      h('div', { class: 'li-end' }, h('div', null, fmt.n(food.kcal)), h('div', { class: 'nut-per' }, `kcal/100 ${unitOf(food)}`)));
  }

  function shortcuts() {
    if (pick) return null;
    return h('div', { class: 'nut-shortcuts' },
      h('button', { class: 'nut-short', type: 'button', onClick: () => { close(); openQuickAdd({ dk, meal: curMeal }); } }, emoCircle('⚡', 'var(--amber)', 36), h('span', null, 'Hızlı kalori ekle')),
      h('button', { class: 'nut-short', type: 'button', onClick: () => { close(); go('recipes'); } }, emoCircle('🥗', 'var(--lime)', 36), h('span', null, 'Fit tariflerden ekle')),
      h('button', { class: 'nut-short', type: 'button', onClick: () => openCustomEditor({ name: q, onSaved: f => openItem(f) }) }, emoCircle('✏️', 'var(--violet)', 36), h('span', null, 'Yeni besin oluştur')));
  }

  function paintEmpty() {
    const lists = {
      recent: D.getRecent(),
      favs: Object.values(D.getFavs()).sort((a, b) => (b.favTs || 0) - (a.favTs || 0)),
      mine: [...D.getCustom().map(x => ({ ...x, cat: 'ozel', src: 'custom' })), ...D.getRecipes().map(D.recipeToFood)],
    };
    const tabsEl = h('div', { class: 'chips', role: 'tablist' }, [['recent', 'Son yediklerim'], ['favs', 'Favorilerim'], ['mine', 'Besinlerim']].map(([id, l]) =>
      h('button', { class: 'chip' + (tab === id ? ' active' : ''), type: 'button', role: 'tab', 'aria-selected': String(tab === id), onClick: () => { tab = id; paintEmpty(); } }, l)));
    const items = lists[tab];
    const msg = { recent: ['Henüz bir şey eklemedin', 'Yukarıya yemeğin adını yaz, ör. “mercimek çorbası” veya “simit”.'],
      favs: ['Favorin yok', 'Bir besini açıp yıldıza dokunarak favorilere ekleyebilirsin.'],
      mine: ['Kendi besinin yok', 'Listede olmayan bir yemeği veya ürünü kendin ekleyebilirsin.'] }[tab];
    mount(results, shortcuts(), tabsEl,
      items.length ? h('div', { class: 'list' }, items.slice(0, 30).map(row))
        : emptyState('search', msg[0], msg[1], tab === 'mine' ? h('button', { class: 'btn primary sm', type: 'button', onClick: () => openCustomEditor({ onSaved: f => openItem(f) }) }, icon('plus'), 'Besin oluştur') : null));
  }

  function paintResults(local) {
    const onlineBlock = h('div', { class: 'nut-online' });
    const st = online.state;
    const head = h('div', { class: 'nut-sub-head' }, h('span', null, 'İnternetteki ürünler'), h('span', { class: 'tiny muted' }, 'Open Food Facts'));
    if (st === 'loading') mount(onlineBlock, head, h('div', { class: 'nut-status' }, h('span', { class: 'nut-spin', 'aria-hidden': 'true' }), 'İnternette aranıyor…'));
    else if (st === 'error') mount(onlineBlock, head, h('div', { class: 'nut-status' }, icon('globe'), online.err));
    else if (st === 'done') mount(onlineBlock, head, online.items.length ? h('div', { class: 'list' }, online.items.map(row)) : h('div', { class: 'nut-status' }, 'İnternette de bulunamadı.'));
    else if (st === 'short') mount(onlineBlock, h('div', { class: 'nut-status small' }, 'İnternette aramak için en az 3 harf yaz.'));
    const none = !local.length && st === 'done' && !online.items.length;
    mount(results,
      local.length ? h('div', { class: 'list' }, local.map(row)) : (st === 'loading' ? null : h('p', { class: 'muted small', style: 'margin:6px 2px' }, 'Uygulamadaki listede bulunamadı.')),
      onlineBlock,
      none || local.length < 6 ? h('div', { class: 'nut-notfound' },
        h('p', { class: 'small muted', style: 'margin:0 0 10px' }, 'Aradığını bulamadın mı? Paketteki etiketten kendin ekleyebilirsin.'),
        h('button', { class: 'btn ghost sm', type: 'button', onClick: () => openCustomEditor({ name: q, onSaved: f => openItem(f) }) }, icon('plus'), 'Kendi besinini oluştur')) : null);
  }

  async function run() {
    q = input.value.trim();
    clearBtn.classList.toggle('hide', !q);
    ctl?.abort(); clearTimeout(onlineTimer);
    if (!q) { online = { state: 'idle', items: [], err: '' }; paintEmpty(); return; }
    if (isBarcode(q)) {
      mount(results, h('div', { class: 'nut-status' }, h('span', { class: 'nut-spin' }), 'Barkod aranıyor…'));
      try {
        const f = await lookupBarcode(q);
        if (input.value.trim() !== q) return;
        if (f) { mount(results, h('div', { class: 'list' }, row(f))); }
        else mount(results, emptyState('barcode', 'Bu barkodla ürün bulunamadı', 'Paketteki bilgilerden ürünü kendin ekleyebilirsin.',
          h('button', { class: 'btn primary sm', type: 'button', onClick: () => openCustomEditor({ code: q, onSaved: x => openItem(x) }) }, icon('plus'), 'Ürünü ekle')));
      } catch (e) { mount(results, emptyState('globe', 'Ürün aranamadı', e.message + '. Ürünü kendin ekleyebilirsin.', h('button', { class: 'btn primary sm', type: 'button', onClick: () => openCustomEditor({ code: q, onSaved: x => openItem(x) }) }, 'Ürünü ekle'))); }
      return;
    }
    try { await loadDB(); } catch { mount(results, emptyState('alert', 'Liste yüklenemedi', 'Sayfayı yenileyip tekrar dene.')); return; }
    if (input.value.trim() !== q) return;
    const local = searchLocal(q, 50);
    if (q.length < 3) online = { state: 'short', items: [], err: '' };
    else {
      online = { state: 'loading', items: [], err: '' };
      onlineTimer = setTimeout(async () => {
        const my = ctl = new AbortController();
        try {
          const items = await searchOnline(q, { signal: my.signal });
          if (my.signal.aborted) return;
          online = { state: 'done', items, err: '' };
        } catch (e) {
          if (e.kind === 'aborted') return;
          online = { state: 'error', items: [], err: e.kind === 'offline' ? 'İnternet yok. Sadece uygulamadaki liste gösteriliyor.' : e.message + '. Sadece uygulamadaki liste gösteriliyor.' };
        }
        paintResults(searchLocal(q, 50));
      }, 550);
    }
    paintResults(local);
  }
  const onInput = () => { clearTimeout(debounce); debounce = setTimeout(run, 140); };
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(debounce); run(); input.blur(); } });

  paintMeals();
  const close = sheet(pick ? 'Malzeme seç' : 'Yemek ekle', body, { cls: 'tall', onClose: () => { ctl?.abort(); clearTimeout(onlineTimer); clearTimeout(debounce); } });
  run();
  loadDB().catch(() => {});
  setTimeout(() => input.focus(), 80);
  return close;
}

// ---------- Porsiyon / besin detayı ----------
/**
 * openFoodSheet(food, { meal, pick, entry, dk, onConfirm(food, grams, meal) })
 * entry verilirse düzenleme modudur (Kaydet + Sil).
 */
export function openFoodSheet(food, { meal = D.defaultMeal(), pick = false, entry = null, dk = todayKey(), onConfirm = null } = {}) {
  const u = unitOf(food);
  const portions = [{ l: `100 ${u}`, g: 100 }, ...(food.portions || []).filter(p => p.g !== 100)];
  let sel = entry ? -1 : (portions.length > 1 ? 1 : 0), qty = 1, curMeal = entry?.meal || meal;
  let grams = entry ? +entry.grams : portions[sel].g;

  const preview = h('div', { class: 'nut-preview', 'aria-live': 'polite' });
  const chips = h('div', { class: 'chips nut-portions' });
  const qtyVal = h('span', { class: 'nut-qty-val' });
  const qtyBox = h('div', { class: 'nut-qty', role: 'group', 'aria-label': 'Adet' },
    h('button', { type: 'button', 'aria-label': 'Azalt', onClick: () => setQty(qty <= 1 ? Math.max(0.5, qty - 0.5) : qty - 1) }, '−'),
    qtyVal,
    h('button', { type: 'button', 'aria-label': 'Artır', onClick: () => setQty(qty < 1 ? qty + 0.5 : qty + 1) }, '+'));
  const gInput = h('input', { class: 'input nut-gram', type: 'text', inputmode: 'decimal', 'aria-label': `Miktar (${u})`, value: fmt.n(grams, 0), autocomplete: 'off' });
  gInput.addEventListener('input', () => {
    const v = parseNum(gInput.value);
    if (v >= 0) { grams = v; sel = -1; paintChips(); paintPreview(); }
  });
  gInput.addEventListener('focus', () => gInput.select());

  function setQty(v) { qty = Math.round(v * 10) / 10; if (sel < 0) sel = 0; grams = portions[sel].g * qty; gInput.value = fmt.n(grams, grams % 1 ? 1 : 0); paintChips(); paintPreview(); }
  function paintChips() {
    mount(chips, portions.map((p, i) => h('button', { class: 'chip' + (i === sel ? ' active' : ''), type: 'button',
      onClick: () => { sel = i; qty = 1; grams = p.g; gInput.value = fmt.n(grams, grams % 1 ? 1 : 0); paintChips(); paintPreview(); } },
      p.l + (i > 0 && !/\d+\s*(g|ml)\)?$/.test(p.l) ? ` (${fmt.n(p.g)} ${u})` : ''))));
    qtyVal.textContent = sel >= 0 ? `${fmt.n(qty, qty % 1 ? 1 : 0)} × ${portions[sel].l.replace(/^1 /, '').replace(/\s*\(.*\)$/, '')}` : 'Elle girildi';
    qtyBox.classList.toggle('off', sel < 0);
  }
  function paintPreview() {
    const v = D.calc(food, grams);
    const kp = v.p * 4, kc = v.c * 4, kf = v.f * 9, tot = kp + kc + kf || 1;
    const cell = (l, val, kc2, col) => h('div', { class: 'nut-mcell' },
      h('div', { class: 'nut-mval' }, g1(val), h('small', null, ' g')),
      h('div', { class: 'nut-mlabel' }, h('i', { style: { background: col } }), l),
      h('div', { class: 'nut-mpct' }, `%${Math.round(kc2 / tot * 100)}`));
    const extra = [['Lif', food.fib], ['Şeker', food.sug], ['Tuz', food.salt]].filter(x => x[1] != null)
      .map(([l, val]) => `${l} ${fmt.n(val * grams / 100, 1)} g`).join(' · ');
    mount(preview,
      h('div', { class: 'nut-kcal-big' }, h('span', null, fmt.n(v.kcal)), h('small', null, 'kcal')),
      h('div', { class: 'nut-split', 'aria-hidden': 'true' },
        h('i', { style: { width: kp / tot * 100 + '%', background: 'var(--blue)' } }),
        h('i', { style: { width: kc / tot * 100 + '%', background: 'var(--amber)' } }),
        h('i', { style: { width: kf / tot * 100 + '%', background: 'var(--magenta)' } })),
      h('div', { class: 'nut-mgrid' },
        cell('Protein', v.p, kp, 'var(--blue)'), cell('Karbonhidrat', v.c, kc, 'var(--amber)'), cell('Yağ', v.f, kf, 'var(--magenta)')),
      extra ? h('p', { class: 'small muted', style: 'margin:10px 0 0;text-align:center' }, extra) : null);
    addBtn.disabled = !(grams > 0);
  }

  const mealRow = h('div', { class: 'nut-meal-grid', role: 'radiogroup', 'aria-label': 'Öğün' });
  const paintMeals = () => mount(mealRow, D.MEALS.map(m => h('button', { class: 'chip' + (m.id === curMeal ? ' active' : ''), type: 'button', role: 'radio', 'aria-checked': String(m.id === curMeal),
    onClick: () => { curMeal = m.id; paintMeals(); } }, m.e + ' ' + m.l)));

  const favBtn = h('button', { class: 'btn icon ghost', type: 'button' });
  const paintFav = () => {
    const on = D.isFav(food.id);
    mount(favBtn, icon('star', { cls: on ? 'nut-star on' : 'nut-star' }));
    favBtn.setAttribute('aria-label', on ? 'Favorilerden çıkar' : 'Favorilere ekle');
    favBtn.setAttribute('aria-pressed', String(on));
  };
  favBtn.addEventListener('click', () => { const on = D.toggleFav(food); paintFav(); toast(on ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', { type: 'success', ms: 1600 }); });

  const addBtn = h('button', { class: 'btn primary lg grow', type: 'button', onClick: () => {
    if (!(grams > 0)) { toast('Miktar gir', { type: 'error' }); return; }
    if (food.src === 'off') D.cacheFood(food);
    if (entry) {
      D.editEntry(dk, entry.id, { grams, meal: curMeal });
      toast('Kayıt güncellendi', { type: 'success' });
      close();
    } else { close(); onConfirm?.(food, grams, curMeal); }
  } }, entry ? 'Kaydet' : pick ? 'Malzemeyi ekle' : 'Ekle');

  const delBtn = entry ? h('button', { class: 'btn danger icon', type: 'button', 'aria-label': 'Kaydı sil', onClick: async () => {
    if (await confirmDialog(`“${entry.name}” silinsin mi?`, { title: 'Kaydı sil', okLabel: 'Sil', danger: true })) {
      D.deleteEntry(dk, entry.id); toast('Kayıt silindi', { type: 'success' }); close();
    }
  } }, icon('trash')) : null;

  const body = h('div', { class: 'nut-food' },
    h('div', { class: 'row', style: 'align-items:flex-start' },
      food.img ? h('img', { class: 'nut-img lg', src: food.img, alt: '' }) : emoCircle(foodEmoji(food), CATS[food.cat]?.h, 52),
      h('div', { class: 'grow' },
        h('h2', { class: 'nut-food-name' }, food.name),
        h('div', { class: 'muted small' }, [food.brand, CATS[food.cat]?.l, `100 ${u} = ${fmt.n(food.kcal)} kcal`].filter(Boolean).join(' · '))),
      pick ? null : favBtn),
    food.approx || food.src === 'off' ? h('div', { class: 'nut-hint' }, icon('info'), food.src === 'off'
      ? 'Bilgiler Open Food Facts kullanıcılarından geliyor. Paketteki etiketle karşılaştır.'
      : '≈ Yaklaşık değer. Paketteki etiketi kontrol et.') : null,
    h('div', { class: 'nut-label' }, 'Ne kadar?'),
    chips,
    h('div', { class: 'row nut-amount' }, qtyBox, h('div', { class: 'nut-gram-wrap' }, gInput, h('span', null, u))),
    preview,
    pick ? null : h('div', { class: 'nut-label' }, 'Hangi öğün?'),
    pick ? null : mealRow,
    !entry && !pick && String(food.id).startsWith('r-') === false ? h('button', { class: 'nut-link', type: 'button', onClick: () => { close(); go('recipes'); } }, '🥗 Tariflerden ekle') : null,
    h('div', { class: 'nut-foot' }, delBtn, addBtn));

  paintChips(); paintPreview(); paintMeals(); paintFav();
  const close = sheet(entry ? 'Kaydı düzenle' : pick ? 'Malzeme miktarı' : 'Porsiyon seç', body);
  return close;
}

/** Günlükteki bir kaydı açar: hızlı kayıt → hızlı form, diğerleri → porsiyon sayfası */
export async function openEntry(dk, entry) {
  if (entry.quick || !(+entry.grams > 0)) return openQuickAdd({ dk, entry });
  let base = findFood(entry.foodId);
  if (!base) { try { await loadDB(); base = findFood(entry.foodId); } catch { /* yok */ } }
  const per = D.per100(entry);
  const food = {
    id: entry.foodId, name: entry.name, brand: entry.brand, unit: entry.unit || base?.unit || 'g',
    cat: base?.cat || (String(entry.foodId).startsWith('recipe:') ? 'tarif' : 'yemek'),
    ...(base ? { fib: base.fib, sug: base.sug, salt: base.salt, approx: base.approx, img: base.img, src: base.src } : {}),
    kcal: per.kcal, p: per.p, c: per.c, f: per.f, portions: base?.portions || [],
  };
  return openFoodSheet(food, { dk, entry });
}

// ---------- Hızlı kalori ----------
export function openQuickAdd({ dk = todayKey(), meal = D.defaultMeal(), entry = null } = {}) {
  let curMeal = entry?.meal || meal;
  const name = h('input', { class: 'input', type: 'text', placeholder: 'ör. Ev yemeği, kafede tatlı', value: entry?.name && entry.name !== 'Hızlı kalori' ? entry.name : '', maxlength: 60, autocomplete: 'off' });
  const kcal = numField('Kalori', entry?.kcal, { unit: 'kcal', ph: 'ör. 450' });
  const p = numField('Protein', entry?.p || '', { unit: 'g', ph: 'isteğe bağlı' });
  const c = numField('Karbonhidrat', entry?.c || '', { unit: 'g', ph: 'isteğe bağlı' });
  const f = numField('Yağ', entry?.f || '', { unit: 'g', ph: 'isteğe bağlı' });
  const mealRow = h('div', { class: 'nut-meal-grid', role: 'radiogroup', 'aria-label': 'Öğün' });
  const paintMeals = () => mount(mealRow, D.MEALS.map(m => h('button', { class: 'chip' + (m.id === curMeal ? ' active' : ''), type: 'button', role: 'radio', 'aria-checked': String(m.id === curMeal), onClick: () => { curMeal = m.id; paintMeals(); } }, m.e + ' ' + m.l)));
  paintMeals();
  const saveBtn = h('button', { class: 'btn primary lg grow', type: 'button', onClick: () => {
    const k = parseNum(kcal.inp.value);
    if (!(k > 0 && k < 10000)) { toast('Kalori değerini gir', { type: 'error' }); kcal.inp.focus(); return; }
    const vals = { name: name.value.trim() || 'Hızlı kalori', kcal: k, p: parseNum(p.inp.value) || 0, c: parseNum(c.inp.value) || 0, f: parseNum(f.inp.value) || 0, meal: curMeal };
    if (entry) { D.editEntry(dk, entry.id, vals); toast('Kayıt güncellendi', { type: 'success' }); }
    else { D.addQuick(dk, vals); toast(`${fmt.n(k)} kcal eklendi`, { type: 'success' }); }
    close();
  } }, entry ? 'Kaydet' : 'Ekle');
  const delBtn = entry ? h('button', { class: 'btn danger icon', type: 'button', 'aria-label': 'Kaydı sil', onClick: async () => {
    if (await confirmDialog(`“${entry.name}” silinsin mi?`, { title: 'Kaydı sil', okLabel: 'Sil', danger: true })) { D.deleteEntry(dk, entry.id); toast('Kayıt silindi', { type: 'success' }); close(); }
  } }, icon('trash')) : null;
  const body = h('div', null,
    h('p', { class: 'muted small', style: 'margin:0 0 14px' }, 'Tam olarak ne yediğini bilmiyorsan sadece kaloriyi yazman yeterli.'),
    h('label', { class: 'field' }, h('span', null, 'Ne yedin?'), name),
    kcal.el,
    h('div', { class: 'grid-3 nut-g3' }, p.el, c.el, f.el),
    h('div', { class: 'nut-label' }, 'Hangi öğün?'), mealRow,
    h('div', { class: 'nut-foot' }, delBtn, saveBtn));
  const close = sheet(entry ? 'Kaydı düzenle' : 'Hızlı kalori ekle', body);
  setTimeout(() => (entry ? kcal.inp : name).focus(), 80);
  return close;
}

// ---------- Kendi besinin ----------
export function openCustomEditor({ food = null, name = '', code = '', onSaved = null } = {}) {
  const ex = food || {};
  let unit = ex.unit || 'g';
  const nm = h('input', { class: 'input', type: 'text', value: ex.name || name, placeholder: 'ör. Annemin keki', maxlength: 70, autocomplete: 'off' });
  const br = h('input', { class: 'input', type: 'text', value: ex.brand || '', placeholder: 'isteğe bağlı', maxlength: 40, autocomplete: 'off' });
  const bc = h('input', { class: 'input', type: 'text', inputmode: 'numeric', value: ex.code || code, placeholder: 'isteğe bağlı', maxlength: 14, autocomplete: 'off' });
  const unitRow = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Birim' });
  const lbl = h('span', { class: 'nut-label', style: 'margin-top:4px' });
  const paintUnit = () => {
    mount(unitRow, [['g', 'Yiyecek (gram)'], ['ml', 'İçecek (ml)']].map(([id, l]) => h('button', { class: 'chip' + (unit === id ? ' active' : ''), type: 'button', role: 'radio', 'aria-checked': String(unit === id), onClick: () => { unit = id; paintUnit(); } }, l)));
    lbl.textContent = `100 ${unit} içindeki değerler`;
  };
  paintUnit();
  const kc = numField('Kalori', ex.kcal, { unit: 'kcal', ph: '0' });
  const p = numField('Protein', ex.p, { unit: 'g', ph: '0' });
  const c = numField('Karbonhidrat', ex.c, { unit: 'g', ph: '0' });
  const f = numField('Yağ', ex.f, { unit: 'g', ph: '0' });
  const fib = numField('Lif', ex.fib, { unit: 'g', ph: '–' });
  const sug = numField('Şeker', ex.sug, { unit: 'g', ph: '–' });
  const salt = numField('Tuz', ex.salt, { unit: 'g', ph: '–' });
  const pl = h('input', { class: 'input', type: 'text', value: ex.portions?.[0]?.l || '', placeholder: 'ör. 1 dilim', maxlength: 30 });
  const pg = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: ex.portions?.[0]?.g || '', placeholder: 'ör. 40' });
  const calcHint = h('button', { class: 'nut-link', type: 'button' });
  const upHint = () => {
    const est = Math.round(4 * (parseNum(p.inp.value) || 0) + 4 * (parseNum(c.inp.value) || 0) + 9 * (parseNum(f.inp.value) || 0));
    calcHint.textContent = est > 0 ? `Makrolara göre ≈ ${fmt.n(est)} kcal · kaloriye yaz` : '';
    calcHint.onclick = () => { kc.inp.value = est; };
  };
  [p, c, f].forEach(x => x.inp.addEventListener('input', upHint)); upHint();

  const save = h('button', { class: 'btn primary lg grow', type: 'button', onClick: () => {
    const name2 = nm.value.trim();
    const k = parseNum(kc.inp.value);
    if (!name2) { toast('Bir ad yaz', { type: 'error' }); nm.focus(); return; }
    if (!(k >= 0 && k <= 950)) { toast('Kalori 0 ile 950 arasında olmalı (100 ' + unit + ' için)', { type: 'error' }); kc.inp.focus(); return; }
    const out = { id: ex.id || 'c-' + uid(), name: name2, unit, kcal: Math.round(k), p: parseNum(p.inp.value) || 0, c: parseNum(c.inp.value) || 0, f: parseNum(f.inp.value) || 0, portions: [] };
    if (br.value.trim()) out.brand = br.value.trim();
    const code2 = bc.value.replace(/\D/g, ''); if (code2) out.code = code2;
    for (const [key, x] of [['fib', fib], ['sug', sug], ['salt', salt]]) { const v = parseNum(x.inp.value); if (v >= 0) out[key] = v; }
    const pgv = parseNum(pg.value);
    if (pgv > 0) out.portions.push({ l: pl.value.trim() || '1 porsiyon', g: pgv });
    D.saveCustom(out);
    toast('Besin kaydedildi', { type: 'success' });
    close();
    onSaved?.({ ...out, cat: 'ozel', src: 'custom' });
  } }, 'Kaydet');
  const del = ex.id ? h('button', { class: 'btn danger icon', type: 'button', 'aria-label': 'Besini sil', onClick: async () => {
    if (await confirmDialog(`“${ex.name}” silinsin mi? Günlükteki eski kayıtların silinmez.`, { title: 'Besini sil', okLabel: 'Sil', danger: true })) { D.deleteCustom(ex.id); toast('Besin silindi', { type: 'success' }); close(); }
  } }, icon('trash')) : null;

  const body = h('div', null,
    h('label', { class: 'field' }, h('span', null, 'Adı'), nm),
    h('div', { class: 'grid-2' }, h('label', { class: 'field' }, h('span', null, 'Marka'), br), h('label', { class: 'field' }, h('span', null, 'Barkod'), bc)),
    unitRow, lbl,
    h('div', { class: 'grid-2' }, kc.el, p.el, c.el, f.el), calcHint,
    h('div', { class: 'grid-3 nut-g3' }, fib.el, sug.el, salt.el),
    h('div', { class: 'nut-label' }, 'Porsiyon (isteğe bağlı)'),
    h('div', { class: 'grid-2' }, h('label', { class: 'field' }, h('span', null, 'Porsiyon adı'), pl), h('label', { class: 'field' }, h('span', null, `Miktar (${'g/ml'})`), pg)),
    h('div', { class: 'nut-foot' }, del, save));
  const close = sheet(ex.id ? 'Besini düzenle' : 'Yeni besin', body);
  setTimeout(() => (nm.value ? kc.inp : nm).focus(), 80);
  return close;
}

// ---------- Kendi tarifin ----------
export function openRecipeEditor(recipe = null) {
  const r = recipe ? structuredClone(recipe) : { id: uid(), name: '', servings: 2, cookedG: '', items: [] };
  const nm = h('input', { class: 'input', type: 'text', value: r.name, placeholder: 'ör. Fırında tavuklu sebze', maxlength: 70, autocomplete: 'off' });
  const servVal = h('span', { class: 'nut-qty-val' });
  const serv = h('div', { class: 'nut-qty', role: 'group', 'aria-label': 'Porsiyon sayısı' },
    h('button', { type: 'button', 'aria-label': 'Azalt', onClick: () => { r.servings = Math.max(1, r.servings - 1); paint(); } }, '−'), servVal,
    h('button', { type: 'button', 'aria-label': 'Artır', onClick: () => { r.servings = Math.min(50, r.servings + 1); paint(); } }, '+'));
  const cooked = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: r.cookedG || '', placeholder: 'boş bırakabilirsin' });
  cooked.addEventListener('input', () => { r.cookedG = parseNum(cooked.value) || ''; paintTotals(); });
  const list = h('div', { class: 'list' });
  const totals = h('div', { class: 'nut-rtotals' });

  function paintTotals() {
    const fd = D.recipeToFood(r);
    const per = fd.portions[0] ? D.calc(fd, fd.portions[0].g) : { kcal: 0, p: 0, c: 0, f: 0 };
    mount(totals,
      h('div', { class: 'info-strip' },
        h('div', null, h('div', { class: 'is-label' }, 'Toplam'), h('div', { class: 'is-value' }, fmt.n(fd.totals.kcal), h('small', null, ' kcal'))),
        h('div', null, h('div', { class: 'is-label' }, '1 porsiyon'), h('div', { class: 'is-value c-cyan' }, fmt.n(per.kcal), h('small', null, ' kcal'))),
        h('div', null, h('div', { class: 'is-label' }, 'Ağırlık'), h('div', { class: 'is-value' }, fmt.n(fd.totalG), h('small', null, ' g')))),
      h('p', { class: 'small muted', style: 'margin:8px 2px 0' }, `1 porsiyon: ${macroLine(per)}`));
  }
  function paint() {
    servVal.textContent = `${r.servings} porsiyon`;
    mount(list, r.items.length ? r.items.map((it, i) => h('div', { class: 'list-item' },
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, it.name), h('div', { class: 'li-sub' }, `${fmt.n(it.grams)} ${it.unit || 'g'} · ${fmt.n(it.kcal)} kcal`)),
      h('button', { class: 'btn icon sm ghost', type: 'button', 'aria-label': it.name + ' malzemesini çıkar', onClick: () => { r.items.splice(i, 1); paint(); } }, icon('x'))))
      : h('p', { class: 'muted small', style: 'margin:4px 2px 10px' }, 'Henüz malzeme yok. Aşağıdaki düğmeyle ekle.'));
    paintTotals();
  }
  const addIng = h('button', { class: 'btn ghost block', type: 'button', onClick: () => openSearch({ pick: (food, grams) => {
    r.items.push({ foodId: food.id, name: food.name, grams, unit: unitOf(food), ...D.calc(food, grams) });
    paint(); toast(`${food.name} eklendi`, { type: 'success', ms: 1500 });
  } }) }, icon('plus'), 'Malzeme ekle');
  const save = h('button', { class: 'btn primary lg grow', type: 'button', onClick: () => {
    r.name = nm.value.trim();
    if (!r.name) { toast('Tarife bir ad ver', { type: 'error' }); nm.focus(); return; }
    if (!r.items.length) { toast('En az bir malzeme ekle', { type: 'error' }); return; }
    D.saveRecipe(r); toast('Tarif kaydedildi', { type: 'success' }); close();
  } }, 'Kaydet');
  const del = recipe ? h('button', { class: 'btn danger icon', type: 'button', 'aria-label': 'Tarifi sil', onClick: async () => {
    if (await confirmDialog(`“${recipe.name}” tarifi silinsin mi?`, { title: 'Tarifi sil', okLabel: 'Sil', danger: true })) { D.deleteRecipe(recipe.id); toast('Tarif silindi', { type: 'success' }); close(); }
  } }, icon('trash')) : null;
  const body = h('div', null,
    h('label', { class: 'field' }, h('span', null, 'Tarifin adı'), nm),
    h('div', { class: 'row between', style: 'margin-bottom:14px' }, h('span', { class: 'nut-label', style: 'margin:0' }, 'Kaç porsiyon çıkıyor?'), serv),
    h('div', { class: 'nut-label' }, 'Malzemeler'), list, addIng,
    h('label', { class: 'field', style: 'margin-top:14px' }, h('span', null, 'Pişmiş toplam ağırlık (g)'), cooked),
    totals,
    h('div', { class: 'nut-foot' }, del, save));
  paint();
  const close = sheet(recipe ? 'Tarifi düzenle' : 'Yeni tarif', body);
  return close;
}

export { dbCount };
