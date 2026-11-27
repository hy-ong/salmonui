import { expect, test, type Page } from '@playwright/test';

// Regressions from the Data Grid demo review (2026-11-26), checked on the
// demos where they were found: row templates with row spans in tree mode,
// RTL bidi isolation of formatted cells, locale number format in pager
// counts, the narrow filter row operator, the adaptive sheets and cards,
// link items in the column menu, openColumnMenu for a column outside the
// rendered window, the detail column header, merged cells over frozen
// zones, the column chooser search clear button and row lines across the
// filler width.

async function open(page: Page, path: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(path);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  return problems;
}

test('tree templates: card rows (a row template with align-items: center) keep every zone on its row, row spans included', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/tree-templates');
  await page.locator('.salmon-toggle-label', { hasText: 'Row template' }).click();
  await expect(page.locator('.demo-card-row').first()).toBeVisible();
  const offsets = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows .demo-card-row')].map((row) => {
      const zone = row.querySelector('.salmon-data-grid-center') as HTMLElement;
      return { id: row.dataset['rowId'], delta: Math.round(zone.getBoundingClientRect().top - row.getBoundingClientRect().top) };
    }),
  );
  expect(offsets.length).toBeGreaterThan(5);
  // The Engineering row anchors a four-row span of "Lisbon": its zone used to sit half the span above the row.
  expect(offsets.filter((o) => o.delta !== 0)).toEqual([]);
  expect(problems).toEqual([]);
});

test('RTL: an LTR-formatted date keeps its order ("1. März 2014") and stays aligned to the start side (G11N)', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/tree-rtl-locale');
  const cell = page.locator('.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="opened"]').first();
  await expect(cell).toHaveText('1. März 2014');
  const layout = await cell.evaluate((el) => {
    const node = el.firstChild as Text;
    const at = (i: number) => {
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + 1);
      return r.getBoundingClientRect();
    };
    const box = el.getBoundingClientRect();
    return { one: at(0).left, month: at(3).left, year: at(node.length - 1).right, right: box.right, padding: parseFloat(getComputedStyle(el).paddingRight) };
  });
  // Visual order 1. → März → 2014, left to right.
  expect(layout.one).toBeLessThan(layout.month);
  // Right-aligned (the RTL start side): the text ends at the cell's padding edge.
  expect(Math.abs(layout.right - layout.padding - layout.year)).toBeLessThan(2);
  expect(problems).toEqual([]);
});

test('adaptive: pager counts use the locale number format; sort sheet radios, edit sheet date button and card separators use the grid styles', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/adaptive');
  await expect(page.locator('.salmon-data-grid-pager__items')).toHaveText('(20,000 items)');
  // Cards: the 8 px gap is the base surface below a hairline row line, not a dark band.
  const card = await page.locator('.salmon-data-grid-card').first().evaluate((el) => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--salmon-surface-base)';
    el.append(probe);
    const base = getComputedStyle(probe).color;
    probe.remove();
    const s = getComputedStyle(el);
    return { band: s.borderBottomColor, base, line: s.boxShadow };
  });
  expect(card.band).toBe(card.base);
  expect(card.line).toContain('inset');
  // Sort sheet: the grid's own radios.
  await page.getByRole('button', { name: 'Open sort sheet' }).click();
  const radio = page.locator('.salmon-data-grid-sort-dialog input[type="radio"]').first();
  await expect(radio).toHaveClass(/salmon-data-grid-check/);
  expect(await radio.evaluate((el) => [getComputedStyle(el).appearance, getComputedStyle(el).borderRadius])).toEqual(['none', '50%']);
  await page.keyboard.press('Escape');
  await expect(page.locator('.salmon-data-grid-sort-dialog')).toHaveCount(0);
  // Edit sheet: the calendar button is as tall as the date input and centered on it.
  await page.locator('.salmon-data-grid-card').first().click();
  await page.getByRole('button', { name: 'Edit selected record' }).click();
  const date = page.locator('.salmon-data-grid-edit-dialog .salmon-data-grid-date');
  await expect(date).toBeVisible();
  const boxes = await date.evaluate((el) => {
    const input = (el.querySelector('input') as HTMLElement).getBoundingClientRect();
    const button = (el.querySelector('.salmon-data-grid-date__button') as HTMLElement).getBoundingClientRect();
    return { input: [input.top, input.height], button: [button.top, button.height] };
  });
  expect(boxes.button).toEqual(boxes.input);
  expect(problems).toEqual([]);
});

test('filter row operators: narrow columns get an icon-only trigger, wider ones a readable dropdown', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/filter-row');
  await page.locator('.salmon-toggle-label', { hasText: 'Show operators' }).click();
  const operator = (column: string) => page.locator(`.salmon-data-grid-filter-bar__cell[data-column-id="${column}"] .salmon-data-grid-filter-bar__operator`);
  await expect(operator('id')).toBeVisible();
  const size = (column: string) => operator(column).evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: el.getBoundingClientRect().width, text: el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) };
  });
  // 110 px column: a 28 px chevron trigger with no room for clipped text.
  const narrow = await size('id');
  expect(narrow.width).toBe(28);
  expect(narrow.text).toBeLessThanOrEqual(0);
  // 150 px column: at least 64 px, so the operator name is readable.
  expect((await size('category')).width).toBeGreaterThanOrEqual(64);
  // The open list still names every operator.
  expect(await operator('id').locator('option').first().textContent()).not.toBe('');
  expect(problems).toEqual([]);
});

