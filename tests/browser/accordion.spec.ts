import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Accordion behavior: APG
// Accordion keyboard table, pointer toggles, single / multiple modes, events,
// lazy panels with hidden="until-found", nested accordions, RTL and
// hydration. Page: examples/vite-spa/accordion.html.

const URL = `${DEV_URL}accordion.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const header = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
const panelOf = async (page: Page, name: string) => page.locator(`[id="${await header(page, name).getAttribute('aria-controls')}"]`);

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query}`);
  await expect(page.locator('#main')).toBeVisible();
  return problems;
}

test.describe('Accordion pointer and events', () => {
  test('clicking a header toggles its panel; onBeforeValueChange then onValueChange carry item, value and source', async ({ page }) => {
    const problems = await open(page);
    const shipping = header(page, 'Shipping');
    await expect(shipping).toHaveAttribute('aria-expanded', 'true');
    await shipping.click();
    await expect(shipping).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#main .salmon-accordion-item').first()).toHaveAttribute('data-state', 'closed');
    await header(page, 'Returns').click();
    await expect(header(page, 'Returns')).toHaveAttribute('aria-expanded', 'true');
    expect(await events(page)).toEqual([
      ['click', 'shipping'],
      ['before', 'shipping', false, [], ['shipping'], 'pointer'],
      ['change', [], 'shipping', false, 'pointer'],
      ['before', 'returns', true, ['returns'], [], 'pointer'],
      ['change', ['returns'], 'returns', true, 'pointer'],
    ]);
    expect(problems).toEqual([]);
  });

  test('preventDefault() in onBeforeValueChange cancels; disabled items do not toggle', async ({ page }) => {
    await open(page);
    await header(page, 'Locked').click();
    await expect(header(page, 'Locked')).toHaveAttribute('aria-expanded', 'false');
    await header(page, 'Disabled').click({ force: true }); // aria-disabled: Playwright would wait for it to enable
    await expect(header(page, 'Disabled')).toHaveAttribute('aria-expanded', 'false');
    await expect(header(page, 'Disabled')).toHaveAttribute('aria-disabled', 'true');
    expect(await events(page)).toEqual([['before', 'locked', true, ['shipping', 'locked'], ['shipping'], 'pointer']]);
  });

  test('a headerProps onClick that calls preventDefault() stops the toggle', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const el = [...document.querySelectorAll<HTMLButtonElement>('#main .salmon-accordion-trigger')][0]!;
      // A React handler sees this native default-prevented click as prevented too.
      el.addEventListener('click', (event) => event.preventDefault(), { capture: true, once: true });
    });
    await header(page, 'Shipping').click();
    await expect(header(page, 'Shipping')).toHaveAttribute('aria-expanded', 'true');
    expect(await events(page)).toEqual([['click', 'shipping']]);
  });
});

test.describe('Accordion modes', () => {
  test('multiple mode keeps several items open', async ({ page }) => {
    await open(page);
    await header(page, 'Returns').click();
    await expect(header(page, 'Shipping')).toHaveAttribute('aria-expanded', 'true');
    await expect(header(page, 'Returns')).toHaveAttribute('aria-expanded', 'true');
  });

  test('single non-collapsible: opening one closes the other; the open header cannot collapse', async ({ page }) => {
    await open(page);
    const one = header(page, 'Single one');
    const two = header(page, 'Single two');
    await one.click({ force: true });
    await expect(one).toHaveAttribute('aria-expanded', 'true');
    await expect(one).toHaveAttribute('aria-disabled', 'true');
    await two.click();
    await expect(two).toHaveAttribute('aria-expanded', 'true');
    await expect(one).toHaveAttribute('aria-expanded', 'false');
    await expect(one).not.toHaveAttribute('aria-disabled');
  });

  test('single collapsible (default): the open item closes again', async ({ page }) => {
    await open(page);
    const a = header(page, 'Collapsible A');
    await a.click();
    await expect(a).toHaveAttribute('aria-expanded', 'true');
    await header(page, 'Collapsible B').click();
    await expect(a).toHaveAttribute('aria-expanded', 'false');
    await header(page, 'Collapsible B').click();
    await expect(header(page, 'Collapsible B')).toHaveAttribute('aria-expanded', 'false');
  });

  test('controlled value: a proposal is reported but only the prop changes the panels', async ({ page }) => {
    await open(page);
    await header(page, 'Controlled two').click();
    await expect(header(page, 'Controlled two')).toHaveAttribute('aria-expanded', 'false');
    expect(await events(page)).toEqual([['controlled', ['c1', 'c2'], 'c2', true, 'pointer']]);
    await page.evaluate(() => (window as unknown as { __setValue: (v: string[]) => void }).__setValue(['c2']));
    await expect(header(page, 'Controlled two')).toHaveAttribute('aria-expanded', 'true');
    await expect(header(page, 'Controlled one')).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Accordion keyboard', () => {
  for (const query of ['', '?dir=rtl']) {
    test(`ArrowDown / ArrowUp wrap between headers; Home / End; Enter and Space toggle ${query || '(ltr)'}`, async ({ page }) => {
      await open(page, query);
      await header(page, 'Shipping').focus();
      await page.keyboard.press('ArrowDown');
      expect(await focusedText(page)).toBe('Returns');
      await page.keyboard.press('ArrowDown');
      expect(await focusedText(page)).toBe('Disabled');
      await page.keyboard.press('End');
      expect(await focusedText(page)).toBe('Searchable');
      await page.keyboard.press('ArrowDown');
      expect(await focusedText(page)).toBe('Shipping');
      await page.keyboard.press('ArrowUp');
      expect(await focusedText(page)).toBe('Searchable');
      await page.keyboard.press('Home');
      expect(await focusedText(page)).toBe('Shipping');
      await page.keyboard.press('ArrowDown');
      await clearEvents(page);
      await page.keyboard.press('Enter');
      await expect(header(page, 'Returns')).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Space');
      await expect(header(page, 'Returns')).toHaveAttribute('aria-expanded', 'false');
      expect((await events(page)).map((e) => e.at(-1))).toEqual(['keyboard', 'keyboard', 'keyboard', 'keyboard']);
    });
  }

  test('Tab reaches every header (no roving tabindex)', async ({ page }) => {
    await open(page);
    const tabIndexes = await page.locator('#main .salmon-accordion-trigger').evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));
    expect(tabIndexes).toEqual([0, 0, 0, 0, 0, 0]);
    await header(page, 'Returns').focus();
    await page.keyboard.press('Tab');
    expect(await focusedText(page)).toBe('Disabled');
  });
});

