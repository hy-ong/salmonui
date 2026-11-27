import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Menu family behavior (Dropdown Menu, Split Button): APG Menu Button and Menu keyboard tables, pointer,
// submenus, RTL, dismissal and focus return. Page: examples/vite-spa/menu.html.

const URL = `${DEV_URL}menu.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
const menuOf = (page: Page, trigger: string) => page.locator(`[role="menu"][aria-labelledby="${trigger}"]`);

async function open(page: Page, url = URL): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(url);
  await expect(page.locator('#main')).toBeVisible();
  return problems;
}

test.describe('MenuButton keyboard', () => {
  test('Enter opens the menu on the first item; ARIA links trigger and popup; Escape closes and refocuses', async ({ page }) => {
    const problems = await open(page);
    await page.focus('#main');
    await page.keyboard.press('Enter');
    const menu = menuOf(page, 'main');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('data-placed', '');
    const trigger = page.locator('#main');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toHaveAttribute('data-open', '');
    const menuId = await menu.getAttribute('id');
    await expect(trigger).toHaveAttribute('aria-controls', menuId ?? '');
    expect(await focusedText(page)).toBe('New file');
    await expect(page.locator('[data-item-id="new"]')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    expect(await focusedId(page)).toBe('main');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).not.toHaveAttribute('aria-controls');
    expect(await events(page)).toEqual([
      ['open', true, 'trigger', 'keyboard'],
      ['open', false, 'escape', 'keyboard'],
    ]);
    expect(problems).toEqual([]);
  });

  test('Space and ArrowDown open on the first item, ArrowUp on the last; Alt+ArrowUp closes', async ({ page }) => {
    await open(page);
    await page.focus('#main');
    await page.keyboard.press('Space');
    expect(await focusedText(page)).toBe('New file');
    await page.keyboard.press('Alt+ArrowUp');
    await expect(menuOf(page, 'main')).toHaveCount(0);
    expect(await focusedId(page)).toBe('main');
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('New file');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowUp');
    expect(await focusedText(page)).toBe('Zebra');
  });

  test('arrows wrap and skip disabled items and separators; Home and End', async ({ page }) => {
    await open(page);
    await page.focus('#main');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('Open…');
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('Keep open', 'Delete (disabled) is skipped');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('Export', 'the separator is skipped');
    await page.keyboard.press('End');
    expect(await focusedText(page)).toBe('Zebra');
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('New file', 'wraps to the first');
    await page.keyboard.press('ArrowUp');
    expect(await focusedText(page)).toBe('Zebra', 'wraps to the last');
    await page.keyboard.press('Home');
    expect(await focusedText(page)).toBe('New file');
    // Disabled items keep aria-disabled and stay out of the focus order.
    await expect(page.locator('[data-item-id="disabled"]')).toHaveAttribute('aria-disabled', 'true');
  });

  test('Enter activates the item: item onAction, then the menu onAction; the menu closes and focus returns', async ({ page }) => {
    await open(page);
    await page.focus('#main');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await clearEvents(page);
    await page.keyboard.press('Enter');
    await expect(menuOf(page, 'main')).toHaveCount(0);
    expect(await focusedId(page)).toBe('main');
    expect(await events(page)).toEqual([
      ['item-action', 'open'],
      ['action', 'open', 'keyboard'],
      ['open', false, 'action', 'keyboard'],
    ]);
  });

  test('onAction preventDefault keeps the menu open', async ({ page }) => {
    await open(page);
    await page.click('#main');
    await page.click('[data-item-id="keep"]');
    await expect(menuOf(page, 'main')).toBeVisible();
    expect((await events(page)).filter((e) => e[0] === 'action')).toEqual([['action', 'keep', 'pointer']]);
  });

  test('Tab closes and moves focus past the trigger; Shift+Tab to the element before it', async ({ page }) => {
    await open(page);
    await page.focus('#main');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(menuOf(page, 'main')).toHaveCount(0);
    expect(await focusedId(page)).toBe('after');
    await page.focus('#main');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Tab');
    expect(await focusedId(page)).toBe('before');
    expect((await events(page)).filter((e) => e[0] === 'open' && e[1] === false).map((e) => e[2])).toEqual(['tab', 'tab']);
  });

  test('typeahead moves to the next item that starts with the typed text, skipping disabled items', async ({ page }) => {
    await open(page);
    await page.focus('#main');
    await page.keyboard.press('Enter');
    await page.keyboard.press('z');
    expect(await focusedText(page)).toBe('Zebra');
    await page.waitForTimeout(600);
    await page.keyboard.press('d');
    expect(await focusedText(page)).toBe('Zebra', 'Delete is disabled');
    await page.waitForTimeout(600);
    await page.keyboard.type('ke');
    expect(await focusedText(page)).toBe('Keep open');
  });
});

test.describe('MenuButton pointer and dismissal', () => {
  test('a click opens and focuses the first item; an item click acts with source pointer', async ({ page }) => {
    await open(page);
    await page.click('#main');
    await expect(menuOf(page, 'main')).toBeVisible();
    expect(await focusedText(page)).toBe('New file');
    await page.click('[data-item-id="new"]');
    await expect(menuOf(page, 'main')).toHaveCount(0);
    expect(await events(page)).toEqual([
      ['open', true, 'trigger', 'pointer'],
      ['action', 'new', 'pointer'],
      ['open', false, 'action', 'pointer'],
    ]);
  });

  test('a mouse open shows no focus ring on the first item; the first key press shows it', async ({ page }) => {
    await open(page);
    const ring = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return { text: el.textContent?.trim(), visible: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineStyle };
      });
    await page.click('#main');
    await expect(menuOf(page, 'main')).toBeVisible();
    expect(await ring()).toEqual({ text: 'New file', visible: false, outline: 'none' });
    await page.keyboard.press('ArrowDown');
    const next = await ring();
    expect(next.visible).toBe(true);
    expect(next.outline).toBe('solid');
    await page.keyboard.press('Escape');
    // A keyboard open shows the ring at once.
    await page.focus('#main');
    await page.keyboard.press('Enter');
    expect(await ring()).toEqual({ text: 'New file', visible: true, outline: 'solid' });
  });

  test('clicking the trigger again closes; an outside press closes', async ({ page }) => {
    await open(page);
    await page.click('#main');
    await page.click('#main');
    await expect(menuOf(page, 'main')).toHaveCount(0);
    await page.click('#main');
    await page.mouse.click(900, 700);
    await expect(menuOf(page, 'main')).toHaveCount(0);
    expect((await events(page)).filter((e) => e[1] === false).map((e) => e[2])).toEqual(['trigger', 'outside']);
  });

  test('a disabled item click does nothing', async ({ page }) => {
    await open(page);
    await page.click('#main');
    await page.click('[data-item-id="disabled"]', { force: true });
    await expect(menuOf(page, 'main')).toBeVisible();
    expect((await events(page)).filter((e) => e[0] === 'action')).toEqual([]);
  });

  test('pointer hover highlights items without opening anything else', async ({ page }) => {
    await open(page);
    await page.click('#main');
    await page.hover('[data-item-id="zebra"]');
    await expect(page.locator('[data-item-id="zebra"]')).toHaveAttribute('data-highlighted', '');
    await expect(page.locator('[data-item-id="new"]')).not.toHaveAttribute('data-highlighted');
  });

  test('the popup is at least as wide as the trigger, below it, start-aligned; placement top-end flips side and alignment', async ({ page }) => {
    await open(page);
    await page.click('#main');
    const t = await page.locator('#main').boundingBox();
    const m = await menuOf(page, 'main').boundingBox();
    if (!t || !m) throw new Error('no boxes');
    expect(m.width).toBeGreaterThanOrEqual(t.width - 0.5);
    expect(m.y).toBeGreaterThanOrEqual(t.y + t.height);
    expect(Math.abs(m.x - t.x)).toBeLessThan(1);
    await page.goto(`${URL}?placement=top-end`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#main').evaluate((el) => (el.parentElement!.parentElement!.style.paddingTop = '500px'));
    await page.click('#main');
    const t2 = await page.locator('#main').boundingBox();
    const m2 = await menuOf(page, 'main').boundingBox();
    if (!t2 || !m2) throw new Error('no boxes');
    expect(m2.y + m2.height).toBeLessThanOrEqual(t2.y + 0.5);
    expect(Math.abs(m2.x + m2.width - (t2.x + t2.width))).toBeLessThan(1);
  });

  test('a controlled menu proposes changes through onOpenChange and opens only when the prop changes', async ({ page }) => {
    await open(page);
    await page.click('#controlled');
    await expect(menuOf(page, 'controlled')).toHaveCount(0);
    expect(await events(page)).toEqual([['controlled', true, 'trigger', 'pointer']]);
    await page.evaluate(() => (window as unknown as { __setOpen(v: boolean): void }).__setOpen(true));
    await expect(menuOf(page, 'controlled')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menuOf(page, 'controlled')).toBeVisible();
    expect((await events(page)).at(-1)).toEqual(['controlled', false, 'escape', 'keyboard']);
    await page.evaluate(() => (window as unknown as { __setOpen(v: boolean): void }).__setOpen(false));
    await expect(menuOf(page, 'controlled')).toHaveCount(0);
    expect(await focusedId(page)).toBe('controlled');
  });

  test('defaultOpen opens after mount; a menu whose items are all disabled focuses itself and still closes', async ({ page }) => {
    await open(page, `${URL}?defaultOpen`);
    await expect(page.getByRole('menuitem', { name: 'Default open item' })).toBeVisible();
    await page.mouse.click(900, 700);
    await page.click('#all-disabled');
    const menu = menuOf(page, 'all-disabled');
    await expect(menu).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    expect(await focusedId(page)).toBe('all-disabled');
  });

  test('link items navigate on Enter and on click', async ({ page }) => {
    await open(page);
    await page.focus('#main');
    await page.keyboard.press('Enter');
    await page.keyboard.press('z');
    await page.keyboard.press('Home');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('Link');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#linked$/);
    await expect(menuOf(page, 'main')).toHaveCount(0);
  });
});

test.describe('checkable items', () => {
  test('Space toggles a checkbox item and keeps the menu open; Enter toggles and closes; radio items select one value', async ({ page }) => {
    await open(page);
    await page.focus('#main');
    await page.keyboard.press('Enter');
    await page.keyboard.press('w');
    expect(await focusedText(page)).toBe('Word wrap');
    const wrap = page.locator('[data-item-id="wrap"]');
    await expect(wrap).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Space');
    await expect(wrap).toHaveAttribute('aria-checked', 'true');
    await expect(wrap).toHaveAttribute('data-checked', '');
    await expect(menuOf(page, 'main')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('50%');
    await page.keyboard.press('Space');
    await expect(page.locator('[data-item-id="50"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-item-id="100"]')).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(menuOf(page, 'main')).toHaveCount(0);
    const log = await events(page);
    expect(log.filter((e) => e[0] === 'checked' || e[0] === 'value')).toEqual([
      ['checked', true, 'keyboard'],
      ['value', '50', 'keyboard'],
      ['checked', false, 'keyboard'],
    ]);
    // Uncontrolled state lives in the items: closing unmounts them, reopening starts from the defaults.
  });
});

test.describe('submenus', () => {
  test('ArrowRight opens and focuses the first item; ArrowLeft and Escape close only the submenu', async ({ page }) => {
    await open(page);
    await page.focus('#main');
    await page.keyboard.press('Enter');
    await page.keyboard.press('e');
    const exportItem = page.locator('#export');
    expect(await focusedText(page)).toBe('Export');
    await expect(exportItem).toHaveAttribute('aria-haspopup', 'menu');
    await page.keyboard.press('ArrowRight');
    await expect(exportItem).toHaveAttribute('aria-expanded', 'true');
    expect(await focusedText(page)).toBe('PDF');
    const sub = menuOf(page, 'export');
    await expect(sub).toBeVisible();
    const parent = await menuOf(page, 'main').boundingBox();
    const box = await sub.boundingBox();
    // Beside the parent: the submenu starts at the item's inline end (inside the parent's padding at most).
    expect(box && parent && box.x >= parent.x + parent.width - 8).toBe(true);
    await page.keyboard.press('ArrowLeft');
    await expect(sub).toHaveCount(0);
    expect(await focusedText(page)).toBe('Export');
    await page.keyboard.press('Enter');
    expect(await focusedText(page)).toBe('PDF');
    await page.keyboard.press('Escape');
    await expect(sub).toHaveCount(0);
    await expect(menuOf(page, 'main')).toBeVisible();
    expect(await focusedText(page)).toBe('Export');
  });

  test('nested submenus; choosing a nested item closes the whole tree and reports it', async ({ page }) => {
    await open(page);
    await page.focus('#main');
    await page.keyboard.press('Enter');
    await page.keyboard.press('e');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('End');
    expect(await focusedText(page)).toBe('More formats');
    await page.keyboard.press('ArrowRight');
    expect(await focusedText(page)).toBe('XML');
    await clearEvents(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('[role="menu"]')).toHaveCount(1); // only the standalone Menu remains
    expect(await focusedId(page)).toBe('main');
    expect(await events(page)).toEqual([
      ['action', 'xml', 'keyboard'],
      ['open', false, 'action', 'keyboard'],
    ]);
  });

  test('hover intent opens a submenu after the pointer rests and closes it when the pointer rests on a sibling', async ({ page }) => {
    await open(page);
    await page.click('#main');
    await page.hover('#export');
    await expect(menuOf(page, 'export')).toBeVisible();
    // A pointer move over a submenu item keeps it open.
    await page.hover('[data-item-id="csv"]');
    await page.waitForTimeout(300);
    await expect(menuOf(page, 'export')).toBeVisible();
    await page.hover('[data-item-id="zebra"]');
    await expect(menuOf(page, 'export')).toHaveCount(0);
    // A click inside the submenu is not an outside press.
    await page.hover('#export');
    await page.click('[data-item-id="pdf"]');
    expect((await events(page)).filter((e) => e[0] === 'action')).toEqual([['action', 'pdf', 'pointer']]);
  });

  test('RTL: the popup aligns to the trigger end, ArrowLeft opens a submenu on the left, ArrowRight closes it', async ({ page }) => {
    await open(page, `${URL}?dir=rtl`);
    await page.click('#main');
    const t = await page.locator('#main').boundingBox();
    const m = await menuOf(page, 'main').boundingBox();
    if (!t || !m) throw new Error('no boxes');
    expect(Math.abs(m.x + m.width - (t.x + t.width))).toBeLessThan(1);
    await expect(menuOf(page, 'main')).toHaveAttribute('dir', 'rtl');
    await page.keyboard.press('e');
    await page.keyboard.press('ArrowRight');
    await expect(menuOf(page, 'export')).toHaveCount(0);
    await page.keyboard.press('ArrowLeft');
    const sub = await menuOf(page, 'export').boundingBox();
    if (!sub) throw new Error('no submenu');
    expect(sub.x + sub.width).toBeLessThanOrEqual(m.x + 8);
    await page.keyboard.press('ArrowRight');
    await expect(menuOf(page, 'export')).toHaveCount(0);
    expect(await focusedText(page)).toBe('Export');
  });
});

test.describe('SplitButton', () => {
  test('the primary click runs onClick; the trigger opens the menu; two tab stops', async ({ page }) => {
    await open(page);
    await page.click('#save');
    expect(await events(page)).toEqual([['primary']]);
    await page.focus('#save');
    await page.keyboard.press('Tab');
    const trigger = page.locator('[aria-labelledby="save"] .salmon-split-button-trigger');
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    const triggerId = await trigger.getAttribute('id');
    await expect(trigger).toHaveAttribute('data-open', '');
    const menu = menuOf(page, triggerId ?? '');
    await expect(menu).toBeVisible();
    expect(await focusedText(page)).toBe('Cut');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect((await events(page)).at(-1)).toEqual(['split', 'copy']);
  });

  test('Alt+ArrowDown on the primary part opens the menu', async ({ page }) => {
    await open(page);
    await page.focus('#save');
    await page.keyboard.press('Alt+ArrowDown');
    expect(await focusedText(page)).toBe('Cut');
    await page.keyboard.press('Escape');
    await expect(page.locator('[aria-labelledby="save"] .salmon-split-button-trigger')).toBeFocused();
  });
});

test.describe('SSR and hydration', () => {
  test('server markup has no popup; hydration reports nothing; defaultOpen opens after hydration', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate&defaultOpen`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain('Default open item');
    expect(html).toContain('role="menu"'); // the standalone Menu only
    expect((html.match(/role="menu"/g) ?? []).length).toBe(1);
    await expect(page.getByRole('menuitem', { name: 'Default open item' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.click('#main');
    await expect(menuOf(page, 'main')).toBeVisible();
    expect(problems).toEqual([]);
  });
});

