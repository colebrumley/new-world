// Size budget for the built game (R-1007): run after `vite build`.
//   - everything the page ever loads as script, gzipped, must fit in 400 KB;
//   - the entry script (what stands between the visitor and the title screen) in 20 KB.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const TOTAL_LIMIT = 400 * 1024;
const ENTRY_LIMIT = 20 * 1024;
const dist = join(import.meta.dirname, '..', 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = /<script[^>]+src="\.?\/?(assets\/[^"]+\.js)"/.exec(html)?.[1];
if (!entry) {
  console.error('size: no entry script found in dist/index.html (was the build run?)');
  process.exit(1);
}
const size = (path) => gzipSync(readFileSync(join(dist, path))).length;
const scripts = readdirSync(join(dist, 'assets')).filter((name) => name.endsWith('.js')).map((name) => `assets/${name}`);
const total = scripts.reduce((sum, path) => sum + size(path), 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(`size: entry ${kb(size(entry))} of ${kb(ENTRY_LIMIT)}; all scripts ${kb(total)} of ${kb(TOTAL_LIMIT)} (gzipped)`);
if (size(entry) > ENTRY_LIMIT || total > TOTAL_LIMIT) {
  console.error('size: over budget');
  process.exit(1);
}
