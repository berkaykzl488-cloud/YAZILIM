# ELEŞTİRİ: TASARIM-hesabim-borsa.md (Sürüm 1)

2026-11-24 · Ürün, UX ve mühendislik incelemesi. Spec değiştirilmedi. Her madde kodla karşılaştırıldı; dosya ve satır numaraları verildi.

**Kısa hüküm:** Yön doğru ve sahibin kararlarıyla uyumlu. Ama spec tek seferde çok fazla şey yapıyor. Üç sayı da yanlış ya da yanıltıcı: havuzdaki satış toplamı, "stokta" ve "stoktan hemen". Google çalışmasıyla iki çakışma noktası var. 390 px testlerinden kırılacak olanların listesi de eksik. Aşağıdaki düzeltmelerle uygulanabilir.

---

## A. İstenen altı noktaya kısa yanıtlar

### A1. Alıcı/Satıcı geçişi (sahip kararıyla kapandı)
- Sahip tek "Özetim" sayfasını onayladı. Tasarımcının gerekçesi de kodla doğrulanıyor.
  - Tek cüzdan var: `wallets.cash/credit`.
  - Satış geliri `cash` kovasına gider (`Exchange::postDelivery`, `Ledger::cash($su)`).
  - "Satıcı bakiyesi" diye ayrı bir kova yok.
- Değerlendirdiğim seçenek şuydu: hafif bir "Alıcı | Satıcı" bölmesi. "Yapılacaklar" şeridi her iki görünümde sabit kalır, bölme yalnız kartları ve menü gruplarını sıralar. Acil işi saklamaz, ama yine de ek durum (`ui.role`), iki ekran görüntüsü seti ve iki test yolu getirir. Kapalı kararı yeniden açmaya değmez.
- Rakipteki rol hissini bizde menüdeki **Alışlarım / Satışlarım** grupları verir. Ek olarak, kural tabanlı ve durumsuz bir sıralama eklenebilir (C-3).

### A2. Alt çubuk (öğeler sahip kararıyla sabit)
- **Pazar'ın alt pencere açması kabul edilebilir.** TR, PVP ve EP ayrımı gerçek. İlan Ver de mobil başlıkta gizli: `app.css` ≤640 px'te `.hilan{display:none}`. Pencere ona görünür bir yer veriyor.
  - Ancak öğe bir `<a>` değil, `<button aria-haspopup="dialog" aria-expanded>` olmalı.
  - Pazar sayfalarındayken "etkin" görünümü alır ama `aria-current` almaz (B-9).
  - Not: `#ara` boş aramayla tüm ilanları zaten listeliyor (`95-router.js:19`). Yani spec'teki "tek bir tüm ilanlar sayfamız yok" cümlesi tam doğru değil. Yine de pencere daha iyi bir seçim.
- **"Hesabım'a ikinci dokunuş menüyü açar" keşfedilebilirliği bozar.** Platform alışkanlığı başka: ikinci dokunuş köke ve en üste döner (iOS ve Android sekme çubukları böyle çalışır). Gizli bir hareketi test yardımcısının temeline koymak da kırılgan. Öneri B-4'te.
- **☰ çekmeceyle ilişki:** sol çekmece site gezintisi, sağ menü hesap menüsü. Bu ayrım iyi. Ama spec'in `43-mnav.js` sadeleştirmesi hiçbir sorunu çözmüyor; demo anlık görüntü farkı ve test değişikliği getiriyor. Son iki commit (`719acf5`, `5e04d12`) çekmeceyi testlerin tıkladığı bir yer yaptı. **Çekmeceye dokunulmasın** (B-6).

### A3. Borsa kartındaki fiyatların anlamı (kodla doğrulandı)
- **AL = `ex_markets.buy`. Doğru.**
  - `placeOrder` alıcıdan peşin `qty × buy` alır (`Exchange.php:448-449`).
  - Sipariş tamamlanınca `Engine::finish`, daha ucuz eşleşen kısmın farkını iade eder (`sell = min(teklif×(1+marj), buy)`, `Engine.php:206, 281-293`).
  - Bu yüzden `buy` bir **tavandır**; alıcı hiçbir zaman fazlasını ödemez. "Sabit fiyat" ifadesi kalabilir. "İade alırsın" diye söz verilmemeli: operatör elle "Eşle" yaparsa `pair()` `sell = sipariş fiyatı` yazar ve iade olmaz (`Engine.php:163`). Bu tutarsızlık bir backend notu, tasarım konusu değil.
