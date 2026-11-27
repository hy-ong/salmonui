import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { axeDropdowns } from './dropdowns-axe.ts';
import { DEV_URL } from './helpers.ts';

// Shared dropdown behavior across Select, Combobox, Listbox, Mention and
// TreeSelect (accessibility, popup and filtering): axe in the test:a11y run, ARIA snapshots, forced
// colors, touch targets, focus, popup size and placement, dismissal,
// controlled filtering, load errors, type-ahead under virtualization and the
// cost of closed dropdowns. The file name matches the `test:a11y` filter
// (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function dropdowns(page: Page): Promise<void> {
  await page.goto(`${DEV_URL}dropdowns.html`);
  await page.waitForFunction(() => window.__dd?.ready === true);
  // The popup and search chunks load after mount.
  await page.waitForTimeout(300);
}

const popup = (page: Page) => page.locator('.salmon-dropdown-popup');
const events = (page: Page, id: string) => page.evaluate((i) => window.__dd.events.filter((e) => e.id === i), id);
const activeId = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-activedescendant') ?? null);
const activeText = (page: Page) =>
  page.evaluate(() => {
    const id = document.activeElement?.getAttribute('aria-activedescendant');
    return id ? (document.getElementById(id)?.textContent ?? null) : null;
  });

async function axeAll(page: Page, selector: string): Promise<{ id: string; nodes: string[] }[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (sel) => {
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
    const include = [...document.querySelectorAll(sel)].map((el) => [el]);
    const result = await axeApi.run({ include }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v: any) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')) }));
  }, selector);
}

