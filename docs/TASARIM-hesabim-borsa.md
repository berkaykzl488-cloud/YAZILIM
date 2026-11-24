# TASARIM: Mobil alt çubuk, Hesabım ve Yang Borsası (kart görünümü)

Sürüm 1 · 2026-11-23 · Ürün/UX tasarım belgesi (kod değil). Önce eleştirmen ajan okuyacak, sonra uygulama ajanları yapacak.

**Kapsam (sahibin istekleri):**
1. Mobil alt sekme çubuğu ve Hesabım alanının yeniden tasarımı. Rakip sitenin mantığından yararlanılacak ama tasarım bizim siteye uyarlanacak.
2. Yang Borsası, rakibin ilk fotoğrafındaki gibi kart ızgarası olacak ve her kartta **SAT** ve **AL** düğmesi bulunacak. Kartlarda fiyatlar görünecek. Sipariş işleyişi bizim mevcut işleyişimiz olarak kalacak. Bekleyen siparişler de aynı görsel dille yeniden tasarlanacak.
3. Giriş ve kayıt penceresinde "Google ile devam et" için yer ayrılacak. Google'ın kendisini ayrı ekip yapıyor.

**Sahip kuralı (sahip: "Borsa al sat kartlarında fiyatlar gözüksün"):**
- Her borsa kartında SAT ve AL fiyatı büyük ve okunur şekilde yazılır.
- Fiyat hiçbir durumda gizlenmez; satıcı yokken fiyatın yanında "Şu an satıcı yok" yazar.
- Her sayının hangi alandan geldiği §3.2'de yazılı.

**Temel ilke (sahip: "Mobil için bunlar"):**
- Tasarım önce mobil için yapılır (≤760 px).
- Masaüstünde bugünkü düzen korunur, yalnızca hafif hizalama yapılır. Masaüstünde nelerin değiştiği §8'de tek tek yazılı.

**Değişmeyenler:**
- Para kuralları, havuz (escrow), borsa motoru ve operatör ekranları aynen kalır.
- Sunucudaki doğrulamalar aynen kalır.
- Mevcut form kimlikleri (`#ex_qty`, `#ex_price`, `#exf_*`, `#exb_*`, `#ex_ok`, `form[data-form=exorder|exoffer]`, `button.exgo`) korunur.
- Mevcut eylem adları (`data-act="tab" data-t=…`, `ex-ready`, `ex-fix`, `of-cancel`, `deposit`, `p2-wd` …) korunur.

---

## 0. Ürünümüzden çıkan gerçekler (tasarımı bunlar belirliyor)

| Konu | Bizde nasıl | Tasarıma etkisi |
|---|---|---|
| **Cüzdan** | Tek cüzdan, iki kova: `bal` = **Çekilebilir** (EFT yüklemesi ve satış geliri), `bonus` = **Yalnız alışveriş** (kart, kripto, bonus, puan). Harcamada önce `bonus` kullanılır. | Bakiye kartında hep iki satır görünür. Kovalar "alıcı/satıcı bakiyesi" değil, **paranın kaynağı**dır. |
| **Havuz** | İlan siparişi: alıcı ödemesi `ESCROW:ORD`'a gider, onayda satıcının çekilebilir kovasına geçer. Borsa: alıcı ödemesi `ESCROW:EX`'e gider, her teslimde satıcıya geçer. | Rakipteki "Bloke tutar"ın bizdeki karşılığı **"Havuzdaki ödemelerim"** (alıcı) ve **"Havuzdaki satışlarım"** (satıcı). Bir de **çekim bekleyen** tutar var. |
| **Roller** | Her üye hem alıcı hem satıcı. Satıcı mağazası ya da şirket kaydı yok. | Alıcı/Satıcı geçişi kullanılmaz (§2.1). |
| **Borsa pazarı** | `ex_markets`: server başına `buy` (sitenin sabit satış fiyatı, alıcı bunu öder), `max` (satıcının girebileceği en yüksek birim fiyat), `margin_bp` (iç), `unit` (ör. `100M`, `1 Won`), `on`. Sunucu sunumu: `{id:'x1', server, unit, buy, max, margin, on}`. | Kartta AL fiyatı = `buy`, SAT fiyatı = `max` ("en fazla"). |
| **Borsa alımı** | `POST exchange/orders {market, qty, f}` (Idempotency-Key). Tutar `qty × buy`, ödeme bakiyeden alınır. **Stok yetmese de sipariş alınır**, kalanı satış emri geldikçe tamamlanır. | Stok 0 iken de AL çalışır; kartta "Şu an satıcı yok" yazar (§3.2). |
| **Borsa satışı** | `POST exchange/offers {market, qty, price≤max, f, ok}`. Hesap bilgileri istenir, gizli alanlar şifreli saklanır. Emir para tutmaz. Sahibi iptal edebilir (`of-cancel`). | SAT akışı 3 adımlı alt pencere olur (§3.3). |
| **Sipariş yaşam döngüsü** | `bekliyor → islemde → (bilgi) → kismen → tamam / iptal`. Operatör çağırınca `called` dolar, üye "Geldim, hazırım" der (`ready`). Bilgi istenirse üye "Bilgileri güncelle" der (`ex-fix`). Alım siparişini üye **iptal edemez**, yalnız operatör iptal eder. | Bekleyen işlemler kartı bu durumları ve yalnız bu iki üye eylemini gösterir (§3.5). |
| **Canlı destek** | Demoda var (`#ls` balonu, `ls-fab`). Canlı sitede (prod) henüz yok, P6'da gelecek. `renderLS` prod'da boş. | Destek sekmesi iki kipte çalışır (§1.4). |
| **Mesajlar** | Prod'da "yakında". | Hesap menüsüne ancak açılınca eklenir (kayıt defteri, §2.4). |
| **Üyeye görünen metin** | e-Gider, pusula, VUK, ETTN ifadeleri üyeye **asla** gösterilmez. Yalnız "İşlem ücreti" ve "Vergi kesintisi" yazılır. | Özetim'de ve çekim kartlarında da bu kural geçerli. |

---

## 1. Mobil alt sekme çubuğu (≤760 px)

### 1.1 Karar: 5 öğe

```
┌──────────────────────────────────────────┐
│  🎧•     🏪       ⌂        📈•      👤 ③  │
│ Destek  Pazar  Ana sayfa  Borsa  Hesabım │
└──────────────────────────────────────────┘
```

| # | Öğe | Ne yapar | Neden |
|---|---|---|---|
| 1 | **Destek** | Demo: canlı sohbeti açar (`ACT['ls-open']`). Prod (P6 öncesi): "Yardım" alt penceresi açar (§1.4). Çalışan (`can('destek')`) için: `admin-tk`. | Para sitesinde güven ve hızlı yardım önemli. Böylece sağ alttaki **Canlı Destek balonu mobilde kalkar** ve kartların üstünü kapatmaz. |
| 2 | **Pazar** | "Pazar" alt penceresini açar: Metin2 TR, Metin2 PVP, Metin2 EP, İlanlarda ara, **+ İlan ver** (§1.5). | Tek bir "tüm ilanlar" sayfamız yok; pazar TR, PVP ve EP olarak bölünmüş. Mobil başlıkta gizlenen **İlan Ver** de burada görünür bir yer bulur. |
| 3 | **Ana sayfa** | `#home` | Alışkanlık. Ortada durur. |
| 4 | **Borsa** | `#borsa` | Rakipteki "Sepet"in yerine. Bizde sepet yok. Borsa en çok gelir getiren ve sahibin öncelik verdiği ürün. |
| 5 | **Hesabım** | Girişliyken `#hesabim` (Özetim) açılır. Hesabım sayfasındayken yeniden dokunulursa **hesap menüsü** açılır (§2.4). Girişsizken etiket **"Giriş"** olur ve giriş penceresini açar. | Tek dokunuşla en önemli bilgi (yapılacaklar ve bakiye). İkinci dokunuşta tüm menü. |

**Değerlendirilip seçilmeyenler:**
- **İlan Ver ortada:** Alıcılar satıcılardan çok daha sık geliyor. İlan Ver; Pazar penceresinde, Hesabım'da (Satışlarım ve Özetim) ve ☰ çekmecede var.
- **Borsa yerine İlan Ver:** Sahibe soruluyor (§F-1).

### 1.2 Etkin durum ve rozetler

**Hangi sayfada hangi öğe etkin olur:**

| Öğe | Etkin olduğu sayfalar |
|---|---|
| Ana sayfa | `home` |
| Borsa | `borsa` |
| Pazar | `metin2-tr`, `metin2-pvp`, `metin2-ep`, `serverler`, `kategori-*`, `server-*`, `ilan-*` (`ilan-ver` hariç), `ara`, `uye-*` |
| Hesabım | `hesabim`, `bildirimler`, `mesajlar*`, `siparis-*`, `ilan-ver` |
| Destek | Sohbet ya da Yardım penceresi açıkken |

**Etkin öğenin görünümü:**
- Simge ve etiket `--accent` renginde olur.
- Öğenin üstünde 3 px'lik bir `--accent` çizgisi çıkar.
- Öğe `aria-current="page"` alır.
- Diğer öğeler `--muted` renginde kalır.

**Rozetler:**

| Öğe | Rozet | Kaynak |
|---|---|---|
| Hesabım | Kırmızı sayı (`--bad`): **yapılacak iş sayısı**. Bildirim sayısı değildir; zil zaten başlıkta. | `summary.todo.total` (§2.3, yeni `me/summary`, açılışta `boot.summary`) |
| Borsa | Turuncu nabız noktası (`--warn`): **operatör seni bekliyor**. | `summary.todo.exCall > 0`. Ayrıca `S.exOrders` içinde `called && !(ready>called)` olan açık bir sipariş varsa. |
| Destek | Yeşil nokta (`--ok`) temsilciler çevrimiçiyse (`supportOpen()`). Okunmamış destek mesajı varsa kırmızı sayı (`myTicket().unread`). Prod'da P6'ya kadar rozet yok. | Mevcut |

**Rozet ayrıntıları:**
- Rozet `aria-label` taşır, örneğin "3 bekleyen iş".
- 99'dan büyük sayılar `99+` olarak gösterilir.

**Rozet ne zaman tazelenir:**
- `summary` önbelleği (`need('me:sum')`, 60 sn) şu durumlarda düşürülür:
  1. Yoklamada yeni bildirim gelirse (`poll.notifs.length>0`).
  2. Yoklamada `exSig` değişirse.
  3. Üyenin kendi para eylemlerinden sonra (`p4After`, sipariş, çekim, yükleme işleyicileri).
- Sitede her durum değişikliği zaten bildirim üretiyor. Bu yüzden **yoklamaya yeni alan gerekmez.**

### 1.3 Ölçüler, güvenli alan, gizlenme

**Ölçüler:**
- Çubuk `position:fixed; left:0; right:0; bottom:0; z-index:85` ile konumlanır. Modal `.mb` 100, ☰ çekmece 90/91 olduğundan çubuk bunların altında kalır.
- Yükseklik `--mtab-h: 58px` artı `padding-bottom: env(safe-area-inset-bottom)`.
- Çubuğun kendi kenar boşlukları: `padding-left: env(safe-area-inset-left)` ve `padding-right: env(safe-area-inset-right)`.
- Zemin `--surface`, üstte `1px solid var(--line)` kenar ve hafif üst gölge.
- Simge 22 px, etiket 11 px / 600. Her hücre en az 48 px dokunma alanı, `display:grid; grid-template-columns:repeat(5,1fr)`.

