#!/usr/bin/env node
/**
 * Headless browser smoke test against a RUNNING static server (e.g. `npm run preview`).
 * Uses playwright-core with a locally installed Chrome/Chromium (no browser download).
 *   node scripts/smoke-preview.mjs [url] [--screenshot out.png]
 * Env CHROME_PATH overrides the browser executable.
 */
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

const browser = await chromium.launch({ executablePath, headless: true });
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
