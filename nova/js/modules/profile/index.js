// Profil: biyometri, hedefler, kilo takibi, rütbe, yedekleme ve kurulum.
import { h, icon, fmt, toast, sectionTitle, pageHeader, progressBar, sparkline, confirmDialog, promptNumber, modal } from '../../core/ui.js';
import { load, update, todayKey, exportAll, importAll, clearAll } from '../../core/store.js';
import { getProfile, saveProfile, ACTIVITY_LEVELS, GOALS, bmr, tdee, calorieTarget, macroTargets, waterTarget, bmi, bmiLabel } from '../../core/profile.js';
import { levelInfo, getXP, RANKS, awardXP } from '../../core/xp.js';
import { refresh } from '../../core/router.js';

let installEvt = null;

function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', null, label), input, hint && h('small', { class: 'muted' }, hint));
}

function numInput(value, { min, max, step = 1, unit } = {}) {
  return h('input', { class: 'input mono', type: 'number', inputmode: 'decimal', value, min, max, step, 'aria-label': unit || '' });
}

function select(options, value) {
  return h('select', { class: 'select' }, options.map(o => h('option', { value: o.id, selected: o.id === value }, o.label)));
}

function installGuide() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return h('p', { class: 'small c-lime', style: 'margin:0' }, '✓ Uygulama telefonunun ana ekranında yüklü.');
  return h('div', { class: 'col' },
    installEvt && h('button', { class: 'btn primary block', onClick: async () => {
      installEvt.prompt();
      const r = await installEvt.userChoice.catch(() => null);
      if (r?.outcome === 'accepted') { toast('Uygulama yükleniyor', { type: 'success' }); installEvt = null; }
    } }, icon('download'), 'Telefona yükle'),
    h('ol', { class: 'small muted', style: 'margin:0;padding-left:18px;line-height:1.6' },
      ios
        ? [h('li', null, 'Safari’de alttaki ', h('b', null, 'Paylaş'), ' simgesine dokun'), h('li', null, h('b', null, 'Ana Ekrana Ekle'), ' seçeneğini seç'), h('li', null, 'Artık normal bir uygulama gibi tam ekran açılır')]
        : [h('li', null, 'Chrome’da sağ üstteki ', h('b', null, '⋮'), ' menüsüne dokun'), h('li', null, h('b', null, 'Uygulamayı yükle'), ' / ', h('b', null, 'Ana ekrana ekle'), ' seç'), h('li', null, 'Ana ekranından açılır, internetsiz de çalışır')]));
}

