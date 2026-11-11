# Kurulum rehberi (P0b): veritabanı, yükleme, kurulum sihirbazı, cron, Brevo

Bu sürümde sitede gerçek üyelik, giriş, 2 adımlı doğrulama (isteğe bağlı), çalışan yetkileri ve e-posta gönderimi var.
İlk kurulum **test.yangpazar.com** adresine yapılacak. Bu adresin kendi klasörü ve kendi veritabanı olacak; asıl site
(public_html) bu kurulumdan etkilenmez.

Ne zaman ne yapacağınız sırasıyla aşağıda. Her adım birkaç dakika sürer.

---

## 1. Alt alan adı ve PHP sürümü

1. cPanel › **Domains** (ya da **Subdomains**) › `test.yangpazar.com` oluşturun.
   Belge kökü (Document Root) olarak cPanel'in önerdiği klasörü bırakın: `/home/KULLANICI/test.yangpazar.com`.
2. cPanel › **MultiPHP Manager** › `test.yangpazar.com` için **PHP 8.3** seçin (8.1–8.4 arası çalışır).
3. cPanel › **SSL/TLS Status** › `test.yangpazar.com` için **Run AutoSSL**. Adres `https://` ile açılmalı.

## 2. Veritabanını oluşturun (MySQL Database Wizard)

1. cPanel › **MySQL® Database Wizard**.
2. **Adım 1:** Veritabanı adı yazın, örneğin `yptest`. cPanel başına kullanıcı adınızı ekler: `KULLANICI_yptest`.
   Bu tam adı not edin.
3. **Adım 2:** Kullanıcı adı yazın, örneğin `yptest`; tam adı `KULLANICI_yptest` olur. **Password Generator** ile
   güçlü bir şifre üretin ve bir yere kaydedin.
4. **Adım 3:** **ALL PRIVILEGES** kutusunu işaretleyip **Make Changes** deyin.

Sunucunuzun varsayılan karakter seti latin1. Bunu değiştirmenize gerek yok: kurulum sihirbazı veritabanını
**utf8mb4**'e çevirir ve tüm tabloları utf8mb4 ile açar. Türkçe karakterler ve emojiler sorunsuz saklanır.

## 3. Dosyaları yükleyin

Size iki dosya verilir: **`yangpazar-site-<sürüm>.zip`** (site paketi) ve **`yangpazar-site-<sürüm>-KURULUM-KODU.txt`**
(tek kullanımlık kurulum kodu). Kod dosyasını sunucuya **yüklemeyin**; içindeki kodu bir yere not edin, 4. adımda gerekecek.

1. cPanel › **File Manager** › `test.yangpazar.com` klasörünü açın (tam yolu `/home/KULLANICI/test.yangpazar.com`).
   Klasörde cPanel'in koyduğu boş bir `index.html` ya da `cgi-bin` varsa `index.html`'i silebilirsiniz.
2. Zip dosyasını **Upload** ile yükleyin, sonra zip'e sağ tıklayıp **Extract** deyin (klasör olarak yine `test.yangpazar.com` seçili kalsın).
   Klasörde şunlar olmalı: `app/`, `api/`, `assets/`, `kurulum/`, `storage/`, `uploads/`, `.htaccess`, `index.php`.
   - Gizli dosyaları görmek için File Manager › sağ üst **Settings** › **Show Hidden Files**.
     `.htaccess` dosyası mutlaka yüklenmiş olmalı.
   - Açtıktan sonra zip dosyasını silebilirsiniz.
3. `storage` ve `uploads` klasörlerine sağ tıklayıp **Change Permissions** ile izni **755** yapın.

`app/` ve `storage/` klasörleri dışarıdan açılmaz. Şifreler ve veritabanı bilgileri `storage/` içinde şifreli durur.

Kurulum bitmeden `https://test.yangpazar.com` adresini açarsanız site sizi kendiliğinden kurulum sihirbazına götürür.

## 4. Kurulum sihirbazı: `https://test.yangpazar.com/kurulum/`

1. **Kurulum kodu:** `KURULUM-KODU.txt` dosyasındaki kodu yazın (büyük harf ve rakamlardan oluşur). Böylece paketi yükledikten sonra kurulumu sizden önce başkası yapamaz.
2. **Ortam denetimi:** Kırmızı ✗ varsa yanındaki açıklamayı uygulayın (genellikle cPanel › **Select PHP Version** › Extensions).
   Turuncu ! işaretleri zorunlu değildir. Yükleme sınırı küçükse cPanel › **MultiPHP INI Editor**'den
   `upload_max_filesize` ve `post_max_size` değerlerini 64M yapın.
