import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Ribbon recipe (multi-size items and labelled groups): Tabs whose panels hold a Toolbar of
// labelled groups with multi-size items stepping down by overflowPriority
// before they overflow, group overflow popups, the group launcher, the File
// menu, contextual tabs, the classic / simplified layout, minimize with a
// Popover, item tooltips, other Salmon controls as items, and the APG tabs
// and toolbar keys. Page: examples/vite-spa/ribbon.html.

const URL = `${DEV_URL}ribbon.html`;
const SIZED = ['rb-paste', 'rb-cut', 'rb-copy', 'rb-find'] as const;
type Slot = { size: string; hidden: boolean };
type Snapshot = Record<string, Slot>;

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: unknown[][] }).__events);
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
const setWidth = (page: Page, px: number) => page.evaluate((w) => (window as unknown as { __setWidth: (n: number) => void }).__setWidth(w), px);

/** Size and hidden state of every item of the #rb toolbar, keyed by the id of its control. */
const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => {
    const out: Record<string, { size: string; hidden: boolean }> = {};
    for (const slot of document.querySelectorAll<HTMLElement>('#rb .salmon-toolbar-item')) {
      const id = slot.querySelector('[id]')?.id;
      if (id) out[id] = { size: slot.dataset['size'] ?? '', hidden: slot.hidden };
    }
    return out;
  });

