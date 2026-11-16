// Tarif detayı: büyük görsel alan, makro özeti, porsiyon ayarı, malzeme listesi, adımlar.
import { h, icon, mount, fmt, toast, haptic } from '../../core/ui.js';
import { CAT, totalMin } from './data.js';
import { tint, diffLabel, minText, qtyText, isFav, toggleFav, session, portionsOf } from './util.js';
import { portionStepper, openAddToMeal, openAddToShopping } from './sheets.js';
import { nav } from './nav.js';

function macroBlock(r) {
  const s = r.perServing;
  const pk = s.p * 4, ck = s.c * 4, fk = s.f * 9, tot = pk + ck + fk || 1;
  const pct = x => Math.round((x / tot) * 100);
  const seg = (k, cls) => h('i', { class: cls, style: { width: (k / tot) * 100 + '%' } });
  const g = v => fmt.n(v, v % 1 ? 1 : 0);
  return h('div', { class: 'panel rcp-macro' },
    h('div', { class: 'rcp-macro-top' },
      h('div', null,
        h('div', { class: 'rcp-big' }, fmt.n(s.kcal), h('span', null, 'kcal')),
        h('div', { class: 'muted small' }, `1 porsiyon · yaklaşık ${r.gramsPerServing} g`)),
      h('div', { class: 'rcp-fib' }, h('b', null, g(s.fib) + ' g'), h('span', null, 'lif'))),
    h('div', { class: 'rcp-macro-bar', role: 'img', 'aria-label': `Protein yüzde ${pct(pk)}, karbonhidrat yüzde ${pct(ck)}, yağ yüzde ${pct(fk)}` },
      seg(pk, 'p'), seg(ck, 'c'), seg(fk, 'f')),
    h('div', { class: 'rcp-macro-cols' },
      [['p', 'Protein', s.p, pk], ['c', 'Karb.', s.c, ck], ['f', 'Yağ', s.f, fk]].map(([k, label, v, kc]) =>
        h('div', { class: 'rcp-mcol' },
          h('div', { class: 'rcp-mcol-label' }, h('span', { class: 'rcp-mdot ' + k }), label),
          h('div', { class: 'rcp-mcol-val' }, g(v), h('span', null, ' g')),
          h('div', { class: 'tiny muted' }, '%' + pct(kc))))));
}

