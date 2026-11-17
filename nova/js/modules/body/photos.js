// İlerleme fotoğrafları — IndexedDB deposu, galeri, tam ekran görüntüleyici ve karşılaştırma.
// Fotoğraflar yalnızca bu cihazdaki IndexedDB'de ('nova-body' / 'photos') tutulur; localStorage'a ve yedeğe girmez.
import { h, icon, mount, toast, modal, confirmDialog, emptyState, backButton, pageHeader, sectionTitle, tabs, haptic, uid, fmt, clamp } from '../../core/ui.js';
import { todayKey, daysBetween } from '../../core/store.js';
import { awardXP } from '../../core/xp.js';
import { MEASURES, getEntries, latestValues, signed, deltaClass } from './calc.js';

export const POSES = ['ön', 'yan', 'arka'];
const POSE_LABEL = { 'ön': 'Ön', 'yan': 'Yan', 'arka': 'Arka' };
export const PRIVACY = 'Fotoğraflar yalnızca bu telefonda saklanır, yedeğe dahil edilmez.';

// ---------- IndexedDB ----------
const DB_NAME = 'nova-body', STORE = 'photos';
let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      if (!('indexedDB' in window) || !window.indexedDB) throw new Error('IndexedDB yok');
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) { reject(e); return; }
    const timer = setTimeout(() => reject(new Error('IndexedDB yanıt vermedi')), 4000);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('date', 'date');
    };
    req.onsuccess = () => { clearTimeout(timer); const db = req.result; db.onversionchange = () => { db.close(); dbPromise = null; }; resolve(db); };
    req.onerror = () => { clearTimeout(timer); reject(req.error || new Error('IndexedDB açılamadı')); };
    req.onblocked = () => { clearTimeout(timer); reject(new Error('IndexedDB engellendi')); };
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

export async function isAvailable() {
  try { await openDB(); return true; } catch { return false; }
}

function tx(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    let result;
    const r = fn(st);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('İşlem iptal edildi'));
  }));
}

const sortPhotos = list => list.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
export const allPhotos = () => tx('readonly', st => st.getAll()).then(l => sortPhotos(l || []));
export const deletePhoto = id => tx('readwrite', st => st.delete(id));
export async function putPhoto(rec) {
  try { await tx('readwrite', st => st.put(rec)); }
  catch (e) {
    // Bazı tarayıcılar Blob saklayamaz: ArrayBuffer olarak dene
    if (!(rec.blob instanceof Blob)) throw e;
    const buf = await rec.blob.arrayBuffer();
    const { blob, ...rest } = rec;
    await tx('readwrite', st => st.put({ ...rest, buf, type: blob.type }));
  }
}
const blobOf = rec => rec.blob instanceof Blob ? rec.blob : new Blob([rec.buf], { type: rec.type || 'image/jpeg' });

/** Nesne URL'lerini toplar; sayfa kapanınca serbest bırakılır */
export function urlBag() {
  const map = new Map();
  return {
    get(rec) { if (!map.has(rec.id)) map.set(rec.id, URL.createObjectURL(blobOf(rec))); return map.get(rec.id); },
    drop(id) { const u = map.get(id); if (u) { URL.revokeObjectURL(u); map.delete(id); } },
    clear() { map.forEach(u => URL.revokeObjectURL(u)); map.clear(); },
  };
}

// ---------- Görüntü küçültme ----------
function loadImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Görüntü okunamadı')); };
    img.src = url;
  });
}
/** En uzun kenar en fazla `max` px olacak şekilde JPEG'e çevirir */
export async function downscale(file, max = 1080, quality = 0.8) {
  let src, w, hh;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    w = src.width; hh = src.height;
  } catch {
    src = await loadImg(file);
    w = src.naturalWidth; hh = src.naturalHeight;
  }
  if (!w || !hh) throw new Error('Görüntü okunamadı');
  const s = Math.min(1, max / Math.max(w, hh));
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(hh * s));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, cw, ch);
  src.close?.();
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('Görüntü dönüştürülemedi');
  return { blob, width: cw, height: ch };
}

