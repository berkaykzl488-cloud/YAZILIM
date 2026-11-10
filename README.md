# yangpazar.com

Metin2 Yang, Won, EP ve İtem pazaryeri arayüzü (tek dosyalık HTML uygulaması). Proje geliştirme aşamasındadır.

- Çalıştırmak için `index.html` dosyasını tarayıcıda açman yeterli.
- İlk sürüm kaynağı (İtemHan Pazaryeri): https://claude.ai/artifact/XzP2U5EtEEjbzwzxfc4oXn

> Not: Sayfa bazı yerlerde Claude artifact çalışma zamanına (`window.claude`) dayanıyor;
> artifact dışında açıldığında bu özellikler devre dışı kalabilir.
> Ödeme anahtarları, IBAN, VKN, telefon ve cüzdan bilgileri demo değerlerdir.
> e-Gider Pusulası belgeleri tarayıcıda üretilen örneklerdir; gerçek GİB/entegratör bağlantısı yoktur.

## Sunucu API paketi (`api/`)

PayTR, Paraşüt ve Bizim Hesap bağlantıları için PHP paketi. Hiçbir dosya düzenlenmez:

1. Yönetim › Sistem › **Entegrasyonlar**'dan `yangpazar-api.zip` dosyasını indirip hostingin `public_html` klasörüne yükleyin ve ayıklayın.
2. Aynı sayfadan kurulumu tamamlayın (API şifresi), PayTR bilgilerini girip **Bağlantıyı test et**'e basın.
3. Sayfanın gösterdiği **Bildirim URL**'sini PayTR Mağaza Paneli'ne yapıştırın; isterseniz hakediş cron adresini cron-job.org'a ekleyin.

Ayrıntılar: `api/KURULUM.txt`. Zip, `src/js/demo/kits.js` içindeki `API_KIT_FILES` sabitinden üretilir; bu klasör onun kaynağıdır
(değişiklikten sonra yeniden gömülmelidir, aşağıya bakın). Panelden indirilen her pakete tek kullanımlık bir kurulum kodu eklenir.

## Geliştirme

`index.html` artık **derleme çıktısıdır**; doğrudan düzenlemeyin. Kaynaklar `src/` altında:

- `src/shell.html`: HTML iskeleti (`<!--@CSS-->` ve `<!--@JS-->` yer tutucuları)
- `src/app.css`: tüm stiller
- `src/js/*.js`: klasik `<script>` dosyaları; tek global kapsamı paylaşırlar. Yükleme sırası `src/js/manifest.txt`'tedir (sırayı değiştirmeyin).
- `src/js/demo/`: yalnız demo (seed, migrate/seed3, `POSTS_DEMO`, gömülü kitler `TC_PHP`/`API_KIT_FILES`/`zipFiles`). Prod derlemesine girmez.
- `src/js/prod/`: yalnız prod derlemesine giren saplamalar (demo verisi yokken boş durum + bakım sayfası).

Derleme (PHP 8 CLI, bağımlılık yok):

```sh
php tools/build.php --single        # src/ → index.html (tek dosya, demo dahil; bayt-bayt aynı birleştirme)
php tools/build.php --check         # index.html src/ ile güncel mi? (değilse çıkış 1)
php tools/build.php --prod          # src/ → dist/ (assets/app.css + assets/js/*.js?v=<hash>, demo hariç)
php tools/build.php --prod --demo   # aynı, demo dahil (çok dosyalı demo; şimdilik yalnız dolu localStorage ile, aşağıya bakın)
```

API paketini yeniden gömmek (`api/` değiştiyse): `php tools/build.php --embed-api && php tools/build.php --single`.
Bu komut `src/js/demo/kits.js` içindeki `/* API_KIT_BEGIN */ … /* API_KIT_END */` işaretleri arasını `api/` dosyalarıyla yeniden yazar; işaretleri silmeyin.

Regresyon kapısı (Node 22 + Playwright; sabit saat, sabit `Math.random`, temiz localStorage, ~136 rota/sekme: genel sayfalar,
üye hesap sekmeleri, tüm yönetim bölümleri ve alt sekmeleri):

```sh
node tests/snapshot/snap.js gate                       # git HEAD:index.html ↔ ./index.html; DOM metni + HTML aynı olmalı, konsol hatası olmamalı
node tests/snapshot/snap.js run <dosya.html> <klasör>  # tek derlemenin anlık görüntüleri
node tests/snapshot/snap.js diff <klasörA> <klasörB>
```

Çıktılar `tests/snapshot/out/` altına yazılır (git'e girmez).

> Çok dosyalı derlemede (dist/) bilinen sıralama riskleri: tek `<script>` içinde fonksiyon bildirimleri en başa taşınırken
> ayrı dosyalarda taşınmaz. `42-views-member.js` içindeki `S = migrate(load())` ilk açılışta sonraki dosyalardaki
> `POSTS_DEMO`, `tradeShot`, `shotNote` ve (`__r9Save` ile `save()` üzerinden) `62-admin-panels.js`'deki `var BKNOW`'a erişir;
> `setTimeout(()=>tcHashFill())` ise `71-modals.js` yüklenmeden çalışabilir. Bu yüzden `--prod --demo` temiz localStorage ile açılmaz.
> Açılış (boot) kodunun sona taşınması P0b'nin işidir.
