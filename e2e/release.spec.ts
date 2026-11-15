/**
 * Release artifact (dist/) = what GitHub Pages serves: the REAL Jezero HiRISE bundle.
 * Asserts user-visible behaviour on real data; routes between the science stops P3/P4/P5.
 */
import { readFile } from 'node:fs/promises';
import { expect, ids, test } from './fixtures';

const BUNDLE = 'jezero-west-hirise-v0.1.0';
const ROUTE_BUDGET_MS = 8000;

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId(ids.release)).toHaveText(`app 0.1.0 · bundle ${BUNDLE} · model eva-astar-1.0.0`, { timeout: 20000 });
});

test('real bundle: no synthetic badge or production warning, strict mode disabled, texture available, no external requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => !r.url().startsWith('http://localhost') && external.push(r.url()));
  await expect(page.getByTestId('synthetic-badge')).toHaveCount(0);
  await expect(page.getByTestId(ids.prodWarning)).toHaveCount(0);
  await expect(page.getByLabel(/Strict quality/)).toBeDisabled();
  await expect(page.getByTestId(ids.assets)).toHaveText('Optional display assets: 1/1 available.');
  await expect(page.getByTestId(ids.start).locator('option')).toHaveText(['— choose —', /^Delta front – Skinner Ridge/, /^Delta front base – Enchanted Lake/, /^Three Forks Sample Depot/]);
  await expect(page.getByTestId(ids.map)).toBeVisible();
  const box = await page.getByTestId(ids.map).boundingBox();
  expect(box!.width).toBeGreaterThan(100); // 1000x1000 cells must not produce an unusable/oversized canvas
  expect(external).toEqual([]);
});

for (const [a, z] of [['poi-p3', 'poi-p4'], ['poi-p4', 'poi-p5'], ['poi-p3', 'poi-p5']] as const) {
  test(`route ${a} -> ${z} on HiRISE within ${ROUTE_BUDGET_MS} ms; quality reported as 100 % unknown`, async ({ page }) => {
    await page.getByTestId(ids.start).selectOption(a);
    await page.getByTestId(ids.destination).selectOption(z);
    const t0 = Date.now();
    await page.getByTestId(ids.calculate).click();
    await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'success', { timeout: 20000 });
    const ms = Date.now() - t0;
    test.info().annotations.push({ type: 'route-ms', description: `${a}->${z}: ${ms} ms` });
    console.log(`[e2e real] ${a}->${z}: ${ms} ms`);
    expect(ms).toBeLessThan(ROUTE_BUDGET_MS);
    await expect(page.getByTestId('candidate-c0')).toBeVisible();
    await expect(page.getByTestId(ids.briefing)).toContainText(/Unknown quality: \d+ m \(100% of horizontal distance\)/);
    await expect(page.getByTestId(ids.briefing)).toContainText('low quality: 0 m (0%)');
  });
}

test('export on real data: file name and content carry the real bundle, no local paths', async ({ page }) => {
  await page.getByTestId(ids.start).selectOption('poi-p3');
  await page.getByTestId(ids.destination).selectOption('poi-p5');
  await page.getByTestId(ids.calculate).click();
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'success', { timeout: 20000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(ids.exportJson).click()]);
  expect(download.suggestedFilename()).toBe(`mars-pathfinder_${BUNDLE}_eva-astar-1.0.0_c0.json`);
  const text = await readFile((await download.path())!, 'utf8');
  const parsed = JSON.parse(text);
  expect(parsed.region).toMatchObject({ bundleVersion: BUNDLE, synthetic: false });
  expect(parsed.request).toMatchObject({ startPoiId: 'poi-p3', destinationPoiId: 'poi-p5', strictQuality: false });
  expect(text).not.toMatch(/file:\/\/|\/home\/|\/workspace\/|\/Users\/|localhost/);
});
