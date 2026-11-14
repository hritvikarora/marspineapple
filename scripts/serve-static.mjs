#!/usr/bin/env node
/**
 * Minimal static server that mounts a build under a URL prefix, like GitHub Pages:
 *   node scripts/serve-static.mjs <dir> <port> [/marspineapple/]
 * No dependencies; used by the e2e suite and handy for offline demos.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const [dir = 'dist', port = '4180', prefixArg = '/marspineapple/'] = process.argv.slice(2);
const root = resolve(dir);
const prefix = prefixArg.endsWith('/') ? prefixArg : `${prefixArg}/`;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8',
  '.f32': 'application/octet-stream', '.u8': 'application/octet-stream',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error(`${root}/index.html not found — build first.`);
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === prefix.slice(0, -1)) {
    res.writeHead(301, { location: prefix }).end();
    return;
  }
  if (!url.pathname.startsWith(prefix)) {
    res.writeHead(404).end('outside prefix');
    return;
  }
  const rel = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
  const file = normalize(join(root, rel));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(Number(port), () => console.log(`serving ${root} at http://localhost:${port}${prefix}`));