test.describe('Dropdowns accessibility (DDA11Y)', () => {
  test('axe: zero violations for Select and Combobox closed and open, Mention closed, in light and dark', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await dropdowns(page);
      expect(await axeDropdowns(page), `closed ${scheme}`).toEqual([]);
      for (const id of ['#select-basic', '#select-multi', '#select-search', '#select-groups', '#cbx-large', '#cbx-columns']) {
        await page.locator(id).click();
        if (id.startsWith('#cbx')) await page.locator(id).press('ArrowDown');
        // The list (or the lazy columns grid) is in the DOM before axe runs.
        await expect(popup(page).locator('[role="listbox"], [role="grid"]').first()).toBeVisible();
        expect(await axeDropdowns(page), `${id} ${scheme}`).toEqual([]);
        await page.keyboard.press('Escape');
        if (await popup(page).count()) await page.keyboard.press('Escape');
      }
      await page.goto(`${DEV_URL}mention.html${scheme === 'dark' ? '?scheme=dark' : ''}`);
      await expect(page.locator('#field')).toBeVisible();
      expect(await axeAll(page, '.salmon-mention'), `mention closed ${scheme}`).toEqual([]);
    }
  });

  test('field parts: label names and description / error describe the Select and Combobox; pressing the label focuses the control; the popup is labelled too', async ({ page }) => {
    await dropdowns(page);
    const select = page.getByRole('combobox', { name: 'Status' });
    await expect(select).toHaveAttribute('id', 'select-labelled');
    await expect(select).toHaveAccessibleDescription('Shown to the customer Pick a status');
    await expect(select).toHaveAttribute('aria-invalid', 'true');
    const owner = page.getByRole('combobox', { name: 'Owner' });
    await expect(owner).toHaveAccessibleDescription('Type to search');
    await page.locator('[data-fixture="select-labelled"] label').click();
    await expect(select).toBeFocused();
    // The label press only focuses; the popup opens from the trigger as usual.
    await expect(popup(page)).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox', { name: 'Status' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('[data-fixture="cbx-labelled"] label').click();
    await expect(owner).toBeFocused();
    // The label sits above the control at the inline start in either direction.
    const box = await page.locator('[data-fixture="select-labelled"] .salmon-dropdown-field').evaluate((el) => {
      const [label, control] = [el.children[0]!.getBoundingClientRect(), el.children[1]!.getBoundingClientRect()];
      return { above: label.bottom <= control.top + 1, start: Math.abs(label.left - control.left) < 1 };
    });
    expect(box).toEqual({ above: true, start: true });
  });

  test('ARIA snapshots of the open Select and Combobox popups; the result count is announced', async ({ page }) => {
    await dropdowns(page);
    await page.locator('#select-basic').click();
    await expect(popup(page).getByRole('listbox')).toMatchAriaSnapshot(`
      - listbox "Fruit":
        - option "Apple"
        - option "Banana" [selected]
    `);
    await page.keyboard.press('Escape');
    await page.locator('#cbx-large').click();
    await page.keyboard.type('Item 99');
    await expect(popup(page).getByRole('listbox')).toMatchAriaSnapshot(`
      - listbox "Large combobox":
        - option "Item 99"
        - option "Item 990"
    `);
    const first = popup(page).getByRole('option').first();
    await expect(first).toHaveAttribute('aria-setsize', '11');
    await expect(first).toHaveAttribute('aria-posinset', '1');
    await expect(popup(page).locator('.salmon-dropdown-live')).toHaveText(/11/);
  });

  test('Combobox under virtualization: bounded DOM, the active option stays mounted when scrolled away', async ({ page }) => {
    await dropdowns(page);
    await page.locator('#cbx-large').click();
    await page.locator('#cbx-large').press('ArrowDown');
    await page.locator('#cbx-large').press('ArrowDown');
    const list = popup(page).getByRole('listbox');
    expect(await list.getByRole('option').count()).toBeLessThanOrEqual(5 + 2 * 6);
    await expect(list.getByRole('option').first()).toHaveAttribute('aria-setsize', '1000');
    const id = await activeId(page);
    expect(id).toBeTruthy();
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(100);
    await expect(page.locator(`[id="${id}"]`)).toBeAttached();
    expect(await list.getByRole('option').count()).toBeLessThanOrEqual(5 + 2 * 6 + 1);
  });

  test('forced colors: selected, active and disabled options and chips stay distinguishable in every dropdown', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await dropdowns(page);
    // Select: disabled options use GrayText, unlike enabled ones.
    await page.locator('#select-basic').click();
    const color = (name: string) => popup(page).getByRole('option', { name, exact: true }).evaluate((el) => getComputedStyle(el).color);
    const disabledName = await popup(page).locator('[role="option"][aria-disabled="true"]').first().innerText();
    expect(await color(disabledName.trim())).not.toBe(await color('Apple'));
    await page.keyboard.press('Escape');
    // Combobox chips keep a visible border.
    const chip = page.locator('#cbx-multi').locator('xpath=ancestor::*[contains(@class,"salmon-combobox")][1]').locator('.salmon-combobox-chip').first();
    const border = await chip.evaluate((el) => getComputedStyle(el).borderStyle + ' ' + getComputedStyle(el).borderWidth);
    expect(border).not.toMatch(/^none|0px$/);
    // Listbox: selected background and active outline.
    await page.goto(`${DEV_URL}listbox.html?case=multiple`);
    const lb = page.getByRole('listbox');
    await lb.focus();
    const sel = await lb.locator('[aria-selected="true"]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const plain = await lb.locator('[aria-selected="false"]:not([aria-disabled])').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(sel).not.toBe(plain);
    expect(await lb.locator('[data-active]').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    // Mention: the active option has an outline.
    await page.goto(`${DEV_URL}mention.html`);
    await page.locator('#field').click();
    await page.keyboard.type('@');
    await page.keyboard.press('ArrowDown');
    const mActive = page.locator('.salmon-mention-popup [role="option"][data-active]');
    await expect(mActive).toBeVisible();
    const outline = await mActive.evaluate((el) => `${getComputedStyle(el).outlineStyle}|${getComputedStyle(el).backgroundColor}`);
    const mPlain = await page.locator('.salmon-mention-popup [role="option"]:not([data-active]):not([aria-disabled="true"])').first().evaluate((el) => `${getComputedStyle(el).outlineStyle}|${getComputedStyle(el).backgroundColor}`);
    expect(outline).not.toBe(mPlain);
  });

  test('touch targets are at least 24 × 24 px; chip remove buttons are visible without hover', async ({ page }) => {
    await dropdowns(page);
    const min = async (selector: string) => {
      for (const el of await page.locator(selector).all()) {
        const box = await el.boundingBox();
        if (!box) continue;
        expect(box.height, selector).toBeGreaterThanOrEqual(24);
        expect(box.width, selector).toBeGreaterThanOrEqual(24);
      }
    };
    await min('#cbx-basic');
    await page.locator('#cbx-basic').click();
    await page.locator('#cbx-basic').press('ArrowDown');
    await min('.salmon-dropdown-popup [role="option"]');
    await page.keyboard.press('Escape');
    const remove = page.locator('.salmon-combobox-chip-remove').first();
    await page.mouse.move(0, 0);
    // No hover-only controls: the remove button is shown and opaque without a hover.
    await expect(remove).toBeVisible();
    expect(await remove.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    await min('.salmon-combobox-chip-remove');
    await page.goto(`${DEV_URL}listbox.html?case=basic`);
    await min('[role="option"]');
    await page.goto(`${DEV_URL}mention.html`);
    await page.locator('#field').click();
    await page.keyboard.type('@');
    await min('.salmon-mention-popup [role="option"]');
    await page.goto(`${DEV_URL}tree-select.html`);
    await min('[role="combobox"]');
  });

  test('a short viewport (on-screen keyboard) keeps the popup on screen and the active option visible', async ({ page }) => {
    await dropdowns(page);
    // The trigger near the bottom of a short viewport: the popup flips above it.
    await page.setViewportSize({ width: 1280, height: 360 });
    await page.locator('#cbx-basic').evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await page.locator('#cbx-basic').click();
    await page.locator('#cbx-basic').press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    const t = (await page.locator('#cbx-basic').boundingBox())!;
    const p = (await popup(page).boundingBox())!;
    expect(p.y + p.height).toBeLessThanOrEqual(t.y + 1);
    expect(p.y).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 10; i++) await page.locator('#cbx-basic').press('ArrowDown');
    const id = (await activeId(page))!;
    const a = (await page.locator(`[id="${id}"]`).boundingBox())!;
    const l = (await popup(page).getByRole('listbox').boundingBox())!;
    expect(a.y).toBeGreaterThanOrEqual(l.y - 1);
    expect(a.y + a.height).toBeLessThanOrEqual(l.y + l.height + 1);
  });

  test('focus: the trigger keeps focus through open and close, a pointer pick returns focus, a visible focus ring', async ({ page }) => {
    await dropdowns(page);
    // Keyboard focus shows a ring on the Select trigger and the Combobox field.
    await page.locator('#select-basic').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('#select-basic')).toBeFocused();
    const ring = (sel: string) => page.locator(sel).evaluate((el) => {
      const own = getComputedStyle(el);
      const root = el.closest('.salmon-combobox-field, .salmon-select, .salmon-combobox') as HTMLElement | null;
      const r = root ? getComputedStyle(root) : own;
      return (own.outlineStyle !== 'none' && own.outlineWidth !== '0px') || own.boxShadow !== 'none' || (r.outlineStyle !== 'none' && r.outlineWidth !== '0px') || r.boxShadow !== 'none';
    });
    expect(await ring('#select-basic')).toBe(true);
    await page.keyboard.press('Enter');
    await expect(popup(page)).toBeVisible();
    await expect(page.locator('#select-basic')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#select-basic')).toBeFocused();
    // Combobox: a pointer pick commits and leaves focus in the field.
    await page.locator('#cbx-basic').click();
    await page.locator('#cbx-basic').press('ArrowDown');
    await popup(page).getByRole('option').nth(1).click();
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator('#cbx-basic')).toBeFocused();
    expect(await ring('#cbx-basic')).toBe(true);
  });
});

