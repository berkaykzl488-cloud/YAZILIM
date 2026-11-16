// Adım Sayar — telefon sensörüyle canlı adım sayımı, elle giriş, günlük liste, grafikler, seriler.
import { h, icon, mount, fmt, toast, modal, confirmDialog, promptNumber, tabs, toggle, sectionTitle, pageHeader, emptyState, haptic, clamp } from '../../core/ui.js';
import { subscribe, todayKey, addDays, lastNDays, parseKey } from '../../core/store.js';
import { getProfile, saveProfile } from '../../core/profile.js';
import { refresh } from '../../core/router.js';
import { pedometer, wakeLock } from './pedometer.js';
import * as D from './data.js';
import { heroRing, liveBars, waveform } from './charts.js';

const pad = n => String(n).padStart(2, '0');
const WD_LONG = k => parseKey(k).toLocaleDateString('tr-TR', { weekday: 'long' });
const MON_SHORT = k => parseKey(k).toLocaleDateString('tr-TR', { month: 'short' });

// ---------- Sensörü yönet (sekme değişse de çalışır) ----------
async function startSensor(gesture) {
  D.setSettings({ enabled: true });
  const ok = await pedometer.start({ gesture });
  if (ok && D.getSettings().wakeLock) wakeLock.set(true);
  return ok;
}
function stopSensor() {
  D.flush();
  pedometer.stop();
  wakeLock.set(false);
  D.setSettings({ enabled: false });
}

// ---------- Diyaloglar ----------
function openGoalEditor() {
  let goal = getProfile().stepGoal || 10000;
  const val = h('div', { class: 'stp-goal-val' });
  const paint = () => {
    val.textContent = fmt.n(goal);
    chips.querySelectorAll('button').forEach(b => b.classList.toggle('active', +b.dataset.v === goal));
  };
  const set = v => { goal = clamp(Math.round(v / 500) * 500, 1000, 50000); paint(); };
  const chips = h('div', { class: 'stp-presets' }, [5000, 7500, 10000, 12500, 15000].map(v =>
    h('button', { type: 'button', class: 'stp-chip', dataset: { v }, onClick: () => set(v) }, fmt.n(v))));
  const body = h('div', null,
    h('div', { class: 'stp-goal-edit' },
      h('button', { type: 'button', class: 'btn ghost icon', 'aria-label': '500 adım azalt', onClick: () => set(goal - 500) }, icon('minus')),
      h('div', { class: 'grow center' }, val, h('div', { class: 'muted small' }, 'adım / gün')),
      h('button', { type: 'button', class: 'btn ghost icon', 'aria-label': '500 adım artır', onClick: () => set(goal + 500) }, icon('plus'))),
    chips,
    h('p', { class: 'stp-note' }, 'Yetişkinler için günde 7.000–10.000 adım iyi bir başlangıçtır. Hedefe ulaştığın her gün +50 XP kazanırsın.'));
  paint();
  modal({
    title: 'Günlük adım hedefi', body,
    actions: [
      { label: 'Vazgeç', class: 'ghost' },
      { label: 'Kaydet', class: 'primary', onClick: () => {
        saveProfile({ stepGoal: goal });
        D.checkAwards(todayKey());
        toast('Hedef kaydedildi: ' + fmt.n(goal) + ' adım', { type: 'success' });
      } },
    ],
  });
}

async function addStepsDialog(date = todayKey()) {
  const v = await promptNumber({ title: 'Adım ekle', label: date === todayKey() ? 'Bugüne eklenecek adım' : fmt.date(date) + ' için eklenecek adım', unit: 'adım', min: 1, max: 100000, step: 1 });
  if (v == null) return;
  D.addManual(date, v);
  haptic();
  toast(`${fmt.n(Math.round(v))} adım eklendi`, { type: 'success' });
}

