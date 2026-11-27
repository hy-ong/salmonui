import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Stepper behavior:
// selection by pointer and keyboard, events, linear, readOnly, orientation,
// RTL arrows and hydration. Page: examples/vite-spa/stepper.html.

const URL = `${DEV_URL}stepper.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const steps = (page: Page, stepper: string) => page.locator(`#${stepper} > li`);
const button = (page: Page, stepper: string, index: number) => page.locator(`#${stepper} > li`).nth(index).locator('.salmon-stepper-step-button');
const focusedLabel = (page: Page) => page.evaluate(() => document.activeElement?.querySelector('.salmon-stepper-label')?.textContent ?? '');
const current = (page: Page, stepper: string) => steps(page, stepper).evaluateAll((lis) => lis.findIndex((li) => li.getAttribute('aria-current') === 'step'));

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query}`);
  await expect(page.locator('#main')).toBeVisible();
  return problems;
}

test.describe('Stepper selection and events', () => {
  test('clicking a step selects it; onStepClick, onBeforeValueChange and onValueChange fire in order; statuses follow', async ({ page }) => {
    const problems = await open(page);
    expect(await current(page, 'main')).toBe(0);
    await button(page, 'main', 1).click();
    expect(await current(page, 'main')).toBe(1);
    await expect(steps(page, 'main').nth(0)).toHaveAttribute('data-status', 'completed');
    await expect(steps(page, 'main').nth(1)).toHaveAttribute('data-status', 'inProgress');
    await expect(steps(page, 'main').nth(2)).toHaveAttribute('data-status', 'notStarted');
    expect(await events(page)).toEqual([
      ['click', 1, 'pointer'],
      ['before', 1, 0, 'pointer'],
      ['change', 1, 'pointer'],
    ]);
    expect(problems).toEqual([]);
  });

  test('preventDefault() cancels; disabled steps neither select nor report clicks', async ({ page }) => {
    await open(page);
    await button(page, 'main', 4).click();
    expect(await current(page, 'main')).toBe(0);
    await button(page, 'main', 2).click({ force: true }); // aria-disabled
    expect(await current(page, 'main')).toBe(0);
    expect(await events(page)).toEqual([
      ['click', 4, 'pointer'],
      ['before', 4, 0, 'pointer'],
    ]);
  });

  test('controlled value: proposals are reported; the prop moves the active step', async ({ page }) => {
    await open(page);
    await button(page, 'controlled', 2).click();
    expect(await current(page, 'controlled')).toBe(1);
    expect(await events(page)).toEqual([['controlled', 2, 'pointer']]);
    await page.evaluate(() => (window as unknown as { __setStep: (i: number) => void }).__setStep(2));
    await expect.poll(() => current(page, 'controlled')).toBe(2);
  });
});

test.describe('Stepper keyboard', () => {
  test('one tab stop; ArrowRight / ArrowLeft move focus and skip disabled steps; Home / End; Enter and Space select', async ({ page }) => {
    await open(page);
    await page.focus('#before');
    await page.keyboard.press('Tab');
    expect(await focusedLabel(page)).toBe('Account');
    await page.keyboard.press('ArrowRight');
    expect(await focusedLabel(page)).toBe('Billing');
    await page.keyboard.press('ArrowRight');
    expect(await focusedLabel(page)).toBe('Shipping');
    await page.keyboard.press('End');
    expect(await focusedLabel(page)).toBe('Confirm');
    await page.keyboard.press('Home');
    expect(await focusedLabel(page)).toBe('Account');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedLabel(page), 'no wrap at the ends').toBe('Account');
    await page.keyboard.press('ArrowRight');
    await clearEvents(page);
    await page.keyboard.press('Enter');
    expect(await current(page, 'main')).toBe(1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    expect(await current(page, 'main')).toBe(3);
    expect(await events(page)).toEqual([
      ['click', 1, 'keyboard'],
      ['before', 1, 0, 'keyboard'],
      ['change', 1, 'keyboard'],
      ['click', 3, 'keyboard'],
      ['before', 3, 1, 'keyboard'],
      ['change', 3, 'keyboard'],
    ]);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('ol')?.id)).toBe('linear');
  });

  test('RTL mirrors the horizontal arrows', async ({ page }) => {
    await open(page, '?dir=rtl');
    await button(page, 'main', 0).focus();
    await page.keyboard.press('ArrowLeft');
    expect(await focusedLabel(page)).toBe('Billing');
    await page.keyboard.press('ArrowRight');
    expect(await focusedLabel(page)).toBe('Account');
  });

  test('vertical orientation uses ArrowDown / ArrowUp and lays the steps out in a column', async ({ page }) => {
    await open(page);
    await expect(page.locator('#vertical')).toHaveAttribute('data-orientation', 'vertical');
    await button(page, 'vertical', 1).focus();
    await page.keyboard.press('ArrowDown');
    expect(await focusedLabel(page)).toBe('Up three');
    await page.keyboard.press('ArrowRight');
    expect(await focusedLabel(page)).toBe('Up three');
    await page.keyboard.press('ArrowUp');
    expect(await focusedLabel(page)).toBe('Up two');
    const [a, b] = await Promise.all([0, 1].map((i) => steps(page, 'vertical').nth(i).boundingBox()));
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
    const [h0, h1] = await Promise.all([0, 1].map((i) => steps(page, 'main').nth(i).boundingBox()));
    expect(Math.abs(h0!.y - h1!.y)).toBeLessThan(2);
  });
});

test.describe('Stepper modes', () => {
  test('linear: only earlier steps and the next one are selectable', async ({ page }) => {
    await open(page);
    await expect(button(page, 'linear', 2)).toHaveAttribute('aria-disabled', 'true');
    await button(page, 'linear', 2).click({ force: true });
    expect(await current(page, 'linear')).toBe(0);
    await button(page, 'linear', 1).click();
    expect(await current(page, 'linear')).toBe(1);
    await expect(button(page, 'linear', 2)).not.toHaveAttribute('aria-disabled');
    await expect(button(page, 'linear', 3)).toHaveAttribute('aria-disabled', 'true');
    await button(page, 'linear', 0).click();
    expect(await current(page, 'linear')).toBe(0);
  });

  test('readOnly: no buttons, nothing focusable, clicks do nothing', async ({ page }) => {
    await open(page);
    await expect(page.locator('#readonly button')).toHaveCount(0);
    await steps(page, 'readonly').nth(2).click();
    expect(await current(page, 'readonly')).toBe(1);
  });

  test('renderStep replaces the content of every step', async ({ page }) => {
    await open(page);
    await expect(page.locator('#custom .custom-step')).toHaveText(['1. Cart (completed)', '2. Pay (inProgress)']);
  });

  test('a narrow horizontal stepper wraps the step text; no step overlaps the next one or its connector', async ({ page }) => {
    await open(page);
    // Narrower than the steps' one-line text: the text wraps at word breaks instead of running under the connector.
    await page.locator('#custom').evaluate((el) => ((el as HTMLElement).style.inlineSize = '200px'));
    const boxes = await steps(page, 'custom').evaluateAll((lis) =>
      lis.map((li) => {
        const r = li.getBoundingClientRect();
        const b = li.querySelector('.salmon-stepper-step-button')!.getBoundingClientRect();
        return { left: r.left, right: r.right, buttonRight: b.right, buttonHeight: b.height };
      }),
    );
    for (let i = 0; i < boxes.length - 1; i++) {
      // The step's own box holds its button plus the connector margin, and ends before the next step.
      expect(boxes[i]!.buttonRight + 8).toBeLessThanOrEqual(boxes[i]!.right + 0.5);
      expect(boxes[i]!.right).toBeLessThanOrEqual(boxes[i + 1]!.left + 0.5);
    }
    expect(boxes[0]!.buttonHeight).toBeGreaterThan(30); // wrapped onto two lines
  });
});

test.describe('Step tooltips', () => {
  test('Step render composes a Tooltip: hover and keyboard focus show it; Escape and leaving hide it; roving focus still works; a title-only step has none', async ({ page }) => {
    const problems = await open(page);
    const tooltip = page.locator('[role="tooltip"]');
    await button(page, 'tips', 0).hover();
    await expect(tooltip).toHaveText('Review the items in your cart');
    await expect(button(page, 'tips', 0)).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);
    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);
    await button(page, 'tips', 0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(button(page, 'tips', 1)).toBeFocused();
    await expect(tooltip.locator('strong')).toHaveText('Where we ship to');
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(button(page, 'tips', 2)).toBeFocused();
    await expect(button(page, 'tips', 2)).toHaveAttribute('title', 'No tooltip, a native title');
    await page.waitForTimeout(800);
    await expect(tooltip).toHaveCount(0);
    await button(page, 'tips', 1).click();
    expect(await current(page, 'tips')).toBe(1);
    expect(problems).toEqual([]);
  });
});

test.describe('SSR and hydration', () => {
  test('server markup equals the client tree; hydration reports nothing; the hydrated stepper works', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).toContain('aria-current="step"');
    await button(page, 'main', 1).click();
    expect(await current(page, 'main')).toBe(1);
    // the composed Tooltip renders no markup on the server and works after hydration.
    expect(html).not.toContain('role="tooltip"');
    await button(page, 'tips', 0).hover();
    await expect(page.locator('[role="tooltip"]')).toHaveText('Review the items in your cart');
    expect(problems).toEqual([]);
  });
});
