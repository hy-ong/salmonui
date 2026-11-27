import { expect, test } from '@playwright/test';
import { DEV_URL, openGrid, PROD_URL } from './helpers.ts';

// Data Grid filter builder dialog on the shared QueryTree:
// add and remove keep focus, the NOT toggle on groups negates the
// applied group, and apply filters the rows.

const URL = `${DEV_URL}?rows=200&cols=6&qbuilder&qevents`;

test.describe('filter builder dialog', () => {
  // Production build: no StrictMode effect replay. The first control is focused once the popover
  // is placed (a child effect ran while the box was still `visibility: hidden`, so focus stayed out).
  test('focus lands on the first control on open in a production build', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?rows=200&cols=6&qbuilder`);
    await page.getByRole('button', { name: 'Filter builder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Filter builder' });
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.salmon-data-grid-filter-builder'))).toBe(true);
  });

  test('add and remove keep focus; NOT negates a group on apply', async ({ page }) => {
    await openGrid(page, URL);
    // aria-rowcount counts the header rows too.
    const headerRows = Number(await page.getByRole('grid').getAttribute('aria-rowcount')) - 200;
    await page.getByRole('button', { name: 'Filter builder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Filter builder' });
    await expect(dialog).toBeVisible();
    const root = dialog.getByRole('group', { name: 'Filter builder' });
    await root.getByRole('button', { name: 'Add condition' }).first().click();
    // Focus moves to the new condition's field.
    await expect(dialog.getByRole('combobox', { name: 'Field' }).first()).toBeFocused();
    await dialog.getByRole('combobox', { name: 'Field' }).first().selectOption({ label: 'ID' });
    await dialog.getByRole('combobox', { name: 'Operator' }).first().selectOption({ label: 'Starts with' });
    await dialog.getByRole('textbox', { name: 'Value' }).first().fill('1');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toHaveCount(0);
    const positive = await page.evaluate(() => (window as { __queryEvents?: { type: string; filters?: unknown }[] }).__queryEvents?.filter((e) => e.type === 'filterChange').at(-1));
    expect(positive).toBeTruthy();
    const kept = await page.getByRole('grid').getAttribute('aria-rowcount');

    // Negate the root group.
    await page.getByRole('button', { name: 'Filter builder' }).click();
    await expect(dialog).toBeVisible();
    const not = dialog.getByRole('checkbox', { name: 'Not' }).first();
    await not.check();
    await expect(dialog.locator('[data-not]').first()).toBeVisible();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toHaveCount(0);
    const event = await page.evaluate(() => (window as { __queryEvents?: { type: string; filters?: unknown }[] }).__queryEvents?.filter((e) => e.type === 'filterChange').at(-1));
    expect(JSON.stringify(event)).toContain('"not":true');
    const negated = await page.getByRole('grid').getAttribute('aria-rowcount');
    // The two results partition the 200 rows.
    expect(Number(kept) - headerRows + (Number(negated) - headerRows)).toBe(200);
    expect(Number(kept) - headerRows).toBeLessThan(200);

    // The NOT flag survives reopening; removing the condition focuses the group's add button.
    await page.getByRole('button', { name: 'Filter builder' }).click();
    await expect(dialog.getByRole('checkbox', { name: 'Not' }).first()).toBeChecked();
    await dialog.getByRole('button', { name: 'Remove condition' }).first().click();
    await expect(root.getByRole('button', { name: 'Add condition' }).first()).toBeFocused();
    // Visual consistency: Remove condition is a square icon button (control height) with a 16px
    // SVG glyph, no font ×; grid controls use the md radius, the popover the lg radius.
    await root.getByRole('button', { name: 'Add condition' }).first().click();
    const remove = dialog.getByRole('button', { name: 'Remove condition' }).first();
    const m = await remove.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const glyph = getComputedStyle(el, '::before');
      const field = el.parentElement!.querySelector('.salmon-data-grid-input')!;
      return { w: box.width, h: box.height, fieldH: field.getBoundingClientRect().height, glyph: glyph.width, mask: glyph.maskImage, radius: getComputedStyle(el).borderRadius, inset: getComputedStyle(field).paddingInlineStart, popover: getComputedStyle(el.closest('[data-salmon-popover]')!).borderRadius };
    });
    expect(m).toMatchObject({ glyph: '16px', radius: '6px', inset: '12px', popover: '10px' });
    expect(m.w).toBe(m.h);
    expect(m.h).toBe(m.fieldH);
    expect(m.mask).toContain('svg');
    await expect(remove.locator('[aria-hidden]')).toHaveCount(0);
    // Add a nested group: focus lands in it.
    await root.getByRole('button', { name: 'Add group' }).first().click();
    await expect(dialog.getByRole('group', { name: 'Condition group' })).toHaveCount(1);
    await expect(dialog.getByRole('group', { name: 'Condition group' }).getByRole('radio', { name: 'And' })).toBeVisible();
  });
});
