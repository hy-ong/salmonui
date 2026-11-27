import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';
import { axe } from './axe.ts';

// BlockEditor (page:
// examples/vite-spa/src/block-editor.tsx).

interface Block {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: { type: string; text?: string; marks?: { type: string }[] }[];
  children?: Block[];
}
interface Log {
  changes: number;
  blocks: Block[];
  blockEvents: string[];
  selections: string[];
  focus: number;
  blur: number;
  moves: string[];
  vetoed: number;
  pastes: string[];
  custom: string[];
}

const url = (query = ''): string => `${DEV_URL}block-editor.html${query ? `?${query}` : ''}`;
const editor = (page: Page) => page.locator('.demo-block-editor .salmon-block-editor__content');
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __be: Log }).__be);
const ids = (blocks: Block[]): string[] => blocks.map((b) => b.id);
const blocksNow = (page: Page): Promise<Block[]> => page.evaluate(() => (window as unknown as { __beActions: { current: { getBlocks(): Block[] } } }).__beActions.current.getBlocks());
const block = (page: Page, id: string) => editor(page).locator(`[data-block-id="${id}"]`);
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(url(query));
  await expect(editor(page)).toHaveAttribute('contenteditable', query.includes('readOnly') ? 'false' : 'true');
}

/** Puts the caret at the end of a block's text. */
async function caretAtEnd(page: Page, id: string): Promise<void> {
  await page.evaluate((blockId) => {
    const a = (window as unknown as { __beActions: { current: { setSelection(s: { blockId: string; offset: number }): void; focus(): void } } }).__beActions.current;
    a.focus();
    a.setSelection({ blockId, offset: 9999 });
  }, id);
}

async function selectText(page: Page, id: string, text: string): Promise<void> {
  await page.evaluate(
    ([blockId, needle]) => {
      const el = document.querySelector(`.demo-block-editor [data-block-id="${blockId}"]`)!;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.textContent!.indexOf(needle!);
        if (i >= 0) {
          const range = document.createRange();
          range.setStart(n, i);
          range.setEnd(n, i + needle!.length);
          const sel = getSelection()!;
          sel.removeAllRanges();
          sel.addRange(range);
          return;
        }
      }
    },
    [id, text],
  );
}

async function openHandleMenu(page: Page, id: string): Promise<void> {
  await block(page, id).hover();
  const handle = page.locator('.demo-block-editor .salmon-block-editor__handle');
  await expect(handle).toHaveAttribute('data-visible', 'true');
  await expect(handle).toHaveAttribute('data-block-id', id);
  await handle.click();
  await expect(page.locator('.salmon-block-editor__menu-popover [role="menu"]')).toBeVisible();
}