/** Waits for a settled fit after a width change (two animation frames with no attribute change). */
async function settle(page: Page): Promise<Snapshot> {
  let prev = '';
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const now = JSON.stringify(await snapshot(page));
    if (now === prev) return JSON.parse(now) as Snapshot;
    prev = now;
  }
  throw new Error('the toolbar fit did not settle');
}

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query}`);
  await expect(page.locator('#ribbon')).toBeVisible();
  return problems;
}

/** Shrinks the ribbon from `from` to `to` px in `step` px steps; returns the settled snapshot at each width. */
async function sweep(page: Page, from: number, to: number, step: number): Promise<[number, Snapshot][]> {
  const out: [number, Snapshot][] = [];
  for (let w = from; w >= to; w -= step) {
    await setWidth(page, w);
    out.push([w, await settle(page)]);
  }
  return out;
}

const RANK: Record<string, number> = { lg: 0, md: 1, sm: 2 };

test.describe('Ribbon: multi-size Toolbar items', () => {
  test('wide: every multi-size item renders its first size and nothing overflows; groups show their labels', async ({ page }) => {
    const problems = await open(page, '?width=1200');
    const snap = await settle(page);
    for (const id of SIZED) expect(snap[id], id).toEqual({ size: 'lg', hidden: false });
    expect(Object.values(snap).some((s) => s.hidden)).toBe(false);
    await expect(page.locator('#rb .salmon-toolbar-more')).toBeHidden();
    for (const name of ['Clipboard', 'Font', 'Editing']) await expect(page.locator('#rb').getByRole('group', { name, exact: true })).toBeVisible();
    await expect(page.locator('#rb .salmon-toolbar-group-label').first()).toHaveText('Clipboard');
    // A large item stacks a button's icon over its label.
    expect(await page.locator('#rb-paste').evaluate((el) => getComputedStyle(el).flexDirection)).toBe('column');
    expect(problems).toEqual([]);
  });

  test('shrinking steps items down through their sizes by overflowPriority (ties: last first) before anything overflows; growing restores', async ({ page }) => {
    const problems = await open(page, '?width=1200');
    await settle(page);
    const states = await sweep(page, 1200, 260, 20);
    const firstStep: Record<string, number> = {};
    const firstHidden: Record<string, number> = {};
    const last: Record<string, number> = {};
    for (const [w, snap] of states) {
      // Overflow waits until every multi-size item is at its last size.
      if (Object.values(snap).some((s) => s.hidden)) for (const id of SIZED) expect(snap[id]?.size, `${id} at ${w}px`).toBe('sm');
      for (const id of SIZED) {
        const rank = RANK[snap[id]?.size ?? 'lg'] as number;
        // Shrinking never steps an item back up.
        expect(rank, `${id} at ${w}px`).toBeGreaterThanOrEqual(last[id] ?? 0);
        last[id] = rank;
        if (rank > 0) firstStep[id] ??= w;
      }
      for (const [id, s] of Object.entries(snap)) if (s.hidden) firstHidden[id] ??= w;
    }
    // Step-down order: Find (priority 0), then Copy and Cut (priority 1, the later one first), then Paste (priority 3).
    expect(firstStep['rb-find']).toBeGreaterThanOrEqual(firstStep['rb-copy'] as number);
    expect(firstStep['rb-copy']).toBeGreaterThanOrEqual(firstStep['rb-cut'] as number);
    expect(firstStep['rb-cut']).toBeGreaterThan(firstStep['rb-paste'] as number);
    // Overflow order: the single-size priority-0 items from the end, then the same priority order.
    expect(firstHidden['rb-track']).toBeGreaterThanOrEqual(firstHidden['rb-replace'] as number);
    expect(firstHidden['rb-replace']).toBeGreaterThanOrEqual(firstHidden['rb-find'] as number);
    expect(firstHidden['rb-find']).toBeGreaterThanOrEqual(firstHidden['rb-copy'] as number);
    expect(firstHidden['rb-copy']).toBeGreaterThanOrEqual(firstHidden['rb-cut'] as number);
    expect(firstHidden['rb-cut']).toBeGreaterThanOrEqual(firstHidden['rb-paste'] as number);
    // Inputs (overflow="never") stay in the bar.
    const narrow = states[states.length - 1]?.[1] as Snapshot;
    expect(narrow['rb-font']?.hidden).toBe(false);
    await setWidth(page, 1200);
    const wide = await settle(page);
    for (const id of SIZED) expect(wide[id], id).toEqual({ size: 'lg', hidden: false });
    expect(problems).toEqual([]);
  });

  test('a resize that keeps the fit changes nothing', async ({ page }) => {
    await open(page, '?width=1200');
    const before = await settle(page);
    await setWidth(page, 1190);
    expect(await settle(page)).toEqual(before);
  });

  test('group overflow popups: overflowed items are listed under their group label; an entry clicks the hidden control', async ({ page }) => {
    const problems = await open(page, '?width=420');
    const snap = await settle(page);
    expect(snap['rb-copy']?.hidden).toBe(true);
    await page.locator('#rb .salmon-toolbar-more').click();
    const menu = page.locator('.salmon-toolbar-menu [role="menu"]');
    await expect(menu).toBeVisible();
    const clipboard = menu.getByRole('group', { name: 'Clipboard' });
    await expect(clipboard.getByRole('menuitem', { name: 'Copy' })).toBeVisible();
    await expect(menu.getByRole('group', { name: 'Editing' }).getByRole('menuitem', { name: 'Find' })).toBeVisible();
    await clipboard.getByRole('menuitem', { name: 'Copy' }).click();
    await expect(menu).toBeHidden();
    expect(await events(page)).toContainEqual(['click', 'rb-copy']);
    expect(problems).toEqual([]);
  });

  test('a labelled group hides with its last item', async ({ page }) => {
    await open(page, '?width=220');
    const snap = await settle(page);
    expect(['rb-paste', 'rb-cut', 'rb-copy'].every((id) => snap[id]?.hidden)).toBe(true);
    await expect(page.locator('#rb').getByRole('group', { name: 'Clipboard' })).toBeHidden();
    await expect(page.locator('#rb').getByRole('group', { name: 'Font', exact: true })).toBeVisible();
  });

  test('simplified layout: every item at its single small size', async ({ page }) => {
    await open(page, '?width=1200');
    await settle(page);
    await page.locator('#layout').click();
    const snap = await settle(page);
    for (const id of SIZED) expect(snap[id]?.size, id).toBe('sm');
    await expect(page.locator('#rb [data-overflow-sizes]')).toHaveCount(0);
    await expect(page.locator('#rb-paste')).toHaveAttribute('aria-label', 'Paste');
    await page.locator('#layout').click();
    const back = await settle(page);
    for (const id of SIZED) expect(back[id]?.size, id).toBe('lg');
  });
});

test.describe('Ribbon: structure and composition', () => {
  test('tabs select panels; each panel holds a toolbar of labelled groups', async ({ page }) => {
    const problems = await open(page, '?width=1200');
    await page.getByRole('tab', { name: 'Insert' }).click();
    await expect(page.getByRole('toolbar', { name: 'Insert commands' })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Insert commands' }).getByRole('group', { name: 'Illustrations' })).toBeVisible();
    await expect(page.locator('#rb')).toHaveCount(0);
    expect(await events(page)).toContainEqual(['tab', 'insert']);
    await page.getByRole('tab', { name: 'Home' }).click();
    await expect(page.locator('#rb')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('any Salmon control is an item: Select, ToggleButtonGroup, ColorPicker, SplitButton, Checkbox, Combobox', async ({ page }) => {
    await open(page, '?width=1200');
    const bar = page.getByRole('toolbar', { name: 'Home commands' });
    await expect(bar.getByRole('combobox', { name: 'Font', exact: true })).toBeVisible();
    await expect(bar.getByRole('group', { name: 'Text style' })).toBeVisible();
    await expect(bar.locator('[class*="salmon-color-picker"]').first()).toBeVisible();
    await expect(bar.locator('#rb-replace')).toBeVisible();
    await expect(bar.getByRole('checkbox', { name: 'Track' })).toBeVisible();
    await page.getByRole('tab', { name: 'Insert' }).click();
    await expect(page.getByRole('toolbar', { name: 'Insert commands' }).getByRole('combobox', { name: 'Shape' })).toBeVisible();
  });

  test('a gallery item opens a Listbox grid of tiles in a Popover; arrows move across tiles, Enter applies one', async ({ page }) => {
    await open(page, '?width=1200');
    await settle(page);
    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.locator('#rb-gallery').click();
    const grid = page.getByRole('grid', { name: 'Styles' });
    await expect(grid).toBeVisible();
    await expect(grid.getByRole('row')).toHaveCount(2);
    await expect(grid.getByRole('gridcell')).toHaveCount(6);
    await grid.focus();
    const active = () => grid.evaluate((el) => document.getElementById(el.getAttribute('aria-activedescendant') ?? '')?.textContent ?? '');
    // The grid keys load after mount: step until each move lands.
    await expect(async () => {
      await page.keyboard.press('ArrowRight');
      expect(await active()).toBe('Title');
    }).toPass();
    await page.keyboard.press('ArrowDown');
    await expect.poll(active).toBe('Quote');
    await page.keyboard.press('Enter');
    expect(await events(page)).toContainEqual(['gallery', 'quote']);
    await page.keyboard.press('Escape');
    await expect(grid).toHaveCount(0);
    await expect(page.locator('#rb-gallery')).toBeFocused();
  });

  test('group launcher: a button in the label slot, a toolbar stop after the group items', async ({ page }) => {
    await open(page, '?width=1200');
    await settle(page);
    await page.locator('#rb-launch').click();
    expect(await events(page)).toContainEqual(['launch', 'clipboard']);
    await page.focus('#rb-copy');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('rb-launch');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId(page)).toBe('rb-copy');
  });

  test('File menu: a MenuButton before the TabList', async ({ page }) => {
    await open(page, '?width=1200');
    await page.locator('#file').click();
    await page.getByRole('menuitem', { name: 'Save' }).click();
    expect(await events(page)).toContainEqual(['file', 'save']);
  });

  test('contextual tabs: rendered while the context applies', async ({ page }) => {
    await open(page, '?width=1200');
    await expect(page.getByRole('tab', { name: 'Table Design' })).toHaveCount(0);
    await page.locator('#table-selected').check();
    await page.getByRole('tab', { name: 'Table Design' }).click();
    await expect(page.getByRole('toolbar', { name: 'Table design commands' })).toBeVisible();
    await page.locator('#table-selected').uncheck();
    await expect(page.getByRole('tab', { name: 'Table Design' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#rb')).toBeVisible();
  });

  test('minimize: collapsed hides the panels; a tab click shows the panel in a Popover; Escape closes it', async ({ page }) => {
    const problems = await open(page, '?width=1000');
    await page.locator('#collapse').click();
    await expect(page.locator('#rb')).toHaveCount(0);
    await expect(page.getByRole('tabpanel')).toBeHidden();
    await page.getByRole('tab', { name: 'Insert' }).click();
    const popup = page.getByRole('dialog', { name: 'Ribbon commands' });
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('toolbar', { name: 'Insert commands' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await page.getByRole('tab', { name: 'Insert' }).click();
    await expect(popup).toBeVisible();
    await page.locator('#collapse').click();
    await expect(popup).toBeHidden();
    await expect(page.getByRole('toolbar', { name: 'Insert commands' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('item tooltips: title and description, described by the tooltip', async ({ page }) => {
    await open(page, '?width=1200');
    await settle(page);
    await page.locator('#rb-paste').hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip.locator('strong')).toHaveText('Paste');
    await expect(tip).toContainText('Add content from the clipboard.');
    const described = await page.locator('#rb-paste').getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(await page.evaluate((id) => document.getElementById(id)?.textContent ?? '', described as string)).toContain('Add content from the clipboard.');
  });
});

test.describe('Ribbon: keyboard', () => {
  test('Tab order: File, the tab list (one stop), the layout buttons, then the toolbar (one stop); arrows move inside each', async ({ page }) => {
    await open(page, '?width=1200');
    await settle(page);
    await page.focus('#table-selected');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('file');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Insert' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Insert' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('layout');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('collapse');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('rb-paste');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('rb-cut');
    await page.keyboard.press('End');
    expect(await focusedId(page)).toBe('rb-track');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('after');
    await page.keyboard.press('Shift+Tab');
    expect(await focusedId(page)).toBe('rb-track');
  });

  test('overflow menu keys: ArrowDown on More opens the menu on the first entry, Escape returns focus', async ({ page }) => {
    await open(page, '?width=420');
    await settle(page);
    await page.locator('#rb .salmon-toolbar-more').focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.locator('.salmon-toolbar-menu [role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('#rb .salmon-toolbar-more')).toBeFocused();
  });

  test('focus on an item that overflows moves to More', async ({ page }) => {
    await open(page, '?width=1200');
    await settle(page);
    await page.focus('#rb-track');
    await setWidth(page, 300);
    await settle(page);
    await expect(page.locator('#rb .salmon-toolbar-more')).toBeFocused();
  });
});

test.describe('Ribbon: server rendering', () => {
  test('server markup renders every item at its first size with the group labels; hydration has no warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate&width=600`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).toContain('data-overflow-sizes="lg md sm" data-size="lg"');
    expect(html).not.toMatch(/class="salmon-toolbar-item"[^>]*hidden/);
    expect(html).toMatch(/<div class="salmon-toolbar-group-label"><span id="[^"]+">Clipboard<\/span>/);
    // After mount the fit applies.
    const snap = await settle(page);
    expect(snap['rb-paste']?.size).not.toBe('lg');
    expect(problems).toEqual([]);
  });
});
