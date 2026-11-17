// Egzersiz kütüphanesi: Türkçe adım adım anlatım, nefes, ipuçları, sık yapılan hatalar.
// Her egzersizin animasyonu poses.js içindeki A[id] ile eşleşir.
import { A } from './poses.js';

export const GROUPS = [
  { id: 'chest', label: 'Göğüs' }, { id: 'back', label: 'Sırt' }, { id: 'legs', label: 'Bacak' }, { id: 'glutes', label: 'Kalça' },
  { id: 'shoulders', label: 'Omuz' }, { id: 'arms', label: 'Kol' }, { id: 'core', label: 'Karın' }, { id: 'cardio', label: 'Kardiyo' },
  { id: 'mobility', label: 'Esneme' },
];
export const EQUIP = [
  { id: 'bw', label: 'Vücut ağırlığı' }, { id: 'db', label: 'Dambıl' }, { id: 'bb', label: 'Halter' }, { id: 'machine', label: 'Makine' },
  { id: 'cable', label: 'Kablo' }, { id: 'kb', label: 'Kettlebell' }, { id: 'band', label: 'Direnç bandı' }, { id: 'bar', label: 'Barfiks barı' },
  { id: 'bench', label: 'Sehpa' }, { id: 'box', label: 'Basamak / kutu' },
];
export const MUSCLES = {
  chest: 'Göğüs', shoulders: 'Omuz', biceps: 'Ön kol (biceps)', triceps: 'Arka kol (triceps)', forearms: 'Ön kol kasları', abs: 'Karın',
  obliques: 'Yan karın', lats: 'Sırt (kanat)', upperBack: 'Üst sırt', traps: 'Trapez', lowerBack: 'Bel', glutes: 'Kalça', quads: 'Ön bacak',
  hamstrings: 'Arka bacak', calves: 'Baldır', adductors: 'İç bacak', hipflex: 'Kalça önü',
};
export const LEVELS = ['', 'Kolay', 'Orta', 'Zor'];
export const LOCS = { home: 'Ev', gym: 'Salon', both: 'Ev ve salon' };

// X(id, ad, grup, [ana kaslar], [yardımcı kaslar], [ekipman], yer, zorluk, MET, { type, sets, reps, sec, rest, bwf }, metinler)
function X(id, name, group, p, s, eq, loc, lvl, met, def, txt) {
  return { id, name, group, muscles: { p, s }, eq, loc, lvl, met, type: def.type || 'reps', def: { sets: 3, reps: 10, sec: 30, rest: 60, ...def }, bwf: def.bwf || 0, ...txt, anim: A[id] };
}
const R = (reps, rest = 60, sets = 3, extra = {}) => ({ reps, rest, sets, ...extra });
const T = (sec, rest = 30, sets = 3, extra = {}) => ({ type: 'time', sec, rest, sets, ...extra });