// ---------- Ortak parçalar ----------
function privacyNote() {
  return h('div', { class: 'bd-privacy' }, icon('lock', { size: 18 }), h('span', null, PRIVACY));
}
function unavailablePanel() {
  return h('div', { class: 'panel' }, emptyState('lock', 'Fotoğraflar bu tarayıcıda saklanamıyor',
    'Tarayıcının yerel deposu kapalı (gizli sekme ya da kısıtlı ayar olabilir). Ölçüm kayıtların etkilenmez; fotoğraf için uygulamayı normal sekmede aç.',
    h('a', { class: 'btn', href: '#/body' }, icon('left'), 'Ölçülere dön')));
}
const poseBadge = p => h('span', { class: 'bd-pose' }, POSE_LABEL[p] || p);

/** Fotoğraf ekleme alt sayfası */
export function openAddPhotoSheet({ onDone } = {}) {
  let pose = 'ön';
  const date = h('input', { class: 'input', type: 'date', value: todayKey(), max: todayKey(), 'aria-label': 'Tarih' });
  const poseWrap = h('div', { class: 'chips bd-pose-chips', role: 'radiogroup', 'aria-label': 'Poz' });
  const paintPose = () => mount(poseWrap, POSES.map(p => h('button', {
    type: 'button', class: 'chip' + (p === pose ? ' active' : ''), role: 'radio', 'aria-checked': String(p === pose),
    onClick: () => { pose = p; paintPose(); },
  }, POSE_LABEL[p])));
  paintPose();

  const status = h('p', { class: 'small muted bd-status', 'aria-live': 'polite' });
  let busy = false;
  const handle = async input => {
    const files = [...(input.files || [])].filter(f => /^image\//.test(f.type) || !f.type);
    input.value = '';
    if (!files.length || busy) return;
    if (date.value > todayKey() || !date.value) { toast('Geçerli bir tarih seç', { type: 'error' }); return; }
    busy = true; body.classList.add('busy');
    status.textContent = 'Fotoğraf hazırlanıyor…';
    let ok = 0;
    for (const f of files) {
      try {
        const { blob, width, height } = await downscale(f);
        await putPhoto({ id: uid(), date: date.value, pose, blob, width, height, createdAt: Date.now() });
        ok++;
      } catch (e) {
        console.warn('fotoğraf', e);
        toast(/quota/i.test(e?.name + e?.message) ? 'Telefon hafızası dolu, fotoğraf kaydedilemedi' : 'Bu fotoğraf kaydedilemedi', { type: 'error' });
      }
    }
    busy = false; body.classList.remove('busy'); status.textContent = '';
    if (ok) {
      haptic();
      toast(ok > 1 ? `${ok} fotoğraf kaydedildi` : 'Fotoğraf kaydedildi', { type: 'success' });
      awardXP(10, 'İlerleme fotoğrafı', { once: 'body-photo-' + date.value });
      close();
      onDone?.();
    }
  };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'bd-file bd-file-cam', onChange: e => handle(e.target) });
  const gal = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'bd-file bd-file-gal', onChange: e => handle(e.target) });

  const body = h('div', { class: 'bd-sheet' },
    h('label', { class: 'field' }, h('span', null, 'Tarih'), date),
    h('div', { class: 'field' }, h('span', null, 'Poz'), poseWrap),
    h('ul', { class: 'bd-tips small muted' },
      h('li', null, 'Her seferinde aynı ışıkta, aynı yerde ve aynı mesafeden çek.'),
      h('li', null, 'Sabah, aç karnına ve benzer kıyafetle çekmek farkı net gösterir.')),
    h('div', { class: 'col' },
      h('label', { class: 'btn primary block' }, icon('camera'), 'Kamerayla çek', cam),
      h('label', { class: 'btn block' }, icon('upload'), 'Galeriden seç', gal)),
    status,
    privacyNote());
  const close = modal({ title: 'Fotoğraf ekle', body });
  return close;
}

