import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteFiles } from '../site-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
if (relative(root, output) !== 'dist') throw new Error('Папка сборки должна находиться внутри проекта');
await rm(output, { recursive: true, force: true });
for (const [target, source] of siteFiles) {
  const destination = resolve(output, target);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, source), destination);
}
console.log(`Статическая сборка: dist/ (${siteFiles.length} файлов)`);