/** Bir günün toplamını düzenle / yeni gün ekle */
function openDayEditor(date = todayKey(), { pickDate = false } = {}) {
  const today = todayKey();
  let cur = date;
  const dateInp = h('input', { class: 'input', type: 'date', value: cur, max: today, 'aria-label': 'Tarih' });
  const totalInp = h('input', { class: 'input mono stp-big-input', type: 'number', inputmode: 'numeric', min: 0, max: 200000, step: 1, placeholder: 'ör. 8500' });
  const err = h('div', { class: 'stp-err hide', role: 'alert' });
  const breakdown = h('div', { class: 'stp-breakdown' });
  const fill = () => {
    const e = D.getEntry(cur);
    totalInp.value = e.total || '';
    mount(breakdown,
      h('div', null, h('span', null, 'Telefon sayımı'), h('b', null, fmt.n(e.sensor))),
      h('div', null, h('span', null, 'Düzeltme'), h('b', null, (e.manual > 0 ? '+' : '') + fmt.n(e.manual))),
      h('div', null, h('span', null, 'Toplam'), h('b', { class: 'c-cyan' }, fmt.n(e.total))));
  };
  dateInp.addEventListener('change', () => {
    if (!dateInp.value || dateInp.value > today) { dateInp.value = cur; return; }
    cur = dateInp.value; fill();
  });
  const quick = h('div', { class: 'stp-presets' }, [500, 1000, 2500, 5000].map(n =>
    h('button', { type: 'button', class: 'stp-chip', onClick: () => { totalInp.value = (parseInt(totalInp.value, 10) || 0) + n; err.classList.add('hide'); } }, '+' + fmt.n(n))));
  fill();
  const body = h('div', null,
    pickDate
      ? h('label', { class: 'field' }, h('span', null, 'Tarih'), dateInp)
      : h('div', { class: 'stp-edit-date' }, icon('calendar'), fmt.date(cur, 'full')),
    h('label', { class: 'field' }, h('span', null, 'Günün toplam adımı'), totalInp),
    quick, err, breakdown,
    h('p', { class: 'stp-note' }, 'Samsung Health, Google Fit ya da Apple Sağlık\'taki günlük sayıyı yazabilirsin. Telefonun bundan sonra saydığı adımlar bu sayının üstüne eklenir.'));
  const actions = [];
  if (!pickDate && D.getEntry(date).total > 0) actions.push({ label: 'Sil', class: 'danger', icon: 'trash', onClick: close => {
    confirmDialog(`${fmt.date(cur)} gününün tüm adım kaydı silinsin mi?`, { title: 'Kaydı sil', okLabel: 'Sil', danger: true }).then(ok => {
      if (!ok) return;
      D.clearDay(cur); close(); toast('Gün silindi', { type: 'success' });
    });
    return false;
  } });
  actions.push({ label: 'Vazgeç', class: 'ghost' });
  actions.push({ label: 'Kaydet', class: 'primary', onClick: () => {
    const raw = String(totalInp.value).trim();
    const v = Number(raw.replace(/\./g, '').replace(',', '.'));
    if (raw === '' || !Number.isFinite(v) || v < 0 || v > 200000) {
      err.textContent = '0 ile 200.000 arasında bir adım sayısı yaz.';
      err.classList.remove('hide');
      totalInp.focus();
      return false;
    }
    D.setTotal(cur, v);
    haptic();
    toast(`${fmt.date(cur, 'short')}: ${fmt.n(Math.round(v))} adım kaydedildi`, { type: 'success' });
  } });
  modal({ title: pickDate ? 'Başka gün ekle' : 'Günün adımları', body, actions });
  setTimeout(() => (pickDate ? dateInp : totalInp).focus(), 60);
}