3. **Veritabanı:** Sunucu `localhost`, port `3306`. 2. adımdaki **tam** veritabanı adını, kullanıcı adını ve şifreyi yazın.
   Önce **Bağlantıyı test et** düğmesine basın: sunucu sürümü (MariaDB 10.11) ve karakter seti görünür. Sonra **Kaydet ve devam et**.
   - Kurulumu aynı tarayıcıda bitirin. Başka bir tarayıcıdan devam edilemez; bu bir güvenlik önlemi.
4. **Tabloları oluştur** düğmesine basın.
5. **Site adı ve adresi:** `https://test.yangpazar.com` yazın.
6. **Yönetici hesabı:** Kullanıcı adı, e-posta ve en az 10 karakterlik bir şifre girin.
   Siteye bu bilgilerle **Giriş Yap** düğmesinden girersiniz.
7. **Son adım:** Bu bir test sitesi olduğu için **Demo verileriyle kur** kutusunu işaretleyebilirsiniz. Şimdilik bu kutu yalnızca demo
   hesap değiştirmeyi açıyor; örnek ilanlar sonraki sürümde gelecek. **Gerçek sitede bu kutuyu işaretlemeyin.**
8. **Kurulum tamamlandı** sayfasında 3 bilgi görünür: cron komutu, cron-job.org adresi ve PayTR Bildirim URL'si.
   **Bu sayfayı kaydedin.** Kurulum bundan sonra kilitlenir ve sayfa bir daha açılmaz.

## 5. Cron (zamanlanmış görev), her 5 dakikada bir

Cron, e-posta kuyruğunu gönderir ve temizlik yapar. Sonraki sürümlerde otomatik sipariş onayı da cron ile çalışacak.

1. cPanel › **Cron Jobs**.
2. **Common Settings**: **Once Per Five Minutes (*/5 * * * \*)** seçin.
3. **Command** alanına kurulumun son sayfasında gösterilen komutu yapıştırın. Örnek:
   ```
   /usr/local/bin/php /home/KULLANICI/test.yangpazar.com/app/cron.php >/dev/null 2>&1
   ```
   Sondaki `>/dev/null 2>&1`, cron'un size her 5 dakikada bir e-posta atmasını engeller.
4. **Add New Cron Job**.

Hostinginiz cron vermiyorsa, son sayfadaki `https://test.yangpazar.com/api/v1/cron?key=…` adresini
cron-job.org'a 5 dakikalık aralıkla ekleyin. Bu adresteki anahtar gizlidir; kimseyle paylaşmayın.

## 6. PayTR Bildirim URL

Gerçek sitede adres değişmez: `https://yangpazar.com/api/paytr_bildirim.php`. Test sitesi için son sayfada
`https://test.yangpazar.com/api/paytr_bildirim.php` gösterilir. PayTR'de yalnız bir bildirim adresi tanımlanabildiği için,
test sitesiyle ödeme denemesi yapacağınız zaman bunu birlikte planlayalım. Para işlemleri sonraki aşamada (P2) geliyor.

## 7. E-posta: Brevo hesabı (ücretsiz plan günde 300 e-posta)

Doğrulama kodları ve bildirim e-postaları Brevo üzerinden gönderilir. Hostingin kendi e-posta gönderimi yalnız yedek olarak kullanılır.

1. **https://www.brevo.com** › **Sign up free**. E-postanızla hesap açın ve gelen e-postadaki bağlantıyla hesabı onaylayın.
   Açılışta sorulan şirket bilgilerini doldurun.
2. **Gönderen adresi:** Sağ üstte hesap adınız › **Senders, Domains & Dedicated IPs** › **Senders** › **Add a sender**.
   Ad: `yangpazar`, e-posta: `noreply@yangpazar.com`. Brevo bu adrese bir onay kodu gönderir.
   Adresin önce cPanel › **Email Accounts**'ta açılmış olması gerekir.
