// Tarif verisi doğrulayıcı: node js/modules/recipes/tools/validate.mjs
// Zorunlu alanlar, benzersiz id, makul aralıklar, kalori-makro tutarlılığı ve diyet etiketleri.
import { UNITS } from '../data/_build.js';

const FILES = ['kahvalti', 'corba', 'tavuk', 'et', 'balik', 'baklagil', 'sebze', 'salata', 'mealprep', 'ara', 'smoothie', 'tatli', 'sos'];
const CATS = ['kahvalti', 'corba', 'tavuk', 'et', 'balik', 'baklagil', 'sebze', 'salata', 'mealprep', 'ara', 'smoothie', 'tatli'];
const DIFF = ['kolay', 'orta', 'zor'];

const MEAT = /(tavuk|dana|kıyma|hindi(?!stan)|et suyu|kuşbaşı|bonfile|biftek|somon|levrek|çupra|hamsi|uskumru|mezgit|ton balığı|karides|kalamar|balık|sucuk|baget|but\b)/i;
const ANIMAL = /(yumurta|süt\b|süzme|yoğurt|peynir|lor\b|kaşar|parmesan|labne|kefir|tereyağı|bal\b|protein tozu$|protein tozu\|)/i;
const GLUTEN = /(\bun\b|tam buğday|bulgur|makarna|ekmek|lavaş|yulaf|şehriye|irmik|galeta|tarhana|soya sosu|bisküvi|kuskus|arpa)/i;
const SUGAR = /(şeker(?!siz)|\bbal\b|çikolata|pekmez|reçel)/i;

const errors = [], warns = [];
const ids = new Set();
const seenNames = new Set();
const perCat = {};
const tagCount = {};
let total = 0;

