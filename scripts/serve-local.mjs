import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2]) || 4180;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};

createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const resolved = normalize(join(root, relative));
    if (!resolved.startsWith(normalize(root))) throw new Error('invalid path');
    const file = statSync(resolved).isDirectory() ? join(resolved, 'index.html') : resolved;
    response.writeHead(200, {'Content-Type':types[extname(file).toLowerCase()] || 'application/octet-stream','Cache-Control':'no-store'});
    response.end(readFileSync(file));
  } catch (error) {
    response.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}/`));
