// precache.json üretir: servis çalışanının kurulumda önbelleğe alacağı dosya listesi.
// Kullanım: node tools/precache.mjs   (nova/ klasöründen)
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['tools', 'sw.js', 'precache.json', 'README.md', 'MODULE_CONTRACT.md']);
const OK = /\.(js|css|html|svg|png|webmanifest|json)$/;
const out = [];
(function walk(dir) {
  for (const n of readdirSync(dir).sort()) {
    const full = join(dir, n), rel = relative(root, full);
    if (SKIP.has(rel) || n.startsWith('.')) continue;
    if (statSync(full).isDirectory()) walk(full);
    else if (OK.test(n)) out.push('./' + rel.split('\\').join('/'));
  }
})(root);
writeFileSync(join(root, 'precache.json'), JSON.stringify(out, null, 0));
console.log(out.length + ' dosya precache.json içine yazıldı');
