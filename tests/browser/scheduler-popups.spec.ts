import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Scheduler popup gates on scheduler.html?set=popups (examples/vite-spa/src/scheduler-popups.tsx):
// the editor and alerts on the public Dialog (a modal <dialog>) with their Select, DatePicker and
// RecurrenceEditor popups usable inside it, the quick info and "+N more" on the public Popover,
// the context menu, tooltips and print.

async function open(page: Page): Promise<void> {
  await page.goto(`${DEV_URL}scheduler.html?set=popups`);
  await page.waitForFunction(() => window.__mountMs !== undefined);
}
const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const event = (page: Page, id: string, eventId: number): Locator => scope(page, id).locator(`.salmon-scheduler__event[data-event-id="${eventId}"]`);
const logs = (page: Page, id: string, type: string) => page.evaluate(([i, t]) => window.__schedEvents.filter((e) => e.id === i && e.type === t), [id, type] as const);
const api = <T,>(page: Page, id: string, fn: string, ...args: unknown[]) => page.evaluate(([i, f, a]) => (window.__schedApi[i as string] as any)[f as string](...(a as unknown[])), [id, fn, args] as const) as Promise<T>;
/** True when the element is inside the open modal <dialog> (popups inside modal dialogs). */
const inModal = (l: Locator): Promise<boolean> => l.evaluate((el) => !!el.closest('dialog:modal'));

