/**
 * Release-artifact journeys (project "release": the exact production dist/ under /marspineapple/).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculate, delayedWorker, expect, ids, openApp, recordStatuses, test, WORKER_GLOB } from './fixtures';

const GOLDEN = fileURLToPath(new URL('./golden/export-outpost-eastbench-c2.json', import.meta.url));

test('happy journey: preset -> route -> each candidate -> 3D -> briefing -> golden export', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId(ids.prodWarning)).toContainText('serving the SYNTHETIC fixture');
  await expect(page.getByTestId(ids.status)).toHaveText('No route calculated yet.');

  await calculate(page);
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'success');
  await expect(page.getByTestId(ids.status)).toContainText('Status: success');
  const candidates = page.locator('[data-testid^="candidate-"]');
  await expect(candidates).toHaveCount(3);

  for (const id of ['c0', 'c1', 'c2']) {
    await page.getByTestId(`candidate-${id}`).check();
    await expect(page.getByTestId(ids.map)).toHaveAttribute('data-selected-candidate', id);
    await expect(page.getByTestId(ids.profile)).toHaveAttribute('data-candidate-id', id);
    await expect(page.getByTestId(ids.briefing)).toContainText(`Selected route ${id}`);
  }
  // c2 = uncertainty-aware: longer, but no unknown-quality exposure.
  await expect(page.getByTestId(ids.briefing)).toContainText('(uncertainty-aware)');
  await expect(page.getByTestId(ids.briefing)).toContainText('Horizontal distance: 207 m');
  await expect(page.getByTestId(ids.briefing)).toContainText('Unknown quality: 0 m (0% of horizontal distance)');

  // Shared hover sample reaches the briefing; 3D placeholder receives the same selection + sample.
  await page.getByLabel('Inspect position along route').fill('4');
  await expect(page.getByTestId('briefing-hover')).toContainText('Inspecting 48 m along route');
  await page.getByTestId('view-3d').check();
  const terrain = page.getByTestId(ids.terrain);
  await expect(terrain).toHaveAttribute('data-selected-candidate', 'c2');
  await expect(terrain).toHaveAttribute('data-hover-index', '4');
  await expect(terrain).not.toBeEmpty(); // the real 3D view (or its 2D fallback) replaced the placeholder panel
  await page.getByTestId('view-2d').check();
  await expect(page.getByTestId(ids.map)).toHaveAttribute('data-selected-candidate', 'c2');

  // Printable briefing: controls hidden, briefing visible.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId(ids.briefing)).toBeVisible();
  await expect(page.getByTestId(ids.calculate)).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  // Export -> byte-identical to the committed golden file.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(ids.exportJson).click()]);
  expect(download.suggestedFilename()).toBe('mars-pathfinder_synthetic-v0.1.0_eva-astar-1.0.0_c2.json');
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).not.toMatch(/\/home\/|\/workspace\/|\/Users\/|file:|https?:\/\/|[A-Za-z]:\\\\/);
  if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, text);
  expect(text).toBe(readFileSync(GOLDEN, 'utf8'));
  expect(JSON.parse(text)).toMatchObject({ selectedCandidateId: 'c2', release: { bundleVersion: 'synthetic-v0.1.0' } });
});

test('no-path: sealed basin is an informative result, not an error', async ({ page }) => {
  await openApp(page);
  await calculate(page, 'syn-sealed-basin');
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'no-path');
  await expect(page.getByTestId(ids.status)).toContainText('Status: no-path');
  await expect(page.getByTestId(ids.message)).toHaveText('Destination is not connected to the start under the current terrain limits.');
  await expect(page.locator('[data-testid^="candidate-"]')).toHaveCount(0);
  await expect(page.getByTestId(ids.exportJson)).toBeDisabled();
  await expect(page.getByTestId(ids.briefing)).toContainText('No route selected.');
});

test('rapid destination switching: only the last request result is ever shown', async ({ page }) => {
  await page.route(WORKER_GLOB, delayedWorker(600));
  await openApp(page);
  const statuses = await recordStatuses(page);
  await page.getByTestId(ids.start).selectOption('syn-outpost');
  for (const dest of ['syn-east-bench', 'syn-unknown-knoll', 'syn-sealed-basin']) {
    await page.getByTestId(ids.destination).selectOption(dest);
    await page.getByTestId(ids.calculate).click();
    await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'running');
  }
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'no-path');
  await page.waitForTimeout(1500); // longer than the worker delay: any late result would have landed by now
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'no-path');
  await expect(page.getByTestId(ids.message)).toContainText('not connected');
  const seen = await statuses();
  expect(seen).not.toContain('success'); // superseded east-bench / knoll results never surfaced
  expect(seen.at(-1)).toBe('no-path');
});

test('production build pinned to synthetic: release id, synthetic banner, tiles off, no external requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => !r.url().startsWith('http://localhost') && external.push(r.url()));
  await openApp(page);
  await expect(page.getByTestId(ids.release)).toHaveText('app 0.1.0 · bundle synthetic-v0.1.0 · model eva-astar-1.0.0');
  await expect(page.getByTestId('synthetic-badge')).toHaveText('SYNTHETIC DATA');
  await expect(page.getByTestId(ids.imagery)).toHaveAttribute('data-status', 'disabled');
  await expect(page.getByTestId(ids.assets)).toHaveText('Optional display assets: 1/1 available.');
  expect(external).toEqual([]);
});
