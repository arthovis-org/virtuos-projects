// Serves _site/ at the same address as GitHub Pages (http://127.0.0.1:4180/virtuos-projects/),
// so the built site can be checked locally before pushing.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../_site/', import.meta.url));
const base = (process.env.SITE_BASE ?? '/virtuos-projects/').replace(/\/?$/, '/');
const port = Number(process.env.PORT ?? 4180);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain', '.md': 'text/markdown',
};

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
  if (!path.startsWith(base)) {
    response.writeHead(302, { location: base }).end();
    return;
  }
  let file = normalize(join(site, path.slice(base.length)));
  if (!file.startsWith(normalize(site))) return void response.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith('/')) return void response.writeHead(301, { location: `${path}/` }).end();
    file = join(file, 'index.html');
  }
  if (!existsSync(file)) return void response.writeHead(404).end('Not found');
  response.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}${base}`));
