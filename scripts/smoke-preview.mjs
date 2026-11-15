#!/usr/bin/env node
/**
 * Headless browser smoke test against a RUNNING static server (e.g. `npm run preview`).
 * Uses playwright-core with a locally installed Chrome/Chromium (no browser download).
 *   node scripts/smoke-preview.mjs [url] [--screenshot out.png] [--no-webgl]
 * Env CHROME_PATH overrides the browser executable.
 */
/* global document */
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:4173/';
const shotIdx = args.indexOf('--screenshot');
const shot = shotIdx >= 0 ? args[shotIdx + 1] : null;
const candidates = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Chromium found; set CHROME_PATH.');
  process.exit(2);
}

const noWebGL = args.includes('--no-webgl');
const browser = await chromium.launch({ executablePath, headless: true, args: noWebGL ? ['--disable-webgl', '--disable-3d-apis'] : [] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const failed = [];
page.on('requestfailed', (r) => failed.push(r.url()));
page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));

const step = (s) => console.log(`  ✓ ${s}`);
try {
  await page.goto(url, { waitUntil: 'load' });
  const release = page.getByTestId('release-id');
  await release.filter({ hasText: /bundle \S+/ }).waitFor({ timeout: 15000 });
  await page.getByLabel('start preset').locator('option[value]:not([value=""])').first().waitFor({ state: 'attached', timeout: 30000 });
  step(`release id: ${await release.textContent()}`);
  const synthetic = (await page.getByTestId('synthetic-badge').count()) > 0;
  const banner = await page.getByTestId('synthetic-production-warning').count();
  if (synthetic && banner !== 1) throw new Error('production build serves synthetic data but shows no warning banner');
  if (!synthetic && banner !== 0) throw new Error('real-data build shows the synthetic warning banner');
  step(`${synthetic ? 'SYNTHETIC' : 'real'} bundle; synthetic production warning ${banner ? 'shown' : 'not shown'}`);
  const routeTimeout = 30000;
  // Synthetic fixture: fixed presets incl. the sealed basin. Real bundles: first POIs in the manifest.
  const pois = await page.getByLabel('start preset').locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  if (pois.length < 2) throw new Error(`bundle has ${pois.length} POI preset(s); need 2`);
  const [from, to, alt] = synthetic ? ['syn-outpost', 'syn-east-bench', 'syn-sealed-basin'] : [pois[0], pois[1], pois[2] ?? pois[0]];
  await page.getByLabel('start preset').selectOption(from);
  await page.getByLabel('destination preset').selectOption(to);
  let t0 = Date.now();
  await page.getByTestId('calculate').click();
  await page.getByTestId('route-status').filter({ hasText: 'Status: success' }).waitFor({ timeout: routeTimeout });
  const n = await page.getByRole('radio', { name: /feasible|aware/ }).count();
  step(`route ${from} -> ${to}: success via real Web Worker in ${Date.now() - t0} ms, ${n} candidate(s)`);
  await page.getByLabel('destination preset').selectOption(alt);
  await page.getByTestId('stale').waitFor();
  step('stale label after destination change');
  if (synthetic) {
    await page.getByTestId('calculate').click();
    await page.getByTestId('route-status').filter({ hasText: 'no-path' }).waitFor({ timeout: routeTimeout });
    step('no-path state for sealed basin');
  }
  await page.getByLabel('destination preset').selectOption(to);
  t0 = Date.now();
  await page.getByTestId('calculate').click();
  await page.getByTestId('route-status').filter({ hasText: 'Status: success' }).waitFor({ timeout: routeTimeout });
  step(`re-route success in ${Date.now() - t0} ms`);
  // Selection + hover sync across map / profile / briefing / 3D.
  const attrs = async () =>
    page.evaluate(() => {
      const q = (id) => document.querySelector(`[data-testid="${id}"]`);
      const a = (id, k) => q(id)?.getAttribute(k) ?? null;
      return {
        map: a('map-canvas', 'data-selected-candidate'), profile: a('profile', 'data-candidate-id'), briefing: a('briefing', 'data-candidate-id'),
        t3d: a('terrain-view', 'data-selected-candidate'), mapHover: a('map-canvas', 'data-hover-index'), briefingHover: a('briefing', 'data-hover-index'),
        t3dHover: a('terrain-view', 'data-hover-index'), fallback: a('terrain-fallback', 'data-kind'),
      };
    });
  await page.getByRole('radio', { name: /feasible|aware/ }).last().check();
  await page.getByLabel('Inspect position along route').fill('4');
  let a = await attrs();
  if (!(a.map === a.profile && a.profile === a.briefing && a.map && a.mapHover === '4' && a.briefingHover === '4'))
    throw new Error(`2D consumers disagree: ${JSON.stringify(a)}`);
  step(`map/profile/briefing agree on ${a.map}, hover index 4`);
  await page.getByLabel('3D').check();
  await page.waitForSelector('[data-testid="terrain-view"], [data-testid="terrain-fallback"]', { timeout: 10000 });
  a = await attrs();
  if (noWebGL && a.fallback !== 'webgl-unavailable') throw new Error(`expected webgl-unavailable fallback, got ${JSON.stringify(a)}`);
  if (a.fallback) {
    if (!(a.map === a.briefing)) throw new Error(`3D fallback map/briefing disagree: ${JSON.stringify(a)}`);
    step(`3D degraded gracefully (${a.fallback}); 2D map still shows ${a.map}`);
  } else {
    if (!(a.t3d === a.briefing && a.t3dHover === '4')) throw new Error(`3D disagrees: ${JSON.stringify(a)}`);
    step(`3D placeholder agrees on ${a.t3d}, hover index 4`);
  }
  await page.getByLabel('2D').check();
  if (shot) {
    await page.screenshot({ path: shot, fullPage: true });
    step(`screenshot ${shot}`);
  }
  if (errors.length || failed.length) throw new Error(`console errors: ${JSON.stringify(errors)} failed requests: ${JSON.stringify(failed)}`);
  step('no console errors or failed requests');
  console.log('SMOKE PASS');
} catch (e) {
  console.error('SMOKE FAIL:', e.message, { errors, failed });
  process.exitCode = 1;
} finally {
  await browser.close();
}