- **SAT = "en fazla" `ex_markets.max`. Sahip kararı, doğru.**
  - Satıcı kendi emir fiyatını alır: `amt = n × fl.price`, `cash` kovasına geçer, komisyon yok (`Engine::deliver`, `postDelivery`).
  - Ödeme, yang **alıcıya teslim edildikçe** yapılır. Spec §3.5'teki "operatör yangı aldıkça" ifadesi yanlış.
  - Para çekerken "İşlem ücreti" ve "Vergi kesintisi" düşer (`Withdraw::breakdown`). "En fazla ₺10" bakiyeye geçen tutardır, bankaya geçen değil.
  - Asıl yanıltma riski şu: satıcı ₺10 yazarsa kuyrukta **en sona** düşer, çünkü sıra ucuzdan pahalıya (`Engine::book`). Bu yüzden kartta ikincil bir satır şart (B-2).
- **"340 stokta" ve "Stoktan hemen: 20" yanıltıcı (B-1).**
  - Eşleştirme yalnız operatör eylemiyle yapılıyor (`match`/`pair`; `placeOrder` eşlemez).
  - "Stok" = eşlenmemiş satış emirlerinin kalan adedi. Ama daha önce verilmiş ve eksik kalmış alım siparişleri bu stoğu **önce** alır (`match` siparişleri `created_at` sırasıyla işler).
  - `exchange/quote`'un `miss` değeri de bekleyen talebi yok sayıyor.
- **Marj sızıyor.** Spec "margin gösterilmez" diyor. Ama `presentMarket` herkese açık yanıtta `margin` döndürüyor (`Exchange.php:147`), `publicCfg` de `exMargin` döndürüyor. Bu ekran sorunu değil, ayrı bir backend işi (C-1).

### A4. `GET me/summary`
- **Gerekli.** Bugünkü `p2Ozet`, `me/orders` uçlarından ilk 50 kaydı çekip istemcide sayıyor (`97p2-money.js:303-307`). Sayılar 50'nin üstünde yanlış çıkıyor ve iki liste çekmek gerekiyor. Alt çubuktaki Hesabım rozeti her sayfada lazım; yoklama (`poll`) ise yalnız `notifs`, `wallet` ve `exSig` taşıyor.
- **Hata 1 (must):** `sell.escrowNet = SUM(net)` her zaman 0 ya da NULL çıkar. Şemaya göre `orders.net` yalnız sipariş tamamlanınca yazılıyor (`schema/30_money.php:80`). Doğrusu `total − Rules::fee(total, rate_bp)` hesabı; JS yedeği de böyle yapıyor (`o.total*(1-o.rate/100)`).
- **Hata 2:** `ex.escrowLeft` için `SUM((qty−delivered)×price)` değil, `SUM(total − released)` kullanılmalı. `ESCROW:EX` ile birebir tutan budur.
- **Hata 3:** JSON örneğindeki tutarlar dize (`"250.00"`), ama `Text::tl` sayı döndürüyor (`Text.php:90`).
- **Hata 4:** `journal.kind` listesindeki `sms` türü artık yok, SMS kaldırıldı. Gerçek türler: `satin_alma`, `ep`, `doping`, `reklam`, `iade`.
- **Performans:** her sorgu kişiye ait dizinlerin üzerinde çalışıyor: `orders(buyer_id|seller_id,…)`, `ex_orders(user_id,id)`, `ex_offers(user_id,id)`, `withdrawals(user_id,id)`, `listings(seller_id,status)`. Sorun **boot**'ta. Boot zaten katalog sorgusu ve 50 bildirim çekiyor; girişli her sayfa açılışına 12 sorgu daha eklemek gereksiz. Öneri B-5'te.
- "Bu ay harcama" için `postings ⨝ journal` birleştirmesi gerekmez: `journal(user_id,t)` dizini var, `SUM(amount) … GROUP BY kind` yeterli.

