// Tarif ↔ sos eşleştirme: kategori + ad/malzeme anahtar kelimeleriyle basit puanlama.
import { allRecipes, norm } from './data.js';

/** Sos önerisi gösterilen kategoriler */
const SHOW = ['kahvalti', 'tavuk', 'et', 'balik', 'baklagil', 'sebze', 'salata', 'mealprep'];

// [normalize edilmiş anahtar kelime deseni, uygun sos id'leri, ağırlık]
const KEYS = [
  [/makarna|spagetti|bolonez|lazanya/, ['feslegenli-marinara', 'lorlu-light-pesto', 'lorlu-fit-alfredo'], 4],
  [/durum|lavas|taco|fajita|shawarma|tantuni|doner/, ['taze-domates-salsa', 'fit-guacamole', 'koyu-cacik-sos', 'lime-kisnisli-yogurt-sos', 'avokadolu-limon-sos'], 4],
  [/somon|levrek|cupra|mezgit|alabalik|hamsi|uskumru|balik/, ['tarhunlu-yogurt-sos', 'dereotlu-limonlu-yogurt-sos', 'yogurtlu-tartar-sos', 'limonlu-hardalli-sos', 'avokadolu-limon-sos'], 4],
  [/karides|kalamar/, ['mango-salsa', 'hafif-tatli-aci-sos', 'lime-kisnisli-yogurt-sos'], 4],
  [/kori|dal\b/, ['korili-yogurt-sos', 'lime-kisnisli-yogurt-sos'], 4],
  [/wok|teriyaki|tofu|soya/, ['light-teriyaki', 'fistik-ezmeli-sos', 'zencefilli-havuc-sos'], 4],
  [/falafel|nohut|humus|mercimek koftesi/, ['tahinli-limon-sos', 'pancarli-tahin-sos', 'koyu-cacik-sos', 'limonlu-humus-sos'], 4],
  [/salata|kase|roka|kisir|piyaz/, ['balsamik-salata-sosu', 'limonlu-hardalli-sos', 'nar-eksili-sos', 'tahinli-limon-sos', 'limonlu-humus-sos', 'zencefilli-havuc-sos'], 4],
  [/omlet|menemen|yumurta|saksuka/, ['taze-domates-salsa', 'sekersiz-ketcap', 'fit-guacamole'], 4],
  [/graten|besamel/, ['light-besamel-sos', 'lorlu-fit-alfredo'], 4],
  [/kofte|kiyma|burger|dolma|oturtma/, ['yogurtlu-sarimsakli-sos', 'acili-ezme', 'sekersiz-ketcap', 'koyu-cacik-sos'], 3],
  [/izgara|sis\b|biftek|bonfile|kusbasi|kebab|rosto|sac/, ['chimichurri', 'acili-ezme', 'light-mantar-sos', 'kozbiberli-cevizli-sos'], 3],
  [/patates/, ['sekersiz-ketcap', 'yogurtlu-fit-ranch', 'dereotlu-limonlu-yogurt-sos'], 2],
  [/mucver|kabak|patlican|karnabahar|imam|ispanak/, ['yogurtlu-sarimsakli-sos', 'dereotlu-limonlu-yogurt-sos', 'light-buffalo-sos', 'light-besamel-sos'], 2],
  [/tavuk/, ['yogurtlu-fit-ranch', 'hurmali-fit-barbeku', 'chimichurri', 'yogurtlu-sarimsakli-sos', 'balli-hardal-sos'], 1],
  [/hindi/, ['balli-hardal-sos', 'hurmali-fit-barbeku', 'yogurtlu-light-mayonez'], 1],
];

// Küçük, sabit karma: aynı tarifte hep aynı öneri, farklı tariflerde çeşitlilik
const hash = s => { let x = 7; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x % 1000; };

const textOf = r => ({ name: norm(r.name), ings: norm(r.ingredients.map(i => i.name).join(' ')) });

function score(r, s, t = textOf(r)) {
  let sc = s.goes?.includes(r.cat) ? 2 : 0, nameHit = false;
  for (const [re, ids, w] of KEYS) {
    if (!ids.includes(s.id)) continue;
    if (re.test(t.name)) { sc += w; if (w >= 3) nameHit = true; } else if (re.test(t.ings)) sc += w > 1 ? 1 : 0;
  }
  if (r.tags.includes('vegan') && !s.tags.includes('vegan')) sc -= 4;
  if (r.tags.includes('glutensiz') && !s.tags.includes('glutensiz')) sc -= 1;
  return { sc, nameHit };
}

/** Tarifin yanına 2-3 sos önerir (sos/tatlı/çorba/smoothie için boş) */
export function saucesFor(r, n = 3) {
  if (!SHOW.includes(r.cat)) return [];
  const t = textOf(r);
  const list = allRecipes().filter(s => s.cat === 'sos')
    .map(s => ({ s, ...score(r, s, t) }))
    // Kahvaltıda yalnız tuzlu tabaklara (adında eşleşme varsa) sos öner
    .filter(x => x.sc >= 2 && (r.cat !== 'kahvalti' || x.nameHit))
    .sort((a, b) => b.sc - a.sc || hash(r.id + a.s.id) - hash(r.id + b.s.id));
  return list.slice(0, n).map(x => x.s);
}

/** Sosun yanına yakışan tarifler */
export function recipesFor(s, n = 4) {
  return allRecipes().filter(r => r.cat !== 'sos' && SHOW.includes(r.cat))
    .map(r => ({ r, sc: score(r, s).sc }))
    .filter(x => x.sc >= 3)
    .sort((a, b) => b.sc - a.sc || hash(s.id + a.r.id) - hash(s.id + b.r.id))
    .slice(0, n).map(x => x.r);
}
