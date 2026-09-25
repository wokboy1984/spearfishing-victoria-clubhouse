import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const reserved = new Set(['admin', 'assets', 'data', 'members', 'safety', 'species', 'supabase']);

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const segments = pathname.split('/').filter(Boolean);
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  let file = normalize(join(root, relative));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if ((!existsSync(file) || !statSync(file).isFile()) && segments.length === 1 && !reserved.has(segments[0].toLowerCase())) {
    file = join(root, 'members', 'index.html');
  }
  if (!file.startsWith(normalize(root)) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': `${mime[extname(file).toLowerCase()] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`Spearfishing Victoria running at http://127.0.0.1:${port}/`));