### A5. Kapsam ve fizibilite
- Spec tek bir dev iş: alt çubuk, alt pencere, Hesabım kabuğu, menü, Özetim, yeni uç, borsa ızgarası, AL/SAT pencereleri, bekleyen işlem kartları, giriş penceresi, İlanlarım çipleri, sıralama penceresi, kapak ayrıntı penceresi ve "Beni hatırla". Ajan sırası (E.2) paralel ama **sahibe gösterilebilir ara sürüm yok.** Önerilen bölme B-10'da.
- **Kırılacak 390 px testleri spec'in listesinden fazla** (B-7).
- Tamamen eksik bir risk: sabit alt çubuk, ekranın altındaki düğmelerin üstüne biner. Playwright o zaman "element intercepts pointer events" hatasıyla tıklamayı tekrar dener ve zaman aşımına düşer. Testler bu yüzden rastgele kırılabilir.

### A6. Çakışmalar
- **Google worktree** (`agent-a440…`, commit `3bc07e3`).
  - Bayrak adı uyuşuyor: `S.set.googleOn` (`Settings::publicSet`).
  - Akış yönlendirmeli: `auth/google/start?mode=login|register&ret=<rota>` → Google → `/?gauth=<sonuç>#<rota>`. Bu nedenle spec'teki `ui.afterAuth` (bellekte tutulur) sayfa yenilenince **kaybolur** (B-3).
  - `auth/google/register` uç noktası ad, soyad ve telefon istiyor. Spec'teki "Google ile ilk girişte telefon, ad ve soyad eksik kalır" cümlesi yanlış.
  - `me.hasPass=false` olan (yalnız Google ile açılmış) hesaplar olacak.
  - Spec'in yeni dosyası `97g-giris.js`, Google'ın `98g-google.js` dosyasıyla aynı `g` önekini taşıyor. Üstelik `mLogin` ve `mRegister`'ı yeniden tanımlıyor. Yükleme sırası ters olursa Google'ın sarmalayıcısı siliniyor (B-8).
- **Destek:** spec `S.set.supportWa` alanını uyduruyor. Gerçek alanlar `S.set.whatsapp` ve `S.set.supportHours`; ikisi de boot'ta var (`Settings.php:24-25`). Sahip pencerede çalışma saatlerini de istedi.
- **PLAN §9.4** (borsa şifresi devam ediyor) ile uyumlu. **§10** (PayTR en sona) ile çatışma yok: "Bakiye yükle · ₺X eksik" düğmesi, PayTR kapalıyken yalnız EFT seçeneği olan yükleme penceresini açmalı.

---

## B. MUST-FIX (uygulamadan önce spec'te düzeltilmeli)

**B-1. Stok sayısı ve "hemen" ifadesi yanıltıcı.**
- Kartta "340 stokta" yerine "**Satışta 340**" yazılsın, ya da sunucu net stoğu versin. Net stok = `stock − Σ(açık siparişlerin eşlenmemiş adedi)`. Bu, `GET exchange` içinde pazar başına tek bir `SUM`/`JOIN ex_fills` sorgusudur.
- AL adım 2'deki "Stoktan hemen: N · Sıraya: M" satırı kaldırılsın. Yerine şu yazsın: "Siparişler sırayla eşlenir ve operatör teslim eder."
- `#ex_waitbox` metni aynen kalabilir.

**B-2. SAT satırına ikincil satır eklensin.** Sahip kararı korunur: büyük yazı "en fazla ₺X".
- Altına küçük harfle eklenir: "Sıra başı ₺9,50". Kaynak `exBook(x)[0].price`; kitap boşsa "Henüz emir yok".
- Bu bilgi masaüstü tabloda zaten herkese açık ("En ucuz emir" sütunu, `50-exchange.js:103`). Yeni bir sızıntı değil.
- `aria-label` şöyle olsun: "{Server} siteye sat: birim başına en fazla ₺10,00 bakiyene; sıra başı ₺9,50".
- §3.2'deki şu cümle düzeltilsin: "satış gerçekleşirse satıcının alabileceği en yüksek tutar". Doğrusu: "en yüksek **birim** fiyat; yang alıcıya teslim edildikçe **bakiyene** geçer".