/** Tam ekran görüntüleyici. list: gösterilecek kayıtlar, start: indeks */
export function openViewer(list, start, bag, { onDelete } = {}) {
  let i = start;
  const img = h('img', { class: 'bd-v-img', alt: '' });
  const title = h('div', { class: 'bd-v-title' });
  const counter = h('div', { class: 'tiny muted' });
  const prevB = h('button', { class: 'bd-v-nav prev', 'aria-label': 'Önceki fotoğraf', onClick: () => go(-1) }, icon('left'));
  const nextB = h('button', { class: 'bd-v-nav next', 'aria-label': 'Sonraki fotoğraf', onClick: () => go(1) }, icon('right'));
  const paint = () => {
    const r = list[i];
    img.src = bag.get(r);
    img.alt = `${fmt.date(r.date, 'full')} – ${POSE_LABEL[r.pose] || r.pose} pozu`;
    mount(title, fmt.date(r.date, 'full'), ' · ', POSE_LABEL[r.pose] || r.pose);
    counter.textContent = `${i + 1} / ${list.length}`;
    prevB.disabled = i <= 0; nextB.disabled = i >= list.length - 1;
  };
  const go = d => { const n = clamp(i + d, 0, list.length - 1); if (n !== i) { i = n; paint(); } };
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (document.querySelector('.modal-backdrop')) return; if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
  const del = async () => {
    const r = list[i];
    const ok = await confirmDialog('Bu fotoğraf kalıcı olarak silinsin mi? Yedekte kopyası olmadığı için geri getirilemez.', { title: 'Fotoğrafı sil', okLabel: 'Sil', danger: true });
    if (!ok) return;
    try { await deletePhoto(r.id); } catch { toast('Fotoğraf silinemedi', { type: 'error' }); return; }
    bag.drop(r.id);
    list.splice(i, 1);
    toast('Fotoğraf silindi', { type: 'success' });
    onDelete?.(r);
    if (!list.length) return close();
    i = Math.min(i, list.length - 1); paint();
  };
  // Kaydırma hareketi
  let sx = null;
  img.addEventListener('pointerdown', e => { sx = e.clientX; });
  img.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); });

  const wrap = h('div', { class: 'bd-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Fotoğraf' },
    h('div', { class: 'bd-v-top' },
      h('button', { class: 'bd-v-btn', 'aria-label': 'Kapat', onClick: close }, icon('x')),
      h('div', { class: 'grow' }, title, counter),
      h('button', { class: 'bd-v-btn danger', 'aria-label': 'Fotoğrafı sil', onClick: del }, icon('trash'))),
    h('div', { class: 'bd-v-stage' }, img, prevB, nextB));
  document.body.appendChild(wrap);
  document.addEventListener('keydown', onKey);
  paint();
  return close;
}

// ---------- Galeri sayfası ----------
export async function renderGallery(el) {
  const bag = urlBag();
  let closeViewer = null;
  let filter = 'all';
  const content = h('div');
  const addBtn = h('button', { class: 'btn primary sm', onClick: () => openAddPhotoSheet({ onDone: paint }) }, icon('plus'), 'Ekle');
  mount(el, backButton('body'), pageHeader('İlerleme fotoğrafları', 'Değişimini gözünle gör', addBtn), privacyNote(), content);

  if (!(await isAvailable())) { addBtn.remove(); mount(content, unavailablePanel()); return () => bag.clear(); }

  async function paint() {
    let list;
    try { list = await allPhotos(); } catch { mount(content, unavailablePanel()); return; }
    if (!list.length) {
      mount(content, h('div', { class: 'panel' }, emptyState('camera', 'Henüz fotoğraf yok',
        'Ön, yan ve arkadan birer fotoğraf çek. Haftalar sonra karşılaştırınca farkı net görürsün.',
        h('button', { class: 'btn primary', onClick: () => openAddPhotoSheet({ onDone: paint }) }, icon('camera'), 'İlk fotoğrafı ekle'))));
      return;
    }
    const counts = Object.fromEntries(POSES.map(p => [p, list.filter(r => r.pose === p).length]));
    const shown = filter === 'all' ? list : list.filter(r => r.pose === filter);
    const groups = new Map();
    shown.forEach(r => { if (!groups.has(r.date)) groups.set(r.date, []); groups.get(r.date).push(r); });
    const canCompare = POSES.some(p => counts[p] >= 2);

    mount(content,
      h('div', { class: 'chips bd-filter', role: 'tablist' },
        [['all', `Tümü · ${list.length}`], ...POSES.map(p => [p, `${POSE_LABEL[p]} · ${counts[p]}`])].map(([id, label]) =>
          h('button', { class: 'chip' + (filter === id ? ' active' : ''), role: 'tab', 'aria-selected': String(filter === id), onClick: () => { filter = id; paint(); } }, label))),
      h('a', { class: 'panel tight click bd-compare-cta' + (canCompare ? '' : ' off'), href: canCompare ? '#/body/compare' : null,
        onClick: canCompare ? null : e => { e.preventDefault(); toast('Karşılaştırmak için aynı pozda en az 2 fotoğraf gerekli'); } },
        h('span', { class: 'li-icon' }, icon('layers')),
        h('div', { class: 'grow' }, h('div', { class: 'li-title' }, 'Karşılaştır'),
          h('div', { class: 'li-sub' }, canCompare ? 'İki tarihi yan yana ya da kaydırarak gör' : 'Aynı pozda 2 fotoğraf olunca açılır')),
        icon('right', { size: 20 })),
      shown.length ? [...groups].map(([date, recs]) => [
        sectionTitle(fmt.date(date, 'full'), h('span', { class: 'small muted' }, `${recs.length} fotoğraf`)),
        h('div', { class: 'bd-grid' }, recs.map(r => h('button', {
          class: 'bd-thumb', 'aria-label': `${fmt.date(r.date, 'short')} ${POSE_LABEL[r.pose]} fotoğrafını aç`,
          onClick: () => { closeViewer = openViewer(shown, shown.indexOf(r), bag, { onDelete: () => paint() }); },
        }, h('img', { src: bag.get(r), alt: '', loading: 'lazy', decoding: 'async' }), poseBadge(r.pose)))),
      ]) : h('div', { class: 'panel' }, emptyState('camera', `${POSE_LABEL[filter]} pozunda fotoğraf yok`, '', h('button', { class: 'btn', onClick: () => openAddPhotoSheet({ onDone: paint }) }, icon('plus'), 'Fotoğraf ekle'))));
  }
  await paint();
  return () => { closeViewer?.(); bag.clear(); };
}

