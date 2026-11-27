import { expect, test } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems } from './helpers.ts';
import { item, log, openPdf, pageEl, pages, selectText, viewer, viewport } from './pdf-viewer-helpers.ts';

// PdfViewer accessibility, keyboard, server rendering, mobile and common
// props (page: examples/vite-spa/src/pdf-viewer.tsx).

test.describe('PdfViewer accessibility and keyboard', () => {
  test('axe: document, find bar, thumbnails, bookmarks and the password dialog (light / scheme=dark / dir=rtl)', async ({ page }) => {
    for (const query of ['zoom=1', 'zoom=1&scheme=dark', 'zoom=1&dir=rtl']) {
      await openPdf(page, query);
      await expectClean(page, `${query} document`);
      await viewport(page).focus();
      await page.keyboard.press('ControlOrMeta+f');
      await page.getByRole('searchbox', { name: 'Find in document' }).fill('salmon');
      await expect(page.locator('.salmon-pdf-viewer__find-status')).toHaveText('1 of 6');
      await expectClean(page, `${query} find`);
      await item(page, 'sidebar').click();
      await expect(page.getByRole('list', { name: 'Thumbnails' }).getByRole('button').first()).toBeVisible();
      await expectClean(page, `${query} thumbnails`);
      await page.getByRole('button', { name: 'Bookmarks' }).click();
      await expect(page.getByRole('tree', { name: 'Bookmarks' })).toBeVisible();
      await expectClean(page, `${query} outline`);
    }
    await openPdf(page, 'src=protected', { wait: false });
    await expect(page.getByRole('dialog', { name: 'Password required' })).toBeVisible({ timeout: 20_000 });
    await expectClean(page, 'password dialog');
  });

  test('pages are regions "Page n of m"; the text layer is readable; the viewport is focusable', async ({ page }) => {
    await openPdf(page, 'zoom=0.5');
    await expect(page.getByRole('region', { name: 'Page 1 of 3' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Page 2 of 3' })).toBeVisible();
    await expect(page.getByRole('document', { name: 'PDF document' })).toHaveAttribute('tabindex', '0');
    // Canvases are hidden from assistive technology; the text layer carries the words.
    await expect(pageEl(page, 1).locator('canvas')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('region', { name: 'Page 1 of 3' })).toContainText('The quick brown fox');
  });

  test('roving toolbar: one tab stop, arrows move, Home / End', async ({ page }) => {
    await openPdf(page);
    await page.locator('h1').click();
    await page.keyboard.press('Tab');
    await expect(item(page, 'sidebar')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    // "Previous" is disabled on page 1 and skipped.
    await expect(item(page, 'next')).toBeFocused();
    await page.keyboard.press('End');
    await expect(item(page, 'download')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(viewport(page)).toBeFocused();
  });

  test('page keys on the viewport: n / p, Home / End, PageDown in page mode', async ({ page }) => {
    await openPdf(page, 'zoom=0.5');
    await viewport(page).focus();
    await page.keyboard.press('n');
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('2');
    await page.keyboard.press('End');
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('3');
    await page.keyboard.press('Home');
    await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('1');
    await openPdf(page, 'scroll=page&zoom=0.5');
    await viewport(page).focus();
    await page.keyboard.press('PageDown');
    await expect(pageEl(page, 2)).toBeAttached();
    await page.keyboard.press('ArrowLeft');
    await expect(pageEl(page, 1)).toBeAttached();
    expect((await log(page)).pages.map((p) => p.source)).toEqual(['keyboard', 'keyboard']);
  });
});

test.describe('PdfViewer server rendering', () => {
  test('server render with pageSizes: sized placeholders, no engine markup; hydration without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await openPdf(page, 'hydrate&pageSizes&zoom=1');
    const server = await page.evaluate(() => (window as unknown as { __serverHtml: string }).__serverHtml);
    expect(server).toMatch(/class="salmon-pdf-viewer__page" role="region" aria-label="Page 1 of 3" data-page-number="1" style="left:\d+px;top:16px;width:816px;height:1056px/);
    expect(server).not.toContain('<canvas');
    expect(server).toContain('Loading document');
    expect(server).toContain('of 3');
    // The engine filled the same page element.
    await expect(pageEl(page, 1).locator('canvas')).toHaveCount(1);
    expect(problems).toEqual([]);
  });
});

test.describe('PdfViewer mobile', () => {
  test('below the container width the toolbar overflows into a menu', async ({ page }) => {
    await openPdf(page, 'narrow');
    const more = page.getByRole('button', { name: 'More tools' });
    await expect(more).toBeVisible();
    await more.click();
    await page.getByRole('menuitem', { name: 'Find' }).click();
    await expect(page.getByRole('searchbox', { name: 'Find in document' })).toBeFocused();
  });

  test('two-finger pinch zooms (CSS transform while pinching, one zoom commit)', async ({ page }) => {
    await openPdf(page, 'zoom=1');
    const box = (await viewport(page).boundingBox())!;
    const cx = box.x + 300;
    const cy = box.y + 300;
    await viewport(page).evaluate((el, [x, y]) => {
      const fire = (type: string, id: number, px: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: px, clientY: y, bubbles: true, cancelable: true }));
      fire('pointerdown', 1, (x as number) - 50);
      fire('pointerdown', 2, (x as number) + 50);
      fire('pointermove', 1, (x as number) - 100);
      fire('pointermove', 2, (x as number) + 100);
      (window as unknown as { __pinchStyle: string }).__pinchStyle = (document.querySelector('.salmon-pdf-viewer__pages') as HTMLElement).style.transform;
      fire('pointerup', 1, (x as number) - 100);
      fire('pointerup', 2, (x as number) + 100);
    }, [cx, cy]);
    expect(await page.evaluate(() => (window as unknown as { __pinchStyle: string }).__pinchStyle)).toBe('scale(2)');
    await expect.poll(async () => (await log(page)).zooms).toEqual([{ zoom: 2, scale: 2, source: 'pinch' }]);
    await expect(pageEl(page, 1)).toHaveCSS('width', '1632px');
  });

  test('coarse pointers get larger toolbar targets', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 400, height: 800 } });
    const page = await context.newPage();
    await openPdf(page, 'narrow');
    const size = await page.getByRole('button', { name: 'Toggle sidebar' }).boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(40);
    await context.close();
  });
});

