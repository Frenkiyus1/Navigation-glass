import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const port = Number(process.env.PORT || 8787);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.txt':'text/plain; charset=utf-8' };
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    if (!(await stat(target)).isFile()) throw new Error('Not found');
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', 'Permissions-Policy':'geolocation=(self), bluetooth=(self), screen-wake-lock=(self)' });
    response.end(await readFile(target));
  } catch { response.writeHead(404, { 'Content-Type':'text/plain' }).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Navigation Glass: http://localhost:${port}`));
