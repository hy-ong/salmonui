import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// MarkdownEditor (page:
// examples/vite-spa/src/editors.tsx with ?c=md). ARIA and axe checks are in
// editors-a11y.spec.ts.

interface Log {
  events: string[];
  value: unknown;
  uploads: number;
}

const url = (query = ''): string => `${DEV_URL}editors.html?c=md${query ? `&${query}` : ''}`;
const ta = (page: Page) => page.locator('#md');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' });
const item = (page: Page, name: string) => toolbar(page).getByRole('button', { name, exact: true });
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __editors: Log }).__editors);

async function select(page: Page, start: number, end: number): Promise<void> {
  await ta(page).evaluate((el: HTMLTextAreaElement, [s, e]) => {
    el.focus();
    el.setSelectionRange(s!, e!);
  }, [start, end]);
}
async function setText(page: Page, text: string): Promise<void> {
  await ta(page).fill(text);
}

test.describe('MarkdownEditor', () => {
  test('native textarea with a toolbar: bold wraps the selection and keeps it selected', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(url());
    await expect(ta(page)).toHaveValue('Hello **world**');
    await setText(page, 'make this bold');
    await select(page, 5, 9);
    await item(page, 'Bold').click();
    await expect(ta(page)).toHaveValue('make **this** bold');
    expect(await ta(page).evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([7, 11]);
    await expect(ta(page)).toBeFocused();
    const l = await log(page);
    expect(l.value).toBe('make **this** bold');
    expect(l.events).toContain('change:command');
    expect(l.events).toContain('change:input');
    expect(l.events).toContain('command:bold:pointer');
    // Toggling again removes the markers.
    await item(page, 'Bold').click();
    await expect(ta(page)).toHaveValue('make this bold');
    expect(problems).toEqual([]);
  });

  test('keyboard shortcuts run the commands', async ({ page }) => {
    await page.goto(url());
    await setText(page, 'word');
    await select(page, 0, 4);
    await page.keyboard.press('ControlOrMeta+i');
    await expect(ta(page)).toHaveValue('*word*');
    await page.keyboard.press('ControlOrMeta+Shift+s');
    await expect(ta(page)).toHaveValue('*~~word~~*');
    await page.keyboard.press('ControlOrMeta+Shift+u');
    await expect(ta(page)).toHaveValue('*~~WORD~~*');
    await page.keyboard.press('ControlOrMeta+Shift+l');
    await expect(ta(page)).toHaveValue('*~~word~~*');
    await page.keyboard.press('ControlOrMeta+Equal');
    await expect(ta(page)).toHaveValue('*~~<sub>word</sub>~~*');
    await setText(page, 'a');
    await page.keyboard.press('ControlOrMeta+Shift+o');
    await expect(ta(page)).toHaveValue('1. a');
    await page.keyboard.press('ControlOrMeta+Alt+o');
    await expect(ta(page)).toHaveValue('- a');
    expect((await log(page)).events).toContain('command:unorderedList:keyboard');
  });

  test('heading menu (APG Menu Button), blockquote, code and code block', async ({ page }) => {
    await page.goto(url());
    await setText(page, 'Title');
    await item(page, 'Heading').click();
    const menu = page.getByRole('menu', { name: 'Heading' });
    await expect(menu).toBeVisible();
    await expect(item(page, 'Heading')).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('menuitem')).toHaveText(['Paragraph', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6']);
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    await expect(ta(page)).toHaveValue('## Title');
    await expect(ta(page)).toBeFocused();
    // Escape closes the menu and returns focus to its button.
    await item(page, 'Heading').click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(item(page, 'Heading')).toBeFocused();
    await setText(page, 'quote');
    await item(page, 'Quote').click();
    await expect(ta(page)).toHaveValue('> quote');
    await setText(page, 'x');
    await select(page, 0, 1);
    await item(page, 'Inline code').click();
    await expect(ta(page)).toHaveValue('`x`');
    await setText(page, 'let a');
    await item(page, 'Code block').click();
    await expect(ta(page)).toHaveValue('```\nlet a\n```');
  });

  test('Enter continues a list and ends it on an empty item', async ({ page }) => {
    await page.goto(url());
    await setText(page, '');
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    await expect(ta(page)).toHaveValue('- one\n- two\nafter');
    await setText(page, '');
    await page.keyboard.type('1. a');
    await page.keyboard.press('Enter');
    await expect(ta(page)).toHaveValue('1. a\n2. ');
  });

  test('link dialog (Mod+K): modal dialog, text from the selection, inserts Markdown', async ({ page }) => {
    await page.goto(url());
    await setText(page, 'see docs here');
    await select(page, 4, 8);
    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.getByRole('dialog', { name: 'Link' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Text')).toHaveValue('docs');
    await expect(dialog.getByLabel('URL')).toBeFocused();
    await page.keyboard.type('https://example.com/docs');
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(ta(page)).toHaveValue('see [docs](https://example.com/docs) here');
    await expect(ta(page)).toBeFocused();
    // Escape cancels without inserting.
    await item(page, 'Link').click();
    await expect(page.getByRole('dialog', { name: 'Link' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(ta(page)).toHaveValue('see [docs](https://example.com/docs) here');
  });

  test('image dialog with an upload, and pasted image files go through onUpload', async ({ page }) => {
    await page.goto(url('upload'));
    await setText(page, '');
    await page.keyboard.press('ControlOrMeta+Shift+i');
    const dialog = page.getByRole('dialog', { name: 'Image' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Upload a file').setInputFiles({ name: 'cat.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) });
    await expect(dialog.getByLabel('Image URL')).toHaveValue('https://cdn.example/cat.png');
    await expect(dialog.getByLabel('Alternative text')).toHaveValue('cat.png');
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(ta(page)).toHaveValue('![cat.png](https://cdn.example/cat.png)');
    await setText(page, 'x ');
    await ta(page).evaluate((el: HTMLTextAreaElement) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array([1])], 'pasted.png', { type: 'image/png' }));
      el.focus();
      el.setSelectionRange(2, 2);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(ta(page)).toHaveValue('x ![pasted.png](https://cdn.example/pasted.png)');
    expect((await log(page)).uploads).toBe(2);
  });

  test('table dialog inserts a GFM table on its own lines', async ({ page }) => {
    await page.goto(url());
    await setText(page, 'before');
    await page.keyboard.press('ControlOrMeta+Shift+e');
    const dialog = page.getByRole('dialog', { name: 'Table' });
    await dialog.getByLabel('Rows').fill('1');
    await dialog.getByLabel('Columns').fill('3');
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(ta(page)).toHaveValue('before\n| Header 1 | Header 2 | Header 3 |\n| --- | --- | --- |\n|     |     |     |');
  });

  test('toolbar commands stay on the native undo stack', async ({ page }) => {
    await page.goto(url());
    await setText(page, 'abc');
    await select(page, 0, 3);
    await item(page, 'Bold').click();
    await expect(ta(page)).toHaveValue('**abc**');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('abc');
    await item(page, 'Redo').click();
    await expect(ta(page)).toHaveValue('**abc**');
    await item(page, 'Undo').click();
    await expect(ta(page)).toHaveValue('abc');
  });

  test('without native insertText the internal history undoes commands', async ({ page }) => {
    await page.goto(url('nonative'));
    await setText(page, 'abc');
    await select(page, 0, 3);
    await item(page, 'Bold').click();
    await expect(ta(page)).toHaveValue('**abc**');
    await item(page, 'Italic').click();
    await expect(ta(page)).toHaveValue('***abc***');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('**abc**');
    await item(page, 'Undo').click();
    await expect(ta(page)).toHaveValue('abc');
    await page.keyboard.press('ControlOrMeta+y');
    await expect(ta(page)).toHaveValue('**abc**');
  });

  test('preview: tab mode hides the source; split shows both and the preview is deferred', async ({ page }) => {
    await page.goto(url());
    const preview = page.getByRole('region', { name: 'Preview' });
    await expect(preview).toHaveCount(0);
    await toolbar(page).getByRole('button', { name: 'Preview' }).click();
    await expect(preview).toBeVisible();
    await expect(preview).toHaveText('Hello **world**');
    await expect(ta(page)).toBeHidden();
    await expect(item(page, 'Bold')).toBeDisabled();
    await toolbar(page).getByRole('button', { name: 'Preview' }).click();
    await expect(ta(page)).toBeVisible();
    await page.goto(url('preview=split'));
    await expect(preview).toBeVisible();
    await expect(ta(page)).toBeVisible();
    await ta(page).fill('# Live');
    await expect(preview).toHaveText('# Live');
    expect((await log(page)).events).not.toContain('preview:off');
  });

  test('fullscreen toggles with the item, Mod+Shift+F and Escape', async ({ page }) => {
    await page.goto(url());
    await item(page, 'Full screen').click();
    await expect(page.locator('.demo-md')).toHaveAttribute('data-fullscreen', '');
    const box = (await page.locator('.demo-md').boundingBox())!;
    expect(box.width).toBe(1280);
    await ta(page).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.demo-md')).not.toHaveAttribute('data-fullscreen');
    await page.keyboard.press('ControlOrMeta+Shift+f');
    await expect(page.locator('.demo-md')).toHaveAttribute('data-fullscreen', '');
    expect((await log(page)).events.filter((e) => e.startsWith('fullscreen'))).toEqual(['fullscreen:true', 'fullscreen:false', 'fullscreen:true']);
  });

  test('ref API: runCommand, insertText, wrapSelection, selection and focus', async ({ page }) => {
    await page.goto(url());
    await setText(page, 'abc');
    await page.evaluate(() => {
      window.__md!.setSelection(1, 2);
    });
    expect(await page.evaluate(() => window.__md!.getSelection())).toEqual({ start: 1, end: 2, text: 'b' });
    await page.evaluate(() => window.__md!.wrapSelection('[', ']'));
    await expect(ta(page)).toHaveValue('a[b]c');
    await page.evaluate(() => window.__md!.insertText('X'));
    await expect(ta(page)).toHaveValue('a[X]c');
    await page.evaluate(() => window.__md!.runCommand('heading1'));
    await expect(ta(page)).toHaveValue('# a[X]c');
    await page.evaluate(() => window.__md!.runCommand('stamp'));
    await expect(ta(page)).toHaveValue('# a[X[stamp]]c');
    await page.evaluate(() => window.__md!.blur());
    await expect(ta(page)).not.toBeFocused();
    await page.evaluate(() => window.__md!.focus());
    await expect(ta(page)).toBeFocused();
    expect(await page.evaluate(() => window.__md!.element?.id)).toBe('md');
  });

  test('onBeforeCommand vetoes; custom toolbar items run onSelect', async ({ page }) => {
    await page.goto(url('vetoStrike'));
    await setText(page, 'x');
    await select(page, 0, 1);
    await item(page, 'Strikethrough').click();
    await expect(ta(page)).toHaveValue('x');
    expect((await log(page)).events).toContain('before:strikethrough:pointer');
    expect((await log(page)).events).not.toContain('command:strikethrough:pointer');
    // The custom item replaces the selection through the ref API.
    await item(page, 'Insert stamp').click();
    await expect(ta(page)).toHaveValue('[stamp]');
  });

  test('toolbar overflow: menu, wrap and scroll', async ({ page }) => {
    await page.goto(url('width=360'));
    const more = toolbar(page).getByRole('button', { name: 'More' });
    await expect(more).toBeVisible();
    await expect(item(page, 'Full screen')).toBeHidden();
    await more.click();
    const menu = page.getByRole('menu', { name: 'More' });
    await expect(menu.getByRole('menuitem', { name: 'Full screen' })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Full screen' }).click();
    await expect(page.locator('.demo-md')).toHaveAttribute('data-fullscreen', '');
    // In fullscreen everything fits again.
    await expect(more).toHaveCount(0);
    await page.goto(url('width=360&overflow=wrap'));
    await expect(toolbar(page).getByRole('button', { name: 'More' })).toHaveCount(0);
    expect((await toolbar(page).boundingBox())!.height).toBeGreaterThan(40);
    await page.goto(url('width=360&overflow=scroll'));
    expect(await toolbar(page).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });

  test('toolbar keyboard: Alt+F10 focuses it, arrows rove, Escape returns to the textarea', async ({ page }) => {
    await page.goto(url());
    await ta(page).focus();
    await page.keyboard.press('Alt+F10');
    await expect(item(page, 'Bold')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'Italic')).toBeFocused();
    await page.keyboard.press('End');
    await expect(item(page, 'Insert stamp')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(item(page, 'Bold')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(item(page, 'Insert stamp')).toBeFocused();
    // One tab stop: the last focused item.
    expect(await toolbar(page).locator('[tabindex="0"]').count()).toBe(1);
    await page.keyboard.press('Escape');
    await expect(ta(page)).toBeFocused();
    // Tab leaves the textarea (no indentation by default); with tabIndents it indents.
    await page.keyboard.press('Tab');
    await expect(ta(page)).not.toBeFocused();
    await page.goto(url('tab'));
    await setText(page, 'x');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    await expect(ta(page)).toHaveValue('\tx');
  });

  test('RTL: the toolbar mirrors and arrow keys follow the direction', async ({ page }) => {
    await page.goto(url('dir=rtl'));
    const bold = (await item(page, 'Bold').boundingBox())!;
    const italic = (await item(page, 'Italic').boundingBox())!;
    expect(italic.x).toBeLessThan(bold.x);
    await expect(ta(page)).toHaveAttribute('dir', 'auto');
    await ta(page).focus();
    await page.keyboard.press('Alt+F10');
    await page.keyboard.press('ArrowLeft');
    await expect(item(page, 'Italic')).toBeFocused();
  });

  test('maxLength, count and readOnly', async ({ page }) => {
    await page.goto(url('max=20&count'));
    await setText(page, '');
    await page.keyboard.type('x'.repeat(25));
    await expect(ta(page)).toHaveValue('x'.repeat(20));
    await expect(page.locator('.salmon-markdown-editor-count')).toContainText('20 / 20');
    await expect(page.locator('.salmon-markdown-editor-status')).toHaveText('Character limit reached');
    await page.goto(url('readonly'));
    await expect(ta(page)).toHaveAttribute('readonly', '');
    await expect(item(page, 'Bold')).toBeDisabled();
  });

  test('resizable textarea and form reset', async ({ page }) => {
    await page.goto(url());
    expect(await ta(page).evaluate((el) => getComputedStyle(el).resize)).toBe('vertical');
    await setText(page, 'changed');
    await page.locator('#reset').click();
    expect((await log(page)).events).toContain('change:reset');
    await expect(ta(page)).toHaveValue('');
    expect(await page.evaluate(() => new FormData(document.querySelector('form')!).get('body'))).toBe('');
  });

  test('a keystroke on a 100 KB document with the split preview paints within the budget', { tag: '@perf' }, async ({ page }) => {
    await page.goto(url('big&preview=split'));
    await ta(page).focus();
    await page.keyboard.press('ControlOrMeta+End');
    const ms = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const el = document.querySelector<HTMLTextAreaElement>('#md')!;
          const t0 = performance.now();
          el.addEventListener('input', () => requestAnimationFrame(() => resolve(performance.now() - t0)), { once: true });
          el.setRangeText('z', el.value.length, el.value.length, 'end');
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }),
    );
    // Development build with StrictMode; the production budget is 16 ms.
    expectBudget(ms, 50, 'MarkdownEditor 100 KB split preview keystroke to painted', { strict: true });
  });

  test('server-rendered markup hydrates without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(url('hydrate&preview=split'));
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    await select(page, 0, 5);
    await item(page, 'Bold').click();
    await expect(ta(page)).toHaveValue('**Hello** **world**');
    expect(problems).toEqual([]);
  });
});
