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

Ayrıntılar: `api/KURULUM.txt`. Zip, `index.html` içindeki `API_KIT_FILES` sabitinden üretilir; bu klasör onun kaynağıdır
(değişiklikten sonra `API_KIT_FILES` yeniden oluşturulmalıdır). Panelden indirilen her pakete tek kullanımlık bir kurulum kodu eklenir.