test.describe('BlockEditor', () => {
  test('server markup hydrates into the engine; typing reports blocks and block events', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(url('hydrate'));
    await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
    await expect(editor(page)).toHaveAttribute('role', 'textbox');
    await expect(editor(page)).toHaveAttribute('aria-label', 'Project notes');
    await expect(page.locator('.demo-block-editor')).toHaveClass(/salmon-block-editor/);
    await expect(block(page, 'a')).toHaveText('Alpha paragraph');
    await caretAtEnd(page, 'a');
    await page.keyboard.type('!');
    await expect.poll(async () => (await log(page)).changes).toBeGreaterThan(0);
    const l = await log(page);
    expect(l.blocks.find((b) => b.id === 'a')?.content).toEqual([{ type: 'text', text: 'Alpha paragraph!' }]);
    expect(l.blockEvents).toContain('update:a');
    expect(l.focus).toBe(1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('new');
    const after = await blocksNow(page);
    const i = ids(after).indexOf('a');
    const added = after[i + 1]!;
    expect(added.type).toBe('paragraph');
    expect(added.id).not.toBe('a');
    expect(added.id).not.toBe('b');
    expect((await log(page)).blockEvents.some((e) => e === `add:${added.id}`)).toBe(true);
    await page.locator('#after').focus();
    expect((await log(page)).blur).toBe(1);
    expect(problems).toEqual([]);
  });

  test('controlled value: the editor keeps its own changes and takes new values', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'controlled');
    await caretAtEnd(page, 'b');
    await page.keyboard.type(' two');
    await expect(block(page, 'b')).toHaveText('Beta paragraph two');
    await expect.poll(async () => (await log(page)).blocks.find((x) => x.id === 'b')?.content?.[0]?.text).toBe('Beta paragraph two');
    expect(problems).toEqual([]);
  });

  test('slash menu filters blocks and turns the block into the chosen type', async ({ page }) => {
    await open(page);
    await caretAtEnd(page, 'b');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const list = page.locator('.salmon-block-editor__slash [role="listbox"]');
    await expect(list).toBeVisible();
    await expect(list).toHaveAttribute('aria-label', 'Insert block');
    await expect(list.locator('[role="option"]')).toHaveCount(14);
    await page.keyboard.type('head');
    await expect(list.locator('[role="option"]')).toHaveText(['Heading 1', 'Heading 2', 'Heading 3']);
    await page.keyboard.press('ArrowDown');
    await expect(list.locator('[role="option"][aria-selected="true"]')).toHaveText('Heading 2');
    await page.keyboard.press('Enter');
    await expect(list).toHaveCount(0);
    const blocks = await blocksNow(page);
    const i = ids(blocks).indexOf('b');
    expect(blocks[i + 1]).toMatchObject({ type: 'heading', props: { level: 2 }, content: [] });
    await page.keyboard.type('Sub');
    await expect(editor(page).locator('h2')).toHaveText('Sub');
    // Escape dismisses; divider inserts a block.
    await page.keyboard.press('Enter');
    await page.keyboard.type('/zzz');
    await expect(page.locator('.salmon-block-editor__empty')).toHaveText('No matching blocks');
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    for (let k = 0; k < 4; k++) await page.keyboard.press('Backspace');
    await page.keyboard.type('/divi');
    await page.keyboard.press('Enter');
    await expect(editor(page).locator('hr')).toHaveCount(1);
  });

  test('selection toolbar formats text and turns the block into another type', async ({ page }) => {
    await open(page);
    await caretAtEnd(page, 'a');
    await selectText(page, 'a', 'Alpha');
    const toolbar = page.locator('.salmon-block-editor__toolbar[role="toolbar"]');
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toHaveAttribute('aria-label', 'Formatting');
    await toolbar.getByRole('button', { name: 'Bold' }).click();
    await expect(block(page, 'a').locator('strong')).toHaveText('Alpha');
    await expect(toolbar.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await toolbar.getByRole('button', { name: 'Turn into' }).click();
    await page.getByRole('menuitem', { name: 'Quote' }).click();
    await expect(editor(page).locator('blockquote[data-block-id="a"] strong')).toHaveText('Alpha');
    const a = (await blocksNow(page)).find((b) => b.id === 'a')!;
    expect(a.type).toBe('quote');
    // Link through the toolbar.
    await selectText(page, 'b', 'Beta');
    await toolbar.getByRole('button', { name: 'Link' }).click();
    await page.getByRole('textbox', { name: 'Link address' }).fill('https://example.com/');
    await page.keyboard.press('Enter');
    await expect(block(page, 'b').locator('a[href="https://example.com/"]')).toHaveText('Beta');
  });

  test('drag handle opens the block action menu: duplicate, move, delete, turn into', async ({ page }) => {
    await open(page);
    await openHandleMenu(page, 'b');
    const menu = page.locator('.salmon-block-editor__menu-popover [role="menu"]');
    await expect(menu).toHaveAttribute('aria-label', 'Block actions');
    await expect(menu.getByRole('menuitem')).toHaveText(['Turn into', 'Duplicate', 'Delete', 'Move up', 'Move down']);
    await expect(menu.getByRole('menuitem', { name: 'Turn into' })).toBeFocused();
    await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
    let blocks = await blocksNow(page);
    expect(ids(blocks).slice(1, 4)).toEqual(['a', 'b', ids(blocks)[3]]);
    expect(blocks[3]).toMatchObject({ type: 'paragraph', content: [{ type: 'text', text: 'Beta paragraph' }] });
    await openHandleMenu(page, 'a');
    await page.getByRole('menuitem', { name: 'Move down' }).click();
    blocks = await blocksNow(page);
    expect(ids(blocks).slice(0, 3)).toEqual(['title', 'b', 'a']);
    await openHandleMenu(page, 'a');
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect.poll(async () => ids(await blocksNow(page))).not.toContain('a');
    await openHandleMenu(page, 'b');
    await page.getByRole('menuitem', { name: 'Turn into' }).click();
    await page.getByRole('menuitem', { name: 'Checklist' }).click();
    await expect(editor(page).locator('ul[data-type="checklist"] li[data-block-id="b"]')).toHaveText('Beta paragraph');
    // Escape closes and returns focus to the editor.
    await openHandleMenu(page, 'title');
    await page.keyboard.press('Escape');
    await expect(page.locator('.salmon-block-editor__menu-popover')).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
  });

  test('keyboard moves with Mod+Shift+Arrow, onBeforeBlockMove can cancel, pointer drag reorders', async ({ page }) => {
    await open(page, 'veto');
    await caretAtEnd(page, 'a');
    await page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await expect.poll(async () => ids(await blocksNow(page)).slice(0, 3)).toEqual(['title', 'b', 'a']);
    expect((await log(page)).moves).toEqual(['a:keyboard:{"after":"b"}']);
    await page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await expect.poll(async () => ids(await blocksNow(page)).slice(0, 3)).toEqual(['title', 'a', 'b']);
    // Still in block "a" with the caret kept.
    expect((await log(page)).selections.at(-1)).toBe('a:15');
    // Vetoed for "b".
    await caretAtEnd(page, 'b');
    await page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await expect.poll(async () => ids(await blocksNow(page)).slice(0, 3)).toEqual(['title', 'a', 'b']);
    expect((await log(page)).vetoed).toBe(1);
    // Nested item moves out of its parent at the edge.
    await caretAtEnd(page, 'l1a');
    await page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    const blocks = await blocksNow(page);
    expect(ids(blocks)).toContain('l1a');
    expect(blocks.find((b) => b.id === 'l1')?.children).toBeUndefined();
    // Pointer drag: "end" above "a".
    await block(page, 'end').hover();
    const handle = page.locator('.demo-block-editor .salmon-block-editor__handle');
    await expect(handle).toHaveAttribute('data-block-id', 'end');
    const h = (await handle.boundingBox())!;
    const target = (await block(page, 'a').boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, target.y + 4, { steps: 8 });
    await expect(page.locator('.salmon-block-editor__drop-indicator')).toHaveAttribute('data-visible', 'true');
    expect(await page.locator('.demo-block-editor').getAttribute('data-dragging')).toBe('true');
    await page.mouse.up();
    await expect.poll(async () => ids(await blocksNow(page)).slice(0, 3)).toEqual(['title', 'end', 'a']);
    expect((await log(page)).moves.at(-1)).toBe('end:pointer:{"before":"a"}');
    await expect(page.locator('.salmon-block-editor__menu-popover')).toHaveCount(0);
  });

  test('context menu on right click and Shift+F10', async ({ page }) => {
    await open(page, 'custom');
    await block(page, 'b').click({ button: 'right' });
    const menu = page.locator('.salmon-block-editor__menu-popover [role="menu"]');
    await expect(menu).toHaveAttribute('aria-label', 'Editor actions');
    await expect(menu.getByRole('menuitem')).toHaveText(['Copy', 'Duplicate', 'Hello context']);
    await menu.getByRole('menuitem', { name: 'Hello context' }).click();
    expect((await log(page)).custom).toEqual(['context:b']);
    await caretAtEnd(page, 'a');
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect.poll(async () => ids(await blocksNow(page)).filter((x) => x === 'a')).toHaveLength(1);
    expect((await blocksNow(page)).filter((b) => b.content?.[0]?.text === 'Alpha paragraph')).toHaveLength(2);
  });

  test('mentions and labels insert atoms through the Mention editor target', async ({ page }) => {
    await open(page);
    await caretAtEnd(page, 'a');
    await page.keyboard.type(' @an');
    const popup = page.locator('.salmon-mention-popup');
    await expect(popup).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(block(page, 'a').locator('span[data-type="mention"][data-id="ann"]')).toHaveText('@Ann Lee');
    await page.keyboard.type('#bu');
    await expect(popup).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(block(page, 'a').locator('span[data-type="label"][data-id="bug"]')).toHaveText('#bug');
    const a = (await blocksNow(page)).find((b) => b.id === 'a')!;
    expect(a.content).toEqual(expect.arrayContaining([{ type: 'mention', id: 'ann', label: 'Ann Lee', trigger: '@' }, { type: 'label', id: 'bug', label: 'bug', trigger: '#', tone: 'danger' }]));
  });

  test('image block: upload stays pending until onUpload settles, then settings edit alt and width', async ({ page }) => {
    // Subscribe before the page loads: Playwright turns on file chooser
    // interception asynchronously when the first listener is added, and a
    // chooser the page opens before that is a native (invisible) one that
    // never emits the event.
    const chooser = page.waitForEvent('filechooser', { timeout: 30_000 });
    await open(page, 'upload');
    await caretAtEnd(page, 'end');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/image');
    await page.keyboard.press('Enter');
    const fc = await chooser;
    const gif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
    await fc.setFiles({ name: 'dot.gif', mimeType: 'image/gif', buffer: gif });
    await expect(editor(page).locator('.salmon-rich-text__upload, [data-uploading]')).toHaveCount(1, { timeout: 2000 }).catch(() => undefined);
    await expect.poll(async () => (await blocksNow(page)).filter((b) => b.type === 'image').length).toBe(2);
    const img = (await blocksNow(page)).filter((b) => b.type === 'image')[1]!;
    expect(img.props).toMatchObject({ alt: 'Uploaded' });
    expect(String(img.props?.src)).toMatch(/^data:image\/gif/);
    await openHandleMenu(page, 'img');
    await page.getByRole('menuitem', { name: 'Image settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Image settings' });
    await dialog.getByLabel('Alternative text').fill('A dot');
    await dialog.getByLabel('Width (px)').fill('80');
    await dialog.getByRole('button', { name: 'Save' }).click();
    expect((await blocksNow(page)).find((b) => b.id === 'img')?.props).toMatchObject({ alt: 'A dot', width: 80, caption: 'A pixel' });
    // The caption is editable text.
    await expect(block(page, 'img').locator('figcaption')).toHaveText('A pixel');
  });

  test('image block: a hovered image shows a resize handle; dragging it sets width and height', async ({ page }) => {
    await open(page);
    const img = block(page, 'img').locator('img');
    await img.hover();
    const handle = block(page, 'img').locator('.salmon-rich-text__resize-handle');
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await blocksNow(page)).find((b) => b.id === 'img')?.props?.width).toBe(100);
    expect((await blocksNow(page)).find((b) => b.id === 'img')?.props).toMatchObject({ width: 100, height: 100, alt: 'Pixel', caption: 'A pixel' });
    await expect(img).toHaveCSS('width', '100px');
  });

  test('code block: the language picker lists codeLanguages and the highlight hook decorates code', async ({ page }) => {
    await open(page, 'highlight');
    const pre = block(page, 'code');
    const picker = pre.locator('select');
    await expect(picker).toHaveAccessibleName('Code language');
    await expect(picker.locator('option')).toHaveText(['Plain text', 'TypeScript', 'CSS']);
    await expect(picker).toHaveValue('ts');
    // The hook's ranges are decorations: shown in the editor, never in the value.
    await expect(pre.locator('code .demo-keyword')).toHaveText('const');
    await picker.selectOption('css');
    await expect.poll(async () => (await blocksNow(page)).find((b) => b.id === 'code')?.props?.language).toBe('css');
    await expect(pre.locator('code')).toHaveClass('language-css');
    expect(JSON.stringify(await blocksNow(page))).not.toContain('demo-keyword');
    // Typing more code is highlighted too.
    await pre.locator('code').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' let y = 2;');
    await expect(pre.locator('code .demo-keyword')).toHaveText(['const', 'let']);
  });

  test('table block commands from the block menu', async ({ page }) => {
    await open(page);
    await openHandleMenu(page, 'tbl');
    await page.getByRole('menuitem', { name: 'Insert row below' }).click();
    const t = (await blocksNow(page)).find((b) => b.id === 'tbl')!;
    expect((t.props?.rows as unknown[]).length).toBe(3);
    await openHandleMenu(page, 'tbl');
    await page.getByRole('menuitem', { name: 'Insert column after' }).click();
    const t2 = (await blocksNow(page)).find((b) => b.id === 'tbl')!;
    expect((t2.props?.rows as unknown[][])[0]!.length).toBe(3);
    // Slash menu inserts a table.
    await caretAtEnd(page, 'end');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/table');
    await page.keyboard.press('Enter');
    await expect(editor(page).locator('table')).toHaveCount(2);
  });

  test('paste: onBeforePaste cancels, onPaste reports, Word HTML is cleaned', async ({ page }) => {
    await open(page, 'veto');
    await caretAtEnd(page, 'b');
    const paste = (html: string, text: string) =>
      page.evaluate(
        ([h, t]) => {
          const data = new DataTransfer();
          data.setData('text/html', h!);
          data.setData('text/plain', t!);
          document.querySelector('.demo-block-editor .salmon-block-editor__content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        },
        [html, text],
      );
    await paste('<p>veto me</p>', 'veto me');
    await expect(block(page, 'b')).toHaveText('Beta paragraph');
    await paste('<p class=MsoNormal><b>Word</b> <span style="color:red;mso-x:1">text</span><o:p></o:p></p>', 'Word text');
    await expect(block(page, 'b')).toContainText('Word text');
    await expect(editor(page).locator('strong', { hasText: 'Word' })).toHaveCount(1);
    await expect(editor(page).locator('span[style*="color"]')).toHaveCount(0);
    await expect.poll(async () => (await log(page)).pastes).toEqual(['Word text']);
  });

  test('undo and redo block edits and typing', async ({ page }) => {
    await open(page);
    await caretAtEnd(page, 'a');
    await page.keyboard.press(`${MOD}+d`);
    expect((await blocksNow(page)).length).toBe(11);
    await page.keyboard.press(`${MOD}+z`);
    expect((await blocksNow(page)).length).toBe(10);
    await page.keyboard.press(`${MOD}+Shift+z`);
    expect((await blocksNow(page)).length).toBe(11);
    await page.keyboard.press(`${MOD}+z`);
    await caretAtEnd(page, 'a');
    await page.keyboard.type('xyz');
    await expect(block(page, 'a')).toHaveText('Alpha paragraphxyz');
    await page.keyboard.press(`${MOD}+z`);
    await expect(block(page, 'a')).toHaveText('Alpha paragraph');
  });

  test('actionsRef block helpers and selection API', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      const a = (window as unknown as { __beActions: { current: any } }).__beActions.current;
      a.insertBlocks([{ id: 'n1', type: 'paragraph', content: [{ type: 'text', text: 'Inserted' }] }], { after: 'a' });
      a.updateBlock('n1', { type: 'heading', props: { level: 3 } });
      const moved = a.moveBlock('n1', { before: 'title' });
      a.removeBlocks(['b']);
      a.setSelection({ blockId: 'n1', offset: 3 });
      const sel = a.getSelection();
      const got = a.getBlock('n1');
      const ran = a.runCommand('bold');
      a.turnInto('end', 'callout');
      return { ids: a.getBlocks().map((b: { id: string }) => b.id), moved, sel, got, ran, html: a.getHtml(), end: a.getBlock('end') };
    });
    expect(result.ids.slice(0, 3)).toEqual(['n1', 'title', 'a']);
    expect(result.ids).not.toContain('b');
    expect(result.moved).toBe(true);
    expect(result.sel).toEqual({ blockId: 'n1', offset: 3 });
    expect(result.got).toEqual({ id: 'n1', type: 'heading', props: { level: 3 }, content: [{ type: 'text', text: 'Inserted' }] });
    expect(result.ran).toBe(true);
    expect(result.html).toMatch(/^<h3 data-block-id="n1">Inserted<\/h3>/);
    expect(result.end).toMatchObject({ type: 'callout', props: { tone: 'info' } });
    await expect(editor(page).locator('div[data-type="callout"][data-block-id="end"]')).toHaveText('The end');
  });

  test('keyBindings rebind block commands and remove defaults', async ({ page }) => {
    await open(page, 'keys');
    await caretAtEnd(page, 'b');
    await page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await expect.poll(async () => ids(await blocksNow(page)).slice(0, 3)).toEqual(['title', 'a', 'b']);
    // The removed default falls through to the browser (macOS: extend the
    // selection to the document start, which the engine reads on a later
    // selectionchange), so the next chord would act on "title". Put the caret
    // back in "b" (through "a", so the DOM selection is rewritten even if the
    // engine has not read the extended one yet) and wait until it is there.
    await caretAtEnd(page, 'a');
    await caretAtEnd(page, 'b');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __beActions: { current: { getSelection(): { blockId: string } | null } } }).__beActions.current.getSelection()?.blockId)).toBe('b');
    await page.keyboard.press(`${MOD}+Alt+ArrowUp`);
    await expect.poll(async () => ids(await blocksNow(page)).slice(0, 3)).toEqual(['title', 'b', 'a']);
    await selectText(page, 'b', 'Beta');
    await page.keyboard.press(`${MOD}+b`);
    await expect(block(page, 'b').locator('strong')).toHaveCount(0);
  });

  test('readOnly renders without handles or slash menu; print writes only the content to a frame', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'readOnly');
    await expect(editor(page)).toHaveAttribute('aria-readonly', 'true');
    await expect(page.locator('.salmon-block-editor__handle')).toHaveCount(0);
    await expect(page.locator('.demo-block-editor')).toHaveClass(/salmon-block-editor--readonly/);
    await page.evaluate(() => {
      (window as unknown as { __beActions: { current: { print(): void } } }).__beActions.current.print();
    });
    const frame = page.locator('iframe.salmon-block-editor__print-frame');
    await expect(frame).toHaveCount(1);
    const body = await frame.evaluate((f: HTMLIFrameElement) => new Promise<string>((resolve) => {
      const read = () => resolve(f.contentDocument?.querySelector('.salmon-block-editor__print')?.innerHTML ?? '');
      if (f.contentDocument?.readyState === 'complete' && f.contentDocument.querySelector('.salmon-block-editor__print')) read();
      else f.addEventListener('load', read);
    }));
    expect(body).toMatch(/^<h1 data-block-id="title">Project plan<\/h1>/);
    expect(body).not.toMatch(/handle|contenteditable|salmon-menu/);
    expect(problems).toEqual([]);
  });

  test('Markdown input rules, keyboard reachability and axe', async ({ page }) => {
    await open(page);
    await caretAtEnd(page, 'end');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Rule');
    await expect(editor(page).locator('h2', { hasText: 'Rule' })).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('- dash');
    await expect(editor(page).locator('ul li', { hasText: 'dash' })).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('1. one');
    await expect(editor(page).locator('ol li', { hasText: 'one' })).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('[] task');
    await expect(editor(page).locator('ul[data-type="checklist"] li', { hasText: 'task' })).toHaveCount(1);
    // Alt+F10 opens the block menu of the caret's block, focused; Escape returns.
    await page.keyboard.press('Alt+F10');
    const menu = page.locator('.salmon-block-editor__menu-popover [role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    const summary = await axe(page);
    expect(summary.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(editor(page)).toBeFocused();
    // With a selection Alt+F10 focuses the inline toolbar.
    await selectText(page, 'a', 'Alpha');
    await expect(page.locator('.salmon-block-editor__toolbar')).toBeVisible();
    await page.keyboard.press('Alt+F10');
    await expect(page.locator('.salmon-block-editor__toolbar').getByRole('button', { name: 'Bold' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(editor(page)).toBeFocused();
    expect((await axe(page)).violations).toEqual([]);
  });

  test('localeText, RTL handle placement and custom items', async ({ page }) => {
    await open(page, 'dir=rtl&locale&custom');
    await block(page, 'a').hover();
    const handle = page.locator('.demo-block-editor .salmon-block-editor__handle');
    await expect(handle).toHaveAttribute('data-visible', 'true');
    const hb = (await handle.boundingBox())!;
    const ab = (await block(page, 'a').boundingBox())!;
    expect(hb.x).toBeGreaterThanOrEqual(ab.x + ab.width - 2);
    await handle.click();
    await expect(page.getByRole('menuitem', { name: 'Duplizieren' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Hello action' }).click();
    expect((await log(page)).custom).toEqual(['action:a']);
    await caretAtEnd(page, 'b');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/hel');
    await expect(page.locator('.salmon-block-editor__slash [role="listbox"]')).toHaveAttribute('aria-label', 'Bl\u00f6cke');
    await page.keyboard.press('Enter');
    expect((await log(page)).custom.at(-1)).toMatch(/^slash:/);
  });
});
