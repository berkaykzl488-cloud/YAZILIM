import { build } from './_build.js';

export default build('corba', [
  ['mercimek-corbasi', 'Mercimek çorbası', '🥣', 'vg gs od mp', 4, 10, 30, 'kolay',
    ['1 su bardağı kırmızı mercimek|yıkanmış', '1 adet soğan|doğranmış', '1 adet havuç|doğranmış', '1 adet patates|küçük boy, doğranmış', '1 yk zeytinyağı', '1500 ml su', '1 tk kimyon', '1 tk kuru nane', '1 tutam tuz'],
    ['Zeytinyağında soğanı 3 dakika kavur.', 'Havuç ve patatesi ekleyip 2 dakika daha çevir.', 'Mercimeği ve sıcak suyu ekle, kaynayınca ateşi kıs ve 25 dakika pişir.', 'Blenderdan geçir, kimyon ve tuzu ekleyip 2 dakika daha kaynat.', 'Kuru naneyle servis et; limon sıkmayı unutma.'],
    ['Buzdolabında 4 gün, dondurucuda 2 ay saklanır.', 'Kıvamı koyulaşırsa ısıtırken biraz sıcak su ekle.'],
    [230, 12.2, 36.5, 3.9, 6], 350],

  ['ezogelin-corbasi', 'Ezogelin çorbası', '🍲', 'vg od', 4, 10, 30, 'kolay',
    ['3/4 su bardağı kırmızı mercimek', '1/4 su bardağı pirinç', '2 yk ince bulgur', '1 adet soğan|ince doğranmış', '1 yk domates salçası', '1 yk biber salçası', '1 yk zeytinyağı', '1500 ml su', '1 tk kuru nane', '1 tk pul biber'],
    ['Zeytinyağında soğanı 3 dakika kavur, salçaları ekleyip 1 dakika daha çevir.', 'Yıkanmış mercimek, pirinç ve bulguru ekle.', 'Sıcak suyu ilave et; kaynayınca kısık ateşte 25 dakika ara ara karıştırarak pişir.', 'Nane ve pul biberi ekle, tuzunu ayarlayıp 2 dakika daha kaynat.'],
    ['Ezogelin pürüzsüz değil, taneli içilir; blenderdan geçirmene gerek yok.'],
    [232, 10.6, 38.6, 3.9, 5], 350],

  ['terbiyeli-tavuk-suyu-corba', 'Terbiyeli tavuk suyu çorba', '🐔', 'yp', 4, 10, 35, 'orta',
    ['300 g tavuk göğsü', '1/4 su bardağı pirinç', '1 adet havuç|rendelenmiş', '1 adet yumurta sarısı', '1 adet limon|suyu', '1 yk un', '1 tk tereyağı', '1500 ml su', '1 tutam karabiber'],
    ['Tavuğu suyla birlikte kaynat, köpüğünü al ve 20 dakika pişir.', 'Tavuğu çıkar, didikle; suyuna pirinci ve havucu ekleyip 12 dakika pişir.', 'Yumurta sarısı, un ve limon suyunu bir kasede çırp; üzerine bir kepçe sıcak çorba ekleyerek ılıştır.', 'Terbiyeyi karıştırarak çorbaya ekle, didiklenmiş tavuğu da koy ve 3 dakika daha pişir.', 'Tereyağını eritip üzerine gezdir, karabiberle servis et.'],
    ['Terbiye kesilmesin diye çorbaya eklerken ateşi kıs ve sürekli karıştır.'],
    [166, 19.1, 13.2, 4.1, 0.5], 350],

  ['sebze-corbasi', 'Sütlü sebze çorbası', '🥕', 'vj gs od', 4, 10, 25, 'kolay',
    ['2 adet havuç', '2 adet patates|orta boy', '1 adet kabak', '1 adet soğan', '1 yk domates salçası', '1 yk zeytinyağı', '200 ml yarım yağlı süt', '1200 ml su', '1 tutam tuz'],
    ['Tüm sebzeleri küçük küp doğra.', 'Soğanı zeytinyağında 3 dakika kavur, salçayı ekle.', 'Diğer sebzeleri ve suyu ekle; kapağı kapalı 20 dakika pişir.', 'Blenderdan geçir, sütü ekleyip karıştırarak 3 dakika daha ısıt.'],
    null,
    [148, 4.5, 22.7, 4.4, 3.5], 330],

  ['brokoli-corbasi', 'Brokoli çorbası', '🥦', 'vj gs', 4, 10, 20, 'kolay',
    ['500 g brokoli|çiçeklerine ayrılmış', '1 adet soğan', '1 adet patates|küçük boy', '300 ml yarım yağlı süt', '1 yk zeytinyağı', '900 ml su', '1 tutam muskat', '1 tutam tuz'],
    ['Soğanı zeytinyağında 3 dakika kavur.', 'Brokoli, patates ve suyu ekle; 15 dakika pişir.', 'Blenderdan geçir, sütü ve muskatı ekle.', 'Kısık ateşte 3 dakika daha ısıt, tuzunu ayarla.'],
    ['Birkaç brokoli çiçeğini ayrı haşlayıp servis ederken üzerine koyabilirsin.'],
    [152, 7, 20.5, 5, 4.5], 340],

  ['mantar-corbasi', 'Mantar çorbası', '🍄', 'vj', 4, 10, 20, 'kolay',
    ['400 g mantar|dilimlenmiş', '1 adet soğan', '2 yk un', '400 ml yarım yağlı süt', '1 tk tereyağı', '1 yk zeytinyağı', '600 ml su', '1 tutam kekik', '1 tutam karabiber'],
    ['Zeytinyağı ve tereyağında soğanı 3 dakika kavur.', 'Mantarları ekle, suyunu salıp çekene kadar 6 dakika pişir.', 'Unu ekleyip 1 dakika kavur, ardından suyu yavaşça ekleyerek karıştır.', 'Sütü ekle ve kısık ateşte 10 dakika pişir; dilersen yarısını blenderdan geçir.', 'Kekik ve karabiberle servis et.'],
    null,
    [140, 7.3, 14, 6.25, 1.5], 320],

  ['yayla-corbasi', 'Yayla çorbası', '🥛', 'vj', 4, 5, 25, 'orta',
    ['500 g yoğurt', '1/3 su bardağı pirinç', '1 adet yumurta', '1 yk un', '1 tk tereyağı', '1200 ml su', '1 tk kuru nane', '1 tutam tuz'],
    ['Pirinci suyla birlikte yumuşayana kadar 15 dakika haşla.', 'Yoğurt, yumurta ve unu ayrı bir kapta pürüzsüz olana kadar çırp.', 'Bir kepçe sıcak sudan ekleyerek karışımı ılıştır.', 'Karışımı tencereye yavaşça ekle; sürekli karıştırarak kaynayınca 5 dakika pişir.', 'Tereyağında naneyi 30 saniye çevir ve çorbanın üzerine gezdir.'],
    ['Yoğurt kesilmesin diye kaynayana kadar hep aynı yöne karıştır.'],
    [162, 7.3, 19.4, 6.1, 0.3], 330],

  ['nohutlu-tarhana-corbasi', 'Nohutlu tarhana çorbası', '🍜', 'vj od', 4, 5, 15, 'kolay',
    ['4 yk tarhana', '100 g haşlanmış nohut', '1 yk domates salçası', '1 tk tereyağı', '1 tk zeytinyağı', '1200 ml su', '1 tk kuru nane'],
    ['Tarhanayı bir bardak soğuk suyla açıp 5 dakika beklet.', 'Yağlarda salçayı 1 dakika kavur, kalan suyu ekle.', 'Su ılıyınca tarhanayı karıştırarak ekle, kaynayınca ateşi kıs.', 'Nohutu ekle ve ara ara karıştırarak 10 dakika pişir.', 'Naneyi serpip servis et.'],
    null,
    [117, 4.4, 17.5, 3.3, 3], 300],

  ['domates-corbasi', 'Kaşarlı domates çorbası', '🍅', 'vj', 4, 10, 20, 'kolay',
    ['800 g domates|rendelenmiş', '1 adet soğan', '2 yk un', '300 ml yarım yağlı süt', '1 yk zeytinyağı', '500 ml su', '40 g kaşar peyniri|az yağlı, rendelenmiş', '1 tutam fesleğen'],
    ['Zeytinyağında soğanı 3 dakika kavur, unu ekleyip 1 dakika daha çevir.', 'Domatesleri ve suyu ekle; 12 dakika pişir.', 'Blenderdan geçir, sütü ekleyip 3 dakika daha kaynat.', 'Kaselere paylaştır, üzerine kaşar ve fesleğen serp.'],
    null,
    [162, 8, 17.5, 6.85, 2.6], 330],

  ['balkabagi-corbasi', 'Zencefilli balkabağı çorbası', '🎃', 'vj gs', 4, 15, 25, 'kolay',
    ['700 g balkabağı|küp doğranmış', '1 adet soğan', '1 adet havuç', '1 tk zencefil|rendelenmiş', '1 yk zeytinyağı', '200 ml yarım yağlı süt', '800 ml su', '20 g kabak çekirdeği|kavrulmuş'],
    ['Soğan ve havucu zeytinyağında 4 dakika kavur.', 'Balkabağı, zencefil ve suyu ekle; kapağı kapalı 20 dakika pişir.', 'Blenderdan geçir, sütü ekleyip 2 dakika ısıt.', 'Kabak çekirdeğiyle süsleyip servis et.'],
    ['Süt yerine bitkisel süt kullanırsan vegan olur.'],
    [160, 5.5, 20.2, 6.7, 3], 340],

  ['tavuklu-sehriyeli-corba', 'Tavuklu şehriye çorbası', '🍜', 'od', 4, 10, 30, 'kolay',
    ['250 g tavuk göğsü', '40 g arpa şehriye', '1 adet havuç|küp doğranmış', '1 tk domates salçası', '1 yk zeytinyağı', '1500 ml su', '1 tutam karabiber', '1 tutam tuz'],
    ['Tavuğu suda 20 dakika haşla, çıkarıp didikle; suyunu sakla.', 'Zeytinyağında salçayı ve havucu 2 dakika kavur.', 'Şehriyeyi ekleyip 1 dakika çevir, tavuk suyunu ilave et.', 'Şehriye yumuşayana kadar 8 dakika pişir, tavukları geri ekle.'],
    ['Limonla servis etmek lezzeti açar.'],
    [150, 16, 10, 5.1, 0.8], 350],

  ['yesil-mercimek-corbasi', 'Yeşil mercimek çorbası', '🫘', 'vg gs mp', 4, 10, 40, 'kolay',
    ['1 su bardağı yeşil mercimek|yıkanmış', '1 adet soğan', '1 adet havuç', '1 yk domates salçası', '1 yk zeytinyağı', '1500 ml su', '1 tk kimyon', '1 tutam pul biber'],
    ['Soğan ve havucu zeytinyağında 4 dakika kavur, salçayı ekle.', 'Mercimeği ve suyu ekle; kapağı kapalı 35 dakika pişir.', 'Yarısını blenderdan geçirip geri ekle, kimyonu karıştır.', 'Pul biber serpip servis et.'],
    null,
    [216, 12.5, 32.75, 3.9, 6.5], 360],

  ['etli-sebze-corbasi', 'Etli sebze çorbası', '🥩', 'gs', 4, 15, 60, 'orta',
    ['250 g dana kuşbaşı|yağsız', '2 adet patates', '1 adet havuç', '1 adet kabak', '1 yk domates salçası', '1 tk zeytinyağı', '1500 ml su', '1 tutam kekik'],
    ['Eti zeytinyağında suyunu salıp çekene kadar 5 dakika kavur.', 'Salçayı ekleyip 1 dakika çevir, suyu ilave et.', 'Kapağı kapalı kısık ateşte et yumuşayana kadar 40 dakika pişir.', 'Küp doğranmış sebzeleri ekle ve 15 dakika daha pişir.', 'Kekikle servis et.'],
    ['Düdüklü tencerede eti 15 dakikada yumuşatabilirsin.'],
    [180, 15.6, 16.6, 5.7, 2.8], 380],

  ['tavuklu-meksika-corbasi', 'Tavuklu Meksika çorbası', '🌶️', 'gs yp mp', 4, 15, 30, 'orta',
    ['300 g tavuk göğsü|küp', '200 g haşlanmış kırmızı fasulye', '150 g mısır|konserve, süzülmüş', '400 g domates rendesi', '1 adet soğan', '1 adet kırmızı biber', '1 yk zeytinyağı', '1000 ml su', '1 tk kimyon', '1 tk pul biber'],
    ['Zeytinyağında soğan ve biberi 4 dakika kavur.', 'Tavukları ekle, renk değiştirene kadar 5 dakika pişir.', 'Domates, baharatlar ve suyu ekle; 15 dakika pişir.', 'Fasulye ve mısırı ekleyip 5 dakika daha kaynat.', 'Üzerine biraz yoğurt ve kişniş koyarak servis et.'],
    null,
    [250, 23.9, 25.1, 6.1, 6], 400],

  ['zencefilli-havuc-corbasi', 'Hindistan cevizli havuç çorbası', '🥕', 'vg gs', 4, 10, 25, 'kolay',
    ['600 g havuç|doğranmış', '1 adet soğan', '1 tk zencefil|rendelenmiş', '200 ml hindistan cevizi sütü|light', '1 yk zeytinyağı', '800 ml su', '1 tutam tuz'],
    ['Soğanı zeytinyağında 3 dakika kavur, zencefili ekle.', 'Havuçları ve suyu ekleyip 20 dakika pişir.', 'Blenderdan geçir, hindistan cevizi sütünü ekle ve 2 dakika ısıt.'],
    null,
    [140, 1.9, 17.25, 7.2, 4.5], 330],
]);
