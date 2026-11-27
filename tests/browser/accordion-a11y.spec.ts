import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Accordion accessibility: APG Accordion roles and states, an ARIA snapshot, and axe
// in light, dark and RTL. The file name matches the `test:a11y` filter.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await run.run({ include: [['.salmon-accordion']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

test.describe('Accordion accessibility', () => {
  test('ARIA snapshot: headings with expandable buttons and labelled regions', async ({ page }) => {
    await page.goto(`${DEV_URL}accordion.html`);
    await expect(page.locator('#single')).toMatchAriaSnapshot(`
      - heading "Single one" [level=3]:
        - button "Single one" [expanded] [disabled]
      - region "Single one": One
      - heading "Single two" [level=3]:
        - button "Single two"
    `);
    await expect(page.locator('#main .salmon-accordion-trigger').nth(2)).toHaveAttribute('aria-disabled', 'true');
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations with panels open and closed (${variant || 'light'})`, async ({ page }) => {
      await page.goto(`${DEV_URL}accordion.html${variant ? `?${variant}` : ''}`);
      await page.getByRole('button', { name: 'Returns', exact: true }).click();
      await page.getByRole('button', { name: 'Inner one', exact: true }).click();
      expect(await axe(page)).toEqual([]);
    });
  }
});