// ---------- Sensör durum metinleri ----------
function sensorStatus() {
  const st = pedometer.state;
  switch (st) {
    case 'active': return pedometer.locked
      ? { cls: 'ok', text: 'Sayıyor', sub: 'Yürüyüşün algılandı, adımlar sayılıyor.' }
      : { cls: 'ready', text: 'Hazır', sub: 'Yürümeye başla. Ritmi yakalamak için ilk birkaç adım beklenir, sonra hepsi sayılır.' };
    case 'starting': return { cls: 'wait', text: 'Başlatılıyor…', sub: 'Hareket sensörüne bağlanılıyor.' };
    case 'needs-permission': return { cls: 'wait', text: 'İzin gerekli', sub: 'Adım sayımına devam etmek için düğmeye dokun ve hareket erişimine izin ver.' };
    case 'denied': return { cls: 'err', text: 'İzin verilmedi', sub: 'Tarayıcı ayarlarından bu site için hareket sensörü iznini açıp tekrar dene. iPhone\'da: Ayarlar › Safari › Hareket ve Yönelim Erişimi.' };
    case 'nosensor': return { cls: 'err', text: 'Hareket verisi gelmiyor', sub: 'Bu cihaz hareket sensörü sunmuyor olabilir (bilgisayar vb.). Adımlarını elle girebilirsin.' };
    case 'unsupported': return { cls: 'err', text: 'Desteklenmiyor', sub: 'Bu tarayıcı hareket sensörüne erişemiyor. Adımlarını elle girebilirsin.' };
    case 'insecure': return { cls: 'err', text: 'Güvenli bağlantı gerekli', sub: 'Sensör yalnızca HTTPS adresinde çalışır.' };
    default: return { cls: 'off', text: 'Kapalı', sub: 'Telefonun hareket sensörüyle adımlarını say. Uygulama açık kaldığı sürece sayar.' };
  }
}

