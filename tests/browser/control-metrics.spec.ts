import { expect, test, type Page } from '@playwright/test';
import { DEV_URL, openGrid } from './helpers.ts';

// Control metrics across the Inputs, Dropdowns and Calendars families
// (visual consistency): one control height per size (md
// 32px, Button's), the md radius on standalone controls, one border per
// control, 16px dismiss glyphs and text inset equal at both inline ends.

interface Box {
  readonly height: number;
  readonly radius: string;
  readonly padStart: number;
  readonly padEnd: number;
}

const box = (page: Page, selector: string): Promise<Box> =>
  page.locator(selector).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { height: el.getBoundingClientRect().height, radius: cs.borderStartStartRadius, padStart: parseFloat(cs.paddingInlineStart), padEnd: parseFloat(cs.paddingInlineEnd) };
  });

test.describe('Control metrics', () => {
  test('Select and Combobox are 32px md controls with the md radius and symmetric padding', async ({ page }) => {
    await page.goto(`${DEV_URL}dropdowns.html`);
    await page.waitForFunction(() => window.__dd?.ready === true);
    const select = await box(page, '.salmon-select-trigger');
    expect(select).toEqual({ height: 32, radius: '6px', padStart: 12, padEnd: 12 });
    const combobox = await box(page, '.salmon-combobox-field:has(#cbx-basic)');
    expect(combobox.height).toBe(32);
    expect(combobox.radius).toBe('6px');
    // The 24px trigger box sits 8px from the end, so its 16px glyph sits 12px in, like the text.
    expect(combobox.padStart).toBe(12);
    expect(combobox.padEnd).toBe(8);
    const glyph = await page.locator('.salmon-select-clear svg').first().evaluate((el) => el.getBoundingClientRect().width);
    expect(glyph).toBe(16);
  });

  test('picker controls are 32px with one border: the field inside draws no box of its own', async ({ page }) => {
    await page.goto(`${DEV_URL}pickers.html`);
    const control = page.locator('.salmon-picker__control').first();
    await expect(control).toBeVisible();
    expect(await box(page, '.salmon-picker__control')).toMatchObject({ height: 32, radius: '6px', padStart: 12, padEnd: 8 });
    const inner = await control.locator("[role='group']").first().evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(inner).toBe('0px');
  });

  // `size` on Select, Combobox, TreeSelect and the pickers: heights 24 / 32 / 40, text insets 8 / 12 / 16, glyphs 14 / 16 / 20.
  const SIZES = { sm: { height: 24, inset: 8, glyph: 14 }, md: { height: 32, inset: 12, glyph: 16 }, lg: { height: 40, inset: 16, glyph: 20 } } as const;

  test('size: Select, Combobox and TreeSelect are 24 / 32 / 40px with 8 / 12 / 16px insets and 14 / 16 / 20px glyphs', async ({ page }) => {
    await page.goto(`${DEV_URL}dropdowns.html?sizes`);
    await page.waitForFunction(() => window.__dd?.ready === true);
    for (const [size, { height, inset, glyph }] of Object.entries(SIZES)) {
      const row = `[data-size-row="${size}"]`;
      await expect(page.locator(`${row} .salmon-select`)).toHaveAttribute('data-size', size);
      expect(await box(page, `${row} .salmon-select-trigger`), `Select ${size}`).toMatchObject({ height, padStart: inset, padEnd: inset });
      expect(await box(page, `${row} .salmon-combobox-field:has(#cbx-${size})`), `Combobox ${size}`).toMatchObject({ height, padStart: inset });
      expect((await box(page, `${row} .salmon-combobox-field:has(#cbx-chips-${size})`)).height, `Combobox chips ${size}`).toBe(height);
      expect(await box(page, `${row} .salmon-tree-select-trigger`), `TreeSelect ${size}`).toMatchObject({ height, padStart: inset });
      for (const icon of ['.salmon-select-chevron svg', '.salmon-combobox-trigger svg', '.salmon-tree-select-chevron svg']) {
        expect(await page.locator(`${row} ${icon}`).first().evaluate((el) => el.getBoundingClientRect().width), `${icon} ${size}`).toBe(glyph);
      }
    }
    // A sm chip's remove button draws a 20px box; its hit area still covers 24 x 24.
    const remove = page.locator('[data-size-row="sm"] .salmon-combobox-chip-remove').first();
    const rect = await remove.boundingBox();
    expect(rect?.height).toBe(20);
    const hit = await remove.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [
        [r.left - 1.5, r.top - 1.5],
        [r.right + 1.5, r.bottom + 1.5],
      ].every(([x, y]) => document.elementFromPoint(x as number, y as number) === el);
    });
    expect(hit).toBe(true);
  });

  test('size: DatePicker, DateRangePicker, TimePicker, DateField and TimeField are 24 / 32 / 40px', async ({ page }) => {
    await page.goto(`${DEV_URL}pickers.html?only=sizes`);
    await expect(page.locator('.salmon-picker__control').first()).toBeVisible();
    for (const [size, { height, inset }] of Object.entries(SIZES)) {
      const row = `[data-size-row="${size}"]`;
      const controls = page.locator(`${row} .salmon-picker__control`);
      await expect(controls).toHaveCount(4);
      for (const control of await controls.all()) {
        const m = await control.evaluate((el) => ({ height: el.getBoundingClientRect().height, padStart: parseFloat(getComputedStyle(el).paddingInlineStart) }));
        expect(m, `picker ${size}`).toEqual({ height, padStart: inset });
      }
      const groups = page.locator(`${row} > .salmon-date-field > .salmon-date-field__group`);
      await expect(groups).toHaveCount(2);
      for (const group of await groups.all()) expect(await group.evaluate((el) => el.getBoundingClientRect().height), `field ${size}`).toBe(height);
      const scale = await page.locator(`${row} .salmon-picker__trigger`).first().evaluate((el) => getComputedStyle(el, '::before').scale);
      expect(scale).toBe({ sm: '0.875', md: '1', lg: '1.25' }[size]);
    }
  });

  test('TextField matches Button per size and the Rating clear glyph is an icon, not text', async ({ page }) => {
    await page.goto(`${DEV_URL}inputs.html`);
    const group = page.locator('.salmon-input-group').first();
    await expect(group).toBeVisible();
    expect(await box(page, '.salmon-field[data-size="md"] .salmon-input-group')).toMatchObject({ height: 32, radius: '6px', padStart: 12, padEnd: 12 });
    const clear = page.locator('.salmon-rating-clear').first();
    if ((await clear.count()) > 0) {
      await expect(clear.locator('svg')).toHaveCount(1);
      expect(await clear.locator('svg').evaluate((el) => el.getBoundingClientRect().width)).toBe(16);
    }
  });

  test('checkbox, radio and switch leave room for the focus ring between control and label', async ({ page }) => {
    await page.goto(`${DEV_URL}inputs.html`);
    for (const kind of ['checkbox', 'radio', 'switch']) {
      const toggle = page.locator(`.salmon-toggle:has(> .salmon-toggle-${kind}, > .salmon-toggle-control > .salmon-toggle-${kind}):has(.salmon-toggle-label)`).first();
      await expect(toggle, kind).toBeVisible();
      const gap = await toggle.evaluate((el) => parseFloat(getComputedStyle(el).columnGap));
      // Ring offset (2px) plus ring width (2px, 3px in high contrast) must not reach the text.
      expect(gap, kind).toBeGreaterThanOrEqual(8);
    }
  });
});

