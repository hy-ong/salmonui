import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Conversation accessibility: APG
// Feed roles, the polite live region, the labelled composer, ARIA
// snapshots, and axe in light, dark, RTL and compact. The file name matches
// the `test:a11y` filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}conversation.html${query ? `?${query}` : ''}`);
  await expect(page.locator('.salmon-conversation-feed > article').first()).toBeVisible();
}

test.describe('Conversation accessibility', () => {
  test('feed, articles, live region and composer carry their roles and names', async ({ page }) => {
    await open(page, 'count=3');
    const feed = page.getByRole('feed', { name: 'Messages' });
    await expect(feed).toBeVisible();
    const articles = feed.getByRole('article');
    await expect(articles).toHaveCount(3);
    await expect(articles.first()).toHaveAttribute('aria-posinset', '1');
    await expect(articles.first()).toHaveAttribute('aria-setsize', '3');
    await expect(articles.last()).toHaveAccessibleName('Cy Young 11:00 AM');
    await expect(articles.last()).toHaveAttribute('tabindex', '0');
    await expect(articles.first()).toHaveAttribute('tabindex', '-1');
    const live = page.locator('.salmon-conversation > [role="status"]');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toBeEmpty();
    const input = page.getByRole('textbox', { name: 'Message' });
    await expect(input).toHaveAttribute('aria-multiline', 'true');
    await expect(page.getByRole('toolbar', { name: 'Message actions' })).toHaveCount(3);
  });

  test('ARIA snapshot of the conversation', async ({ page }) => {
    await open(page, 'count=2');
    await expect(page.locator('.salmon-conversation')).toMatchAriaSnapshot(`
      - text: Support chat
      - toolbar "Support chat":
        - button "Call"
        - button "Info"
      - feed "Messages":
        - article "Ada Lovelace 9:00 AM":
          - text: Ada Lovelace
          - time: 9:00 AM
          - text: Message 0 with a second line and a third Read
          - toolbar "Message actions":
            - button "Copy"
            - button "Reply"
            - button "Pin"
            - button "Delete"
        - article "Bob Stone 10:00 AM":
          - text: Bob Stone
          - time: 10:00 AM
          - text: Message 1
          - toolbar "Message actions":
            - button "Copy"
            - button "Reply"
            - button "Pin"
            - button "Delete"
      - group "Quick replies":
        - text: Quick replies
        - button "Sounds good"
        - button "On my way"
      - textbox "Message":
        - /placeholder: Write a message
      - button "Send"
      - status
    `);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl', 'compact&separators']) {
    test(`axe: no violations (${variant || 'light'})`, async ({ page }) => {
      await open(page, `count=12&mentions&attachments${variant ? `&${variant}` : ''}`);
      await page.evaluate(() => (window as unknown as { __typing: (ids: string[]) => void }).__typing(['bob']));
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
