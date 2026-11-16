// Yeni alışkanlık / düzenleme sihirbazı (3 adım)
import { h, icon, mount, fmt, toast, stepper } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { TEMPLATES, tpl, CUSTOM_ICONS, REASON_SUGGEST, HOUR, DAY, WEEK, MONTH, get, create, mutate, toLocalInput, fromLocalInput, checkAchievements } from './data.js';

const num = v => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };

function initialState(type, existing) {
  if (existing) {
    const t = tpl(existing.type);
    return {
      type: existing.type, name: existing.name, icon: existing.icon, unitName: existing.unitName, quitAt: existing.quitAt,
      unitsPerDay: existing.unitsPerDay, costMode: existing.costMode || 'day', packPrice: existing.packPrice ?? t.packPrice ?? 100,
      perPack: existing.perPack ?? 20, costPerUnit: existing.costPerUnit ?? 0, costDay: existing.costPerDay || 0,
      timePerUnit: existing.timePerUnit || 0, reasons: [...(existing.reasons || [])], motivation: existing.motivation || '',
    };
  }
  const t = tpl(type);
  return {
    type: t.type, name: t.custom ? '' : t.name, icon: t.icon, unitName: t.unitName, quitAt: Date.now(),
    unitsPerDay: t.unitsPerDay, costMode: t.costMode || 'unit', packPrice: t.packPrice ?? 100, perPack: t.perPack ?? 20,
    costPerUnit: t.costPerUnit ?? 0, costDay: 0, timePerUnit: t.timePerUnit || 0, reasons: [], motivation: '',
  };
}

const costPerDay = st => st.costMode === 'pack' ? st.unitsPerDay * (st.packPrice / Math.max(1, st.perPack))
  : st.costMode === 'unit' ? st.unitsPerDay * st.costPerUnit : st.costDay;

