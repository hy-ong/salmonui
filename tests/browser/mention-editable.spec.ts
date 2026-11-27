import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Mention on a plain contenteditable target
// (page: examples/vite-spa/src/mention-editable.tsx). The RichTextEditor
// integration is covered by the rich-text specs.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

interface Log {
  inserts: { text: string; trigger: string; source: string }[];
  html: string;
}

const editable = (page: Page) => page.locator('#editable');
const popup = (page: Page) => page.locator('.salmon-mention-popup');
const options = (page: Page) => page.locator('.salmon-mention-popup [role="option"]');
const chips = (page: Page) => page.locator('#editable .salmon-mention-chip');
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __mentionEditable: Log }).__mentionEditable);

async function open(page: Page): Promise<void> {
  await page.goto(`${DEV_URL}mention-editable.html`);
  await editable(page).click();
}

test.describe('Mention on contenteditable', () => {
  test('typing the trigger opens a listbox at the caret with combobox ARIA on the element', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await page.keyboard.type('Hello @');
    await expect(popup(page)).toBeVisible();
    await expect(options(page)).toHaveCount(4);
    await page.keyboard.type('al');
    await expect(options(page)).toHaveText(['Alice Smith', 'Malik Ali']);
    await expect(editable(page)).toHaveAttribute('aria-autocomplete', 'list');
    const controls = await editable(page).getAttribute('aria-controls');
    expect(controls).toBe(await popup(page).getAttribute('id'));
    await expect(editable(page)).toHaveAttribute('aria-activedescendant', /option-0$/);
    // Anchored at the caret: the popup starts below the trigger line, inside the element horizontally.
    const box = (await editable(page).boundingBox())!;
    const pop = (await popup(page).boundingBox())!;
    expect(pop.y).toBeGreaterThan(box.y);
    expect(pop.x).toBeGreaterThan(box.x + 20);
    expect(problems).toEqual([]);
  });

  test('Enter inserts a non-editable chip, restores the caret after it and typing continues', async ({ page }) => {
    await open(page);
    await page.keyboard.type('Hi @ali');
    await expect(options(page)).toHaveText(['Alice Smith', 'Malik Ali']);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(popup(page)).toHaveCount(0);
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page)).toHaveText('Malik Ali');
    await expect(chips(page)).toHaveAttribute('contenteditable', 'false');
    await expect(chips(page)).toHaveAttribute('data-mention-value', 'malik');
    // The Enter was taken by the list: no new line in the element.
    expect(await editable(page).evaluate((el) => el.querySelectorAll('div, br').length)).toBe(0);
    await page.keyboard.type('thanks');
    await expect(editable(page)).toHaveText('Hi Malik Ali thanks');
    expect((await log(page)).inserts).toEqual([{ text: 'Malik Ali', trigger: '@', source: 'keyboard' }]);
    await expect(editable(page)).not.toHaveAttribute('aria-autocomplete', /.*/);
  });

  test('a trigger with keepChar and a suffix, pointer insertion, and a second mention after a chip', async ({ page }) => {
    await open(page);
    await page.keyboard.type('see #d');
    await options(page).filter({ hasText: 'docs' }).click();
    await expect(chips(page)).toHaveText(['#docs']);
    await page.keyboard.type('and @bo');
    await expect(options(page)).toHaveText(['Bob Jones']);
    await page.keyboard.press('Tab');
    await expect(chips(page)).toHaveText(['#docs', 'Bob Jones']);
    expect((await log(page)).inserts.map((i) => [i.text, i.source])).toEqual([
      ['#docs ', 'pointer'],
      ['Bob Jones', 'keyboard'],
    ]);
  });

  test('Escape closes and keeps the text; Backspace after a chip deletes it as a unit', async ({ page }) => {
    await open(page);
    await page.keyboard.type('@da');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(editable(page)).toHaveText('@da');
    // The dismissed session stays closed while typing on.
    await page.keyboard.type('v');
    await expect(popup(page)).toHaveCount(0);
    await page.keyboard.type(' @dave');
    await expect(options(page)).toHaveText(['Dave Brown']);
    await page.keyboard.press('Enter');
    await expect(chips(page)).toHaveCount(1);
    await page.keyboard.press('Backspace'); // the spacer
    await page.keyboard.press('Backspace'); // the chip, whole
    await expect(chips(page)).toHaveCount(0);
    await expect(editable(page)).toHaveText(/^@dav\s?$/);
  });

  test('IME composition does not open the list until it ends', async ({ page }) => {
    await open(page);
    const cdp = await page.context().newCDPSession(page);
    await page.keyboard.type('Hi ');
    await cdp.send('Input.imeSetComposition', { text: '＠', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '＠あ', selectionStart: 2, selectionEnd: 2 });
    await expect(popup(page)).toHaveCount(0);
    await cdp.send('Input.insertText', { text: '@' });
    await expect(popup(page)).toBeVisible();
    expect((await log(page)).inserts).toEqual([]);
  });

  test('axe: no violations with the list open', async ({ page }) => {
    await open(page);
    await page.keyboard.type('@');
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
      const result = await axe.run({ include: [['#editable'], ['.salmon-mention-popup']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
      return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    });
    expect(violations).toEqual([]);
  });
});
