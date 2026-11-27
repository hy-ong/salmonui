import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Stepper accessibility: an ordered list with aria-current="step", announced statuses, an
// ARIA snapshot, and axe in light, dark and RTL. The file name matches the
// `test:a11y` filter.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await run.run({ include: [['.salmon-stepper']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

test.describe('Stepper accessibility', () => {
  test('ARIA snapshot: a list of step buttons; completed and invalid steps are announced', async ({ page }) => {
    await page.goto(`${DEV_URL}stepper.html`);
    await page.locator('#main > li').nth(1).locator('button').click();
    await expect(page.locator('#main')).toMatchAriaSnapshot(`
      - list "Checkout":
        - listitem:
          - button "Account Sign in Completed"
        - listitem:
          - button "Billing Optional"
        - listitem:
          - button "Disabled" [disabled]
        - listitem:
          - button "Shipping Error"
        - listitem:
          - button "Vetoed"
        - listitem:
          - button "Confirm"
    `);
    await expect(page.locator('#main > li').nth(1)).toHaveAttribute('aria-current', 'step');
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations (${variant || 'light'})`, async ({ page }) => {
      await page.goto(`${DEV_URL}stepper.html${variant ? `?${variant}` : ''}`);
      await page.locator('#main > li').nth(1).locator('button').click();
      expect(await axe(page)).toEqual([]);
    });
  }
});
