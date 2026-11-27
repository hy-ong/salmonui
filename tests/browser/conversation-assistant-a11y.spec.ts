import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Conversation assistant variant accessibility: APG Feed with prompt and response articles, aria-busy on the
// streaming response, the polite announcement of a completed response, APG
// Toolbar items with toggle feedback buttons, a reachable Stop button, the
// reasoning disclosure, ARIA snapshots and axe in light, dark and RTL. The
// file name matches the `test:a11y` filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}assistant.html${query ? `?${query}` : ''}`);
  await expect(page.locator('.salmon-conversation[data-variant="assistant"]')).toBeVisible();
}

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message' });

test.describe('Conversation assistant accessibility', () => {
  test('streaming response is aria-busy, Stop is reachable, the finished response is announced once', async ({ page }) => {
    await open(page);
    await composer(page).fill('slow stream:30');
    await composer(page).press('Enter');
    const busy = page.locator('article[aria-busy="true"]');
    await expect(busy).toHaveCount(1);
    await expect(composer(page)).toBeFocused();
    // Shift+Tab from the composer reaches the toolbar before it; Tab reaches Stop.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Stop' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(busy).toHaveCount(0);
    await expect(composer(page)).toBeFocused();
    await composer(page).fill('stream:2');
    await composer(page).press('Enter');
    const live = page.locator('.salmon-conversation > [role="status"]');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toHaveText(/^Helper: \*\*w0\*\* w1 $/);
  });

  test('ARIA snapshot of a prompt and a response with parts, alternatives and toolbars', async ({ page }) => {
    await open(page, 'history');
    await composer(page).fill('parts stream:1');
    await composer(page).press('Enter');
    await expect(page.locator('details[data-tool="weather"] summary')).toHaveText('weather: done');
    await expect(page.locator('article[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByRole('feed', { name: 'Messages' })).toMatchAriaSnapshot(`
      - feed "Messages":
        - article "Ada 9:00 AM":
          - text: Ada
          - time: 9:00 AM
          - text: Hello <b>there</b>
          - toolbar "Message actions":
            - button "Edit"
            - button "Copy"
        - article "Helper 9:00 AM":
          - text: Helper
          - time: 9:00 AM
          - text: Second answer
          - group "2 of 2":
            - button "Previous response"
            - button "Next response" [disabled]
          - toolbar "Message actions":
            - button "Copy"
            - button "Regenerate"
            - button "Helpful" [pressed=false]
            - button "Not helpful" [pressed=false]
        - article:
          - text: Ada
          - time
          - text: parts stream:1
          - toolbar "Message actions":
            - button "Edit"
            - button "Copy"
        - article:
          - text: Helper
          - time
          - group:
            - text: Reasoning
          - group:
            - text: "weather: done"
          - text: "**w0**"
          - toolbar "Message actions":
            - button "Copy"
            - button "Regenerate"
            - button "Helpful" [pressed=false]
            - button "Not helpful" [pressed=false]
    `);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations (${variant || 'light'})`, async ({ page }) => {
      await open(page, `history${variant ? `&${variant}` : ''}`);
      await composer(page).fill('parts stream:3');
      await composer(page).press('Enter');
      await expect(page.locator('details[data-tool="weather"] summary')).toHaveText('weather: done');
      await expect(page.locator('article[aria-busy="true"]')).toHaveCount(0);
      await page.locator('details.salmon-conversation-reasoning summary').first().click();
      await page.addScriptTag({ path: AXE });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const result = await axe.run({ include: [['.salmon-conversation']] }, { rules: { region: { enabled: false } } });
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations).toEqual([]);
    });
  }
});