test.describe('Dropdown popups (DDPOP)', () => {
  test('maxVisibleItems sets the list height; styles.popup and the trigger width size the popup', async ({ page }) => {
    await dropdowns(page);
    await page.locator('#cbx-large').click();
    await page.locator('#cbx-large').press('ArrowDown');
    const list = popup(page).getByRole('listbox');
    const h = await list.locator('[role="option"]').first().evaluate((el) => (el as HTMLElement).offsetHeight);
    const lh = await list.evaluate((el) => (el as HTMLElement).clientHeight);
    expect(Math.abs(lh - 5 * h)).toBeLessThanOrEqual(2);
    expect(Math.round((await popup(page).boundingBox())!.width)).toBeGreaterThanOrEqual(360);
    await page.keyboard.press('Escape');
    // Default: the popup is at least as wide as the field, 8 items high.
    await page.locator('#cbx-basic').click();
    await page.locator('#cbx-basic').press('ArrowDown');
    const field = (await page.locator('#cbx-basic').locator('xpath=ancestor::*[contains(@class,"salmon-combobox")][1]').boundingBox())!;
    expect(Math.round((await popup(page).boundingBox())!.width)).toBeGreaterThanOrEqual(Math.round(field.width));
    const list2 = popup(page).getByRole('listbox');
    const h2 = await list2.locator('[role="option"]').first().evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(await list2.evaluate((el) => (el as HTMLElement).clientHeight)).toBeLessThanOrEqual(8 * h2 + 2);
  });

  test('Combobox closes on outside press, Escape and Tab, with the value unchanged', async ({ page }) => {
    await dropdowns(page);
    const cbx = page.locator('#cbx-basic');
    await cbx.click();
    await cbx.press('ArrowDown');
    await cbx.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await page.mouse.click(1200, 10);
    await expect(popup(page)).toHaveCount(0);
    await cbx.click();
    await cbx.press('ArrowDown');
    await cbx.press('ArrowDown');
    await cbx.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(cbx).toBeFocused();
    await cbx.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await cbx.press('Tab');
    await expect(popup(page)).toHaveCount(0);
    expect(await events(page, 'cbx-basic')).toEqual([]);
  });
});