test.describe('standalone Menu', () => {
  test('one tab stop with roving focus; Enter acts; Escape and Tab are not intercepted', async ({ page }) => {
    await open(page);
    await page.locator('[data-item-id="s1"]').focus();
    await expect(page.locator('[data-item-id="s1"]')).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('Two');
    await expect(page.locator('[data-item-id="s1"]')).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('[data-item-id="s2"]')).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('Enter');
    expect((await events(page)).at(-1)).toEqual(['standalone', 's2']);
    expect(await focusedText(page)).toBe('Two');
  });
});

test.describe('development warnings', () => {
  test('children win over items with a warning; switching open from uncontrolled to controlled warns', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?warnings`);
    await expect(page.getByRole('menuitem', { name: 'From children' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'From items' })).toHaveCount(0);
    await page.click('#make-controlled');
    await expect.poll(() => problems.join('\n')).toContain('MenuButton open from uncontrolled to controlled');
    expect(problems.some((p) => p.includes('received both menu children and `items`'))).toBe(true);
  });
});

test.describe('menu buttons inside a ButtonGroup', () => {
  test('a MenuButton and a SplitButton in a horizontal group join their neighbours and open their menus', async ({ page }) => {
    await open(page);
    const edit = await page.locator('#row-first').boundingBox();
    const more = await page.locator('#row-menu').boundingBox();
    const share = await page.locator('#row-split').boundingBox();
    if (!edit || !more || !share) throw new Error('no boxes');
    expect(Math.abs(more.x - (edit.x + edit.width - 1))).toBeLessThan(1.5);
    expect(Math.abs(share.x - (more.x + more.width - 1))).toBeLessThan(1.5);
    const radius = await page.locator('#row-split').evaluate((el) => getComputedStyle(el).borderStartStartRadius);
    expect(radius).toBe('0px');
    await page.click('#row-menu');
    await expect(menuOf(page, 'row-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    const trigger = page.locator('[aria-labelledby="row-split"] .salmon-split-button-trigger');
    await trigger.click();
    await expect(page.locator(`[role="menu"][aria-labelledby="${await trigger.getAttribute('id')}"]`)).toBeVisible();
  });

  test('a SplitButton in a vertical group stays one horizontal row spanning the group width', async ({ page }) => {
    await open(page);
    const group = await page.locator('#column-group').boundingBox();
    const primary = await page.locator('#column-split').boundingBox();
    const trigger = await page.locator('[aria-labelledby="column-split"] .salmon-split-button-trigger').boundingBox();
    const copy = await page.locator('#column-first').boundingBox();
    if (!group || !primary || !trigger || !copy) throw new Error('no boxes');
    expect(Math.abs(primary.y - trigger.y)).toBeLessThan(1);
    expect(Math.abs(trigger.x + trigger.width - (group.x + group.width))).toBeLessThan(1.5);
    expect(Math.abs(primary.x - group.x)).toBeLessThan(1.5);
    expect(Math.abs(primary.y - (copy.y + copy.height - 1))).toBeLessThan(1.5);
    await page.locator('[aria-labelledby="column-split"] .salmon-split-button-trigger').click();
    expect(await focusedText(page)).toBe('Cut');
  });
});

test.describe('menu metrics', () => {
  test('the popup is a large-radius surface and its items use the small radius', async ({ page }) => {
    await open(page);
    await page.click('#main');
    const m = await menuOf(page, 'main').evaluate((el) => ({
      menu: getComputedStyle(el).borderRadius,
      item: getComputedStyle(el.querySelector('.salmon-menu-item') as Element).borderRadius,
    }));
    expect(m).toEqual({ menu: '10px', item: '4px' });
  });

  test('the trigger-width minimum is a custom property, so a styles.menu min-inline-size still wins', async ({ page }) => {
    await open(page);
    await page.click('#main');
    const m = await menuOf(page, 'main').evaluate((el) => ({
      inlineMinWidth: (el as HTMLElement).style.minWidth,
      anchor: (el as HTMLElement).style.getPropertyValue('--salmon-menu-anchor-width'),
      min: parseFloat(getComputedStyle(el).minInlineSize),
    }));
    const t = await page.locator('#main').boundingBox();
    expect(m.inlineMinWidth).toBe('');
    expect(m.anchor).toMatch(/px$/);
    expect(m.min).toBeGreaterThanOrEqual(Math.max(160, (t?.width ?? 0) - 0.5));
  });

  test('a popup opened inside a theme scope portals into that scope, not the body', async ({ page }) => {
    await open(page);
    await page.locator('#main').evaluate((el) => el.parentElement!.classList.add('salmon-theme-scope'));
    await page.click('#main');
    const inScope = await menuOf(page, 'main').evaluate((el) => el.parentElement?.closest('.salmon-theme-scope') !== null);
    expect(inScope).toBe(true);
  });
});
