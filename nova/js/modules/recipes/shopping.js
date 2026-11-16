// Alışveriş listesi: reyonlara göre gruplu, işaretle, sil, paylaş.
import { h, icon, mount, toast, confirmDialog, emptyState, haptic } from '../../core/ui.js';
import { subscribe } from '../../core/store.js';
import { parseIngredient } from './data/_build.js';
import { getShopping, saveShopping, addToShopping, qtyText, aisleOf, AISLES } from './util.js';
import { nav } from './nav.js';

/** "2 adet limon" ya da yalnızca "limon" */
function parseFree(text) {
  const t = text.trim().replace(/\s+/g, ' ');
  try { return parseIngredient(t); } catch { /* serbest metin */ }
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (m) return { qty: parseFloat(m[1].replace(',', '.')), unit: 'adet', name: m[2] };
  return { name: t, qty: null, unit: '' };
}

const itemText = it => [it.qty != null ? qtyText(it.qty, it.unit) : '', it.name].filter(Boolean).join(' ');

export function renderShopping(el) {
  const sub = h('p', { class: 'hud-sub' });
  const listEl = h('div');
  const shareBtn = h('button', { type: 'button', class: 'rcp-round-btn', 'aria-label': 'Listeyi paylaş', onClick: share }, icon('share'));

  const input = h('input', { class: 'input', placeholder: 'Malzeme ekle (ör. 2 adet limon)', 'aria-label': 'Malzeme ekle', enterkeyhint: 'done' });
  const addForm = h('form', { class: 'rcp-add-row', onSubmit: e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    addToShopping([parseFree(v)]);
    input.value = '';
    haptic(8);
  } }, input, h('button', { class: 'btn primary icon', type: 'submit', 'aria-label': 'Ekle' }, icon('plus')));

  function setItems(fn) { saveShopping(fn(getShopping())); }

  function row(it) {
    const toggle = () => { haptic(6); setItems(l => l.map(x => (x.id === it.id ? { ...x, checked: !x.checked } : x))); };
    return h('div', { class: 'rcp-shop-item' + (it.checked ? ' done' : '') },
      h('button', { type: 'button', class: 'rcp-shop-main', 'aria-pressed': String(!!it.checked), onClick: toggle },
        h('span', { class: 'rcp-check' + (it.checked ? ' on' : '') }, icon('check')),
        h('span', { class: 'rcp-shop-txt' },
          h('span', { class: 'rcp-shop-name' }, it.qty != null && h('b', null, qtyText(it.qty, it.unit) + ' '), it.name),
          it.recipes?.length ? h('span', { class: 'rcp-shop-from' }, it.recipes.join(', ')) : null)),
      h('button', { type: 'button', class: 'rcp-shop-del', 'aria-label': it.name + ' sil', onClick: () => {
        setItems(l => l.filter(x => x.id !== it.id));
        toast(`${it.name} silindi`, { ms: 1800 });
      } }, icon('x', { size: 18 })));
  }

  function paint() {
    const items = getShopping();
    const done = items.filter(x => x.checked);
    const open = items.filter(x => !x.checked);
    sub.textContent = items.length ? `${open.length} alınacak · ${done.length} alındı` : 'Tariflerden malzeme ekleyebilirsin';
    shareBtn.disabled = !items.length;
    if (!items.length) {
      mount(listEl, h('div', { class: 'panel' }, emptyState('list', 'Listen boş', 'Bir tarifin sayfasındaki “Listeye ekle” düğmesiyle malzemeleri buraya ekleyebilirsin.',
        h('a', { class: 'btn primary', href: '#/recipes' }, 'Tariflere göz at'))));
      return;
    }
    const groups = AISLES.map(a => ({ a, list: open.filter(it => aisleOf(it.name).id === a.id) })).filter(g => g.list.length);
    mount(listEl,
      groups.map(g => h('section', { class: 'rcp-aisle' },
        h('div', { class: 'rcp-aisle-head' }, h('span', { 'aria-hidden': 'true' }, g.a.emoji), g.a.label, h('span', { class: 'muted' }, g.list.length)),
        h('div', { class: 'panel tight rcp-shop-panel' }, g.list.map(row)))),
      !open.length && h('div', { class: 'panel rcp-alldone' }, h('span', { 'aria-hidden': 'true' }, '🎉'), h('div', null, h('b', null, 'Hepsi alındı!'), h('div', { class: 'muted small' }, 'Alınanları temizleyip yeni tariflere geçebilirsin.'))),
      done.length ? h('section', { class: 'rcp-aisle' },
        h('div', { class: 'rcp-aisle-head' }, h('span', { 'aria-hidden': 'true' }, '✅'), 'Alındı', h('span', { class: 'muted' }, done.length)),
        h('div', { class: 'panel tight rcp-shop-panel' }, done.map(row))) : null,
      h('div', { class: 'grid-2 rcp-shop-actions' },
        h('button', { type: 'button', class: 'btn ghost', disabled: !done.length, onClick: async () => {
          if (!(await confirmDialog(`${done.length} alınmış malzeme listeden kaldırılsın mı?`, { title: 'Alınanları temizle', okLabel: 'Temizle' }))) return;
          setItems(l => l.filter(x => !x.checked));
          toast('Alınanlar temizlendi', { type: 'success' });
        } }, icon('check'), 'Alınanları temizle'),
        h('button', { type: 'button', class: 'btn danger', onClick: async () => {
          if (!(await confirmDialog('Listedeki tüm malzemeler silinsin mi?', { title: 'Listeyi boşalt', okLabel: 'Hepsini sil', danger: true }))) return;
          saveShopping([]);
          toast('Liste boşaltıldı', { type: 'success' });
        } }, icon('trash'), 'Listeyi boşalt')));
  }

  async function share() {
    const items = getShopping();
    if (!items.length) return;
    const open = items.filter(x => !x.checked);
    const lines = ['Alışveriş listesi', ''];
    AISLES.forEach(a => {
      const l = open.filter(it => aisleOf(it.name).id === a.id);
      if (!l.length) return;
      lines.push(a.label + ':', ...l.map(it => '• ' + itemText(it)), '');
    });
    if (!open.length) lines.push('Tüm malzemeler alındı.');
    const text = lines.join('\n').trim();
    try { if (navigator.share) { await navigator.share({ title: 'Alışveriş listesi', text }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('Liste panoya kopyalandı', { type: 'success' }); }
    catch { toast('Paylaşım bu cihazda desteklenmiyor', { type: 'error' }); }
  }

  el.append(
    nav.button('recipes', 'Geri'),
    h('div', { class: 'rcp-head' }, h('div', { class: 'grow' }, h('h1', { class: 'hud-title' }, 'Alışveriş listesi'), sub), shareBtn),
    addForm,
    listEl);
  paint();
  return subscribe('recipes.shopping', paint);
}
