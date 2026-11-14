/**
 * Failure modes (project "variant": dist-e2e/, built with VITE_TILES=trek and
 * VITE_ROUTE_TIMEOUT_MS=1500). Every failure is injected from the test via page.route.
 */
import type { Page } from '@playwright/test';
import { calculate, expect, ids, openApp, stubWorker, test, WORKER_GLOB } from './fixtures';

const TREK = /trek\.nasa\.gov/;
const MANIFEST = '**/bundles/synthetic-v0/manifest.json';
// 1x1 JPEG so the default tile probe succeeds offline and deterministically.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

test.beforeEach(async ({ page }) => {
  await page.route(TREK, (r) => r.fulfill({ contentType: 'image/jpeg', body: JPEG }));
});

async function mutateManifest(page: Page, mutate: (m: Record<string, any>) => void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.route(MANIFEST, async (route) => {
    const res = await route.fetch();
    const m = await res.json();
    mutate(m);
    await route.fulfill({ response: res, json: m });
  });
}

async function expectBundleError(page: Page, stage: string, detail: RegExp) {
  await page.goto('./');
  const err = page.getByTestId(ids.bundleError);
  await expect(err).toContainText(`Region data failed at stage ${stage}`);
  await expect(err).toContainText(detail);
  await expect(page.getByTestId(ids.map)).toHaveCount(0); // no silent empty map
}

test('invalid manifest (schema) -> stage-specific error, no map', async ({ page }) => {
  await mutateManifest(page, (m) => delete m.layers.slope);
  await expectBundleError(page, 'schema', /layers\.slope missing/);
});

test('unsupported manifest schema version -> version error', async ({ page }) => {
  await mutateManifest(page, (m) => (m.schemaVersion = '2.0'));
  await expectBundleError(page, 'version', /schemaVersion 2\.0 unsupported/);
});

test('raster byte-length mismatch -> byte-length error naming the layer', async ({ page }) => {
  await mutateManifest(page, (m) => (m.layers.quality.byteLength = 999));
  await expectBundleError(page, 'byte-length', /\[byte-length:quality\] got 240 B, manifest says 999 B/);
});

test('missing raster -> fetch-raster error naming the layer', async ({ page, consoleGuard }) => {
  consoleGuard.allow(/Failed to load resource: .*404/);
  await page.route('**/bundles/synthetic-v0/elevation.f32', (r) => r.fulfill({ status: 404, body: 'gone' }));
  await expectBundleError(page, 'fetch-raster', /\[fetch-raster:elevation\] HTTP 404/);
});

test('worker timeout -> timeout state (not "no path"), app recovers', async ({ page }) => {
  // Only the first worker instance is broken; the client's automatic restart after the timeout
  // fetches the real worker again.
  await page.route(WORKER_GLOB, stubWorker('never-respond'), { times: 1 });
  await openApp(page);
  await calculate(page);
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'running');
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'timeout', { timeout: 5000 });
  await expect(page.getByTestId(ids.message)).toHaveText('Route calculation exceeded the time limit. This is not proof that no path exists.');
  await expect(page.getByTestId(ids.calculate)).toBeEnabled();
  // Next attempt succeeds on the restarted (real) worker.
  await page.getByTestId(ids.calculate).click();
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'success');
});

test('worker crash -> data-error state, app recovers with a fresh worker', async ({ page, consoleGuard }) => {
  consoleGuard.allow(/e2e: simulated worker crash/);
  await page.route(WORKER_GLOB, stubWorker('crash'), { times: 1 });
  await openApp(page);
  await calculate(page);
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'data-error');
  await expect(page.getByTestId(ids.message)).toContainText('e2e: simulated worker crash');
  await page.getByTestId(ids.calculate).click(); // a fresh worker is started for the next request
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'success');
});

test('missing optional texture -> reported, routing unaffected', async ({ page, consoleGuard }) => {
  consoleGuard.allow(/Failed to load resource: .*404/);
  await page.route('**/bundles/synthetic-v0/texture.svg', (r) => r.fulfill({ status: 404, body: '' }));
  await openApp(page);
  await expect(page.getByTestId(ids.assets)).toHaveText(
    'Optional texture "synthetic-texture" unavailable (missing: HTTP 404). Terrain data and routing are unaffected.',
  );
  await calculate(page);
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'success');
});

test('3D chunk fails to load -> 2D fallback with accurate message, route kept', async ({ page, consoleGuard }) => {
  consoleGuard.allow(/Failed to load resource|TerrainView|dynamically imported module/);
  await page.route('**/assets/TerrainView-*.js', (r) => r.abort('failed'));
  await openApp(page);
  await calculate(page);
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'success');
  await page.getByTestId('view-3d').check();
  const fb = page.getByTestId(ids.fallback);
  await expect(fb).toHaveAttribute('data-kind', 'load-error');
  await expect(fb).toContainText('3D view unavailable: the 3D module could not be loaded');
  await expect(fb.getByTestId(ids.map)).toHaveAttribute('data-selected-candidate', 'c0');
  await expect(page.getByTestId(ids.briefing)).toContainText('Selected route c0');
  await expect(page.getByRole('button', { name: 'Retry 3D' })).toBeVisible();
});

test('no WebGL -> 3D degrades to 2D with an explanation, no retry offered', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    };
  });
  await openApp(page);
  await calculate(page);
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'success');
  await page.getByTestId('view-3d').check();
  const fb = page.getByTestId(ids.fallback);
  await expect(fb).toHaveAttribute('data-kind', 'webgl-unavailable');
  await expect(fb).toContainText('3D view unavailable: WebGL is not available in this browser');
  await expect(page.getByRole('button', { name: 'Retry 3D' })).toHaveCount(0);
  await expect(fb.getByTestId(ids.map)).toBeVisible();
});

test('tiles: enabled tile probe succeeds (mocked tile)', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId(ids.imagery)).toHaveAttribute('data-status', 'ok');
  await expect(page.getByTestId(ids.imagery)).toContainText('Context imagery: available');
});

test('tiles offline -> "unavailable (offline)" and routing still works', async ({ page, consoleGuard }) => {
  consoleGuard.allow(/Failed to load resource: net::ERR_INTERNET_DISCONNECTED/);
  await page.unroute(TREK);
  await page.route(TREK, (r) => r.abort('internetdisconnected'));
  await openApp(page);
  await calculate(page);
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'success');
  await expect(page.getByTestId(ids.imagery)).toHaveAttribute('data-status', 'offline');
  await expect(page.getByTestId(ids.imagery)).toContainText('Context imagery unavailable (offline: Network error');
  await expect(page.getByTestId(ids.imagery)).toContainText('Routing and terrain data are unaffected.');
});

test('tiles hanging -> times out after 4 s while a route completes meanwhile', async ({ page }) => {
  await page.unroute(TREK);
  await page.route(TREK, () => undefined); // never answered
  await openApp(page);
  await expect(page.getByTestId(ids.imagery)).toHaveAttribute('data-status', 'pending');
  await calculate(page);
  await expect(page.getByTestId(ids.status)).toHaveAttribute('data-status', 'success');
  await expect(page.getByTestId(ids.imagery)).toHaveAttribute('data-status', 'timeout', { timeout: 7000 });
  await expect(page.getByTestId(ids.imagery)).toContainText('No response within 4000 ms');
});