**B-3. Girişten sonra kalınan yerden devam: yönlendirmeye dayanıklı olmalı.**
- `ui.afterAuth` yerine `sessionStorage.yp_after = {k:'bx', id, dir, t}` kullanılsın, 10 dakika geçerli, `try/catch` içinde.
- Şu yollardan sonra kontrol edilir: `pAfterAuth`, 2 adımlı doğrulama sonrası (`tfaf` → `pAfterAuth`) ve Google dönüşü (`?gauth=ok`).
- Google düğmesi `ret=borsa` taşır.
- `mLogin(err)` hata durumunda pencereyi yeniden çizer; spec'teki "Devam etmek için…" notu bu çizimde korunmalı. Çözüm: not `mAuth`'a `ui`'den okunsun.

**B-4. Hesabım'a ikinci dokunuş = Özetim ve sayfa başı.** Menü yalnız görünür düğmelerden açılsın.
- Görünür düğmeler: sayfa başındaki **[☰ Menü]** ve **Özetim'in altındaki satır içi menü**. Satır içi menü aynı `P_ACC_NAV` listesinin gruplu çizimidir.
- Böylece rakipteki "çekmece" mantığı korunur ve gizli bir hareket olmaz.
- 390 px testleri de Özetim'den doğrudan `[data-act=tab]` tıklayabilir.

**B-5. `me/summary` hatalarının düzeltilmesi ve boot yükünün küçültülmesi.**
- `escrowNet` (A4-1), `escrowLeft` (A4-2), sayısal tutarlar (A4-3) ve `kind` listesi (A4-4) düzeltilir.
- `OPEN = ('bekliyor','islemde','bilgi','kismen')` açıkça tanımlanır.
- **Boot'a yalnız `summary.todo` eklenir:** 5 COUNT sorgusu, rozet için yeterli. Tam özet yalnız Özetim açılınca `need('me:sum')` ile çekilir.
- `u.admin` için uç `{todo:{total:0}}` döner ve sorgu çalıştırmaz.
- Önbellek düşürme kuralı, spec'teki gibi bildirim ve `exSig` değişikliğine bağlı kalır. Ek olarak `visibilitychange` (sekme yeniden görünür olunca) da düşürür.
- Yoklamaya alan **eklenmez.** 8 saniyelik yoklamada kişi başı 5 COUNT paylaşımlı sunucuda pahalıya gelir.

**B-6. `43-mnav.js` değişmesin.**
- Kaldırılması önerilen satırlar (Hesabım, Mesajlar, Bildirimler) zarar vermiyor.
- Değişiklik yapılmazsa demo kapısı (`snap.js gate`, 1280 px) **sıfır fark** verir. "Yalnız `#mnav` farkı" diye bir istisna tanımlamak gerekmez.
- §1.6 ve E.3 buna göre sadeleşir.

**B-7. Kırılacak test listesi tamamlansın ve ortak yardımcı yazılsın.** Spec yalnız 3 satır sayıyor. Gerçek liste:

| Dosya | Satır | Kırılan |
|---|---|---|
| `p0b-fe.js` | 265 | `#app [data-act=tab]` (profil, banka) |
| `p1-fe.js` | 322 | `[data-t=ilan]` |
| `p2-fe.js` | 365 civarı | Hesabım sekmeleri |
| `p3-fe.js` | 81, 227-228 | `cekTab` 390 px'te |
| `p4-fe.js` | 236 | `ex-dir` düğmesi: mobil ızgarada yok |
| `p4-fe.js` | 239-240 | `[data-t=borsa\|ep]` |
| `p4-fe.js` | 246 | `#app .page-h [data-act=logout]` |
| `p5-fe.js` | 68 | `#app nav.tabs …` |
| `p5-fe.js` | 207-212 | `.page-h` üzerinden çıkış |
| `wa-fe.js` | 214 | yönetici hesabıyla 390 px'te `[data-t=profil]` |