test.describe('Nested accordions', () => {
  test('arrow keys stay inside the inner accordion; the outer skips inner headers', async ({ page }) => {
    await open(page);
    await header(page, 'Inner one').focus();
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('Inner two');
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('Inner one');
    await header(page, 'Outer one').focus();
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('Outer two');
    await header(page, 'Inner one').click();
    await expect(header(page, 'Inner one')).toHaveAttribute('aria-expanded', 'true');
    await expect(header(page, 'Outer one')).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('Lazy panels and find-in-page', () => {
  test('content mounts on first expand and stays mounted; collapsed panels are hidden="until-found"', async ({ page }) => {
    await open(page);
    await expect(page.locator('#returns-body')).toHaveCount(0);
    const panel = await panelOf(page, 'Returns');
    await expect(panel).toHaveAttribute('hidden', 'until-found');
    await header(page, 'Returns').click();
    await expect(panel).not.toHaveAttribute('hidden');
    await page.locator('#returns-body .bump').click();
    await header(page, 'Returns').click();
    await expect(panel).toHaveAttribute('hidden', 'until-found');
    await expect(page.locator('#returns-body')).toHaveCount(1);
    await expect(page.locator('#returns-body')).toBeHidden();
    await header(page, 'Returns').click();
    await expect(page.locator('#returns-body .bump')).toHaveText('Clicked 1');
  });

  test('keepMounted={false} unmounts the content on collapse', async ({ page }) => {
    await open(page);
    await header(page, 'Unmounts on collapse').click();
    await expect(page.locator('#unmount-body')).toBeVisible();
    await header(page, 'Unmounts on collapse').click();
    await expect(page.locator('#unmount-body')).toHaveCount(0);
  });

  test('forceMount content is in the DOM while collapsed; beforematch (find-in-page) expands it with source "find"', async ({ page }) => {
    await open(page);
    await expect(page.locator('#find-body')).toHaveCount(1);
    await expect(page.locator('#find-body')).toBeHidden();
    const panel = await panelOf(page, 'Searchable');
    await panel.evaluate((el) => el.dispatchEvent(new Event('beforematch')));
    await expect(header(page, 'Searchable')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#find-body')).toBeVisible();
    expect((await events(page)).at(-1)).toEqual(['change', ['shipping', 'find'], 'find', true, 'find']);
  });

  test('the panel animates block-size to auto (interpolate-size) and not under reduced motion', async ({ page }) => {
    await open(page);
    const panel = await panelOf(page, 'Returns');
    const style = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { property: s.transitionProperty, duration: s.transitionDuration, interpolate: s.getPropertyValue('interpolate-size') };
    });
    expect(style.property).toContain('block-size');
    expect(style.duration).not.toBe('0s');
    expect(style.interpolate).toBe('allow-keywords');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await panel.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s(, 0s)*$/);
    await header(page, 'Returns').click();
    await expect.poll(() => panel.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(10);
  });
});

test.describe('SSR and hydration', () => {
  test('server markup has no hidden attribute and no lazy content; hydration reports nothing; the client sets until-found', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).not.toContain(' hidden=');
    expect(html).toContain('id="shipping-body"');
    expect(html).toContain('id="find-body"');
    expect(html).not.toContain('id="returns-body"');
    await expect(await panelOf(page, 'Returns')).toHaveAttribute('hidden', 'until-found');
    await header(page, 'Returns').click();
    await expect(page.locator('#returns-body')).toBeVisible();
    expect(problems).toEqual([]);
  });
});

test.describe('Accordion metrics (visual consistency)', () => {
  test('the accordion frame is a large-radius container', async ({ page }) => {
    await open(page);
    expect(await page.locator('.salmon-accordion').first().evaluate((el) => getComputedStyle(el).borderRadius)).toBe('10px');
  });
});