// ---------- Sayfa ----------
function render(el) {
  const today = todayKey();
  const off = [];
  let all = D.rawAll();

  // --- Başlık ---
  const goalBtn = h('button', { type: 'button', class: 'btn ghost stp-goal-btn', 'aria-label': 'Günlük hedefi değiştir', onClick: openGoalEditor });
  const paintGoalBtn = () => mount(goalBtn, icon('target'), h('span', null, 'Hedef ' + fmt.n(D.goalFor(today))));

  // --- Büyük halka ---
  const numEl = h('div', { class: 'stp-num' }, '0');
  const goalEl = h('div', { class: 'stp-of' });
  const pctEl = h('div', { class: 'stp-pct' });
  const ring = heroRing({ size: 232, center: [h('div', { class: 'stp-today' }, 'Bugün'), numEl, goalEl, pctEl] });
  const kmEl = h('b'), kcalEl = h('b'), actEl = h('b');
  const remainEl = h('div', { class: 'stp-remain' });
  const metric = (ic, valEl, unit, label, cls) => h('div', { class: 'stp-metric ' + cls },
    icon(ic), h('div', null, h('div', { class: 'stp-metric-v' }, valEl, h('small', null, unit)), h('div', { class: 'stp-metric-l' }, label)));
  const hero = h('section', { class: 'panel stp-hero' },
    h('div', { class: 'stp-hero-ring' }, ring.el),
    remainEl,
    h('div', { class: 'stp-metrics' },
      metric('map', kmEl, 'km', 'Mesafe', 'c1'),
      metric('flame', kcalEl, 'kcal', 'Kalori', 'c2'),
      metric('timer', actEl, 'dk', 'Aktif süre', 'c3')));

  let lastTotal = null, countRaf = 0;
  function paintHero() {
    const e = D.getEntry(today, all), goal = D.goalFor(today, all);
    ring.update(e.total, goal);
    cancelAnimationFrame(countRaf);
    if (lastTotal == null && e.total > 0) {
      const t0 = performance.now(), to = e.total;
      const stepFn = now => {
        const p = clamp((now - t0) / 900, 0, 1);
        numEl.textContent = fmt.n(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) countRaf = requestAnimationFrame(stepFn);
      };
      countRaf = requestAnimationFrame(stepFn);
    } else numEl.textContent = fmt.n(e.total);
    if (lastTotal != null && lastTotal < goal && e.total >= goal) celebrate();
    lastTotal = e.total;
    goalEl.textContent = '/ ' + fmt.n(goal) + ' adım';
    pctEl.textContent = '%' + fmt.n(goal ? Math.round((e.total / goal) * 100) : 0);
    kmEl.textContent = fmt.km(D.distanceM(e.total));
    kcalEl.textContent = fmt.n(D.kcalOf(e.total));
    actEl.textContent = fmt.n(D.activeMinutes(e));
    const left = goal - e.total;
    mount(remainEl, left > 0
      ? [h('div', { class: 'stp-remain-main' }, 'Hedefe ', h('b', null, fmt.n(left) + ' adım'), ' kaldı'),
        h('div', { class: 'stp-remain-sub' }, `Yaklaşık ${fmt.n(Math.max(1, Math.round(left / 100)))} dakikalık yürüyüş`)]
      : [h('div', { class: 'stp-remain-main' }, icon('trophy', { size: 18 }), h('b', { class: 'c-lime' }, 'Bugünkü hedefe ulaştın!')),
        h('div', { class: 'stp-remain-sub' }, left < 0 ? `Hedefin ${fmt.n(-left)} adım üstündesin` : 'Tam isabet')]);
    remainEl.classList.toggle('done', left <= 0);
  }
  function celebrate() {
    hero.classList.remove('party'); void hero.offsetWidth; hero.classList.add('party');
    haptic([30, 60, 30]);
  }

  // --- Sensör paneli ---
  const dot = h('i', { class: 'stp-dot' });
  const stText = h('div', { class: 'stp-status-t' });
  const stSub = h('p', { class: 'stp-status-s' });
  const sensorBtn = h('button', { type: 'button', class: 'btn block' });
  const cadEl = h('b', null, '0'), sesEl = h('b', null, '0');
  const wave = waveform({ height: 60 });
  off.push(wave.destroy);
  const wakeRow = h('label', { class: 'stp-switch-row' },
    h('div', { class: 'grow' }, h('div', { class: 'stp-switch-t' }, 'Ekranı açık tut'),
      h('div', { class: 'stp-switch-s' }, wakeLock.supported ? 'Yürürken ekran kararmaz, sayım kesilmez.' : 'Bu tarayıcı desteklemiyor.')),
    toggle(D.getSettings().wakeLock && wakeLock.supported, async on => {
      D.setSettings({ wakeLock: on });
      if (!wakeLock.supported) { toast('Bu tarayıcı ekranı açık tutmayı desteklemiyor', { type: 'error' }); return; }
      if (on && pedometer.running) {
        const ok = await wakeLock.set(true);
        toast(ok ? 'Ekran açık kalacak' : 'Ekran açık tutulamadı', { type: ok ? 'success' : 'error' });
      } else { wakeLock.set(false); if (on) toast('Sayım başlayınca ekran açık kalacak', { type: 'success' }); }
    }));
  if (!wakeLock.supported) wakeRow.classList.add('disabled');
  const live = h('div', { class: 'stp-live' },
    h('div', { class: 'stp-live-stats' },
      h('div', null, cadEl, h('span', null, 'adım/dk'), h('small', null, 'Tempo')),
      h('div', null, sesEl, h('span', null, 'adım'), h('small', null, 'Bu oturumda'))),
    h('div', { class: 'stp-wave-wrap' }, wave.el, h('span', { class: 'stp-wave-lbl' }, 'Hareket')));
  const sensor = h('section', { class: 'panel stp-sensor' },
    h('div', { class: 'stp-sensor-head' },
      h('div', { class: 'stp-sensor-ic' }, icon('phone')),
      h('div', { class: 'grow' }, h('div', { class: 'stp-sensor-title' }, 'Telefonla adım sayma'), h('div', { class: 'stp-status' }, dot, stText))),
    stSub, live, sensorBtn, wakeRow);

  function paintSensor() {
    const s = sensorStatus(), st = pedometer.state;
    sensor.dataset.state = s.cls;
    stText.textContent = s.text;
    stSub.textContent = s.sub;
    live.classList.toggle('hide', !(st === 'active' || st === 'starting'));
    sensorBtn.onclick = null;
    if (pedometer.running) {
      mount(sensorBtn, icon('pause'), 'Saymayı durdur');
      sensorBtn.className = 'btn ghost block';
      sensorBtn.onclick = () => { stopSensor(); toast('Adım sayma durduruldu'); };
    } else if (st === 'needs-permission' || st === 'denied') {
      mount(sensorBtn, icon('play'), st === 'denied' ? 'Tekrar dene' : 'Dokun ve devam et');
      sensorBtn.className = 'btn primary block';
      sensorBtn.onclick = async () => { if (await startSensor(true)) toast('Adım sayma başladı', { type: 'success' }); };
    } else if (st === 'unsupported' || st === 'insecure') {
      mount(sensorBtn, icon('edit'), 'Adımları elle gir');
      sensorBtn.className = 'btn block';
      sensorBtn.onclick = () => openDayEditor(today);
    } else {
      mount(sensorBtn, icon('play'), 'Adım saymayı başlat');
      sensorBtn.className = 'btn primary block';
      sensorBtn.onclick = async () => { if (await startSensor(true)) toast('Adım sayma başladı', { type: 'success' }); };
    }
    sesEl.textContent = fmt.n(pedometer.sessionSteps);
  }
  const cadTimer = setInterval(() => { cadEl.textContent = fmt.n(pedometer.cadence()); }, 1000);
  off.push(() => clearInterval(cadTimer));

  // --- Bilgi + elle giriş ---
  const info = h('section', { class: 'panel amber stp-info' },
    h('div', { class: 'stp-info-head' }, icon('info'), h('h3', null, 'Gün boyu sayım hakkında')),
    h('p', null, 'Telefon kilitliyken ya da uygulama kapalıyken tarayıcı adım sayamaz. Google Fit, Health Connect ve Apple Sağlık bağlantısı uygulamanın telefon sürümüyle gelecek.'),
    h('p', null, 'Şimdilik sağlık uygulamandaki günlük sayıyı buraya yazabilirsin.'),
    h('div', { class: 'stp-actions' },
      h('button', { type: 'button', class: 'btn', onClick: () => addStepsDialog() }, icon('plus'), 'Adım ekle'),
      h('button', { type: 'button', class: 'btn', onClick: () => openDayEditor(today) }, icon('edit'), 'Toplamı gir')),
    h('button', { type: 'button', class: 'btn ghost block stp-past', onClick: () => openDayEditor(addDays(today, -1), { pickDate: true }) }, icon('calendar'), 'Geçmiş bir günü ekle'));

  // --- Saatlik ---
  const nowH = new Date().getHours();
  const hourCap = h('span', { class: 'stp-cap' });
  const hourBars = liveBars({ count: 24, height: 96, labels: (i, aria) => aria ? `${pad(i)}:00` : (i % 6 === 0 ? pad(i) : ''),
    onSelect: i => { selHour = i; paintHourly(); }, ariaLabel: 'Bugünün saatlik adım dağılımı' });
  let selHour = -1;
  const hourly = h('section', { class: 'panel stp-chart' },
    h('div', { class: 'stp-chart-head' }, h('h3', null, 'Bugün saat saat'), hourCap),
    hourBars.el);
  function paintHourly() {
    const e = D.getEntry(today, all);
    hourBars.update(e.hourly, { highlight: nowH, selected: selHour });
    if (selHour >= 0) hourCap.textContent = `${pad(selHour)}:00 · ${fmt.n(e.hourly[selHour])} adım`;
    else {
      const mx = Math.max(...e.hourly);
      hourCap.textContent = mx > 0 ? `En yoğun: ${pad(e.hourly.indexOf(mx))}:00` : 'Henüz adım yok';
    }
  }

  // --- 7 / 30 gün ---
  let range = 7, selDay = -1, trendBars = null;
  const trendStats = h('div', { class: 'stp-trend-stats' });
  const trendCap = h('div', { class: 'stp-cap stp-trend-cap' });
  const trendBox = h('div');
  const trend = h('section', { class: 'panel stp-chart' },
    tabs([{ id: 7, label: '7 gün' }, { id: 30, label: '30 gün' }], range, id => { range = id; selDay = -1; buildTrend(); }),
    trendStats, trendBox, trendCap);
  function buildTrend() {
    const keys = lastNDays(range);
    trendBars = liveBars({
      count: range, height: 130,
      labels: (i, aria) => aria ? fmt.date(keys[i], 'short') : range === 7 ? fmt.date(keys[i], 'weekday') : ((range - 1 - i) % 5 === 0 ? String(parseKey(keys[i]).getDate()) : ''),
      onSelect: i => { selDay = selDay === i ? -1 : i; paintTrend(); },
      ariaLabel: `Son ${range} günün adımları`,
    });
    mount(trendBox, trendBars.el);
    paintTrend();
  }
  function paintTrend() {
    const keys = lastNDays(range);
    const vals = keys.map(k => D.getEntry(k, all).total);
    const goals = keys.map(k => D.goalFor(k, all));
    const hits = vals.map((v, i) => v > 0 && v >= goals[i]);
    const sum = vals.reduce((a, b) => a + b, 0);
    const counted = vals.filter(v => v > 0).length;
    const avg = counted ? Math.round(sum / counted) : 0;
    trendBars.update(vals, { goal: D.goalFor(today, all), avg, highlight: range - 1, hits, selected: selDay });
    const box = (v, l) => h('div', null, h('b', null, v), h('span', null, l));
    mount(trendStats,
      box(fmt.n(avg), 'Günlük ortalama'),
      box(fmt.n(sum), 'Toplam adım'),
      box(`${hits.filter(Boolean).length}/${range}`, 'Hedef tutan gün'));
    if (selDay >= 0) {
      const k = keys[selDay], v = vals[selDay];
      mount(trendCap, h('b', null, fmt.date(k)), ` · ${fmt.n(v)} adım · ${fmt.km(D.distanceM(v))} km`, hits[selDay] ? h('span', { class: 'c-lime' }, ' · hedef tuttu') : null);
    } else mount(trendCap, h('span', { class: 'muted' }, 'Günün ayrıntısı için bir çubuğa dokun.'));
  }

  // --- Seriler ve rekorlar ---
  const recBox = h('div', { class: 'stp-recs' });
  function paintRecords() {
    const s = D.stats(all);
    const card = (ic, cls, v, unit, l, sub) => h('div', { class: 'stp-rec ' + cls },
      h('div', { class: 'stp-rec-ic' }, icon(ic)),
      h('div', { class: 'stp-rec-v' }, v, unit && h('small', null, unit)),
      h('div', { class: 'stp-rec-l' }, l),
      sub && h('div', { class: 'stp-rec-s' }, sub));
    mount(recBox,
      card('flame', 'c-amber', fmt.n(s.current), 'gün', 'Şu anki seri', s.current ? 'Hedefi üst üste tuttun' : 'Bugün hedefi tut, seri başlasın'),
      card('trophy', 'c-magenta', fmt.n(s.best), 'gün', 'En uzun seri', `${fmt.n(s.hits)} gün hedef tuttu`),
      card('star', 'c-lime', s.record ? fmt.n(s.record.steps) : '0', '', 'En çok adım', s.record ? fmt.date(s.record.date, 'short') : 'Henüz yok'),
      card('map', 'c-cyan', fmt.n(D.distanceM(s.lifetime) / 1000, 1), 'km', 'Toplam mesafe', `${fmt.n(s.dayCount)} günde`));
  }

  // --- Günlük liste ---
  let listLimit = 10;
  const listBox = h('div');
  function paintList() {
    const days = D.allDays(all);
    if (!days.length) {
      mount(listBox, emptyState('steps', 'Henüz kayıt yok', 'Adım saymayı başlat ya da sağlık uygulamandaki sayıyı elle gir.',
        h('button', { type: 'button', class: 'btn primary', onClick: () => openDayEditor(today) }, icon('plus'), 'Adım gir')));
      return;
    }
    const items = days.slice(0, listLimit).map(k => {
      const e = D.getEntry(k, all), goal = D.goalFor(k, all), pct = goal ? e.total / goal : 0, hit = pct >= 1;
      const d = parseKey(k);
      return h('button', { type: 'button', class: 'list-item click stp-day' + (hit ? ' hit' : '') + (k === today ? ' today' : ''), onClick: () => openDayEditor(k),
        'aria-label': `${fmt.date(k)}: ${fmt.n(e.total)} adım. Düzenlemek için dokun.` },
        h('div', { class: 'stp-day-date' }, h('b', null, d.getDate()), h('span', null, MON_SHORT(k))),
        h('div', { class: 'li-main' },
          h('div', { class: 'li-title' }, k === today ? 'Bugün' : k === addDays(today, -1) ? 'Dün' : WD_LONG(k), e.edited ? h('span', { class: 'stp-tag' }, 'elle') : null),
          h('div', { class: 'li-sub' }, `${fmt.km(D.distanceM(e.total))} km · ${fmt.n(D.kcalOf(e.total))} kcal`),
          h('div', { class: 'progress thin stp-day-bar' }, h('i', { style: { width: clamp(pct, 0, 1) * 100 + '%' } }))),
        h('div', { class: 'li-end' },
          h('div', { class: 'stp-day-steps' }, fmt.n(e.total)),
          h('div', { class: 'stp-day-pct' }, hit ? icon('check', { size: 14 }) : null, '%' + fmt.n(Math.round(pct * 100)))));
    });
    mount(listBox, h('div', { class: 'list' }, items),
      days.length > listLimit ? h('button', { type: 'button', class: 'btn ghost block mt', onClick: () => { listLimit += 15; paintList(); } },
        `Daha fazla göster (${fmt.n(days.length - listLimit)} gün daha)`) : null);
  }

  mount(el,
    pageHeader('Adım Sayar', fmt.date(today), goalBtn),
    hero, sensor, info,
    sectionTitle('Geçmiş'), trend, hourly,
    sectionTitle('Seriler ve rekorlar'), recBox,
    sectionTitle('Günlük liste', h('span', { class: 'stp-st-hint' }, 'Düzenlemek için dokun')), h('section', { class: 'panel tight stp-list' }, listBox));

  // --- İlk boyama ---
  paintGoalBtn(); paintHero(); paintSensor(); paintHourly(); buildTrend(); paintRecords(); paintList();

  // --- Canlı güncellemeler ---
  let hourlyTimer = 0;
  off.push(pedometer.subscribe(ev => {
    if (ev.type === 'state' || ev.type === 'lock') { paintSensor(); return; }
    if (ev.type === 'steps') {
      paintHero();
      sesEl.textContent = fmt.n(pedometer.sessionSteps);
      cadEl.textContent = fmt.n(pedometer.cadence());
      ev.perf.forEach(t => wave.mark(t));
      for (const n of [hero, sensor]) { n.classList.remove('beat'); void n.offsetWidth; n.classList.add('beat'); }
      if (!hourlyTimer) hourlyTimer = setTimeout(() => { hourlyTimer = 0; paintHourly(); }, 1200);
    }
  }));
  off.push(() => clearTimeout(hourlyTimer), () => cancelAnimationFrame(countRaf));
  off.push(pedometer.onSignal((s, thr, t) => wave.push(s, thr, t)));

  let repaintTimer = 0;
  const repaintAll = () => {
    clearTimeout(repaintTimer);
    repaintTimer = setTimeout(() => {
      all = D.rawAll();
      paintGoalBtn(); paintHero(); paintHourly(); paintTrend(); paintRecords(); paintList();
    }, 80);
  };
  off.push(subscribe(D.KEY, repaintAll));
  off.push(subscribe('profile', repaintAll));
  off.push(() => clearTimeout(repaintTimer));

  // Gece yarısı geçerse sayfayı yeni güne taşı
  const dayTimer = setInterval(() => { if (todayKey() !== today) { D.flush(); refresh(); } }, 60000);
  off.push(() => clearInterval(dayTimer));

  return () => off.forEach(f => { try { f(); } catch (e) { console.error(e); } });
}

