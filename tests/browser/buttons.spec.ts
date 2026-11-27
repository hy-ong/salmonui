import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Buttons family in the browser:
// keyboard tables, triads, roving focus, press repeat, forms, floating
// positioning, RTL, hydration and axe. Page: examples/vite-spa/buttons.html.

const PAGE = `${DEV_URL}buttons.html`;

type Logged = Record<string, unknown>;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}

const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__buttonEvents ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Logged[]>;
const clearEvents = (page: Page) => page.evaluate(() => void (window.__buttonEvents = []));
const radio = (page: Page, group: string, name: string) => page.locator(`#${group}`).getByRole('radio', { name, exact: true });
const activeId = (page: Page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute('data-value') || null);

test.describe('Button', () => {
  test('Enter and Space activate, Tab moves focus; disabled ignores activation', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await page.locator('#save').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    expect(await events(page, 'click')).toEqual([
      { kind: 'click', id: 'save' },
      { kind: 'click', id: 'save' },
    ]);
    await page.keyboard.press('Tab');
    expect(await activeId(page)).toBe('loading');
    await page.locator('#disabled').click({ force: true });
    expect(await events(page, 'click')).toHaveLength(2);
    await expect(page.locator('#disabled')).toBeDisabled();
    await page.locator('#fab-viewport').focus();
    expect(await activeId(page)).toBe('fab-viewport');
    await expect(page.locator('#fab-viewport')).toHaveAttribute('type', 'button');
    expect(problems).toEqual([]);
  });

  test('a loading button keeps focus, ignores activation, then works again', async ({ page }) => {
    await open(page);
    const loading = page.locator('#loading');
    await expect(loading).toHaveAttribute('aria-busy', 'true');
    await expect(loading).toHaveAttribute('aria-disabled', 'true');
    await loading.focus();
    expect(await activeId(page)).toBe('loading');
    await page.keyboard.press('Enter');
    // aria-disabled: Playwright's actionability check would wait, so force the pointer click.
    await loading.click({ force: true });
    expect(await events(page, 'click')).toEqual([]);
    await expect(loading).toHaveAccessibleName('Loading Loading');
    await page.locator('#stop-loading').click();
    await expect(loading).not.toHaveAttribute('aria-busy', 'true');
    await loading.click();
    expect(await events(page, 'click')).toEqual([{ kind: 'click', id: 'loading' }]);
  });

  test('render as a link navigates; a disabled link is inert', async ({ page }) => {
    await open(page);
    await page.locator('#disabled-link').click({ force: true });
    expect(await page.evaluate(() => location.hash)).toBe('');
    await expect(page.locator('#disabled-link')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('#link').click();
    expect(await page.evaluate(() => location.hash)).toBe('#basic');
    await expect(page.getByRole('link', { name: 'Orders' })).toHaveCount(1);
  });

  test('holding the pointer repeats after the delay at the interval; the first activation is onClick', async ({ page }) => {
    await open(page);
    const box = (await page.locator('#repeat-pointer').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(120);
    expect(await events(page, 'repeat'), 'nothing before the delay').toEqual([]);
    await page.waitForTimeout(330);
    await page.mouse.up();
    const repeats = await events(page, 'repeat');
    expect(repeats.length).toBeGreaterThanOrEqual(3);
    expect(repeats.map((e) => e['count'])).toEqual(repeats.map((_, i) => i + 1));
    expect(new Set(repeats.map((e) => e['source']))).toEqual(new Set(['pointer']));
    await expect(page.locator('#repeat-pointer')).toHaveText('Hold (1)');
    await page.waitForTimeout(200);
    expect(await events(page, 'repeat'), 'release stops the timer').toHaveLength(repeats.length);
  });

  test('a held key repeats on the timer with one click; a prevented keydown skips repeat', async ({ page }) => {
    await open(page);
    await page.locator('#repeat-key').focus();
    await page.keyboard.down('Enter');
    // OS key repeats are swallowed: they neither click nor repeat.
    await page.keyboard.down('Enter');
    await page.waitForTimeout(650);
    await page.keyboard.up('Enter');
    expect(await events(page, 'click')).toEqual([{ kind: 'click', id: 'repeat-key' }]);
    const repeats = await events(page, 'repeat');
    expect(repeats.length).toBeGreaterThanOrEqual(1);
    expect(repeats.map((e) => e['count'])).toEqual(repeats.map((_, i) => i + 1));
    expect(new Set(repeats.map((e) => e['source']))).toEqual(new Set(['keyboard']));
    await page.keyboard.press('Space');
    expect(await events(page, 'click'), 'Space still activates once').toHaveLength(2);
    await clearEvents(page);
    await page.locator('#prevented').focus();
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    expect(await events(page, 'repeat'), 'handlers compose: preventDefault skips the built-in handler').toEqual([]);
  });

  test('keyboard focus shows the focus-visible ring, pointer focus does not', async ({ page }) => {
    await open(page);
    await page.locator('#icons').click();
    expect(await page.locator('#icons').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    expect(await activeId(page)).toBe('icons');
    expect(await page.locator('#icons').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  });

  test('an iconOnly button without a name logs a development warning', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?unnamed');
    await expect(page.locator('#unnamed')).toHaveCount(1);
    expect(problems.some((p) => p.includes('iconOnly button needs aria-label or aria-labelledby'))).toBe(true);
  });

  test('iconStart / iconEnd follow the inline direction', async ({ page }) => {
    for (const [query, startIsLeft] of [['', true], ['?dir=rtl', false]] as const) {
      await open(page, query);
      const [start, label] = await page.locator('#icons').evaluate((el) => [...el.children].slice(0, 2).map((c) => c.getBoundingClientRect().x));
      expect(start! < label!).toBe(startIsLeft);
    }
  });
});

test.describe('ToggleButton', () => {
  test('uncontrolled toggle, controlled toggle with veto, frozen event, controlled-switch warning', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const bold = page.locator('#bold');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await expect(bold).toHaveAttribute('data-pressed', '');
    await bold.focus();
    await page.keyboard.press('Space');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    expect(await events(page, 'bold')).toEqual([
      { kind: 'bold', pressed: true, source: 'pointer', reason: 'toggle' },
      { kind: 'bold', pressed: false, source: 'keyboard', reason: 'toggle' },
    ]);
    const controlled = page.locator('#controlled-toggle');
    await controlled.click();
    await expect(controlled).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#veto').check();
    await controlled.click();
    await expect(controlled, 'a controlled toggle vetoes by not updating').toHaveAttribute('aria-pressed', 'true');
    expect(await events(page, 'controlled-toggle')).toEqual([
      { kind: 'controlled-toggle', pressed: true, source: 'pointer', reason: 'toggle', frozen: true },
      { kind: 'controlled-toggle', pressed: false, source: 'pointer', reason: 'toggle', frozen: true },
    ]);
    expect(problems).toEqual([]);
    await page.locator('#make-uncontrolled').click();
    await expect.poll(() => problems.some((p) => p.includes('changing ToggleButton pressed from controlled to uncontrolled'))).toBe(true);
  });
});

test.describe('ButtonGroup', () => {
  test('a ButtonGroup adds no keyboard model; every button is a tab stop', async ({ page }) => {
    await open(page);
    await page.locator('#actions button').first().focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#actions button').nth(1)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#actions button').nth(2)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#actions button').nth(2)).toBeFocused();
    await expect(page.getByRole('group', { name: 'Actions' })).toHaveCount(1);
  });

  test('attached groups join borders; vertical groups stack', async ({ page }) => {
    await open(page);
    const boxes = await page.locator('#actions button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
    expect(Math.round(boxes[1]!.x)).toBe(Math.round(boxes[0]!.x + boxes[0]!.width - 1));
    const vertical = await page.locator('#vertical button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
    expect(Math.round(vertical[1]!.y)).toBe(Math.round(vertical[0]!.y + vertical[0]!.height - 1));
  });

});

test.describe('ToggleButtonGroup', () => {
  test('single mode has one tab stop; arrows move and select, skipping disabled items; Home / End', async ({ page }) => {
    await open(page);
    // Tab into the radiogroup lands on the checked radio.
    await radio(page, 'align', 'Center').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(radio(page, 'align', 'Center')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'align', 'Right')).toBeFocused();
    await expect(radio(page, 'align', 'Right')).toHaveAttribute('aria-checked', 'true');
    await expect(radio(page, 'align', 'Center')).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'align', 'Left'), 'wraps').toBeFocused();
    await page.keyboard.press('End');
    await expect(radio(page, 'align', 'Right')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(radio(page, 'align', 'Left')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(radio(page, 'align', 'Center')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(radio(page, 'align', 'Left')).toBeFocused();
    const tabIndexes = await page.locator('#align button').evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));
    expect(tabIndexes).toEqual([0, -1, -1, -1]);
    const align = await events(page, 'align');
    expect(align.map((e) => e['value'])).toEqual(['right', 'left', 'right', 'left', 'center', 'left']);
    expect(new Set(align.map((e) => e['source']))).toEqual(new Set(['keyboard']));
    await page.keyboard.press('Tab');
    await expect(page.locator('#style').getByRole('button', { name: 'B' }), 'Tab leaves the group').toBeFocused();
  });

  test('arrow keys mirror under dir="rtl"', async ({ page }) => {
    await open(page, '?dir=rtl');
    await radio(page, 'align', 'Center').focus();
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'align', 'Left')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(radio(page, 'align', 'Center')).toBeFocused();
    const [left, center] = await page.locator('#align button').evaluateAll((els) => els.slice(0, 2).map((el) => el.getBoundingClientRect().x));
    expect(left! > center!, 'logical layout: the first item is at the right').toBe(true);
  });

  test('pointer selection, unchecking, and a controlled veto', async ({ page }) => {
    await open(page);
    await radio(page, 'align', 'Left').click();
    await expect(radio(page, 'align', 'Left')).toHaveAttribute('aria-checked', 'true');
    await radio(page, 'align', 'Left').click();
    await expect(radio(page, 'align', 'Left'), 'disallowEmpty defaults to false').toHaveAttribute('aria-checked', 'false');
    expect((await events(page, 'align')).map((e) => [e['value'], e['source']])).toEqual([
      ['left', 'pointer'],
      [null, 'pointer'],
    ]);
    await radio(page, 'view-group', 'Week').click();
    await expect(radio(page, 'view-group', 'Week')).toHaveAttribute('aria-checked', 'true');
    await radio(page, 'view-group', 'Year').click();
    await expect(radio(page, 'view-group', 'Week'), 'vetoed by the controlled parent').toHaveAttribute('aria-checked', 'true');
    expect((await events(page, 'view')).map((e) => e['value'])).toEqual(['week', 'year']);
  });

  test('multiple mode: arrows move focus only, Space / Enter toggle, disallowEmpty keeps one', async ({ page }) => {
    await open(page);
    const item = (name: string) => page.locator('#style').getByRole('button', { name });
    await item('B').focus();
    await page.keyboard.press('ArrowRight');
    await expect(item('I')).toBeFocused();
    await expect(item('I')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect(item('I')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(item('B')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(item('I'), 'disallowEmpty keeps the last value').toHaveAttribute('aria-pressed', 'true');
    expect((await events(page, 'style')).map((e) => e['value'])).toEqual([['bold', 'italic'], ['italic']]);
    const tabIndexes = await page.locator('#style button').evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));
    expect(tabIndexes).toEqual([-1, 0, -1]);
  });

  test('forms submit selected values through hidden inputs; plain buttons never submit; reset restores defaults', async ({ page }) => {
    await open(page);
    await page.locator('#plain-in-form').click();
    expect(await page.evaluate(() => window.__formData), 'type="button" by default').toBeUndefined();
    await page.locator('#submit').click();
    expect(await page.evaluate(() => window.__formData)).toEqual([
      ['align', 'center'],
      ['style', 'bold'],
    ]);
    await radio(page, 'align', 'Right').click();
    await page.locator('#style').getByRole('button', { name: 'U' }).click();
    await page.locator('#standalone').click();
    await page.locator('#submit').click();
    expect(await page.evaluate(() => window.__formData)).toEqual([
      ['align', 'right'],
      ['style', 'bold'],
      ['style', 'underline'],
      ['notify', 'yes'],
    ]);
    await clearEvents(page);
    await page.locator('#reset').click();
    await expect(radio(page, 'align', 'Center')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#style').getByRole('button', { name: 'U' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#standalone')).toHaveAttribute('aria-pressed', 'false');
    expect(await events(page)).toEqual([
      { kind: 'align', value: 'center', source: 'api', reason: 'reset' },
      { kind: 'style', value: ['bold'], source: 'api', reason: 'reset' },
    ]);
    await page.locator('#submit').click();
    expect(await page.evaluate(() => window.__formData)).toEqual([
      ['align', 'center'],
      ['style', 'bold'],
    ]);
  });

  test('choice chips select one, filter chips toggle with a check mark', async ({ page }) => {
    await open(page);
    await radio(page, 'choice', 'Large').click();
    await expect(radio(page, 'choice', 'Large')).toHaveAttribute('aria-checked', 'true');
    await expect(radio(page, 'choice', 'Medium')).toHaveAttribute('aria-checked', 'false');
    const mine = page.locator('#filter').getByRole('button', { name: 'Mine' });
    expect(await mine.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
    await mine.click();
    await expect(mine).toHaveAttribute('aria-pressed', 'true');
    expect(await mine.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('""');
    expect(await mine.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('4px');
  });
});

test.describe('Floating Action Button', () => {
  test('CSS positioning in the viewport or the parent, mirrored in RTL', async ({ page }) => {
    for (const rtl of [false, true]) {
      await open(page, rtl ? '?dir=rtl' : '');
      const viewport = page.viewportSize()!;
      const fab = await page.locator('#fab-viewport').evaluate((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return { x: r.x, right: r.right, bottom: r.bottom, w: r.width, h: r.height, position: s.position, radius: s.borderRadius, shadow: s.boxShadow };
      });
      expect(fab.position).toBe('fixed');
      expect(fab.radius).toBe('9999px');
      expect(fab.shadow).not.toBe('none');
      expect(fab.w).toBe(56);
      expect(fab.h).toBe(56);
      expect(Math.round(fab.bottom)).toBe(viewport.height - 16);
      if (rtl) expect(Math.round(fab.x)).toBe(16);
      else expect(Math.round(fab.right)).toBe(viewport.width - 16);
      const [panel, button] = await page.locator('#fab-parent, #fab-parent-button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
      expect(Math.round(button!.y - panel!.y)).toBe(17);
      if (rtl) expect(Math.round(panel!.right - button!.right)).toBe(17);
      else expect(Math.round(button!.x - panel!.x)).toBe(17);
    }
  });
});

test.describe('Buttons accessibility and SSR', () => {
  test('server markup hydrates with zero warnings and stays interactive', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    await page.locator('#bold').click();
    await expect(page.locator('#bold')).toHaveAttribute('aria-pressed', 'true');
    await radio(page, 'align', 'Right').click();
    await expect(radio(page, 'align', 'Right')).toHaveAttribute('aria-checked', 'true');
    expect(problems).toEqual([]);
  });

  test('axe is clean in light, dark and RTL, and names include the hidden state text', async ({ page }) => {
    for (const query of ['', '?scheme=dark', '?dir=rtl']) {
      await open(page, query);
      await expectClean(page, `buttons ${query || 'light'}`);
    }
    await expect(page.locator('#progress')).toHaveAccessibleName('Upload 40%');
    await expect(page.locator('#icon-only')).toHaveAccessibleName('Add item');
    await expect(page.locator('#fab-viewport')).toHaveAccessibleName('Compose');
    await expect(page.getByRole('radiogroup', { name: 'Alignment' })).toHaveAttribute('aria-orientation', 'horizontal');
  });

  test('every tone x variant pair (and its pressed state) meets 4.5:1 text contrast in light and dark', async ({ page }) => {
    for (const scheme of ['light', 'dark']) {
      await open(page, `?scheme=${scheme}`);
      await page.mouse.move(0, 0);
      const failures = await page.locator('[data-matrix]').evaluateAll((els) => {
        const parse = (c: string): [number, number, number, number] => {
          const ctx = document.createElement('canvas').getContext('2d')!;
          ctx.fillStyle = c;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          ctx.clearRect(0, 0, 1, 1);
          return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
        };
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
        };
        const background = (el: Element | null): number[] => {
          for (let node = el; node; node = node.parentElement) {
            const c = parse(getComputedStyle(node).backgroundColor);
            if (c[3] > 0.5) return c;
          }
          return [255, 255, 255];
        };
        const out: string[] = [];
        for (const el of els) {
          const fg = parse(getComputedStyle(el).color);
          const bg = background(el);
          const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x) as [number, number];
          const ratio = (a + 0.05) / (b + 0.05);
          if (ratio < 4.5) out.push(`${el.getAttribute('data-matrix')}: ${ratio.toFixed(2)}`);
        }
        return out;
      });
      expect(failures, scheme).toEqual([]);
    }
  });
});
