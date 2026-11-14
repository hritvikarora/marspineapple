import { test as base, expect, type Page, type Route } from '@playwright/test';

/** Console errors must match an explicit per-test allowlist; anything else fails the test. */
export const test = base.extend<{ consoleGuard: { allow: (re: RegExp) => void } }>({
  consoleGuard: [
    async ({ page }, use) => {
      const allowed: RegExp[] = [];
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      await use({ allow: (re) => allowed.push(re) });
      const unexpected = errors.filter((e) => !allowed.some((re) => re.test(e)));
      expect(unexpected, 'unexpected console errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const ids = {
  release: 'release-id',
  status: 'route-status',
  message: 'route-message',
  calculate: 'calculate',
  start: 'start-preset',
  destination: 'destination-preset',
  map: 'map-canvas',
  profile: 'profile',
  briefing: 'briefing',
  terrain: 'terrain-view',
  fallback: 'terrain-fallback',
  bundleError: 'bundle-error',
  exportJson: 'export-json',
  imagery: 'imagery-status',
  assets: 'optional-assets-status',
  stale: 'stale',
  prodWarning: 'synthetic-production-warning',
} as const;

export async function openApp(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId(ids.release)).toContainText('bundle synthetic-v0.1.0');
}

export async function calculate(page: Page, destination = 'syn-east-bench', start = 'syn-outpost') {
  await page.getByTestId(ids.start).selectOption(start);
  await page.getByTestId(ids.destination).selectOption(destination);
  await page.getByTestId(ids.calculate).click();
}

export const WORKER_GLOB = '**/assets/routing.worker-*.js';

/** A stand-in worker script: accepts the bundle, then misbehaves on route requests. */
export function stubWorker(onRoute: 'never-respond' | 'crash') {
  const body = `
    self.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'load-bundle') self.postMessage({ type: 'bundle-loaded', bundleVersion: m.bundle.bundleVersion });
      else if (m.type === 'route') { ${onRoute === 'crash' ? "throw new Error('e2e: simulated worker crash');" : '/* never respond */'} }
    };`;
  return (route: Route) => route.fulfill({ contentType: 'text/javascript', body });
}

/** Wraps the REAL worker so each route request is answered `delayMs` late. */
export function delayedWorker(delayMs: number) {
  return async (route: Route) => {
    const res = await route.fetch();
    const original = await res.text();
    const prefix = `
      { let h = null;
        Object.defineProperty(self, 'onmessage', {
          configurable: true,
          get() { return h; },
          set(fn) { h = fn; self.addEventListener('message', (e) => (e.data && e.data.type === 'route' ? setTimeout(() => h(e), ${delayMs}) : h(e))); },
        }); }
    `;
    await route.fulfill({ response: res, body: prefix + original });
  };
}

/** Records every value route-status[data-status] takes (to prove stale results never surface). */
export async function recordStatuses(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __statuses: string[] };
    w.__statuses = [];
    const el = document.querySelector('[data-testid="route-status"]')!;
    new MutationObserver(() => w.__statuses.push(el.getAttribute('data-status') ?? '')).observe(el, { attributes: true, subtree: true, childList: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __statuses: string[] }).__statuses);
}
