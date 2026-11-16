import { build } from './_build.js';

export default build('smoothie', [
  ['muzlu-protein-shake', 'Muzlu fıstık ezmeli protein shake', '🥤', 'vj gs sz', 1, 4, 0, 'kolay',
    ['250 ml yarım yağlı süt', '1 adet muz', '30 g protein tozu|vanilyalı', '1 yk fıstık ezmesi', '4 adet buz'],
    ['Tüm malzemeleri blendera koy.', '30-40 saniye pürüzsüz olana kadar çek.', 'Hemen servis et.'],
    ['Antrenman sonrası ilk bir saat içinde içmek kas onarımına yardımcı olur.'],
    [448, 37.55, 45, 13.65, 4], 420],

  ['yesil-smoothie', 'Yeşil smoothie', '🥬', 'vg gs sz', 1, 5, 0, 'kolay',
    ['50 g taze ıspanak', '1 adet yeşil elma', '1/2 adet muz|dondurulmuş', '200 ml badem sütü|şekersiz', '1 yk chia tohumu', '1 tk limon suyu', '1 tutam zencefil'],
    ['Ispanağı ve badem sütünü önce 20 saniye çek.', 'Kalan malzemeleri ekleyip 40 saniye daha çek.', 'Chia şişsin diye 2-3 dakika bekletip iç.'],
    null,
    [258, 5.5, 46.3, 6.6, 9], 450],

  ['cilekli-kefir', 'Çilekli muzlu kefir', '🍓', 'vj gs sz', 1, 3, 0, 'kolay',
    ['250 ml kefir', '100 g çilek', '1/2 adet muz'],
    ['Tüm malzemeleri blenderda 30 saniye çek.', 'Soğuk servis et.'],
    ['Kefir bağırsak dostu bakteriler içerir.'],
    [202, 9.55, 32.45, 4.25, 3.5], 400],

  ['kahveli-protein-shake', 'Kakaolu kahveli protein shake', '☕', 'vj gs sz', 1, 4, 0, 'kolay',
    ['200 ml yarım yağlı süt', '30 ml espresso|soğutulmuş', '30 g protein tozu', '1 yk kakao', '1/2 adet muz|dondurulmuş', '4 adet buz'],
    ['Tüm malzemeleri blendera koy.', '40 saniye köpüklü olana kadar çek.', 'Bardağa döküp hemen iç.'],
    ['Sabah antrenmanı öncesi hem kahve hem protein ihtiyacını karşılar.'],
    [284, 32.2, 27.6, 5.5, 3.5], 340],

  ['yulafli-muz-smoothie', 'Yulaflı muz smoothie', '🍌', 'vj', 1, 4, 0, 'kolay',
    ['250 ml yarım yağlı süt', '30 g yulaf ezmesi', '1 adet muz', '1 tk bal', '1 tutam tarçın'],
    ['Yulafı sütte 2 dakika beklet.', 'Muz, bal ve tarçını ekleyip 40 saniye çek.', 'Kahvaltı yerine içilebilir.'],
    null,
    [358, 13.45, 63, 6.25, 6], 420],

  ['orman-meyveli-smoothie', 'Orman meyveli yoğurt smoothie', '🫐', 'vj gs', 1, 3, 0, 'kolay',
    ['150 g süzme yoğurt|az yağlı', '150 g karışık orman meyvesi|dondurulmuş', '100 ml yarım yağlı süt', '1 tk bal'],
    ['Tüm malzemeleri blendera koy.', '40 saniye pürüzsüz olana kadar çek.', 'Kıvamı çok koyuysa biraz daha süt ekle.'],
    null,
    [258, 18, 34.8, 5.75, 5], 400],

  ['vegan-kakao-shake', 'Vegan kakaolu protein shake', '🌱', 'vg gs sz', 1, 4, 0, 'kolay',
    ['250 ml soya sütü|şekersiz', '30 g bitkisel protein tozu', '1 adet muz|dondurulmuş', '1 yk kakao', '1 yk fıstık ezmesi'],
    ['Tüm malzemeleri blendera koy.', '40 saniye çek ve hemen servis et.'],
    ['Bezelye ya da pirinç proteini kullanabilirsin.'],
    [418, 36.55, 34.5, 15.7, 6], 430],

  ['mango-havuc-smoothie', 'Mangolu havuçlu smoothie', '🥭', 'vj gs sz', 1, 5, 0, 'kolay',
    ['150 g mango|dondurulmuş', '1 adet havuç|rendelenmiş', '150 ml portakal suyu|taze sıkılmış', '100 g yoğurt', '1 tutam zencefil'],
    ['Havucu ve portakal suyunu önce 20 saniye çek.', 'Mango, yoğurt ve zencefili ekleyip 40 saniye daha çek.'],
    null,
    [248, 6.3, 48.6, 3.9, 4], 420],

  ['avokadolu-protein-shake', 'Avokadolu yeşil protein shake', '🥑', 'vj gs sz', 1, 5, 0, 'kolay',
    ['1/2 adet avokado', '50 g taze ıspanak', '30 g protein tozu', '250 ml badem sütü|şekersiz', '1/2 adet yeşil elma', '1 tk limon suyu'],
    ['Tüm malzemeleri blendera koy.', '45 saniye pürüzsüz olana kadar çek.'],
    ['Avokado sağlıklı yağlarla shake’i kremamsı ve tok tutucu yapar.'],
    [338, 28.3, 24.55, 15.1, 8.5], 430],

  ['lorlu-gece-shake', 'Lorlu vanilyalı gece shake’i', '🌙', 'vj gs', 1, 3, 0, 'kolay',
    ['150 g lor peyniri', '200 ml yarım yağlı süt', '1 tk bal', '10 g badem', '1 tutam vanilya'],
    ['Tüm malzemeleri blenderda 40 saniye çek.', 'Yatmadan önce iç.'],
    ['Lor peynirindeki yavaş sindirilen protein gece boyunca kaslarını besler.'],
    [307, 26.6, 22.1, 12.5, 1], 370],

  ['salatalikli-ayran', 'Salatalıklı naneli ayran', '🥛', 'vj gs sz', 2, 5, 0, 'kolay',
    ['300 g yoğurt', '300 ml soğuk su', '1 adet salatalık', '5 adet nane yaprağı', '1 tutam tuz'],
    ['Tüm malzemeleri blendera koy.', '30 saniye köpürene kadar çek.', 'Buzla servis et.'],
    ['Sıcak günlerde ve terli antrenmanlardan sonra tuz kaybını dengelemeye yardım eder.'],
    [98, 5.65, 8.75, 4.5, 0.5], 320],
]);
