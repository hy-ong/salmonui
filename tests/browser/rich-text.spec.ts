import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers.ts';
import { act, caretAfter, command, content, dialog, getHtml, item, log, openRte as open, paste, pasteImage, quickItem, selectText } from './rich-text-helpers.ts';

// RichTextEditor (page:
// examples/vite-spa/src/rich-text.tsx). Accessibility, keyboard and hydration
// checks are in rich-text-a11y.spec.ts; insertion features in
// rich-text-insert.spec.ts.

test.describe('RichTextEditor editing and value', () => {
  test('mounts ProseMirror on the server-rendered content element and sanitizes the value', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const el = content(page);
    await expect(el).toHaveAttribute('contenteditable', 'true');
    await expect(el).toHaveClass(/ProseMirror/);
    await expect(el).toHaveAttribute('role', 'textbox');
    await expect(el.locator('h2')).toHaveText('Release notes');
    expect(await el.locator('script').count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    const value = await getHtml(page);
    expect(value).not.toMatch(/script|onerror/);
    expect(value).toContain('<p>Hello <strong>world</strong>, this is <a href="https://example.com">a link</a>.</p>');
    expect(problems).toEqual([]);
  });

  test('typing edits the document and onChange fires per transaction batch with the HTML', async ({ page }) => {
    await open(page);
    await caretAfter(page, 'some text.');
    await page.keyboard.type(' More');
    await expect.poll(async () => (await log(page)).changes.at(-1)).toContain('<p>Second paragraph with some text. More</p>');
    expect((await log(page)).changes.length).toBeLessThanOrEqual(5);
  });

  test('changeDelay batches changes and onBlur reports the value', async ({ page }) => {
    await open(page, 'changeDelay=400');
    await caretAfter(page, 'some text.');
    await page.keyboard.type('abc');
    await page.waitForTimeout(100);
    expect((await log(page)).changes).toEqual([]);
    await expect.poll(async () => (await log(page)).changes.length).toBe(1);
    await page.keyboard.type('d');
    // Blur flushes the pending change before onBlur.
    await page.locator('#outside').click();
    const after = await log(page);
    expect(after.changes.length).toBe(2);
    expect(after.blurs.at(-1)).toContain('some text.abcd');
  });

  test('controlled value: edits round-trip through onChange and value', async ({ page }) => {
    await open(page, 'controlled');
    await caretAfter(page, 'Release notes');
    await page.keyboard.type(' v2');
    await expect(content(page).locator('h2')).toHaveText('Release notes v2');
    await expect.poll(async () => (await log(page)).changes.at(-1)).toContain('<h2>Release notes v2</h2>');
    // The caret survives the controlled re-render (value changes go through the engine).
    await page.keyboard.type('!');
    await expect(content(page).locator('h2')).toHaveText('Release notes v2!');
  });

  test('getHtml({ xhtml }) and getText', async ({ page }) => {
    await open(page);
    const xhtml = await getHtml(page, true);
    expect(xhtml).toContain('<img src="x" alt="bad" />');
    expect(await getHtml(page)).toContain('<img src="x" alt="bad">');
    const text = await act<string>(page, 'getText');
    expect(text.startsWith('Release notes\nHello world, this is a link.\nSecond paragraph')).toBe(true);
  });

  test('marks from the toolbar and the keyboard shortcuts', async ({ page }) => {
    await open(page);
    await selectText(page, 'Second');
    await page.keyboard.press('ControlOrMeta+b');
    await page.keyboard.press('ControlOrMeta+i');
    await page.keyboard.press('ControlOrMeta+u');
    expect(await getHtml(page)).toContain('<p><strong><em><u>Second</u></em></strong> paragraph');
    await expect(item(page, 'bold')).toHaveAttribute('aria-pressed', 'true');
    await selectText(page, 'paragraph');
    await item(page, 'strikethrough').click();
    await item(page, 'superscript').click();
    expect(await getHtml(page)).toContain('<s><sup>paragraph</sup></s>');
    await item(page, 'subscript').click();
    expect(await getHtml(page)).toContain('<s><sub>paragraph</sub></s>');
    await selectText(page, 'text');
    await item(page, 'inlineCode').click();
    expect(await getHtml(page)).toContain('<code>text</code>');
    await selectText(page, 'some');
    await command(page, 'uppercase');
    expect(await getHtml(page)).toContain('SOME');
    await page.keyboard.press('ControlOrMeta+Shift+l');
    expect(await getHtml(page)).toContain(' some ');
  });

  test('font color, family and size marks', async ({ page }) => {
    await open(page);
    await selectText(page, 'Hello');
    await item(page, 'fontColor').click();
    await page.getByRole('menuitem', { name: 'Red' }).click();
    expect(await getHtml(page)).toContain('<span style="color:#dc2626">Hello</span>');
    await selectText(page, 'Hello');
    await command(page, 'fontFamily', 'Georgia, serif');
    await command(page, 'fontSize', '18pt');
    await command(page, 'backgroundColor', '#fef08a');
    const value = await getHtml(page);
    expect(value).toMatch(/font-family:Georgia, serif/);
    expect(value).toContain('font-size:18pt');
    expect(value).toContain('background-color:#fef08a');
  });

  test('paragraph formats, alignment, lists, indent, line height, quote, rule and clear format', async ({ page }) => {
    await open(page);
    await caretAfter(page, 'some text.');
    await item(page, 'formats').click();
    await page.getByRole('menuitem', { name: 'Heading 3' }).click();
    expect(await getHtml(page)).toContain('<h3>Second paragraph with some text.</h3>');
    await item(page, 'alignments').click();
    await page.getByRole('menuitem', { name: 'Align center' }).click();
    expect(await getHtml(page)).toContain('<h3 style="text-align:center">');
    await caretAfter(page, '.');
    await item(page, 'orderedList').click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Item two');
    await item(page, 'indent').click();
    expect(await getHtml(page)).toMatch(/<ol><li><p>Hello .*<\/p><ol><li><p>Item two<\/p><\/li><\/ol><\/li><\/ol>/);
    await item(page, 'outdent').click();
    expect(await getHtml(page)).toMatch(/<ol><li><p>Hello .*<\/p><\/li><li><p>Item two<\/p><\/li><\/ol>/);
    await command(page, 'orderedList', 'lower-roman');
    expect(await getHtml(page)).toContain('<ol style="list-style-type:lower-roman">');
    await item(page, 'unorderedList').click();
    expect(await getHtml(page)).toContain('<ul style="list-style-type:disc">'.replace(' style="list-style-type:disc"', ''));
    await caretAfter(page, 'Release notes');
    await command(page, 'lineHeight', '1.5');
    await item(page, 'blockquote').click();
    expect(await getHtml(page)).toContain('<blockquote><h2 style="line-height:1.5">Release notes</h2></blockquote>');
    await item(page, 'horizontalRule').click();
    expect(await getHtml(page)).toContain('<hr>');
    await selectText(page, 'world');
    await item(page, 'clearFormat').click();
    expect(await getHtml(page)).not.toContain('<strong>world</strong>');
  });

  test('checklist items toggle from the marker', async ({ page }) => {
    await open(page);
    await caretAfter(page, 'some text.');
    await item(page, 'checklist').click();
    expect(await getHtml(page)).toContain('<ul data-type="checklist"><li data-checked="false"><p>Second paragraph');
    const li = content(page).locator('li[data-checked]');
    const box = (await li.boundingBox())!;
    await page.mouse.click(box.x + 6, box.y + box.height / 2);
    await expect(li).toHaveAttribute('data-checked', 'true');
  });

  test('links: insert dialog, open in new window, quick toolbar edit and remove', async ({ page }) => {
    await open(page);
    await selectText(page, 'Second');
    await page.keyboard.press('ControlOrMeta+k');
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d).toHaveAccessibleName('Insert link');
    await expect(d.getByLabel('Text')).toHaveValue('Second');
    await d.getByLabel('URL').fill('javascript:alert(1)');
    await d.getByRole('button', { name: 'Insert' }).click();
    // Unsafe URLs are rejected.
    await expect(d.getByLabel('URL')).toHaveAttribute('aria-invalid', 'true');
    await d.getByLabel('URL').fill('https://salmon.dev/docs');
    await d.getByLabel('Open in new window').check();
    await d.getByRole('button', { name: 'Insert' }).click();
    await expect(d).toHaveCount(0);
    expect(await getHtml(page)).toContain('<a href="https://salmon.dev/docs" target="_blank" rel="noopener noreferrer">Second</a>');
    // Caret inside the link shows the link quick toolbar.
    await caretAfter(page, 'Seco');
    await expect(page.locator('.salmon-rich-text__quick[data-quick="link"]')).toBeVisible();
    await quickItem(page, 'editLink').click();
    await expect(dialog(page)).toHaveAccessibleName('Edit link');
    await expect(dialog(page).getByLabel('URL')).toHaveValue('https://salmon.dev/docs');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await caretAfter(page, 'Seco');
    await quickItem(page, 'removeLink').click();
    expect(await getHtml(page)).not.toContain('salmon.dev');
  });

  test('tables: insert dialog, header row, row and column operations, merge, style', async ({ page }) => {
    await open(page);
    await caretAfter(page, 'some text.');
    await item(page, 'table').click();
    const d = dialog(page);
    await d.getByLabel('Rows').fill('2');
    await d.getByLabel('Columns').fill('3');
    await d.getByRole('button', { name: 'Insert' }).click();
    await expect(content(page).locator('table tr')).toHaveCount(2);
    await expect(content(page).locator('table tr').first().locator('th')).toHaveCount(3);
    // The caret is in the first cell; the table quick toolbar is shown.
    await page.keyboard.type('Name');
    await expect(page.locator('.salmon-rich-text__quick[data-quick="table"]')).toBeVisible();
    await quickItem(page, 'addRowAfter').click();
    await expect(content(page).locator('table tr')).toHaveCount(3);
    await quickItem(page, 'addColumnAfter').click();
    await expect(content(page).locator('table tr').first().locator('th')).toHaveCount(4);
    await quickItem(page, 'deleteColumn').click();
    await expect(content(page).locator('table tr').first().locator('th')).toHaveCount(3);
    await quickItem(page, 'tableStyle').click();
    await page.getByRole('menuitem', { name: 'Striped' }).click();
    // deleteColumn removed the caret's column (with "Name").
    expect(await getHtml(page)).toMatch(/<table class="salmon-rich-text-table--striped"><tbody><tr>(<th><p><\/p><\/th>){3}<\/tr>/);
    // Merge two cells selected with the pointer.
    const cells = content(page).locator('table tr').nth(1).locator('td');
    const a = (await cells.nth(0).boundingBox())!;
    const b = (await cells.nth(1).boundingBox())!;
    await page.mouse.move(a.x + 5, a.y + 5);
    await page.mouse.down();
    await page.mouse.move(b.x + 10, b.y + 5, { steps: 5 });
    await page.mouse.up();
    await quickItem(page, 'mergeCells').click();
    expect(await getHtml(page)).toContain('<td colspan="2">');
    await quickItem(page, 'splitCell').click();
    expect(await getHtml(page)).not.toContain('colspan="2"');
    await quickItem(page, 'deleteTable').click();
    await expect(content(page).locator('table')).toHaveCount(0);
  });

  test('table columns resize by dragging a cell border', async ({ page }) => {
    await open(page);
    await caretAfter(page, 'some text.');
    await command(page, 'insertTable', { rows: 2, cols: 2 });
    const cell = content(page).locator('table td').first();
    const box = (await cell.boundingBox())!;
    const edge = box.x + box.width - 1;
    await page.mouse.move(edge - 3, box.y + box.height / 2);
    await page.mouse.move(edge, box.y + box.height / 2, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(edge - 80, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await getHtml(page)).toMatch(/<td data-colwidth="\d+">/);
  });

  test('code block with codeLanguages and the highlight hook', async ({ page }) => {
    await open(page, 'highlight');
    await caretAfter(page, 'some text.');
    await page.keyboard.press('Enter');
    await item(page, 'codeBlock').click();
    await page.keyboard.type('const answer = 42;');
    await expect(content(page).locator('pre code .demo-keyword')).toHaveText('const');
    await content(page).locator('pre select').selectOption('css');
    expect(await getHtml(page)).toContain('<pre><code class="language-css">const answer = 42;</code></pre>');
    // Enter inside code inserts a newline; the highlight span never reaches the value.
    expect(await getHtml(page)).not.toContain('demo-keyword');
  });

  test('find and replace: matches, next, replace, replace all', async ({ page }) => {
    await open(page);
    await caretAfter(page, 'Release');
    await item(page, 'findReplace').click();
    const d = dialog(page);
    await d.getByLabel('Find').fill('e');
    await expect(d.getByRole('status')).toHaveText(/1 of \d+/);
    const count = Number((await d.getByRole('status').textContent())!.match(/of (\d+)/)![1]);
    expect(count).toBeGreaterThan(5);
    await expect(content(page).locator('.salmon-rich-text__match--current')).toHaveCount(1);
    await d.getByLabel('Find').fill('paragraph');
    await d.getByLabel('Replace with').fill('section');
    await d.getByRole('button', { name: 'Replace', exact: true }).click();
    expect(await getHtml(page)).toContain('Second section with');
    await d.getByLabel('Find').fill('Second');
    await d.getByLabel('Match case').check();
    await d.getByLabel('Replace with').fill('Third');
    await d.getByRole('button', { name: 'Replace all' }).click();
    expect(await getHtml(page)).toContain('Third section');
    await d.getByRole('button', { name: 'Close' }).click();
    await expect(content(page).locator('.salmon-rich-text__match')).toHaveCount(0);
  });

  test('undo, redo, undoLimit and clearHistory', async ({ page }) => {
    await open(page, 'undoLimit=2');
    await expect(item(page, 'undo')).toBeDisabled();
    await caretAfter(page, 'some text.');
    for (const word of [' one', ' two', ' three']) {
      await page.keyboard.type(word);
      await page.waitForTimeout(350);
    }
    await page.keyboard.press('ControlOrMeta+z');
    expect(await getHtml(page)).toContain('text. one two</p>');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await getHtml(page)).toContain('text. one</p>');
    // undoLimit=2: the first group is gone.
    await page.keyboard.press('ControlOrMeta+z');
    expect(await getHtml(page)).toContain('text. one</p>');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await getHtml(page)).toContain('text. one two</p>');
    await page.keyboard.press('ControlOrMeta+y');
    expect(await getHtml(page)).toContain('text. one two three</p>');
    await item(page, 'undo').click();
    expect(await getHtml(page)).toContain('text. one two</p>');
    await item(page, 'redo').click();
    await act(page, 'clearHistory');
    await expect(item(page, 'undo')).toBeDisabled();
    await expect(item(page, 'redo')).toBeDisabled();
  });

  test('showCount and maxLength enforced by the transaction filter', async ({ page }) => {
    await open(page, 'value=%3Cp%3EHello%3C%2Fp%3E&count&max=8');
    const status = page.locator('.salmon-rich-text__count');
    await expect(status).toHaveText('5 / 8');
    await caretAfter(page, 'Hello');
    await page.keyboard.type(' world');
    await expect(status).toHaveText('8 / 8');
    expect(await getHtml(page)).toBe('<p>Hello wo</p>');
    await expect(page.locator('.salmon-rich-text__status [aria-live]')).toHaveText('Character limit reached');
    await paste(page, { 'text/plain': 'more text' });
    expect(await getHtml(page)).toBe('<p>Hello wo</p>');
    await page.keyboard.press('Backspace');
    await expect(status).toHaveText('7 / 8');
  });

  test('paste cleanup: Word HTML is normalized, plainText and prompt modes', async ({ page }) => {
    const word =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><p class="MsoNormal" style="mso-margin-top-alt:auto;color:red"><b>Bold</b> word<o:p></o:p></p><p onclick="x()"><img src="x" onerror="window.__xss=9">tail</p></body></html>';
    await open(page, 'empty');
    await content(page).click();
    await paste(page, { 'text/html': word, 'text/plain': 'Bold word tail' });
    await expect(content(page)).toContainText('Bold word');
    const value = await getHtml(page);
    expect(value).toContain('<strong>Bold</strong> word');
    expect(value).not.toMatch(/Mso|mso-|color:red|onclick|onerror|o:p/);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

    await open(page, 'empty&paste=plainText');
    await content(page).click();
    await paste(page, { 'text/html': '<p><b>Bold</b> text</p>', 'text/plain': 'Bold text' });
    expect(await getHtml(page)).toBe('<p>Bold text</p>');

    await open(page, 'empty&paste=prompt');
    await content(page).click();
    await paste(page, { 'text/html': '<p><b>Bold</b> text</p>', 'text/plain': 'Bold text' });
    await expect(dialog(page)).toHaveAccessibleName('Paste options');
    await dialog(page).getByRole('button', { name: 'Keep formatting' }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(await getHtml(page)).toBe('<p><strong>Bold</strong> text</p>');
  });

  test('source code view shows the HTML and sanitizes it when switching back', async ({ page }) => {
    await open(page);
    await item(page, 'sourceCode').click();
    const source = page.getByRole('textbox', { name: 'HTML source' });
    await expect(source).toBeVisible();
    await expect(source).toHaveValue(/<h2>Release notes<\/h2>/);
    await expect(content(page)).toBeHidden();
    await expect(item(page, 'bold')).toBeDisabled();
    await source.fill('<p>From <em>source</em></p><script>window.__xss=5</script><p onclick="x()">B</p>');
    await item(page, 'sourceCode').click();
    await expect(content(page)).toBeVisible();
    expect(await getHtml(page)).toBe('<p>From <em>source</em></p><p>B</p>');
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    // Switching back is one undoable step.
    await act(page, 'focus');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await getHtml(page)).toContain('<h2>Release notes</h2>');
  });

  test('fullscreen (controllable), resizable and print of the content only', async ({ page }) => {
    await open(page, 'resizable');
    const root = page.locator('.salmon-rich-text');
    await expect(root).toHaveAttribute('data-resizable', '');
    await expect(page.locator('.salmon-rich-text__body')).toHaveCSS('resize', 'vertical');
    await item(page, 'fullscreen').click();
    await expect(root).toHaveAttribute('data-fullscreen', '');
    await expect(root).toHaveCSS('position', 'fixed');
    expect((await log(page)).fullscreen).toEqual([true]);
    await page.keyboard.press('Escape');
    await expect(root).not.toHaveAttribute('data-fullscreen', '');
    expect((await log(page)).fullscreen).toEqual([true, false]);
    await page.evaluate(() => {
      new MutationObserver((records) => {
        for (const r of records)
          for (const n of r.addedNodes) if (n instanceof HTMLIFrameElement) (window as unknown as { __print: string }).__print = n.srcdoc;
      }).observe(document.body, { childList: true });
    });
    await item(page, 'print').click();
    const doc = await page.evaluate(() => (window as unknown as { __print?: string }).__print ?? '');
    expect(doc).toContain('<body><h2>Release notes</h2>');
    expect(doc).not.toContain('salmon-rich-text__toolbar');
  });

  test('enterKey, shiftEnterKey and tabKey', async ({ page }) => {
    await open(page, 'enter=br&shiftEnter=p&tab=indent');
    await caretAfter(page, 'Release');
    await page.keyboard.press('Enter');
    expect(await getHtml(page)).toContain('<h2>Release<br> notes</h2>');
    await caretAfter(page, 'some text.');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('New paragraph');
    expect(await getHtml(page)).toContain('<p>Second paragraph with some text.</p><p>New paragraph</p>');
    await page.keyboard.press('Tab');
    expect(await getHtml(page)).toContain('<p data-indent="1">New paragraph</p>');
    await page.keyboard.press('Shift+Tab');
    expect(await getHtml(page)).toContain('<p>New paragraph</p>');

    // Default: Enter splits paragraphs, Shift+Enter is a line break, Tab leaves the editor.
    await open(page);
    await caretAfter(page, 'Release');
    await page.keyboard.press('Shift+Enter');
    expect(await getHtml(page)).toContain('<h2>Release<br> notes</h2>');
    await caretAfter(page, 'some text.');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('salmon-rich-text__content'))).toBe(false);
  });

  test('commands and selection API through actionsRef', async ({ page }) => {
    await open(page);
    await act(page, 'setSelection', 1, 8);
    const sel = await act<{ from: number; to: number; text: string; empty: boolean }>(page, 'getSelection');
    expect(sel).toMatchObject({ from: 1, to: 8, text: 'Release', empty: false });
    expect(await command(page, 'bold')).toBe(true);
    expect(await getHtml(page)).toContain('<h2><strong>Release</strong> notes</h2>');
    await act(page, 'setSelection', 1);
    expect(await command(page, 'insertTable', { rows: 1, cols: 2 })).toBe(true);
    await expect(content(page).locator('table td')).toHaveCount(2);
    expect(await act(page, 'run', 'alignRight')).toBe(true);
    expect(await command(page, 'insertHtml', '<p>A <em>b</em></p><script>x</script>')).toBe(true);
    expect(await getHtml(page)).not.toContain('script');
    await act(page, 'focus');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('salmon-rich-text__content'))).toBe(true);
  });

  test('per-item disabled and custom toolbar items', async ({ page }) => {
    await open(page, 'toolbar=custom');
    const custom = item(page, 'shout');
    await expect(custom).toHaveText('Shout');
    await expect(page.locator('.salmon-rich-text__toolbar [data-item-id="italic"]').last()).toBeDisabled();
    await selectText(page, 'Second');
    await custom.click();
    expect(await getHtml(page)).toContain('SECOND paragraph');
    expect((await log(page)).toolbar).toContain('shout');
  });

  test('events: cancellable onBeforeCommand, onCommand, toolbar clicks and state changes', async ({ page }) => {
    await open(page, 'veto');
    await selectText(page, 'Second');
    await page.keyboard.press('ControlOrMeta+b');
    expect(await getHtml(page)).not.toContain('<strong>Second</strong>');
    await item(page, 'italic').click();
    expect(await getHtml(page)).toContain('<em>Second</em>');
    const events = await log(page);
    expect(events.before).toEqual(expect.arrayContaining(['bold', 'italic']));
    expect(events.commands).toEqual(expect.arrayContaining([{ command: 'italic', applied: true }]));
    expect(events.commands.find((c) => c.command === 'bold')).toBeUndefined();
    expect(events.toolbar).toContain('italic');
    expect(events.states).toBeGreaterThan(0);
  });

  test('dialog and popup events; onBeforePopupOpen can keep a quick toolbar closed', async ({ page }) => {
    await open(page, 'veto');
    await act(page, 'focus');
    await act(page, 'openDialog', 'table');
    await expect(dialog(page)).toHaveAccessibleName('Insert table');
    await act(page, 'closeDialog');
    await expect(dialog(page)).toHaveCount(0);
    const events = await log(page);
    expect(events.dialogs).toEqual(['table']);
    expect(events.closed).toEqual(['table']);
    await caretAfter(page, 'some text.');
    await command(page, 'insertTable', { rows: 1, cols: 1 });
    await page.keyboard.type('x');
    await expect.poll(async () => (await log(page)).popups).toContain('table');
    await expect(page.locator('.salmon-rich-text__quick')).toHaveCount(0);
  });

  test('placeholder, readOnly and disabled', async ({ page }) => {
    await open(page, 'empty&placeholder=Write%20something');
    const placeholder = content(page).locator('.salmon-rich-text__placeholder');
    await expect(placeholder).toHaveAttribute('data-placeholder', 'Write something');
    await content(page).click();
    await page.keyboard.type('x');
    await expect(placeholder).toHaveCount(0);

    await open(page, 'readOnly');
    await expect(content(page)).toHaveAttribute('contenteditable', 'false');
    await expect(content(page)).toHaveAttribute('aria-readonly', 'true');
    await expect(item(page, 'bold')).toBeDisabled();

    await open(page, 'disabled');
    await expect(content(page)).toHaveAttribute('contenteditable', 'false');
    await expect(content(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.salmon-rich-text')).toHaveAttribute('data-disabled', '');
  });

  test('form: name submits the HTML, reset restores defaultValue, required blocks an empty submit', async ({ page }) => {
    await open(page, 'form');
    await caretAfter(page, 'some text.');
    await page.keyboard.type(' Edited');
    await page.getByRole('button', { name: 'Submit' }).click();
    expect(await page.evaluate(() => (window as unknown as { __submitted: string }).__submitted)).toContain('some text. Edited</p>');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(content(page)).not.toContainText('Edited');
    await expect(page.locator('input[name="body"]')).toHaveValue(/some text\.<\/p>/);

    await open(page, 'form&required&empty&invalid');
    await expect(content(page)).toHaveAttribute('aria-required', 'true');
    await expect(content(page)).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Submit' }).click();
    expect(await page.evaluate(() => (window as unknown as { __submitted?: string }).__submitted)).toBeUndefined();
    await content(page).click();
    await page.keyboard.type('Now filled');
    await page.getByRole('button', { name: 'Submit' }).click();
    expect(await page.evaluate(() => (window as unknown as { __submitted?: string }).__submitted)).toBe('<p>Now filled</p>');
  });

  test('form: inside a Field the label names the editor and the Field error display shows the required error', async ({ page }) => {
    await open(page, 'field&empty');
    const editor = page.getByRole('textbox', { name: 'Article body' });
    await expect(editor).toHaveCount(1);
    const describedBy = (await editor.getAttribute('aria-describedby')) ?? '';
    expect(describedBy.length).toBeGreaterThan(0);
    await expect(page.locator(`[id="${describedBy.split(' ')[0]}"]`)).toHaveText('Shown on the front page');
    await expect(editor).not.toHaveAttribute('aria-invalid', 'true');
    // Submitting empty: the native constraint blocks it and the Field shows its error.
    await page.getByRole('button', { name: 'Submit' }).click();
    expect(await page.evaluate(() => (window as unknown as { __submitted?: string }).__submitted)).toBeUndefined();
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    const errorId = await editor.getAttribute('aria-errormessage');
    expect(errorId).toBeTruthy();
    await expect(page.locator(`[id="${errorId}"]`)).toHaveClass(/salmon-field-error/);
    await expect(page.locator(`[id="${errorId}"]`)).not.toBeEmpty();
    expect((await editor.getAttribute('aria-describedby')) ?? '').toContain(errorId!);
    await expect(page.locator('.salmon-field')).toHaveAttribute('data-invalid', '');
    // Typing clears the error; the value submits.
    await editor.click();
    await page.keyboard.type('Filled');
    await expect(editor).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.salmon-field-error')).toHaveCount(0);
    await page.getByRole('button', { name: 'Submit' }).click();
    expect(await page.evaluate(() => (window as unknown as { __submitted?: string }).__submitted)).toBe('<p>Filled</p>');
  });

  test('format painter: one click applies once, double click keeps applying, Escape ends', async ({ page }) => {
    await open(page);
    await caretAfter(page, 'wor');
    await item(page, 'formatPainter').click();
    await expect(item(page, 'formatPainter')).toHaveAttribute('aria-pressed', 'true');
    await content(page).getByText('Second paragraph').dblclick({ position: { x: 10, y: 5 } });
    await expect.poll(() => getHtml(page)).toContain('<strong>Second</strong>');
    await expect(item(page, 'formatPainter')).toHaveAttribute('aria-pressed', 'false');
    // Sticky mode.
    await caretAfter(page, 'wor');
    await item(page, 'formatPainter').dblclick();
    await expect(item(page, 'formatPainter')).toHaveAttribute('aria-pressed', 'true');
    await content(page).locator('h2').dblclick({ position: { x: 10, y: 10 } });
    await expect.poll(() => getHtml(page)).toContain('<strong>Release</strong>');
    await expect(item(page, 'formatPainter')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(item(page, 'formatPainter')).toHaveAttribute('aria-pressed', 'false');
  });

  test('toolbar overflow menu, scroll and wrap; position and sticky', async ({ page }) => {
    await open(page, 'narrow');
    const more = page.locator('.salmon-rich-text > .salmon-rich-text__toolbar [aria-label="More"]');
    await expect(more).toBeVisible();
    await expect(item(page, 'print')).toBeHidden();
    await more.click();
    await expect(page.getByRole('menuitem', { name: 'Print' })).toBeVisible();
    await page.keyboard.press('Escape');
    await open(page, 'narrow&overflow=scroll');
    const toolbar = page.locator('.salmon-rich-text > .salmon-rich-text__toolbar');
    await expect(toolbar).toHaveCSS('overflow-x', 'auto');
    expect(await toolbar.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await open(page, 'narrow&overflow=wrap');
    await expect(toolbar).toHaveCSS('flex-wrap', 'wrap');
    await expect(item(page, 'print')).toBeVisible();
    await open(page, 'position=bottom&sticky');
    expect(await page.evaluate(() => document.querySelector('.salmon-rich-text')!.lastElementChild?.previousElementSibling?.className ?? '')).toBeDefined();
    const order = await page.evaluate(() => [...document.querySelector('.salmon-rich-text')!.children].map((c) => c.className.split(' ')[0]));
    expect(order.indexOf('salmon-rich-text__toolbar')).toBeGreaterThan(order.indexOf('salmon-rich-text__body'));
    await expect(toolbar).toHaveClass(/salmon-rich-text__toolbar--sticky/);
    await expect(toolbar).toHaveCSS('position', 'sticky');
  });

  test('toolbar="floating" shows the toolbar on a text selection', async ({ page }) => {
    await open(page, 'toolbar=floating');
    await expect(page.locator('.salmon-rich-text > .salmon-rich-text__toolbar')).toHaveCount(0);
    await selectText(page, 'Second');
    const floating = page.locator('.salmon-rich-text__quick[data-quick="text"]');
    await expect(floating).toBeVisible();
    await quickItem(page, 'bold').click();
    expect(await getHtml(page)).toContain('<strong>Second</strong>');
    await caretAfter(page, 'some text.');
    await expect(floating).toHaveCount(0);
  });

  test('extensions: nodes, commands, key bindings, async plugin factory, toolbar items', async ({ page }) => {
    await open(page, 'extension');
    expect((await log(page)).extension).toEqual(['plugin-view']);
    await caretAfter(page, 'some text.');
    await item(page, 'signature').click();
    expect(await getHtml(page)).toContain('some text.-- Signed</p>');
    await page.keyboard.press('ControlOrMeta+Alt+s');
    expect(await getHtml(page)).toContain('-- Signed-- Signed</p>');
    expect(await act(page, 'run', 'insertSignature')).toBe(true);
  });

  test('keyBindings override the default table; localeText, className and style passthrough', async ({ page }) => {
    await open(page, 'keys&locale');
    await selectText(page, 'Second');
    await page.keyboard.press('ControlOrMeta+b');
    expect(await getHtml(page)).not.toContain('<strong>Second</strong>');
    await page.keyboard.press('ControlOrMeta+Shift+x');
    expect(await getHtml(page)).toContain('<s>Second</s>');
    await caretAfter(page, 'some text.');
    await page.keyboard.press('ControlOrMeta+Alt+p');
    expect(await getHtml(page)).toContain('some text.!</p>');
    await expect(item(page, 'bold')).toHaveAttribute('aria-label', 'Gras');
    await expect(page.getByRole('toolbar', { name: 'Mise en forme' })).toBeVisible();
    const root = page.locator('.salmon-rich-text');
    await expect(root).toHaveClass(/demo-editor/);
    await expect(root).toHaveCSS('max-inline-size', '900px');
  });

  test('RTL: the toolbar arrows mirror and the content inherits dir', async ({ page }) => {
    await open(page, 'dir=rtl');
    await expect(content(page)).toHaveCSS('direction', 'rtl');
    await caretAfter(page, 'some');
    await page.keyboard.press('Alt+F10');
    const first = page.locator('.salmon-rich-text > .salmon-rich-text__toolbar [data-salmon-toolbar-item]:not(:disabled)').first();
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(first).not.toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(first).toBeFocused();
  });
});
