import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Editors accessibility: ARIA snapshots and axe in light, dark and RTL
// for InlineEdit (idle, inline editor, popover dialog) and MarkdownEditor
// (toolbar, split preview, heading menu, link dialog). The file name
// matches the `test:a11y` filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function axe(page: Page, include: string[]): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (selectors) => {
    const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const present = selectors.filter((s) => document.querySelector(s));
    const result = await run.run({ include: present.map((s) => [s]) }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  }, include);
}

test.describe('InlineEdit accessibility', () => {
  test('ARIA: the preview is a button named by label and value; the popover is a labelled dialog', async ({ page }) => {
    await page.goto(`${DEV_URL}editors.html`);
    await expect(page.locator('.demo-inline')).toMatchAriaSnapshot(`
      - button /Title. Quarterly report/ [expanded=false]
      - status
    `);
    await page.locator('.demo-inline .salmon-inline-edit-preview').click();
    await expect(page.getByRole('dialog', { name: 'Title' })).toMatchAriaSnapshot(`
      - dialog "Title":
        - textbox "Title": Quarterly report
        - button "Save"
        - button "Cancel"
    `);
    await expect(page.locator('.demo-inline .salmon-inline-edit-preview')).toHaveAttribute('aria-expanded', 'true');
  });

  test('keyboard: Enter starts, Tab follows blurAction, focus returns to the preview', async ({ page }) => {
    await page.goto(`${DEV_URL}editors.html?mode=inline&blur=cancel`);
    await page.locator('.demo-inline .salmon-inline-edit-preview').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Save' })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('.demo-inline .salmon-inline-edit-preview')).toHaveCount(1);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: idle, inline editor with an error, and the popover (${variant || 'light'})`, async ({ page }) => {
      // The popover fades in; axe measures contrast on the settled frame.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${DEV_URL}editors.html?${variant}`);
      expect(await axe(page, ['main'])).toEqual([]);
      await page.locator('.demo-number .salmon-inline-edit-preview').click();
      await page.locator('.demo-number input').fill('99');
      await page.keyboard.press('Enter');
      await expect(page.locator('.demo-number .salmon-inline-edit-error')).toBeVisible();
      await page.locator('.demo-inline .salmon-inline-edit-preview').click();
      await expect(page.locator('.salmon-inline-edit-popover')).toBeVisible();
      expect(await axe(page, ['main', '.salmon-inline-edit-popover'])).toEqual([]);
    });
  }
});

test.describe('InlineEdit with field components accessibility', () => {
  for (const query of ['mode=popover', 'mode=inline&scheme=dark', 'mode=popover&dir=rtl']) {
    test(`axe: every composed field editor (${query})`, async ({ page }) => {
      // The popover fades in; axe measures contrast on the settled frame.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${DEV_URL}inline-edit-fields.html?${query}`);
      for (const field of ['number', 'masked', 'color', 'slider', 'date', 'datetime', 'time', 'range', 'select', 'multi', 'combobox']) {
        await page.locator(`[data-field="${field}"] .salmon-inline-edit-preview`).click();
        await expect(page.locator('.salmon-inline-edit-editor')).toBeVisible();
        // Contrast is measured at rest: no hover from the opening click, no running color transition.
        await page.mouse.move(0, 0);
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
        expect(await axe(page, ['.salmon-inline-edit-editor']), field).toEqual([]);
        await page.locator('.salmon-inline-edit-editor').getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(page.locator('.salmon-inline-edit-editor')).toHaveCount(0);
      }
    });
  }
});

test.describe('MarkdownEditor accessibility', () => {
  test('ARIA: labelled textarea, toolbar controlling it, labelled preview region', async ({ page }) => {
    await page.goto(`${DEV_URL}editors.html?c=md&preview=split`);
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
    await expect(toolbar).toHaveAttribute('aria-controls', 'md');
    await expect(page.getByRole('textbox', { name: 'Body' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Preview' })).toHaveAttribute('aria-live', 'off');
    await expect(toolbar).toMatchAriaSnapshot(`
      - toolbar "Formatting":
        - button "Bold"
        - button "Italic"
        - button "Strikethrough"
        - separator
        - button "Heading"
        - button "Quote"
        - button "Inline code"
        - button "Code block"
        - button "Numbered list"
        - button "Bulleted list"
        - separator
        - button "Link"
        - button "Image"
        - button "Table"
        - separator
        - button "Undo"
        - button "Redo"
        - button "Preview" [pressed]
        - button "Full screen"
        - button "Insert stamp"
    `);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: toolbar, split preview, heading menu and link dialog (${variant || 'light'})`, async ({ page }) => {
      await page.goto(`${DEV_URL}editors.html?c=md&preview=split&count&max=100&${variant}`);
      expect(await axe(page, ['main'])).toEqual([]);
      await page.getByRole('button', { name: 'Heading', exact: true }).click();
      await expect(page.getByRole('menu', { name: 'Heading' })).toBeVisible();
      expect(await axe(page, ['main', '.salmon-markdown-editor-menu'])).toEqual([]);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Link', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Link' })).toBeVisible();
      expect(await axe(page, ['.salmon-markdown-editor-dialog'])).toEqual([]);
    });
  }
});
