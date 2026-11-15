/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.bin': 'application/octet-stream',
};

/**
 * In `npm run dev`, `/marswalk-vr/*` assets (e.g. `mars_globe.jpg` and built `dist/marswalk-vr/index.html`)
 * do not live under `public/`. Serve them from `dist/marswalk-vr/` or `marswalk/app/public/` when requested.
 */
function marswalkVrDevPlugin(): Plugin {
  const roots = [resolve('dist/marswalk-vr'), resolve('marswalk/app/public')];
  return {
    name: 'marswalk-vr-dev-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? '/';
        const pathname = decodeURIComponent(rawUrl.split('?')[0] ?? '/');
        const match = pathname.match(/(?:^|\/)marswalk-vr(?:\/(.*))?$/);
        if (!match) {
          next();
          return;
        }
        const rel = match[1] || 'index.html';
        for (const root of roots) {
          const candidate = normalize(join(root, rel));
          if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()) {
            res.setHeader('Content-Type', MIME_TYPES[extname(candidate)] ?? 'application/octet-stream');
            createReadStream(candidate).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

// base './' keeps every asset, the worker chunk and public/bundles relative, so the
// build works under a sub-path (GitHub Pages project URL) and from `vite preview`.
export default defineConfig({
  base: './',
  plugins: [react(), marswalkVrDevPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
