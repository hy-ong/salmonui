import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers.ts';
import { act, item, log, openPdf, pageEl, pages, scrollTo, selectText, viewer, viewport } from './pdf-viewer-helpers.ts';

// PdfViewer (page:
// examples/vite-spa/src/pdf-viewer.tsx, fixture tests/browser/fixtures/sample.pdf).
// Accessibility, keyboard, SSR and mobile checks are in pdf-viewer-a11y.spec.ts.

test.describe('PdfViewer loading', () => {
  test('loads a URL with the bundled worker: canvas, text layer and labelled page regions', async ({ page }) => {
    const problems = collectProblems(page);
    await openPdf(page);
    const l = await log(page);
    expect(l.loads[0]).toEqual({ pageCount: 3, title: null, outline: ['Introduction', 'Details'], formFields: ['fullName', 'subscribe'] });
    await expect(pageEl(page, 1)).toHaveAttribute('role', 'region');
    await expect(pageEl(page, 1)).toHaveAttribute('aria-label', 'Page 1 of 3');
    await expect(pageEl(page, 1).locator('.salmon-pdf-viewer__text-layer')).toContainText('Salmon PDF Viewer');
    const canvas = pageEl(page, 1).locator('canvas');
    // The canvas is rendered at device pixel ratio 2.
    const [w, cssW] = await canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.getBoundingClientRect().width]);
    expect(w / cssW).toBeGreaterThan(1.9);
    await expect(viewer(page)).toHaveAttribute('data-status', 'ready');
    // pdf.js loaded lazily: a module worker runs the engine.
    expect(page.workers().length).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  for (const src of ['bytes', 'buffer', 'blob'] as const) {
    test(`loads ${src} sources`, async ({ page }) => {
      await openPdf(page, `src=${src}`);
      expect((await log(page)).loads[0]?.pageCount).toBe(3);
    });
  }

  test('workerSrc overrides the bundled worker', async ({ page }) => {
    await openPdf(page, 'worker');
    expect(page.workers().some((w) => w.url().includes('pdf.worker'))).toBe(true);
  });

  test('a broken document reports onLoadError and shows the error state', async ({ page }) => {
    await page.route(/sample\.pdf$/, (route) => route.fulfill({ status: 200, contentType: 'application/pdf', body: 'not a pdf' }));
    await openPdf(page, '', { wait: false });
    await expect.poll(async () => (await log(page)).errors.length, { timeout: 20_000 }).toBe(1);
    await expect(viewer(page)).toHaveAttribute('data-status', 'error');
    await expect(page.getByRole('status').filter({ hasText: 'could not be loaded' })).toBeVisible();
  });
});

