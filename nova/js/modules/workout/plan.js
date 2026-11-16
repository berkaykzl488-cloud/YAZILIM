// Plan sekmesi: bugünkü öneri, programlar, kendi antrenmanların ve program detayı / oluşturucu
import { h, icon, fmt, mount, backButton, sectionTitle, emptyState, toast, confirmDialog, tabs, uid } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { update, todayKey, addDays } from '../../core/store.js';
import { PROGRAMS, PROG } from './programs.js';
import { EX, LEVELS } from './exercises.js';
import { subNav, activeBanner, exRow, targetText, pickExercise, unlockAudio } from './kit.js';
import { getActive, startSession, getLoc, setLoc, customs, K, sessions, nextDayIdx, weekStart, sessionTotals, durationMin } from './data.js';

const locName = l => (l === 'gym' ? 'Salon' : 'Ev');

function begin(opts) {
  unlockAudio();
  const go2 = () => { startSession(opts); toast('Antrenman başladı. Kolay gelsin!', { type: 'success' }); go('workout/session'); };
  if (getActive()) {
    confirmDialog('Devam eden bir antrenmanın var. Onu kaydetmeden kapatıp yenisini başlatmak istiyor musun?', { title: 'Yeni antrenman', okLabel: 'Yenisini başlat', danger: true })
      .then(ok => ok && go2());
  } else go2();
}

export function renderPlan(el) {
  const loc = getLoc();
  const list = sessions();
  const wk = weekStart(todayKey());
  const thisWeek = list.filter(s => s.date >= wk);
  const wkMins = thisWeek.reduce((a, s) => a + durationMin(s), 0);
  const wkVol = thisWeek.reduce((a, s) => a + (s.volumeKg || 0), 0);

  // Bugünkü öneri: bu yerdeki son kullanılan program, yoksa ilk program
  const progs = PROGRAMS.filter(p => p.loc === loc);
  const lastUsed = [...list].reverse().find(s => s.programId && PROG[s.programId]?.loc === loc);
  const prog = (lastUsed && PROG[lastUsed.programId]) || progs[0];
  const di = nextDayIdx(prog);
  const day = prog.days[di];
  const active = getActive();

  const hero = active ? activeBanner() : h('section', { class: 'panel hero wk-hero' },
    h('div', { class: 'wk-hero-kicker' }, 'Bugün için önerimiz'),
    h('h2', { class: 'wk-hero-title' }, prog.short, ' · ', day.name),
    h('p', { class: 'wk-hero-sub' }, `${day.ex.length} egzersiz · yaklaşık ${prog.mins} dk · ${LEVELS[prog.lvl]}`),
    h('div', { class: 'wk-hero-ex' }, day.ex.slice(0, 4).map(x => h('span', { class: 'wk-pill' }, EX[x.id].name)), day.ex.length > 4 ? h('span', { class: 'wk-pill' }, `+${day.ex.length - 4}`) : null),
    h('div', { class: 'row', style: 'margin-top:14px' },
      h('button', { class: 'btn primary lg grow', type: 'button', onClick: () => begin({ name: `${prog.short} · ${day.name}`, location: loc, programId: prog.id, dayIdx: di, items: day.ex }) }, icon('play'), 'Antrenmanı başlat'),
      h('a', { class: 'btn icon lg', href: '#/workout/prog/' + prog.id, 'aria-label': 'Program ayrıntıları' }, icon('list'))));

  const locTabs = tabs([{ id: 'home', label: 'Evde' }, { id: 'gym', label: 'Salonda' }], loc, id => { setLoc(id); renderPlan(el); });
  locTabs.classList.add('wk-loc');

  const cs = customs().filter(c => c.loc === loc || !c.loc);

  mount(el,
    h('h1', { class: 'hud-title' }, 'Antrenman'),
    h('p', { class: 'hud-sub' }, 'Programını seç, hareketleri izleyerek çalış.'),
    subNav(''),
    locTabs,
    hero,
    h('div', { class: 'info-strip wk-strip' },
      h('div', null, h('div', { class: 'is-label' }, icon('calendar'), 'Bu hafta'), h('div', { class: 'is-value' }, `${thisWeek.length} antrenman`)),
      h('div', null, h('div', { class: 'is-label' }, icon('clock'), 'Süre'), h('div', { class: 'is-value' }, `${wkMins} dk`)),
      h('div', null, h('div', { class: 'is-label' }, icon('dumbbell'), 'Hacim'), h('div', { class: 'is-value' }, `${fmt.n(wkVol)} kg`))),
    h('div', { class: 'grid-2 wk-quick' },
      h('button', { class: 'wk-quick-btn', type: 'button', onClick: () => begin({ name: 'Serbest antrenman', location: loc, items: [] }) },
        h('span', { class: 'li-icon' }, icon('plus')), h('span', null, h('b', null, 'Boş antrenman'), h('small', null, 'Egzersizleri kendin ekle'))),
      h('a', { class: 'wk-quick-btn', href: '#/workout/timer' },
        h('span', { class: 'li-icon' }, icon('timer')), h('span', null, h('b', null, 'Aralık sayacı'), h('small', null, 'Tabata, EMOM, özel')))),
    sectionTitle(`${locName(loc)} programları`),
    h('div', { class: 'wk-progs' }, progs.map(p => progCard(p))),
    sectionTitle('Kendi antrenmanların', h('a', { href: '#/workout/build', class: 'wk-link' }, 'Yeni oluştur')),
    cs.length ? h('div', { class: 'panel tight' }, h('div', { class: 'list' }, cs.map(c => h('div', { class: 'list-item' },
      h('a', { class: 'li-main wk-plain', href: '#/workout/build/' + c.id }, h('div', { class: 'li-title' }, c.name), h('div', { class: 'li-sub' }, `${c.ex.length} egzersiz · ${locName(c.loc)}`)),
      h('button', { class: 'btn primary sm', type: 'button', disabled: !c.ex.length, onClick: () => begin({ name: c.name, location: c.loc || loc, items: c.ex }) }, icon('play'), 'Başla')))))
      : h('div', { class: 'panel' }, emptyState('list', 'Henüz kendi antrenmanın yok', 'Sık yaptığın egzersizleri bir araya getirip tek dokunuşla başlat.',
        h('a', { class: 'btn primary', href: '#/workout/build' }, icon('plus'), 'Antrenman oluştur'))));
}

