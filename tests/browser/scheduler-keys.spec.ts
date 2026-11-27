import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { DEV_URL, trackModules, waitForModule } from './helpers.ts';

// Scheduler browser gates on scheduler.html?set=keys (examples/vite-spa/src/scheduler-keys.tsx):
// arrow roving between cells and events with one tab stop per grid,
// keyBindings, the clipboard and the adaptive layout.

async function open(page: Page, query = ''): Promise<void> {
  trackModules(page);
  await page.goto(`${DEV_URL}scheduler.html?set=keys${query}`);
  await page.waitForSelector('[data-scenario="sched-keys"] .salmon-scheduler__work-cell');
  // The interaction chunk (the keys) is requested when idle after mount and keys before it are dropped;
  // tests type faster than that. Idle callbacks run in order, so once this one (queued after the mount
  // effects) ran, every scheduler on the page has requested the chunk; then wait until it ran.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestIdleCallback(r)))));
  await waitForModule(page, /\/scheduler\/interact\.js(\?|$)/);
}
const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const logs = (page: Page, id: string, type: string) => page.evaluate(([i, t]) => window.__schedEvents.filter((e) => e.id === i && e.type === t), [id, type] as const);
const api = <T,>(page: Page, id: string, fn: string, ...args: unknown[]) => page.evaluate(([i, f, a]) => (window.__schedApi[i as string] as any)[f as string](...(a as unknown[])), [id, fn, args] as const) as Promise<T>;
// Week view, UTC, 30-minute cells: row r is r * 30 minutes after midnight, column c is Sun 2026-11-22 + c.
const cell = (s: Locator, r: number, c: number): Locator => s.locator('.salmon-scheduler__work-cell').nth(r * 7 + c);
const at = (day: number, h: number, m = 0): string => String(Date.UTC(2026, 10, day, h, m));
const focused = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return { cell: a?.dataset['cellStart'] ?? null, event: a?.dataset['eventId'] ?? null, tab: a?.tabIndex ?? null, role: a?.getAttribute('role') ?? a?.tagName.toLowerCase() ?? null, text: a?.textContent ?? '' };
  });

