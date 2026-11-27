import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Gauge, Barcode and QRCode accessibility: ARIA snapshots and axe in light, dark and RTL. The file
// name matches the `test:a11y` filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run(ctx: Element): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document.querySelector('main')!);
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

test.describe('Gauge and barcode accessibility', () => {
  for (const query of ['', '?scheme=dark', '?dir=rtl']) {
    test(`axe is clean ${query || 'in light'}`, async ({ page }) => {
      await page.goto(`${DEV_URL}gauges.html${query}`);
      await page.waitForSelector('section[data-case="qr"] svg');
      expect(await axe(page)).toEqual([]);
    });
  }

  test('ARIA snapshot of a gauge figure and of the barcodes', async ({ page }) => {
    await page.goto(`${DEV_URL}gauges.html`);
    await page.waitForSelector('section[data-case="qr"] svg');
    await expect(page.locator('section[data-case="controlled"] figure')).toMatchAriaSnapshot(`
      - figure "Volume":
        - text: Volume
        - slider "Volume"
        - paragraph: "Volume, 0 to 100. Volume: 30."
        - table "Volume":
          - caption: Volume
          - rowgroup:
            - row "Item Value":
              - columnheader "Item"
              - columnheader "Value"
          - rowgroup:
            - row "Volume 30":
              - rowheader "Volume"
              - cell "30"
            - row "Range Loud 80–100":
              - rowheader "Range Loud"
              - cell "80–100"
    `);
    await expect(page.locator('section[data-case="barcode"]')).toMatchAriaSnapshot(`
      - heading "Barcodes" [level=2]
      - img "SALMON-0001"
      - img "590123412345"
      - img "1540014128876"
      - img "Salmon UI"
      - img /Invalid barcode. EAN-13 is numeric/
    `);
  });
});
