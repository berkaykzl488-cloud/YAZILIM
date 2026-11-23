import { build } from './_build.js';

export default build('tatli', [
  ['fit-sutlac', 'Fit sütlaç', '🍚', 'vj gs', 4, 5, 35, 'orta',
    ['1/2 su bardağı pirinç|yıkanmış', '1000 ml yarım yağlı süt', '2 yk bal', '1 yk pirinç unu', '1 su bardağı su', '1 tutam tarçın'],
    ['Pirinci suyla birlikte suyunu çekene kadar 10 dakika pişir.', 'Sütü ekle, kısık ateşte ara ara karıştırarak 20 dakika pişir.', 'Pirinç ununu yarım çay bardağı soğuk sütle açıp tencereye ekle; 5 dakika karıştırarak koyulaştır.', 'Ocaktan alınca balı karıştır ve kaselere paylaştır.', 'Soğuyunca tarçın serpip servis et.'],
    ['Bal sıcakta eklenirse aroması kaybolur; ocaktan aldıktan sonra ekle.'],
    [240, 10.1, 41.25, 3.9, 0.3], 260],

  ['chia-puding', 'Çilekli chia puding', '🍮', 'vj gs mp', 2, 5, 0, 'kolay',
    ['4 yk chia tohumu', '400 ml yarım yağlı süt', '1 tk bal', '100 g çilek', '1 tutam vanilya'],
    ['Chia, süt, bal ve vanilyayı karıştır.', '10 dakika sonra tekrar karıştır ki topaklanmasın.', 'Buzdolabında en az 4 saat beklet.', 'Üzerine çilek ekleyip servis et.'],
    ['Buzdolabında 4 gün saklanır.'],
    [240, 10.95, 26.45, 10.65, 9], 300],

  ['kakaolu-protein-puding', 'Kakaolu protein puding', '🍫', 'vj gs', 2, 5, 8, 'kolay',
    ['400 ml yarım yağlı süt', '30 g protein tozu|kakaolu ya da vanilyalı', '2 yk mısır nişastası', '1 yk kakao', '1 tk bal'],
    ['Sütün yarısını nişasta ve kakaoyla pürüzsüz olana kadar çırp.', 'Kalan sütle birlikte kısık ateşte sürekli karıştırarak 7 dakika koyulaştır.', 'Ocaktan alıp 2 dakika beklet; protein tozu ve balı çırparak ekle.', 'Kaselere paylaştırıp buzdolabında 1 saat soğut.'],
    ['Protein tozunu kaynarken eklersen topaklanır.'],
    [209, 19.1, 23.85, 4.15, 1], 220],

  ['yulafli-muzlu-kurabiye', 'Yulaflı muzlu kurabiye', '🍪', 'vj od', 6, 10, 15, 'kolay',
    ['2 adet muz|olgun', '120 g yulaf ezmesi', '40 g bitter çikolata|parça', '30 g ceviz içi', '1 tk tarçın'],
    ['Fırını 180 °C’ye ısıt.', 'Muzları çatalla ez, yulaf ve tarçınla karıştır.', 'Çikolata ve cevizi ekleyip 10 dakika dinlendir.', 'Kaşıkla 12 kurabiye şekillendirip yağlı kâğıda diz.', 'Fırında 15 dakika pişir; porsiyon 2 kurabiyedir.'],
    null,
    [185, 4.45, 24.7, 7.6, 4], 55],

  ['fit-cheesecake', 'Fit yoğurtlu cheesecake', '🍰', 'vj', 8, 25, 50, 'zor',
    ['100 g yulaf ezmesi', '30 g hurma', '1 yk hindistan cevizi yağı', '500 g süzme yoğurt|az yağlı', '250 g lor peyniri', '3 adet yumurta', '3 yk bal', '2 yk mısır nişastası', '1 adet limon|kabuğu rendesi'],
    ['Fırını 170 °C’ye ısıt.', 'Yulaf, hurma ve hindistan cevizi yağını rondoda çekip kelepçeli kalıbın tabanına bastır; 10 dakika pişir.', 'Yoğurt, lor, yumurta, bal, nişasta ve limon kabuğunu blenderda pürüzsüz çek.', 'Dolguyu tabanın üzerine dök ve 40 dakika pişir.', 'Fırını kapatıp kapağı aralık 30 dakika beklet, sonra buzdolabında en az 4 saat soğut.'],
    ['Ortası hafif titrek olmalı; soğudukça sertleşir.', 'Üzerine taze meyve ya da şekersiz meyve sosu koyabilirsin.'],
    [207, 13.5, 22.55, 6.95, 1.6], 130],

  ['fit-muzlu-ekmek', 'Fit muzlu ekmek', '🍞', 'vj', 10, 15, 45, 'orta',
    ['3 adet muz|çok olgun', '2 adet yumurta', '200 g yulaf unu', '100 g yoğurt', '2 yk bal', '1 yk hindistan cevizi yağı|eritilmiş', '30 g ceviz içi', '1 tk kabartma tozu', '1 tk tarçın'],
    ['Fırını 175 °C’ye ısıt, baton kek kalıbını yağlı kâğıtla kapla.', 'Muzları ez; yumurta, yoğurt, bal ve yağı ekleyip çırp.', 'Yulaf unu, kabartma tozu ve tarçını ekleyip karıştır, cevizi ilave et.', 'Kalıba dök ve 45 dakika, kürdan kuru çıkana kadar pişir.', 'Kalıpta 10 dakika soğutup 10 dilime kes.'],
    null,
    [173, 5.1, 24.45, 6.1, 3], 70],

  ['firinda-tarcinli-elma', 'Fırında tarçınlı elma', '🍎', 'vj gs', 4, 10, 30, 'kolay',
    ['4 adet elma', '30 g ceviz içi|kırılmış', '2 tk bal', '1 tk tarçın', '200 g süzme yoğurt|az yağlı'],
    ['Fırını 180 °C’ye ısıt.', 'Elmaların çekirdekli kısmını oyarak çıkar.', 'Ceviz, tarçın ve balı karıştırıp elmaların içine doldur.', 'Fırın kabına diz, dibine yarım çay bardağı su koy ve 30 dakika pişir.', 'Ilık elmaları birer kaşık yoğurtla servis et.'],
    null,
    [200, 6.1, 31, 6.4, 4.5], 230],

  ['kakaolu-avokado-mus', 'Kakaolu avokado mus', '🥑', 'vg gs sz', 2, 10, 0, 'kolay',
    ['1 adet avokado|olgun', '1 adet muz', '2 yk kakao', '2 adet hurma|çekirdeksiz', '50 ml badem sütü'],
    ['Tüm malzemeleri rondoda tamamen pürüzsüz olana kadar çek.', 'Kaselere paylaştır.', 'Buzdolabında 30 dakika soğutup servis et.'],
    ['Avokadonun tadı hiç hissedilmez; çikolatalı puding gibi olur.'],
    [222, 3.4, 27.1, 11.8, 8], 140],

  ['fit-tiramisu', 'Fit tiramisu', '☕', 'vj', 4, 20, 0, 'orta',
    ['200 g süzme yoğurt|az yağlı', '200 g lor peyniri', '30 g protein tozu|vanilyalı', '1 yk bal', '80 g yulaflı bisküvi', '100 ml espresso|soğutulmuş', '1 yk kakao'],
    ['Yoğurt, lor, protein tozu ve balı blenderda pürüzsüz çek.', 'Bisküvileri espressoya kısa süre batır ve kapların dibine diz.', 'Üzerine kremanın yarısını yay, bir kat daha bisküvi ve krema ekle.', 'Buzdolabında en az 3 saat beklet; servis ederken kakao ele.'],
    null,
    [222, 18.25, 22.9, 6.3, 1.5], 150],

  ['yogurtlu-meyve-bark', 'Dondurulmuş yoğurt dilimleri', '🍧', 'vj gs', 6, 10, 0, 'kolay',
    ['500 g süzme yoğurt|az yağlı', '1 yk bal', '150 g çilek ve yaban mersini', '20 g bitter çikolata|rendelenmiş'],
    ['Yoğurdu balla karıştır.', 'Yağlı kâğıt serili tepsiye 1 cm kalınlığında yay.', 'Meyveleri ve çikolatayı üzerine serp.', 'Dondurucuda en az 3 saat beklet ve parçalara kır.'],
    ['Dondurucuda 2 hafta saklanır; dondurma yerine harika bir seçenek.'],
    [103, 8, 10, 3.6, 0.8], 115],

  ['fit-kabak-tatlisi', 'Tahinli cevizli kabak tatlısı', '🎃', 'vj gs', 6, 10, 40, 'kolay',
    ['1000 g balkabağı|dilim', '1 yk bal', '1 tk tarçın', '40 g ceviz içi|kırılmış', '1 yk tahin'],
    ['Balkabağını tencereye diz, tarçın serp ve yarım çay bardağı su ekle.', 'Kapağı kapalı kısık ateşte 35 dakika, yumuşayana kadar pişir.', 'Ocaktan alınca balı gezdir ve soğumaya bırak.', 'Servis ederken tahin ve cevizle süsle.'],
    ['Klasik tarifteki şekerin yerine kabağın kendi tatlılığı ve az bal yeter.'],
    [120, 3.1, 15.1, 5.8, 2], 180],

  ['nohutlu-brownie', 'Nohutlu fit brownie', '🍫', 'vj gs', 9, 15, 25, 'orta',
    ['400 g haşlanmış nohut|süzülmüş', '60 g fıstık ezmesi', '3 yk kakao', '80 g hurma|çekirdeksiz', '1 adet yumurta', '30 g bitter çikolata|parça', '1 tk kabartma tozu'],
    ['Fırını 180 °C’ye ısıt, kare kalıbı yağlı kâğıtla kapla.', 'Çikolata hariç tüm malzemeleri rondoda pürüzsüz çek.', 'Çikolata parçalarını karıştırıp kalıba yay.', 'Fırında 25 dakika pişir; tamamen soğuyunca 9 kareye kes.'],
    ['Nohudun tadı hiç belli olmaz, lif ve protein değerini ise artırır.'],
    [175, 7.3, 21.9, 6.8, 5], 70],

  ['proteinli-muz-dondurma', 'Proteinli muz dondurma', '🍨', 'vj gs sz', 2, 5, 0, 'kolay',
    ['2 adet muz|dilimlenip dondurulmuş', '30 g protein tozu', '100 ml yarım yağlı süt', '1 yk fıstık ezmesi'],
    ['Donmuş muzları rondoya al ve birkaç dakika bekletip hafif yumuşamasını sağla.', 'Protein tozu ve sütü ekleyerek kremsi olana kadar çek.', 'Kaselere al, fıstık ezmesini gezdir ve hemen ye.'],
    ['Daha sert kıvam istersen 30 dakika dondurucuda beklet.'],
    [245, 16.95, 32.4, 5.9, 3.5], 190],

  ['hurmali-muhallebi', 'Hurmalı fit muhallebi', '🥛', 'vj gs sz', 4, 10, 12, 'kolay',
    ['750 ml yarım yağlı süt', '3 yk mısır nişastası', '6 adet hurma|çekirdeksiz', '1 tutam vanilya', '1 tutam tarçın'],
    ['Hurmaları sütün bir kısmıyla blenderda püre haline getir.', 'Kalan süt ve nişastayı çırp, hurmalı sütle birlikte tencereye al.', 'Kısık ateşte sürekli karıştırarak koyulaşana kadar 10 dakika pişir.', 'Vanilyayı ekle, kaselere paylaştır ve soğut; tarçınla servis et.'],
    null,
    [150, 6.5, 24.75, 2.85, 1], 220],

  ['yaban-mersinli-muffin', 'Yaban mersinli protein muffin', '🧁', 'vj', 8, 15, 22, 'kolay',
    ['100 g yulaf unu', '2 adet yumurta', '200 g yoğurt', '30 g protein tozu', '1 adet muz|ezilmiş', '100 g yaban mersini', '1 yk bal', '1 tk kabartma tozu'],
    ['Fırını 180 °C’ye ısıt, muffin kalıbına kâğıt kapsül yerleştir.', 'Yumurta, yoğurt, muz ve balı çırp.', 'Yulaf unu, protein tozu ve kabartma tozunu ekleyip karıştır; yaban mersinini ilave et.', 'Hamuru 8 kalıba paylaştır ve 22 dakika pişir.'],
    ['Kahvaltıda ya da antrenman öncesi pratik bir ara öğündür.'],
    [124, 7.4, 16.4, 3.15, 2], 85],

  // --- Ek tarifler ---
  ['orman-meyveli-protein-parfe', 'Orman meyveli protein parfe', '🫐', 'vj', 2, 10, 0, 'kolay',
    ['300 g süzme yoğurt|az yağlı', '150 g orman meyvesi', '2 yk yulaf ezmesi', '1 yk chia tohumu', '1 tk bal'],
    ['Yoğurdu balla karıştır.', 'Bardaklara sırayla yoğurt, meyve, yulaf ve chia katlarını diz.', 'En üste meyve koyup hemen ya da 1 saat soğutup servis et.'],
    null,
    [222, 17.6, 27.7, 5.6, 4.6], 245],

  ['kakaolu-muzlu-lor-kremasi', 'Kakaolu muzlu lor kreması', '🍫', 'vj gs sz hz', 2, 5, 0, 'kolay',
    ['250 g lor peyniri', '1 adet muz|olgun', '1 yk kakao', '2 adet hurma|çekirdeksiz', '1 tutam tarçın'],
    ['Tüm malzemeleri blenderda pürüzsüz olana kadar çek.', 'Kaselere paylaştır ve 15 dakika buzdolabında beklet.'],
    ['Şeker eklenmedi; tatlılık muz ve hurmadan gelir.'],
    [206, 15.2, 25.8, 6, 3.4], 195],
]);