test.describe('keyboard and accessibility', () => {
  test('entering the grid focuses one cell; arrows move between cells and events; Escape returns to the cell', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-keys');
    // Event parts are not tab stops of their own: the grid is one tab stop.
    await expect(s.locator('.salmon-scheduler__event').first()).toHaveAttribute('tabindex', '-1');
    await s.locator('.salmon-scheduler__time-scroll').focus();
    // The scroll area hands focus to the first visible cell (scrolled to the 09:00 work start).
    await expect.poll(async () => (await focused(page)).cell).toBe(at(22, 9));
    expect((await focused(page)).tab).toBe(0);
    await page.keyboard.press('ArrowRight');
    expect((await focused(page)).cell).toBe(at(23, 9));
    // The Standup occurrence starts in the Monday 09:00 cell: it comes right after the cell.
    await page.keyboard.press('ArrowRight');
    expect((await focused(page)).event).toBe('1');
    expect(await s.locator('[data-roving]').count()).toBe(1);
    await page.keyboard.press('ArrowDown');
    expect((await focused(page)).cell).toBe(at(23, 9, 30));
    await page.keyboard.press('ArrowLeft');
    expect((await focused(page)).cell).toBe(at(22, 9, 30));
    await page.keyboard.press('ArrowUp');
    expect((await focused(page)).cell).toBe(at(22, 9));
    await page.keyboard.press('End');
    expect((await focused(page)).cell).toBe(at(28, 9));
    await page.keyboard.press('Home');
    expect((await focused(page)).cell).toBe(at(22, 9));
    // Up from the first time row passes the Offsite bar of the all-day row, then reaches its cell.
    await cell(s, 0, 0).focus();
    await page.keyboard.press('ArrowUp');
    expect((await focused(page)).event).toBe('4');
    await page.keyboard.press('ArrowUp');
    expect((await focused(page)).role).toBe('gridcell');
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-all-day-cell'))).toBe(true);
    // Escape on an event goes back to its cell; Space selects it; Delete asks to delete it.
    await cell(s, 20, 2).focus();
    await page.keyboard.press('ArrowRight');
    expect((await focused(page)).event).toBe('2');
    await page.keyboard.press('Space');
    await expect(s.locator('[data-event-id="2"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    expect((await focused(page)).cell).toBe(at(24, 10));
    await expect(s.locator('[data-event-id="2"]')).toHaveAttribute('aria-pressed', 'false');
    // Tab leaves the grid in one step from the roving item; only that item has tabindex 0.
    expect(await s.locator('.salmon-scheduler__time-scroll [tabindex="0"]').count()).toBe(1);
  });

  test('events are labelled buttons with time and resource; axe-core clean after roving', async ({ page }) => {
    await open(page);
    const g = scope(page, 'sched-keys-group');
    const retro = g.locator('.salmon-scheduler__event', { hasText: 'Retro' });
    await expect(retro).toHaveAccessibleName(/Retro.*11:00 AM – 12:00 PM.*Room B/);
    await expect(g.locator('[role="grid"]')).toHaveCount(1);
    await expect(g.locator('[role="gridcell"][data-cell-start]').first()).toHaveAttribute('aria-selected', 'false');
    await scope(page, 'sched-keys').locator('.salmon-scheduler__time-scroll').focus();
    await page.keyboard.press('ArrowRight');
    await expectClean(page, '[data-scenario="sched-keys"]');
    await expectClean(page, '[data-scenario="sched-keys-group"]');
  });

  test('month cells reach their date link, events and the next week by arrows', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-keys-month');
    const nov24 = s.locator(`.salmon-scheduler__month-cell[data-cell-start="${at(24, 0)}"]`);
    await nov24.focus();
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('ArrowDown');
      const f = await focused(page);
      seen.push(f.event ? `event:${f.event}` : f.cell ? `cell:${f.cell}` : `${f.role}:${f.text}`);
      if (f.cell === at(1 + 30, 0) || (f.cell && f.cell !== at(24, 0))) break;
    }
    expect(seen.some((x) => x.startsWith('event:'))).toBe(true);
    // Down ends in the cell one week later.
    expect(seen.at(-1)).toBe(`cell:${at(31, 0)}`);
    // Backwards, the parts inside the previous cell come before the cell itself.
    await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => (document.activeElement?.closest('[role="gridcell"]') as HTMLElement | null)?.dataset['cellStart'])).toBe(at(30, 0));
  });

  test('in RTL ArrowLeft moves to the next day', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-keys-rtl');
    await cell(s, 20, 0).focus();
    await page.keyboard.press('ArrowLeft');
    expect((await focused(page)).cell).toBe(at(23, 10));
    await page.keyboard.press('ArrowRight');
    expect((await focused(page)).cell).toBe(at(22, 10));
  });

  test('keyBindings remap a command and turn one off', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-keys-bind');
    await cell(s, 20, 2).focus();
    await page.keyboard.press('ControlOrMeta+ArrowRight');
    expect(await logs(page, 'sched-keys-bind', 'date')).toHaveLength(0);
    await page.keyboard.press('Alt+PageDown');
    await expect.poll(async () => (await logs(page, 'sched-keys-bind', 'date')).at(-1)?.value).toBe('2026-11-30');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await page.keyboard.press('Alt+PageDown');
    // navigation.previous keeps its default binding.
    await expect.poll(async () => (await logs(page, 'sched-keys-bind', 'date')).length).toBe(3);
  });
});

