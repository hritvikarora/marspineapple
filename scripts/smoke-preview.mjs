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
const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
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
  await release.filter({ hasText: 'bundle synthetic' }).waitFor({ timeout: 10000 });
  step(`release id: ${await release.textContent()}`);
  const synthetic = (await page.getByTestId('synthetic-badge').count()) > 0;
  const banner = await page.getByTestId('synthetic-production-warning').count();
  if (synthetic && banner !== 1) throw new Error('production build serves synthetic data but shows no warning banner');
  step(`synthetic production warning ${banner ? 'shown' : 'not needed'}`);
  await page.getByLabel('start preset').selectOption('syn-outpost');
  await page.getByLabel('destination preset').selectOption('syn-east-bench');
  await page.getByTestId('calculate').click();
  await page.getByTestId('route-status').filter({ hasText: 'Status: success' }).waitFor({ timeout: 10000 });
  const n = await page.getByRole('radio', { name: /feasible|aware/ }).count();
  step(`route success via real Web Worker, ${n} candidate(s)`);
  await page.getByLabel('destination preset').selectOption('syn-sealed-basin');
  await page.getByTestId('stale').waitFor();
  step('stale label after destination change');
  await page.getByTestId('calculate').click();
  await page.getByTestId('route-status').filter({ hasText: 'no-path' }).waitFor({ timeout: 10000 });
  step('no-path state for sealed basin');
  await page.getByLabel('destination preset').selectOption('syn-east-bench');
  await page.getByTestId('calculate').click();
  await page.getByTestId('route-status').filter({ hasText: 'Status: success' }).waitFor({ timeout: 10000 });
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
  await page.getByRole('radio', { name: /uncertainty-aware/ }).check();
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
