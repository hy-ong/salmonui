import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Dialog family in the browser: Dialog, AlertDialog, DialogProvider and useConfirm.
// Page: examples/vite-spa/dialog.html.

const PAGE = `${DEV_URL}dialog.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}

const log = (page: Page, id: string, kind?: string) => page.evaluate(([i, k]) => (window.__dialog ?? []).filter((e) => e['id'] === i && (!k || e['kind'] === k)), [id, kind] as const);
const dialog = (page: Page, test: string) => page.locator(`dialog[data-test=${test}]`);
const activeId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? null);

test.describe('Dialog', () => {
  test('modal dialog opens with showModal, is labelled and described, focuses initialFocus', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await expect(dialog(page, 'basic')).toHaveCount(0);
    const trigger = page.locator('#basic-trigger');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await trigger.click();
    const d = dialog(page, 'basic');
    await expect(d).toBeVisible();
    expect(await d.evaluate((el) => el.matches(':modal'))).toBe(true);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(d).toHaveAccessibleName('Edit order');
    await expect(d).toHaveAccessibleDescription('Changes are saved on submit.');
    expect(await activeId(page)).toBe('customer');
    // The background is inert while the modal dialog is open.
    expect(await page.evaluate(() => document.elementFromPoint(5, 5)?.closest('dialog') === null && document.querySelector('#after')?.matches(':modal'))).toBe(false);
    await expect.poll(() => log(page, 'basic', 'afterOpen')).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  test('Tab cycles inside a modal dialog; the close button has the Close label', async ({ page }) => {
    await open(page);
    await page.locator('#basic-trigger').click();
    const d = dialog(page, 'basic');
    await expect(d.getByRole('button', { name: 'Close' })).toHaveClass(/salmon-dialog-close-button/);
    const seen = new Set<string | null>();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      seen.add(await page.evaluate(() => (document.activeElement?.closest('dialog') ? 'inside' : document.activeElement?.tagName ?? null)));
    }
    expect([...seen].filter((s) => s !== 'inside' && s !== 'BODY' && s !== 'HTML')).toEqual([]);
  });

  test('Escape, the close button, Dialog.Close and form submission close it with their reasons; focus returns', async ({ page }) => {
    await open(page);
    for (const [act, reason] of [
      ['Escape', 'escape'],
      ['closeButton', 'closeButton'],
      ['cancel', 'close'],
      ['submit', 'submit'],
    ] as const) {
      await page.locator('#basic-trigger').click();
      await expect(dialog(page, 'basic')).toBeVisible();
      if (act === 'Escape') await page.keyboard.press('Escape');
      else if (act === 'closeButton') await dialog(page, 'basic').getByRole('button', { name: 'Close' }).click();
      else if (act === 'cancel') await page.locator('#basic-cancel').click();
      else await page.locator('#basic-save').click();
      await expect(dialog(page, 'basic')).toHaveCount(0);
      expect(await activeId(page)).toBe('basic-trigger');
      const last = (await log(page, 'basic', 'change')).at(-1);
      expect(last?.['reason']).toBe(reason);
      if (act === 'submit') expect(last?.['returnValue']).toBe('saved');
    }
    expect(await log(page, 'basic', 'afterClose')).toHaveLength(4);
  });

  test('Escape is cancellable with preventDefault; backdrop presses report onOverlayPress and close when dismissible', async ({ page }) => {
    await open(page);
    await page.locator('#guarded-trigger').click();
    await page.locator('#lock').check();
    await page.keyboard.press('Escape');
    await expect(dialog(page, 'guarded')).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog(page, 'guarded')).toHaveCount(0);
    expect(await log(page, 'guarded', 'overlay')).toHaveLength(1);
    expect((await log(page, 'guarded', 'change')).map((e) => e['reason'])).toEqual(['trigger', 'escape', 'outside']);
    // Default dismissible: a backdrop press does nothing.
    await page.locator('#basic-trigger').click();
    await page.mouse.click(5, 5);
    await expect(dialog(page, 'basic')).toBeVisible();
  });

  test('controlled open; the parent vetoes an outside press by not updating open', async ({ page }) => {
    await open(page);
    await page.locator('#controlled-open').click();
    await expect(dialog(page, 'controlled')).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog(page, 'controlled')).toBeVisible();
    await page.locator('#controlled-close').click();
    await expect(dialog(page, 'controlled')).toHaveCount(0);
    expect((await log(page, 'controlled', 'change')).map((e) => [e['open'], e['reason']])).toEqual([
      [false, 'outside'],
      [false, 'close'],
    ]);
  });

  test('modeless dialog keeps the page usable, Tab leaves it, Escape closes it; placement top', async ({ page }) => {
    await open(page);
    await page.locator('#modeless-trigger').click();
    const d = dialog(page, 'modeless');
    await expect(d).toBeVisible();
    expect(await d.evaluate((el) => el.matches(':modal'))).toBe(false);
    await expect(d).toHaveAttribute('data-placement', 'top');
    expect((await d.boundingBox())!.y).toBeLessThan(80);
    await page.locator('#modeless-button').focus();
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    expect((await log(page, 'modeless', 'change')).map((e) => e['reason'])).toEqual(['trigger', 'escape']);
  });

  test('dragging the title moves the dialog with no React render per move; RTL mirrors x', async ({ page }) => {
    for (const rtl of [false, true]) {
      await open(page, rtl ? '?dir=rtl' : '');
      await page.locator('#drag-trigger').click();
      const d = dialog(page, 'drag');
      await expect(d).toHaveAttribute('data-draggable', '');
      await page.waitForTimeout(200);
      const before = (await d.boundingBox())!;
      const t = (await page.locator('#drag-title').boundingBox())!;
      // Press the middle of the title (the close button sits at its inline end).
      const title = { x: t.x + t.width / 2 - 20, y: t.y };
      const renders = await page.evaluate(() => window.__renders ?? 0);
      await page.mouse.move(title.x + 20, title.y + 10);
      await page.mouse.down();
      await page.mouse.move(title.x + 60, title.y + 40, { steps: 8 });
      await page.mouse.move(title.x + 120, title.y + 70, { steps: 8 });
      expect(await page.evaluate(() => window.__renders ?? 0)).toBe(renders);
      await page.mouse.up();
      const after = (await d.boundingBox())!;
      expect(Math.round(after.x - before.x)).toBe(100);
      expect(Math.round(after.y - before.y)).toBe(60);
      const end = (await log(page, 'drag', 'moveEnd')).at(-1);
      expect(end).toMatchObject({ x: rtl ? -100 : 100, y: 60 });
      expect((await log(page, 'drag', 'move')).length).toBeGreaterThan(0);
      expect(await log(page, 'drag', 'moveStart')).toHaveLength(1);
      expect(await log(page, 'drag', 'position')).toHaveLength(1);
    }
  });

  test('arrow keys on the drag handle move the dialog, announced in a live region', async ({ page }) => {
    await open(page);
    await page.locator('#drag-trigger').click();
    const d = dialog(page, 'drag');
    await expect(d).toHaveAttribute('data-draggable', '');
    const before = (await d.boundingBox())!;
    await page.locator('#drag-title').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const after = (await d.boundingBox())!;
    expect(Math.round(after.x - before.x)).toBe(10);
    expect(Math.round(after.y - before.y)).toBe(50);
    await expect(d.locator('.salmon-dialog-live')).toHaveText('Moved to 10, 50');
    await expect(d.locator('.salmon-dialog-live')).toHaveAttribute('aria-live', 'polite');
  });

  test('resize handles (pointer and keyboard) change width and height; width / height props', async ({ page }) => {
    await open(page);
    await page.locator('#drag-trigger').click();
    const d = dialog(page, 'drag');
    const corner = d.locator('.salmon-dialog-resize-handle[data-edge=bottomEnd]');
    await expect(corner).toHaveCount(1);
    await expect(d.locator('.salmon-dialog-resize-handle[data-edge=end]')).toHaveCount(1);
    await expect(corner).toHaveAttribute('aria-label', 'Resize (bottom end)');
    const before = (await d.boundingBox())!;
    expect(Math.round(before.width)).toBe(360);
    expect(Math.round(before.height)).toBe(240);
    const c = (await corner.boundingBox())!;
    await page.mouse.move(c.x + 6, c.y + 6);
    await page.mouse.down();
    await page.mouse.move(c.x + 46, c.y + 26, { steps: 6 });
    await page.mouse.up();
    const after = (await d.boundingBox())!;
    expect(Math.round(after.width - before.width)).toBe(40);
    expect(Math.round(after.height - before.height)).toBe(20);
    expect((await log(page, 'drag', 'resizeEnd')).at(-1)).toMatchObject({ width: 400, height: 260 });
    await corner.focus();
    await page.keyboard.press('ArrowRight');
    expect((await log(page, 'drag', 'resizeEnd')).at(-1)).toMatchObject({ width: 410, height: 260 });
  });

  test('fullScreen="mobile" fills a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page);
    await page.locator('#full-trigger').click();
    const b = (await dialog(page, 'full').boundingBox())!;
    expect(Math.round(b.width)).toBe(390);
    expect(Math.round(b.height)).toBe(800);
  });

  test('a modeless dialog with container renders inside that element', async ({ page }) => {
    await open(page);
    await page.locator('#contained-trigger').click();
    const d = dialog(page, 'contained');
    await expect(d).toBeVisible();
    expect(await d.evaluate((el) => el.parentElement?.id)).toBe('panel');
    const panel = (await page.locator('#panel').boundingBox())!;
    const b = (await d.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(panel.x);
    expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
  });

  test('className and style reach the dialog element', async ({ page }) => {
    await open(page);
    await page.locator('#basic-trigger').click();
    await expect(dialog(page, 'basic')).toHaveClass('salmon-dialog custom');
    expect(await dialog(page, 'basic').evaluate((el) => [el.style.width, el.style.minHeight])).toEqual(['480px', '200px']);
  });
});

test.describe('AlertDialog and useConfirm', () => {
  test('an alert has one action, role alertdialog, focus on it; backdrop never dismisses', async ({ page }) => {
    await open(page);
    await page.locator('#alert-trigger').click();
    const d = dialog(page, 'alert');
    await expect(d).toHaveAttribute('role', 'alertdialog');
    await expect(d).toHaveAccessibleName('Session expired');
    await expect(d.getByRole('button')).toHaveCount(1);
    await expect(d.getByRole('button', { name: 'OK' })).toBeFocused();
    await page.mouse.click(5, 5);
    await expect(d).toBeVisible();
    await d.getByRole('button', { name: 'OK' }).click();
    await expect(d).toHaveCount(0);
    expect(await log(page, 'alert', 'confirm')).toHaveLength(1);
  });

  test('confirm focuses the least destructive action; a promise keeps the confirm button loading; Escape cancels', async ({ page }) => {
    await open(page);
    await page.locator('#confirm-trigger').click();
    const d = dialog(page, 'confirm');
    await expect(d.getByRole('button', { name: 'Keep' })).toBeFocused();
    const del = d.locator('.salmon-button[data-tone=danger]');
    await expect(del).toHaveText(/Delete/);
    await del.click();
    await expect(del).toHaveAttribute('aria-busy', 'true');
    await expect(d).toBeVisible();
    await expect(d).toHaveCount(0);
    expect(await log(page, 'confirm', 'confirm')).toHaveLength(1);
    await page.locator('#confirm-trigger').click();
    await page.keyboard.press('Escape');
    await expect(dialog(page, 'confirm')).toHaveCount(0);
    expect(await log(page, 'confirm', 'cancel')).toHaveLength(1);
  });

  test('async confirm: while pending Cancel is disabled and Escape / the close button are ignored; a rejection keeps the dialog open with its Error message in a role=alert region; a retry closes it', async ({ page }) => {
    await open(page);
    await page.locator('#publish-trigger').click();
    const d = dialog(page, 'publish');
    const publish = d.getByRole('button', { name: /Publish/ });
    const cancel = d.getByRole('button', { name: 'Cancel' });
    await publish.click();
    await expect(publish).toHaveAttribute('aria-busy', 'true');
    await expect(cancel).toBeDisabled();
    await page.keyboard.press('Escape');
    await d.locator('.salmon-dialog-close-button').click({ force: true });
    await expect(d).toBeVisible();
    // Rejected: open again, the Error message announced, the actions usable.
    const error = d.getByRole('alert');
    await expect(error).toHaveText('Network unavailable');
    await expect(publish).not.toHaveAttribute('aria-busy', 'true');
    await expect(cancel).toBeEnabled();
    expect(await log(page, 'publish')).toEqual([]);
    // Cancel after a rejection cancels; reopened, the dialog starts without the error.
    await cancel.click();
    await expect(d).toHaveCount(0);
    expect(await log(page, 'publish')).toEqual([{ id: 'publish', kind: 'cancel' }]);
    await page.locator('#publish-trigger').click();
    await expect(cancel).toBeFocused();
    await expect(error).toHaveCount(0);
    // The retry fulfills and closes.
    await publish.click();
    await expect(d).toHaveCount(0);
    expect(await log(page, 'publish', 'confirm')).toHaveLength(1);
  });

  test('async useConfirm: onConfirm keeps the dialog open and loading; a rejection without an Error message shows localeText.error; the call resolves true once it fulfills', async ({ page }) => {
    await open(page);
    await page.locator('#use-confirm-async').click();
    const d = page.getByRole('alertdialog', { name: 'Sync orders?' });
    const sync = d.getByRole('button', { name: /Sync/ });
    await sync.click();
    await expect(sync).toHaveAttribute('aria-busy', 'true');
    await expect(d.getByRole('alert')).toHaveText('Sync failed.');
    await expect(d).toBeVisible();
    expect(await log(page, 'useConfirmAsync')).toEqual([]);
    await sync.click();
    await expect(d).toHaveCount(0);
    expect(await log(page, 'useConfirmAsync', 'result')).toEqual([{ id: 'useConfirmAsync', kind: 'result', value: true, attempt: 2 }]);
  });

  test('a prompt passes the FormData of its form to onConfirm (Enter submits)', async ({ page }) => {
    await open(page);
    await page.locator('#prompt-trigger').click();
    await page.locator('#prompt-name').fill('Rush order');
    await page.keyboard.press('Enter');
    await expect(dialog(page, 'prompt')).toHaveCount(0);
    expect(await log(page, 'prompt', 'confirm')).toEqual([{ id: 'prompt', kind: 'confirm', name: 'Rush order' }]);
  });

  test('useConfirm resolves true / false, useAlert resolves; an AbortSignal closes the dialog', async ({ page }) => {
    await open(page);
    await page.locator('#use-confirm').click();
    const d = page.getByRole('alertdialog', { name: 'Delete order?' });
    await d.getByRole('button', { name: 'Delete' }).click();
    await expect(d).toHaveCount(0);
    await page.locator('#use-confirm').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await page.locator('#use-alert').click();
    await page.getByRole('alertdialog', { name: 'Saved' }).getByRole('button', { name: 'OK' }).click();
    await page.locator('#use-confirm-abort').click();
    await expect(page.getByRole('alertdialog', { name: 'Wait' })).toBeVisible();
    await page.evaluate(() => window.__abort?.abort());
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(await log(page, 'useConfirm', 'result')).toEqual([
      { id: 'useConfirm', kind: 'result', value: true },
      { id: 'useConfirm', kind: 'result', value: false },
    ]);
    expect(await log(page, 'useAlert', 'result')).toHaveLength(1);
    expect(await log(page, 'abort', 'result')).toEqual([{ id: 'abort', kind: 'result', value: false }]);
  });

  test('AlertDialog accepts Dialog options (modal, placement)', async ({ page }) => {
    await open(page);
    await page.locator('#alert-trigger').click();
    expect(await dialog(page, 'alert').evaluate((el) => el.matches(':modal'))).toBe(true);
    await expect(dialog(page, 'alert')).toHaveAttribute('data-placement', 'center');
  });
});

test.describe('Drawer', () => {
  test('a modal drawer docks to the logical start edge, Escape and backdrop close it', async ({ page }) => {
    for (const rtl of [false, true]) {
      await open(page, rtl ? '?dir=rtl' : '');
      await page.locator('#drawer-trigger').click();
      const d = dialog(page, 'drawer');
      await expect(d).toHaveClass(/salmon-drawer/);
      await expect(d).toHaveAccessibleName('Navigation');
      await page.waitForTimeout(300);
      const b = (await d.boundingBox())!;
      expect(Math.round(b.width)).toBe(280);
      expect(Math.round(rtl ? 1280 - (b.x + b.width) : b.x)).toBe(0);
      await page.mouse.click(1000 * (rtl ? 0 : 1) + 140, 400);
      await expect(d).toHaveCount(0);
      expect((await log(page, 'drawer', 'change')).map((e) => e['reason'])).toEqual(['trigger', 'outside']);
      await page.locator('#drawer-end-trigger').click();
      await page.keyboard.press('Escape');
      await expect(dialog(page, 'drawer-end')).toHaveCount(0);
    }
  });

  test('visual metrics: the close button is a square md icon button with a 16px glyph; surface radius lg; drawer rounds only its inner edge', async ({ page }) => {
    await open(page);
    await page.locator('#basic-trigger').click();
    const m = await dialog(page, 'basic').evaluate((d) => {
      const close = d.querySelector('.salmon-dialog-close-button')!;
      const b = close.getBoundingClientRect();
      const g = close.querySelector('svg')!.getBoundingClientRect();
      return { w: b.width, h: b.height, glyph: g.width, dx: g.left + g.width / 2 - (b.left + b.width / 2), radius: getComputedStyle(close).borderTopLeftRadius, surface: getComputedStyle(d).borderTopLeftRadius };
    });
    expect(m).toMatchObject({ w: 32, h: 32, glyph: 16, dx: 0, radius: '6px', surface: '10px' });
    await page.keyboard.press('Escape');
    await page.locator('#drawer-trigger').click();
    const r = await dialog(page, 'drawer').evaluate((d) => {
      const cs = getComputedStyle(d);
      return [cs.borderStartStartRadius, cs.borderStartEndRadius, cs.borderEndEndRadius, cs.borderEndStartRadius];
    });
    expect(r).toEqual(['0px', '10px', '10px', '0px']);
  });
});

test.describe('Dialog SSR and axe', () => {
  test('hydration has no warnings; axe clean for open dialogs in light, dark and RTL', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    await page.locator('#basic-trigger').click();
    await expect(dialog(page, 'basic')).toBeVisible();
    expect(problems).toEqual([]);
    for (const query of ['', '?scheme=dark', '?dir=rtl']) {
      for (const id of ['basic', 'confirm', 'drawer']) {
        await open(page, query);
        await page.locator(`#${id}-trigger`).click();
        await page.waitForTimeout(250);
        await expectClean(page, `${id} ${query}`);
      }
      // A rejected async confirm: the error region in the open dialog.
      await open(page, query);
      await page.locator('#publish-trigger').click();
      await dialog(page, 'publish').getByRole('button', { name: /Publish/ }).click();
      await expect(dialog(page, 'publish').getByRole('alert')).toBeVisible();
      await expectClean(page, `publish error ${query}`);
    }
  });
});