test.describe('clipboard', () => {
  test('Ctrl+C / Ctrl+V copies the selected event to the selected cell; Ctrl+X moves one; onBeforePaste sees the rows', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-keys');
    await s.locator('[data-event-id="2"]').click();
    await page.keyboard.press('ControlOrMeta+c');
    await cell(s, 28, 4).click();
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(async () => (await logs(page, 'sched-keys', 'add')).length).toBe(1);
    const before = (await logs(page, 'sched-keys', 'beforePaste'))[0];
    expect(before?.details).toEqual({ cut: false, start: '2026-11-26T14:00:00.000Z' });
    const added = (await logs(page, 'sched-keys', 'add'))[0]?.value as Record<string, unknown>[];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ id: 9, title: 'Design review', start: '2026-11-26T14:00:00', end: '2026-11-26T15:30:00' });
    await expect(s.locator('[data-event-id="9"]')).toBeVisible();
    // Cut and paste moves the event (a save, the id stays).
    await s.locator('[data-event-id="3"]').click();
    await page.keyboard.press('ControlOrMeta+x');
    await cell(s, 16, 3).click();
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(async () => (await logs(page, 'sched-keys', 'save')).length).toBe(1);
    const saved = (await logs(page, 'sched-keys', 'save'))[0]?.value as Record<string, unknown>[];
    expect(saved[0]).toMatchObject({ id: 3, start: '2026-11-25T08:00:00', end: '2026-11-25T09:30:00' });
    // A cut pastes once.
    await page.keyboard.press('ControlOrMeta+v');
    await page.waitForTimeout(100);
    expect(await logs(page, 'sched-keys', 'save')).toHaveLength(1);
  });

  test('api.copy / api.paste; an occurrence pastes as a single event; two copies get distinct ids', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-keys');
    await s.locator('[data-event-id="1"]').nth(2).click();
    await s.locator('[data-event-id="2"]').click({ modifiers: ['ControlOrMeta'] });
    expect(await api<number>(page, 'sched-keys', 'copy')).toBe(2);
    const res = await page.evaluate(() => (window.__schedApi['sched-keys'] as any).paste({ start: new Date('2026-11-28T08:00:00Z') }).then((r: { status: string }) => r.status));
    expect(res).toBe('applied');
    const added = (await logs(page, 'sched-keys', 'add'))[0]?.value as Record<string, unknown>[];
    expect(added.map((r) => r['id'])).toEqual([9, 10]);
    // The Tuesday review (10:00) and the Wednesday standup (09:00, 23 hours later): the earliest lands at the target, offsets kept.
    const standup = added.find((r) => r['title'] === 'Standup');
    expect(standup).toMatchObject({ start: '2026-11-29T07:00:00', end: '2026-11-29T07:30:00' });
    expect(standup).not.toHaveProperty('recurrenceRule');
    expect(added.find((r) => r['title'] === 'Design review')).toMatchObject({ start: '2026-11-28T08:00:00' });
  });

  test('a month cell keeps the time of day; a grouped cell sets the resource; onBeforePaste replaces data', async ({ page }) => {
    await open(page);
    const m = scope(page, 'sched-keys-month');
    await m.locator('[data-event-id="2"]').click();
    await page.keyboard.press('ControlOrMeta+c');
    await m.locator(`.salmon-scheduler__month-cell[data-cell-start="${String(Date.UTC(2026, 11, 1))}"]`).click();
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(async () => (await logs(page, 'sched-keys-month', 'add')).length).toBe(1);
    expect(((await logs(page, 'sched-keys-month', 'add'))[0]?.value as Record<string, unknown>[])[0]).toMatchObject({ start: '2026-12-01T10:00:00', end: '2026-12-01T11:30:00' });

    const g = scope(page, 'sched-keys-group');
    await g.locator('.salmon-scheduler__event', { hasText: 'Retro' }).click();
    await page.keyboard.press('ControlOrMeta+c');
    // Room A column (first), 14:00 focused (no cell selection): paste targets the focused cell.
    await g.locator(`.salmon-scheduler__work-cell[data-cell-start="${at(24, 14)}"][data-resource="1"]`).focus();
    await page.evaluate(() => (window.__schedApi['sched-keys-group'] as any).paste());
    await expect.poll(async () => (await logs(page, 'sched-keys-group', 'add')).length).toBe(1);
    expect(((await logs(page, 'sched-keys-group', 'add'))[0]?.value as Record<string, unknown>[])[0]).toMatchObject({ title: 'Retro (copy)', roomId: 1, start: '2026-11-24T14:00:00' });
  });
});

test.describe('adaptive layout', () => {
  test('below the breakpoint the header has a view menu and one resource at a time with a picker; wider restores the layout', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-adaptive');
    const root = s.locator('.salmon-scheduler');
    await expect(root).toHaveAttribute('data-adaptive', '');
    await expect(s.locator('.salmon-scheduler__views')).toHaveCount(0);
    const views = s.getByRole('combobox', { name: 'Views' });
    await expect(views).toHaveValue('week');
    // One resource: Room A's event only, then Room B's after picking it.
    await expect(s.locator('[data-event-id="1"]')).toHaveCount(1);
    await expect(s.locator('[data-event-id="2"]')).toHaveCount(0);
    await s.getByRole('combobox', { name: 'Resource' }).selectOption({ label: 'Room B' });
    await expect(s.locator('[data-event-id="2"]')).toHaveCount(1);
    await expect(s.locator('[data-event-id="1"]')).toHaveCount(0);
    expect((await logs(page, 'sched-adaptive', 'resource')).at(-1)).toMatchObject({ value: 2, details: { source: 'pointer' } });
    await views.selectOption('day');
    await expect.poll(async () => (await logs(page, 'sched-adaptive', 'view')).at(-1)?.value).toBe('day');
    await expect(root).toHaveAttribute('data-view', 'day');
    // Wider than the breakpoint: view buttons and every resource again.
    await s.getByTestId('widen').click();
    await expect(root).not.toHaveAttribute('data-adaptive', '');
    await expect(s.locator('.salmon-scheduler__views button')).toHaveCount(3);
    await expect(s.locator('[data-event-id="1"]')).toHaveCount(1);
    await expect(s.locator('[data-event-id="2"]')).toHaveCount(1);
    await expectClean(page, '[data-scenario="sched-adaptive"]');
  });

  test('the adaptive grid starts at the work start and its native selects draw their own chevron', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-adaptive');
    await expect(s.locator('.salmon-scheduler')).toHaveAttribute('data-adaptive', '');
    await expect.poll(() => s.locator('.salmon-scheduler__time-scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    for (const name of ['Views', 'Resource']) {
      const select = s.getByRole('combobox', { name });
      expect(await select.evaluate((el) => getComputedStyle(el).appearance)).toBe('none');
      expect((await select.boundingBox())?.height).toBe(32);
    }
  });
});