- Yardımcı tek yerde: `tests/e2e/_hs.js`, içinde `hsTab(P,k)` ve `hsLogout(P)`.
- Mobil kabukta bir **çıkış** düğmesi `.page-h` olmadan da bulunabilmeli (menü alt bölümü).
- Her 390 px tıklamasından önce `#mtab` ile çakışma denetlenir. Çözüm: tıklamadan önce `scrollIntoView({block:'center'})`.

**B-8. Giriş penceresi ile Google arasında sözleşme.**
- Dosya adı `97g-giris.js` olmasın; `97a-auth.js` olsun.
- `mAuth`, içine `<div id="authAlt" data-mode="login|register"></div>` yuvası koyar ve `AUTH_ALT` adlı bir kayıt dizisini çağırır.
- `98g-google.js` bu diziye işlev ekler ve `mLogin`'i **sarmalamaz.** Böylece yükleme sırası önemsizleşir.
- Düğme `<a href="…/api/v1/index.php?r=auth/google/start&mode=login&ret=…">` olur, `data-act` değil. Yönlendirme akışı böyle gerektiriyor.
- "Google ile kaydı tamamla" penceresi de mobilde `sheetWrap` kabuğunu kullanmalı.
- §4'teki yanlış "telefon, ad, soyad eksik kalır" cümlesi silinsin.
- `hasPass=false` hesaplar için profil kartına bir madde eklensin: "Şifre belirle (önerilir)".

**B-9. Erişilebilirlik temeli** (bugünkü `modal()` bunların hiçbirini yapmıyor; `71-modals.js:3-5`):
- Odak tuzağı. `43-mnav.js:78`'deki kalıp kopyalanabilir.
- Pencere kapanınca odağın açan öğeye **dönmesi**.
- `aria-modal="true"`.
- Alt çubuk `<nav aria-label="Alt menü">` olur. Pazar ve Destek `button` olur, `aria-haspopup="dialog"` ve `aria-expanded` taşır.
- Rozet sayısı `<i aria-label>` ile değil, bağlantının içinde görünmez metin olarak verilir: `<span class="sr">3 bekleyen iş</span>`. `<i>` üzerindeki `aria-label` okunmaz.
- Borsa'daki nabız noktası `prefers-reduced-motion` açıkken durur.
- 11 px etiketler, 200 % yazı büyütmede `text-overflow:ellipsis` ile kesilir.

**B-10. Sürüm dilimleri.** Her dilim kendi başına yayınlanabilir ve test edilebilir olmalı:
1. **D1 Alt çubuk ve pencere kabuğu:** Destek/Yardım ve Pazar pencereleri, `.ls-fab` gizleme, test yardımcısı. `43-mnav` değişmez.
2. **D2 Borsa ızgarası ve fiyatlar:** sahibin açık isteği. AL tek adım (B-12), SAT 2 adım, `P4.stock`, B-1, B-2. Masaüstü değişmez.
3. **D3 Hesabım mobil kabuğu:** menü, satır içi menü, Özetim (yalnız mevcut veriyle), `todo` uç noktası ve rozet.
4. **D4 Tam `me/summary`:** KPI'lar, profil kartı, bekleyen işlem kartlarının yeni görsel dili.
5. **D5 Giriş/Üye ol sekmeleri:** Google birleştikten sonra, B-8 sözleşmesiyle.
- Her dilimde iki tema × 390 ve 1280 px ekran görüntüsü alınır; tüm `p*-fe.js` paketleri çalıştırılır.

**B-11. Destek penceresi sahip kararına göre düzenlensin.**
- Kaynaklar `S.set.whatsapp` (doluysa) ve `S.set.supportHours` olur.
- Satırlar: "Güvenli Alışveriş & SSS" (`#guvenli`), "Siparişimle ilgili sorun", "Borsa işlemim", Rehber.
- Uyarı metni: "Ekibimiz sizden asla şifre veya doğrulama kodu istemez."
- WhatsApp bağlantısı `https://wa.me/<yalnız rakam>` biçiminde, `rel="noopener"` ile verilir.

