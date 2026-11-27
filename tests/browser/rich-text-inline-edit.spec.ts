import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// InlineEdit with RichTextEditor (page:
// examples/vite-spa/src/rich-text-inline-edit.tsx).

const saves = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __inlineRte: { saves: string[] } }).__inlineRte.saves);

for (const mode of ['popover', 'inline'] as const) {
  test(`InlineEdit edits rich text with RichTextEditor and previews it with RichTextContent (${mode})`, async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${DEV_URL}rich-text-inline-edit.html?mode=${mode}`);
    const preview = page.locator('.salmon-rich-text-content');
    // The stored HTML renders sanitized in the preview: markup kept, script dropped.
    await expect(preview.locator('strong')).toHaveText('notes');
    expect(await preview.evaluate((el) => el.querySelector('script'))).toBeNull();
    await preview.click();
    const editor = page.getByRole('textbox', { name: 'Description' });
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await editor.click();
    // Type before the plain text so the bold mark stays where it was.
    await page.keyboard.press('Home');
    await page.keyboard.type('Draft: ');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveCount(0);
    await expect(preview).toContainText('Draft: Release notes');
    await expect(preview.locator('strong')).toHaveText('notes');
    const [saved] = await saves(page);
    expect(saved).toContain('<strong>notes</strong>');
    expect(saved).toContain('Draft: Release');
    expect(saved).not.toContain('<script');
    expect(problems).toEqual([]);
  });
}