3. **Alan adını doğrulayın (önerilir; e-postalar spam'e düşmesin):** Aynı sayfada **Domains** › **Add a domain** › `yangpazar.com`.
   Brevo'nun verdiği kayıtları (TXT/DKIM, brevo-code) cPanel › **Zone Editor** › `yangpazar.com` › **+ Add Record** ile ekleyin,
   sonra Brevo'da **Authenticate**'e basın.
4. **API anahtarı:** Sağ üstte hesap adınız › **SMTP & API** › **API Keys** sekmesi › **Generate a new API key**.
   Ad olarak `yangpazar-site` yazın. Anahtar `xkeysib-…` ile başlar ve **yalnız bir kez** gösterilir; kopyalayın.
5. **Siteye girin:** Siteye yönetici olarak giriş yapın › Yönetim › **E-posta & SMS** › **E-posta ayarları**:
   - Sağlayıcı: **Brevo API (önerilir)**, **Brevo API anahtarı** kutusuna anahtarı yapıştırın
   - Gönderen adı: `yangpazar`, gönderen adresi: `noreply@yangpazar.com` (Brevo'da onayladığınız adres)
   - **E-posta gönderimi açık** kutusunu işaretleyip **E-posta ayarlarını kaydet**
   - Kaydettikten sonra anahtar kutusu boş görünür, altında "Kayıtlı: ••••…" yazar. Bu normaldir: anahtar sunucuda şifreli saklanır
     ve güvenlik için ekrana bir daha getirilmez. Değiştirmek isterseniz yeni anahtarı yazıp kaydedin; boş bırakırsanız eskisi kalır.
   - Aynı sayfadaki **Deneme e-postası gönder** ile kendi adresinize bir deneme gönderin. Sonucu **Gönderim kayıtları** sekmesinde de görürsünüz.
   - Mailjet kullanacaksanız sağlayıcıyı **Mailjet API** seçin; API Key ve Secret Key kutuları çıkar.
6. Deneme "IP adresi tanınmadı" (unrecognised IP) hatası verirse: Brevo › hesap adınız › **Security** › **Authorised IPs**.
   Sunucunuzun IP'sini ekleyin ya da bu korumayı kapatın. Sunucu IP'si cPanel ana sayfasında sağda "Shared IP Address" olarak yazar.

Ücretsiz plan günde 300 e-posta gönderir. Panelde "saatlik sınır" ayarı olağan e-postaları yavaşlatır (varsayılan saatte 80).
Doğrulama kodları bu sınırı beklemeden hemen gider.


## 8. 2 adımlı doğrulama (isteğe bağlı)

Verdiğiniz karar gereği zorunlu değil: her kullanıcı **Hesabım** sayfasından kendisi açar. Brevo ayarı bittikten sonra
yönetici hesabınızda **e-posta ile 2 adımlı doğrulamayı** açmanızı öneririz.

SMS ile doğrulama NetGSM'e hazırlandı ama henüz gerçek NetGSM hesabıyla denenmedi. NetGSM bilgileri girilene kadar SMS seçeneği kapalı kalır.

## 9. Bu sürümde neler çalışıyor

- Üye olma, giriş/çıkış, 2 adımlı doğrulama, **Hesabım** (profil, şifre, IBAN'lar), bildirimler (sayfa açıkken birkaç saniyede bir kendiliğinden yenilenir).
- Yönetim: **Bugün** (üye sayıları), **Üyeler** (arama, detay, doğrulama, askıya alma), **Çalışanlar & yetkiler**, **E-posta & SMS**.
- İlanlar, siparişler, bakiye yükleme, para çekme, borsa, EP, reklam ve kampanyalar sonraki güncellemelerde açılacak; bu sayfalarda
  şimdilik "Yakında" yazar. Demo hesap seçici ve "Demo verilerini sıfırla" düğmesi gerçek sitede yoktur.
- Askıya aldığınız bir üye o an sitedeyse oturumu birkaç saniye içinde kapanır ve tekrar giriş yapamaz.

## Sorun olursa

- **"Site henüz kurulmadı"** ya da site açılınca kurulum sayfası geliyor: Kurulum sihirbazı bitmemiş. `/kurulum/` adresinden devam edin.
- **"Kurulum kodu eşleşmedi"**: Kodu `KURULUM-KODU.txt` dosyasından aynen (büyük harflerle) yazın. Her paketin kodu farklıdır;
  yüklediğiniz zip ile aynı adı taşıyan kod dosyasını kullanın.
- **Veritabanı "Access denied"**: 2. adımın 4. maddesinde kullanıcıyı veritabanına eklemeyi unutmuş olabilirsiniz (ALL PRIVILEGES).
- **Kurulumu baştan yapmak**: File Manager'da `storage` klasöründeki `db.php` ve `kurulum_durum.php` dosyalarını silin.
  Kurulum tamamlandıysa `kurulum_tamam.php` dosyasını da silin, cPanel › **phpMyAdmin**'de `yp_` ile başlayan tabloları kaldırın.
  Bunu yalnız test sitesinde yapın.