const gridBox = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { height: r.height, top: r.top, bottom: r.bottom, radius: cs.borderTopLeftRadius, paddingInline: cs.paddingInlineStart };
  });

// Data Grid and Pivot Table (rule 8): chrome controls outside rows use the md
// metrics (32px high, md radius); in-row controls fill their row.
test.describe('Control metrics: Data Grid and Pivot Table', () => {
  test('pager buttons, toolbar items, and search are 32px with md radius', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=500&cols=6&chrome&paging=50`);
    for (const selector of ['.salmon-data-grid-pager__button', '.salmon-data-grid-toolbar__item', '.salmon-data-grid-search__input']) {
      const b = await gridBox(page, selector);
      expect(b.height, selector).toBe(32);
      expect(b.radius, selector).toBe('6px');
    }
    expect((await gridBox(page, '.salmon-data-grid-toolbar__item')).paddingInline).toBe('12px');
  });

  test('a filter-row input fills its row inside the 4px cell inset', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=200&cols=6&filterUi=row`);
    const row = await gridBox(page, '.salmon-data-grid-filter-bar');
    const cell = await gridBox(page, '.salmon-data-grid-filter-bar__cell');
    const input = await gridBox(page, '.salmon-data-grid-filter-bar__input');
    expect(input.top - cell.top).toBe(4);
    expect(cell.bottom - input.bottom).toBe(4);
    expect(input.height).toBe(cell.height - 8);
    expect(cell.height).toBeGreaterThanOrEqual(row.height - 1);
    expect(input.radius).toBe('6px');
  });

  // Grid chrome built from native elements: the rules of data-grid.css read
  // on probe markup with the grid's own classes (the grid stylesheet is loaded).
  test('native selects draw a themed chevron, native checkboxes match the grid checkbox, templates stay in their cells', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=50&cols=4`);
    const probe = await page.evaluate(() => {
      const host = document.createElement('div');
      host.innerHTML = `
        <select class="salmon-data-grid-input" data-probe="select"><option>10</option></select>
        <div dir="rtl"><select class="salmon-data-grid-input" data-probe="select-rtl"><option>10</option></select></div>
        <label class="salmon-data-grid-filter-menu__all"><input type="checkbox" class="salmon-data-grid-check" data-probe="all">Select all</label>
        <input type="checkbox" class="salmon-data-grid-check salmon-data-grid-editor__checkbox" data-probe="editor" checked>
        <div class="salmon-data-grid-filter-bar__cell" style="width:120px"><div data-probe="template" style="width:100%">x</div></div>
        <div role="gridcell" class="salmon-data-grid-cell" data-column-id="__salmon_detail" data-probe="detail" style="width:40px"></div>`;
      document.body.append(host);
      const q = (name: string) => host.querySelector(`[data-probe="${name}"]`) as HTMLElement;
      const cs = (name: string) => getComputedStyle(q(name));
      const result = {
        appearance: cs('select').appearance,
        chevron: cs('select').backgroundImage.includes('linear-gradient'),
        padStart: parseFloat(cs('select').paddingInlineStart),
        padEnd: parseFloat(cs('select').paddingInlineEnd),
        ltrPosition: cs('select').backgroundPositionX,
        rtlPosition: cs('select-rtl').backgroundPositionX,
        all: { appearance: cs('all').appearance, width: q('all').getBoundingClientRect().width, radius: cs('all').borderTopLeftRadius },
        editor: { appearance: cs('editor').appearance, width: q('editor').getBoundingClientRect().width },
        templateMin: cs('template').minInlineSize,
        detailPadding: cs('detail').paddingInlineStart,
      };
      host.remove();
      return result;
    });
    expect(probe.appearance).toBe('none');
    expect(probe.chevron).toBe(true);
    // The chevron's box plus a gap sits in the inline-end padding; the text keeps the 12px start inset.
    expect(probe.padStart).toBe(12);
    expect(probe.padEnd).toBeGreaterThan(probe.padStart);
    expect(probe.rtlPosition).not.toBe(probe.ltrPosition);
    expect(probe.all).toEqual({ appearance: 'none', width: 16, radius: '4px' });
    expect(probe.editor).toEqual({ appearance: 'none', width: 16 });
    expect(probe.templateMin).toBe('0px');
    expect(probe.detailPadding).toBe('0px');
  });

  test('pivot toolbar buttons are 32px with md radius', async ({ page }) => {
    await page.goto(`${DEV_URL}pivot.html?case=toolbar`);
    await page.waitForFunction(() => (window as unknown as { __pivot?: { status: string } }).__pivot?.status === 'ready');
    const b = await gridBox(page, '.salmon-pivot-table-toolbar .salmon-pivot-table-button');
    expect(b.height).toBe(32);
    expect(b.radius).toBe('6px');
    expect(b.paddingInline).toBe('12px');
  });
});

test.describe('Control metrics: RecurrenceEditor', () => {
  test('RecurrenceEditor number inputs are 32px like its Selects, also under a 14px root font size', async ({ page }) => {
    await page.goto(`${DEV_URL}scheduler.html`);
    await page.waitForFunction(() => (window as unknown as { __mountMs?: number }).__mountMs !== undefined);
    // The docs site uses a 14px root; a rem-based height would shrink to 28px there.
    await page.evaluate(() => { document.documentElement.style.fontSize = '14px'; });
    const s = page.locator('[data-scenario="re-basic"]');
    await s.getByRole('combobox', { name: 'Repeat' }).click();
    await page.getByRole('option', { name: 'Weekly', exact: true }).click();
    const number = await box(page, '[data-scenario="re-basic"] .salmon-recurrence-editor__number');
    expect(number).toMatchObject({ height: 32, radius: '6px' });
    expect((await box(page, '[data-scenario="re-basic"] .salmon-select-trigger')).height).toBe(32);
  });
});
