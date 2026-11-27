import { expect, test } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems } from './helpers.ts';
import { caretAfter, content, dialog, item, openRte as open, selectText } from './rich-text-helpers.ts';

// RichTextEditor accessibility, keyboard and hydration. Page: examples/vite-spa/src/rich-text.tsx.

test.describe('RichTextEditor accessibility', () => {
  test('server render then hydration: same markup, zero warnings, the engine mounts on the same element', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'hydrate');
    const server = await page.evaluate(() => (window as unknown as { __serverHtml: string }).__serverHtml);
    expect(server).toContain('<h2>Release notes</h2><p>Hello <strong>world</strong>');
    expect(server).not.toContain('contenteditable');
    expect(server).not.toMatch(/<script|onerror/);
    await expect(content(page)).toHaveAttribute('contenteditable', 'true');
    // One content element: the engine reused the server one.
    await expect(page.locator('[role="textbox"]')).toHaveCount(1);
    await caretAfter(page, 'some text.');
    await page.keyboard.type('!');
    await expect(content(page)).toContainText('some text.!');
    expect(problems).toEqual([]);
  });

  test('axe: editor, toolbar, menus, dialogs and popups', async ({ page }) => {
    await open(page, 'count&max=500&slash');
    await expectClean(page, 'initial');
    await item(page, 'formats').click();
    await expect(page.getByRole('menu')).toBeVisible();
    // axe reports aria-controls on an aria-haspopup trigger as needs-review (as in a11y.spec.ts, Menu family).
    await expectClean(page, 'formats menu', ['aria-valid-attr-value']);
    await page.keyboard.press('Escape');
    await caretAfter(page, 'some text.');
    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog(page)).toBeVisible();
    await expectClean(page, 'link dialog');
    await page.keyboard.press('Escape');
    await item(page, 'findReplace').click();
    await expectClean(page, 'find dialog');
    await page.keyboard.press('Escape');
    await caretAfter(page, 'a link');
    await expect(page.locator('.salmon-rich-text__quick')).toBeVisible();
    await expectClean(page, 'link quick toolbar');
    await caretAfter(page, 'some text.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.locator('.salmon-rich-text__popup')).toBeVisible();
    await expectClean(page, 'slash menu');
    await page.keyboard.press('Escape');
    await item(page, 'emoji').click();
    await expect(page.locator('.salmon-rich-text__emoji [role="option"]').first()).toBeVisible();
    await expectClean(page, 'emoji picker');
  });

  test('axe in dark scheme and RTL', async ({ page }) => {
    await open(page, 'scheme=dark&dir=rtl');
    await expectClean(page, 'dark rtl');
  });

  test('textbox semantics and the labelled toolbar', async ({ page }) => {
    await open(page);
    const box = page.getByRole('textbox', { name: 'Article body' });
    await expect(box).toHaveAttribute('aria-multiline', 'true');
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
    await expect(toolbar).toHaveAttribute('aria-controls', (await box.getAttribute('id'))!);
    await expect(item(page, 'bold')).toHaveAttribute('aria-pressed', 'false');
    await expect(item(page, 'formats')).toHaveAttribute('aria-haspopup', 'menu');
  });

  test('Alt+F10 moves to the toolbar, arrows rove with one tab stop, Escape returns to the editor', async ({ page }) => {
    await open(page);
    await caretAfter(page, 'some text.');
    await page.keyboard.press('Alt+F10');
    const first = page.locator('.salmon-rich-text > .salmon-rich-text__toolbar [data-salmon-toolbar-item]:not(:disabled)').first();
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const second = page.locator('.salmon-rich-text > .salmon-rich-text__toolbar [data-salmon-toolbar-item]:not(:disabled)').nth(1);
    await expect(second).toBeFocused();
    const stops = await page.locator('.salmon-rich-text > .salmon-rich-text__toolbar [data-salmon-toolbar-item][tabindex="0"]').count();
    expect(stops).toBe(1);
    await page.keyboard.press('End');
    await expect(page.locator('.salmon-rich-text > .salmon-rich-text__toolbar [data-salmon-toolbar-item]:not(:disabled):visible').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    // A toolbar command from the keyboard keeps focus in the toolbar.
    await selectText(page, 'Second');
    await page.keyboard.press('Alt+F10');
    await item(page, 'bold').focus();
    await page.keyboard.press('Enter');
    await expect(item(page, 'bold')).toBeFocused();
    await expect(item(page, 'bold')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(content(page)).toBeFocused();
    // Shift+Tab from the editor reaches the toolbar's tab stop.
    await page.keyboard.press('Shift+Tab');
    await expect(item(page, 'bold')).toBeFocused();
  });

  test('dialogs are modal, labelled, trap focus and return it to the editor', async ({ page }) => {
    await open(page);
    await caretAfter(page, 'some text.');
    await item(page, 'table').click();
    const d = dialog(page);
    await expect(d).toHaveAttribute('aria-modal', 'true');
    await expect(d).toHaveAccessibleName('Insert table');
    await expect(d.getByLabel('Rows')).toBeFocused();
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    await expect(content(page)).toBeFocused();
  });

  test('the character count announces the limit politely, not per keystroke', async ({ page }) => {
    await open(page, 'value=%3Cp%3Eab%3C%2Fp%3E&count&max=4');
    const live = page.locator('.salmon-rich-text__status [aria-live="polite"]');
    await expect(live).toHaveText('');
    await expect(page.locator('.salmon-rich-text__count')).not.toHaveAttribute('aria-live', /.*/);
    await caretAfter(page, 'ab');
    await page.keyboard.type('cd');
    await expect(live).toHaveText('Character limit reached');
  });
});