test('column menu: a link item (href) looks like the other items', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/column-menu');
  await page.locator('.salmon-data-grid-header-cell .salmon-data-grid-column-menu-button').first().click();
  await page.locator('[data-salmon-popover] [data-item-id="more"]').click();
  const link = page.locator('[data-salmon-popover] a[data-item-id="docs"]');
  await expect(link).toBeVisible();
  const [linkStyle, itemStyle] = await Promise.all(
    [link, page.locator('[data-salmon-popover] [data-item-id="logField"]')].map((l) => l.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).textDecorationLine])),
  );
  expect(linkStyle).toEqual(itemStyle);
  expect(linkStyle?.[1]).toBe('none');
  expect(problems).toEqual([]);
});

test('column virtualization: openColumnMenu for an unrendered column anchors at its header; the detail column has no menu button', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/column-virtualization');
  await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="c75"]')).toHaveCount(0);
  const detailHeader = page.locator('.salmon-data-grid-header-cell[data-column-id="__salmon_detail"]');
  await expect(detailHeader).toBeVisible();
  await expect(detailHeader.locator('.salmon-data-grid-column-menu-button')).toHaveCount(0);
  await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="c1"] .salmon-data-grid-column-menu-button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Column menu of column 75' }).click();
  const menu = page.locator('[data-salmon-popover][role="menu"]');
  await expect(menu).toBeVisible();
  const header = page.locator('.salmon-data-grid-header-cell[data-column-id="c75"]');
  await expect(header).toBeVisible();
  const [m, h, vp] = await Promise.all([menu.boundingBox(), header.boundingBox(), page.locator('.salmon-data-grid-viewport').boundingBox()]);
  // The header was scrolled into the grid viewport, and the menu sits against it (below, or above when it flips),
  // overlapping it horizontally, not at the viewport's top-left corner.
  expect(h!.x).toBeGreaterThanOrEqual(vp!.x);
  expect(h!.x + h!.width).toBeLessThanOrEqual(vp!.x + vp!.width + 1);
  const below = Math.abs(m!.y - (h!.y + h!.height));
  const above = Math.abs(m!.y + m!.height - h!.y);
  expect(Math.min(below, above)).toBeLessThan(12);
  expect(m!.x + m!.width).toBeGreaterThan(h!.x);
  expect(m!.x).toBeLessThan(h!.x + h!.width);
  expect(problems).toEqual([]);
});

test('cell spans: a merged frozen cell covers the rows under it (no hover stripes), draws its bottom line, and row lines cross the filler width (GRID-LINES)', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/cell-spans');
  const morning = page.locator('.salmon-data-grid-cell[data-span][data-column-id="block"]', { hasText: 'Morning' });
  await expect(morning).toBeVisible();
  const box = (await morning.boundingBox())!;
  // Hover the third row of the span (10:00), then hit-test the span's column inside that row and on its bottom line.
  const row = page.locator('.salmon-data-grid-rows .salmon-data-grid-row[data-row-index="2"]');
  const rowBox = (await row.boundingBox())!;
  await page.mouse.move(rowBox.x + rowBox.width - 20, rowBox.y + rowBox.height / 2);
  const hits = await page.evaluate(
    ([x, y, bottom]) => [document.elementFromPoint(x, y), document.elementFromPoint(x, bottom)].map((el) => el?.closest('[data-span]')?.textContent ?? null),
    [box.x + 10, rowBox.y + rowBox.height / 2, box.y + box.height - 0.5] as const,
  );
  expect(hits).toEqual(['Morning', 'Morning']);
  expect(await morning.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('1px');
  // The row line is drawn by the row too, so it continues right of the last column.
  const line = await row.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(line).toMatch(/inset/);
  expect(line).not.toMatch(/rgba\(0, 0, 0, 0\)/);
  expect(problems).toEqual([]);
});

test('column chooser search: the grid clear glyph replaces the native one and still clears', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/column-chooser-templates');
  await page.locator('[data-toolbar-item="columnChooser"]').click();
  const search = page.locator('.salmon-data-grid-column-chooser input[type="search"]');
  await search.fill('pays');
  // getComputedStyle does not resolve this pseudo-element: check the grid stylesheet rule that restyles it.
  const cancel = await page.evaluate(() => {
    // The rules sit inside `@layer` blocks.
    const find = (rules: CSSRuleList): { appearance: string; mask: string } | null => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule && rule.selectorText.includes('.salmon-data-grid-input::-webkit-search-cancel-button')) {
          return { appearance: rule.style.getPropertyValue('appearance'), mask: rule.style.getPropertyValue('mask-image') || rule.style.getPropertyValue('mask') };
        }
        if (rule instanceof CSSLayerBlockRule) {
          const found = find(rule.cssRules);
          if (found) return found;
        }
      }
      return null;
    };
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const found = find(rules);
      if (found) return found;
    }
    return null;
  });
  expect(cancel?.appearance).toBe('none');
  expect(cancel?.mask).toContain('svg');
  // A click on the glyph (end of the content box) clears the field through the native control.
  const b = (await search.boundingBox())!;
  const end = await search.evaluate((el) => parseFloat(getComputedStyle(el).paddingRight) + parseFloat(getComputedStyle(el).borderRightWidth));
  await page.mouse.click(b.x + b.width - end - 6, b.y + b.height / 2);
  await expect(search).toHaveValue('');
  await expect(page.locator('.salmon-data-grid-column-chooser').locator('.demo-chooser__summary')).toBeVisible();
  expect(problems).toEqual([]);
});