---

## C. SHOULD-FIX

**C-1. Marj sızıntısı (ayrı backend işi).** `presentMarket` herkese açık görünümde `margin` alanını çıkarmalı; `publicCfg` de `exMargin` alanını. Ön yüzde `exM()` yalnız yönetim ekranlarında gerekiyor.

**C-2. "Bu ay harcama" metriği netleştirilsin.**
- Ya v1'den çıkarılsın, ya da `journal(user_id,t)` üzerinden "Bu ay ödenen" olarak tanımlansın.
- Borsa alımı sipariş anında sayılır. Sonradan gelen fiyat farkı iadesi başka aya düşebilir; bu durum notta yazılsın.

**C-3. Özetim'de kural tabanlı sıralama.**
- 30 günde satış adedi alıştan fazlaysa "Satış özeti" önce gelir, değilse "Alış özeti" önce gelir.
- Durum saklanmaz, geçiş yoktur, Yapılacaklar her zaman en üsttedir.
- Sahibin rakipte gördüğü rol hissini toggle olmadan verir.

**C-4. AL ikonu.** 🛒 bizde olmayan bir sepeti çağrıştırıyor. "↓" ya da düğme içinde "AL" yazısı kullanılsın.

**C-5. SAT akışı 3 değil 2 adım olsun.** Adım 3 (özet), adım 2'nin yapışkan alt bölümüne sığıyor: "20 × ₺9,00 · satılırsa bakiyene ₺180 · [Satış emri ver]". Doğrulama hatasında adıma dönme mantığı aynen kalır.

**C-6. Borsa mobil verisi hafifletilsin.**
- `GET exchange` her pazar için 60 kayıtlık kitap, maskeli satıcılar ve pazar başına 2 sorgu döndürüyor (`82_exchange.php:99-103`).
- Izgara yalnız stok ve en ucuz fiyatı istiyor. `?lite=1` ile tek bir `GROUP BY market_id` sorgusu yeterli.
- Kitap yalnız SAT penceresi açılınca çekilir.

**C-7. Bekleyen işlem kartı metni:** "Ödeme: yang alıcıya teslim edildikçe, teslim edilen adet kadar bakiyene geçer". "Operatör yangı aldıkça" ifadesi kullanılmasın.

**C-8. Boş ve hata durumları:**
- Borsada açık pazar yok: `vExClosed` dışındaki boş durum.
- Bütün pazarlarda `buy=null`.
- `me/summary` hata verirse kartlar "—" gösterir ve küçük bir [Yenile] düğmesi çıkar. Sayfa tamamen engellenmez.
- Hiç işlemi olmayan yeni üye için üç düğmeli karşılama kartı: Bakiye yükle · Pazara göz at · İlan ver.

**C-9. Çalışan ve yönetici:**
- `u.admin` için Hesabım mobilde yalnız Yönetim paneli, Profil ve güvenlik ve Çıkış gösterir. Cüzdan ve KPI kartları gösterilmez (başlık zaten bakiyeyi gizliyor).
- `can('destek')` olan çalışanda Destek sekmesi `admin-tk`'ye gider (spec'teki gibi).
- Bu kullanıcılarda `html.lsopen` hiç eklenmez (`70-support.js:81`). Çubuğun gizlenme kuralı buna göre test edilsin.

**C-10. z-index.**
- Spec 85 öneriyor; bu, `.sdrawer-bg` ile aynı değer.
- Ayrıca `.ls-p` (81) çubuğun altında kalıyor. Gizleme kuralı bozulursa sohbet giriş alanı çubuğun altında kalır.
- Çubuk **75** olsun: `.ls-fab` (80) ve `.ls-p` (81) altında, `.qsug` (70) üstünde.

---

## D. NICE-TO-HAVE

