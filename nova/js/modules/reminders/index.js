// Hatırlatıcılar sayfası: izin durumu, hatırlatıcı kartları, düzenleme sayfaları, sessiz saatler, son gönderilenler.
import { h, icon, mount, toast, modal, toggle, stepper, backButton, pageHeader, sectionTitle, emptyState, fmt, haptic } from '../../core/ui.js';
import { subscribe, load } from '../../core/store.js';
import * as R from './data.js';

// ---------------------------------------------------------------- Uygulama içi bildirim kartı
let bannerWrap = null;
function showBanner(msg) {
  if (!bannerWrap) { bannerWrap = h('div', { class: 'rem-banner-wrap' }); document.body.appendChild(bannerWrap); }
  haptic([20, 40, 20]);
  const close = () => { b.classList.add('out'); setTimeout(() => b.remove(), 250); };
  const b = h('div', { class: 'rem-banner', role: 'alert' },
    h('span', { class: 'li-icon' }, icon(msg.icon || 'clock')),
    h('div', { class: 'grow' }, h('div', { class: 'rem-banner-t' }, msg.title), h('div', { class: 'rem-banner-b' }, msg.body),
      h('div', { class: 'rem-banner-act' },
        msg.route && msg.route !== 'reminders' ? h('button', { class: 'btn primary sm', type: 'button', onClick: () => { close(); location.hash = '#/' + msg.route; } }, 'Aç') : null,
        h('button', { class: 'btn ghost sm', type: 'button', onClick: close }, 'Kapat'))));
  bannerWrap.appendChild(b);
  while (bannerWrap.children.length > 3) bannerWrap.firstChild.remove();
  setTimeout(close, 15000);
}

// ---------------------------------------------------------------- Ortak düzenleme parçaları
const timeInput = (value, onInput, label) => h('label', { class: 'field rem-field' }, h('span', null, label),
  h('input', { class: 'input', type: 'time', value, step: 60, onInput: e => onInput(e.target.value), onChange: e => onInput(e.target.value) }));

const toggleRow = (title, sub, checked, onChange) => h('div', { class: 'rem-trow' },
  h('div', { class: 'grow' }, h('div', { class: 'rem-trow-t' }, title), sub && h('div', { class: 'rem-trow-s' }, sub)),
  toggle(checked, onChange));

function weekdayChips(selected, onChange, { single = false } = {}) {
  const wrap = h('div', { class: 'rem-days', role: 'group', 'aria-label': 'Günler' });
  const paint = () => mount(wrap, R.WEEKDAYS.map(w => {
    const on = selected.includes(w.d);
    return h('button', { type: 'button', class: 'chip' + (on ? ' active' : ''), 'aria-pressed': String(on), 'aria-label': w.l, onClick: () => {
      if (single) selected.splice(0, selected.length, w.d);
      else if (on) selected.splice(selected.indexOf(w.d), 1);
      else selected.push(w.d);
      paint(); onChange?.(selected);
    } }, w.s);
  }));
  paint();
  return wrap;
}

const hint = text => h('p', { class: 'rem-hint' }, text);

