# NOVA//2300 — Modül sözleşmesi

Bağımlılıksız (npm yok, derleme yok) saf ES modülleri. `index.html` doğrudan açılır / statik sunulur.

## Dosya sahipliği
- `css/core.css`, `js/core/*`, `js/app.js`, `index.html`, `sw.js` — **çekirdek**, modüller değiştirmez.
- Her modül yalnız kendi klasörüne (`js/modules/<id>/`) ve kendi stil dosyasına (`css/<id>.css`) yazar.

## Varsayılan dışa aktarım
```js
// js/modules/<id>/index.js
export default {
  id: 'run',               // rota #/run  (#/run/abc -> params ['abc'])
  title: 'Koşu',           // sayfa başlığı
  navLabel: 'Koşu',        // alt menü etiketi (≤ 9 karakter)
  icon: 'run',             // js/core/icons.js içindeki ad
  css: true,               // true ise css/<id>.css otomatik yüklenir
  init() {},               // opsiyonel: açılışta bir kez (arka plan sayaçları vb.)
  render(el, params) {     // el: boş <div>; temizleme fonksiyonu döndürebilir
    return () => {};
  },
  // Ana panel (dashboard) için:
  summary(dateKey) {       // dateKey 'YYYY-MM-DD'
    return { label: 'Koşu', value: '5,2', unit: 'km', sub: '1 aktivite', progress: 0.5 /* 0..1 | null */, color: 'var(--magenta)', icon: 'run' };
  },
  burned(dateKey) { return 320; },   // o gün bu modülde yakılan aktif kcal (opsiyonel)
};
```
Ek modüle özel uçlar:
- `steps`: `stepsFor(dateKey) -> number`, `history(n) -> [{date, steps}]`
- `nutrition`: `intake(dateKey) -> { kcal, protein, carbs, fat, waterMl }`

Modüller birbirine `import { getModule } from '../../core/router.js'` ile çalışma anında erişir (döngüsel import yapmayın).

## Çekirdek API (özet)
- `core/store.js`: `load(key, fallback)`, `save(key, v)`, `update(key, fn, fallback)`, `subscribe(key, cb)`, `dateKey(d)`, `todayKey()`, `addDays(k,n)`, `lastNDays(n)`, `daysBetween(a,b)`, `parseKey(k)`
  - Anahtarlar: `profile`, `xp`, `steps`, `runs`, `workouts`, `nutrition`, `foods.custom`, `habits` … her modül kendi önekini kullanır (`run.*`, `workout.*`).
- `core/ui.js`: `h(tag, props, ...children)`, `svg()`, `icon(name)`, `mount(el, ...)`, `fmt.{n,kcal,dist,km,duration,pace,date,time,dateTime,money}`, `toast(msg,{type})`, `modal({title, body, actions})`, `confirmDialog(msg)`, `promptNumber({...})`, `ring({...})`, `progressBar(v,max)`, `barChart(data)`, `sparkline(values)`, `emptyState(icon,title,text,action)`, `sectionTitle(text,right)`, `pageHeader(title,sub,right)`, `stat(label,value,unit)`, `tabs(items,active,onChange)`, `toggle(checked,onChange)`, `stepper(v,{...})`, `haptic()`, `uid()`, `clamp()`
- `core/profile.js`: `getProfile()`, `saveProfile()`, `bmr()`, `tdee()`, `calorieTarget()`, `macroTargets()`, `waterTarget()`, `strideM(p, running)`, `kcalFromMET(met, dk, kg)`, `kcalFromSteps(steps)`
- `core/xp.js`: `awardXP(miktar, sebep, { once: 'tekil-anahtar' })`, `levelInfo()`
- `core/router.js`: `go('run/abc')`, `getModule(id)`, `refresh()`

## CSS sınıfları (core.css)
`panel` (+ `magenta|lime|amber|tight|click`), `panel-title`, `hud-title`, `hud-sub`, `section-title`, `btn` (+ `primary|magenta|lime|danger|ghost|sm|lg|block|icon|round`), `fab`, `chip(.active)`, `chips`, `badge`, `tabs/tab`, `field`, `input`, `select`, `search-box`, `stepper`, `toggle`, `list`, `list-item(.click)`, `li-icon`, `li-main`, `li-title`, `li-sub`, `li-end`, `progress`, `ring`, `bars`, `empty`, `stat/stat-value(.xl)/stat-unit/stat-label`, `row(.wrap/.between)`, `col`, `grow`, `grid-2/3/4`, `mono`, `display`, `muted`, `dim`, `small`, `tiny`, `c-cyan|c-magenta|c-lime|c-amber|c-red|c-violet`, `pulse`, `blink-dot`, `scan`, `divider`.

Değişkenler: `--cyan --magenta --lime --amber --red --violet --blue --text --muted --dim --panel --line --line-strong --font-display --font-body --font-mono --glow-cyan --glow-magenta`.

Tüm arayüz metni **Türkçe**. Tema: 2300 yılı — holografik HUD, neon, cam paneller. Yapay zekâ/robot teması değil; ileri teknoloji biyometrik kokpit.
