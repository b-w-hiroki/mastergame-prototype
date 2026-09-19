import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8081);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function resolveAsset(pathname) {
  const relativePath = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const candidate = join(distDir, relativePath);
  if (candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return join(distDir, 'index.html');
}

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${host}:${port}`).pathname;
  const filePath = resolveAsset(pathname);
  response.writeHead(200, {
    'Cache-Control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=3600',
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`MasterGame web: http://${host}:${port}`);
});
