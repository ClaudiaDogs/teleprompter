// Cambia la versione dell'app in js/version.js e sw.js: node tools/bump-version.mjs 0.2.0
// Va fatto a ogni pubblicazione, altrimenti l'iPad continua a usare la versione in cache.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Uso: node tools/bump-version.mjs 1.2.3'); process.exit(1); }
const web = path.resolve(import.meta.dirname, '..', 'web');
for (const [file, re, rep] of [
  ['js/version.js', /APP_VERSION = '[^']*'/, `APP_VERSION = '${v}'`],
  ['sw.js', /const VERSION = '[^']*'/, `const VERSION = '${v}'`],
]) {
  const f = path.join(web, file);
  const src = await readFile(f, 'utf8');
  if (!re.test(src)) throw new Error('Versione non trovata in ' + file);
  await writeFile(f, src.replace(re, rep));
}
console.log('Versione ' + v);