test.describe('Dropdown filtering and data (DDFLT, DDAPI)', () => {
  test('controlled filtering: onSearchChange / onInputChange report the text and the parent passes the matching data', async ({ page }) => {
    await dropdowns(page);
    await page.locator('#select-filter').click();
    await page.keyboard.type('an');
    await expect.poll(async () => (await popup(page).getByRole('option').allInnerTexts()).every((l) => l.toLowerCase().includes('an'))).toBe(true);
    const selectLabels = await popup(page).getByRole('option').allInnerTexts();
    expect(selectLabels.length).toBeGreaterThan(0);
    // Contains matches, not only prefixes: the parent filtered the data.
    expect(selectLabels.some((l) => !l.toLowerCase().startsWith('an'))).toBe(true);
    expect((await events(page, 'select-filter')).map((e) => e.value)).toEqual(['a', 'an']);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.locator('#cbx-filter').click();
    await page.keyboard.type('an');
    const labels = await popup(page).getByRole('option').allInnerTexts();
    expect(labels.length).toBeGreaterThan(0);
    // Matches inside the label (contains), not only prefixes: the parent did the filtering.
    expect(labels.some((l) => !l.toLowerCase().startsWith('an'))).toBe(true);
    for (const l of labels) expect(l.toLowerCase()).toContain('an');
    expect((await events(page, 'cbx-filter')).map((e) => e.value)).toEqual(['a', 'an']);
  });

  test('Mention per-item icons through renderItem; objects with value and label need no accessors', async ({ page }) => {
    await page.goto(`${DEV_URL}mention.html?icons`);
    await page.locator('#field').click();
    await page.keyboard.type('@');
    const option = page.locator('.salmon-mention-popup [role="option"]').first();
    await expect(option).toHaveText('AAlice Smith');
    await expect(option.locator('[data-icon="alice"]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.salmon-mention-popup [role="option"]').nth(1)).toHaveAccessibleName(/Bob Jones/);
  });

  test('a remote value without selectedItems shows its label after one value read, without opening the popup', async ({ page }) => {
    await dropdowns(page);
    await expect(page.locator('#select-remote-value')).toHaveText('Item 4242');
    const chips = page.locator('[data-fixture="cbx-remote-value"] .salmon-combobox-chip-label');
    await expect(chips).toHaveText(['Item 7', 'Item 4243']);
    await expect(popup(page)).toHaveCount(0);
  });

  test('onLoadError reports a failed read on Combobox and Mention', async ({ page }) => {
    await dropdowns(page);
    await page.locator('#cbx-error').click();
    await page.locator('#cbx-error').press('ArrowDown');
    await expect(popup(page).getByRole('alert')).toBeVisible();
    await expect.poll(async () => (await events(page, 'cbx-error')).map((e) => e.value)).toEqual(['The fruit service is unavailable']);
    await page.goto(`${DEV_URL}mention.html?remote`);
    await page.locator('#field').click();
    await page.keyboard.type('@fail');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __mention: { errors: string[] } }).__mention.errors)).toEqual(['boom']);
  });

  test('type-ahead works on virtual lists: the closed Select and a 100,000-item Listbox', async ({ page }) => {
    await dropdowns(page);
    const sel = page.locator('#select-large');
    await sel.focus();
    await page.keyboard.type('Item 9', { delay: 20 });
    await expect(sel).toHaveText('Item 9');
    await page.waitForTimeout(600);
    await sel.click();
    await expect(popup(page).getByRole('option', { name: 'Item 9', exact: true })).toHaveAttribute('aria-selected', 'true');
    // Typing in the open popup moves the active option to an unrendered one and scrolls it into view.
    await page.keyboard.type('Item 870', { delay: 20 });
    expect(await activeText(page)).toBe('Item 870');
    const id = (await activeId(page))!;
    await expect(page.locator(`[id="${id}"]`)).toBeInViewport();
    await page.goto(`${DEV_URL}listbox.html?case=big`);
    const lb = page.getByRole('listbox');
    const second = (await lb.locator('[role="option"]').nth(1).innerText()).trim();
    const word = second.split(' ')[0] as string;
    await lb.focus();
    await page.keyboard.press('End');
    await page.waitForTimeout(600);
    // From the last option the next match wraps to the top, far outside the mounted window.
    await page.keyboard.type(word, { delay: 10 });
    const found = (await lb.getAttribute('aria-activedescendant'))!;
    await expect(page.locator(`[id="${found}"]`)).toBeInViewport();
    expect((await page.locator(`[id="${found}"]`).innerText()).trim()).toBe(second);
    expect(await lb.locator('[role="option"]').count()).toBeLessThanOrEqual(8 + 2 * 6 + 1);
  });
});