test.describe('PdfViewer common props', () => {
  test('localeText, RTL toolbar order, className and style', async ({ page }) => {
    await openPdf(page, 'locale&dir=rtl');
    await expect(page.getByRole('region', { name: 'Seite 1 von 3' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nächste Seite' })).toBeVisible();
    const sidebar = (await item(page, 'sidebar').boundingBox())!;
    const download = (await item(page, 'download').boundingBox())!;
    expect(sidebar.x).toBeGreaterThan(download.x);
    await expect(viewer(page)).toHaveCSS('width', '900px');
    await expect(viewer(page)).toHaveAttribute('aria-label', 'Sample document');
  });

  test('actions: getState, setZoom, openFind, addTextMarkup and removeAnnotation', async ({ page }) => {
    await openPdf(page, 'zoom=1');
    const state = await page.evaluate(() => (window as unknown as { __pdfvActions: { getState(): unknown } }).__pdfvActions.getState());
    expect(state).toEqual({ status: 'ready', page: 1, pageCount: 3, scale: 1, zoom: 1 });
    await page.evaluate(() => (window as unknown as { __pdfvActions: { setZoom(z: number): void } }).__pdfvActions.setZoom(0.5));
    await expect(pageEl(page, 1)).toHaveCSS('width', '408px');
    await selectText(page, 'quick brown');
    const created = await page.evaluate(() => (window as unknown as { __pdfvActions: { addTextMarkup(k: string, o: unknown): { id: string; kind: string; page: number; color: string; author: string; text: string; rects: unknown[] }[] } }).__pdfvActions.addTextMarkup('highlight', { color: '#00ff00', comment: 'Note' }));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ kind: 'highlight', page: 1, color: '#00ff00', author: 'Tester', text: 'quick brown' });
    await expect(pageEl(page, 1).locator('.salmon-pdf-viewer__markup')).toHaveAttribute('title', 'Note');
    await page.evaluate((id) => (window as unknown as { __pdfvActions: { removeAnnotation(id: string): void } }).__pdfvActions.removeAnnotation(id), created[0]!.id);
    await expect(pageEl(page, 1).locator('.salmon-pdf-viewer__markup')).toHaveCount(0);
    expect((await log(page)).annotations.map((a) => a.reason)).toEqual(['create', 'remove']);
    await page.evaluate(() => (window as unknown as { __pdfvActions: { openFind(): void } }).__pdfvActions.openFind());
    await expect(page.getByRole('searchbox')).toBeVisible();
    expect(await pages(page).count()).toBeGreaterThan(0);
  });
});