- Yatay telefonlarda (`max-height:480px`) çubuk gizlensin, 58 px ekranı çok daraltıyor.
- ≤760 px'te başlıktaki `.me` avatar bağlantısı gizlenebilir; alt çubukta Hesabım var. Girişsizken başlıktaki **Giriş Yap düğmesi kalsın**: `wa-fe.js:210` onu bekliyor.
- Şunlar D4 sonrasına ertelensin: kapağa dokununca açılan "Pazar ayrıntısı" penceresi, sıralama penceresi, İlanlarım durum çipleri. Çiplerde "Stok bitti" etiketinin hangi `status` değerine (`satildi`) karşılık geldiği de yazılsın.
- "Beni hatırla" kutusu istenmedi. Bugün `remember:true` sabit. Davranış değişikliği, ayrı bir güvenlik kararı olarak sahibe sorulsun.
- Bekleyen işlemlerdeki 4 adımlı ilerleme çizgisi her kartta yer kaplıyor. Mobilde tek satır çip ve ilerleme çubuğu yeterli.

---

## E. Uygulama için son karar listesi

1. **Hesabım:** tek "Özetim" sayfası. Alıcı/Satıcı geçişi **yok** (sahip kararı). Roller menüde "Alışlarım" ve "Satışlarım" grubu olarak görünür. Özetim'de en üstte "Yapılacaklar" bulunur; ardından cüzdan ve kural tabanlı sıralanmış özet bölümleri gelir.
2. **Alt çubuk:** Destek · Pazar · Ana sayfa · Borsa · Hesabım (sahip kararı). Yalnız ≤760 px'te DOM'a girer, z-index 75.
3. **Hesabım'a ikinci dokunuş** Özetim'e ve sayfa başına götürür. Menü yalnız görünür [☰ Menü] düğmesiyle ve Özetim'in altındaki satır içi menüyle açılır.
4. **Pazar** alt pencere açar: TR, PVP, EP, Ara, + İlan ver. Öğe bir `button`'dır.
5. **Destek:** alt çubukta kalır. P6'ya kadar Yardım penceresi açar: `S.set.whatsapp` (doluysa), Güvenli Alışveriş & SSS, `S.set.supportHours`, sipariş ve borsa yardım satırları. Demoda canlı sohbet açılır. Mobilde `.ls-fab` gizlenir.
6. **Borsa kartı:** SAT = "en fazla `TL(x.max)`" ve altında "Sıra başı ₺…" (sahip kararı ve B-2). AL = `TL(x.buy)` "sabit fiyat". Stok "Satışta N" olarak yazılır ya da sunucudan net stok gelir. "Stoktan hemen" ifadesi yok. Marj ekranda görünmez.
7. **Stok 0 iken AL çalışmaya devam eder** (sipariş sıraya alınır). Kartta "Şu an satıcı yok" yazar; açık konu, mevcut davranış korunur.
8. **AL tek adım, SAT iki adım.** `FORM.exorder` ve `FORM.exoffer` aynen kullanılır. Pencere açılınca `ui.exId` ayarlanır. Mobil sayfada form çizilmez, form yalnız pencerede bulunur.
9. **`me/summary`:** düzeltilmiş formüllerle (B-5). Boot'a yalnız `todo` eklenir. Yoklamaya alan eklenmez. Yönetici için boş döner.
10. **`43-mnav.js` değişmez.** Demo kapısında fark beklenmez.
11. **Giriş penceresi** Google birleştikten sonra yapılır. Dosya `97a-auth.js` olur. Google `#authAlt` yuvasına ve `AUTH_ALT` dizisine bağlanır. Girişten sonra devam bilgisi `sessionStorage`'da tutulur.
12. **Sürüm sırası:** D1 → D2 → D3 → D4 → D5. Her dilimde tüm `p*-fe.js` paketleri, iki tema ve 390/1280 px ekran görüntüleri; B-7'deki test yardımcısı ilk dilimde yazılır.
13. **Kapsam dışı:** kurumsal satıcı formu, operatör ekranları, masaüstü borsa düzeni, şifre sıfırlama.