// ---------------------------------------------------------------- Düzenleme sayfası (alt sayfa)
function editSheet(type) {
  const t = R.typeById(type);
  const s = R.getSettings();
  const d = structuredClone(s[type]);
  d.on = true; // kartı açıp ayarlamak, hatırlatıcıyı kullanmak istemek demek; kapatmak için anahtar sayfada duruyor
  const body = h('div', { class: 'rem-sheet' });
  const preview = h('p', { class: 'rem-preview' });
  const paintPreview = () => {
    const tmp = { ...s, [type]: { ...d, on: true } };
    preview.textContent = R.summaryLine(type, tmp);
  };

  const parts = [toggleRow('Hatırlatıcı açık', null, d.on, v => { d.on = v; })];
  switch (type) {
    case 'water': {
      parts.push(
        h('div', { class: 'grid-2' },
          timeInput(d.start, v => { d.start = v; paintPreview(); }, 'Başlangıç'),
          timeInput(d.end, v => { d.end = v; paintPreview(); }, 'Bitiş')),
        h('div', { class: 'rem-srow' }, h('div', { class: 'grow' }, h('div', { class: 'rem-trow-t' }, 'Kaç saatte bir'), h('div', { class: 'rem-trow-s' }, '1–6 saat')),
          stepper(d.every, { min: 1, max: 6, step: 1, onChange: v => { d.every = v; paintPreview(); } })),
        hint('Günlük su hedefine ulaştıysan hatırlatma gönderilmez.'));
      break;
    }
    case 'workout':
      parts.push(h('div', { class: 'rem-label' }, 'Günler'), weekdayChips(d.days, paintPreview),
        timeInput(d.time, v => { d.time = v; paintPreview(); }, 'Saat'),
        hint('O gün antrenman kaydettiysen hatırlatma gönderilmez.'));
      break;
    case 'meals':
      for (const m of R.MEAL_SLOTS) {
        const inp = h('input', { class: 'input rem-time-sm', type: 'time', value: d[m.id].time, 'aria-label': m.l + ' saati', disabled: !d[m.id].on,
          onInput: e => { d[m.id].time = e.target.value; paintPreview(); }, onChange: e => { d[m.id].time = e.target.value; paintPreview(); } });
        parts.push(h('div', { class: 'rem-meal' },
          toggle(d[m.id].on, v => { d[m.id].on = v; inp.disabled = !v; paintPreview(); }),
          h('span', { class: 'grow rem-trow-t' }, m.l), inp));
      }
      parts.push(hint('O öğünü zaten kaydettiysen hatırlatma gönderilmez.'));
      break;
    case 'steps':
      parts.push(timeInput(d.time, v => { d.time = v; paintPreview(); }, 'Akşam kontrol saati'),
        hint(`O saatte adım sayına bakılır. Hedefin (${fmt.n(R.stepGoal())} adım) tamamsa hatırlatma gönderilmez. Hedefi Profil sayfasından değiştirebilirsin.`));
      break;
    case 'weight': {
      const sel = [d.day];
      parts.push(h('div', { class: 'rem-label' }, 'Gün'), weekdayChips(sel, () => { d.day = sel[0]; paintPreview(); }, { single: true }),
        timeInput(d.time, v => { d.time = v; paintPreview(); }, 'Saat'),
        hint('Haftada bir, aynı gün ve saatte tartılmak değişimi daha doğru gösterir.'));
      break;
    }
    case 'habits': {
      const n = R.activeHabits().length;
      parts.push(timeInput(d.time, v => { d.time = v; paintPreview(); }, 'Her gün saat'),
        hint(n ? `Bıraktığın ${n} alışkanlık için kaç gündür temiz olduğunu hatırlatan kısa bir destek mesajı gelir.`
          : 'Şu an aktif bir alışkanlık takibin yok. Alışkanlık eklemeden bu hatırlatma gönderilmez.'),
        n ? null : h('a', { class: 'btn ghost block', href: '#/habits' }, icon('plus'), 'Alışkanlık ekle'));
      break;
    }
  }
  parts.push(h('div', { class: 'rem-preview-box' }, icon('clock', { size: 16 }), preview));
  mount(body, parts);
  paintPreview();

  modal({
    title: t.title,
    body,
    actions: [
      { label: 'Vazgeç', class: 'ghost' },
      { label: 'Kaydet', class: 'primary', onClick: () => {
        const err = validate(type, d);
        if (err) { toast(err, { type: 'error' }); return false; }
        R.setSettings(type, d);
        toast(d.on ? `${t.title} hatırlatıcısı kaydedildi` : `${t.title} hatırlatıcısı kapalı olarak kaydedildi`, { type: 'success' });
        if (d.on) permissionNudge();
      } },
    ],
  });
}

function validate(type, d) {
  const times = type === 'water' ? [d.start, d.end] : type === 'meals' ? R.MEAL_SLOTS.filter(m => d[m.id].on).map(m => d[m.id].time) : [d.time];
  if (times.some(x => !R.validTime(x))) return 'Saati tam gir (ör. 09:00)';
  if (type === 'water' && R.toMin(d.start) >= R.toMin(d.end)) return 'Bitiş saati başlangıçtan sonra olmalı';
  if (type === 'workout' && d.on && !d.days.length) return 'En az bir gün seç';
  if (type === 'meals' && d.on && !R.MEAL_SLOTS.some(m => d[m.id].on)) return 'En az bir öğün seç';
  return null;
}

function permissionNudge() {
  const p = R.permissionState();
  if (p === 'default') setTimeout(() => toast('Telefon bildirimi için sayfadaki "Bildirimlere izin ver" düğmesine dokun', { ms: 4200 }), 400);
}

// ---------------------------------------------------------------- Sayfa bölümleri
const PERM = {
  granted: { badge: 'Açık', cls: 'lime', text: 'Hatırlatmalar telefon bildirimi olarak gelir. Uygulama açıkken ekranın üstünde de görünür.' },
  default: { badge: 'Kapalı', cls: 'amber', text: 'Hatırlatmaların telefon bildirimi olarak gelmesi için izin ver. Sadece senin açtığın hatırlatmalar gönderilir; istediğin zaman kapatabilirsin.' },
  denied: { badge: 'Kapalı', cls: 'red', text: 'Bildirimler engellenmiş. Tarayıcı ayarlarından bu site için bildirimlere izin ver (adres çubuğundaki kilit simgesi › Bildirimler), sonra sayfayı yenile. O zamana kadar hatırlatmalar yalnız uygulama açıkken ekranda görünür.' },
  unsupported: { badge: 'Desteklenmiyor', cls: 'muted', text: 'Bu tarayıcı bildirim göstermiyor. Hatırlatmalar uygulama açıkken ekranda görünür. iPhone’da bildirim için uygulamayı ana ekrana ekle (Paylaş › Ana Ekrana Ekle).' },
};