export default {
  id: 'profile',
  title: 'Profil',
  navLabel: 'Profil',
  icon: 'user',
  css: true,

  init() {
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  },

  render(el) {
    const p = getProfile();
    const lv = levelInfo();
    const weights = load('weight', []);

    const f = {
      name: h('input', { class: 'input', value: p.name, maxlength: 24 }),
      sex: select([{ id: 'male', label: 'Erkek' }, { id: 'female', label: 'Kadın' }], p.sex),
      age: numInput(p.age, { min: 12, max: 100 }),
      heightCm: numInput(p.heightCm, { min: 120, max: 230 }),
      weightKg: numInput(p.weightKg, { min: 30, max: 300, step: 0.1 }),
      targetWeightKg: numInput(p.targetWeightKg, { min: 30, max: 300, step: 0.1 }),
      activity: select(ACTIVITY_LEVELS, p.activity),
      goal: select(GOALS, p.goal),
      stepGoal: numInput(p.stepGoal, { min: 1000, max: 50000, step: 500 }),
      kcalOverride: numInput(p.kcalOverride ?? '', { min: 1000, max: 6000, step: 10 }),
      waterGoalMl: numInput(p.waterGoalMl ?? '', { min: 500, max: 6000, step: 50 }),
    };
    f.kcalOverride.placeholder = 'Otomatik';
    f.name.placeholder = 'Örn. Berkay';
    f.waterGoalMl.placeholder = 'Otomatik';

    const calc = h('div');
    const readForm = () => {
      const n = (inp, dflt) => { const v = parseFloat(String(inp.value).replace(',', '.')); return Number.isFinite(v) ? v : dflt; };
      return {
        name: f.name.value.trim(), sex: f.sex.value, age: n(f.age, p.age), heightCm: n(f.heightCm, p.heightCm),
        weightKg: n(f.weightKg, p.weightKg), targetWeightKg: n(f.targetWeightKg, p.targetWeightKg), activity: f.activity.value, goal: f.goal.value,
        stepGoal: Math.round(n(f.stepGoal, p.stepGoal)), kcalOverride: n(f.kcalOverride, null), waterGoalMl: n(f.waterGoalMl, null),
      };
    };
    const paintCalc = () => {
      const q = { ...p, ...readForm() };
      const m = macroTargets(q);
      const b = bmi(q);
      calc.replaceChildren(
        h('div', { class: 'grid-3' },
          h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, fmt.n(bmr(q))), h('div', { class: 'stat-label' }, 'Dinlenirken (kcal)')),
          h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, fmt.n(tdee(q))), h('div', { class: 'stat-label' }, 'Günlük harcama')),
          h('div', { class: 'stat' }, h('div', { class: 'stat-value c-cyan' }, fmt.n(calorieTarget(q))), h('div', { class: 'stat-label' }, 'Kalori hedefi'))),
        h('div', { class: 'divider' }),
        h('div', { class: 'grid-4 small' },
          h('div', null, h('div', { class: 'muted small' }, 'Protein'), h('b', { class: 'mono' }, m.protein + ' g')),
          h('div', null, h('div', { class: 'muted small' }, 'Karb.'), h('b', { class: 'mono' }, m.carbs + ' g')),
          h('div', null, h('div', { class: 'muted small' }, 'Yağ'), h('b', { class: 'mono' }, m.fat + ' g')),
          h('div', null, h('div', { class: 'muted small' }, 'Su'), h('b', { class: 'mono' }, fmt.n(waterTarget(q) / 1000, 1) + ' L'))),
        h('div', { class: 'row between mt small' },
          h('span', { class: 'muted' }, 'Vücut kitle indeksi'),
          h('span', null, h('b', { class: 'mono' }, fmt.n(b, 1)), ' · ', h('span', { class: b >= 18.5 && b < 25 ? 'c-lime' : 'c-amber' }, bmiLabel(b)))));
    };
    Object.values(f).forEach(inp => inp.addEventListener('input', paintCalc));
    paintCalc();

    const save = () => {
      const data = readForm();
      const first = !p.onboarded;
      saveProfile({ ...data, onboarded: true });
      if (Math.abs(data.weightKg - p.weightKg) > 0.01) {
        update('weight', list => [...list.filter(w => w.date !== todayKey()), { date: todayKey(), kg: data.weightKg }].sort((a, b) => a.date.localeCompare(b.date)), []);
      }
      toast('Profil kaydedildi', { type: 'success' });
      if (first) awardXP(100, 'Profil tamamlandı', { once: 'profile-onboard' });
      refresh();
    };

    const logWeight = async () => {
      const kg = await promptNumber({ title: 'Kilo kaydı', label: 'Bugünkü kilon', unit: 'kg', value: p.weightKg, min: 30, max: 300, step: 0.1 });
      if (kg == null) return;
      update('weight', list => [...list.filter(w => w.date !== todayKey()), { date: todayKey(), kg }].sort((a, b) => a.date.localeCompare(b.date)), []);
      saveProfile({ weightKg: kg });
      awardXP(10, 'Kilo kaydı', { once: 'weight-' + todayKey() });
      refresh();
    };

    const doExport = () => {
      const blob = new Blob([JSON.stringify(exportAll(), null, 1)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `nova-fit-yedek-${todayKey()}.json` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Yedek indirildi', { type: 'success' });
    };
    const fileInp = h('input', { type: 'file', accept: 'application/json,.json', class: 'hide', onChange: async e => {
      const file = e.target.files?.[0]; if (!file) return;
      try { importAll(JSON.parse(await file.text())); toast('Yedek geri yüklendi', { type: 'success' }); setTimeout(() => location.reload(), 600); }
      catch (err) { toast(err.message || 'Dosya okunamadı', { type: 'error' }); }
    } });
    const doReset = async () => {
      if (!await confirmDialog('Tüm adım, koşu, antrenman, beslenme ve alışkanlık verilerin bu cihazdan silinecek. Bu işlem geri alınamaz.', { title: 'Tüm verileri sil', okLabel: 'Hepsini sil', danger: true })) return;
      clearAll(); location.hash = '#/home'; location.reload();
    };

    const showRanks = () => modal({ title: 'Seviyeler', body: h('div', { class: 'list' }, RANKS.map(r =>
      h('div', { class: 'list-item' }, h('span', { class: 'li-icon', style: { color: r.color } }, icon('star')),
        h('div', { class: 'li-main' }, h('div', { class: 'li-title', style: { color: r.color } }, r.name), h('div', { class: 'li-sub' }, `Seviye ${r.level}+`)),
        lv.level >= r.level ? h('span', { class: 'c-lime' }, icon('check', { size: 18 })) : h('span', { class: 'dim' }, icon('lock', { size: 18 }))))) });

    const wVals = weights.slice(-30).map(w => w.kg);
    const wDelta = weights.length > 1 ? weights.at(-1).kg - weights[0].kg : 0;

    el.append(
      pageHeader('Profil', 'Bilgilerin, hedeflerin ve ayarlar'),

      h('div', { class: 'panel prof-rank' },
        h('div', { class: 'row' },
          h('div', { class: 'prof-avatar' }, (p.name || 'P').slice(0, 1).toUpperCase()),
          h('div', { class: 'grow' },
            h('div', { class: 'li-title' }, p.name || 'Adını profilde yazabilirsin'),
            h('div', { class: 'small', style: { color: lv.rank.color } }, `${lv.rank.name} · Seviye ${lv.level}`),
            h('div', { class: 'mt' }, progressBar(lv.progress, 1, { color: 'var(--amber)' })),
            h('div', { class: 'small muted mt' }, `${fmt.n(lv.total)} puan · sonraki seviye: ${fmt.n(lv.next)} puan`)),
          h('button', { class: 'btn ghost icon sm', 'aria-label': 'Seviyeleri gör', onClick: showRanks }, icon('trophy')))),

      sectionTitle('Kişisel bilgiler'),
      h('div', { class: 'panel' },
        h('div', { class: 'grid-2' }, field('Adın', f.name), field('Cinsiyet', f.sex)),
        h('div', { class: 'grid-3' }, field('Yaş', f.age), field('Boy (cm)', f.heightCm), field('Kilo (kg)', f.weightKg)),
        field('Aktivite seviyesi', f.activity),
        field('Hedef', f.goal),
        h('div', { class: 'grid-2' }, field('Hedef kilo (kg)', f.targetWeightKg), field('Günlük adım hedefi', f.stepGoal)),
        h('div', { class: 'grid-2' }, field('Kalori hedefi (elle)', f.kcalOverride), field('Su hedefi (ml)', f.waterGoalMl)),
        h('div', { class: 'panel tight', style: 'background:rgba(0,0,0,.25)' }, h('div', { class: 'panel-title' }, icon('target', { size: 16 }), 'Sana göre hesaplanan hedefler'), calc),
        h('button', { class: 'btn primary block mt', onClick: save }, icon('check'), 'Kaydet')),

      sectionTitle('Kilo takibi', h('button', { class: 'btn sm', onClick: logWeight }, icon('plus'), 'Kilo gir')),
      h('div', { class: 'panel' },
        weights.length
          ? h('div', null,
              h('div', { class: 'row between' },
                h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, fmt.n(weights.at(-1).kg, 1), h('span', { class: 'stat-unit' }, 'kg')), h('div', { class: 'stat-label' }, 'Son tartı')),
                h('div', { class: 'stat', style: 'align-items:flex-end' }, h('div', { class: 'stat-value ' + (wDelta <= 0 ? 'c-lime' : 'c-amber') }, (wDelta > 0 ? '+' : '') + fmt.n(wDelta, 1), h('span', { class: 'stat-unit' }, 'kg')), h('div', { class: 'stat-label' }, 'Toplam değişim'))),
              h('div', { class: 'mt prof-spark' }, sparkline(wVals.length > 1 ? wVals : [wVals[0], wVals[0]], { width: 320, height: 70, color: 'var(--cyan)' })),
              h('div', { class: 'row between tiny muted mono' }, h('span', null, fmt.date(weights.at(-Math.min(30, weights.length)).date, 'short')), h('span', null, 'Hedef ' + fmt.n(p.targetWeightKg, 1) + ' kg')))
          : h('p', { class: 'muted small', style: 'margin:0' }, 'Henüz kilo kaydın yok. Sağ üstteki “Kilo gir” ile ilk tartını ekle.')),

      sectionTitle('Telefona yükle'),
      h('div', { class: 'panel' }, installGuide()),

      sectionTitle('Yedekleme'),
      h('div', { class: 'panel' },
        h('p', { class: 'small muted', style: 'margin-top:0' }, 'Tüm veriler yalnızca bu cihazda saklanır. Telefon değiştirirken yedeği indirip yeni cihazda geri yükle.'),
        h('div', { class: 'grid-2' },
          h('button', { class: 'btn', onClick: doExport }, icon('download'), 'Yedekle'),
          h('button', { class: 'btn', onClick: () => fileInp.click() }, icon('upload'), 'Geri yükle')),
        fileInp,
        h('button', { class: 'btn danger block mt', onClick: doReset }, icon('trash'), 'Tüm verileri sil')),

      h('p', { class: 'center tiny dim mono', style: 'margin-top:24px' }, 'NOVA Fit · sürüm 1.0'),
      h('p', { class: 'center tiny dim', style: 'margin-top:0' }, 'Sağlık bilgileri genel amaçlıdır, tıbbi tavsiye yerine geçmez.'),
    );
  },
};
