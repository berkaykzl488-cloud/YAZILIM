# NOVA Fit

Kişisel spor ve sağlık uygulaması: adım sayar, GPS ile koşu takibi, ev/salon antrenmanı (animasyonlu hareket anlatımı), beslenme ve kalori takibi (1.000+ yiyecek, barkod, Open Food Facts), fit tarifler ve zararlı alışkanlıkları bırakma.

Kurulum gerektirmeyen bir **PWA**'dır (telefona uygulama gibi yüklenen web uygulaması). Bağımlılık yok, derleme yok; tüm veriler yalnızca telefonda saklanır.

## Telefona yükleme

1. Uygulamayı bir adreste yayınla (aşağıya bak) ve telefonda aç.
2. **Android / Chrome:** sağ üstteki **⋮** › **Uygulamayı yükle** (veya *Ana ekrana ekle*).
3. **iPhone / Safari:** **Paylaş** › **Ana Ekrana Ekle**.

Bundan sonra ana ekrandan normal bir uygulama gibi tam ekran açılır, internetsiz de çalışır.

## Yayınlama (GitHub Pages)

Depoda `.github/workflows/nova-pages.yml` hazırdır. Bir kez:

1. GitHub › depo › **Settings › Pages › Source: GitHub Actions** seç.
2. `nova/` klasöründe değişiklik içeren bir push yap (veya Actions sekmesinden iş akışını elle çalıştır).
3. Adres: `https://<kullanıcı-adı>.github.io/<depo>/`

> Konum (GPS), kamera (barkod) ve hareket sensörü (adım) yalnızca **https** adreslerinde çalışır; GitHub Pages bunu sağlar.

Bilgisayarda denemek için: `cd nova && npx http-server .` (veya herhangi bir statik sunucu) ve `http://localhost:8080`.

## Bölümler

| Bölüm | Neler var |
|---|---|
| **Merkez** | Günlük skor, adım/kalori/hareket halkaları, kalori dengesi, bölüm özetleri, 7 günlük adım |
| **Adım** | Telefon sensörüyle adım sayma (uygulama açıkken), elle adım girme, günlük liste, 7/30 gün grafik, seriler |
| **Koşu** | GPS kaydı, kendi haritası, tempo/ayrık süreler, sesli koç, geçmiş, rekorlar, GPX indirme |
| **Spor** | Ev ve salon programları, her egzersizde adım adım animasyon, set/kg kaydı, dinlenme sayacı, geçmiş |
| **Beslenme** | Öğün günlüğü, 1.066 yiyecek, internet araması, barkod okuma, su takibi, haftalık özet |
| **Tarifler** | Kahvaltıdan tatlıya fit tarifler, porsiyon ayarı, öğüne ekleme, pişirme modu, alışveriş listesi, menü önerisi |
| **Bırak** | Sigara/alkol/şeker vb. bırakma, temiz süre sayacı, biriken para, sağlık iyileşme zaman çizelgesi, acil destek (nefes egzersizi) |
| **Profil** | Boy/kilo/hedef, kalori ve makro hedefleri, kilo takibi, yedekleme/geri yükleme |

## Bilinen sınırlar

- Web uygulaması adımları yalnızca **uygulama açıkken** sayar. Arka planda sayım (Google Fit / Health Connect / Apple Sağlık) için uygulamanın telefon sürümü (Capacitor ile paketleme) gerekir — planlanan sonraki adım.
- Markalı ürünlerin değerleri yaklaşıktır; uygulama bunları "≈" ile işaretler. Kesin değer için paketin etiketine bakılmalı.
- Barkod kamerası Android Chrome'da otomatik okur; iPhone'da barkod numarası elle yazılır.
- Sağlık bilgileri genel bilgilendirme amaçlıdır, tıbbi tavsiye değildir.

## Geliştirme

Modül yapısı ve ortak API için: [`MODULE_CONTRACT.md`](MODULE_CONTRACT.md).