function progCard(p) {
  return h('a', { class: 'wk-prog tone-' + p.tone, href: '#/workout/prog/' + p.id },
    h('div', { class: 'wk-prog-txt' },
      h('div', { class: 'wk-prog-name' }, p.short),
      h('div', { class: 'wk-prog-sub' }, `Haftada ${p.perWeek} gün · ${p.mins} dk · ${LEVELS[p.lvl]}`),
      h('span', { class: 'wk-prog-go' }, 'İncele', icon('right'))),
    h('div', { class: 'wk-prog-ic', 'aria-hidden': 'true' }, icon(p.icon)));
}

export function renderProgram(el, id) {
  const p = PROG[id];
  if (!p) { mount(el, backButton('workout'), h('div', { class: 'panel' }, emptyState('alert', 'Program bulunamadı', 'Bu program kaldırılmış olabilir.', h('a', { class: 'btn primary', href: '#/workout' }, 'Programlara dön')))); return; }
  let di = nextDayIdx(p);
  const body = h('div');
  const paint = () => {
    const day = p.days[di];
    mount(body,
      h('div', { class: 'panel tight' }, h('div', { class: 'list' }, day.ex.map((x, i) => exRow(EX[x.id], `${targetText({ sets: x.sets, reps: x.reps, sec: x.sec })} · ${x.rest} sn dinlenme`, {}))),
      ),
      h('button', { class: 'btn primary block lg', type: 'button', onClick: () => begin({ name: `${p.short} · ${day.name}`, location: p.loc, programId: p.id, dayIdx: di, items: day.ex }) }, icon('play'), `${day.name} başlat`));
  };
  const dayTabs = p.days.length > 1 ? tabs(p.days.map((d, i) => ({ id: i, label: d.name })), di, i => { di = i; paint(); }) : null;
  if (dayTabs) dayTabs.classList.add('wk-daytabs');
  paint();
  mount(el,
    backButton('workout'),
    h('section', { class: 'wk-prog-head tone-' + p.tone },
      h('div', { class: 'wk-prog-ic big', 'aria-hidden': 'true' }, icon(p.icon)),
      h('h1', { class: 'hud-title' }, p.short),
      h('p', { class: 'wk-prog-desc' }, p.desc)),
    h('div', { class: 'info-strip wk-strip' },
      h('div', null, h('div', { class: 'is-label' }, icon('calendar'), 'Sıklık'), h('div', { class: 'is-value' }, `${p.perWeek} gün/hafta`)),
      h('div', null, h('div', { class: 'is-label' }, icon('clock'), 'Süre'), h('div', { class: 'is-value' }, `~${p.mins} dk`)),
      h('div', null, h('div', { class: 'is-label' }, icon('bolt'), 'Seviye'), h('div', { class: 'is-value' }, LEVELS[p.lvl]))),
    sectionTitle('Günler'),
    dayTabs, body);
}