test.describe('Closed dropdowns', () => {
  test('closed Select, Combobox, Mention and TreeSelect add no document or window listeners, observers or intervals', async ({ page }) => {
    await page.addInitScript(() => {
      const c = { doc: 0, win: 0, observers: 0, intervals: 0 };
      (window as unknown as { __cost: typeof c }).__cost = c;
      const dAdd = Document.prototype.addEventListener;
      Document.prototype.addEventListener = function (this: Document, ...args: Parameters<Document['addEventListener']>) {
        c.doc++;
        return dAdd.apply(this, args);
      } as Document['addEventListener'];
      const wAdd = window.addEventListener.bind(window);
      window.addEventListener = ((...args: Parameters<Window['addEventListener']>) => {
        c.win++;
        return wAdd(...args);
      }) as Window['addEventListener'];
      for (const name of ['ResizeObserver', 'IntersectionObserver', 'MutationObserver'] as const) {
        const Orig = (window as unknown as Record<string, new (...a: unknown[]) => unknown>)[name];
        if (!Orig) continue;
        (window as unknown as Record<string, unknown>)[name] = class extends (Orig as new (...a: unknown[]) => object) {
          constructor(...a: unknown[]) {
            super(...a);
            c.observers++;
          }
        };
      }
      const si = window.setInterval.bind(window);
      window.setInterval = ((...a: Parameters<typeof setInterval>) => {
        c.intervals++;
        return si(...a);
      }) as typeof setInterval;
    });
    const cost = () => page.evaluate(() => ({ ...(window as unknown as { __cost: Record<string, number> }).__cost }));
    for (const [url, fields] of [
      ['dropdowns.html', ['#select-basic', '#select-search', '#cbx-basic', '#cbx-large', '#cbx-columns']],
      ['mention.html', ['#field']],
      ['tree-select.html', ['#ts-single button[role="combobox"]']],
    ] as const) {
      await page.goto(`${DEV_URL}${url}`);
      await page.waitForTimeout(500);
      const before = await cost();
      for (const f of fields) {
        await page.locator(f).focus();
        await page.locator(f).blur();
      }
      await page.mouse.move(10, 10);
      await page.waitForTimeout(100);
      expect(await cost(), url).toEqual(before);
    }
  });
});