for (const f of FILES) {
  const mod = await import(`../data/${f}.js`);
  const list = mod.default;
  perCat[f] = list.length;
  for (const r of list) {
    total++;
    const where = `${f}/${r.id}`;
    const req = ['id', 'name', 'cat', 'emoji', 'tags', 'servings', 'prepMin', 'cookMin', 'difficulty', 'ingredients', 'steps', 'perServing', 'gramsPerServing'];
    for (const k of req) if (r[k] == null) errors.push(`${where}: eksik alan ${k}`);
    if (!/^[a-z0-9-]+$/.test(r.id)) errors.push(`${where}: id yalnız küçük ASCII harf, rakam ve tire içermeli`);
    if (ids.has(r.id)) errors.push(`${where}: tekrar eden id`);
    if (['shopping', 'plan', 'week'].includes(r.id)) errors.push(`${where}: ayrılmış id`);
    ids.add(r.id);
    const nk = r.name.toLocaleLowerCase('tr');
    if (seenNames.has(nk)) errors.push(`${where}: tekrar eden ad`);
    seenNames.add(nk);
    if (r.cat !== f) errors.push(`${where}: kategori ${r.cat} dosya adıyla uyuşmuyor`);
    if (!DIFF.includes(r.difficulty)) errors.push(`${where}: zorluk ${r.difficulty}`);
    if (!(r.servings >= 1 && r.servings <= 12)) errors.push(`${where}: porsiyon ${r.servings}`);
    if (!(r.prepMin >= 0 && r.prepMin <= 120 && r.cookMin >= 0 && r.cookMin <= 180)) errors.push(`${where}: süre ${r.prepMin}/${r.cookMin}`);
    if (r.prepMin + r.cookMin < 2) errors.push(`${where}: toplam süre çok kısa`);
    if (!Array.isArray(r.steps) || r.steps.length < 2) errors.push(`${where}: en az 2 adım gerekli`);
    r.steps.forEach((s, i) => { if (typeof s !== 'string' || s.length < 8) errors.push(`${where}: adım ${i + 1} çok kısa`); });
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 2) errors.push(`${where}: en az 2 malzeme gerekli`);
    for (const ing of r.ingredients) {
      if (!ing.name || !(ing.qty > 0) || !UNITS.includes(ing.unit)) errors.push(`${where}: hatalı malzeme ${JSON.stringify(ing)}`);
      if (ing.unit === 'g' && ing.qty > 2000) warns.push(`${where}: çok büyük miktar ${ing.qty} g ${ing.name}`);
    }
    const n = r.perServing;
    for (const k of ['kcal', 'p', 'c', 'f', 'fib']) if (typeof n[k] !== 'number' || n[k] < 0) errors.push(`${where}: besin değeri ${k}`);
    const sauce = r.cat === 'sos';
    if (sauce ? (n.kcal < 10 || n.kcal > 150) : (n.kcal < 40 || n.kcal > 900)) errors.push(`${where}: kalori aralık dışı (${n.kcal})`);
    if (sauce) {
      if (!r.tags.includes('sos')) errors.push(`${where}: sos etiketi yok`);
      if (!r.pairs || r.pairs.length < 15) errors.push(`${where}: "Yanına yakışır" metni eksik`);
      if (!Array.isArray(r.goes) || !r.goes.length) errors.push(`${where}: uyduğu kategoriler eksik`);
      else r.goes.filter(c => !CATS.includes(c)).forEach(c => errors.push(`${where}: bilinmeyen kategori ${c}`));
      if (!r.tips?.some(t => /Buzdolabında \d+ gün/.test(t))) errors.push(`${where}: saklama bilgisi (Buzdolabında N gün) eksik`);
      if (!(r.servings >= 4 && r.servings <= 8)) errors.push(`${where}: sos porsiyonu 4-8 olmalı`);
      if (r.ingredients.some(i => /şeker(?!siz)|tatlandırıcı|aspartam|sukraloz|glikoz|mısır şurubu|margarin|mayonez/i.test(i.name))) errors.push(`${where}: zararlı/işlenmiş içerik`);
      if (r.ingredients.some(i => /\bbal\b/.test(i.name)) && !r.tips?.some(t => /bal/.test(t))) errors.push(`${where}: bal içeriyor ama ipucunda belirtilmemiş`);
      if (r.ingredients.some(i => /hurma/.test(i.name)) && !r.tips?.some(t => /hurma/i.test(t))) errors.push(`${where}: hurma içeriyor ama ipucunda belirtilmemiş`);
      const oil = r.ingredients.filter(i => /yağı$/.test(i.name)).reduce((s, i) => s + i.qty * (i.unit === 'yk' ? 13.5 : i.unit === 'tk' ? 4.5 : 1), 0);
      if (oil / r.servings > 5) errors.push(`${where}: porsiyon başına yağ fazla (${(oil / r.servings).toFixed(1)} g)`);
    } else if (r.pairs || r.goes) errors.push(`${where}: sos alanları yalnız soslarda olmalı`);
    if (n.fib > n.c) errors.push(`${where}: lif karbonhidrattan fazla`);
    const calc = 4 * n.p + 4 * n.c + 9 * n.f;
    const diff = Math.abs(calc - n.kcal) / n.kcal;
    if (diff > 0.12) errors.push(`${where}: kalori tutarsız ${n.kcal} kcal vs makrolardan ${Math.round(calc)} (%${Math.round(diff * 100)})`);
    if (!(r.gramsPerServing >= (sauce ? 15 : 30) && r.gramsPerServing <= (sauce ? 120 : 700))) errors.push(`${where}: porsiyon gramı ${r.gramsPerServing}`);
    const dens = n.kcal / r.gramsPerServing;
    if (dens < (sauce ? 0.2 : 0.25) || dens > 5.5) errors.push(`${where}: enerji yoğunluğu şüpheli (${dens.toFixed(2)} kcal/g)`);
    // Diyet etiketleri
    const names = r.ingredients.map(i => i.name + (i.note ? '|' + i.note : ''));
    const tags = new Set(r.tags);
    r.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
    if (tags.has('vejetaryen')) names.filter(x => MEAT.test(x)).forEach(x => errors.push(`${where}: vejetaryen ama "${x}" içeriyor`));
    if (tags.has('vegan')) names.filter(x => ANIMAL.test(x) && !/bitkisel|badem sütü|soya sütü|hindistan cevizi sütü/.test(x)).forEach(x => errors.push(`${where}: vegan ama "${x}" içeriyor`));
    if (tags.has('glutensiz')) names.filter(x => GLUTEN.test(x) && !/glutensiz/.test(x)).forEach(x => errors.push(`${where}: glutensiz ama "${x}" içeriyor`));
    if (tags.has('şekersiz')) names.filter(x => SUGAR.test(x)).forEach(x => errors.push(`${where}: şekersiz ama "${x}" içeriyor`));
    if (tags.has('hızlı') && r.prepMin + r.cookMin > 20) errors.push(`${where}: hızlı etiketi ama ${r.prepMin + r.cookMin} dk`);
  }
}

console.log('Kategori başına tarif sayısı:');
for (const [k, v] of Object.entries(perCat)) console.log('  ' + k.padEnd(10) + String(v).padStart(4));
console.log('  ' + 'TOPLAM'.padEnd(10) + String(total).padStart(4));
console.log('Etiketler:', Object.entries(tagCount).map(([k, v]) => `${k}=${v}`).join(', '));
warns.forEach(w => console.log('UYARI', w));
if (errors.length) {
  errors.forEach(e => console.log('HATA', e));
  console.log(`\n${errors.length} hata`);
  process.exit(1);
}
if (total < 240) { console.log('HATA en az 240 tarif gerekli'); process.exit(1); }
if (perCat.sos < 30) { console.log('HATA en az 30 sos gerekli'); process.exit(1); }
console.log('\nTüm tarifler geçerli.');