test.describe('PdfViewer passwords', () => {
  test('the built-in dialog asks, reports a wrong password and opens with the right one', async ({ page }) => {
    await openPdf(page, 'src=protected', { wait: false });
    const dialog = page.getByRole('dialog', { name: 'Password required' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByLabel('Password')).toBeFocused();
    await dialog.getByLabel('Password').fill('wrong');
    await dialog.getByRole('button', { name: 'Open' }).click();
    await expect(dialog.getByText('Incorrect password')).toBeVisible();
    await dialog.getByLabel('Password').fill('salmon');
    await dialog.getByRole('button', { name: 'Open' }).click();
    await expect.poll(async () => (await log(page)).loads.length, { timeout: 20_000 }).toBe(1);
    await expect(dialog).toBeHidden();
  });

  test('cancel reports a PasswordException', async ({ page }) => {
    await openPdf(page, 'src=protected', { wait: false });
    const dialog = page.getByRole('dialog', { name: 'Password required' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(async () => (await log(page)).errors[0]).toContain('PasswordException');
  });

  test('the password prop opens it without a prompt; onPasswordRequired replaces the dialog', async ({ page }) => {
    await openPdf(page, 'src=protected&password=salmon');
    expect((await log(page)).passwords).toEqual([]);
    await openPdf(page, 'src=protected&customPassword&wrongFirst');
    expect((await log(page)).passwords).toEqual(['required', 'incorrect']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('PdfViewer layout and virtualization', () => {
  test('only pages near the viewport are rendered; scrolling mounts the rest and reports the page', async ({ page }) => {
    await openPdf(page, 'src=bytes&extra=40&zoom=1');
    const count = await pages(page).count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(6);
    await expect(page.locator('.salmon-pdf-viewer__pages')).toHaveCSS('height', /\d{5}px/);
    await scrollTo(page, 1e7);
    await expect(pageEl(page, 43)).toBeAttached();
    await expect(pageEl(page, 1)).toHaveCount(0);
    await expect.poll(async () => (await log(page)).pages.at(-1)).toEqual({ page: 43, source: 'scroll' });
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('43');
    await expect(pageEl(page, 43).locator('canvas')).toHaveCount(1);
  });

  test('scroll modes and spreads place pages', async ({ page }) => {
    const box = (n: number) => pageEl(page, n).evaluate((el: HTMLElement) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth }));
    await openPdf(page, 'scroll=horizontal&zoom=0.5');
    let [a, b] = [await box(1), await box(2)];
    expect(b.x).toBeGreaterThan(a.x + a.w - 1);
    await openPdf(page, 'scroll=wrapped&zoom=0.5');
    [a, b] = [await box(1), await box(2)];
    expect(b.y).toBe(a.y);
    await openPdf(page, 'spread=odd&zoom=0.5');
    [a, b] = [await box(1), await box(2)];
    expect(b.y).toBe(a.y);
    expect(b.x).toBeGreaterThan(a.x);
    await openPdf(page, 'spread=even&zoom=0.5');
    [a, b] = [await box(1), await box(2)];
    expect(b.y).toBeGreaterThan(a.y);
    // 'page': one page at a time; next replaces it.
    await openPdf(page, 'scroll=page&zoom=0.5');
    await expect(pages(page)).toHaveCount(1);
    await item(page, 'next').click();
    await expect(pageEl(page, 2)).toBeAttached();
    await expect(pages(page)).toHaveCount(1);
  });
});

test.describe('PdfViewer toolbar', () => {
  test('default items in order, all inside one APG toolbar', async ({ page }) => {
    await openPdf(page);
    const ids = await page.locator('.salmon-pdf-viewer__toolbar [data-item-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-item-id')));
    expect(ids).toEqual(['sidebar', 'previous', 'next', 'zoomOut', 'zoom', 'zoomIn', 'search', 'highlight', 'underline', 'strikethrough', 'print', 'download']);
    await expect(page.getByRole('toolbar', { name: 'PDF tools' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('1');
  });

  test('custom item lists with a custom button; toolbar={false}; renderToolbar', async ({ page }) => {
    await openPdf(page, 'toolbar=custom');
    const ids = await page.locator('.salmon-pdf-viewer__toolbar [data-item-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-item-id')));
    expect(ids).toEqual(['previous', 'next', 'zoomOut', 'zoomIn', 'stamp', 'download']);
    await page.getByRole('button', { name: 'Stamp' }).click();
    expect((await log(page)).custom).toBe(1);
    await openPdf(page, 'toolbar=none');
    await expect(page.getByRole('toolbar')).toHaveCount(0);
    await openPdf(page, 'toolbar=render');
    await expect(page.getByRole('toolbar', { name: 'App tools' })).toBeVisible();
    await expect(page.getByTestId('render-state')).toHaveText('1/3');
  });
});

test.describe('PdfViewer zoom', () => {
  test('toolbar, menu and keyboard zoom report onZoomChange and resize the pages', async ({ page }) => {
    await openPdf(page, 'zoom=1');
    const width = () => pageEl(page, 1).evaluate((el: HTMLElement) => el.offsetWidth);
    expect(await width()).toBe(816);
    await item(page, 'zoomIn').click();
    await expect.poll(width).toBe(Math.round(612 * (4 / 3) * 1.1));
    await viewport(page).focus();
    await page.keyboard.press('ControlOrMeta+Minus');
    await expect.poll(width).toBe(816);
    await page.keyboard.press('ControlOrMeta+Equal');
    expect((await log(page)).zooms.map((z) => z.source)).toEqual(['toolbar', 'keyboard', 'keyboard']);
    await item(page, 'zoom').click();
    await page.getByRole('menuitem', { name: 'Page width' }).click();
    const vw = await viewport(page).evaluate((el: HTMLElement) => el.clientWidth);
    await expect.poll(width).toBe(vw - 32);
    expect((await log(page)).zooms.at(-1)?.zoom).toBe('page-width');
    await expect(item(page, 'zoom')).toHaveText(/\d+%/);
  });

  test('controlled zoom follows the prop; Ctrl+wheel (trackpad pinch) zooms on settle', async ({ page }) => {
    await openPdf(page, 'controlled&zoom=1');
    const width = () => pageEl(page, 1).evaluate((el: HTMLElement) => el.offsetWidth);
    await page.locator('#set-zoom-2').click();
    await expect.poll(width).toBe(1632);
    const vp = await viewport(page).boundingBox();
    await page.mouse.move(vp!.x + 200, vp!.y + 200);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -50);
    await page.mouse.wheel(0, -50);
    await page.keyboard.up('Control');
    // The gesture is a CSS transform until it settles.
    await expect(page.locator('.salmon-pdf-viewer__pages')).toHaveAttribute('style', /scale\(/);
    await expect.poll(async () => (await log(page)).zooms.at(-1)?.source).toBe('wheel');
    expect(Number((await log(page)).zooms.at(-1)?.zoom)).toBeGreaterThan(2);
    await expect(page.locator('.salmon-pdf-viewer__pages')).not.toHaveAttribute('style', /scale\(/);
  });
});

test.describe('PdfViewer navigation and links', () => {
  test('next / previous, the page box and goToPage', async ({ page }) => {
    await openPdf(page);
    await item(page, 'next').click();
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('2');
    const input = page.getByRole('textbox', { name: 'Page' });
    await input.fill('3');
    await input.press('Enter');
    await expect(input).toHaveValue('3');
    await act(page, 'goToPage', 1);
    await expect(input).toHaveValue('1');
    expect((await log(page)).pages.map((p) => `${p.page}:${p.source}`)).toEqual(['2:toolbar', '3:toolbar', '1:api']);
    await expect(item(page, 'previous')).toBeDisabled();
  });

  test('controlled page follows the prop', async ({ page }) => {
    await openPdf(page, 'controlled');
    await page.locator('#set-page-3').click();
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('3');
    await expect(pageEl(page, 3)).toBeInViewport();
  });

  test('internal links navigate; external links open in linkTarget and onLinkClick can cancel', async ({ page }) => {
    await openPdf(page, 'zoom=1');
    const links = pageEl(page, 1).locator('.salmon-pdf-viewer__annotation-layer a');
    await expect(links).toHaveCount(2);
    const external = links.nth(1);
    await expect(external).toHaveAttribute('href', 'https://example.com/');
    await expect(external).toHaveAttribute('target', '_blank');
    await expect(external).toHaveAttribute('rel', /noopener/);
    await links.nth(0).click();
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('3');
    expect((await log(page)).links).toEqual([{ url: null, page: 3 }]);
    expect((await log(page)).pages.at(-1)).toEqual({ page: 3, source: 'link' });

    await openPdf(page, 'zoom=1&preventLinks');
    const popup = page.waitForEvent('popup', { timeout: 1000 }).catch(() => null);
    await pageEl(page, 1).locator('.salmon-pdf-viewer__annotation-layer a').nth(1).click();
    expect(await popup).toBeNull();
    expect((await log(page)).links).toEqual([{ url: 'https://example.com/', page: null }]);
    await pageEl(page, 1).locator('.salmon-pdf-viewer__annotation-layer a').nth(0).click();
    await page.waitForTimeout(200);
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('1');
  });
});

test.describe('PdfViewer panels', () => {
  test('bookmarks: the outline on a TreeView navigates', async ({ page }) => {
    await openPdf(page, 'sidebar=outline');
    const tree = page.getByRole('tree', { name: 'Bookmarks' });
    await expect(tree.getByRole('treeitem')).toHaveCount(2);
    await tree.getByRole('treeitem', { name: 'Details' }).locator('[aria-hidden="true"]').first().click().catch(() => {});
    await tree.getByRole('treeitem', { name: 'Details' }).focus();
    await page.keyboard.press('ArrowRight');
    await tree.getByRole('treeitem', { name: 'Form' }).click();
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('3');
    expect((await log(page)).pages.at(-1)).toEqual({ page: 3, source: 'outline' });
  });

  test('a narrow viewer keeps defaultSidebar closed so the panel does not cover the pages; the toolbar still opens it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // `narrow`: a 360px wide viewer (the sidebar overlays the pages at <= 480px).
    await openPdf(page, 'sidebar=outline&narrow');
    await expect(viewer(page)).not.toHaveAttribute('data-sidebar', /.+/);
    await expect(page.getByRole('tree', { name: 'Bookmarks' })).toHaveCount(0);
    expect((await log(page)).sidebars).toEqual([]);
    await item(page, 'sidebar').click();
    await expect(viewer(page)).toHaveAttribute('data-sidebar', 'thumbnails');
  });

  test('thumbnails: virtualized, current page marked, click navigates', async ({ page }) => {
    await openPdf(page, 'src=bytes&extra=40');
    await item(page, 'sidebar').click();
    const thumbs = page.getByRole('list', { name: 'Thumbnails' }).getByRole('button');
    await expect(thumbs.first()).toBeVisible();
    const n = await thumbs.count();
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThan(15);
    await expect(thumbs.first()).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => thumbs.first().locator('canvas').evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(100);
    await thumbs.nth(2).click();
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('3');
    await expect(thumbs.nth(2)).toHaveAttribute('aria-current', 'page');
    await page.locator('.salmon-pdf-viewer__thumbnails').evaluate((el) => (el.scrollTop = 1e6));
    await expect(page.getByRole('button', { name: 'Page 43' })).toBeAttached();
    expect((await log(page)).sidebars).toEqual(['thumbnails']);
  });
});

test.describe('PdfViewer find', () => {
  test('Mod+F opens the find bar; matches count, step and highlight; options narrow them', async ({ page }) => {
    await openPdf(page, 'zoom=1');
    await viewport(page).focus();
    await page.keyboard.press('ControlOrMeta+f');
    const input = page.getByRole('searchbox', { name: 'Find in document' });
    await expect(input).toBeFocused();
    await input.fill('salmon');
    const status = page.locator('.salmon-pdf-viewer__find-status');
    // Page 1: Salmon (x2), salmon; page 2: salmon (x2), salmonberry.
    await expect(status).toHaveText('1 of 6');
    await expect(pageEl(page, 1).locator('.salmon-pdf-viewer__find-match')).toHaveCount(3);
    await expect(pageEl(page, 1).locator('.salmon-pdf-viewer__find-match[data-current]')).toHaveCount(1);
    await input.press('Enter');
    await expect(status).toHaveText('2 of 6');
    await input.press('Shift+Enter');
    await expect(status).toHaveText('1 of 6');
    await page.getByLabel('Match case').check();
    await expect(status).toHaveText('1 of 4');
    await page.getByLabel('Whole words').check();
    await expect(status).toHaveText('1 of 3');
    await page.getByLabel('Highlight all').uncheck();
    await expect(pageEl(page, 1).locator('.salmon-pdf-viewer__find-match')).toHaveCount(1);
    await input.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(page.locator('.salmon-pdf-viewer__find-match')).toHaveCount(0);
  });

  test('actionsRef.search resolves the result, onSearchResult reports it, next moves pages', async ({ page }) => {
    await openPdf(page, 'zoom=1');
    const result = await act<{ total: number; current: number; page: number; pages: Record<string, number> }>(page, 'search', 'whole words', {});
    expect(result).toMatchObject({ total: 1, current: 1, page: 2, pages: { 2: 1 } });
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('2');
    await expect(pageEl(page, 2).locator('.salmon-pdf-viewer__find-match[data-current]')).toBeVisible();
    const r2 = await act<{ total: number }>(page, 'search', 'SALMON', { matchCase: true });
    expect(r2.total).toBe(0);
    expect((await log(page)).searches.map((s) => s.total)).toEqual([1, 0]);
  });
});

test.describe('PdfViewer text, print and save', () => {
  test('text selection and copy over the text layer; textSelection={false} disables it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openPdf(page, 'zoom=1');
    const span = pageEl(page, 1).locator('.salmon-pdf-viewer__text-layer span', { hasText: 'quick brown' });
    const box = (await span.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await page.evaluate(() => getSelection()?.toString())).toContain('quick brown fox');
    await page.keyboard.press('ControlOrMeta+c');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('quick brown fox');
    await openPdf(page, 'noSelect');
    await expect(pageEl(page, 1).locator('.salmon-pdf-viewer__text-layer span').first()).toHaveCSS('user-select', 'none');
  });

  test('print renders every page into the print container; onBeforePrint can cancel', async ({ page }) => {
    await openPdf(page);
    await item(page, 'print').click();
    await expect.poll(async () => (await log(page)).prints.length, { timeout: 20_000 }).toBe(1);
    expect((await log(page)).prints[0]).toEqual({ images: 3, sizes: ['612ptx792pt', '612ptx792pt', '420ptx595pt'] });
    await expect(page.locator('.salmon-pdf-viewer-print')).toHaveCount(0, { timeout: 3000 });
    await openPdf(page, 'vetoPrint');
    expect(await act(page, 'print')).toBe(false);
    expect((await log(page)).beforePrint).toBe(1);
    expect((await log(page)).prints).toEqual([]);
  });

  test('text markup from the selection: highlight, underline, strikethrough; controlled list', async ({ page }) => {
    await openPdf(page, 'controlled&zoom=1');
    await expect(item(page, 'highlight')).toBeDisabled();
    await selectText(page, 'quick brown');
    await expect(item(page, 'highlight')).toBeEnabled();
    await item(page, 'highlight').click();
    const marks = pageEl(page, 1).locator('.salmon-pdf-viewer__markup');
    await expect(marks).toHaveCount(1);
    await expect(marks.first()).toHaveAttribute('data-kind', 'highlight');
    // The mark sits over the selected words.
    const span = (await pageEl(page, 1).locator('.salmon-pdf-viewer__text-layer span', { hasText: 'quick brown' }).boundingBox())!;
    const mark = (await marks.first().boundingBox())!;
    expect(Math.abs(mark.y - span.y)).toBeLessThan(6);
    expect(mark.width).toBeLessThan(span.width);
    await selectText(page, 'swim upstream');
    await item(page, 'underline').click();
    await selectText(page, 'lazy dog');
    await item(page, 'strikethrough').click();
    await expect(marks).toHaveCount(3);
    const underline = (await pageEl(page, 1).locator('[data-kind="underline"]').boundingBox())!;
    expect(underline.height).toBeLessThan(4);
    expect((await log(page)).annotations).toEqual([
      { reason: 'create', kind: 'highlight', page: 1, count: 1 },
      { reason: 'create', kind: 'underline', page: 1, count: 2 },
      { reason: 'create', kind: 'strikethrough', page: 1, count: 3 },
    ]);
    // Controlled: the app clears the list.
    await page.locator('#clear-annotations').click();
    await expect(marks).toHaveCount(0);
  });

  test('form filling: typing reports values; controlled values update the widgets', async ({ page }) => {
    await openPdf(page, 'controlled&zoom=1');
    await act(page, 'goToPage', 3);
    const field = pageEl(page, 3).locator('.salmon-pdf-viewer__annotation-layer input[type="text"]');
    await field.fill('Ada');
    await expect.poll(async () => (await log(page)).forms.at(-1)).toEqual({ name: 'fullName', values: { fullName: 'Ada', subscribe: false } });
    const box = pageEl(page, 3).locator('.salmon-pdf-viewer__annotation-layer input[type="checkbox"]');
    await box.check();
    await expect.poll(async () => (await log(page)).forms.at(-1)?.values['subscribe']).toBe(true);
    await page.locator('#set-name').click();
    await expect(field).toHaveValue('Grace Hopper');
    await expect(box).toBeChecked();
  });

  test('save() returns the PDF with form values and markup annotations; download saves a file', async ({ page }) => {
    await openPdf(page, 'zoom=1');
    await selectText(page, 'quick brown');
    await item(page, 'highlight').click();
    await selectText(page, 'swim upstream');
    await item(page, 'underline').click();
    await selectText(page, 'lazy dog');
    await item(page, 'strikethrough').click();
    await act(page, 'goToPage', 3);
    await pageEl(page, 3).locator('.salmon-pdf-viewer__annotation-layer input[type="text"]').fill('Ada Lovelace');
    const text = await page.evaluate(async () => {
      const blob = await (window as unknown as { __pdfvActions: { save(): Promise<Blob> } }).__pdfvActions.save();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { type: blob.type, latin1: Array.from(bytes, (b) => String.fromCharCode(b)).join('') };
    });
    expect(text.type).toBe('application/pdf');
    expect(text.latin1.startsWith('%PDF-')).toBe(true);
    expect(text.latin1).toContain('/V (Ada Lovelace)');
    for (const subtype of ['Highlight', 'Underline', 'StrikeOut']) expect(text.latin1).toMatch(new RegExp(`/Subtype /${subtype} [^]*?/QuadPoints`));
    expect(text.latin1).toContain('/T (Tester)');
    const download = page.waitForEvent('download');
    await item(page, 'download').click();
    expect((await download).suggestedFilename()).toBe('sample-out.pdf');
  });
});
