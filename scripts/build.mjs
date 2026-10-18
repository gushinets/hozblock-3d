import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteFiles } from '../site-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
if (relative(root, output) !== 'dist') throw new Error('Папка сборки должна находиться внутри проекта');
const assets = await Promise.all(siteFiles.map(async ([target, source]) => [target, await readFile(resolve(root, source))]));
const hash = createHash('sha256');
for (const [target, contents] of assets) hash.update(target).update(contents);
const version = hash.digest('hex').slice(0, 12);
await rm(output, { recursive: true, force: true });
for (const [target, contents] of assets) {
  const destination = resolve(output, target);
  await mkdir(dirname(destination), { recursive: true });
  let published = contents;
  if (target.endsWith('.js')) {
    published = contents.toString('utf8').replace(/(['"])(\.[^'"\s]+\.js)\1/g, (_, quote, path) => `${quote}${path}?v=${version}${quote}`);
  } else if (target === 'index.html') {
    published = contents.toString('utf8').replace(/(['"])(\.\/(?:styles\.css|app\.js))\1/g, (_, quote, path) => `${quote}${path}?v=${version}${quote}`);
  }
  await writeFile(destination, published);
}
console.log(`Статическая сборка: dist/ (${siteFiles.length} файлов)`);