test.describe('public Dialog and Popover', () => {
  test('the editor is a modal Dialog whose Select, DatePicker and RecurrenceEditor popups stay usable', async ({ page }) => {
    await open(page);
    await event(page, 'pop-editor', 2).dblclick();
    const dlg = page.getByRole('dialog', { name: 'Edit event' });
    await expect(dlg).toBeVisible();
    expect(await dlg.evaluate((el) => el.tagName === 'DIALOG' && el.matches(':modal') && el.classList.contains('salmon-dialog'))).toBe(true);
    // Outside the Scheduler root (its key handling never sees the dialog's keys).
    expect(await dlg.evaluate((el) => !el.closest('.salmon-scheduler'))).toBe(true);
    await expect(dlg.getByRole('textbox', { name: 'Title' })).toBeFocused();

    // Resource Select: its listbox portals into the dialog and takes the click.
    await dlg.getByRole('combobox', { name: 'Room' }).click();
    const roomB = page.getByRole('option', { name: 'Room B' });
    await expect(roomB).toBeVisible();
    expect(await inModal(roomB)).toBe(true);
    await roomB.click();
    await expect(dlg.getByRole('combobox', { name: 'Room' })).toContainText('Room B');

    // Searchable time zone Select.
    await dlg.getByRole('combobox', { name: 'Start time zone' }).click();
    const tokyo = page.getByRole('option', { name: 'Asia/Tokyo' });
    await expect(tokyo).toBeVisible();
    expect(await inModal(tokyo)).toBe(true);
    await tokyo.click();
    await expect(dlg.getByRole('combobox', { name: 'Start time zone' })).toContainText('Asia/Tokyo');

    // RecurrenceEditor: Escape closes its Select first, the dialog on the next press only.
    await dlg.getByRole('combobox', { name: 'Repeat' }).click();
    await expect(page.getByRole('option', { name: 'Daily', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('option', { name: 'Daily', exact: true })).toHaveCount(0);
    await expect(dlg).toBeVisible();
    await dlg.getByRole('combobox', { name: 'Repeat' }).click();
    await page.getByRole('option', { name: 'Daily', exact: true }).click();
    await expect(dlg.getByRole('combobox', { name: 'Repeat' })).toContainText('Daily');

    // DatePicker: the calendar popup is inside the dialog and a day pick changes the start.
    await dlg.locator('.salmon-scheduler__editor-start').getByRole('button', { name: /Choose date/ }).click();
    const day = dlg.getByRole('gridcell', { name: /November 25, 2026/ });
    await expect(day).toBeVisible();
    expect(await inModal(day)).toBe(true);
    await day.click();
    const ok = page.getByRole('button', { name: /^(OK|Set|Apply|Done)$/ });
    if (await ok.count()) await ok.first().click();

    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg).toHaveCount(0);
    const saved = (await logs(page, 'pop-editor', 'save')).at(-1)?.value as Row[];
    expect(saved[0]).toMatchObject({ id: 2, roomId: 2, startTimeZone: 'Asia/Tokyo' });
    expect(String(saved[0]?.['recurrenceRule'])).toMatch(/^FREQ=DAILY/);
    expect(String(saved[0]?.['start'])).toContain('2026-11-25');
  });

  test('Escape closes the editor dialog and focus returns to the event', async ({ page }) => {
    await open(page);
    await event(page, 'pop-editor', 3).dblclick();
    const dlg = page.getByRole('dialog', { name: 'Edit event' });
    await expect(dlg.getByRole('textbox', { name: 'Title' })).toBeFocused();
    // Tab stays inside the modal dialog.
    for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog:modal'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(event(page, 'pop-editor', 3)).toBeFocused();
    expect((await logs(page, 'pop-editor', 'popupClose')).map((e) => e.value)).toEqual(['editor']);
  });

  test('the delete alert is a modal alertdialog; Escape cancels and keeps the event', async ({ page }) => {
    await open(page);
    await event(page, 'pop-editor', 2).click();
    const qi = page.getByRole('dialog', { name: 'Design review' });
    await expect(qi).toBeVisible();
    // The quick info is the public Popover (non-modal: no aria-modal).
    expect(await qi.evaluate((el) => el.classList.contains('salmon-popover') && !el.hasAttribute('aria-modal'))).toBe(true);
    await qi.getByRole('button', { name: 'Delete' }).click();
    const alert = page.getByRole('alertdialog', { name: 'Delete event' });
    await expect(alert).toBeVisible();
    expect(await alert.evaluate((el) => el.tagName === 'DIALOG' && el.matches(':modal'))).toBe(true);
    await expect(alert.getByRole('button', { name: 'Delete' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(alert).toHaveCount(0);
    await expect(event(page, 'pop-editor', 2)).toHaveCount(1);
    expect((await logs(page, 'pop-editor', 'popupClose')).map((e) => e.value)).toEqual(['deleteAlert']);
    await expect(event(page, 'pop-editor', 2)).toBeFocused();
  });
});

// Week view, UTC, 30-minute cells: row r is r * 30 minutes after midnight, column c is Sun + c.
const cell = (s: Locator, r: number, c: number, cols = 7): Locator => s.locator('.salmon-scheduler__work-cell').nth(r * cols + c);

test.describe('context menu', () => {
  test('right-click on a cell shows the default items; New recurring event opens the editor with a daily rule', async ({ page }) => {
    await open(page);
    const s = scope(page, 'pop-menu');
    // Right away after mount: the request is kept until the lazy chunk loads.
    await cell(s, 28, 2).click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText(['New event', 'New recurring event', 'Today']);
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    // Inside the theme scope, so the theme colors apply.
    expect(await menu.evaluate((el) => !!el.closest('.salmon-theme-scope'))).toBe(true);
    await menu.getByRole('menuitem', { name: 'New recurring event' }).click();
    await expect(menu).toHaveCount(0);
    expect((await logs(page, 'pop-menu', 'menu')).at(-1)?.value).toEqual({ id: 'newRecurringEvent', kind: 'cell', source: 'pointer', start: '2026-11-24T14:00:00.000Z', end: '2026-11-24T14:30:00.000Z', allDay: false });
    const dlg = page.getByRole('dialog', { name: 'New event' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('combobox', { name: 'Repeat' })).toContainText('Daily');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
  });

  test('an event shows Edit and Delete; Delete asks and deletes; the browser menu stays outside cells and events', async ({ page }) => {
    await open(page);
    const s = scope(page, 'pop-menu');
    await event(page, 'pop-menu', 2).click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['Edit', 'Delete']);
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    expect((await logs(page, 'pop-menu', 'menu')).at(-1)?.value).toEqual({ id: 'delete', kind: 'event', source: 'pointer', eventId: 2, title: 'Design review' });
    await page.getByRole('alertdialog', { name: 'Delete event' }).getByRole('button', { name: 'Delete' }).click();
    expect((await logs(page, 'pop-menu', 'delete')).at(-1)?.value).toEqual([2]);
    await expect(event(page, 'pop-menu', 2)).toHaveCount(0);
    // A selected range: the menu acts on the whole range.
    await cell(s, 30, 3).click();
    await cell(s, 32, 3).click({ modifiers: ['Shift'] });
    await page.keyboard.press('Escape');
    await cell(s, 31, 3).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'New event' }).click();
    expect((await logs(page, 'pop-menu', 'menu')).at(-1)?.value).toMatchObject({ id: 'newEvent', start: '2026-11-25T15:00:00.000Z', end: '2026-11-25T16:30:00.000Z' });
    await page.keyboard.press('Escape');
    // The toolbar is neither a cell nor an event: no menu (the browser shows its own).
    const prevented = await s.locator('.salmon-scheduler__toolbar').evaluate((el) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('Shift+F10 and the ContextMenu key open the menu on a focused event; Escape gives focus back', async ({ page }) => {
    await open(page);
    const ev = event(page, 'pop-menu', 3);
    await ev.focus();
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(ev).toBeFocused();
    await page.keyboard.press('ContextMenu');
    await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
    await page.keyboard.press('Enter');
    expect((await logs(page, 'pop-menu', 'menu')).at(-1)?.value).toMatchObject({ id: 'edit', kind: 'event', source: 'keyboard', eventId: 3 });
    await expect(page.getByRole('dialog', { name: 'Edit event' })).toBeVisible();
  });

  test('a function gives items per target with the cell resources; preventDefault skips the default action', async ({ page }) => {
    await open(page);
    const s = scope(page, 'pop-menu-fn');
    await s.locator('.salmon-scheduler__event[data-event-id="2"]').click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['Copy Design review', 'Remove']);
    await expect(menu.getByRole('separator')).toHaveCount(1);
    await menu.getByRole('menuitem', { name: 'Remove' }).click();
    expect((await logs(page, 'pop-menu-fn', 'menu')).at(-1)?.value).toEqual({ id: 'delete', kind: 'event', resources: null });
    // Prevented: no delete alert.
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    // Room A cell (column 0) has a menu with its resource ids; Room B (column 1) returns [] and keeps the browser menu.
    await cell(s, 28, 0, 2).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Book room' }).click();
    expect((await logs(page, 'pop-menu-fn', 'menu')).at(-1)?.value).toEqual({ id: 'book', kind: 'cell', resources: { roomId: [1] } });
    const prevented = await cell(s, 28, 1, 2).evaluate((el) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

test.describe('tooltips', () => {
  test('hovering an event shows the public Tooltip with its title and time; leaving closes it; closeTooltip closes it', async ({ page }) => {
    await open(page);
    const ev = event(page, 'pop-tip', 2);
    await ev.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Design review');
    await expect(tip).toContainText('10:00');
    expect(await tip.evaluate((el) => el.classList.contains('salmon-tooltip') && !!el.closest('.salmon-theme-scope'))).toBe(true);
    // The event is described by the open tooltip.
    const tipId = await tip.getAttribute('id');
    await expect(ev).toHaveAttribute('aria-describedby', new RegExp(tipId as string));
    expect((await logs(page, 'pop-tip', 'beforeTooltipOpen')).at(-1)?.value).toEqual({ id: 2, source: 'pointer' });
    await page.mouse.move(5, 5);
    await expect(tip).toHaveCount(0);
    await expect(ev).not.toHaveAttribute('aria-describedby', /.+/);
    await ev.hover();
    await expect(tip).toBeVisible();
    await api(page, 'pop-tip', 'closeTooltip');
    await expect(tip).toHaveCount(0);
  });

  test('onBeforeTooltipOpen cancels; keyboard focus opens it and Escape closes it; render replaces the content', async ({ page }) => {
    await open(page);
    await event(page, 'pop-tip', 3).hover();
    await expect.poll(async () => (await logs(page, 'pop-tip', 'beforeTooltipOpen')).length).toBeGreaterThan(0);
    await page.waitForTimeout(600);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.mouse.move(5, 5);
    // Keyboard focus (focus-visible) opens it at once.
    await event(page, 'pop-tip', 2).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(event(page, 'pop-tip', 2)).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText('Design review');
    expect((await logs(page, 'pop-tip', 'beforeTooltipOpen')).at(-1)?.value).toEqual({ id: 2, source: 'keyboard' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(event(page, 'pop-tip', 2)).toBeFocused();
    await event(page, 'pop-tip-render', 1).first().hover();
    await expect(page.getByTestId('tip-custom')).toHaveText('Custom Standup');
  });
});

test.describe('print', () => {
  test('print() copies the rendered view into a print-only container, calls window.print() and cleans up on afterprint', async ({ page }) => {
    await open(page);
    // window.print stub: records the container; afterprint is fired by the test.
    await page.evaluate(() => {
      const w = window as unknown as { __prints: Record<string, unknown>[] };
      w.__prints = [];
      window.print = () => {
        const box = document.querySelector('body > .salmon-scheduler-print');
        const copy = box?.querySelector<HTMLElement>('.salmon-scheduler');
        w.__prints.push({
          printing: document.documentElement.hasAttribute('data-salmon-scheduler-printing'),
          fit: box?.hasAttribute('data-fit') ?? false,
          themed: !!copy?.closest('.salmon-theme-scope'),
          events: [...(copy?.querySelectorAll('.salmon-scheduler__event-title') ?? [])].map((e) => e.textContent),
          height: copy?.style.blockSize,
          width: copy?.style.inlineSize,
          id: copy?.id ?? null,
        });
      };
    });
    const prints = () => page.evaluate(() => (window as unknown as { __prints: Record<string, unknown>[] }).__prints);
    expect(await api<boolean>(page, 'pop-print', 'print')).toBe(true);
    const first = (await prints())[0] as Record<string, unknown>;
    expect(first).toMatchObject({ printing: true, fit: true, themed: true, height: 'auto', width: 'auto', id: '' });
    expect(first['events']).toEqual(expect.arrayContaining(['Standup', 'Design review', 'Overlap A']));
    expect((await logs(page, 'pop-print', 'beforePrint')).at(-1)?.value).toEqual({});
    // Print media: only the copy is shown, and it is not clipped by the view's scroll container.
    await page.emulateMedia({ media: 'print' });
    await expect(scope(page, 'pop-print')).toBeHidden();
    await expect(page.locator('body > .salmon-scheduler-print')).toBeVisible();
    expect(await page.locator('body > .salmon-scheduler-print .salmon-scheduler__time-scroll').evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('.salmon-scheduler-print')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-salmon-scheduler-printing'))).toBe(false);
    expect((await logs(page, 'pop-print', 'afterPrint')).length).toBe(1);

    // Height and width: a fixed size, the scroll container keeps clipping.
    expect(await api<boolean>(page, 'pop-print', 'print', { height: 600, width: '20cm' })).toBe(true);
    expect((await prints())[1]).toMatchObject({ fit: false, height: '600px', width: '20cm' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect((await logs(page, 'pop-print', 'afterPrint')).at(-1)?.value).toEqual({ height: 600, width: '20cm' });

    // onBeforePrint cancels: no window.print(), resolves false.
    await page.evaluate(() => ((window as { __cancelPrint?: boolean }).__cancelPrint = true));
    expect(await api<boolean>(page, 'pop-print', 'print')).toBe(false);
    expect((await prints()).length).toBe(2);
    await expect(page.locator('.salmon-scheduler-print')).toHaveCount(0);
  });
});

type Row = Record<string, unknown>;
