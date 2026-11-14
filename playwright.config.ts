import { defineConfig } from '@playwright/test';

/**
 * E2E against BUILT apps served under /marspineapple/ (like GitHub Pages):
 *  - release   : dist/          — the exact production artifact (real HiRISE bundle, no test hooks)
 *  - synthetic : dist-e2e-syn/  — production build pinned to the synthetic fixture (VITE_BUNDLE=synthetic-v0)
 *                for the deterministic journey + golden export
 *  - variant   : dist-e2e/      — synthetic fixture + public test config (VITE_TILES=trek,
 *                VITE_ROUTE_TIMEOUT_MS=1500) so tile and timeout failure paths are reachable quickly.
 * Failures are injected from the test side with page.route (manifests, rasters, worker script,
 * 3D chunk, tiles) — the app ships no test-only code. Uses the installed Google Chrome
 * (channel 'chrome'; preinstalled on GitHub ubuntu runners), so no browser download/cache.
 * Build first: `npm run build && npm run build:e2e`.
 */
const PREFIX = '/marspineapple/';
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    channel: process.env.PW_CHANNEL ?? 'chrome',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'release', testMatch: /release\.spec\.ts/, use: { baseURL: `http://localhost:4280${PREFIX}` } },
    { name: 'synthetic', testMatch: /journey\.spec\.ts/, use: { baseURL: `http://localhost:4282${PREFIX}` } },
    { name: 'variant', testMatch: /failures\.spec\.ts/, use: { baseURL: `http://localhost:4281${PREFIX}` } },
  ],
  webServer: [
    { command: `node scripts/serve-static.mjs dist 4280 ${PREFIX}`, url: `http://localhost:4280${PREFIX}`, reuseExistingServer: !process.env.CI },
    { command: `node scripts/serve-static.mjs dist-e2e 4281 ${PREFIX}`, url: `http://localhost:4281${PREFIX}`, reuseExistingServer: !process.env.CI },
    { command: `node scripts/serve-static.mjs dist-e2e-syn 4282 ${PREFIX}`, url: `http://localhost:4282${PREFIX}`, reuseExistingServer: !process.env.CI },
  ],
});