**İçeriğin çubuğun altında kalmaması:**
- `:root` zaten `padding-bottom: env(safe-area-inset-bottom)` taşıyor.
- `body.has-mtab` yalnızca `padding-bottom: var(--mtab-h)` ekler, güvenli alan iki kez sayılmaz.

**Yerleştirme (demo anlık görüntüsünü bozmamak için önemli):**
- Çubuk `#mtab` adıyla `body` sonuna eklenir, `#app` içine konmaz.
- **Yalnızca `matchMedia('(max-width:760px)')` doğruyken DOM'a eklenir**, değilse kaldırılır.
- Masaüstünde (1280 px anlık görüntü) DOM aynı kalır.

**Çubuğun gizlendiği durumlar** (önce `transform: translateY(110%)` ile kayar, sonra `visibility:hidden` olur):

| Durum | Nasıl algılanır |
|---|---|
| Klavye açık | `focusin` olayında hedef `input` (checkbox/radio hariç), `textarea`, `select` ya da `[contenteditable]` ise `html.kbd` eklenir. `focusout` olayında 100 ms sonra kaldırılır. Yedek olarak `visualViewport.height < innerHeight*0.75` kontrolü yapılır (`70-support.js`'deki `vvSync` dinleyicisi örnek alınır). |
| Modal veya alt pencere açık | CSS `body:has(#modal .mb) #mtab` kullanılır. `modal()` değiştirilmez, böylece demo DOM'u aynı kalır. |
| ☰ çekmece açık | `body.mnav-open` |
| Canlı destek paneli açık | `html.lsopen` |
| Yönetim paneli | `body.adm-mode` |
| Gömülü pencere | `body.wmode` |
| Bakım modu (ziyaretçi) | `maintOn() && !isPanel()`: çubuk hiç eklenmez. |

**Hareket:**
- Kaydırırken çubuk gizlenmez. Hep yerinde durur ve tahmin edilebilir olur.
- `prefers-reduced-motion` açıksa geçişler kapatılır.

### 1.4 Destek sekmesi ve "Canlı Destek" balonu (çakışma yok)

**Balon:**
- ≤760 px'te çubuk görünürken `body.has-mtab .ls-fab{display:none}` kuralı uygulanır. Çalışanların "Destek talepleri" balonu da buna dahil.
- Masaüstünde balon aynen kalır.

**Demo (canlı destek var):**
- Destek sekmesi `ACT['ls-open']` çağırır.
- Panel açılınca `html.lsopen` eklenir ve çubuk gizlenir.
- Panel kapanınca çubuk geri gelir.

**Prod (P6'ya kadar): "Yardım" alt penceresi**

```
┌───────── Yardım ─────────── × ┐
│ ▸ Siparişimle ilgili sorun      │ → Hesabım › Siparişlerim
│ ▸ Borsa işlemim                 │ → Hesabım › Borsa işlemlerim
│ ▸ Güvenli alışveriş ve SSS      │ → #guvenli
│ ▸ Rehber                        │ → #rehber
│ [ WhatsApp destek hattı ]       │ yalnız S.set.supportWa doluysa
│ Ekibimiz sizden asla şifre veya │
│ doğrulama kodu istemez.         │
└─────────────────────────────────┘
```

- Canlı destek prod'a gelince (P6) bu pencerenin en üstüne "Canlı destek" satırı eklenir.
- Ya da Destek sekmesi doğrudan sohbeti açar.
- Bu seçim `MTAB.destek` adlı bir işlevle yapılır. P6 dosyası bu işlevi değiştirebilir.

### 1.5 Pazar alt penceresi

```
┌────────── Pazar ─────────── × ┐
│ [🏳] Metin2 TR                  ›│  #metin2-tr   "Won, item, karakter"
│ [⚔] Metin2 PVP serverlar       ›│  #metin2-pvp  "{n} server"
│ [◆] Metin2 EP                  ›│  #metin2-ep   "Anında kod"
│ [🔎] İlanlarda ara               │  alt pencere kapanır, #hdr .search input odaklanır
│ ┌─────────────────────────────┐ │
│ │        + İlan ver           │ │  #ilan-ver (btn-primary)
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

- Satırlar ☰ çekmecedeki `.mn-i` görünümünü yeniden kullanır (simge kutusu ve 48 px yükseklik).
- Pencere açıkken Pazar'a yeniden dokunulursa pencere kapanır.

### 1.6 ☰ çekmeceyle birlikte yaşama

**☰ çekmece site gezintisi olarak kalır:**
- Kategoriler (aynen)
- Tema düğmesi
- Giriş / Üye ol veya Çıkış

**"Hesabım" bölümü sadeleşir** (`43-mnav.js` → `acc`):
- Kalanlar: "Yönetim Paneli" (yalnız `isPanel()`) ve "İlan Ver".
- Çıkanlar: "Hesabım", "Mesajlar", "Bildirimler".
  - Hesabım'a üstteki `.mn-who` kartıyla ve alt çubukla gidilir.
  - Mesajlar ve Bildirimler için başlıkta zarf ve zil simgeleri ve hesap menüsü var.
- Bu değişiklik **demo DOM'unu bilerek değiştirir.** Anlık görüntü farkı yalnızca `#mnav` içinde çıkmalıdır (§E.3).

### 1.7 Girişsiz kullanım

- Çubuk görünür. Destek, Pazar, Ana sayfa ve Borsa aynen çalışır.
- 5. öğe **"Giriş"** olur (simge `giris`) ve `mAuth('giris')` çağırır (§4).
- Rozet gösterilmez.
- Borsa kartında SAT/AL'a girişsiz dokunulursa giriş penceresi açılır ve üstte şu not görünür: "Devam etmek için giriş yap veya üye ol".
- Giriş başarılı olursa aynı alt pencere kendiliğinden yeniden açılır. Bunun için `ui.afterAuth = {k:'bx', id, dir}` saklanır ve `pAfterAuth` sonrası kontrol edilir.

### 1.8 Bileşen ve dosya

**Yeni paylaşılan dosya `src/js/44-mtab.js`** (manifest'te `43-mnav.js`'den hemen sonra):
- `MTAB_I`: simgeler. Mevcut `MNI` sözlüğüne `destek` (kulaklık) ve `pazar` (dükkân) eklenir.
- `mtabHtml(r)`, `mtabMount()`, `mtabSync()`: etkin durum ve rozet güncellemesi.
- `MTAB = {destek(), pazar(), hesabim()}`: dokunma işleyicileri. Prod dosyaları bunları değiştirebilir.
- `sheetWrap(title, body, {cls, foot, label})`: alt pencere kabuğu (§1.9).
- Bağlantı: `renderHeader` sarmalanır, tıpkı `43-mnav.js`'in yaptığı gibi. Her `render()` sonunda `mtabSync()` çağrılır, bunun için `renderFooter` ya da `renderLS` sarmalanabilir. `matchMedia(...).addEventListener('change', …)` da eklenir.
- Dinleyiciler `data-mtab="…"` özniteliğine bağlanır. `data-act` kullanılmaz, böylece bakım modunda da çalışır (`43-mnav.js` ile aynı yaklaşım).

**CSS:** `src/app.css` sonuna "alt sekme çubuğu" bölümü eklenir. Sınıflar: `.mtab`, `.mtab-i`, `.mtab-i.on`, `.mtab-b`, `.mtab-dot`.

### 1.9 Ortak alt pencere bileşeni (`.md.sheet`)

- `modal(sheetWrap(...))` ile açılır. Var olan `.mb` örtüsü, `data-act="close"` ve `closeModal()` kullanılır.
- **≤760 px:**
  - `.mb` hizası `align-items:end; padding:0` olur.
  - `.md.sheet` genişliği `100%`, köşeleri `16px 16px 0 0`, yüksekliği en fazla `92dvh`.
  - Üstte 36×4 px tutamak (`.sheet-grip`) bulunur.
  - Gövde kaydırılabilir. İsteğe bağlı yapışkan alt bölüm (`.sheet-f`) `padding-bottom: calc(12px + env(safe-area-inset-bottom))` alır.
- **>760 px:** normal ortalanmış modal olarak açılır (`.md`), görünüm değişmez.
- **Sağ çekmece kipi (`.md.side`):** hesap menüsü için kullanılır (§2.4).
  - ≤760 px'te sağdan açılır: `width:min(88vw,360px)`, `height:100dvh`, `margin-left:auto`, köşesiz.
  - Masaüstünde hesap menüsü kullanılmaz.
- **Erişilebilirlik:**
  - Kabukta `role="dialog" aria-modal="true" aria-label` bulunur.
  - Esc ile kapanır (mevcut modal davranışı).
  - Açılınca ilk odaklanabilir öğeye odaklanılır.

---

## 2. Hesabım yeniden tasarımı

### 2.1 Karar: Alıcı/Satıcı geçişi KULLANILMAZ

Rakip, mağaza ve şirket kaydı olan ayrı bir satıcı kimliği yönettiği için geçiş kullanıyor. Bizde:

1. **Tek cüzdan var.** Kovalar rol değil, paranın kaynağıdır. "Satıcı bakiyesi" yazmak yanlış olur. Satış geliri de çekilebilir kovaya, EFT yüklemesi de aynı kovaya gidiyor.
2. **Yang ticaretçisi aynı oturumda hem alır hem satar.** Borsada aynı kişi hem alım siparişi hem satış emri verir.
3. **Geçiş acil işi saklar.** "Alıcı" kipindeki bir satıcı, teslim süresi dolan siparişini görmeyebilir. Süre dolarsa garanti iadesi işler ve satıcı satışı kaybeder. Operatörün "Geldim, hazırım" çağrısı da alıcı tarafında kaçabilir.
4. **Fazladan dokunuş ve fazladan durum** (hangi kipteyim?) gerekir.

**Bunun yerine:**
- Tek bir **Özetim** sayfası.
- En üstte **"Yapılacaklar"** listesi (iki rolün acil işleri bir arada).
- Ardından cüzdan.
- Sonra **yalnız ilgili olduğunda görünen** "Satış özeti" ve "Alış özeti" bölümleri.
- Menüde roller **grup başlığı** olarak durur: "Alışlarım" ve "Satışlarım".

### 2.2 Özetim (mobil, 390 px)

```
┌────────────────────────────────────────┐
│ (D) Merhaba Deniz   [GÜMÜŞ]    [☰ Menü]│  .hs-top
│     Üye no #1024                        │
├────────────────────────────────────────┤
│ YAPILACAKLAR                         3 │  .hs-todo (yalnız iş varsa)
│ ┌────────────────────────────────────┐ │
│ │⚠ Operatör seni bekliyor · #B1003   │ │  (--warn kenar)
│ │  CH2 · Mavi bayrak · Gardiyan yanı │ │
│ │  [ Geldim, hazırım ]               │ │  data-act=ex-ready data-id
│ ├────────────────────────────────────┤ │
│ │📦 2 satışta teslimat seni bekliyor │›│  tab satis
│ ├────────────────────────────────────┤ │
│ │✔ 1 siparişte onayın bekleniyor     │›│  tab alis
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ BAKİYEM                                │  .hs-wallet (kart, --gold-soft zemin)
│ ₺1.500,00                              │
│ Çekilebilir ₺1.200,00 · Alışveriş ₺300 │
│ [ + Bakiye yükle ]  [ ↑ Para çek ]     │
├───────────────────┬────────────────────┤
│ HAVUZDAKİ         │ HAVUZDAKİ          │  .hs-kpi ×2
│ ÖDEMELERİM        │ SATIŞLARIM         │
│ ₺250,00           │ ₺480,00            │
│ Teslim alınca     │ Alıcı onaylayınca  │
│ satıcıya geçer    │ bakiyene geçer     │
├───────────────────┼────────────────────┤
│ ÇEKİM BEKLEYEN    │ BU AY HARCAMA      │
│ ₺500,00           │ ₺1.240,00          │
│ 1 talep           │ 7 işlem            │
├───────────────────┴────────────────────┤
│ PARA ÇEKMEYE HAZIR MISIN?        4 / 6 │  .hs-prof (tamamsa küçük satır)
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░                    │
│ ✔ Ad soyad   ✔ Telefon   ✔ E-posta      │
│ ✖ T.C. kimlik doğrulama   [Doğrula ›]  │  gerekli
│ ✖ IBAN                    [Ekle ›]     │  gerekli
│ ✔ 2 adımlı doğrulama (önerilir)        │
├────────────────────────────────────────┤
│ SATIŞ ÖZETİ                 [+ İlan ver]│  .hs-sec (yalnız satıcıysa)
│ Bugün ₺120 · 2  │ 7 gün ₺640 · 9 │ 30 g │  .hs-strip (3 hücre)
│ Aktif ilan 12 (1 onay bekliyor)       › │  tab ilan
│ Borsa satış emri 2 aktif · 30 adet    › │  tab borsa, alt sekme sat
├────────────────────────────────────────┤
│ ALIŞ ÖZETİ                             │  .hs-sec
│ Açık sipariş 3                        › │  tab alis
│ Borsa alımı 1 açık                    › │  tab borsa, alt sekme al
│ EP kodlarım                           › │  tab ep
├────────────────────────────────────────┤
│ Davet kodun  ARKADAS26   [Kopyala]      │  (mevcut kart, en altta)
└────────────────────────────────────────┘
│ Destek  Pazar  Ana sayfa  Borsa  Hesabım│
```

**Kartlar ve veri kaynakları:**

| Kart / alan | Gösterilen | Kaynak | Yeni mi? |
|---|---|---|---|
| Üst satır | `av(u)`, "Merhaba {u.ad \|\| u.name}", `vipBadge(u)`, "Üye no #{u.id sayı kısmı}" | `me` (boot / patch) | – |
| Yapılacaklar: operatör çağrısı | Her `o` için `o.called && exOpenSt(o.status) && !(o.ready>o.called)`: no, `o.callMsg`, `o.place`, **[Geldim, hazırım]** (`ex-ready`) | `S.exOrders` (`me/exchange`, `need('me:ex')`). Sayı `summary.todo.exCall`. | – (mevcut `myCallNotes` içeriği kart olarak) |
| Yapılacaklar: bilgi istendi | `status==='bilgi'`: `o.note`, **[Bilgileri güncelle]** (`ex-fix`) | aynı | – |
| Yapılacaklar: teslim bekleyen satış | `summary.todo.sell` ("N satışta teslimat seni bekliyor") → `tab satis` | `me/summary` | **YENİ** |
| Yapılacaklar: onay bekleyen alış | `summary.todo.buy` → `tab alis` | `me/summary` | **YENİ** |
| Yapılacaklar: itiraz | `summary.todo.disp` ("N siparişte itiraz sürüyor") → ilgili sekme | `me/summary` | **YENİ** |
| Yapılacaklar: kimlik isteği | `u.tcAsk` doluysa "Ödemen için T.C. numaranı onayla" → `tab cek` | `me` | – |
| Yapılacaklar: ilan onayı | Bilgi amaçlı, eylem yok: `summary.sell.pendingListings` ("1 ilanın onay bekliyor") | `me/summary` | **YENİ** |
| Bakiyem | `avail(u)`, `u.bal`, `u.bonus`; **[+ Bakiye yükle]** (`data-act=deposit`), **[↑ Para çek]** (`data-act=p2-wd`) | `me` ve yoklamadaki `wallet` dilimi | – |
| Havuzdaki ödemelerim | `summary.buy.escrow + summary.ex.escrowLeft` | `me/summary` | **YENİ** |
| Havuzdaki satışlarım | `summary.sell.escrowNet` | `me/summary` (bugün `p2Ozet` ilk 50 satıştan hesaplıyor, eksik sayabilir) | **YENİ** |
| Çekim bekleyen | `summary.wd.pending` (tutar) ve `summary.wd.n` | `me/summary` (yedek: `me/withdrawals` `bekliyor` toplamı) | **YENİ** |
| Bu ay harcama | `summary.buy.monthSpend`, `summary.buy.monthN` | `me/summary` | **YENİ** |
| Para çekmeye hazır mısın? | §2.5 | `me` | – |
| Satış özeti | `summary.sell.d1/d7/d30 {n, net}`, `activeListings`, `pendingListings`, `summary.ex.activeOffers`, `summary.ex.offersLeft` | `me/summary` | **YENİ** |
| Alış özeti | `summary.buy.open`, `summary.ex.openOrders`; EP kodlarım bağlantısı | `me/summary` | **YENİ** |
| Davet kodu | `u.refCode` | `me` | – |

**Bölümlerin ne zaman görüneceği:**
- **Satış özeti:** `summary.sell.activeListings + pendingListings + d30.n + escrowNet` toplamı 0'dan büyükse ya da `ex.activeOffers > 0` ise görünür.
- Değilse aynı yerde boş durum kartı görünür: "Satmaya başla: İlk ilanını ver ya da borsada yangını sat. [İlan ver] [Borsada sat]".
- **Alış özeti:** her zaman görünür. Hepsi 0 ise "Henüz alışverişin yok. [Pazara göz at]" yazar.

**Yükleme sırası:**
- `boot.summary` hemen çizilir.
- `need('me:sum', GET me/summary, 60000)` ile tazelenir.
- Veri yoksa kartlar iskelet (`pLoading`) gösterir.
- **Özetim, sipariş ve işlem listelerini yüklemez.** Yalnızca `me/summary` çağrılır. `me:ex` yalnızca `summary.todo.exCall + exInfo > 0` ise çağrılır, çünkü kartta sipariş no ve mesaj gerekiyor.

### 2.3 Yeni sunucu ucu: `GET me/summary` (ve `boot.summary`)

**Dosya ve güvenlik:**
- Yeni dosya: `app/routes/21_me_summary.php`. Rota dosyaları glob ile yükleniyor.
- Ayrıca `Hooks::on('boot', …)` kullanılır: üye girişliyse `$data['summary']` eklenir.
- Erişim `['auth'=>'user','csrf'=>false]`.
- Yalnızca kişinin kendi verisi döner. Yazma yapılmaz.
- Tutarlar `Text::tl` ile döner.

**Yanıt (`data`):**

```json
{
  "todo": { "total": 4, "buy": 1, "sell": 2, "disp": 0, "exCall": 1, "exInfo": 0 },
  "buy":  { "open": 3, "escrow": "250.00", "monthSpend": "1240.00", "monthN": 7 },
  "sell": { "deliver": 2, "escrowNet": "480.00",
            "d1": {"n":2,"net":"120.00"}, "d7": {"n":9,"net":"640.00"}, "d30": {"n":31,"net":"2210.00"},
            "activeListings": 12, "pendingListings": 1 },
  "ex":   { "openOrders": 1, "escrowLeft": "125.00", "activeOffers": 2, "offersLeft": 30 },
  "wd":   { "pending": "500.00", "n": 1 }
}
```

**Alanların hesaplanması** (şema: PLAN §3; zaman unix ms; "bugün" ve "bu ay" Europe/Istanbul gece yarısından):

| Alan | Sorgu |
|---|---|
| `todo.buy` | `orders` WHERE `buyer_id=? AND status='teslim'` |
| `todo.sell` = `sell.deliver` | `orders` WHERE `seller_id=? AND status='odendi'` |
| `todo.disp` | `orders` WHERE `(buyer_id=? OR seller_id=?) AND status='itiraz'` |
| `todo.exCall` | `ex_orders` WHERE `user_id=? AND status IN (OPEN) AND called_at IS NOT NULL AND (ready_at IS NULL OR ready_at < called_at)` |
| `todo.exInfo` | `ex_orders` WHERE `user_id=? AND status='bilgi'` |
| `todo.total` | Yukarıdakilerin toplamı (`disp` dahil) |
| `buy.open`, `buy.escrow` | `orders` WHERE `buyer_id=? AND status IN ('odendi','teslim','itiraz')`: COUNT, SUM(`total`) |
| `buy.monthSpend`, `monthN` | Üyenin `cash` ve `credit` hesaplarındaki eksi kayıtlar (`postings` ⨝ `journal`). `journal.kind IN ('satin_alma','ep','doping','reklam','sms')` ve `journal.t >= ay başı`. Aynı ayın `iade` kayıtları düşülür. Uygulayıcı borsa alımının `satin_alma` olduğunu doğruladı (`Exchange::placeOrder`). EP kodu türünü `Ep.php`'den doğrulamalı. |
| `sell.escrowNet` | `orders` WHERE `seller_id=? AND status IN ('odendi','teslim','itiraz')`: SUM(`net`) |
| `sell.d1/d7/d30` | `orders` WHERE `seller_id=? AND status='tamam' AND confirmed_at >= sınır`: COUNT, SUM(`net`) |
| `sell.activeListings` / `pendingListings` | `listings` WHERE `seller_id=? AND status='aktif' AND stock>0` / `status='beklemede'` |
| `ex.openOrders`, `ex.escrowLeft` | `ex_orders` WHERE `user_id=? AND status IN (OPEN)`: COUNT, SUM(`(qty-delivered)*price`) |
| `ex.activeOffers`, `offersLeft` | `ex_offers` WHERE `user_id=? AND status='aktif'`: COUNT, SUM(`left_qty`) |
| `wd.pending`, `n` | `withdrawals` WHERE `user_id=? AND status='bekliyor'`: SUM(`amount`), COUNT |

**Notlar:**
- Toplam yaklaşık 12 COUNT/SUM sorgusu, hepsi var olan dizinler üzerinde (`(buyer_id,created_at)`, `(seller_id,created_at)`, `(market_id,status,…)`).
- Paylaşımlı sunucu için uygundur. Yoklamaya **eklenmez**, 60 sn önbellek kullanılır.
- **Test:** `tests/unit_hs.php` adlı yeni bir dosya. SQLite fikstürüyle her alan için bir durum kurulur, `todo.total` doğrulanır ve başka üyenin verisinin sızmadığı kontrol edilir.

### 2.4 Hesap menüsü: gruplar ve eski sekmelerin yeni yerleri

Menü verisi tek yerden gelir: `P_ACC_NAV` (prod, `97h-hesabim.js`). Bu, bir grup dizisidir:

```js
P_ACC_NAV = [
 {g:'Yönetim',  only:()=>isPanel(), items:[{href:'#yonetim', l:'Yönetim paneli', ic:'yonetim', cls:'accent'}]},
 {g:'Genel',    items:[{t:'ozet',l:'Özetim'}, {href:'#bildirimler',l:'Bildirimlerim',badge:unread}]},
 {g:'Alışlarım',items:[{t:'alis',l:'Siparişlerim',badge:todo.buy}, {t:'borsa',s:'al',l:'Borsa alımlarım',badge:todo.exCall+todo.exInfo}, {t:'ep',l:'EP kodlarım'}]},
 {g:'Satışlarım',items:[{t:'ilan',l:'İlanlarım'}, {t:'satis',l:'Satışlarım',badge:todo.sell}, {t:'borsa',s:'sat',l:'Borsa satış emirlerim'}, {href:'#ilan-ver',l:'+ İlan ver'}, {t:'reklam',l:'Reklamlarım'}]},
 {g:'Cüzdan',   items:[{act:'deposit',l:'Bakiye yükle'}, {t:'cek',l:'Para çek'}, {t:'hareket',l:'Bakiye hareketleri'}, {t:'banka',l:'Banka hesaplarım'}]},
 {g:'Kazan',    items:[{t:'puan',l:'VIP & Puan'}, {t:'davet',l:'Davet et kazan'}, {href:'#cekilis',l:'Çekiliş & Çark'}]},
 {g:'Hesap',    items:[{t:'profil',l:'Profil ve güvenlik'}]}
];
```

**"Hiçbir şey kaybolmaz" kuralı:**
- Menü, `p2AccTabs(u,P_TABS)` zincirinin döndürdüğü **her** sekme anahtarını içerir.
- Bu zincir P2, P3, P4 ve P5 dosyalarının sekme eklemelerini toplar.
- Gruplarda bulunmayan bir anahtar otomatik olarak sonda **"Diğer"** grubuna eklenir.
- İleriki aşamalar (ör. P6 Mesajlar) `P_ACC_NAV` dizisine öğe ekler. P6 gelince Mesajlar, Genel grubuna `{href:'#mesajlar', l:'Mesajlarım', badge:unreadDM}` olarak girer.

**Eski sekme → yeni yer eşlemesi** (anahtarlar değişmez, `data-act="tab" data-t=…` her yerde çalışmaya devam eder):

| Eski sekme (prod etiketi) | Anahtar | Yeni grup › etiket | İçerik |
|---|---|---|---|
| Özet | `ozet` | Genel › **Özetim** | Yeni Özetim (§2.2) |
| Siparişlerim | `alis` | Alışlarım › Siparişlerim | Aynen (`p2OrdersTab b`), mobilde §2.6 kart dili |
| Satışlarım | `satis` | Satışlarım › Satışlarım | Aynen (`p2OrdersTab s`) |
| Bakiye hareketleri | `hareket` | Cüzdan › Bakiye hareketleri | Aynen (VIP kartı ve yükleme bildirimleri dahil) |
| Para çek | `cek` | Cüzdan › Para çek | Aynen (`p3Cek`: TC kapısı, tam TC onayı, form, taleplerim). **e-Gider ifadesi yok.** |
| Borsa işlemlerim | `borsa` | Alışlarım › Borsa alımlarım (`ui.hsBx='al'`) **ve** Satışlarım › Borsa satış emirlerim (`ui.hsBx='sat'`) | Aynı sekme, içinde "Alımlarım / Satış emirlerim" bölmesi (§3.5) |
| EP kodlarım | `ep` | Alışlarım › EP kodlarım | Aynen (`p4AccEp`) |
| İlanlarım | `ilan` | Satışlarım › İlanlarım | Aynen ve üstte durum çipleri (§2.6) |
| Reklamlarım | `reklam` | Satışlarım › Reklamlarım | Aynen (`p5Reklam`) |
| VIP & Puan | `puan` | Kazan › VIP & Puan | Aynen |
| Davet et kazan | `davet` | Kazan › Davet et kazan | Aynen |
| Profil ve güvenlik | `profil` | Hesap › Profil ve güvenlik | Aynen: profil formu, **2 adımlı doğrulama** (`tfaPanel`, WhatsApp seçeneği `98w-whatsapp.js`), **kampanya iletileri** (`p5MktPanel`), çıkış |
| Banka hesaplarım | `banka` | Cüzdan › Banka hesaplarım | Aynen |
| (rota) Bildirimler | `#bildirimler` | Genel › Bildirimlerim | Rozet: okunmamış sayısı |
| (rota) Yönetim | `#yonetim` | En üstte Yönetim (yalnız `isPanel()`) | Vurgulu (accent) satır |
| (eylem) Bakiye yükle | `deposit` | Cüzdan › Bakiye yükle | Yükleme penceresi |
| (rota) İlan ver, Çekiliş | `#ilan-ver`, `#cekilis` | Satışlarım / Kazan | Bağlantı |
| Çıkış | `logout` | Menünün en altında, kırmızı çerçeveli düğme | |

**Mobil hesap menüsü (`.md.side`, sağdan açılır):**

```
┌─────────────────────────────── × ┐
│ (D) Deniz_TR  [GÜMÜŞ]            │  .hs-who
│     Deniz Kaya · Üye no #1024    │
│ ┌──────────────────────────────┐ │
│ │ Bakiyem        ₺1.500,00  [+]│ │  [+] = deposit
│ │ Çekilebilir ₺1.200 · Alışv.  │ │
│ │ ₺300                    [↑]  │ │  [↑] = tab cek
│ └──────────────────────────────┘ │  (u.admin ise bu kart yok)
│ [▦ Yönetim paneli            ]   │  (isPanel)
│ GENEL                            │
│  ▦ Özetim                    ●   │  (etkinse vurgulu)
│  🔔 Bildirimlerim             2   │
│ ALIŞLARIM                        │
│  📦 Siparişlerim              1   │
│  📈 Borsa alımlarım           1   │
│  ◆ EP kodlarım                   │
│ SATIŞLARIM                       │
│  🏷 İlanlarım                     │
│  💰 Satışlarım                2   │
│  📈 Borsa satış emirlerim         │
│  ⊕ İlan ver                      │
│  📣 Reklamlarım                   │
│ CÜZDAN                           │
│  ＋ Bakiye yükle · ↑ Para çek ·   │
│  ≡ Bakiye hareketleri · 🏦 Banka  │
│ KAZAN                            │
│  ★ VIP & Puan · 🎁 Davet · 🎡 Çark │
│ HESAP                            │
│  ⚙ Profil ve güvenlik            │
├──────────────────────────────────┤
│ [ ⇥ Çıkış yap ]  (--bad çerçeve) │  yapışkan alt
└──────────────────────────────────┘
```

**Satır görünümü ve davranış:**
- Satırlar ☰ çekmecesinin `.mn-i` ve `.mn-ic` görünümünü kullanır: 48 px, simge kutusu.
- Rozetler `.mn-b` ile gösterilir.
- Gruplar **katlanmaz**: rakipteki "–" düğmesi bizde gereksiz, menü kısa.
- Bir öğeye dokunulunca menü kapanır (`closeModal()`), sonra sekmeye ya da rotaya gidilir. Bunun için `ACT.tab` sarmalanır: `#modal .md.side` içinden geldiyse önce `closeModal`.

**Mobil Hesabım sayfa kabuğu** (`pAccShell`, §E):
- **Özetim sekmesinde:** üstte `.hs-top` (selamlama ve **[☰ Menü]**).
- **Diğer sekmelerde:** üstte ince bir başlık çubuğu, ardından sekme gövdesi:
  ```
  ‹ Özetim      Siparişlerim      [☰ Menü]
  ```
  - "‹ Özetim": `data-act=tab data-t=ozet`
  - "[☰ Menü]": `data-act=hs-menu`
- **Bugünkü yatay kaydırmalı sekme şeridi (`nav.tabs`) mobilde çizilmez.**
- Alt çubukta Hesabım'a yeniden dokunmak da menüyü açar.

**Masaüstü Hesabım (hafif hizalama):**
- `.acc` iki sütunlu düzen ve sol `nav.panel.tabs` kalır.
- Düğmeler aynı (`data-act=tab`). Aralara grup başlıkları gelir: `.hs-navg` sınıfı, mevcut `.eyebrow` görünümüyle "ALIŞLARIM", "SATIŞLARIM" …
- Yönetim satırı ve Bildirimlerim bağlantısı da sol menüye girer.
- Özetim içeriği aynı bileşenlerle çizilir: bakiye kartı geniş, KPI'lar 4 sütun (`.kpis`), Satış ve Alış özeti yan yana.

### 2.5 Profil tamamlama kartı (para çekmeyi belirleyen alanlar)

| Madde | Tamam koşulu | Eksikse düğme | Para çekmek için gerekli mi |
|---|---|---|---|
| Ad soyad | `u.ad && u.soyad` | Düzenle → `tab profil` (odak `#pf_ad`) | Evet: IBAN aynı adda olmalı |
| Cep telefonu | `u.tel` | Ekle → `tab profil` (`#pf_tel`) | Hayır (bildirim ve WhatsApp kodu için) |
| E-posta | `u.email` | Ekle → `tab profil` | Hayır |
| T.C. kimlik doğrulama | `tcOk(u) && p3TcFull(u)` | `tcNeed(u)`: **Doğrula** → `tc-open`. `tcOk && !full`: **Numaranı onayla** → `tab cek`. `u.tc.state==='inceleme'`: "İnceleniyor" çipi (düğme yok). | **Evet** |
| IBAN | `(u.ibans\|\|[]).length>0` | Ekle → `tab banka` | **Evet** |
| 2 adımlı doğrulama | `!!u.tfa` | Aç → `tab profil` (`tfaPanel`'e kaydır) | Hayır, "önerilir" çipiyle |

**Kartın davranışı:**
- Başlık: "Para çekmeye hazır mısın?" ve sağda "4 / 6".
- İnce ilerleme çubuğu (`.prog`, mevcut) bulunur.
- Önce eksikler, sonra tamamlananlar sıralanır. Tamamlananlar tek satırda çip olarak yan yana durur.
- Gerekli maddelerde küçük "Para çekmek için gerekli" etiketi bulunur.
- **6/6 olunca** kart yerine tek satır görünür: "✔ Profilin tamam · para çekmeye hazırsın".
- Yalnız 2 adımlı doğrulama eksikse kart küçük kalır, tek bir öneri satırı gösterir.
- Çalışan ve yöneticide (`u.admin || u.staff`) bu kart gösterilmez. Onlar için 2 adımlı doğrulama uyarısı zaten Yönetim › Bugün'de var.

### 2.6 Boş durumlar ve alt sayfaların mobil dili

**Boş durumlar** (`emptyBox(başlık, açıklama, düğme)`, mevcut bileşen):

| Yer | Başlık | Açıklama | Düğme |
|---|---|---|---|
| Yapılacaklar | (bölüm gizlenir) | | |
| Siparişlerim | Henüz siparişin yok | Satın aldığın ürünler burada; ödemen teslim alana kadar havuzda bekler. | Pazara göz at → Pazar penceresi |
| Satışlarım | Henüz satışın yok | İlan verdiğinde satışların burada görünür. | İlan ver |
| İlanlarım | Henüz ilanın yok | İlk ilanını ver; alıcılar arama ve server sayfalarında görsün. | + İlan ver |
| Borsa alımlarım | Borsa alımın yok | Sabit fiyattan yang al, operatör karakterine teslim etsin. | Borsaya git |
| Borsa satış emirlerim | Satış emrin yok | Yangını kendi fiyatınla siteye sat; satılınca tutar çekilebilir bakiyene geçer. | Borsada sat |
| EP kodlarım | (mevcut metin) | | EP al |
| Bakiye hareketleri | (mevcut metin) | | Bakiye yükle |
| Çekim taleplerim | Henüz çekim talebin yok | Çekilebilir bakiyeni IBAN'ına gönderebilirsin. | (form zaten üstte) |

**İlanlarım çipleri** (mobil ve masaüstü, yalnız istemci süzgeci):
- Çipler: `Yayında n · Onay bekliyor n · Stok bitti n · Kaldırıldı n · Tümü`
- Liste `me/listings` (`p1List`) üzerinden süzülür. Sunucu değişmez.

**Siparişlerim ve Satışlarım tabloları:**
- Mobilde zaten `mcards` sınıfıyla karta dönüşüyor. Değişmez.
- Yalnız "Teslim et" ve "Onayla" düğmeleri kartın altında tam genişlikte olur. Bu yalnız CSS ile yapılır (`.p2tbl` için mobil kural).

---

## 3. Yang Borsası: kart ızgarası (mobil)

### 3.1 Sayfa yerleşimi (390 px)

```
┌────────────────────────────────────────┐
│ YANG BORSASI                  [Nasıl?] │  .bx-h  (Nasıl? = bilgi alt penceresi)
│ Sabit fiyattan al, kendi fiyatınla sat. │
│ ● Siparişler sırayla işlenir            │
├────────────────────────────────────────┤
│ ⚠ Operatör seni bekliyor · #B1003       │  myCallNotes() (varsa, en üstte)
│   [ Geldim, hazırım ]                   │
├────────────────────────────────────────┤
│ [🔎 Server ara…              ] [⇅]      │  .bx-bar (arama + sıralama)
│ (Tümü 24)(Metin2 TR 6)(PVP 18)(Stokta)  │  .bx-chips (yatay kaydırma)
├───────────────────┬────────────────────┤
│ ┌───────────────┐ │ ┌────────────────┐ │
│ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ │ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ │  .bx-art (server renkleri)
│ │PVP        (EJ)│ │ │TR          (MA)│ │
│ │   ~YANG~      │ │ │   ~WON~        │ │  (arka planda iri soluk yazı)
│ │EJDER2         │ │ │MARMARA         │ │
│ │Metin2 Yang·100M│ │ │Metin2 Won·1 Won│ │
│ ├───────────────┤ │ ├────────────────┤ │
│ │SAT · 100M  [↑]│ │ │SAT · 1 Won  [↑]│ │  .bx-row.sat (accent)
│ │₺10,00 en fazla│ │ │₺118,00 en fazla│ │
│ ├───────────────┤ │ ├────────────────┤ │
│ │AL · 100M   [🛒]│ │ │AL · 1 Won  [🛒]│ │  .bx-row.al (ok)
│ │₺12,50         │ │ │₺129,90         │ │
│ │● 340 stokta   │ │ │○ Şu an satıcı  │ │
│ │               │ │ │  yok           │ │
│ └───────────────┘ │ └────────────────┘ │
├───────────────────┴────────────────────┤
│ … (diğer kartlar)                       │
├────────────────────────────────────────┤
│ BEKLEYEN İŞLEMLERİM          Tümü ›     │  .bx-mine (girişli ve kaydı varsa)
│ [Alımlarım 1] [Satış emirlerim 2]       │  bölme
│ (bekleyen işlem kartları, §3.5)         │
└────────────────────────────────────────┘
│ Destek  Pazar  Ana sayfa  Borsa• Hesabım│
```

**Izgara:**
- 360–760 px: `grid-template-columns: repeat(2, minmax(0,1fr))`, aralık 10 px.
- <360 px: tek sütun.
- 561–760 px: kartlar genişler, düzen aynı kalır.

### 3.2 Kartta ne var, her sayı nereden geliyor

| Öğe | İçerik | Kaynak alan |
|---|---|---|
| Kapak (`.bx-art`) | `linear-gradient(135deg, s.c[0], s.c[1])` ve altta okunabilirlik için `rgba(0,0,0,.45)` geçişi. Arkada iri, %12 saydam "YANG" ya da "WON" yazısı. Sağ üstte `logo(s,34)`. Sol üstte bölüm çipi `TR` / `PVP`. Altta beyaz büyük harf server adı ve "Metin2 Yang · {unit}" ya da "Metin2 Won · {unit}". Yükseklik 112 px. | `srv(x.server)` → `name`, `c`, `sec`. `x.unit`. Won/Yang ayrımı: `/won/i.test(x.unit)` ise "Metin2 Won", değilse "Metin2 Yang". |
| **SAT satırı** | Üstte küçük: "SAT · {unit}". Büyük: **`TL(x.max)`**. Yanında küçük "en fazla". Sağda 44×44 kare **↑** düğmesi. Satırın tamamı tıklanabilir. | `ex_markets.max` → `presentMarket.max` → `x.max`. Bu, satıcının girebileceği en yüksek birim fiyattır ve satış gerçekleşirse satıcının alabileceği en yüksek tutardır. |
| **AL satırı** | Üstte küçük: "AL · {unit}". Büyük: **`TL(x.buy)`**. Sağda 44×44 kare **🛒** düğmesi. | `ex_markets.buy` → `x.buy` (`exSellPrice(x)`), sabit fiyat. |
| Stok satırı (AL altında) | `● {NUM(stok)} stokta` (`--ok`). **Stok 0 ise fiyat yine görünür** ve altında `○ Şu an satıcı yok` (`--muted`) yazar. AL **çalışmaya devam eder** (sipariş sıraya alınır, §3.4). | `P4.stock[x.id]`: `GET exchange` yanıtındaki `stock` haritası (`SUM(left_qty)`). Bugün `p4ApplyEx` bu alanı **almıyor** ve `exStock(x)` satış sırasının ilk 60 emrinden hesaplanıyor; bu düzeltilir (§E). Yedek: `exStock(x)`. |
| Fiyat yoksa | `x.buy == null`: AL satırında "Fiyat yakında", düğme `disabled`. | |
| Kapalı yön | `S.set.exBuyOn === false`: AL satırı soluk, "Alım şu an kapalı". `exSellOn === false`: SAT satırı aynı şekilde. `exOn === false`: sayfa `vExClosed()` (aynen). | `boot.set` / `GET exchange.set` |
| Gösterilmeyen | `margin` (iç bilgi), satıcı adları | |

**Görsel ayrıntılar:**
- **Fiyatlar** `var(--f-mono)`, 21 px, 800 ağırlık, `font-variant-numeric: tabular-nums` ile yazılır.
- Metin 9 karakteri aşarsa (ör. "₺1.250,00") `.bx-p.long` sınıfı 17 px'e düşürür. Eşik istemcide `TL(...)` uzunluğuna göre seçilir. 390 px'te kart iç genişliği yaklaşık 150 px; yazı ve 44 px düğme taşmadan sığar.
- **Renkler:**
  - SAT: düğme zemini `--accent`, simge `--accent-ink`, satır kenarı `color-mix(--accent 45%, --line)`.
  - AL: düğme zemini `--ok`, simge `--on-solid`.
  - Bu tokenlar her iki temada tanımlı.
- **Erişilebilirlik:** satır düğmesinin `aria-label` değeri şöyledir: "{Server} sat: birim başına en fazla ₺10,00, {unit}" ya da "{Server} al: birim fiyat ₺12,50, 340 adet stokta".
- **Kapağa dokunma:** "Pazar ayrıntısı" alt penceresi açılır. İçinde AL fiyatı, SAT tavanı, en ucuz emir (`exBook(x)[0].price`), stok, satış sırasının ilk 5 satırı (maskeli satıcı, mevcut `maskU`), ve altta yan yana [SAT] [AL] düğmeleri bulunur. Masaüstündeki `.expc` ve `.sqside` kutularının mobil hâlidir.

### 3.3 Üst çubuk: arama, bölüm, sıralama

- **Arama (`#bx_q`):** server adında Türkçe harf katlamalı "içerir" araması (mevcut `sqNorm` yardımcısı). Yazdıkça yalnız ızgara güncellenir: `data-change`, 120 ms gecikme, hedef `#bxGrid` `innerHTML`. Böylece odak kaybolmaz.
- **Bölüm çipleri:** `Tümü (n)`, `Metin2 TR (n)`, `Metin2 PVP (n)`. `(n)` açık pazar sayısıdır. Yalnız iki bölüm olduğu için rakipteki ayrı "filtre" düğmesi yerine çipler doğrudan görünür. Bir de aç/kapa çipi var: **"Stokta olanlar"** (`stok>0`).
- **Sıralama `[⇅]`:** küçük bir alt pencere açar (radyo listesi):
  - **Önerilen**: yönetimdeki pazar sırası (`ORDER BY sort,id`, dizideki sıra)
  - Ada göre A–Z
  - Alış fiyatı: düşükten yükseğe (`buy`)
  - Satış fiyatı: yüksekten düşüğe (`max`, "en çok kazandıran")
  - Stok: çoktan aza
- **Durumun saklanması:** `ui.bxSec`, `ui.bxStok`, `ui.bxSort`, `ui.bxQ`. `bxSort` ve `bxSec` `localStorage` (`yp_bx`) üzerinde `try/catch` ile saklanır.
- **Boş sonuç:** `emptyBox('Bu aramada server yok','Aramayı ya da süzgeci değiştir.')`

### 3.4 AL akışı: alt pencere, 2 adım (bizim `exorder` akışımız)

**Adım 1/2: Adet ve karakter**

```
┌──── (EJ) Ejder2 · AL              × ┐
│ ₺12,50 / 100M · sabit fiyat           │
│ ● 340 adet stokta                     │  (stok 0 ise uyarı notu ↓)
│ Kaç adet? (100M)                      │
│ [ − ] [   20   ] [ + ]                │  #ex_qty (mono, sayısal klavye)
│ (1) (5) (10) (20)                     │  hızlı çipler
│ Oyun içi kullanıcı (karakter) adı *   │  exFieldsHtml(null,'exb_',S.exFieldsBuy)
│ [ BoraKarakter              ]         │
│ ┌ Teslimat yeri ───────────────────┐  │  .explace (mevcut)
│ │ CH2 · Mavi bayrak · Gardiyan yanı│  │
│ │ Hesap bilgin istenmez.           │  │
│ └──────────────────────────────────┘  │
├───────────────────────────────────────┤
│ Ödenecek            ₺250,00           │  #ex_tot (mevcut ex-calc)
│ [            Devam            ]       │  yapışkan alt (.sheet-f)
└───────────────────────────────────────┘
```

- Stok 0 ya da adetten az ise mevcut `#ex_waitbox` notu gösterilir: "Stokta şu an N adet var. Siparişin alınır; kalan kısım yeni satış emirleri geldikçe tamamlanır. Fiyat değişmez."
- **[Devam]:**
  1. `form.reportValidity()` çalışır (gerekli alanlar).
  2. `GET exchange/quote?m={x.id}&qty={q}` çağrılır (mevcut uç: `price`, `total`, `stock`, `miss`).
  3. Adım 2 açılır.
- Teklif alınamazsa istemci hesabıyla devam edilir ve küçük bir "tutar sunucuda doğrulanacak" notu çıkar.

**Adım 2/2: Onay**

```
│ ‹ Geri                         2/2    │
│ Ejder2 · 20 × 100M                    │
│ Birim ₺12,50 · Toplam ₺250,00         │
│ Stoktan hemen: 20 · Sıraya: 0         │  (quote.stock / quote.miss)
│ Ödeme: site bakiyesi                  │
│ Bakiyen ₺400,00 → kalan ₺150,00       │  avail(u)
│ (Önce "yalnız alışveriş" bakiyen      │
│  kullanılır.)                         │
├───────────────────────────────────────┤
│ [      Bakiyemle satın al      ]      │  button.exgo (form data-form=exorder submit)
└───────────────────────────────────────┘
```

- **Yetersiz bakiye** (`avail(u) < total`):
  - Düğme "Bakiye yükle · ₺X eksik" olur ve `data-act=deposit` çağırır.
  - Sunucudaki `insufficient` hatası da aynı şekilde gösterilir: `j.data.need`.
- **Gönderim:** mevcut `FORM.exorder` aynen kullanılır (Idempotency-Key `formKey(f)`, `exb_` alanları, `ui.exId`).
- **Değişen tek şey:**
  - Başarıdan sonra `closeModal()`.
  - Toast: "#B1003 sıraya alındı".
  - Sonra mevcut davranış: `ui.tab='borsa'; go('hesabim')` ve `ui.hsBx='al'`.

### 3.5 SAT akışı: alt pencere, 3 adım (bizim `exoffer` akışımız)

**Adım 1/3: Adet ve fiyat**

```
┌──── (EJ) Ejder2 · SAT             × ┐
│ En fazla ₺10,00 / 100M                │
│ Kaç adet satıyorsun? (100M)           │
│ [ − ] [   20   ] [ + ]                │  #ex_qty
│ Birim fiyatın (TL)                    │
│ [   9,00   ]   en fazla ₺10,00        │  #ex_price (max=x.max, varsayılan: min(max, en ucuz emir))
│ ┌ Sıradaki yerin ─────────────────┐   │  #ex_pos (mevcut metin, canlı)
│ │ Bu fiyatla 1. sıradasın.        │   │
│ │ En ucuz emir ₺9,50.             │   │
│ └─────────────────────────────────┘   │
│ ⓘ Kuyruk sistemi: en düşük fiyat önce │  .exq (mevcut metin, katlanır)
│   eşleşir.                            │
├───────────────────────────────────────┤
│ Satılırsa bakiyene  ₺180,00           │  #ex_tot
│ [            Devam            ]       │
└───────────────────────────────────────┘
```

**Adım 2/3: Hesap bilgileri**
- İçerik: `exFieldsHtml(null,'exf_',S.exFields)`. Yönetimin belirlediği alanlar (hesap adı, şifre, karakter, depo şifresi, e-posta, uygun zaman). Gizli alanlarda `type=password`, `autocomplete=off`.
- Altta mevcut "Satış kuralları" `details` bloğu ve `#ex_ok` onay kutusu: "Kuralları okudum, emrim eşlendiğinde hesabıma giriş yapılmasını onaylıyorum."
- Güven notu: "Bilgilerin şifreli saklanır, yalnız yetkili operatör görür ve işlem bitince silinir."

**Adım 3/3: Özet**
- "Ejder2 · 20 × 100M · birim ₺9,00"
- "Satılırsa çekilebilir bakiyene: ₺180,00"
- "Ödeme: operatör yangı aldıkça, teslim edilen adet kadar"
- "Emrini dilediğin an iptal edebilirsin"
- Düğme: **[Satış emri ver]** (`button.exgo`, `FORM.exoffer`)

**Gönderim ve sonrası:**
- Mevcut `FORM.exoffer` aynen kullanılır.
- Başarıdan sonra:
  1. `closeModal()`.
  2. Toast (sunucu mesajı: "Emriniz yayında, fiyat sıralamasında N. sıradasınız").
  3. Sayfada "Bekleyen işlemlerim › Satış emirlerim" bölmesine kaydırılır.

**Adımlar arası geçiş:**
- Tüm adımlar **tek bir `<form>` içindedir**: `section[data-step]`, yalnız biri görünür.
- Bu yüzden sunucu doğrulama hatası hangi alandaysa o adıma dönülür: `HttpError::validation` alan anahtarı → `#ex_qty`/`#ex_price` adım 1, `exf_*`/`ex_ok` adım 2.

### 3.6 Bekleyen işlemler: yeni görsel dil

Aynı bileşenler iki yerde kullanılır:
- Borsa sayfasında "Bekleyen işlemlerim" (yalnız açık olanlar, en fazla 5, "Tümü ›" → Hesabım › Borsa)
- Hesabım › Borsa sekmesi (`p4AccBorsa` yerine `hsBorsa`, tümü)

Üstte bölme: `[Alımlarım n] [Satış emirlerim n]` (`ui.hsBx`).
Hesabım'da ayrıca durum çipleri: `Açık · Tamamlanan · İptal`.

**Alım siparişi kartı (`.bx-o`):**

```
┌───────────────────────────────────────┐
│ (EJ) Ejder2 · AL               #B1003 │
│ 20 × 100M                    ₺250,00  │
│ ●━━━━●━━━━◉────○                      │  .bx-steps (4 adım)
│ Sırada  Hazır.  Teslimat  Tamam       │
│ [Operatör seni bekliyor]  2 dk önce   │  durum çipi
│ Teslim 0/20 · Hazırlanan 20/20        │
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░ (teslim çubuğu)     │
│ [      Geldim, hazırım      ]         │  yalnız çağrıldıysa
│ ▸ İşlem geçmişi                       │  details (o.log, mevcut)
└───────────────────────────────────────┘
```

**Durum eşlemesi** (üyeye görünen; sunucunun `EXS` metni yalnız geçmişte kalır):

| Koşul (öncelik sırasıyla) | Çip | Renk (pill) | Adım | Eylem |
|---|---|---|---|---|
| `status==='tamam'` | Tamamlandı | `p-tamam` | 4 | – |
| `status==='iptal'` | İptal edildi · iade bakiyende | `p-iade` | – (adımlar gri) | – |
| `status==='bilgi'` | Bilgi istendi | `p-itiraz` | 2 | **[Bilgileri güncelle]** `ex-fix` ve `o.note` metni |
| `called && !(ready>called)` | Operatör seni bekliyor (nabız noktası) | `chip warn` | 3 | **[Geldim, hazırım]** `ex-ready` ve `o.callMsg` |
| `called && ready>called` | Hazır olduğun bildirildi | `chip ok` | 3 | – |
| `status==='kismen'` | Kısmen teslim · {delivered}/{qty} | `p-teslim` | 3 | – |
| `status==='islemde' \|\| exMatched(o)>0` | Hazırlanıyor | `p-odendi` | 2 | – |
| `status==='bekliyor'` | Sırada | `p-bekliyor` | 1 | – |

- "Hazırlanan" sayısı `exMatched(o)` ile hesaplanır: `o.fills[].qty` toplamı. Bu bilgi üye görünümünde de geliyor.
- "Teslim" sayısı `o.delivered / o.qty`.
- Üye alım siparişini **iptal edemez** (bizim kuralımız). Kartta iptal düğmesi yoktur. Alttaki küçük bağlantı "Sorun mu var? Destek" alt çubuktaki Destek eylemini çağırır.

**Satış emri kartı (`.bx-f`):**

```
┌───────────────────────────────────────┐
│ (EJ) Ejder2 · SAT                 #E12│
│ ₺9,00 / 100M          Kalan 8 / 20    │
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  12 eşleşti         │
│ [Kısmen eşleşti]   Sıran: 1.          │
│ [        Emri iptal et        ]       │  yalnız aktif (of-cancel)
└───────────────────────────────────────┘
```

| Koşul | Çip |
|---|---|
| `aktif && left===qty` | Satışta · sırada |
| `aktif && left<qty` | Kısmen eşleşti |
| `satildi` | Tamamı eşleşti · ödeme teslimde |
| `iptal` | İptal edildi |

**Satış emri kartı ayrıntıları:**
- **Sıra:** `exBook(x).findIndex(z=>z.id===of.id)+1`. Yalnız satış sırası yüklüyse gösterilir (`ex:pub`, borsa sayfasında). Hesabım'da gösterilmez.
- **İptal:** mevcut `of-cancel` kullanılır. Yanlış dokunmaya karşı mobilde **onay** sorulur: mevcut `#cfm` onay kutusu, "Emri iptal et? Eşlenmiş ama teslim edilmemiş adetler operatörde kalır."

**Masaüstü:**
- Hesabım › Borsa ve borsa sayfasındaki tablolar (`exTable`, `offerTable`) **kalır**.
- Yalnız durum sütunu yukarıdaki üye etiketlerini kullanır (aynı `hsExChip(o)` yardımcısı). "Geldim, hazırım" satır içinde görünür.

### 3.7 Operatör ekranları

Kapsam dışıdır. Değişiklik gerekmez: veri modeli, eylemler ve kimlikler aynı kalıyor.

---

## 4. Giriş / Üye ol penceresi

Mobilde alt pencere (`.md.sheet`, tam yükseklik), masaüstünde ortalanmış modal.

```
┌──────────────────────────────────── × ┐
│   [ GİRİŞ YAP ]      ÜYE OL            │  .auth-tabs (role=tablist, alt çizgi --accent)
├────────────────────────────────────────┤
│ (girişsiz SAT/AL'dan geldiyse:)        │
│ ⓘ Devam etmek için giriş yap veya      │
│   üye ol.                              │
│ Kullanıcı adı veya e-posta             │
│ [                              ]       │  #lg_u (aynen)
│ Şifre                                  │
│ [ ••••••••                  👁 ]       │  #lg_p ve göster/gizle düğmesi
│ ☑ Beni hatırla                         │  #lg_rem (varsayılan işaretli → remember)
│ [          Giriş yap          ]        │  form[data-form=loginf] .btn-primary
│ ───────────── veya ─────────────       │  .auth-or     ┐ yalnız S.set.googleOn
│ [  G  Google ile devam et      ]       │  #authGoogle  ┘ (beyaz düğme, Google kuralları)
│ Hesabın yok mu? Üye ol                 │  sekme değiştirir
└────────────────────────────────────────┘
```

**Üye ol sekmesi** (mevcut alanlar ve kurallar aynen):
- Alanlar: `#rg_ad`, `#rg_sy`, `#rg_u` (desen ve 3–20 karakter), `#rg_t`, `#rg_e`, `#rg_p` (**en az 8**), davet kodu (`#rg_ref`, `P_REF()` otomatik), `#rg_k` (KVKK ve üyelik sözleşmesi onayı).
- Düğme "Üye ol".
- Aynı "veya / Google ile devam et" bölümü.
- En altta mevcut gizlilik metni: "Ad, soyad ve telefonunuz diğer üyelere gösterilmez; para çekme bildirimleri ve WhatsApp doğrulama kodları için kullanılır."

**Kurallar:**
- `mLogin(err)` → `mAuth('giris', err)`, `mRegister(err)` → `mAuth('kayit', err)`. İmzalar ve `98-p0b-actions.js` işleyicileri değişmez.
- Hata, ilgili sekmede `.note.note-bad` olarak gösterilir.
- Sekme değiştirmek formu yeniden çizmez. İki form da DOM'da kalır, yalnız `hidden` değişir. Böylece yazılan veriler kaybolmaz.
- **Google yeri:**
  - `S.set.googleOn` (Google ekibinin boot'a ekleyeceği bayrak) yoksa ya da yanlışsa **hiç çizilmez**, ayraç da çizilmez.
  - Düğme `data-act="oauth-google"` taşır. İşleyiciyi Google ekibi yazar.
  - Google ile ilk girişte telefon, ad ve soyad eksik kalacağı için "Profilini tamamla" adımı Google ekibinin işidir. Bizim profil tamamlama kartımız (§2.5) bu eksikleri zaten gösterir.
- **"Beni hatırla":** bugün `remember:true` sabit gönderiliyor. Kutu varsayılan işaretli gelir ve değeri `loginf` gövdesine aktarılır. Bu `98-p0b-actions.js` içinde tek satırlık bir değişikliktir.
- **"Şifremi unuttum":** sunucuda henüz uç yok (`auth/*` içinde sıfırlama yok). Yer ayrılır ama **çizilmez**. Ayrı iş olarak not edilir (§E.5).
- 2 adımlı doğrulama penceresi (`pTfa`) aynen kalır.

---

## 5. (A–D özeti) Bileşen adları

| Bileşen | Sınıf / işlev | Dosya |
|---|---|---|
| Alt çubuk | `#mtab.mtab`, `.mtab-i`, `.mtab-b`, `.mtab-dot`; `mtabHtml`, `mtabMount`, `mtabSync`, `MTAB` | `src/js/44-mtab.js`, `src/app.css` |
| Alt pencere / sağ çekmece | `.md.sheet`, `.md.side`, `.sheet-grip`, `.sheet-f`; `sheetWrap()` | `44-mtab.js`, `app.css` |
| Pazar / Yardım pencereleri | `mtabPazar()`, `mtabYardim()` | `44-mtab.js` (Yardım içeriği prod'da `97h` ile genişler) |
| Hesabım kabuğu | `pAccShell(u,TABS,body)`, `.hs-top`, `.hs-bar`, `.hs-navg` | `97-p0b-views.js` (ayırma), `97h-hesabim.js` (yeni kabuk) |
| Özetim | `hsOzet(u)`, `.hs-todo`, `.hs-wallet`, `.hs-kpi`, `.hs-prof`, `.hs-sec`, `.hs-strip` | `97h-hesabim.js` |
| Hesap menüsü | `P_ACC_NAV`, `hsMenu()` (`ACT['hs-menu']`) | `97h-hesabim.js`, `98h-hesabim.js` |
| Borsa ızgarası | `bxView()`, `bxCard(x)`, `.bx-grid`, `.bx-card`, `.bx-art`, `.bx-row.sat/.al`, `.bx-p` | `97x-borsa-kart.js` |
| AL/SAT pencereleri | `bxSheet(id,dir,step)`, `ACT['bx-al'|'bx-sat'|'bx-step'|'bx-info'|'bx-sort']` | `97x-borsa-kart.js`, `98x-borsa-kart.js` |
| Bekleyen işlem kartları | `hsExChip(o)`, `bxOrderCard(o)`, `bxOfferCard(of)`, `hsBorsa(u)` | `97x-borsa-kart.js` (Hesabım da kullanır) |
| Giriş penceresi | `mAuth(tab,err,note)`, `.auth-tabs`, `.auth-or`, `#authGoogle` | `97g-giris.js` |

Prod dosyalarının CSS'i, mevcut kalıpla aynı şekilde (`p3css`, `p4css`) `if (YP_PROD) document.head.insertAdjacentHTML('beforeend','<style id="hscss">…')` ile eklenir. Paylaşılan bileşenlerin (alt çubuk, alt pencere) CSS'i `src/app.css` içindedir.

---

## E. Uygulama planı

### E.1 Dosyalar

**Paylaşılan** (demo `index.html` derlemesine de girer):

| Dosya | İş | Demo etkisi |
|---|---|---|
| `src/js/44-mtab.js` **(yeni)** | Alt çubuk, `sheetWrap`, Pazar ve Yardım pencereleri, klavye algılama | 1280 px'te DOM'a girmez, anlık görüntü **değişmez**. 390 px'te demo da alt çubuğu alır (bilerek). |
| `src/js/manifest.txt` | `44-mtab.js` satırı `43-mnav.js`'den sonra. Prod satırları aşağıda. | – |
| `src/app.css` | Alt çubuk, `.md.sheet`/`.md.side`, `body.has-mtab .ls-fab{display:none}` (≤760) | Yalnız CSS; gövde anlık görüntüsü değişmez |
| `src/js/43-mnav.js` | `acc` bölümü sadeleşir (§1.6) | **Bilerek fark:** yalnız `#mnav` içi. `snap.js gate` farkı incelenip yeni `index.html` işlenir. |

**Yalnız prod:**

| Dosya | İş |
|---|---|
| `src/js/prod/97-p0b-views.js` | `vAccount` sonundaki kabuk HTML'i `let pAccShell = (u,TABS,body) => …` işlevine ayrılır. Görünür değişiklik yoktur. Sarmalayıcılar (`97p3` metin değişimi, `97p5` profil paneli) aynen çalışır: profil gövdesindeki `<div class="panel panel-b hstack" style="justify-content:space-between;max-width:560px">` işaretleyicisi **korunmalıdır**. |
| `src/js/prod/97g-giris.js` **(yeni)**, `98-p0b-actions.js` (1 satır: remember) | `mAuth`, `mLogin`/`mRegister` yeniden tanımı. `97-p0b`'deki `mRegister` sarmalayıcısının yaptıkları (en az 8 karakter notu, davet kodu, gizlilik metni) `mAuth` içine taşınır. |
| `src/js/prod/97p4-ex.js` | `p4ApplyEx`: `d.stock` → `P4.stock`. `p4Exchange`: `bxMob()` (≤760) ise `bxView()`, değilse bugünkü `vExchange()`. `p2AccBody` borsa kolu `hsBorsa`'ya bırakılır (97x daha sonra yüklenip sarmalar). |
| `src/js/prod/97x-borsa-kart.js` **(yeni)** | Izgara, kart, pencereler, bekleyen işlem kartları, `hsExChip`, CSS |
| `src/js/prod/98x-borsa-kart.js` **(yeni)** | `ACT bx-*`, adım geçişi, teklif çağrısı, `FORM.exorder`/`exoffer` sarmalayıcıları (`closeModal`, adım hata yönlendirmesi, sonrası kaydırma), `of-cancel` mobil onayı, girişten sonra pencereyi yeniden açma |
| `src/js/prod/97h-hesabim.js` **(yeni)** | `P_ACC_NAV`, `pAccShell` (mobil ve masaüstü), `hsOzet`, profil kartı, `p2AccTabs` etiket eşlemesi (`ozet`→"Özetim"), İlanlarım çipleri, `boot.summary` uygulaması, `need('me:sum')`, rozet geçersiz kılmaları (yoklama sarmalayıcısı, `p4OnPoll` örneği gibi) |
| `src/js/prod/98h-hesabim.js` **(yeni)** | `ACT['hs-menu']`, `ACT.tab` sarmalayıcısı (çekmeceden gelince kapatma), `ACT['hs-bx']` (bölme), alt çubuğun prod `MTAB.destek` ve `MTAB.hesabim` geçersiz kılmaları |
| `app/routes/21_me_summary.php` **(yeni)** | `GET me/summary` ve boot kancası |
| `tests/unit_hs.php` **(yeni)** | Özet uç testleri |

**Manifest sırası (prod):**

```
… prod/98p5-actions.js
prod/98w-whatsapp.js
prod/97g-giris.js
prod/97x-borsa-kart.js
prod/98x-borsa-kart.js
prod/97h-hesabim.js
prod/98h-hesabim.js
99z-start.js
```

- `97h` en sonda yer alır, çünkü tüm `p2AccTabs`/`p2AccBody` zincirlerini sarmalaması gerekir.
- `97x`, `p2AccBody` borsa kolunu ve `p4Exchange`'i kullanır.

### E.2 İş sırası

Her adım kendi içinde test edilir. Ajanlar paralel çalışabilir; bağımlılıklar oklarla gösterildi.

1. **Altyapı (A1):** `44-mtab.js`, `sheetWrap`, CSS ve `43-mnav` sadeleştirmesi. Demo kapısı çalıştırılır: 1280'de fark yok, `#mnav` farkı bilerek kabul edilir.
2. **Sunucu (B1, A1 ile paralel):** `21_me_summary.php`, `unit_hs.php`.
3. **Giriş penceresi (D1):** A1'deki `sheetWrap`'e bağlı.
4. **Hesabım kabuğu ve menü (B2):** A1 ve B1'e bağlı. Önce `pAccShell` ayrılır (görünür değişiklik yok, mevcut e2e'ler geçmeli), sonra yeni kabuk ve menü.
5. **Özetim ve profil kartı (B3):** B1 ve B2'ye bağlı.
6. **Bekleyen işlem kartları (C2):** A1'e bağlı. Hesabım › Borsa'da kullanılır.
7. **Borsa ızgarası ve AL/SAT pencereleri (C1):** A1 ve C2'ye bağlı.
8. **Rozetler, Destek/Yardım ve girişten sonra devam:** son bağlama.
9. **Testler, ekran görüntüleri (390 px, iki tema), sürüm notu.**

### E.3 Paylaşılan ve yalnız prod; demo anlık görüntü kapısı

- **Hesabım ve Borsa yeniden tasarımı yalnız prod'dadır.** Demo `vAccount` ve `vExchange` aynen kalır. Canlı site ve test sitesi (`test.yangpazar.com`) prod derlemesidir, sahip yeniliği orada görür.
- **Alt çubuk, alt pencere ve CSS paylaşılır.** Ancak alt çubuk yalnız ≤760 px'te DOM'a girer. Bu yüzden `node tests/snapshot/snap.js gate` (1280 px) yalnız `#mnav` sadeleştirmesi kadar fark gösterir.
- **Uygulayıcının yapacakları:**
  - Fark raporunu PR açıklamasına ekler.
  - `php tools/build.php --single` çalıştırır ve `--check` ile doğrular.
  - Başka bir fark çıkarsa **durur**.
- Demoya ızgarayı taşımak isterse ayrı ve bilinçli bir iş olarak yapılır (bu belgenin kapsamı dışında).

### E.4 Test planı

**Yeni `tests/e2e/hs-fe.js`** (p4-fe kurulum kalıbıyla: kurulum, yönetici, üyeler, borsa pazarı):

*Alt çubuk (390×844, gece ve gündüz):*
1. Alt çubuk görünür: 5 öğe, etiketler, `aria-current`.
2. Etkin durum doğru: `home`, `metin2-pvp`, `server-…`, `borsa`, `hesabim`, `siparis-…`.
3. `#yonetim` sayfasında yok.
4. `#modal .mb` açıkken görünmez (`getComputedStyle` ile `visibility`).
5. `#ex_qty` odaklanınca `html.kbd` ve çubuk gizli. Odak kalkınca geri gelir.
6. Girişsiz 5. öğe "Giriş" olur ve `form[data-form=loginf]` açar.
7. 1280 px'te `#mtab` DOM'da **yok**. 760 sınırında genişleyip daraltınca eklenir ve kaldırılır.
8. Prod'da Destek tıklanınca Yardım penceresi açılır. `.ls-fab` 390 px'te görünmez.

*Rozet:*
9. Satıcıya ödenmiş sipariş açılır. Yoklama sonrası Hesabım rozeti = `summary.todo.total` = DB sayımı.
10. Operatör `call` yapınca Borsa noktası görünür. "Geldim, hazırım" sonrası kaybolur.

*Hesabım:*
11. Özetim kartları DB ile tutarlı:
    - Havuzdaki satışlarım = `SUM(net)` (açık satışlar).
    - Havuzdaki ödemelerim = alıcı açık `total` + borsa kalan.
    - Çekim bekleyen = `bekliyor` toplamı.
12. **Kaybolan sekme yok:** `p2AccTabs(me(),P_TABS)` anahtar kümesi ⊆ menüdeki `[data-t]` kümesi.
13. Menüden her sekmeye gidiliyor. 390 px'te yatay taşma yok (`scrollWidth ≤ 390`), iki temada.
14. Profil kartı:
    - Yeni üyede "2/6" civarı.
    - IBAN eklenince bir artıyor.
    - TC doğrulanınca (test kancası ya da `tc-approve`) "Para çekmeye hazırsın" satırı çıkıyor.
15. Üye ekranlarının metninde `/e-Gider|pusula|ETTN|VUK/i` **yok**: Hesabım'ın tüm sekmeleri, menü ve Özetim.

*Borsa (390 px):*
16. Izgara 2 sütun. Her kartta SAT ve AL fiyat metni `TL(x.max)` ve `TL(x.buy)` ile aynı. Stok 0 iken "Şu an satıcı yok" yazıyor ve fiyat görünür.
17. Arama süzüyor, "Metin2 TR" çipi süzüyor, sıralama "Alış fiyatı" sırasını doğru veriyor.
18. **SAT akışı:**
    - Karttan ↑ → adım 1 (`#ex_qty=20`, `#ex_price=9`) → adım 2 (`#exf_f1..f6`, `#ex_ok`) → adım 3 → **Satış emri ver**.
    - Toast "Emriniz yayında".
    - DB'de `ex_offers` aktif 1.
    - Şifre `S` içinde yok (p4-fe'deki denetim tekrarlanır).
19. **AL akışı:**
    - Karttan 🛒 → `#ex_qty=20` ve karakter → Devam → teklif (`quote.total` = 250,00) → **Bakiyemle satın al**.
    - DB'de cüzdan düşüyor (önce kredi).
    - Hesabım › Borsa alımlarım'da kart "Sırada".
20. Yetersiz bakiyede düğme "Bakiye yükle · ₺X eksik" oluyor.
21. Girişsiz AL → giriş penceresi notu → giriş → AL penceresi kendiliğinden açılıyor.
22. Bekleyen işlem kartı durumları:
    - Operatör `claim` → "Hazırlanıyor".
    - `call` → "Operatör seni bekliyor" ve **Geldim, hazırım** → "Hazır olduğun bildirildi".
    - `deliver 12` → "Kısmen teslim 12/20".
    - `done` → "Tamamlandı".
    - `info` → "Bilgi istendi" ve **Bilgileri güncelle** çalışıyor.
23. Satış emri iptali mobilde onay soruyor ve onaydan sonra "İptal edildi".

*Giriş penceresi:*
24. Sekmeler arası geçişte yazılan veri korunuyor.
25. Hatalı şifrede hata giriş sekmesinde görünüyor.
26. `S.set.googleOn` yokken `#authGoogle` yok. `S.set.googleOn=true` (test) iken var ve 390 px'te taşma yok.

*Masaüstü (1280):*
27. Mevcut `p0b…p5-fe.js`, `wa-fe.js` ve `seo-fe.js` **değiştirilmeden geçer** (borsa formu, `.expc`, `.exmine`, `data-act=tab` aynı).

**Değişecek mevcut test satırları** (yalnız 390 px bölümleri):
- Bu satırlar `#app [data-act=tab][data-t=…]` tıklıyor; mobilde sekme şeridi artık çizilmiyor:
  - `tests/e2e/p0b-fe.js:265`
  - `tests/e2e/p1-fe.js:322`
  - `tests/e2e/p2-fe.js:365`
- Ortak yardımcı `hsTab(P,k)`:
  ```js
  await P.click('#mtab [data-mtab=hesabim]');   // Hesabım'dayken menüyü açar
  await P.click(`#modal [data-act=tab][data-t=${k}]`);
  ```
  Hesabım'da değilse önce `go('hesabim')` çağrılır.

**Diğer kontroller:**
- **Birim:** `php tests/run.php` (yeni `unit_hs.php` dahil).
- **Demo kapısı:** `node tests/snapshot/snap.js gate`. Yalnız `#mnav` farkı beklenir.
- **Ekran görüntüleri:** iki tema × 390 px ve 1280 px. Alt çubuk, Özetim, menü, borsa ızgarası, AL adım 1/2, SAT adım 1/2/3, bekleyen işlemler, giriş/kayıt.

### E.5 Riskler

| Risk | Önlem |
|---|---|
| Aynı kimlikler iki yerde (`#ex_qty` hem sayfada hem pencerede) | Mobilde borsa sayfası formu **çizmez**, form yalnız pencerede bulunur. Masaüstünde pencere kullanılmaz. Genişlik değişince (`matchMedia change`) `borsa` ve `hesabim` sayfaları yeniden çizilir, açık pencere kapatılır. |
| `vAccount` dize sarmalayıcıları (97p3, 97p5, 98w) kırılabilir | Kabuk `pAccShell`'e ayrılır, gövdeler aynen kalır. Profil işaretleyicisi korunur. Testler 12–15 bunu yakalar. |
| Satış sırası 60 emirle sınırlı olduğu için stok eksik görünür | `GET exchange.stock` haritası kullanılır (§3.2). |
| `me/summary` paylaşımlı sunucuda yük getirir | Yoklamaya eklenmez. 60 sn önbellek. Yalnız bildirim ve `exSig` değişince yenilenir. ~12 dizinli sorgu. |
| "SAT ₺10,00 en fazla" yanlış anlaşılır ("10 TL alacağım") | Her zaman "en fazla" yazılır. Adım 1'de satıcı kendi fiyatını girer ve "satılırsa bakiyene" tutarını canlı görür. Sahibe soruldu (§F-2). |
| Stok 0'da AL'ın çalışması kullanıcıyı şaşırtır | Kartta "Şu an satıcı yok", pencerede bekleme notu, onay adımında "Sıraya: N" yazar. Sahibe soruldu (§F-3). |
| Klavye algılaması iOS ve Android'de farklı | `focusin`/`focusout` ve `visualViewport` birlikte kullanılır. Yanlış durumda en kötü sonuç çubuğun görünmesidir; işlevi bozmaz. |
| `body:has()` eski tarayıcıda yok | Çubuk z-index 85, modal 100 olduğundan modal yine üstte kalır. Yalnız estetik bir sorundur. |
| Prod'da canlı destek yok, Destek sekmesi boş hissettirir | Yardım penceresi işe yarar bağlantılar verir. P6 `MTAB.destek` işlevini değiştirir. |
| Google düğmesi bayrak gelmeden görünür | Yalnız `S.set.googleOn` doğruysa çizilir. |
| Şifre sıfırlama yok | Bu belgenin kapsamı dışında. Ayrı iş olarak önerilir (sunucu ucu, e-posta ve WhatsApp kodu). |
| Demo kapısında beklenmeyen fark | Alt çubuk 1280'de DOM'a girmez. Başka fark çıkarsa iş durdurulur. |

**Kapsam dışı kararlar:**
- **Mağaza ve şirket bilgileri formu** (rakipteki son ekran görüntüsü) **yapılmayacak.**
  - Bizde bireysel üye satışı ve site havuzu var.
  - Mesafeli satış yükümlülükleri site adına yürüyor (PLAN §10).
  - Kurumsal satıcı ancak sahip isterse ayrı bir ürün kararı olur (§F-5).
- **Operatör ekranları** değişmiyor.
- **Masaüstü borsa düzeni** değişmiyor.

---

## 8. Masaüstünde değişenler (özet)

| Alan | Masaüstünde |
|---|---|
| Alt çubuk | Yok (DOM'a da girmez) |
| ☰ çekmece | Masaüstünde zaten görünmüyor. DOM'daki hesap bölümü sadeleşir. |
| Canlı Destek balonu | Aynen |
| Hesabım | Aynı iki sütun. Sol menüde **grup başlıkları**, Yönetim ve Bildirimlerim satırları. **Özetim** yeni kartlarla (4 sütun KPI). Profil tamamlama kartı. Diğer sekme gövdeleri aynen. |
| Borsa sayfası | **Aynen** (form ve yan kart). Yalnız "Alım siparişlerim" tablosunun durum sütununda yeni üye etiketleri. |
| Hesabım › Borsa | Tablolar kalır. Üstte "Alımlarım / Satış emirlerim" bölmesi. Yeni durum etiketleri. |
| Giriş / Üye ol | Tek pencerede iki sekme (ortalanmış modal) ve Google yeri. Alanlar aynı. |

---

## F. Sahibe sorular (sade Türkçe)

1. **Alt menü:** Alttaki 5 düğmeyi "Destek · Pazar · Ana sayfa · Borsa · Hesabım" yaptık. "İlan Ver" düğmesi Pazar menüsünde ve Hesabım'da duruyor. Borsa yerine "İlan Ver" mi olsun, yoksa böyle mi kalsın?
2. **Borsa kartında SAT fiyatı:** Kartta "SAT · en fazla ₺10" (sizin belirlediğiniz en yüksek satış fiyatı) yazıyor. Bunu mu gösterelim, yoksa sıradaki en ucuz satıcının fiyatını mı?
3. **Stok yokken AL:** Şu an stok olmasa da yang siparişi alınıp sıraya konuyor; kartta "Şu an satıcı yok" yazıyor. Böyle devam mı, yoksa satıcı yokken AL düğmesi kapansın mı?
4. **Destek düğmesi:** Canlı destek canlı sitede henüz açık değil. O zamana kadar Destek düğmesi yardım sayfalarına gidiyor. Bir WhatsApp destek numaranız varsa onu da ekleyelim mi? Numara nedir?
5. **Kurumsal satıcı:** Rakipteki "mağaza ve şirket bilgileri" formunu yapmadık; bizde herkes bireysel üye olarak satıyor. İleride şirketlerin satıcı olmasını düşünüyor musunuz?