/** params: { type?, editId? } */
export function renderWizard(el, { type = null, editId = null } = {}) {
  const existing = editId ? get(editId) : null;
  if (editId && !existing) { go('habits'); return; }
  let step = existing || type ? 2 : 1;
  let st = (existing || type) ? initialState(type, existing) : null;
  const total = 3;

  const back = () => {
    if (step === 1 || (existing && step === 2) || (!existing && type && step === 2 && !st._picked)) {
      go(existing ? `habits/${existing.id}` : 'habits');
    } else { step--; draw(); }
  };

  function header() {
    return h('div', { class: 'hb-topbar' },
      h('button', { class: 'back-btn', type: 'button', onClick: back, 'aria-label': 'Geri' }, icon('left'), 'Geri'),
      h('div', { class: 'grow' }),
      h('span', { class: 'hb-stepnum' }, `Adım ${step} / ${total}`));
  }

  function stepDots() {
    return h('div', { class: 'hb-steps', 'aria-hidden': 'true' }, [1, 2, 3].map(i => h('i', { class: i < step ? 'done' : i === step ? 'cur' : '' })));
  }

  // ---------- Adım 1: şablon seçimi
  function step1() {
    return [
      h('h1', { class: 'hb-h1' }, 'Neyi bırakıyorsun?'),
      h('p', { class: 'hb-p muted' }, 'Bir alışkanlık seç. Sonraki adımda bilgilerini gireceksin.'),
      h('div', { class: 'hb-tplgrid' }, TEMPLATES.map(t => h('button', {
        class: 'hb-tpl', type: 'button',
        onClick: () => { st = initialState(t.type); st._picked = true; step = 2; draw(); },
      }, h('span', { class: 'hb-tpl-ic' }, icon(t.icon)), h('span', { class: 'hb-tpl-name' }, t.custom ? 'Diğer (özel)' : t.name)))),
    ];
  }

  // ---------- Adım 2: bilgiler
  function step2() {
    const t = tpl(st.type);
    const costOut = h('div', { class: 'hb-costout' });
    const paintCost = () => {
      const d = costPerDay(st);
      mount(costOut,
        h('div', null, h('span', { class: 'muted' }, 'Günlük'), h('b', null, fmt.money(d))),
        h('div', null, h('span', { class: 'muted' }, 'Aylık'), h('b', null, fmt.money(d * 30))),
        h('div', null, h('span', { class: 'muted' }, 'Yıllık'), h('b', { class: 'c-lime' }, fmt.money(d * 365))));
    };
    const numInput = (val, onInput, { placeholder = '', label } = {}) => h('input', {
      class: 'input mono', type: 'number', inputmode: 'decimal', min: 0, step: 'any', value: val, placeholder, 'aria-label': label,
      onInput: e => { onInput(num(e.target.value)); paintCost(); },
    });

    // Bırakma zamanı
    const when = h('input', { class: 'input mono', type: 'datetime-local', value: toLocalInput(st.quitAt), max: toLocalInput(Date.now() + 60e3),
      onChange: e => { const v = fromLocalInput(e.target.value); if (v) st.quitAt = v; } });
    const quick = [['Şimdi', 0], ['1 saat önce', HOUR], ['Dün', DAY], ['1 hafta önce', WEEK], ['1 ay önce', MONTH]];
    const quickChips = h('div', { class: 'hb-chipwrap' }, quick.map(([l, off]) => h('button', {
      type: 'button', class: 'chip', onClick: () => { st.quitAt = Date.now() - off; when.value = toLocalInput(st.quitAt); },
    }, l)));

    // Özel: ikon seçimi
    let iconWrap = null;
    if (t.custom) {
      iconWrap = h('div', { class: 'hb-iconpick', role: 'radiogroup', 'aria-label': 'Simge' });
      const drawIcons = () => mount(iconWrap, CUSTOM_ICONS.map(n => h('button', {
        type: 'button', class: 'hb-iconbtn' + (st.icon === n ? ' on' : ''), 'aria-label': 'Simge: ' + n, role: 'radio', 'aria-checked': String(st.icon === n),
        onClick: () => { st.icon = n; drawIcons(); },
      }, icon(n))));
      drawIcons();
    }

    // Maliyet
    const costBox = h('div');
    const drawCost = () => {
      const modes = st.type === 'smoking'
        ? [['pack', 'Paket fiyatı'], ['day', 'Günlük toplam']]
        : [['unit', `${st.unitName || 'birim'} başına`], ['day', 'Günlük toplam']];
      if (!modes.some(m => m[0] === st.costMode)) st.costMode = modes[0][0];
      const seg = h('div', { class: 'hb-seg sm' }, modes.map(([id, l]) => h('button', {
        type: 'button', class: 'hb-seg-btn' + (st.costMode === id ? ' on' : ''), onClick: () => { st.costMode = id; drawCost(); },
      }, l)));
      let fields;
      if (st.costMode === 'pack') {
        fields = h('div', { class: 'grid-2' },
          h('label', { class: 'field' }, h('span', { class: 'hb-label' }, 'Paket fiyatı (₺)'), numInput(st.packPrice, v => { st.packPrice = v; }, { label: 'Paket fiyatı' })),
          h('label', { class: 'field' }, h('span', { class: 'hb-label' }, 'Paketteki adet'), numInput(st.perPack, v => { st.perPack = v || 20; }, { label: 'Paketteki adet' })));
      } else if (st.costMode === 'unit') {
        fields = h('label', { class: 'field' }, h('span', { class: 'hb-label' }, `1 ${st.unitName || 'birim'} kaç ₺?`), numInput(st.costPerUnit, v => { st.costPerUnit = v; }, { label: 'Birim fiyatı' }));
      } else {
        fields = h('label', { class: 'field' }, h('span', { class: 'hb-label' }, 'Günde ortalama harcama (₺)'), numInput(st.costDay, v => { st.costDay = v; }, { label: 'Günlük harcama' }));
      }
      mount(costBox, seg, fields, costOut);
      paintCost();
    };
    drawCost();

    const unitsLabel = h('span', { class: 'hb-label' });
    const paintUnitsLabel = () => { unitsLabel.textContent = st.unitName === 'dk' ? 'Günde kaç dakika?' : `Günde kaç ${st.unitName || 'kez'}?`; };
    paintUnitsLabel();

    const nameInput = h('input', { class: 'input', type: 'text', value: st.name, maxlength: 40, placeholder: t.custom ? 'Örn. Gazlı içecek' : t.name,
      onInput: e => { st.name = e.target.value; } });

    return [
      h('div', { class: 'hb-wiz-hero' }, h('span', { class: 'hb-tpl-ic lg' }, icon(st.icon)),
        h('div', null, h('h1', { class: 'hb-h1' }, existing ? 'Bilgileri düzenle' : (t.custom ? 'Kendi alışkanlığın' : t.name)),
          t.hint && h('p', { class: 'muted hb-p', style: 'margin:0' }, t.hint))),
      h('div', { class: 'panel' },
        h('label', { class: 'field' }, h('span', { class: 'hb-label' }, 'Adı'), nameInput),
        iconWrap && h('div', { class: 'field' }, h('span', { class: 'hb-label' }, 'Simge'), iconWrap),
        t.custom && h('label', { class: 'field' }, h('span', { class: 'hb-label' }, 'Birim (ne sayıyorsun?)'),
          h('input', { class: 'input', type: 'text', value: st.unitName, maxlength: 16, placeholder: 'kez, bardak, adet…',
            onInput: e => { st.unitName = e.target.value.trim() || 'kez'; paintUnitsLabel(); } })),
        h('div', { class: 'field' }, h('span', { class: 'hb-label' }, 'Ne zaman bıraktın?'), when, quickChips,
          h('span', { class: 'muted small' }, 'Geçmiş bir tarih seçebilirsin. Sayaç o andan itibaren başlar.'))),
      h('div', { class: 'panel' },
        h('div', { class: 'field' }, unitsLabel,
          h('div', { class: 'row' }, stepper(st.unitsPerDay, { min: 0, max: 2000, step: t.step || 1, onChange: v => { st.unitsPerDay = v; paintCost(); } }),
            h('span', { class: 'muted' }, st.unitName === 'dk' ? 'dakika / gün' : `${st.unitName} / gün`))),
        (t.timeKind === 'time' && !t.fixedTime) && h('label', { class: 'field' },
          h('span', { class: 'hb-label' }, `Her seferinde ne kadar süre gidiyor? (dk)`),
          numInput(st.timePerUnit, v => { st.timePerUnit = v; }, { label: 'Süre (dakika)' })),
        h('div', { class: 'hb-label', style: 'margin-bottom:8px' }, 'Ne kadar harcıyordun?'),
        costBox),
    ];
  }

  // ---------- Adım 3: nedenler
  function step3() {
    const t = tpl(st.type);
    const listEl = h('div', { class: 'hb-reasonlist' });
    const sugg = h('div', { class: 'hb-chipwrap' });
    const drawReasons = () => {
      mount(listEl, st.reasons.length ? st.reasons.map((r, i) => h('div', { class: 'hb-reason-row' },
        icon('heart'), h('span', { class: 'grow' }, r),
        h('button', { class: 'btn ghost icon sm', type: 'button', 'aria-label': 'Nedeni sil', onClick: () => { st.reasons.splice(i, 1); drawReasons(); } }, icon('x'))))
        : h('p', { class: 'muted small', style: 'margin:4px 0' }, 'Henüz neden eklemedin. Aşağıdan seç ya da kendin yaz.'));
      mount(sugg, (REASON_SUGGEST[t.track] || REASON_SUGGEST.dopamine).map(r => h('button', {
        type: 'button', class: 'chip' + (st.reasons.includes(r) ? ' active' : ''),
        onClick: () => { st.reasons.includes(r) ? st.reasons.splice(st.reasons.indexOf(r), 1) : st.reasons.push(r); drawReasons(); },
      }, st.reasons.includes(r) ? icon('check') : icon('plus'), r)));
    };
    const inp = h('input', { class: 'input', type: 'text', maxlength: 80, placeholder: 'Kendi nedenini yaz…', enterkeyhint: 'done',
      onKeydown: e => { if (e.key === 'Enter') { e.preventDefault(); add(); } } });
    const add = () => { const v = inp.value.trim(); if (!v) return; if (!st.reasons.includes(v)) st.reasons.push(v); inp.value = ''; drawReasons(); };
    drawReasons();
    const mot = h('textarea', { class: 'input', rows: 3, maxlength: 280, placeholder: 'Örn. "Kızımla koşabilmek istiyorum."', onInput: e => { st.motivation = e.target.value; } });
    mot.value = st.motivation;
    return [
      h('h1', { class: 'hb-h1' }, 'Neden bırakıyorsun?'),
      h('p', { class: 'hb-p muted' }, 'İstek geldiğinde bu nedenleri sana hatırlatacağız.'),
      h('div', { class: 'panel' }, listEl,
        h('div', { class: 'row mt' }, h('div', { class: 'grow' }, inp), h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Nedeni ekle', onClick: add }, icon('plus'))),
        h('div', { class: 'hb-label', style: 'margin:14px 0 8px' }, 'Öneriler'), sugg),
      h('div', { class: 'panel' }, h('label', { class: 'field', style: 'margin:0' }, h('span', { class: 'hb-label' }, 'Kendine bir not (isteğe bağlı)'), mot)),
    ];
  }

  function validate2() {
    const t = tpl(st.type);
    st.name = (st.name || '').trim() || (t.custom ? '' : t.name);
    if (!st.name) { toast('Lütfen bir ad yaz', { type: 'error' }); return false; }
    if (st.quitAt > Date.now() + 60e3) { toast('Bırakma zamanı gelecekte olamaz', { type: 'error' }); return false; }
    return true;
  }

  function saveAll() {
    const t = tpl(st.type);
    const data = {
      type: st.type, name: st.name, icon: st.icon, unitName: st.unitName || t.unitName, quitAt: Math.min(st.quitAt, Date.now()),
      unitsPerDay: st.unitsPerDay, costPerDay: Math.round(costPerDay(st) * 100) / 100, costMode: st.costMode,
      packPrice: st.packPrice, perPack: st.perPack, costPerUnit: st.costPerUnit,
      timePerUnit: t.fixedTime ? t.timePerUnit : st.timePerUnit, reasons: st.reasons, motivation: st.motivation.trim(),
    };
    let id;
    if (existing) {
      mutate(existing.id, x => {
        // Bırakma zamanı yalnızca kayma yoksa düzenlenebilir mantıklıdır; kayma sonrası mevcut seri başlangıcını değiştirir.
        Object.assign(x, data);
        if (!x.relapses.length) x.firstQuitAt = x.quitAt;
      });
      id = existing.id;
      toast('Değişiklikler kaydedildi', { type: 'success' });
    } else {
      id = create(data).id;
      toast('Kaydedildi. Sayaç başladı!', { type: 'success' });
    }
    checkAchievements(id);
    go('habits/' + id);
  }

  function footer() {
    const next = () => {
      if (step === 2) { if (!validate2()) return; step = 3; draw(); }
      else if (step === 3) saveAll();
    };
    if (step === 1) return h('div', { class: 'hb-wiz-foot' }, h('button', { class: 'btn ghost block', onClick: back }, 'Vazgeç'));
    return h('div', { class: 'hb-wiz-foot' },
      h('button', { class: 'btn ghost', onClick: back }, icon('left'), 'Geri'),
      h('button', { class: 'btn primary grow', onClick: next }, step === 3 ? (existing ? 'Kaydet' : 'Başlat') : 'Devam', icon(step === 3 ? 'check' : 'right')));
  }

  function draw() {
    const body = step === 1 ? step1() : step === 2 ? step2() : step3();
    mount(el, h('div', { class: 'hb-wiz' }, header(), stepDots(), body, footer()));
    window.scrollTo(0, 0);
  }
  draw();
}