export const EXERCISES = [
  // ======================= GÖĞÜS =======================
  X('pushup', 'Şınav', 'chest', ['chest', 'triceps'], ['shoulders', 'abs'], ['bw'], 'both', 2, 8, R(12, 60, 3, { bwf: 0.64 }), {
    steps: ['Ellerini omuz genişliğinden biraz açık yere koy.', 'Ayaklarını geriye uzat; baştan topuğa vücudun düz bir çizgi olsun.', 'Dirseklerini hafif geriye doğru bükerek göğsünü yere yaklaştır.', 'Avuçlarınla yeri iterek başlangıca dön.'],
    breath: 'İnerken nefes al, iterken nefes ver.',
    tips: ['Karnını ve kalçanı sıkı tut, bel çökmesin.', 'Zorlanırsan dizüstü şınavla başla.'],
    mistakes: ['Kalçanın aşağı sarkması ya da havaya kalkması', 'Dirsekleri yanlara tamamen açmak', 'Yarım hareket yapıp göğsü yeterince indirmemek'] }),
  X('knee-pushup', 'Dizüstü şınav', 'chest', ['chest', 'triceps'], ['shoulders'], ['bw'], 'home', 1, 5, R(12, 45, 3, { bwf: 0.5 }), {
    steps: ['Dizlerini yere koy, ayaklarını hafifçe kaldır.', 'Ellerini omuz genişliğinden biraz açık yerleştir.', 'Dizden başa düz bir çizgi koruyarak göğsünü yere yaklaştır.', 'Yeri iterek yukarı çık.'],
    breath: 'İnerken nefes al, iterken nefes ver.',
    tips: ['Dizlerinin altına havlu ya da mat koy.', 'Rahatladığında normal şınava geç.'],
    mistakes: ['Kalçayı geride bırakıp sadece başı indirmek', 'Dirsekleri tamamen yana açmak'] }),
  X('incline-pushup', 'Eğimli şınav (eller yüksekte)', 'chest', ['chest', 'triceps'], ['shoulders', 'abs'], ['bw', 'bench'], 'both', 1, 5, R(12, 45, 3, { bwf: 0.45 }), {
    steps: ['Ellerini sehpa, koltuk ya da basamak kenarına koy.', 'Ayaklarını geriye at, vücudunu düz tut.', 'Göğsünü kenara doğru indir.', 'Kolları uzatarak geri it.'],
    breath: 'İnerken nefes al, iterken nefes ver.',
    tips: ['Yüzey ne kadar yüksekse hareket o kadar kolaylaşır.', 'Sehpanın kaymadığından emin ol.'],
    mistakes: ['Kalçayı bükmek', 'Başı öne uzatıp boynu zorlamak'] }),
  X('decline-pushup', 'Ayaklar yüksekte şınav', 'chest', ['chest', 'shoulders'], ['triceps', 'abs'], ['bw', 'bench'], 'both', 3, 8, R(10, 75, 3, { bwf: 0.7 }), {
    steps: ['Ayaklarını sehpa ya da basamağın üstüne koy.', 'Ellerini omuz altına, biraz geniş yerleştir.', 'Vücudunu düz tutarak göğsünü yere indir.', 'Güçlü şekilde iterek yukarı çık.'],
    breath: 'İnerken nefes al, iterken nefes ver.',
    tips: ['Üst göğüs ve omuz daha fazla çalışır.', 'Önce normal şınavda 15 tekrara ulaş.'],
    mistakes: ['Belin çökmesi', 'Başı yere değdirmeye çalışmak'] }),
  X('diamond-pushup', 'Elmas şınav', 'arms', ['triceps', 'chest'], ['shoulders', 'abs'], ['bw'], 'both', 3, 8, R(10, 60, 3, { bwf: 0.64 }), {
    steps: ['Baş ve işaret parmaklarınla göğüs altında bir elmas şekli yap.', 'Ayaklarını geriye uzat, vücudunu düz tut.', 'Dirsekleri gövdene yakın tutarak in.', 'Arka kolunla iterek yukarı çık.'],
    breath: 'İnerken nefes al, iterken nefes ver.',
    tips: ['Dirsekler geriye, gövdeye paralel gitsin.', 'Bilek rahatsız ederse elleri biraz aç.'],
    mistakes: ['Dirsekleri yanlara açmak', 'Kalçanın düşmesi'] }),
  X('bb-bench', 'Halter bench press', 'chest', ['chest', 'triceps'], ['shoulders'], ['bb', 'bench'], 'gym', 2, 6, R(8, 120, 4), {
    steps: ['Sehpaya sırt üstü yat, gözlerin barın altında olsun.', 'Barı omuz genişliğinden biraz açık kavra, kürek kemiklerini geriye sık.', 'Barı kontrollü şekilde göğsünün alt kısmına indir.', 'Ayaklarını yere basarak barı yukarı it, dirsekleri kilitlemeden bitir.'],
    breath: 'İndirirken nefes al, iterken nefes ver.',
    tips: ['Ağır setlerde mutlaka yardımcı (spotter) kullan.', 'Dirsekler gövdeyle yaklaşık 45 derece açı yapsın.'],
    mistakes: ['Barı göğüsten sektirmek', 'Kalçayı sehpadan kaldırmak', 'Bilekleri geriye bükmek'] }),
  X('db-bench', 'Dambıl bench press', 'chest', ['chest', 'triceps'], ['shoulders'], ['db', 'bench'], 'both', 2, 6, R(10, 90, 3), {
    steps: ['Dambılları dizlerinin üstünde tutarak sehpaya otur ve geriye yat.', 'Dambılları göğüs hizasında, avuçlar ileri bakacak şekilde tut.', 'Kolları yukarı iterek dambılları göğsün üstünde buluştur.', 'Kontrollü şekilde göğüs hizasına indir.'],
    breath: 'İterken nefes ver, indirirken nefes al.',
    tips: ['Halterden daha geniş hareket açısı sağlar.', 'Set bitince dambılları dizlerine alarak kalk.'],
    mistakes: ['Dambılları çarpıştırmak', 'Çok hızlı indirmek'] }),
  X('incline-db-press', 'Eğimli dambıl press', 'chest', ['chest', 'shoulders'], ['triceps'], ['db', 'bench'], 'both', 2, 6, R(10, 90, 3), {
    steps: ['Sehpayı 30–45 derece eğime ayarla ve sırtını daya.', 'Dambılları omuz hizasında tut.', 'Yukarı ve hafif içe doğru it.', 'Yavaşça omuz hizasına indir.'],
    breath: 'İterken nefes ver, indirirken nefes al.',
    tips: ['Üst göğsü hedefler.', 'Eğim 45 dereceden fazla olursa omuz devreye girer.'],
    mistakes: ['Belini sehpadan fazla kaldırmak', 'Dambılları göğüsten çok uzağa indirmek'] }),
  X('machine-chest-press', 'Makinede göğüs press', 'chest', ['chest', 'triceps'], ['shoulders'], ['machine'], 'gym', 1, 5, R(12, 75, 3), {
    steps: ['Koltuğu, tutamaklar göğüs ortası hizasında olacak şekilde ayarla.', 'Sırtını desteğe daya, tutamakları kavra.', 'Kolları öne doğru uzatarak it.', 'Ağırlık yığına değmeden yavaşça geri gel.'],
    breath: 'İterken nefes ver, geri gelirken nefes al.',
    tips: ['Yeni başlayanlar için güvenli bir seçenektir.', 'Omuzlarını aşağıda ve geride tut.'],
    mistakes: ['Sırtı destekten ayırmak', 'Dirsekleri sonda kilitlemek'] }),
  X('cable-crossover', 'Kablo crossover', 'chest', ['chest'], ['shoulders', 'biceps'], ['cable'], 'gym', 2, 5, R(12, 60, 3), {
    steps: ['Makaraları omuz üstüne ayarla, iki tutamağı da kavra.', 'Bir adım öne çık, gövdeni hafif öne eğ.', 'Dirsekleri hafif bükük tutarak elleri önünde aşağıda birleştir.', 'Göğsünde gerilmeyi hissederek kontrollü şekilde aç.'],
    breath: 'Elleri birleştirirken nefes ver, açarken nefes al.',
    tips: ['Ağırlığı değil, göğüs sıkışmasını hedefle.', 'Hareket boyunca dirsek açısı değişmesin.'],
    mistakes: ['Kollarla itme hareketi yapmak', 'Fazla ağırlıkla gövdeyi sallamak'] }),
  X('chest-dip', 'Paralel bar dips', 'chest', ['chest', 'triceps'], ['shoulders'], ['bar'], 'gym', 3, 8, R(8, 90, 3, { bwf: 0.95 }), {
    steps: ['Paralel barları kavra ve kollarını düz tutarak kendini kaldır.', 'Gövdeni hafif öne eğ, dizlerini bük.', 'Dirsekler yaklaşık 90 derece olana kadar alçal.', 'Avuçlarınla iterek yukarı çık.'],
    breath: 'İnerken nefes al, çıkarken nefes ver.',
    tips: ['Öne eğilmek göğsü, dik durmak arka kolu çalıştırır.', 'Omuz ağrısı olursa hareketin derinliğini azalt.'],
    mistakes: ['Çok derine inip omzu zorlamak', 'Omuzları kulaklara doğru kaldırmak'] }),
  X('db-pullover', 'Dambıl pullover', 'chest', ['chest', 'lats'], ['triceps', 'abs'], ['db', 'bench'], 'both', 2, 5, R(12, 60, 3), {
    steps: ['Sehpaya sırt üstü yat, tek dambılı iki elinle göğüs üstünde tut.', 'Dirsekler hafif bükük kalsın.', 'Dambılı başının arkasına doğru yay çizerek indir.', 'Aynı yoldan göğüs üstüne geri getir.'],
    breath: 'İndirirken nefes al, kaldırırken nefes ver.',
    tips: ['Göğüs ve sırt kaslarını birlikte esnetir.', 'Hafif ağırlıkla başla.'],
    mistakes: ['Belini fazla çukurlaştırmak', 'Dirsekleri büküp triceps hareketine çevirmek'] }),

  // ======================= SIRT =======================
  X('pullup', 'Barfiks', 'back', ['lats', 'biceps'], ['upperBack', 'forearms', 'abs'], ['bar'], 'both', 3, 8, R(6, 120, 4, { bwf: 1 }), {
    steps: ['Barı omuz genişliğinden biraz geniş, avuçlar öne bakacak şekilde kavra.', 'Kollar düz şekilde asıl, omuzlarını hafif aşağı çek.', 'Dirseklerini aşağı ve geriye çekerek çeneni barın üstüne çıkar.', 'Kontrollü şekilde kollar düzleşene kadar in.'],
    breath: 'Çekerken nefes ver, inerken nefes al.',
    tips: ['Yapamıyorsan bant destekli ya da sadece iniş (negatif) çalış.', 'Bacakları sallamadan hareket et.'],
    mistakes: ['Vücudu sallayarak güç almak', 'Yarım tekrar yapmak', 'Omuzları kulaklara doğru kaldırmak'] }),
  X('chinup', 'Ters tutuş barfiks (chin-up)', 'back', ['lats', 'biceps'], ['upperBack', 'forearms'], ['bar'], 'both', 3, 8, R(6, 120, 3, { bwf: 1 }), {
    steps: ['Barı omuz genişliğinde, avuçlar sana bakacak şekilde kavra.', 'Kollar düz asıl, karnını sık.', 'Göğsünü bara doğru çekerek çeneni barın üstüne çıkar.', 'Yavaşça aşağı in.'],
    breath: 'Çekerken nefes ver, inerken nefes al.',
    tips: ['Biceps daha çok çalıştığı için barfiksten biraz daha kolaydır.', 'Her tekrarda kolları tamamen uzat.'],
    mistakes: ['Bacaklarla tekme atarak çıkmak', 'Boynu uzatarak çeneyi bara yetiştirmek'] }),
  X('inverted-row', 'Ters kürek (masa altı çekiş)', 'back', ['lats', 'upperBack'], ['biceps', 'abs'], ['bw', 'bar'], 'home', 1, 5, R(10, 60, 3, { bwf: 0.6 }), {
    steps: ['Bel hizasındaki sağlam bir barın ya da masanın altına uzan.', 'Barı kavra, topuklar yerde, vücudun düz olsun.', 'Göğsünü bara doğru çek, kürek kemiklerini sık.', 'Kollar düzleşene kadar kontrollü in.'],
    breath: 'Çekerken nefes ver, inerken nefes al.',
    tips: ['Ayaklarını yaklaştırırsan hareket kolaylaşır.', 'Barfikse hazırlık için harika bir egzersizdir.'],
    mistakes: ['Kalçanın sarkması', 'Sağlam olmayan bir masa kullanmak'] }),
  X('bb-row', 'Halterle eğilerek kürek', 'back', ['lats', 'upperBack'], ['biceps', 'lowerBack', 'hamstrings'], ['bb'], 'gym', 2, 6, R(8, 90, 4), {
    steps: ['Barı omuz genişliğinde kavra, dizleri hafif bük.', 'Kalçadan öne eğil; sırtın düz, gövden yere yaklaşık 45 derece olsun.', 'Barı göbek altına doğru çek, dirsekler geriye gitsin.', 'Kollar uzayana kadar kontrollü indir.'],
    breath: 'Çekerken nefes ver, indirirken nefes al.',
    tips: ['Sırtını yuvarlamamak için göğsünü açık tut.', 'Hareket boyunca gövde açını sabit tut.'],
    mistakes: ['Sırtı kamburlaştırmak', 'Gövdeyi kaldırarak barı çekmek'] }),
  X('db-row', 'Tek kol dambıl kürek', 'back', ['lats', 'upperBack'], ['biceps', 'shoulders'], ['db', 'bench'], 'both', 1, 5, R(10, 60, 3), {
    steps: ['Bir dizini ve aynı taraftaki elini sehpaya koy.', 'Diğer elinle dambılı kol düz şekilde tut.', 'Dambılı kalçana doğru çek, dirseğin gövdene yakın kalsın.', 'Yavaşça indir; setin sonunda diğer kola geç.'],
    breath: 'Çekerken nefes ver, indirirken nefes al.',
    tips: ['Sırtın sehpaya paralel kalsın.', 'Evde sandalye de kullanabilirsin.'],
    mistakes: ['Gövdeyi döndürerek çekmek', 'Omzu kulağa doğru kaldırmak'] }),
  X('lat-pulldown', 'Lat pulldown (önden çekiş)', 'back', ['lats'], ['biceps', 'upperBack'], ['machine', 'cable'], 'gym', 1, 5, R(10, 75, 3), {
    steps: ['Dizlerini pedin altına yerleştir ve otur.', 'Barı omuz genişliğinden geniş kavra.', 'Göğsünü hafif dikleştirip barı üst göğsüne çek.', 'Kollar uzayana kadar kontrollü bırak.'],
    breath: 'Çekerken nefes ver, bırakırken nefes al.',
    tips: ['Dirseklerini aşağı ve arkaya doğru düşün.', 'Barfiks yapamıyorsan bu hareketle güç kazan.'],
    mistakes: ['Barı ensenin arkasına çekmek', 'Gövdeyi fazla geriye yatırmak'] }),
  X('seated-cable-row', 'Oturarak kablo kürek', 'back', ['lats', 'upperBack'], ['biceps', 'lowerBack'], ['cable', 'machine'], 'gym', 1, 5, R(12, 75, 3), {
    steps: ['Ayaklarını platforma koy, dizlerin hafif bükük olsun.', 'Tutamağı kavra, sırtın dik.', 'Tutamağı karnına doğru çek, kürek kemiklerini sık.', 'Kolları uzatarak kontrollü geri bırak.'],
    breath: 'Çekerken nefes ver, bırakırken nefes al.',
    tips: ['Göğsün dik, omuzlar aşağıda olsun.', 'Hareketi sırtınla başlat.'],
    mistakes: ['Gövdeyi ileri geri sallamak', 'Sırtı yuvarlamak'] }),
  X('deadlift', 'Deadlift', 'back', ['glutes', 'hamstrings', 'lowerBack'], ['quads', 'upperBack', 'forearms'], ['bb'], 'gym', 3, 6, R(5, 150, 4), {
    steps: ['Ayakların kalça genişliğinde, bar ayak ortasının üstünde olsun.', 'Kalçadan eğil, barı omuz genişliğinde kavra; sırtın düz.', 'Göğsünü kaldır, karnını sık ve topuklarınla yeri iterek barı kaldır.', 'Dik durunca kalçanı sık; aynı yoldan kontrollü indir.'],
    breath: 'Kaldırmadan önce derin nefes al ve tut, yukarıda nefes ver.',
    tips: ['Bar bacaklarına yakın hareket etsin.', 'Tekniği hafif ağırlıkla öğren.'],
    mistakes: ['Sırtı yuvarlamak', 'Barı vücuttan uzakta tutmak', 'Tepede beli geriye bükmek'] }),
  X('superman', 'Süperman', 'back', ['lowerBack', 'glutes'], ['upperBack', 'hamstrings'], ['bw'], 'home', 1, 3.5, R(12, 45, 3), {
    steps: ['Yüzüstü uzan, kollarını başının önüne uzat.', 'Kollarını, göğsünü ve bacaklarını aynı anda yerden kaldır.', '1–2 saniye bekle.', 'Yavaşça yere indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Bakışın yere olsun, boynunu zorlama.', 'Yüksekliği değil, kontrolü hedefle.'],
    mistakes: ['Başı geriye atmak', 'Hızlı ve sarsıntılı yapmak'] }),
  X('band-row', 'Bantla oturarak kürek', 'back', ['lats', 'upperBack'], ['biceps'], ['band'], 'home', 1, 4, R(15, 45, 3), {
    steps: ['Yere otur, bacaklarını uzat ve bandı ayak tabanlarından geçir.', 'Bandın uçlarını kavra, sırtını dik tut.', 'Elleri karnına doğru çek, kürek kemiklerini sık.', 'Kontrollü şekilde geri bırak.'],
    breath: 'Çekerken nefes ver, bırakırken nefes al.',
    tips: ['Bandı kısa tutarsan direnç artar.', 'Omuzlarını kulaklardan uzak tut.'],
    mistakes: ['Geriye doğru yatmak', 'Bandı hızla bırakmak'] }),
  X('face-pull', 'Face pull (yüze çekiş)', 'shoulders', ['shoulders', 'upperBack'], ['traps', 'biceps'], ['cable', 'band'], 'both', 1, 4, R(15, 45, 3), {
    steps: ['Makarayı yüz hizasına ayarla ve ip tutamağı kavra.', 'Bir adım geri çekil, kollar önde uzun olsun.', 'İpi yüzüne doğru çek, dirsekleri yukarıda ve dışarıda tut.', 'Kontrollü şekilde kolları uzat.'],
    breath: 'Çekerken nefes ver, bırakırken nefes al.',
    tips: ['Omuz sağlığı ve duruş için çok faydalıdır.', 'Evde kapıya bağlanan bantla da yapılır.'],
    mistakes: ['Ağır ağırlıkla gövdeyi geriye atmak', 'Dirsekleri aşağıda bırakmak'] }),
  X('back-extension', 'Bel ekstansiyonu (hiperekstansiyon)', 'back', ['lowerBack', 'glutes'], ['hamstrings'], ['machine'], 'gym', 1, 4, R(12, 60, 3), {
    steps: ['Kalçan pedin hemen üstünde olacak şekilde yerleş, ayaklarını sabitle.', 'Kollarını göğsünde çaprazla.', 'Kalçadan aşağı doğru eğil.', 'Bacaklarınla düz bir çizgi oluşana kadar yukarı kalk.'],
    breath: 'Kalkarken nefes ver, inerken nefes al.',
    tips: ['Kalçanı sıkarak kalk.', 'Ek yük için göğsünde plaka tutabilirsin.'],
    mistakes: ['Tepede beli fazla geriye bükmek', 'Hızla sallanmak'] }),
  X('db-shrug', 'Dambıl shrug (omuz silkme)', 'back', ['traps'], ['upperBack', 'forearms'], ['db'], 'both', 1, 3.5, R(15, 45, 3), {
    steps: ['Dambılları yanlarda, kollar düz tut.', 'Omuzlarını kulaklarına doğru dik olarak kaldır.', 'Tepede 1 saniye bekle.', 'Yavaşça indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Omuzları döndürmene gerek yok, yukarı-aşağı yeterli.', 'Boynunu rahat bırak.'],
    mistakes: ['Kollarla çekmek', 'Başı öne uzatmak'] }),

  // ======================= BACAK =======================
  X('squat', 'Squat (çömelme)', 'legs', ['quads', 'glutes'], ['hamstrings', 'abs'], ['bw'], 'both', 1, 5, R(15, 60, 3, { bwf: 0.7 }), {
    steps: ['Ayaklarını omuz genişliğinde aç, parmak uçları hafif dışa baksın.', 'Kollarını öne uzat, göğsünü dik tut.', 'Kalçanı geriye iterek sandalyeye oturur gibi çömel.', 'Uyluklar yere paralel olunca topuklarınla iterek kalk.'],
    breath: 'Çömelirken nefes al, kalkarken nefes ver.',
    tips: ['Dizlerin ayak parmaklarıyla aynı yöne baksın.', 'Topukların yerden kalkmasın.'],
    mistakes: ['Dizlerin içe kapanması', 'Topukların kalkması', 'Sırtın yuvarlanması'] }),
  X('bb-back-squat', 'Halter squat', 'legs', ['quads', 'glutes'], ['hamstrings', 'lowerBack', 'abs'], ['bb'], 'gym', 3, 6, R(6, 150, 4), {
    steps: ['Barı üst sırtına (trapez üstüne) yerleştir, ellerinle sabitle.', 'Ayaklarını omuz genişliğinde aç.', 'Karnını sıkıp kalçayı geriye iterek çömel.', 'Uyluklar paralel olunca topuklardan iterek kalk.'],
    breath: 'İnmeden önce nefes al ve tut, kalkışın sonunda ver.',
    tips: ['Güvenlik barları olan bir kafeste çalış.', 'Bakışın düz ileride olsun.'],
    mistakes: ['Dizlerin içe çökmesi', 'Belin yuvarlanması', 'Ağırlığı parmak uçlarına vermek'] }),
  X('goblet-squat', 'Goblet squat', 'legs', ['quads', 'glutes'], ['abs', 'upperBack'], ['db', 'kb'], 'both', 1, 5, R(12, 60, 3), {
    steps: ['Dambılı ya da kettlebell\'i göğsünün önünde iki elinle tut.', 'Ayaklarını omuz genişliğinde aç.', 'Dirseklerin dizlerin arasına girecek kadar çömel.', 'Topuklarınla iterek kalk.'],
    breath: 'Çömelirken nefes al, kalkarken nefes ver.',
    tips: ['Ağırlık önde olduğu için dik durmak kolaylaşır.', 'Squat tekniğini öğrenmek için idealdir.'],
    mistakes: ['Ağırlığı göğüsten uzaklaştırmak', 'Sırtı yuvarlamak'] }),
  X('bulgarian-split-squat', 'Bulgar split squat', 'legs', ['quads', 'glutes'], ['hamstrings', 'adductors'], ['db', 'bench', 'bw'], 'both', 3, 6, R(10, 75, 3, { bwf: 0.6 }), {
    steps: ['Sehpaya sırtını dön, bir ayağının üstünü sehpaya koy.', 'Öndeki ayağını yaklaşık bir adım öne yerleştir.', 'Arka dizini yere doğru indirerek alçal.', 'Öndeki topuktan iterek kalk; setin sonunda bacak değiştir.'],
    breath: 'İnerken nefes al, kalkarken nefes ver.',
    tips: ['Dengen için önce ağırlıksız dene.', 'Öndeki diz ayak bileğinin üstünde kalsın.'],
    mistakes: ['Öndeki ayağı sehpaya çok yakın koymak', 'Gövdeyi yana eğmek'] }),
  X('lunge', 'Öne hamle (lunge)', 'legs', ['quads', 'glutes'], ['hamstrings', 'calves'], ['bw', 'db'], 'both', 1, 5, R(10, 60, 3, { bwf: 0.6 }), {
    steps: ['Dik dur, ayaklar kalça genişliğinde.', 'Bir bacakla büyük bir adım öne at.', 'İki diz de yaklaşık 90 derece olana kadar alçal.', 'Öndeki topuktan iterek başlangıca dön, bacak değiştir.'],
    breath: 'İnerken nefes al, dönerken nefes ver.',
    tips: ['Gövden dik kalsın.', 'Zorlaştırmak için ellerinde dambıl tut.'],
    mistakes: ['Öndeki dizin parmakları çok geçmesi', 'Arka dizi yere çarpmak'] }),
  X('reverse-lunge', 'Geriye hamle', 'legs', ['quads', 'glutes'], ['hamstrings'], ['bw', 'db'], 'both', 1, 5, R(10, 60, 3, { bwf: 0.6 }), {
    steps: ['Dik dur, ellerini beline koy.', 'Bir bacakla geriye büyük bir adım at.', 'Arka dizini yere yaklaştırarak alçal.', 'Öndeki topuktan iterek başlangıca dön.'],
    breath: 'İnerken nefes al, dönerken nefes ver.',
    tips: ['Diz için öne hamleden daha rahattır.', 'Ağırlığın öndeki bacakta olsun.'],
    mistakes: ['Gövdeyi öne düşürmek', 'Adımı çok kısa atmak'] }),
  X('side-lunge', 'Yana hamle', 'legs', ['quads', 'adductors', 'glutes'], ['hamstrings'], ['bw'], 'home', 2, 5, R(10, 60, 3, { bwf: 0.6 }), {
    steps: ['Ayaklarını geniş aç, parmaklar öne baksın.', 'Ağırlığını bir bacağa verip kalçanı geriye iterek o tarafa otur.', 'Diğer bacağın düz kalsın.', 'Topuktan iterek ortaya dön, diğer tarafa geç.'],
    breath: 'İnerken nefes al, dönerken nefes ver.',
    tips: ['İç bacak kaslarını da esnetir.', 'Topuklar yerden kalkmasın.'],
    mistakes: ['Dizin içe dönmesi', 'Sırtı yuvarlamak'] }),
  X('leg-press', 'Leg press', 'legs', ['quads', 'glutes'], ['hamstrings', 'calves'], ['machine'], 'gym', 1, 5, R(12, 90, 4), {
    steps: ['Koltuğa yaslan, ayaklarını platforma omuz genişliğinde koy.', 'Güvenlik kilidini aç.', 'Dizler yaklaşık 90 derece olana kadar platformu kontrollü indir.', 'Topuklarla iterek kaldır, dizleri kilitleme.'],
    breath: 'İndirirken nefes al, iterken nefes ver.',
    tips: ['Belin ve kalçan koltuktan kalkmasın.', 'Ayakları yukarı koymak kalçayı daha çok çalıştırır.'],
    mistakes: ['Dizleri sonda kilitlemek', 'Çok derine inip kalçayı koltuktan kaldırmak'] }),
  X('leg-extension', 'Bacak açma (leg extension)', 'legs', ['quads'], [], ['machine'], 'gym', 1, 4, R(12, 60, 3), {
    steps: ['Dizlerin koltuk kenarıyla hizalı olacak şekilde otur.', 'Pedin ayak bileğinin önünde olduğundan emin ol.', 'Bacaklarını düzleşene kadar uzat.', 'Yavaşça indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Tepede 1 saniye beklemek etkiyi artırır.', 'Orta ağırlıkla çalış.'],
    mistakes: ['Ağırlığı sallayarak kaldırmak', 'Kalçayı koltuktan kaldırmak'] }),
  X('leg-curl', 'Yatarak bacak bükme (leg curl)', 'legs', ['hamstrings'], ['calves'], ['machine'], 'gym', 1, 4, R(12, 60, 3), {
    steps: ['Makineye yüzüstü uzan; ped, ayak bileklerinin arkasında olsun.', 'Tutamakları kavra, kalçanı pede bastır.', 'Topuklarını kalçana doğru çek.', 'Yavaşça uzat.'],
    breath: 'Bükerken nefes ver, uzatırken nefes al.',
    tips: ['Kalçanın kalkmaması için karnını sık.', 'İnişi yavaş yap.'],
    mistakes: ['Kalçayı havaya kaldırmak', 'Hızlı sallamak'] }),
  X('rdl', 'Romanian deadlift', 'legs', ['hamstrings', 'glutes'], ['lowerBack', 'forearms'], ['bb', 'db'], 'both', 2, 6, R(10, 90, 3), {
    steps: ['Barı ya da dambılları kalça önünde tut, dizler hafif bükük.', 'Kalçanı geriye iterek öne eğil, sırtın düz kalsın.', 'Ağırlık diz altına inince arka bacakta gerilme hissedeceksin.', 'Kalçanı öne iterek dikleş.'],
    breath: 'Eğilirken nefes al, dikleşirken nefes ver.',
    tips: ['Ağırlık bacaklarına yakın kayarak insin.', 'Hareket kalçadan olur, dizden değil.'],
    mistakes: ['Sırtı yuvarlamak', 'Dizleri çok bükerek squat yapmak'] }),
  X('calf-raise', 'Ayakta baldır kaldırma', 'legs', ['calves'], [], ['bw', 'db'], 'both', 1, 3.5, R(20, 45, 3, { bwf: 1 }), {
    steps: ['Dik dur, gerekirse bir duvara tutun.', 'Parmak uçlarına doğru yüksel.', 'Tepede 1 saniye bekle.', 'Topuklarını yavaşça indir.'],
    breath: 'Yükselirken nefes ver, inerken nefes al.',
    tips: ['Basamak kenarında yaparsan hareket açısı artar.', 'Tek bacakla zorlaştırabilirsin.'],
    mistakes: ['Zıplar gibi hızlı yapmak', 'Dizleri bükmek'] }),
  X('step-up', 'Basamağa çıkış', 'legs', ['quads', 'glutes'], ['hamstrings', 'calves'], ['box', 'bench', 'db'], 'both', 1, 6, R(10, 60, 3, { bwf: 0.6 }), {
    steps: ['Sağlam bir basamağın ya da sehpanın önünde dur.', 'Bir ayağını tamamen basamağa koy.', 'O ayağın topuğundan iterek basamağa çık.', 'Kontrollü şekilde in; bacak değiştir.'],
    breath: 'Çıkarken nefes ver, inerken nefes al.',
    tips: ['Arkadaki ayakla itme yapmamaya çalış.', 'Basamak dizi 90 dereceden fazla bükmesin.'],
    mistakes: ['Kaygan ya da sallanan basamak kullanmak', 'Gövdeyi çok öne eğmek'] }),
  X('wall-sit', 'Duvarda oturma', 'legs', ['quads'], ['glutes', 'calves'], ['bw'], 'home', 1, 4, T(40, 45), {
    steps: ['Sırtını duvara daya, ayaklarını bir adım öne al.', 'Uyluklar yere paralel olana kadar kay.', 'Dizlerin ayak bileklerinin üstünde olsun.', 'Süre bitene kadar bu pozisyonu koru.'],
    breath: 'Düzenli ve sakin nefes al ver; nefesini tutma.',
    tips: ['Zorsa biraz daha yukarıda dur.', 'Kollarını göğsünde çaprazla.'],
    mistakes: ['Ellerle dizlere yaslanmak', 'Dizlerin parmakları geçmesi'] }),
  X('sumo-squat', 'Sumo squat', 'legs', ['adductors', 'glutes', 'quads'], ['hamstrings'], ['kb', 'db', 'bw'], 'both', 1, 5, R(12, 60, 3), {
    steps: ['Ayaklarını geniş aç, parmaklar dışa baksın.', 'Ağırlığı iki elinle bacak aranda tut.', 'Dizler dışa açılarak dik gövdeyle çömel.', 'Topuklarla iterek kalk.'],
    breath: 'Çömelirken nefes al, kalkarken nefes ver.',
    tips: ['İç bacak ve kalçayı daha çok çalıştırır.', 'Gövde dik kalsın.'],
    mistakes: ['Dizlerin içe kapanması', 'Öne eğilmek'] }),

  // ======================= KALÇA =======================
  X('glute-bridge', 'Kalça köprüsü', 'glutes', ['glutes'], ['hamstrings', 'lowerBack'], ['bw'], 'home', 1, 3.5, R(15, 45, 3), {
    steps: ['Sırt üstü uzan, dizlerini bük, ayaklar yerde.', 'Kollarını yanlara koy.', 'Topuklarınla yeri iterek kalçanı kaldır.', 'Tepede kalçanı sık, yavaşça indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Dizden omuza düz bir çizgi hedefle.', 'Tepede 2 saniye beklemek etkiyi artırır.'],
    mistakes: ['Beli fazla çukurlaştırmak', 'Ayakları kalçadan çok uzağa koymak'] }),
  X('single-leg-bridge', 'Tek bacak kalça köprüsü', 'glutes', ['glutes', 'hamstrings'], ['abs'], ['bw'], 'home', 2, 4, R(10, 45, 3), {
    steps: ['Sırt üstü uzan, bir dizini bük ve ayağını yere koy.', 'Diğer bacağını havaya uzat.', 'Yerdeki topuğunla iterek kalçanı kaldır.', 'Kontrollü indir; setin sonunda bacak değiştir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Kalçanın bir yana düşmemesine dikkat et.', 'Önce iki bacakla rahat yapmayı öğren.'],
    mistakes: ['Kalçayı döndürmek', 'Bel ile itmek'] }),
  X('hip-thrust', 'Hip thrust', 'glutes', ['glutes'], ['hamstrings', 'quads'], ['bb', 'bench'], 'gym', 2, 5, R(10, 90, 4), {
    steps: ['Kürek kemiklerini sehpanın kenarına daya, barı kalçana yerleştir.', 'Dizlerini bük, ayakların kalça genişliğinde yerde olsun.', 'Topuklarla iterek kalçayı gövde yere paralel olana kadar kaldır.', 'Tepede kalçanı sık, kontrollü indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Bar için yumuşak bir ped kullan.', 'Çeneni hafifçe göğsüne yaklaştır.'],
    mistakes: ['Tepede beli geriye bükmek', 'Ayakları çok uzağa koymak'] }),
  X('donkey-kick', 'Eşek tekmesi', 'glutes', ['glutes'], ['hamstrings', 'abs'], ['bw', 'band'], 'home', 1, 3.5, R(15, 30, 3), {
    steps: ['Dört ayak pozisyonuna geç: eller omuz altında, dizler kalça altında.', 'Bir dizini 90 derece bükülü tut.', 'Topuğunu tavana doğru it.', 'Yavaşça indir; setin sonunda bacak değiştir.'],
    breath: 'İterken nefes ver, indirirken nefes al.',
    tips: ['Belini sabit tut, sadece kalça hareket etsin.', 'Bant ile zorlaştırabilirsin.'],
    mistakes: ['Beli çukurlaştırmak', 'Hızla sallamak'] }),
  X('side-leg-raise', 'Yan yatarak bacak kaldırma', 'glutes', ['glutes'], ['obliques', 'adductors'], ['bw', 'band'], 'home', 1, 3, R(15, 30, 3), {
    steps: ['Yan yat, alttaki kolunu başının altına koy.', 'Bacaklarını üst üste düz uzat.', 'Üstteki bacağı yukarı kaldır.', 'Yavaşça indir; setin sonunda taraf değiştir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Ayak parmakların öne baksın, tavana değil.', 'Gövdeni geriye devirme.'],
    mistakes: ['Bacağı çok yükseğe savurmak', 'Kalçayı geriye döndürmek'] }),
  X('cable-kickback', 'Kabloyla kalça geri itiş', 'glutes', ['glutes'], ['hamstrings'], ['cable'], 'gym', 2, 4, R(12, 45, 3), {
    steps: ['Ayak bileği bandını alt makaraya tak ve bileğine geçir.', 'Makineye tutunup gövdeni hafif öne eğ.', 'Bacağını düz şekilde geriye it.', 'Kontrollü geri getir; bacak değiştir.'],
    breath: 'İterken nefes ver, geri getirirken nefes al.',
    tips: ['Tepede kalçanı sık.', 'Gövden sabit kalsın.'],
    mistakes: ['Beli bükerek bacağı yukarı atmak', 'Ağır ağırlıkla sallamak'] }),
  X('kb-swing', 'Kettlebell swing', 'glutes', ['glutes', 'hamstrings'], ['lowerBack', 'shoulders', 'abs'], ['kb'], 'both', 2, 9.8, R(15, 60, 4), {
    steps: ['Ayaklarını omuz genişliğinde aç, kettlebell\'i iki elle tut.', 'Kalçadan eğilip kettlebell\'i bacak arasından geriye sal.', 'Kalçanı güçlü şekilde öne iterek kettlebell\'i göğüs hizasına savur.', 'Kendi ağırlığıyla düşerken tekrar kalçadan eğil.'],
    breath: 'Kalçayı iterken nefes ver, eğilirken nefes al.',
    tips: ['Güç kollardan değil kalçadan gelir.', 'Sırtın her an düz olsun.'],
    mistakes: ['Squat gibi çok çömelmek', 'Kollarla kaldırmak', 'Sırtı yuvarlamak'] }),
  X('band-walk', 'Bantlı yan yürüyüş', 'glutes', ['glutes'], ['adductors', 'quads'], ['band'], 'home', 1, 4, R(12, 30, 3), {
    steps: ['Bandı dizlerinin hemen üstüne geçir.', 'Yarım çömel, ellerini beline koy.', 'Bir ayağınla yana adım at, bandı gergin tut.', 'Diğer ayağını getir; birkaç adım sonra yön değiştir.'],
    breath: 'Düzenli nefes al ver.',
    tips: ['Her adımda dizlerin dışa doğru itsin.', 'Gövdeni sallama.'],
    mistakes: ['Dizlerin içe kapanması', 'Ayakları sürüklemek'] }),

  // ======================= OMUZ =======================
  X('db-shoulder-press', 'Dambıl omuz press', 'shoulders', ['shoulders', 'triceps'], ['upperBack', 'abs'], ['db'], 'both', 2, 5, R(10, 75, 3), {
    steps: ['Dambılları omuz hizasında, avuçlar öne bakacak şekilde tut.', 'Karnını sık, belini dik tut.', 'Dambılları başının üstüne doğru it.', 'Kontrollü şekilde omuz hizasına indir.'],
    breath: 'İterken nefes ver, indirirken nefes al.',
    tips: ['Oturarak yapmak beli korur.', 'Dirsekleri tamamen kilitleme.'],
    mistakes: ['Beli geriye bükmek', 'Dambılları çok aşağıya indirmek'] }),
  X('ohp', 'Halter omuz press (ayakta)', 'shoulders', ['shoulders', 'triceps'], ['upperBack', 'abs'], ['bb'], 'gym', 3, 6, R(6, 120, 4), {
    steps: ['Barı üst göğsünde, ellerin omuz genişliğinden biraz açık tut.', 'Kalçanı ve karnını sık.', 'Barı başının üstüne dik bir çizgide it; başını hafif geri çek.', 'Bar alnını geçince başını öne al; kontrollü indir.'],
    breath: 'İtmeden önce nefes al, tepede nefes ver.',
    tips: ['Bar yüzüne yakın, dik bir çizgide hareket etsin.', 'Bacaklarla itme yapma.'],
    mistakes: ['Beli geriye bükmek', 'Barı öne doğru itmek'] }),
  X('lateral-raise', 'Yana açış (lateral raise)', 'shoulders', ['shoulders'], ['traps'], ['db', 'band', 'cable'], 'both', 1, 4, R(12, 45, 3), {
    steps: ['Dambılları yanlarda tut, dirsekler hafif bükük.', 'Kollarını yana doğru omuz hizasına kaldır.', 'Tepede kısa bir an bekle.', 'Yavaşça indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Hafif ağırlıkla doğru teknik daha etkilidir.', 'Dirsekler eli yönlendirsin.'],
    mistakes: ['Gövdeyi sallayarak kaldırmak', 'Omuz hizasının çok üstüne çıkmak'] }),
  X('front-raise', 'Öne kaldırış', 'shoulders', ['shoulders'], ['chest'], ['db', 'band'], 'both', 1, 4, R(12, 45, 3), {
    steps: ['Dambılları uyluklarının önünde tut.', 'Kolları düz şekilde öne, omuz hizasına kaldır.', 'Kısa bir an bekle.', 'Yavaşça indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Kollarını sırayla da kaldırabilirsin.', 'Gövden sabit kalsın.'],
    mistakes: ['Geriye yaslanmak', 'Ağırlığı savurmak'] }),
  X('pike-pushup', 'Pike şınav', 'shoulders', ['shoulders', 'triceps'], ['chest', 'upperBack'], ['bw'], 'home', 2, 6, R(8, 60, 3, { bwf: 0.5 }), {
    steps: ['Şınav pozisyonundan kalçanı yukarı kaldırıp ters V şekli yap.', 'Ellerin omuz genişliğinde olsun.', 'Dirsekleri bükerek başını ellerinin önüne doğru yere yaklaştır.', 'İterek ters V pozisyonuna dön.'],
    breath: 'İnerken nefes al, iterken nefes ver.',
    tips: ['Ayaklarını yükseltirsen zorlaşır.', 'Omuz press\'in ev versiyonudur.'],
    mistakes: ['Kalçayı indirip normal şınava dönmek', 'Başı yere çarpmak'] }),
  X('upright-row', 'Dik kürek (upright row)', 'shoulders', ['shoulders', 'traps'], ['biceps'], ['bb', 'db'], 'both', 2, 4, R(12, 60, 3), {
    steps: ['Barı ya da dambılları uyluk önünde tut.', 'Dirseklerini yana ve yukarı çekerek ağırlığı göğüs hizasına kaldır.', 'Dirsekler ellerden yüksekte olsun.', 'Yavaşça indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Elleri biraz geniş tutmak omza daha rahattır.', 'Omuz hizasının üstüne çıkma.'],
    mistakes: ['Çok dar tutuşla omzu sıkıştırmak', 'Gövdeyi sallamak'] }),

  // ======================= KOL =======================
  X('db-curl', 'Dambıl biceps curl', 'arms', ['biceps'], ['forearms'], ['db'], 'both', 1, 3.5, R(12, 45, 3), {
    steps: ['Dambılları yanlarda, avuçlar öne bakacak şekilde tut.', 'Dirseklerini gövdene sabitle.', 'Dambılları omuzlarına doğru kaldır.', 'Yavaşça indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['İnişi kalkıştan daha yavaş yap.', 'Kollarını sırayla da çalıştırabilirsin.'],
    mistakes: ['Gövdeyi sallamak', 'Dirsekleri öne kaydırmak'] }),
  X('hammer-curl', 'Çekiç curl', 'arms', ['biceps', 'forearms'], [], ['db'], 'both', 1, 3.5, R(12, 45, 3), {
    steps: ['Dambılları yanlarda, avuçlar birbirine bakacak şekilde tut.', 'Dirsekleri gövdeye yakın tut.', 'Dambılları omuza doğru kaldır.', 'Kontrollü indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Ön kol ve bilek gücünü de geliştirir.', 'Bileklerini düz tut.'],
    mistakes: ['Ağırlığı savurmak', 'Omuzları kaldırmak'] }),
  X('bb-curl', 'Halter biceps curl', 'arms', ['biceps'], ['forearms'], ['bb'], 'gym', 1, 3.5, R(10, 60, 3), {
    steps: ['Barı omuz genişliğinde, avuçlar öne bakacak şekilde tut.', 'Dirsekleri gövdene sabitle.', 'Barı göğsüne doğru kaldır.', 'Kollar uzayana kadar yavaşça indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Dik dur, karnını sık.', 'Bilek ağrısı olursa EZ bar kullan.'],
    mistakes: ['Belini geriye bükerek kaldırmak', 'Yarım hareket yapmak'] }),
  X('band-curl', 'Bantla biceps curl', 'arms', ['biceps'], ['forearms'], ['band'], 'home', 1, 3, R(15, 45, 3), {
    steps: ['Bandın ortasına bas, uçlarını kavra.', 'Dirseklerini gövdene sabitle.', 'Elleri omuza doğru kaldır.', 'Yavaşça indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Ayaklarını açarak direnci artırabilirsin.', 'Tepede biceps\'i sık.'],
    mistakes: ['Bandı hızlıca bırakmak', 'Dirsekleri öne kaydırmak'] }),
  X('tricep-pushdown', 'Triceps pushdown (kablo)', 'arms', ['triceps'], [], ['cable'], 'gym', 1, 3.5, R(12, 45, 3), {
    steps: ['Üst makaraya ip ya da bar tak, tutamağı kavra.', 'Dirseklerini gövdenin yanına sabitle, hafif öne eğil.', 'Kolları tamamen düzleşene kadar aşağı it.', 'Kontrollü şekilde dirsekleri bükerek geri gel.'],
    breath: 'İterken nefes ver, geri gelirken nefes al.',
    tips: ['Sadece ön kolun hareket etsin.', 'Altta bir an triceps\'i sık.'],
    mistakes: ['Dirsekleri öne arkaya oynatmak', 'Gövde ağırlığıyla bastırmak'] }),
  X('overhead-tricep', 'Baş üstü triceps uzatma', 'arms', ['triceps'], ['shoulders'], ['db'], 'both', 1, 3.5, R(12, 45, 3), {
    steps: ['Bir dambılı iki elinle başının üstünde tut.', 'Dirseklerini yukarıda ve kulaklara yakın tut.', 'Dambılı başının arkasına doğru indir.', 'Kolları uzatarak yukarı kaldır.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Oturarak yapmak dengeyi kolaylaştırır.', 'Karnını sık, beli çukurlaştırma.'],
    mistakes: ['Dirsekleri yanlara açmak', 'Belini geriye bükmek'] }),
  X('skull-crusher', 'Skull crusher (yatarak triceps)', 'arms', ['triceps'], [], ['bb', 'db', 'bench'], 'gym', 2, 3.5, R(10, 60, 3), {
    steps: ['Sehpaya sırt üstü yat, barı kollar düz şekilde göğüs üstünde tut.', 'Üst kolların sabit kalsın.', 'Dirsekleri bükerek barı alnına doğru indir.', 'Kolları uzatarak barı yukarı kaldır.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Hafif ağırlıkla başla.', 'Barı alnın biraz arkasına indirmek dirseğe daha rahattır.'],
    mistakes: ['Dirsekleri yana açmak', 'Hareketi omuzdan yapmak'] }),
  X('bench-dip', 'Sandalye/sehpa dips', 'arms', ['triceps'], ['chest', 'shoulders'], ['bw', 'bench'], 'home', 1, 5, R(12, 45, 3, { bwf: 0.5 }), {
    steps: ['Sehpanın ya da sağlam bir sandalyenin kenarına ellerini koy.', 'Bacaklarını öne uzat, kalçanı sehpanın önüne al.', 'Dirsekler yaklaşık 90 derece olana kadar alçal.', 'Avuçlarınla iterek yukarı çık.'],
    breath: 'İnerken nefes al, çıkarken nefes ver.',
    tips: ['Dizleri bükmek hareketi kolaylaştırır.', 'Sırtın sehpaya yakın kalsın.'],
    mistakes: ['Çok derine inmek', 'Dirsekleri yana açmak'] }),

  // ======================= KARIN =======================
  X('plank', 'Plank', 'core', ['abs'], ['shoulders', 'glutes', 'lowerBack'], ['bw'], 'both', 1, 3.8, T(40, 30), {
    steps: ['Ön kollarını yere koy, dirsekler omuz altında olsun.', 'Ayaklarını geriye uzat, parmak uçlarında dur.', 'Baştan topuğa düz bir çizgi oluştur.', 'Karnını ve kalçanı sıkarak süre boyunca koru.'],
    breath: 'Düzenli ve sakin nefes al ver; nefesini tutma.',
    tips: ['Bakışın yere olsun.', 'Zorsa dizlerin yerde başla.'],
    mistakes: ['Kalçanın sarkması', 'Kalçanın havaya kalkması', 'Nefesi tutmak'] }),
  X('side-plank', 'Yan plank', 'core', ['obliques', 'abs'], ['shoulders', 'glutes'], ['bw'], 'both', 2, 3.8, T(30, 30), {
    steps: ['Yan yat, alttaki dirseğin omuz altında olsun.', 'Ayaklarını üst üste koy.', 'Kalçanı kaldırarak baştan ayağa düz bir çizgi yap.', 'Süre boyunca koru; sonra taraf değiştir.'],
    breath: 'Düzenli nefes al ver.',
    tips: ['Üstteki kolunu tavana uzatabilirsin.', 'Zorsa alttaki dizi yere koy.'],
    mistakes: ['Kalçanın düşmesi', 'Omzu kulağa yaklaştırmak'] }),
  X('crunch', 'Mekik (crunch)', 'core', ['abs'], ['obliques'], ['bw'], 'home', 1, 3.8, R(15, 30, 3), {
    steps: ['Sırt üstü uzan, dizlerini bük, ayaklar yerde.', 'Ellerini dizlerine doğru uzat ya da göğsünde çaprazla.', 'Karnını sıkarak omuzlarını yerden kaldır.', 'Yavaşça geri in.'],
    breath: 'Kalkarken nefes ver, inerken nefes al.',
    tips: ['Belin yerde kalsın, sadece omuzlar kalksın.', 'Çene ile göğüs arasında bir yumruk boşluk bırak.'],
    mistakes: ['Boynu ellerle çekmek', 'Hızla sallanarak kalkmak'] }),
  X('leg-raise', 'Yatarak bacak kaldırma', 'core', ['abs', 'hipflex'], ['obliques'], ['bw'], 'home', 2, 3.8, R(12, 45, 3), {
    steps: ['Sırt üstü uzan, ellerini kalçanın yanına koy.', 'Bacaklarını düz ve bitişik tut.', 'Bacaklarını dik olana kadar kaldır.', 'Yere değdirmeden yavaşça indir.'],
    breath: 'Kaldırırken nefes ver, indirirken nefes al.',
    tips: ['Belin yerden kalkıyorsa dizlerini hafif bük.', 'İnişi yavaş yap.'],
    mistakes: ['Beli çukurlaştırmak', 'Bacakları hızla düşürmek'] }),
  X('russian-twist', 'Russian twist', 'core', ['obliques', 'abs'], ['hipflex'], ['bw', 'db'], 'home', 2, 4, R(20, 30, 3), {
    steps: ['Yere otur, dizlerini bük ve gövdeni hafif geriye yatır.', 'Ellerini göğsünün önünde birleştir.', 'Gövdeni sağa çevir, ellerini yere yaklaştır.', 'Sonra sola çevir; her yön bir tekrar sayılır.'],
    breath: 'Dönerken nefes ver, ortaya gelirken nefes al.',
    tips: ['Ayakları yerden kaldırırsan zorlaşır.', 'Hareketi kollarla değil gövdeyle yap.'],
    mistakes: ['Sırtı yuvarlamak', 'Sadece kolları sallamak'] }),
  X('bicycle-crunch', 'Bisiklet mekik', 'core', ['obliques', 'abs'], ['hipflex'], ['bw'], 'home', 2, 4.5, R(20, 30, 3), {
    steps: ['Sırt üstü uzan, ellerini başının yanına koy.', 'Omuzlarını hafif kaldır, bacaklarını havaya al.', 'Bir dizini göğsüne çekerken karşı dirseğini ona yaklaştır.', 'Diğer tarafa geçerek pedal çevirir gibi devam et.'],
    breath: 'Her dönüşte nefes ver.',
    tips: ['Yavaş ve kontrollü yap.', 'Uzanan bacak yere değmesin.'],
    mistakes: ['Boynu çekmek', 'Çok hızlı yapmak'] }),
  X('dead-bug', 'Ölü böcek (dead bug)', 'core', ['abs'], ['obliques', 'hipflex'], ['bw'], 'home', 1, 3.5, R(10, 30, 3), {
    steps: ['Sırt üstü uzan, kollarını tavana uzat.', 'Dizlerini 90 derece bükerek havaya kaldır.', 'Bir kolunu başının arkasına, karşı bacağını öne doğru uzat.', 'Merkeze dön ve diğer tarafla tekrarla.'],
    breath: 'Uzatırken nefes ver, dönerken nefes al.',
    tips: ['Belin hep yere yapışık kalsın.', 'Bel ağrısı olanlar için güvenli bir karın egzersizidir.'],
    mistakes: ['Beli yerden kaldırmak', 'Acele etmek'] }),
  X('hanging-knee-raise', 'Asılı diz çekme', 'core', ['abs', 'hipflex'], ['forearms', 'lats'], ['bar'], 'both', 2, 4, R(10, 60, 3), {
    steps: ['Barfiks barına asıl, kollar düz.', 'Gövdeni sabit tut, sallanma.', 'Dizlerini göğsüne doğru çek.', 'Kontrollü şekilde indir.'],
    breath: 'Çekerken nefes ver, indirirken nefes al.',
    tips: ['Tepede kalçanı hafif öne kıvır.', 'Zorlaştırmak için bacakları düz kaldır.'],
    mistakes: ['Sallanarak güç almak', 'Bacakları hızla düşürmek'] }),
  X('bird-dog', 'Kuş-köpek (bird dog)', 'core', ['abs', 'lowerBack'], ['glutes', 'shoulders'], ['bw'], 'home', 1, 3, R(10, 30, 3), {
    steps: ['Dört ayak pozisyonuna geç.', 'Bir kolunu öne, karşı bacağını geriye uzat.', '2 saniye dengede kal.', 'Geri getir ve diğer tarafla tekrarla.'],
    breath: 'Uzatırken nefes ver, geri getirirken nefes al.',
    tips: ['Sırtında bir bardak su varmış gibi düz tut.', 'Denge ve bel sağlığı için harikadır.'],
    mistakes: ['Kalçayı yana döndürmek', 'Bacağı çok yükseğe kaldırmak'] }),
  X('mountain-climber', 'Dağ tırmanıcısı', 'cardio', ['abs', 'quads'], ['shoulders', 'hipflex'], ['bw'], 'home', 2, 8, T(30, 30), {
    steps: ['Yüksek plank pozisyonuna geç, eller omuz altında.', 'Bir dizini göğsüne doğru çek.', 'Hızla bacak değiştir.', 'Süre boyunca tempolu devam et.'],
    breath: 'Kısa ve düzenli nefes al ver.',
    tips: ['Kalçanı omuz hizasında tut.', 'Yeni başlıyorsan yavaş tempoyla başla.'],
    mistakes: ['Kalçayı havaya kaldırmak', 'Ellerin omuz önüne kayması'] }),

  // ======================= KARDİYO =======================
  X('jumping-jack', 'Jumping jack', 'cardio', ['calves', 'shoulders'], ['quads', 'glutes'], ['bw'], 'home', 1, 8, T(40, 20), {
    steps: ['Ayaklar bitişik, kollar yanda dik dur.', 'Zıplayarak bacaklarını aç, kollarını başının üstüne kaldır.', 'Tekrar zıplayarak başlangıca dön.', 'Süre boyunca tempolu devam et.'],
    breath: 'Ritmik nefes al ver.',
    tips: ['Parmak uçlarına yumuşak in.', 'Zıplamadan adım adım da yapabilirsin.'],
    mistakes: ['Topukla sert inmek', 'Dizleri kilitlemek'] }),
  X('burpee', 'Burpee', 'cardio', ['quads', 'chest'], ['shoulders', 'abs', 'glutes'], ['bw'], 'home', 3, 10, R(10, 45, 3), {
    steps: ['Ayakta başla, çömel ve ellerini yere koy.', 'Ayaklarını geriye atarak plank pozisyonuna geç.', 'Ayaklarını tekrar ellerine doğru çek.', 'Kollarını yukarı uzatarak sıçra.'],
    breath: 'Sıçrarken nefes ver, çömelirken nefes al.',
    tips: ['Zorsa ayaklarını sırayla geri at.', 'İstersen plankta bir şınav ekle.'],
    mistakes: ['Plankta belin çökmesi', 'Sert inişler'] }),
  X('high-knees', 'Yüksek diz koşusu', 'cardio', ['quads', 'hipflex'], ['calves', 'abs'], ['bw'], 'home', 1, 8, T(30, 30), {
    steps: ['Dik dur, kollarını dirsekten bük.', 'Yerinde koşarken dizlerini kalça hizasına kaldır.', 'Kollarını bacaklarınla zıt yönde salla.', 'Süre boyunca tempolu devam et.'],
    breath: 'Kısa ve ritmik nefes al ver.',
    tips: ['Parmak uçlarında kal.', 'Gövdeni geriye yatırma.'],
    mistakes: ['Dizleri yeterince kaldırmamak', 'Topukla sert basmak'] }),
  X('butt-kicks', 'Topuk vuruşu', 'cardio', ['hamstrings'], ['calves', 'quads'], ['bw'], 'home', 1, 7, T(30, 30), {
    steps: ['Dik dur, kollarını dirsekten bük.', 'Yerinde koşarken topuklarını kalçana doğru çek.', 'Kollarınla ritim tut.', 'Süre boyunca devam et.'],
    breath: 'Ritmik nefes al ver.',
    tips: ['Isınma için idealdir.', 'Dizler yere bakar şekilde kalsın.'],
    mistakes: ['Öne eğilmek', 'Ağır basmak'] }),
  X('jump-squat', 'Sıçramalı squat', 'cardio', ['quads', 'glutes'], ['calves', 'hamstrings'], ['bw'], 'home', 2, 9, R(12, 45, 3, { bwf: 0.7 }), {
    steps: ['Ayaklarını omuz genişliğinde aç.', 'Normal bir squat gibi çömel.', 'Patlayıcı şekilde yukarı sıçra.', 'Dizlerini hafif bükerek yumuşak in ve hemen tekrar çömel.'],
    breath: 'Sıçrarken nefes ver, çömelirken nefes al.',
    tips: ['İnişte sessiz olmaya çalış.', 'Diz sorunun varsa normal squat yap.'],
    mistakes: ['Düz bacakla sert inmek', 'Dizlerin içe kapanması'] }),
  X('skater-jump', 'Paten sıçrayışı', 'cardio', ['glutes', 'quads'], ['adductors', 'calves'], ['bw'], 'home', 2, 8, R(16, 45, 3), {
    steps: ['Bir bacağın üstünde hafif çömel.', 'Yana doğru sıçrayarak diğer bacağına in.', 'Boştaki bacağını arkadan çaprazla.', 'Ritmik şekilde iki yana devam et.'],
    breath: 'Her sıçrayışta nefes ver.',
    tips: ['Kollarını dengeleme için salla.', 'Önce küçük sıçrayışlarla başla.'],
    mistakes: ['Dizin içe dönmesi', 'Sert iniş'] }),
  X('jump-rope', 'İp atlama', 'cardio', ['calves'], ['shoulders', 'forearms', 'quads'], ['bw'], 'home', 2, 11, T(60, 30), {
    steps: ['İpin uçlarını kalça yanında tut.', 'İpi bileklerinle çevir.', 'İp ayağına gelince parmak uçlarınla hafifçe sıçra.', 'Dirseklerin gövdene yakın kalsın.'],
    breath: 'Ritmik ve düzenli nefes al ver.',
    tips: ['Yüksek zıplamana gerek yok, 2–3 cm yeterli.', 'İp yoksa aynı hareketi ipsiz yap.'],
    mistakes: ['Kollarla büyük daireler çizmek', 'Topukla inmek'] }),
  X('box-jump', 'Kutuya sıçrama', 'cardio', ['quads', 'glutes'], ['calves', 'hamstrings'], ['box'], 'gym', 3, 8, R(8, 75, 3), {
    steps: ['Sağlam bir kutunun önünde dur.', 'Kollarını geri savurup yarım çömel.', 'Kollarını öne savurarak kutuya sıçra.', 'Yumuşak in, dikleş ve adım adım aşağı in.'],
    breath: 'Sıçrarken nefes ver.',
    tips: ['Alçak bir kutuyla başla.', 'Aşağı zıplamak yerine adımla in.'],
    mistakes: ['Kutunun kenarına inmek', 'Düz bacakla inmek'] }),
  X('shadow-boxing', 'Gölge boksu', 'cardio', ['shoulders'], ['abs', 'obliques', 'calves'], ['bw'], 'home', 1, 7.8, T(60, 30), {
    steps: ['Ayaklarını omuz genişliğinde, biri önde olacak şekilde aç.', 'Yumruklarını çene hizasında tut.', 'Öndeki elle düz yumruk (jab), arkadaki elle düz vuruş yap.', 'Her vuruştan sonra eli hemen gard pozisyonuna geri getir.'],
    breath: 'Her yumrukta kısa nefes ver.',
    tips: ['Gövdeni ve kalçanı vuruşa kat.', 'Kolları tamamen kilitleme.'],
    mistakes: ['Gardı düşürmek', 'Dirsekleri kilitlemek'] }),
  X('rower', 'Kürek makinesi', 'cardio', ['lats', 'quads'], ['upperBack', 'biceps', 'hamstrings', 'glutes'], ['machine'], 'gym', 2, 7, T(300, 60, 1), {
    steps: ['Ayaklarını sabitle, tutamağı kollar uzun şekilde kavra.', 'Önce bacaklarınla it.', 'Bacaklar uzayınca gövdeni hafif geri yatır ve tutamağı göğüs altına çek.', 'Sırayla kollar, gövde ve bacaklarla başlangıca dön.'],
    breath: 'Çekerken nefes ver, geri dönerken nefes al.',
    tips: ['Gücün çoğu bacaklardan gelir.', 'Tempoyu dakikada 20–26 çekişte tut.'],
    mistakes: ['Sadece kollarla çekmek', 'Sırtı yuvarlamak'] }),

  // ======================= ESNEME =======================
  X('cat-cow', 'Kedi-deve esnemesi', 'mobility', ['lowerBack', 'abs'], ['upperBack'], ['bw'], 'home', 1, 2.3, R(10, 15, 2), {
    steps: ['Dört ayak pozisyonuna geç.', 'Nefes alırken belini çukurlaştır, başını kaldır (deve).', 'Nefes verirken sırtını yuvarla, çeneni göğsüne yaklaştır (kedi).', 'Yavaş ve akıcı şekilde tekrarla.'],
    breath: 'Deve pozisyonunda nefes al, kedi pozisyonunda nefes ver.',
    tips: ['Sabah ve uzun oturmalardan sonra harikadır.', 'Hareketi zorlamadan yap.'],
    mistakes: ['Hızlı yapmak', 'Nefesle uyumsuz hareket etmek'] }),
  X('hamstring-stretch', 'Arka bacak esnetme (öne eğilme)', 'mobility', ['hamstrings'], ['lowerBack', 'calves'], ['bw'], 'both', 1, 2.3, T(30, 10, 2), {
    steps: ['Ayakların kalça genişliğinde dik dur.', 'Dizlerin hafif bükük olsun.', 'Kalçadan öne doğru eğil, kollarını sarkıt.', 'Gerilme hissettiğin yerde bekle ve derin nefes al.'],
    breath: 'Eğilirken nefes ver, beklerken derin nefes al.',
    tips: ['Acı değil, hafif gerilme hissetmelisin.', 'Kalkarken yavaşça, omur omur kalk.'],
    mistakes: ['Esnemede yaylanmak', 'Dizleri kilitlemek'] }),
  X('hip-flexor-stretch', 'Kalça önü esnetme', 'mobility', ['hipflex', 'quads'], ['abs'], ['bw'], 'home', 1, 2.3, T(30, 10, 2), {
    steps: ['Bir dizinin üstüne çök, diğer ayağın önde yerde olsun.', 'Gövdeni dik tut, kalçanı hafifçe öne it.', 'Arkadaki bacağın kalça önünde gerilmeyi hisset.', 'İstersen kollarını yukarı uzat; sonra taraf değiştir.'],
    breath: 'Derin ve yavaş nefes al ver.',
    tips: ['Uzun süre oturanlar için çok faydalıdır.', 'Dizinin altına yastık koy.'],
    mistakes: ['Beli çukurlaştırmak', 'Öndeki dizi çok ileri itmek'] }),
  X('childs-pose', 'Çocuk pozu', 'mobility', ['lowerBack', 'lats'], ['glutes', 'shoulders'], ['bw'], 'home', 1, 2, T(40, 10, 1), {
    steps: ['Dört ayak pozisyonundan başla.', 'Kalçanı topuklarına doğru geriye götür.', 'Kollarını öne uzat, alnını yere koy.', 'Gevşe ve derin nefes al.'],
    breath: 'Yavaş ve derin nefes al ver.',
    tips: ['Dizlerini açarak daha rahat bir pozisyon bulabilirsin.', 'Antrenman sonunda dinlenmek için idealdir.'],
    mistakes: ['Nefesi tutmak', 'Zorlayarak kalçayı bastırmak'] }),
  X('cobra', 'Kobra esnemesi', 'mobility', ['abs', 'lowerBack'], ['chest', 'hipflex'], ['bw'], 'home', 1, 2.3, T(20, 10, 3), {
    steps: ['Yüzüstü uzan, ellerini omuzlarının altına koy.', 'Kalçanı yerde tutarak göğsünü kaldır.', 'Kollarını rahat bir yüksekliğe kadar uzat.', 'Birkaç nefes bekle ve yavaşça in.'],
    breath: 'Kalkarken nefes al, inerken nefes ver.',
    tips: ['Omuzlarını kulaklardan uzak tut.', 'Belinde sıkışma olursa daha az kalk.'],
    mistakes: ['Başı geriye atmak', 'Kalçayı yerden kaldırmak'] }),
  X('down-dog', 'Aşağı bakan köpek', 'mobility', ['hamstrings', 'calves'], ['shoulders', 'lats'], ['bw'], 'home', 1, 2.5, T(30, 10, 2), {
    steps: ['Yüksek plank pozisyonundan başla.', 'Kalçanı yukarı ve geriye iterek ters V şekli yap.', 'Topuklarını yere doğru bastır.', 'Başını kollarının arasında rahat bırak.'],
    breath: 'Derin ve yavaş nefes al ver.',
    tips: ['Dizlerini bükmek sorun değil, sırtın düz kalsın.', 'Ağırlığı eller ve ayaklar arasında paylaştır.'],
    mistakes: ['Sırtı yuvarlamak', 'Omuzları kulaklara sıkıştırmak'] }),
  X('arm-circles', 'Kol çevirme', 'mobility', ['shoulders'], ['upperBack'], ['bw'], 'both', 1, 2.5, T(30, 10, 2), {
    steps: ['Dik dur, kollarını yanlarda sal.', 'Kollarını öne ve yukarı doğru büyük daireler çizerek çevir.', '15 saniye sonra yönü değiştir.', 'Hareketi yavaş ve kontrollü yap.'],
    breath: 'Rahat ve düzenli nefes al ver.',
    tips: ['Antrenman öncesi omuz ısınması için idealdir.', 'Daireleri yavaş yavaş büyüt.'],
    mistakes: ['Omuzları kaldırmak', 'Çok hızlı savurmak'] }),
  X('quad-stretch', 'Ön bacak esnetme (ayakta)', 'mobility', ['quads'], ['hipflex'], ['bw'], 'both', 1, 2.3, T(30, 10, 2), {
    steps: ['Dik dur, gerekirse bir duvara tutun.', 'Bir dizini bük ve ayak bileğini elinle tut.', 'Topuğunu kalçana yaklaştır, dizlerin yan yana olsun.', 'Bekle ve taraf değiştir.'],
    breath: 'Derin ve yavaş nefes al ver.',
    tips: ['Kalçanı hafif öne iterek gerilmeyi artır.', 'Dengeni kaybedersen duvara tutun.'],
    mistakes: ['Dizi yana açmak', 'Belini çukurlaştırmak'] }),
  X('shoulder-stretch', 'Omuz esnetme (kolu çapraz çekme)', 'mobility', ['shoulders'], ['upperBack'], ['bw'], 'both', 1, 2.3, T(30, 10, 2), {
    steps: ['Dik dur, bir kolunu göğsünün önünden karşıya uzat.', 'Diğer elinle dirseğinin üstünden tut.', 'Kolu göğsüne doğru hafifçe çek.', 'Bekle ve taraf değiştir.'],
    breath: 'Derin ve yavaş nefes al ver.',
    tips: ['Omzunu aşağıda tut.', 'Antrenman sonunda yap.'],
    mistakes: ['Omzu kulağa kaldırmak', 'Gövdeyi döndürmek'] }),
];

export const EX = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
export const groupLabel = id => GROUPS.find(g => g.id === id)?.label || id;
export const equipLabel = id => EQUIP.find(g => g.id === id)?.label || id;

/** Türkçe duyarsız arama için normalleştirme */
export function norm(s) {
  return String(s || '').toLocaleLowerCase('tr-TR')
    .replace(/[ıi̇]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}
export const fitsLoc = (e, loc) => !loc || loc === 'all' || e.loc === 'both' || e.loc === loc;
