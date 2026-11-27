import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// FileUpload in the browser. Page:
// examples/vite-spa/inputs.html, sections from src/inputs-upload.tsx. The
// fake transport of the queue sections is driven through window.__upload.

async function open(page: Page, only: string, extra = '', base = DEV_URL): Promise<void> {
  await page.goto(`${base}inputs.html?only=${only}${extra}`);
  await page.waitForFunction(() => window.__inputsReady === true);
  await page.waitForSelector('#page');
}
const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const clearEvents = (page: Page) => page.evaluate(() => void (window.__inputs = []));
const file = (name: string, size = 10, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.alloc(size, 97) });
const items = (page: Page, section: string) => page.locator(`#${section} .salmon-file-upload-item`);
const statusOf = (page: Page, section: string) => items(page, section).evaluateAll((els) => els.map((el) => `${el.querySelector('.salmon-file-upload-name')?.textContent}:${el.getAttribute('data-status')}${el.getAttribute('data-error') ? `:${el.getAttribute('data-error')}` : ''}`));
const live = (page: Page, section: string) => page.locator(`#${section} [role="status"]`);

interface DropSpec {
  readonly name: string;
  readonly size?: number;
  readonly type?: string;
}

/** Dispatches dragenter, dragover and drop with a real DataTransfer on `selector`. */
function drop(page: Page, selector: string, files: readonly DropSpec[]) {
  return page.evaluate(
    ({ selector, files }) => {
      const data = new DataTransfer();
      for (const f of files) data.items.add(new File([new Uint8Array(f.size ?? 10)], f.name, { type: f.type ?? 'text/plain' }));
      // Chrome ignores dropEffect writes outside a real drag; record what the component sets.
      let effect = 'none';
      Object.defineProperty(data, 'dropEffect', { get: () => effect, set: (v: string) => void (effect = v), configurable: true });
      const el = document.querySelector(selector)!;
      const root = el.closest('.salmon-file-upload') ?? document.querySelector('#upm')!.closest('.salmon-file-upload')!;
      const fire = (type: string) => {
        const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      };
      fire('dragenter');
      const dragging = root.hasAttribute('data-dragging');
      const overPrevented = fire('dragover');
      const set = data.dropEffect;
      fire('drop');
      return { dragging, overPrevented, effect: set, after: root.hasAttribute('data-dragging') };
    },
    { selector, files },
  );
}