function permissionCard(repaint) {
  const st = R.permissionState();
  const p = PERM[st] || PERM.unsupported;
  const ask = async () => {
    const r = await R.requestPermission();
    if (r === 'granted') toast('Bildirimler açıldı', { type: 'success' });
    else if (r === 'denied') toast('Bildirim izni verilmedi', { type: 'error' });
    repaint();
  };
  const test = async () => {
    const ok = await R.sendTest();
    toast(ok ? 'Test bildirimi gönderildi' : 'Bildirim izni yok: test mesajı ekranda gösterildi', { type: ok ? 'success' : 'info' });
  };
  return h('div', { class: 'panel rem-perm', dataset: { state: st } },
    h('div', { class: 'row' },
      h('span', { class: 'li-icon' }, icon('phone')),
      h('div', { class: 'grow' }, h('div', { class: 'rem-trow-t' }, 'Telefon bildirimleri'), h('span', { class: `badge ${p.cls} rem-perm-badge` }, p.badge))),
    h('p', { class: 'rem-p' }, p.text),
    h('div', { class: 'rem-btns' },
      st === 'default' ? h('button', { class: 'btn primary block', type: 'button', onClick: ask }, icon('check'), 'Bildirimlere izin ver') : null,
      st === 'denied' ? h('button', { class: 'btn ghost block', type: 'button', onClick: repaint }, icon('refresh'), 'Tekrar kontrol et') : null,
      h('button', { class: 'btn ghost block', type: 'button', onClick: test }, icon('sparkle'), 'Test bildirimi gönder')));
}

function heroCard(s) {
  const nx = R.nextUpcoming(new Date(), s);
  const n = R.enabledCount(s);
  const st = R.permissionState();
  return h('div', { class: 'panel hero rem-hero' },
    h('div', { class: 'rem-hero-l' }, icon('clock', { size: 15 }), 'Sıradaki'),
    nx ? h('div', { class: 'rem-hero-v' }, `${nx.title} · ${nx.time}`) : h('div', { class: 'rem-hero-v dim' }, n ? 'Bu hafta yok' : 'Açık hatırlatıcı yok'),
    h('div', { class: 'rem-hero-s' }, nx ? nx.when : (n ? 'Bugünkü hedeflerin tamam ya da saatler geçti.' : 'Aşağıdan bir hatırlatıcıyı aç.')),
    h('div', { class: 'info-strip' },
      h('div', null, h('div', { class: 'is-label' }, icon('list'), 'Açık'), h('div', { class: 'is-value' }, `${n} / ${R.TYPES.length}`)),
      h('div', null, h('div', { class: 'is-label' }, icon('info'), 'Bildirim'), h('div', { class: 'is-value' }, (PERM[st] || PERM.unsupported).badge))));
}

function reminderList(s) {
  return h('div', { class: 'panel tight rem-list' }, R.TYPES.map(t => {
    const on = s[t.id].on;
    const tg = h('div', { class: 'rem-tg', onClick: e => e.stopPropagation() }, toggle(on, v => {
      if (v && t.id === 'workout' && !s.workout.days.length) { toast('Önce gün seç', { type: 'error' }); editSheet(t.id); return; }
      R.setSettings(t.id, { on: v });
      toast(v ? `${t.title} hatırlatıcısı açıldı` : `${t.title} hatırlatıcısı kapatıldı`, { type: v ? 'success' : 'info' });
      if (v) permissionNudge();
    }));
    tg.querySelector('input').setAttribute('aria-label', `${t.title} hatırlatıcısı`);
    return h('div', { class: 'list-item click rem-item' + (on ? ' on' : ''), role: 'button', tabindex: '0', dataset: { type: t.id },
      'aria-label': `${t.title} ayarları`,
      onClick: () => editSheet(t.id), onKeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editSheet(t.id); } } },
      h('span', { class: 'li-icon' }, icon(t.icon)),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, t.title), h('div', { class: 'rem-sum' }, R.summaryLine(t.id, s))),
      tg);
  }));
}