async function share(r) {
  const lines = [
    r.name,
    `${r.servings} porsiyon · ${minText(totalMin(r))} · ${r.perServing.kcal} kcal / porsiyon`,
    '',
    'Malzemeler:',
    ...r.ingredients.map(i => `• ${qtyText(i.qty, i.unit)} ${i.name}${i.note ? ' (' + i.note + ')' : ''}`),
    '',
    'Hazırlanışı:',
    ...r.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    'NOVA Fit · Fit Tarifler',
  ];
  const text = lines.join('\n');
  try {
    if (navigator.share) { await navigator.share({ title: r.name, text }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  try {
    await navigator.clipboard.writeText(text);
    toast('Tarif panoya kopyalandı', { type: 'success' });
  } catch {
    toast('Paylaşım bu cihazda desteklenmiyor', { type: 'error' });
  }
}

export function renderDetail(el, r) {
  const cat = CAT[r.cat];
  let portions = portionsOf(r);
  const checked = session.checked.get(r.id) || new Set();
  session.checked.set(r.id, checked);

  // Favori ve paylaş
  const favBtn = h('button', { type: 'button', class: 'rcp-round-btn' });
  const paintFav = () => {
    const on = isFav(r.id);
    favBtn.classList.toggle('on', on);
    favBtn.setAttribute('aria-label', on ? 'Favorilerden çıkar' : 'Favorilere ekle');
    favBtn.setAttribute('aria-pressed', String(on));
    mount(favBtn, icon('heart'));
  };
  favBtn.addEventListener('click', () => {
    const on = toggleFav(r.id);
    haptic(10); paintFav();
    toast(on ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', { type: on ? 'success' : 'info', ms: 1800 });
  });
  paintFav();
  const shareBtn = h('button', { type: 'button', class: 'rcp-round-btn', 'aria-label': 'Paylaş', onClick: () => share(r) }, icon('share'));

  // Malzemeler
  const ingList = h('div', { class: 'rcp-ings' });
  const paintIngs = () => {
    const factor = portions / r.servings;
    mount(ingList, r.ingredients.map((ing, i) => {
      const on = checked.has(i);
      return h('button', { type: 'button', class: 'rcp-ing' + (on ? ' done' : ''), 'aria-pressed': String(on), onClick: () => {
        on ? checked.delete(i) : checked.add(i); haptic(6); paintIngs();
      } },
        h('span', { class: 'rcp-check' + (on ? ' on' : '') }, icon('check')),
        h('span', { class: 'rcp-ing-txt' },
          h('span', { class: 'rcp-ing-qty' }, qtyText(ing.qty * factor, ing.unit)), ' ',
          h('span', { class: 'rcp-ing-name' }, ing.name),
          ing.note && h('span', { class: 'rcp-ing-note' }, ing.note)));
    }));
  };
  paintIngs();

  const stepper = portionStepper(portions, { max: 24, onChange: v => { portions = v; session.portions.set(r.id, v); paintIngs(); } });

  el.append(
    h('div', { class: 'rcp-detail-top' }, nav.button('recipes', 'Geri'), h('div', { class: 'row gap-s' }, shareBtn, favBtn)),
    h('div', { class: 'rcp-hero', style: { background: tint(r.cat, 0.5) } },
      h('span', { class: 'rcp-hero-cat' }, cat.emoji, ' ', cat.label),
      h('span', { class: 'rcp-hero-big', 'aria-hidden': 'true' }, r.emoji)),
    h('h1', { class: 'rcp-title' }, r.name),
    h('div', { class: 'info-strip rcp-meta-strip' },
      h('div', null, h('div', { class: 'is-label' }, icon('clock'), 'Süre'), h('div', { class: 'is-value' }, minText(totalMin(r)))),
      h('div', null, h('div', { class: 'is-label' }, icon('bolt'), 'Zorluk'), h('div', { class: 'is-value' }, diffLabel(r.difficulty))),
      h('div', null, h('div', { class: 'is-label' }, icon('user'), 'Porsiyon'), h('div', { class: 'is-value' }, String(r.servings)))),
    r.tags.length ? h('div', { class: 'rcp-tags' }, r.tags.map(t => h('span', { class: 'rcp-tag' }, t))) : null,
    macroBlock(r),
    h('button', { type: 'button', class: 'btn primary lg block rcp-cta', onClick: () => { location.hash = `#/recipes/${r.id}/cook`; } }, icon('play'), 'Pişirmeye başla'),
    h('div', { class: 'grid-2 rcp-actions' },
      h('button', { type: 'button', class: 'btn', onClick: () => openAddToMeal(r, { portions: 1 }) }, icon('plus'), 'Öğüne ekle'),
      h('button', { type: 'button', class: 'btn', onClick: () => openAddToShopping(r, portions) }, icon('list'), 'Listeye ekle')),

    h('div', { class: 'rcp-sec-head' }, h('h2', null, 'Malzemeler'), stepper),
    h('p', { class: 'muted small rcp-sec-hint' }, 'Hazırladığın malzemeye dokunup işaretle.'),
    h('div', { class: 'panel tight' }, ingList),

    h('div', { class: 'rcp-sec-head' }, h('h2', null, 'Hazırlanışı'), h('span', { class: 'muted small' }, `${r.steps.length} adım · hazırlık ${r.prepMin} dk${r.cookMin ? ', pişirme ' + r.cookMin + ' dk' : ''}`)),
    h('ol', { class: 'rcp-steps' }, r.steps.map((s, i) => h('li', null, h('span', { class: 'rcp-step-n' }, i + 1), h('p', null, s)))),

    r.tips?.length ? h('div', { class: 'panel rcp-tips' },
      h('div', { class: 'panel-title' }, h('span', { 'aria-hidden': 'true' }, '💡'), 'İpuçları'),
      h('ul', null, r.tips.map(t => h('li', null, t)))) : null,

    h('p', { class: 'tiny dim rcp-disclaimer' }, 'Besin değerleri kullanılan ürünlere göre değişebilen yaklaşık değerlerdir.'));
}