test.describe('FileUpload', () => {
  test('picked files stay in the native input and submit with the form; remove and reset update FormData; required blocks an empty submit', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'upload-native');
    const input = page.locator('#upn');
    await expect(input).toHaveAttribute('type', 'file');
    await expect(input).toHaveAttribute('multiple', '');
    // Only the preloaded entry: the native input is empty, so `required` blocks the submit.
    await page.locator('#upload-submit').click();
    expect(await events(page, 'submit')).toEqual([]);
    await expect(page.locator('#upload-native .salmon-field-error')).toBeVisible();
    await expect(page.locator('#upload-native .salmon-file-upload-trigger')).toBeFocused();

    await input.setInputFiles([file('a.pdf'), file('b.pdf')]);
    expect(await statusOf(page, 'upload-native')).toEqual(['existing.pdf:uploaded', 'a.pdf:queued', 'b.pdf:queued']);
    await page.locator('#upload-submit').click();
    expect(await page.evaluate(() => window.__inputForms?.['upload'])).toEqual([
      ['docs', 'file:a.pdf'],
      ['docs', 'file:b.pdf'],
    ]);
    // Picking more appends (multiple); removing drops the file from the native input.
    await input.setInputFiles([file('c.pdf')]);
    await page.getByRole('button', { name: 'Remove a.pdf' }).click();
    await page.locator('#upload-submit').click();
    expect(await page.evaluate(() => window.__inputForms?.['upload'])).toEqual([
      ['docs', 'file:b.pdf'],
      ['docs', 'file:c.pdf'],
    ]);
    await page.locator('#upload-reset').click();
    expect(await statusOf(page, 'upload-native')).toEqual(['existing.pdf:uploaded']);
    expect(await input.evaluate((el: HTMLInputElement) => el.files?.length ?? 0)).toBe(0);
    expect(problems).toEqual([]);
  });

  test('dropping files highlights the zone, validates type, size and count, and onBeforeFilesAdd edits the list', async ({ page }) => {
    await open(page, 'upload-queue');
    const result = await drop(page, '#upload-queue .salmon-file-upload-trigger', [
      { name: 'a.txt' },
      { name: 'big.txt', size: 2000 },
      { name: 'x.pdf', type: 'application/pdf' },
      { name: 'veto.txt' },
      { name: 'b.png', type: 'image/png' },
      { name: 'c.txt' },
      { name: 'd.txt' },
    ]);
    expect(result).toEqual({ dragging: true, overPrevented: true, effect: 'copy', after: false });
    expect(await statusOf(page, 'upload-queue')).toEqual(['a.txt:uploading', 'big.txt:invalid:tooLarge', 'x.pdf:invalid:type', 'b.png:uploading', 'c.txt:queued', 'd.txt:invalid:tooMany']);
    await expect(page.locator('#upload-queue .salmon-file-upload-item[data-error="tooLarge"]')).toContainText('Larger than 1,000 bytes');
    await expect(page.locator('#upload-queue .salmon-file-upload-item[data-error="type"]')).toContainText('File type not allowed');
    await expect(page.locator('#upload-queue .salmon-file-upload-item[data-error="tooMany"]')).toContainText('More than 3 files');
    expect((await events(page, 'files'))[0]).toMatchObject({ reason: 'add' });
  });

  test('the queue runs two at a time, shows progress, settles files and announces status changes', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'upload-queue');
    await page.locator('#upq').setInputFiles([file('a.txt'), file('b.txt'), file('c.txt')]);
    expect(await page.evaluate(() => window.__upload!.pending())).toEqual(['a.txt', 'b.txt']);
    await page.evaluate(() => window.__upload!.progress('a.txt', 5, 10));
    const bar = page.locator('#upload-queue .salmon-file-upload-item').first().locator('progress');
    await expect(bar).toHaveJSProperty('value', 0.5);
    await expect(bar).toHaveAttribute('aria-label', 'a.txt');
    expect((await events(page, 'progress')).at(-1)).toEqual({ kind: 'progress', name: 'a.txt', progress: 0.5 });
    await page.evaluate(() => window.__upload!.resolve('a.txt', 'id-a'));
    await expect(live(page, 'upload-queue')).toHaveText('a.txt: Uploaded');
    expect(await statusOf(page, 'upload-queue')).toEqual(['a.txt:uploaded', 'b.txt:uploading', 'c.txt:uploading']);
    await page.evaluate(() => window.__upload!.reject('b.txt'));
    await expect(live(page, 'upload-queue')).toHaveText('b.txt: Upload failed');
    await page.evaluate(() => window.__upload!.resolve('c.txt'));
    await expect.poll(() => events(page, 'complete')).toEqual([{ kind: 'complete', files: ['a.txt:uploaded', 'b.txt:error:upload', 'c.txt:uploaded'] }]);
    expect(await events(page, 'success')).toEqual([
      { kind: 'success', name: 'a.txt', result: 'id-a' },
      { kind: 'success', name: 'c.txt', result: 'ok' },
    ]);
    expect(await events(page, 'error')).toEqual([{ kind: 'error', name: 'b.txt' }]);
    expect(problems).toEqual([]);
  });

  test('cancel aborts the transport, retry re-runs it, onBeforeRemove can veto, clear empties the list', async ({ page }) => {
    await open(page, 'upload-queue');
    await page.locator('#upq').setInputFiles([file('c.txt'), file('keep.txt')]);
    await page.getByRole('button', { name: 'Cancel c.txt' }).click();
    expect(await events(page, 'abort')).toEqual([{ kind: 'abort', name: 'c.txt' }]);
    await expect(live(page, 'upload-queue')).toHaveText('c.txt: Canceled');
    await page.getByRole('button', { name: 'Retry c.txt' }).click();
    expect(await page.evaluate(() => window.__upload!.pending())).toEqual(['keep.txt', 'c.txt']);
    await page.evaluate(() => (window.__upload!.resolve('c.txt'), window.__upload!.resolve('keep.txt')));
    await expect.poll(() => statusOf(page, 'upload-queue')).toEqual(['c.txt:uploaded', 'keep.txt:uploaded']);
    await page.getByRole('button', { name: 'Remove keep.txt' }).click();
    expect(await events(page, 'beforeRemove')).toEqual([{ kind: 'beforeRemove', name: 'keep.txt' }]);
    expect(await statusOf(page, 'upload-queue')).toEqual(['c.txt:uploaded', 'keep.txt:uploaded']);
    await page.getByRole('button', { name: 'Remove c.txt' }).click();
    expect(await statusOf(page, 'upload-queue')).toEqual(['keep.txt:uploaded']);
    await page.getByRole('button', { name: 'Clear' }).click();
    expect(await events(page, 'beforeClear')).toEqual([{ kind: 'beforeClear', count: 1 }]);
    await expect(items(page, 'upload-queue')).toHaveCount(0);
  });

  test('the FileUploadApi cancels, retries and lists files', async ({ page }) => {
    await open(page, 'upload-queue');
    await page.locator('#upq').setInputFiles([file('a.txt')]);
    const id = await page.evaluate(() => window.__upload!.api()!.getFiles()[0]!.id);
    await page.evaluate((i) => window.__upload!.api()!.cancel(i), id);
    expect(await page.evaluate(() => window.__upload!.api()!.getFiles().map((e) => e.status))).toEqual(['canceled']);
    await page.evaluate((i) => window.__upload!.api()!.retry(i), id);
    expect(await page.evaluate(() => window.__upload!.pending())).toEqual(['a.txt']);
    expect(await page.evaluate(() => window.__upload!.api()!.element?.classList.contains('salmon-file-upload'))).toBe(true);
    await page.evaluate(() => window.__upload!.api()!.focus());
    await expect(page.locator('#upload-queue .salmon-file-upload-trigger')).toBeFocused();
  });

  test('autoUpload false waits for the upload button; dropTarget accepts drops with dropEffect move', async ({ page }) => {
    await open(page, 'upload-manual');
    const result = await drop(page, '#upm-zone', [{ name: 'm.txt' }]);
    expect(result).toMatchObject({ dragging: true, overPrevented: true, effect: 'move', after: false });
    expect(await statusOf(page, 'upload-manual')).toEqual(['m.txt:queued']);
    expect(await page.evaluate(() => window.__upload?.pending() ?? [])).toEqual([]);
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    expect(await statusOf(page, 'upload-manual')).toEqual(['m.txt:uploading']);
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toHaveCount(0);
  });

  test('directory sets webkitdirectory and walks dropped folders recursively', async ({ page }) => {
    await open(page, 'upload-dir');
    await expect(page.locator('#upd')).toHaveAttribute('webkitdirectory', '');
    await page.evaluate(() => {
      // Synthetic DataTransfer items have no file system entries; stand in a folder tree.
      const fileEntry = (path: string) => ({ isFile: true, isDirectory: false, name: path.split('/').pop()!, fullPath: `/${path}`, file: (ok: (f: File) => void) => ok(new File(['x'], path.split('/').pop()!)) });
      const dir = (path: string, children: unknown[]) => {
        let done = false;
        return { isFile: false, isDirectory: true, name: path, fullPath: `/${path}`, createReader: () => ({ readEntries: (ok: (e: unknown[]) => void) => (ok(done ? [] : children), (done = true)) }) };
      };
      const tree = dir('folder', [fileEntry('folder/a.txt'), dir('folder/sub', [fileEntry('folder/sub/b.txt')])]);
      DataTransferItem.prototype.webkitGetAsEntry = function () {
        return tree as unknown as FileSystemEntry;
      };
    });
    await drop(page, '#upload-dir .salmon-file-upload-trigger', [{ name: 'folder' }]);
    await expect.poll(async () => (await events(page, 'dir')).at(-1)).toEqual({ kind: 'dir', paths: ['folder/a.txt', 'folder/sub/b.txt'] });
  });

  test('the drop zone is a button that opens the picker from the keyboard; per-file buttons carry the file name', async ({ page }) => {
    // Subscribe before the page loads: Playwright turns on file chooser interception asynchronously
    // when the first listener is added, and a chooser opened before that never emits the event.
    const chooser = page.waitForEvent('filechooser');
    await open(page, 'upload-manual');
    const trigger = page.locator('#upload-manual .salmon-file-upload-trigger');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const picker = await chooser;
    expect(picker.isMultiple()).toBe(true);
    await picker.setFiles([file('k.txt')]);
    await expect(page.getByRole('button', { name: 'Remove k.txt' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel k.txt' })).toBeVisible();
    // A queued row shows Cancel and Remove side by side: their glyphs differ.
    const glyph = (name: string) => page.getByRole('button', { name }).locator('.salmon-file-upload-icon').evaluate((el) => getComputedStyle(el).maskImage);
    expect(await glyph('Cancel k.txt')).not.toBe(await glyph('Remove k.txt'));
    await expect(trigger).toHaveAccessibleName('Manual Browse or drop files');
    await expect(live(page, 'upload-manual')).toHaveText('k.txt: Ready');
  });

  test('createXhrUploader posts multipart with the field name and headers, and resolves with the response', async ({ page }) => {
    await open(page, 'upload-xhr');
    let seen: { headers: Record<string, string>; body: string; method: string } | null = null;
    await page.route('**/__upload', async (route) => {
      const req = route.request();
      seen = { headers: req.headers(), body: req.postDataBuffer()?.toString('utf8') ?? '', method: req.method() };
      await route.fulfill({ status: 200, body: 'saved' });
    });
    await page.locator('#upx').setInputFiles([file('r.txt', 4)]);
    await expect.poll(() => events(page, 'xhr')).toEqual([{ kind: 'xhr', name: 'r.txt', result: { status: 200, body: 'saved' } }]);
    expect(seen!.method).toBe('POST');
    expect(seen!.headers['x-test']).toBe('1');
    expect(seen!.body).toContain('name="attachment"; filename="r.txt"');
    await page.unroute('**/__upload');
    await page.route('**/__upload', (route) => route.fulfill({ status: 500, body: 'no' }));
    await page.getByRole('button', { name: 'Remove r.txt' }).click();
    await page.locator('#upx').setInputFiles([file('s.txt', 4)]);
    await expect.poll(() => events(page, 'xhrError')).toEqual([{ kind: 'xhrError', name: 's.txt' }]);
  });

  test('server markup with preloaded files hydrates without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'upload-native,upload-queue,upload-dir', '&hydrate');
    await clearEvents(page);
    await page.locator('#upn').setInputFiles([file('h.pdf')]);
    expect(await statusOf(page, 'upload-native')).toEqual(['existing.pdf:uploaded', 'h.pdf:queued']);
    expect(problems).toEqual([]);
  });
});

