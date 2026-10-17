import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', output), 'utf8');
const imports = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports;

test('Сборка загружает весь граф модулей в подпапке GitHub Pages', async () => {
  for (const name of ['hozblock-3d', 'another-repository']) {
    const base = new URL(`https://example.test/${name}/`);
    function assetUrl(specifier, parent = base) {
      let target = specifier;
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        const prefix = Object.keys(imports).find(key => key.endsWith('/') && specifier.startsWith(key));
        target = imports[specifier] ?? (prefix && imports[prefix] + specifier.slice(prefix.length));
        assert.ok(target, `Не найден импорт ${specifier}`);
        parent = base;
      }
      const url = new URL(target, parent);
      assert.equal(url.origin, base.origin, 'Ресурсы не должны зависеть от внешнего CDN');
      assert.ok(url.pathname.startsWith(base.pathname), `${url} выходит за подпапку проекта`);
      return url;
    }
    const style = assetUrl(html.match(/rel="stylesheet" href="([^"]+)"/)[1]);
    const entry = assetUrl(html.match(/import\('([^']+)'\)/)[1]);
    assert.ok((await stat(new URL(style.pathname.slice(base.pathname.length), output))).isFile());
    const queue = [entry], seen = new Set();
    while (queue.length) {
      const url = queue.pop();
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      const code = await readFile(new URL(url.pathname.slice(base.pathname.length), output), 'utf8');
      for (const match of code.matchAll(/(?:^|\n)(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
        queue.push(assetUrl(match[1], url));
      }
    }
    assert.ok(seen.size >= 7, 'Нужно проверить модель, Three.js и оба используемых дополнения');
  }
});

test('В сборке нет исходных фотографий и локальных файлов; лицензия Three.js сохранена', async () => {
  const files = await readdir(output, { recursive: true });
  assert.ok(files.every(path => !/(^|[\\/])(photo_[^/\\]*|\.qa|node_modules|\.git)([\\/]|$)/.test(path)));
  const license = await readFile(new URL('vendor/three/LICENSE', output), 'utf8');
  assert.match(license, /Permission is hereby granted/);
  assert.ok(fileURLToPath(output).endsWith('dist' + (process.platform === 'win32' ? '\\' : '/')));
});
