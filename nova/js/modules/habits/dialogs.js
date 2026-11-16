// İstek kaydı ve "Kaydım" diyalogları
import { h, icon, modal, toast, haptic, confirmDialog } from '../../core/ui.js';
import { TRIGGERS, addCraving, recordRelapse, rewardResist, get, stats, span, toLocalInput, fromLocalInput } from './data.js';

const intensityColor = v => (v >= 8 ? 'var(--red)' : v >= 5 ? 'var(--amber)' : 'var(--lime)');

/** Seçilebilir çip grubu (tek seçim). Döner: { el, value() } */
function choiceChips(items, initial, onChange) {
  let cur = initial;
  const wrap = h('div', { class: 'hb-chipwrap', role: 'radiogroup' });
  const draw = () => wrap.replaceChildren(...items.map(t => h('button', {
    type: 'button', class: 'chip' + (t.id === cur ? ' active' : ''), role: 'radio', 'aria-checked': String(t.id === cur),
    onClick: () => { cur = cur === t.id ? '' : t.id; draw(); onChange?.(cur); },
  }, t.label)));
  draw();
  return { el: wrap, value: () => cur };
}

/** İstek kaydı. resisted: true|false|null (null → kullanıcı seçer) */
export function cravingDialog(hb, { resisted = null, sos = false, title = 'İstek kaydet', onSaved } = {}) {
  let intensity = 6;
  let res = resisted ?? true;
  const num = h('div', { class: 'hb-int-num' });
  const paint = () => { num.textContent = intensity; num.style.color = intensityColor(intensity); num.style.textShadow = `0 0 18px ${intensityColor(intensity)}`; };
  paint();
  const range = h('input', { type: 'range', min: 1, max: 10, step: 1, value: intensity, class: 'hb-range', 'aria-label': 'İsteğin şiddeti (1–10)',
    onInput: e => { intensity = +e.target.value; paint(); } });
  const trig = choiceChips(TRIGGERS, '');
  const note = h('textarea', { class: 'input', rows: 2, placeholder: 'Ne oldu? (isteğe bağlı)', maxlength: 240 });

  const segBtn = (val, label, ic) => h('button', { type: 'button', class: 'hb-seg-btn' + (res === val ? ' on' : '') + (val ? '' : ' warn'),
    onClick: () => { res = val; seg.replaceChildren(segBtn(true, 'Atlattım', 'check'), segBtn(false, 'Yaptım', 'x')); } }, icon(ic), label);
  const seg = h('div', { class: 'hb-seg' }, segBtn(true, 'Atlattım', 'check'), segBtn(false, 'Yaptım', 'x'));

  const body = h('div', { class: 'hb-form' },
    h('div', { class: 'hb-int' },
      h('div', null, h('div', { class: 'hb-label' }, 'İsteğin şiddeti'), h('div', { class: 'muted small' }, '1 = hafif · 10 = çok güçlü')),
      num),
    range,
    h('div', { class: 'hb-label mt' }, 'Ne tetikledi?'),
    trig.el,
    resisted == null && h('div', null, h('div', { class: 'hb-label mt' }, 'Sonuç'), seg),
    h('label', { class: 'field mt' }, h('span', { class: 'hb-label' }, 'Not'), note));

  modal({
    title,
    body,
    actions: [
      { label: 'Vazgeç', class: 'ghost' },
      { label: 'Kaydet', class: 'primary', icon: 'check', onClick: () => {
        const c = addCraving(hb.id, { intensity, trigger: trig.value(), note: note.value, resisted: res, sos });
        haptic(20);
        if (res) {
          rewardResist(hb);
          toast('İstek kaydedildi. Harika, atlattın!', { type: 'success' });
          onSaved?.(c);
        } else {
          toast('İstek kaydedildi', { type: 'info' });
          setTimeout(async () => {
            const ok = await confirmDialog('Bu bir kayma mıydı? İstersen sayacı yeniden başlatalım. En iyi serin ve geçmişin korunur.', {
              title: 'Sayaç sıfırlansın mı?', okLabel: 'Evet, yeniden başlat', cancelLabel: 'Hayır' });
            if (ok) relapseDialog(get(hb.id), { onDone: () => onSaved?.(c) });
            else onSaved?.(c);
          }, 250);
        }
      } },
    ],
  });
}

/** "Kaydım" — suçlamayan, destekleyici kayma kaydı */
export function relapseDialog(hb, { onDone } = {}) {
  if (!hb) return;
  const s = stats(hb);
  const when = h('input', { class: 'input mono', type: 'datetime-local', value: toLocalInput(Date.now()), max: toLocalInput(Date.now()), min: toLocalInput(hb.quitAt) });
  const note = h('textarea', { class: 'input', rows: 3, maxlength: 300, placeholder: 'Ne oldu? Bir dahaki sefere neyi farklı yapabilirsin?' });
  const body = h('div', { class: 'hb-form' },
    h('div', { class: 'hb-relapse-msg' },
      icon('heart'),
      h('div', null,
        h('p', { class: 'hb-lead' }, 'Sorun değil. Kaymak, bırakma sürecinin normal bir parçası.'),
        h('p', { class: 'muted' }, 'Çoğu kişi kalıcı olarak bırakmadan önce birkaç kez dener. Önemli olan şimdi yeniden başlaman.'))),
    h('div', { class: 'hb-relapse-keep' },
      h('div', null, h('div', { class: 'hb-label' }, 'Bu seri'), h('b', null, span(s.ms))),
      h('div', null, h('div', { class: 'hb-label' }, 'En iyi serin'), h('b', null, span(s.best))),
      h('div', null, h('div', { class: 'hb-label' }, 'Deneme'), h('b', null, String(s.attempts)))),
    h('p', { class: 'muted small', style: 'margin:0 0 12px' }, 'Bu seride kazandıkların silinmez: en iyi serin, rozetlerin ve geçmişin korunur.'),
    h('label', { class: 'field' }, h('span', { class: 'hb-label' }, 'Ne zaman?'), when),
    h('label', { class: 'field' }, h('span', { class: 'hb-label' }, 'Not (isteğe bağlı)'), note));

  modal({
    title: 'Kaydım, yeniden başlıyorum',
    body,
    actions: [
      { label: 'Vazgeç', class: 'ghost' },
      { label: 'Yeniden başlat', class: 'primary', icon: 'refresh', onClick: () => {
        const ts = fromLocalInput(when.value) ?? Date.now();
        if (ts > Date.now() + 60e3) { toast('Gelecekte bir zaman seçilemez', { type: 'error' }); return false; }
        recordRelapse(hb.id, { ts, note: note.value });
        haptic([20, 40, 20]);
        toast(`Yeni bir başlangıç. Deneme ${s.attempts + 1} başladı — sen yapabilirsin.`, { type: 'success', ms: 3600 });
        onDone?.();
      } },
    ],
  });
}