export default {
  id: 'steps',
  title: 'Adım Sayar',
  navLabel: 'Adım',
  icon: 'steps',
  css: true,

  init() {
    D.installLifecycle();
    pedometer.subscribe(ev => { if (ev.type === 'steps') D.addSensorSteps(ev.times); });
    const s = D.getSettings();
    if (s.enabled) {
      pedometer.start({ gesture: false }).then(ok => { if (ok && s.wakeLock) wakeLock.set(true); }).catch(e => console.warn('Adım sensörü', e));
    }
  },

  render,

  summary(dateKey = todayKey()) {
    const e = D.getEntry(dateKey), goal = D.goalFor(dateKey);
    return {
      label: 'Adım',
      value: fmt.n(e.total),
      unit: 'adım',
      sub: `${fmt.km(D.distanceM(e.total))} km · hedef ${fmt.n(goal)}`,
      progress: goal ? clamp(e.total / goal, 0, 1) : null,
      color: e.total >= goal ? 'var(--lime)' : 'var(--cyan)',
      icon: 'steps',
    };
  },
  burned(dateKey = todayKey()) { return D.kcalOf(D.stepsFor(dateKey)); },
  stepsFor(dateKey = todayKey()) { return D.stepsFor(dateKey); },
  history(n = 7) { return D.history(n); },
};
