import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { siteFiles } from './site-files.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const preview = process.argv.includes('--preview');
const mount = preview ? '/preview' : '';
const files = new Map(siteFiles.map(([target, source]) => [mount + '/' + target,
  preview ? resolve(root, 'dist', target) : resolve(root, source)]));
files.set(mount + '/', files.get(mount + '/index.html'));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let path;
  try {
    path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (preview && path === mount) { response.writeHead(302, { Location: mount + '/' }).end(); return; }
  const file = files.get(path);
  if (!file) { response.writeHead(404).end('Not found'); return; }
  try {
    const contents = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('File unavailable');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Port 4173 is in use. Set PORT to another available port.' : error.message);
  process.exitCode = 1;
});
server.listen(Number(process.env.PORT || (preview ? 4174 : 4173)), '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}${mount}/`;
  console.log(`Хозблок 3D: ${url}`);
  if (process.argv.includes('--open') && process.platform === 'win32') {
    const browser = spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true });
    browser.on('error', () => console.log('Open the URL above in a browser.'));
    browser.unref();
  }
});
