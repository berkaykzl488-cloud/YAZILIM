// Vücut ölçüleri — ölçüm ekleme/düzenleme alt sayfası.
import { h, icon, modal, toast, confirmDialog, haptic, fmt } from '../../core/ui.js';
import { todayKey } from '../../core/store.js';
import { awardXP } from '../../core/xp.js';
import { MEASURES, saveEntry, deleteEntry, parseNum, latestValues, getEntries, weightOn } from './calc.js';

function numField(label, value, { hint, placeholder, unit = 'cm' } = {}) {
  const inp = h('input', {
    class: 'input mono bd-num', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next',
    value: value != null ? String(value).replace('.', ',') : '', placeholder: placeholder || '',
    'aria-label': `${label} (${unit})`,
  });
  const wrap = h('label', { class: 'field bd-field' },
    h('span', null, label, h('em', { class: 'bd-unit' }, unit)),
    inp,
    hint && h('small', { class: 'bd-hint' }, icon('info', { size: 13 }), hint));
  return { wrap, inp };
}

/** entry: düzenlenecek kayıt (yoksa yeni). onDone(): kayıt/silme sonrası */
export function openMeasureSheet(entry = null, { onDone } = {}) {
  const isEdit = !!entry;
  const prevVals = latestValues(getEntries());
  const date = h('input', { class: 'input', type: 'date', value: entry?.date || todayKey(), max: todayKey(), 'aria-label': 'Tarih', required: true });

  const fields = {};
  const grid = h('div', { class: 'bd-form-grid' }, MEASURES.map(m => {
    const f = numField(m.label, entry?.[m.id], { hint: m.hint, placeholder: prevVals[m.id] ? 'Son: ' + fmt.n(prevVals[m.id].v, 1) : '' });
    fields[m.id] = { ...f, m };
    return f.wrap;
  }));
  const w = weightOn(todayKey());
  const weight = numField('Kilo (isteğe bağlı)', entry?.weightKg, { unit: 'kg', placeholder: 'Son: ' + fmt.n(w.kg, 1), hint: 'Boş bırakırsan kilo takibindeki son tartın kullanılır.' });
  const note = h('textarea', { class: 'input bd-note', rows: 2, maxlength: 200, placeholder: 'Örn. sabah aç karnına ölçtüm' });
  note.value = entry?.note || '';

  const body = h('div', { class: 'bd-sheet' },
    h('p', { class: 'small muted', style: 'margin:0 0 12px' }, 'Sadece ölçtüğün alanları doldur. Mezurayı sıkmadan, cilde değecek şekilde tut.'),
    h('label', { class: 'field' }, h('span', null, 'Tarih'), date),
    grid,
    weight.wrap,
    h('label', { class: 'field' }, h('span', null, 'Not'), note),
    isEdit && h('button', { class: 'btn danger block', type: 'button', onClick: async () => {
      const ok = await confirmDialog(`${fmt.date(entry.date, 'full')} tarihli ölçüm silinsin mi? Bu işlem geri alınamaz.`, { title: 'Ölçümü sil', okLabel: 'Sil', danger: true });
      if (!ok) return;
      deleteEntry(entry.id);
      close();
      toast('Ölçüm silindi', { type: 'success' });
      onDone?.();
    } }, icon('trash'), 'Bu ölçümü sil'));

  // Enter ile sonraki alana geç
  const inputs = [...MEASURES.map(m => fields[m.id].inp), weight.inp];
  inputs.forEach((inp, i) => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (inputs[i + 1] || note).focus(); } }));

  const submit = () => {
    const d = date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast('Bir tarih seç', { type: 'error' }); return false; }
    if (d > todayKey()) { toast('Gelecekteki bir tarih seçilemez', { type: 'error' }); return false; }
    const out = { id: entry?.id, date: d };
    let count = 0;
    for (const { inp, m } of Object.values(fields)) {
      const v = parseNum(inp.value);
      inp.classList.remove('bad');
      if (v == null) continue;
      if (Number.isNaN(v) || v < m.min || v > m.max) {
        inp.classList.add('bad'); inp.focus();
        toast(`${m.label} için ${m.min}–${m.max} cm arası bir değer gir`, { type: 'error' });
        return false;
      }
      out[m.id] = Math.round(v * 10) / 10; count++;
    }
    const wv = parseNum(weight.inp.value);
    weight.inp.classList.remove('bad');
    if (wv != null) {
      if (Number.isNaN(wv) || wv < 30 || wv > 300) { weight.inp.classList.add('bad'); toast('Kilo için 30–300 kg arası bir değer gir', { type: 'error' }); return false; }
      out.weightKg = Math.round(wv * 10) / 10;
    }
    if (!count) { toast('En az bir ölçü gir', { type: 'error' }); fields.waist.inp.focus(); return false; }
    const n = note.value.trim();
    if (n) out.note = n;
    saveEntry(out);
    haptic();
    toast(isEdit ? 'Ölçüm güncellendi' : 'Ölçüm kaydedildi', { type: 'success' });
    if (!isEdit) awardXP(15, 'Vücut ölçümü', { once: 'body-' + d });
    onDone?.();
    return true;
  };

  const close = modal({
    title: isEdit ? 'Ölçümü düzenle' : 'Yeni ölçüm',
    body,
    actions: [
      { label: 'Vazgeç', class: 'ghost' },
      { label: 'Kaydet', class: 'primary', icon: 'check', onClick: submit },
    ],
  });
  return close;
}