// ---------- Karşılaştırma sayfası ----------
export async function renderCompare(el) {
  const bag = urlBag();
  const content = h('div');
  mount(el, backButton('body/photos'), pageHeader('Karşılaştır', 'Aynı pozdaki iki fotoğrafı yan yana koy'), content);
  if (!(await isAvailable())) { mount(content, unavailablePanel()); return () => bag.clear(); }
  let list;
  try { list = (await allPhotos()).reverse(); } catch { mount(content, unavailablePanel()); return () => bag.clear(); } // eskiden yeniye
  const byPose = Object.fromEntries(POSES.map(p => [p, list.filter(r => r.pose === p)]));
  const usable = POSES.filter(p => byPose[p].length >= 2);
  if (!usable.length) {
    mount(content, h('div', { class: 'panel' }, emptyState('layers', 'Karşılaştıracak fotoğraf yok',
      'Aynı pozda (ör. önden) farklı günlerde en az iki fotoğraf ekle.',
      h('a', { class: 'btn primary', href: '#/body/photos' }, icon('camera'), 'Fotoğraflara git'))), privacyNote());
    return () => bag.clear();
  }
  let pose = usable.slice().sort((a, b) => byPose[b].length - byPose[a].length)[0];
  let mode = 'side';
  let aId, bId, pos = 50;

  const resetPair = () => { const l = byPose[pose]; aId = l[0].id; bId = l.at(-1).id; };
  resetPair();
  const label = (r, l) => {
    const same = l.filter(x => x.date === r.date);
    const y = r.date.slice(0, 4);
    return fmt.date(r.date, 'short') + (y !== todayKey().slice(0, 4) ? ' ' + y : '') + (same.length > 1 ? ` (${same.indexOf(r) + 1})` : '');
  };
  const select = (cur, onChange, aria) => {
    const l = byPose[pose];
    const s = h('select', { class: 'select', 'aria-label': aria, onChange: e => onChange(e.target.value) },
      l.map(r => h('option', { value: r.id, selected: r.id === cur }, label(r, l))));
    return s;
  };

  const stage = h('div');
  const info = h('div');
  const controls = h('div');

  function paintControls() {
    mount(controls,
      h('div', { class: 'chips' }, POSES.map(p => h('button', {
        class: 'chip' + (p === pose ? ' active' : ''), disabled: byPose[p].length < 2,
        onClick: () => { pose = p; resetPair(); paintControls(); paintStage(); },
      }, `${POSE_LABEL[p]} · ${byPose[p].length}`))),
      h('div', { class: 'grid-2 bd-pick' },
        h('label', { class: 'field' }, h('span', null, 'Önce'), select(aId, v => { aId = v; paintStage(); }, 'Önceki fotoğraf')),
        h('label', { class: 'field' }, h('span', null, 'Sonra'), select(bId, v => { bId = v; paintStage(); }, 'Sonraki fotoğraf'))),
      tabs([{ id: 'side', label: 'Yan yana' }, { id: 'slide', label: 'Kaydır' }], mode, id => { mode = id; paintStage(); }));
  }

  function paintStage() {
    const l = byPose[pose];
    const A = l.find(r => r.id === aId) || l[0], B = l.find(r => r.id === bId) || l.at(-1);
    if (mode === 'side') {
      mount(stage, h('div', { class: 'grid-2 bd-side' },
        [[A, 'Önce'], [B, 'Sonra']].map(([r, t]) => h('figure', { class: 'bd-fig' },
          h('img', { src: bag.get(r), alt: `${t}: ${fmt.date(r.date, 'short')}` }),
          h('figcaption', null, h('b', null, t), ' · ', fmt.date(r.date, 'short'))))));
    } else {
      const before = h('img', { class: 'bd-sl-a', src: bag.get(A), alt: 'Önce', draggable: 'false' });
      const handle = h('div', { class: 'bd-sl-handle' }, h('span', null, icon('left', { size: 16 }), icon('right', { size: 16 })));
      const range = h('input', { type: 'range', min: 0, max: 100, step: 1, value: pos, class: 'bd-sl-range', 'aria-label': 'Karşılaştırma kaydırıcısı' });
      const setPos = v => {
        pos = clamp(v, 0, 100);
        before.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
        handle.style.left = pos + '%';
        range.value = Math.round(pos);
      };
      const box = h('div', { class: 'bd-slider' },
        h('img', { class: 'bd-sl-b', src: bag.get(B), alt: 'Sonra', draggable: 'false' }),
        before, handle,
        h('span', { class: 'bd-sl-tag l' }, 'Önce · ', fmt.date(A.date, 'short')),
        h('span', { class: 'bd-sl-tag r' }, 'Sonra · ', fmt.date(B.date, 'short')));
      const fromEvent = e => { const r = box.getBoundingClientRect(); setPos(((e.clientX - r.left) / r.width) * 100); };
      box.addEventListener('pointerdown', e => { box.setPointerCapture?.(e.pointerId); fromEvent(e); });
      box.addEventListener('pointermove', e => { if (box.hasPointerCapture?.(e.pointerId)) fromEvent(e); });
      range.addEventListener('input', () => setPos(+range.value));
      setPos(pos);
      mount(stage, box, range);
    }
    paintInfo(A, B);
  }

  function paintInfo(A, B) {
    const [a, b] = A.date <= B.date ? [A, B] : [B, A];
    const days = daysBetween(a.date, b.date);
    const entries = getEntries();
    const va = latestValues(entries, a.date), vb = latestValues(entries, b.date);
    const diffs = MEASURES.filter(m => va[m.id] && vb[m.id] && va[m.id].date !== vb[m.id].date)
      .map(m => ({ m, d: vb[m.id].v - va[m.id].v })).filter(x => Math.abs(x.d) >= 0.1);
    mount(info, h('div', { class: 'panel tight' },
      h('div', { class: 'row between' },
        h('div', null, h('div', { class: 'stat-label' }, 'Aradaki süre'), h('div', { class: 'stat-value' }, days ? fmt.n(days) : 'Aynı gün', days ? h('span', { class: 'stat-unit' }, 'gün') : null)),
        days >= 7 && h('span', { class: 'badge' }, `${fmt.n(days / 7, days % 7 ? 1 : 0)} hafta`)),
      diffs.length ? h('div', { class: 'bd-diff-row' }, diffs.map(({ m, d }) =>
        h('span', { class: 'bd-diff ' + deltaClass(m.id, d) }, `${m.label} ${signed(d)} cm`))) :
        h('p', { class: 'small muted', style: 'margin:8px 0 0' }, 'Bu tarihler arasında karşılaştırılacak ölçü kaydı yok.')));
  }

  mount(content, controls, stage, info, privacyNote());
  paintControls();
  paintStage();
  return () => bag.clear();
}

/** Ana sayfadaki özet kartı için: {count, last} ya da null (depo yoksa) */
export async function photoSummary() {
  if (!(await isAvailable())) return null;
  try { const l = await allPhotos(); return { count: l.length, latest: l.slice(0, 3) }; } catch { return null; }
}
