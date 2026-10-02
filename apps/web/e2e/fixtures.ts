import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

export interface TestConfigOverrides {
  apiMode?: 'memory' | 'msw';
  latencyMs?: [number, number];
  failureRate?: number;
  simulation?: { enabled: boolean; intervalMs: [number, number] };
  disbursementApproval?: boolean;
}

/**
 * Serves a test-specific runtime config (low latency, simulation off) exactly the way a deployment
 * replaces config.json — the bundle under test is unchanged.
 */
export async function serveConfig(page: Page, overrides: TestConfigOverrides = {}) {
  await page.route('**/config.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        apiMode: overrides.apiMode ?? 'msw',
        apiBaseUrl: '/api',
        mock: {
          latencyMs: overrides.latencyMs ?? [20, 60],
          failureRate: overrides.failureRate ?? 0,
          seed: 20260930,
          simulation: overrides.simulation ?? { enabled: false, intervalMs: [6000, 14000] },
        },
        features: { disbursementApproval: overrides.disbursementApproval ?? true },
      }),
    }),
  );
}

/** Calls a dev endpoint of the in-page mock API (served by the service worker of this page). */
export async function devApi(page: Page, path: string, body: unknown) {
  const status = await page.evaluate(
    async ({ path, body }) => {
      const res = await fetch(`/api/__dev/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.status;
    },
    { path, body },
  );
  expect(status).toBeLessThan(300);
}

export async function openApp(page: Page, path = '/', overrides: TestConfigOverrides = {}) {
  await serveConfig(page, overrides);
  await page.goto(path);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

/** Fails on serious or critical WCAG 2.1 AA violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
}

export const test = base;
export { expect };