function quietCard(s) {
  const q = s.quiet;
  const setQ = patch => { R.setSettings('quiet', patch); toast('Sessiz saatler kaydedildi', { type: 'success' }); };
  const onTime = key => e => {
    const v = e.target.value;
    if (!R.validTime(v)) return;
    if (v === R.getSettings().quiet[key]) return;
    setQ({ [key]: v });
  };
  return h('div', { class: 'panel rem-quiet' + (q.on ? '' : ' off') },
    toggleRow('Sessiz saatler', 'Bu saatler arasında hiçbir hatırlatma gönderilmez.', q.on, v => setQ({ on: v })),
    h('div', { class: 'grid-2 rem-quiet-times' },
      h('label', { class: 'field rem-field' }, h('span', null, 'Başlangıç'), h('input', { class: 'input', type: 'time', value: q.start, disabled: !q.on, onChange: onTime('start') })),
      h('label', { class: 'field rem-field' }, h('span', null, 'Bitiş'), h('input', { class: 'input', type: 'time', value: q.end, disabled: !q.on, onChange: onTime('end') }))));
}

const LOG_ICON = { test: 'sparkle' };
function logCard() {
  const list = (load(R.KL, []) || []).slice(0, 5);
  if (!list.length) return h('div', { class: 'panel' }, emptyState('clock', 'Henüz hatırlatma yok', 'Gönderilen hatırlatmalar burada listelenir. Nasıl göründüğünü görmek için bir test gönder.',
    h('button', { class: 'btn ghost', type: 'button', onClick: async () => { const ok = await R.sendTest(); toast(ok ? 'Test bildirimi gönderildi' : 'Test mesajı ekranda gösterildi', { type: ok ? 'success' : 'info' }); } }, icon('sparkle'), 'Test bildirimi gönder')));
  return h('div', { class: 'panel tight rem-log' }, list.map(x => h('div', { class: 'list-item' },
    h('span', { class: 'li-icon' }, icon(LOG_ICON[x.type] || R.typeById(x.type)?.icon || 'clock')),
    h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, x.title), h('div', { class: 'li-sub' }, x.body)),
    h('div', { class: 'li-end rem-log-t' }, fmt.time(x.ts)))));
}

function infoCard() {
  return h('div', { class: 'panel rem-info' },
    h('div', { class: 'panel-title' }, icon('info', { size: 18 }), 'Nasıl çalışır?'),
    h('ul', { class: 'rem-ul' },
      h('li', null, 'Web sürümünde hatırlatmalar, uygulama açıkken ya da kısa süre önce arka plana alındıysa çalışır. Telefon uygulamayı tamamen kapatırsa bildirim gelmeyebilir.'),
      h('li', null, 'Kaçırdığın bir hatırlatma, 30 dakika içinde uygulamayı açarsan bir kez gösterilir.'),
      h('li', null, 'Hedefini tamamladıysan (su, adım) ya da kaydı girdiysen (öğün, antrenman) hatırlatma gönderilmez.'),
      h('li', null, 'Her zaman tam saatinde gelen hatırlatmalar için ileride çıkacak mobil uygulama sürümü gerekecek.')));
}

// ---------------------------------------------------------------- Modül
export default {
  id: 'reminders',
  title: 'Hatırlatıcılar',
  navLabel: 'Hatırlat',
  icon: 'clock',
  css: true,
  init() {
    R.onForeground(showBanner);
    R.startScheduler();
  },
  render(el) {
    const header = h('div', null, backButton(), pageHeader('Hatırlatıcılar', 'Su, öğün ve antrenmanı unutma'));
    const hero = h('div');
    const rest = h('div');
    const paintHero = () => mount(hero, heroCard(R.getSettings()));
    const paint = () => {
      const s = R.getSettings();
      paintHero();
      mount(rest,
        permissionCard(paint),
        sectionTitle('Hatırlatıcılar'),
        reminderList(s),
        sectionTitle('Sessiz saatler'),
        quietCard(s),
        sectionTitle('Son hatırlatmalar'),
        logCard(),
        infoCard());
    };
    paint();
    el.append(header, hero, rest);
    const offs = [R.KS, R.KL, 'habits', 'profile'].map(k => subscribe(k, paint));
    offs.push(...['nutrition', 'steps', 'workouts', R.KF].map(k => subscribe(k, paintHero)));
    const iv = setInterval(paintHero, R.TICK_MS);
    const onVis = () => { if (document.visibilityState === 'visible') paint(); };
    document.addEventListener('visibilitychange', onVis);
    let permStatus = null;
    navigator.permissions?.query?.({ name: 'notifications' }).then(ps => { permStatus = ps; ps.onchange = paint; }).catch(() => {});
    return () => {
      offs.forEach(f => f());
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      if (permStatus) permStatus.onchange = null;
    };
  },
};
