import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL, listenerCount, trackListeners } from './helpers.ts';

// TagGroup in the browser: APG grid keys, removal
// with focus hand-off and veto, selection and form value, keyboard and
// pointer reordering, cross-group drops, drag events, RTL, hydration, axe.
// Page: examples/vite-spa/tag-group.html.

const PAGE = `${DEV_URL}tag-group.html`;

async function open(page: Page, query = ''): Promise<void> {
  await trackListeners(page);
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}
const log = (page: Page, type?: string) => page.evaluate((t) => (window.__tags ?? []).filter((e) => !t || e['type'] === t), type);
const tags = (page: Page, group: string) => page.locator(`#${group} [data-salmon-tag]`).evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset['value']));
const focused = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['value'] ?? document.activeElement?.id ?? null);
const tag = (page: Page, group: string, value: string) => page.locator(`#${group} [data-value="${value}"]`);

/**
 * Presses on a tag. The press loads the lazy drag chunk (TagGroup.tsx `import('./drag.js')`) and
 * only then arms the drag (window pointer listeners), so moving earlier would not drag.
 */
async function press(page: Page): Promise<void> {
  const armed = await listenerCount(page, 'window', 'pointercancel');
  await page.mouse.down();
  await expect.poll(() => listenerCount(page, 'window', 'pointercancel')).toBeGreaterThan(armed);
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await press(page);
  await page.mouse.move(from.x + 6, from.y, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}
const center = async (page: Page, sel: string, fx = 0.5) => {
  const b = (await page.locator(sel).boundingBox()) as { x: number; y: number; width: number; height: number };
  return { x: b.x + b.width * fx, y: b.y + b.height / 2 };
};

test.describe('TagGroup', () => {
  test('a selected toned tag takes the solid tone fill, so the selection shows on its subtle surface', async ({ page }) => {
    await open(page);
    const look = await tag(page, 'removable', 'Docs').evaluate((el) => {
      (el as HTMLElement).style.transition = 'none';
      el.setAttribute('data-tone', 'primary');
      const before = getComputedStyle(el).backgroundColor;
      el.setAttribute('data-selected', '');
      const after = getComputedStyle(el).backgroundColor;
      const probe = document.createElement('span');
      probe.style.color = 'var(--salmon-color-primary-text)';
      el.append(probe);
      const solid = getComputedStyle(probe).color;
      probe.remove();
      return { before, after, solid };
    });
    expect(look.after).not.toBe(look.before);
    expect(look.after).toBe(look.solid);
  });

  test('one tab stop; arrows, Home / End move between tags and skip disabled ones', async ({ page }) => {
    await open(page);
    await page.focus('#removable [data-value="Design"]');
    await expect(page.locator('#removable [tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('Docs');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('Bug');
    await page.keyboard.press('End');
    expect(await focused(page)).toBe('Perf');
    await page.keyboard.press('ArrowLeft');
    expect(await focused(page)).toBe('Bug');
    await page.keyboard.press('Home');
    expect(await focused(page)).toBe('Design');
    await expect(tag(page, 'removable', 'Docs')).toHaveAttribute('tabindex', '-1');
    // Tab leaves the group in one step.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('#removable'))).toBeNull();
  });

  test('ArrowLeft / ArrowRight mirror under dir="rtl"', async ({ page }) => {
    await open(page, '?dir=rtl');
    await page.focus('#removable [data-value="Design"]');
    await page.keyboard.press('ArrowLeft');
    expect(await focused(page)).toBe('Docs');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('Design');
  });

  test('Delete / Backspace and the remove button fire onRemove; focus moves to the next tag', async ({ page }) => {
    await open(page);
    await expect(tag(page, 'removable', 'Docs')).toHaveAttribute('aria-keyshortcuts', 'Delete Backspace');
    await page.focus('#removable [data-value="Docs"]');
    await page.keyboard.press('Delete');
    expect(await tags(page, 'removable')).toEqual(['Design', 'Bug', 'Perf', 'Old']);
    expect(await focused(page)).toBe('Bug');
    await page.keyboard.press('Backspace');
    expect(await focused(page)).toBe('Perf');
    // The last removable tag hands focus to the previous one.
    await page.keyboard.press('Delete');
    expect(await focused(page)).toBe('Old');
    expect(await tags(page, 'removable')).toEqual(['Design', 'Old']);
    // The disabled tag is not removable.
    await page.keyboard.press('Delete');
    expect(await tags(page, 'removable')).toEqual(['Design', 'Old']);
    await page.locator('#removable [data-value="Design"] .salmon-tag-remove').click();
    expect(await tags(page, 'removable')).toEqual(['Old']);
    const events = await log(page, 'remove');
    expect(events.map((e) => [e['values'], e['source'], e['reason']])).toEqual([
      [['Docs'], 'keyboard', 'delete'],
      [['Bug'], 'keyboard', 'backspace'],
      [['Perf'], 'keyboard', 'delete'],
      [['Design'], 'pointer', 'button'],
    ]);
  });

  test('a removal the application ignores is vetoed and focus stays', async ({ page }) => {
    await open(page, '?veto');
    await page.focus('#removable [data-value="Bug"]');
    await page.keyboard.press('Delete');
    expect(await log(page, 'remove')).toHaveLength(1);
    expect(await tags(page, 'removable')).toEqual(['Design', 'Docs', 'Bug', 'Perf', 'Old']);
    expect(await focused(page)).toBe('Bug');
  });

  test('selection: Space / Enter and clicks toggle; Delete removes every selected tag; the remove button never selects', async ({ page }) => {
    await open(page);
    await expect(tag(page, 'selectable', 'Green')).toHaveAttribute('aria-selected', 'true');
    await expect(tag(page, 'selectable', 'Green')).toHaveAttribute('tabindex', '0');
    await page.focus('#selectable [data-value="Green"]');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(' ');
    await expect(tag(page, 'selectable', 'Blue')).toHaveAttribute('aria-selected', 'true');
    await tag(page, 'selectable', 'Red').click();
    await expect(tag(page, 'selectable', 'Red')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(tag(page, 'selectable', 'Red')).toHaveAttribute('aria-selected', 'false');
    const values = (await log(page, 'value')).map((e) => [e['value'], e['source']]);
    expect(values).toEqual([
      [['Green', 'Blue'], 'keyboard'],
      [['Green', 'Blue', 'Red'], 'pointer'],
      [['Green', 'Blue'], 'keyboard'],
    ]);
    await page.locator('#selectable [data-value="Cyan"] .salmon-tag-remove').click();
    await expect(tag(page, 'selectable', 'Cyan')).toHaveCount(0);
    expect((await log(page, 'value')).length).toBe(3);
    // Delete on a selected tag removes the whole selection.
    await page.focus('#selectable [data-value="Blue"]');
    await page.keyboard.press('Delete');
    expect(await tags(page, 'selectable')).toEqual(['Red']);
    expect((await log(page, 'remove')).at(-1)?.['values']).toEqual(['Green', 'Blue']);
    expect(await focused(page)).toBe('Red');
  });

  test('forms: hidden inputs carry the selected values, or every tag without selection; reset restores the default', async ({ page }) => {
    await open(page);
    await tag(page, 'single', 'l').click();
    await page.click('#submit');
    expect(await page.evaluate(() => window.__formData)).toEqual([
      ['colors', 'Green'],
      ['size', 'l'],
      ['to', 'ann@example.com'],
      ['to', 'bo@example.com'],
    ]);
    await page.click('#reset');
    await expect(tag(page, 'single', 'm')).toHaveAttribute('aria-selected', 'true');
    await expect(tag(page, 'single', 'l')).toHaveAttribute('aria-selected', 'false');
  });

  test('Alt + arrows reorder within the group and keep focus on the moved tag', async ({ page }) => {
    await open(page);
    await page.focus('#list-a [data-value="Two"]');
    await page.keyboard.press('Alt+ArrowRight');
    expect(await tags(page, 'list-a')).toEqual(['One', 'Three', 'Two', 'Four']);
    expect(await focused(page)).toBe('Two');
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await tags(page, 'list-a')).toEqual(['Two', 'One', 'Three', 'Four']);
    expect(await focused(page)).toBe('Two');
    // At the start nothing moves.
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await tags(page, 'list-a')).toEqual(['Two', 'One', 'Three', 'Four']);
    const reorders = (await log(page, 'reorder')).map((e) => [e['values'], e['toIndex'], e['delta'], e['source']]);
    expect(reorders).toEqual([
      [['Two'], 3, 1, 'keyboard'],
      [['Two'], 1, -1, 'keyboard'],
      [['Two'], 0, -1, 'keyboard'],
    ]);
  });

  test('pointer drag reorders within the group with start, drag and end events', async ({ page }) => {
    await open(page);
    const from = await center(page, '#list-a [data-value="One"]');
    const to = await center(page, '#list-a [data-value="Four"]', 0.2);
    await drag(page, from, to);
    await expect.poll(() => tags(page, 'list-a')).toEqual(['Two', 'Three', 'One', 'Four']);
    const events = await log(page);
    expect(events.find((e) => e['type'] === 'dragstart')).toMatchObject({ id: 'list-a', values: ['One'], source: 'pointer' });
    expect(events.filter((e) => e['type'] === 'drag').at(-1)).toMatchObject({ values: ['One'], toIndex: 3, overGroup: 'lists' });
    expect(events.find((e) => e['type'] === 'reorder')).toMatchObject({ values: ['One'], toIndex: 3, delta: null, source: 'pointer' });
    expect(events.find((e) => e['type'] === 'dragend')).toMatchObject({ values: ['One'], dropped: true });
    // The click that ends the drag does not toggle anything, and the indicator is gone.
    await expect(page.locator('[data-drop], [data-dragging], .salmon-tag-group-ghost')).toHaveCount(0);
  });

  test('groups with the same dragGroup accept each other\'s tags; onTagDrop fires on the receiving group', async ({ page }) => {
    await open(page);
    await drag(page, await center(page, '#list-a [data-value="Three"]'), await center(page, '#list-b [data-value="Beta"]', 0.8));
    await expect.poll(() => tags(page, 'list-b')).toEqual(['Alpha', 'Beta', 'Three']);
    expect(await tags(page, 'list-a')).toEqual(['One', 'Two', 'Four']);
    expect((await log(page, 'drop'))[0]).toMatchObject({ id: 'list-b', values: ['Three'], fromGroup: 'list-a', toIndex: 2, source: 'pointer' });
    // Empty the list and drop onto its empty state.
    for (const v of ['Alpha', 'Beta', 'Three']) await drag(page, await center(page, `#list-b [data-value="${v}"]`), await center(page, '#list-a [data-value="One"]', 0.1));
    await expect.poll(() => tags(page, 'list-b')).toEqual([]);
    await expect(page.locator('#list-b .salmon-tag-group-empty')).toHaveText('Drop here');
    await drag(page, await center(page, '#list-a [data-value="Two"]'), await center(page, '#list-b .salmon-tag-group-empty'));
    await expect.poll(() => tags(page, 'list-b')).toEqual(['Two']);
  });

  test('onTagDragStart preventDefault cancels; Escape cancels a drag in progress', async ({ page }) => {
    await open(page, '?cancelDrag');
    await drag(page, await center(page, '#list-a [data-value="One"]'), await center(page, '#list-a [data-value="Four"]', 0.8));
    expect(await tags(page, 'list-a')).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(await log(page, 'reorder')).toHaveLength(0);
    await open(page);
    const from = await center(page, '#list-a [data-value="One"]');
    const to = await center(page, '#list-a [data-value="Four"]', 0.8);
    await page.mouse.move(from.x, from.y);
    await press(page);
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(page.locator('#list-a [data-drop]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await tags(page, 'list-a')).toEqual(['One', 'Two', 'Three', 'Four']);
    expect((await log(page, 'dragend')).at(-1)).toMatchObject({ dropped: false });
  });

  test('server markup hydrates with zero warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    await page.focus('#removable [data-value="Design"]');
    await page.keyboard.press('Delete');
    expect(await tags(page, 'removable')).toEqual(['Docs', 'Bug', 'Perf', 'Old']);
    expect(problems).toEqual([]);
  });

  test('axe is clean in light, dark and RTL', async ({ page }) => {
    for (const query of ['', '?scheme=dark', '?dir=rtl']) {
      await open(page, query);
      await expectClean(page, `tag-group${query}`);
    }
  });
});

test.describe('TagGroup metrics (visual consistency)', () => {
  test('tags use the small radius; the remove button is a square icon button with a 16px SVG glyph', async ({ page }) => {
    await open(page);
    const m = await tag(page, 'removable', 'Design').evaluate((el) => {
      const remove = el.querySelector('.salmon-tag-remove') as HTMLElement;
      const r = remove.getBoundingClientRect();
      const glyph = (remove.querySelector('svg') as SVGElement).getBoundingClientRect();
      return { tag: getComputedStyle(el).borderRadius, remove: getComputedStyle(remove).borderRadius, square: r.width === r.height, glyph: glyph.width, text: remove.textContent };
    });
    expect(m).toEqual({ tag: '4px', remove: '4px', square: true, glyph: 16, text: '' });
  });
});