test.describe('FileUpload performance', () => {
  test.describe.configure({ retries: 1 });
  test('a 500-file list mounts within 50 ms (production build)', { tag: '@perf' }, async ({ page }) => {
    await open(page, 'upload-perf', '', PROD_URL);
    const samples: number[] = [];
    const frames: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (i > 0) await open(page, 'upload-perf', '', PROD_URL);
      await page.locator('#perf-mount').click();
      await expect(items(page, 'upload-perf')).toHaveCount(500);
      samples.push(await page.evaluate(() => window.__perf!.mount!));
      frames.push(await page.evaluate(() => new Promise<number>((r) => requestAnimationFrame(() => r(window.__perf!.frame ?? Number.NaN)))));
    }
    const median = samples.slice().sort((a, b) => a - b)[1]!;
    console.log(`500-file mount (click to commit): ${samples.map((s) => s.toFixed(1)).join(', ')} ms (median ${median.toFixed(1)}); to the next frame: ${frames.map((s) => s.toFixed(1)).join(', ')} ms`);
    expectBudget(median, 50, '500-file mount click to commit median');
    // Including style, layout and paint (the next animation frame) stays within the budget too.
    expectBudget(frames.slice().sort((a, b) => a - b)[1]!, 50, '500-file mount to next frame median');
  });
});
