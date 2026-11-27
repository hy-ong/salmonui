import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// InlineAssist accessibility: APG
// non-modal dialog (labelled, no aria-modal, focus in and back, Tab order
// prompt then actions), the Menu pattern for commands, the polite live
// region for the finished response, an ARIA snapshot and axe in light,
// dark, RTL and inline mode. The file name matches the `test:a11y` filter
// (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

const dialog = (page: Page) => page.getByRole('dialog', { name: 'AI assistant' });
const prompt = (page: Page) => page.getByRole('textbox', { name: 'Prompt' });

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}inline-assist.html${query ? `?${query}` : ''}`);
  await page.locator('#editor').click();
  await page.locator('#ask').click();
  await expect(dialog(page)).toBeVisible();
}

async function respond(page: Page, text = 'Rewrite'): Promise<void> {
  await prompt(page).fill(text);
  await prompt(page).press('Enter');
  await expect(page.locator('.salmon-inline-assist__response')).toHaveAttribute('data-status', 'done');
}

test.describe('InlineAssist accessibility', () => {
  test('non-modal dialog: labelled, focus in, Tab order prompt then actions, polite live region, focus back', async ({ page }) => {
    await open(page);
    const d = dialog(page);
    await expect(d).not.toHaveAttribute('aria-modal', /.*/);
    await expect(prompt(page)).toBeFocused();
    const live = d.locator('[role="status"]');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toBeEmpty();
    await respond(page);
    await expect(live).toHaveText('Reply to "Rewrite" about "nothing".\nSecond line of the reply.');
    await prompt(page).focus();
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || ''));
    }
    // Send is disabled with an empty prompt, so Tab goes from the prompt to the response actions.
    expect(order.slice(0, 3)).toEqual(['Accept', 'Discard', 'Retry']);
    // Tab is not contained: it leaves the dialog after the last action.
    expect(await page.evaluate(() => !!document.activeElement?.closest('.salmon-inline-assist'))).toBe(false);
    await expect(d).toHaveCount(0);
    await page.goto(`${DEV_URL}inline-assist.html`);
    await page.locator('#editor').click();
    await page.locator('#ask').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor')).toBeFocused();
  });

  test('commands use the Menu pattern', async ({ page }) => {
    await open(page);
    await prompt(page).pressSequentially('/');
    const menu = page.getByRole('menu', { name: 'Commands' });
    await expect(menu).toHaveAttribute('aria-orientation', 'vertical');
    await prompt(page).press('ArrowDown');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Translate to French' })).toBeFocused();
    await expect(menu.getByRole('menuitem', { name: 'Fix grammar' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('ARIA snapshot of a finished response', async ({ page }) => {
    await open(page, 'toolbar=bottom');
    await respond(page);
    await expect(page.locator('.salmon-inline-assist')).toMatchAriaSnapshot(`
      - dialog "AI assistant":
        - textbox "Prompt":
          - /placeholder: Ask AI to edit or write
        - button "Send" [disabled]
        - button "Tone"
        - text: Reply to "Rewrite" about "nothing". Second line of the reply.
        - group "Response actions":
          - button "Accept"
          - button "Discard"
          - button "Retry"
        - status: Reply to "Rewrite" about "nothing". Second line of the reply.
    `);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl', 'mode=inline&toolbar=inline&dictation']) {
    test(`axe: no violations (${variant || 'light'})`, async ({ page }) => {
      await open(page, variant);
      await respond(page);
      await prompt(page).pressSequentially('/');
      await expect(page.getByRole('menu', { name: 'Commands' })).toBeVisible();
      // Send just became enabled: let the Button color transition end before measuring contrast.
      await page.waitForTimeout(400);
      await page.addScriptTag({ path: AXE });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const result = await axe.run({ include: [['.salmon-inline-assist']] }, { rules: { region: { enabled: false } } });
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations).toEqual([]);
    });
  }
});