// ---------- Kendi antrenmanını oluştur ----------
export function renderBuilder(el, id) {
  const list = customs();
  const existing = id ? list.find(c => c.id === id) : null;
  if (id && !existing) { mount(el, backButton('workout'), h('div', { class: 'panel' }, emptyState('alert', 'Antrenman bulunamadı', 'Silinmiş olabilir.', h('a', { class: 'btn primary', href: '#/workout/build' }, 'Yeni oluştur')))); return; }
  const w = existing ? structuredClone(existing) : { id: uid(), name: '', loc: getLoc(), ex: [] };
  const exBox = h('div');
  const nameIn = h('input', { class: 'input', value: w.name, placeholder: 'Ör. Pazartesi göğüs-kol', maxlength: 40, 'aria-label': 'Antrenman adı', onInput: e => { w.name = e.target.value; } });

  const num = (val, label, step, min, max, on) => h('label', { class: 'wk-num' }, h('span', null, label),
    h('input', { class: 'input', type: 'number', inputmode: 'numeric', value: val, min, max, step, onChange: e => { const v = Math.max(min, Math.min(max, Math.round(+e.target.value || min))); e.target.value = v; on(v); } }));

  function paint() {
    if (!w.ex.length) {
      mount(exBox, h('div', { class: 'panel' }, emptyState('dumbbell', 'Henüz egzersiz yok', 'Aşağıdaki düğmeyle egzersiz ekleyerek başla.')));
      return;
    }
    mount(exBox, w.ex.map((x, i) => {
      const e = EX[x.id];
      const timed = x.sec && !x.reps;
      return h('div', { class: 'panel tight wk-bitem' },
        h('div', { class: 'row' },
          h('span', { class: 'wk-bnum' }, String(i + 1)),
          h('a', { class: 'grow li-title wk-plain', href: '#/workout/ex/' + e.id }, e.name),
          h('button', { class: 'btn icon sm ghost', type: 'button', 'aria-label': 'Yukarı taşı', disabled: i === 0, onClick: () => { [w.ex[i - 1], w.ex[i]] = [w.ex[i], w.ex[i - 1]]; paint(); } }, icon('up')),
          h('button', { class: 'btn icon sm ghost', type: 'button', 'aria-label': 'Aşağı taşı', disabled: i === w.ex.length - 1, onClick: () => { [w.ex[i + 1], w.ex[i]] = [w.ex[i], w.ex[i + 1]]; paint(); } }, icon('down')),
          h('button', { class: 'btn icon sm ghost', type: 'button', 'aria-label': 'Egzersizi çıkar', onClick: () => { w.ex.splice(i, 1); paint(); } }, icon('trash'))),
        h('div', { class: 'wk-bnums' },
          num(x.sets, 'Set', 1, 1, 10, v => { x.sets = v; }),
          timed ? num(x.sec, 'Süre (sn)', 5, 5, 600, v => { x.sec = v; }) : num(x.reps, 'Tekrar', 1, 1, 100, v => { x.reps = v; }),
          num(x.rest, 'Dinlenme (sn)', 15, 0, 600, v => { x.rest = v; })));
    }));
  }
  paint();

  const persist = () => {
    if (!w.name.trim()) { toast('Antrenmana bir ad ver', { type: 'error' }); nameIn.focus(); return false; }
    if (!w.ex.length) { toast('En az bir egzersiz ekle', { type: 'error' }); return false; }
    update(K.custom, l => { const o = (l || []).filter(c => c.id !== w.id); return [...o, w]; }, []);
    return true;
  };
  const locTabs = tabs([{ id: 'home', label: 'Evde' }, { id: 'gym', label: 'Salonda' }], w.loc, v => { w.loc = v; });

  mount(el,
    backButton('workout'),
    h('h1', { class: 'hud-title' }, existing ? 'Antrenmanı düzenle' : 'Yeni antrenman'),
    h('p', { class: 'hud-sub' }, 'Egzersizleri seç, set ve tekrar sayılarını belirle.'),
    h('label', { class: 'field' }, h('span', null, 'Antrenman adı'), nameIn),
    h('div', { class: 'field' }, h('span', null, 'Nerede yapacaksın?'), locTabs),
    sectionTitle('Egzersizler'),
    exBox,
    h('button', { class: 'btn block', type: 'button', onClick: () => pickExercise({ loc: w.loc, onPick: e => { w.ex.push({ id: e.id, sets: e.def.sets, reps: e.type === 'time' ? null : e.def.reps, sec: e.type === 'time' ? e.def.sec : null, rest: e.def.rest }); paint(); toast(`${e.name} eklendi`, { type: 'success' }); } }) }, icon('plus'), 'Egzersiz ekle'),
    h('div', { class: 'wk-actions' },
      h('button', { class: 'btn primary block lg', type: 'button', onClick: () => { if (persist()) { toast('Antrenman kaydedildi', { type: 'success' }); go('workout'); } } }, icon('check'), 'Kaydet'),
      h('button', { class: 'btn block', type: 'button', onClick: () => { if (persist()) begin({ name: w.name, location: w.loc, items: w.ex }); } }, icon('play'), 'Kaydet ve başlat'),
      existing ? h('button', { class: 'btn danger block', type: 'button', onClick: async () => {
        if (await confirmDialog(`"${w.name}" silinsin mi? Bu işlem geri alınamaz.`, { title: 'Antrenmanı sil', okLabel: 'Sil', danger: true })) {
          update(K.custom, l => (l || []).filter(c => c.id !== w.id), []); toast('Antrenman silindi'); go('workout');
        }
      } }, icon('trash'), 'Antrenmanı sil') : null));
}

export { begin };
