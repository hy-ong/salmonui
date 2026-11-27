import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Toaster and the toast queue in the browser:
// stacking, pause on hover / focus / hidden document, F6 and Escape,
// actions, onClick, container, placement, tone roles, announcements, RTL,
// reduced motion, render counts, hydration and axe. Page: examples/vite-spa/toast.html.

const PAGE = `${DEV_URL}toast.html`;

type Win = {
  __toasts: { add(o: object): string; dismiss(id?: string): void; getSnapshot(): { paused: boolean } };
  __demo: { add(o?: object): string; action(): string; tones(): string[] };
  __events: string[];
  __toastCommits: number;
};

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}
const add = (page: Page, options: object = {}) => page.evaluate((o) => (window as unknown as Win).__demo.add(o), options);
const events = (page: Page) => page.evaluate(() => [...(window as unknown as Win).__events]);
const titles = (page: Page) => page.locator('.salmon-toast:not([data-closing]) .salmon-toast-title').allTextContents();
// Waits for the enter transitions.
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished)));
const region = (page: Page) => page.getByRole('region', { name: 'Notifications' });

test('toasts stack newest first, max are visible and the rest wait', async ({ page }) => {
  await open(page, '?max=3');
  for (const n of [1, 2, 3, 4, 5]) await add(page, { title: `T${n}`, duration: Infinity });
  await expect(page.locator('.salmon-toast')).toHaveCount(3);
  expect(await titles(page)).toEqual(['T3', 'T2', 'T1']);
  await expect(page.locator('.salmon-toast-description').first()).toHaveText('Your changes are stored.');
  await page.evaluate(() => (window as unknown as Win).__toasts.dismiss('t1'));
  await expect.poll(() => titles(page)).toEqual(['T4', 'T3', 'T2']);
  await open(page, '?oldest');
  for (const n of [1, 2]) await add(page, { title: `T${n}`, duration: Infinity });
  expect(await titles(page)).toEqual(['T1', 'T2']);
  // useToast() reaches the queue of the nearest Toaster.
  await page.locator('#add').click();
  await expect(page.locator('.salmon-toast-title').last()).toHaveText('From useToast()');
});

test('hover and focus pause the timer and the countdown bar; leaving resumes the remaining time', async ({ page }) => {
  await open(page);
  await add(page, { duration: 1200, progress: true });
  const bar = page.locator('.salmon-toast-progress');
  await expect(bar).toHaveCSS('animation-name', 'salmon-toast-countdown');
  await expect(bar).toHaveCSS('animation-duration', '1.2s');
  await page.locator('.salmon-toast').hover();
  await expect(region(page)).toHaveAttribute('data-paused', '');
  await expect(bar).toHaveCSS('animation-play-state', 'paused');
  await page.waitForTimeout(1600);
  await expect(page.locator('.salmon-toast')).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(region(page)).not.toHaveAttribute('data-paused', '');
  await expect(page.locator('.salmon-toast')).toHaveCount(0, { timeout: 2000 });
  expect(await events(page)).toEqual(['close:t1:timeout']);
  // Focus inside the region pauses too.
  await add(page, { duration: 600 });
  await page.locator('.salmon-toast').focus();
  await page.waitForTimeout(900);
  await expect(page.locator('.salmon-toast')).toHaveCount(1);
  await page.locator('#before').focus();
  await expect(page.locator('.salmon-toast')).toHaveCount(0, { timeout: 2000 });
});

test('a hidden document pauses the timers', async ({ page }) => {
  await open(page);
  await add(page, { duration: 500 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => (window as unknown as Win).__toasts.getSnapshot().paused)).toBe(true);
  await page.waitForTimeout(800);
  await expect(page.locator('.salmon-toast')).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.salmon-toast')).toHaveCount(0, { timeout: 2000 });
});

test('F6 moves focus into the region and back; Escape dismisses the focused dismissible toast', async ({ page }) => {
  await open(page);
  await add(page, { title: 'Second', dismissible: true, duration: Infinity });
  await add(page, { title: 'First', dismissible: true, duration: Infinity });
  await page.locator('#before').focus();
  await page.keyboard.press('F6');
  await expect(page.locator('.salmon-toast').first()).toBeFocused();
  await page.keyboard.press('F6');
  await expect(page.locator('#before')).toBeFocused();
  await page.keyboard.press('F6');
  await page.keyboard.press('Escape');
  // Focus moves to the next toast, then back to where F6 came from.
  await expect(page.locator('.salmon-toast:not([data-closing])')).toHaveCount(1);
  await expect(page.locator('.salmon-toast:not([data-closing])')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#before')).toBeFocused();
  expect(await events(page)).toEqual(['close:t2:dismiss', 'close:t1:dismiss']);
  // A toast that is not dismissible ignores Escape.
  await add(page, { duration: Infinity });
  await page.keyboard.press('F6');
  await page.keyboard.press('Escape');
  await expect(page.locator('.salmon-toast')).toHaveCount(1);
});

test('the close button, actions with altText, onClick; actions keep the toast until used', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as unknown as Win).__demo.action());
  const toast = page.locator('.salmon-toast');
  // Announced with the action's keyboard hint through the pre-existing polite region.
  await expect(page.locator('.salmon-toaster > [role="status"]')).toHaveText('Message archived. Press F6 to reach Undo');
  await toast.locator('.salmon-toast-title').click();
  await page.waitForTimeout(5300);
  await expect(toast).toHaveCount(1);
  // Action and dismiss buttons share the `sm` control height.
  const heights = await toast.locator('button').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  expect(heights).toEqual([24, 24]);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(toast).toHaveCount(0);
  // The action runs and closes the toast before the click bubbles to the toast.
  expect(await events(page)).toEqual(['click', 'undo', 'close:t1:action', 'click']);
  await page.evaluate(() => (window as unknown as Win).__demo.action());
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toHaveCount(0);
  expect(await events(page)).toContain('close:t2:dismiss');
});

test('tone roles, icons, content and per-toast className / style', async ({ page }) => {
  await open(page, '?max=6');
  await page.evaluate(() => (window as unknown as Win).__demo.tones());
  await expect(page.locator('.salmon-toast')).toHaveCount(6);
  await expect(page.locator('.salmon-toast[data-tone="danger"] .salmon-toast-body')).toHaveAttribute('role', 'alert');
  for (const tone of ['primary', 'info', 'success', 'warning']) await expect(page.locator(`.salmon-toast[data-tone="${tone}"] .salmon-toast-body`)).toHaveAttribute('role', 'status');
  await expect(page.locator('.salmon-toast[data-tone="danger"] .salmon-toast-icon svg')).toHaveCount(1);
  // Danger toasts are announced through the assertive region.
  await expect(page.locator('.salmon-toaster > [role="alert"]')).toHaveText('danger toastDetails.');
  await page.evaluate(() => (window as unknown as Win).__toasts.dismiss());
  await add(page, { icon: false, className: 'wide', style: { inlineSize: '480px' }, duration: Infinity });
  await add(page, { content: 'Fully custom', duration: Infinity });
  const custom = page.locator('.salmon-toast').first();
  await expect(custom.locator('.salmon-toast-body')).toHaveText('Fully custom');
  await expect(custom.locator('.salmon-toast-icon')).toHaveCount(0);
  // The dismiss button stays at the inline end after custom content.
  await add(page, { content: 'Custom, dismissible', dismissible: true, duration: Infinity });
  const customBox = (await page.locator('.salmon-toast').first().boundingBox())!;
  const dismissBox = (await page.locator('.salmon-toast').first().locator('.salmon-toast-dismiss').boundingBox())!;
  expect(customBox.x + customBox.width - (dismissBox.x + dismissBox.width)).toBeLessThan(16);
  const wide = page.locator('.salmon-toast.wide');
  await expect(wide.locator('.salmon-toast-icon')).toHaveCount(0);
  expect(Math.round((await wide.boundingBox())!.width)).toBe(480);
});

test('the region is in the top layer at a logical placement that follows dir', async ({ page }) => {
  const viewport = page.viewportSize()!;
  const corner = async () => {
    await add(page, { duration: Infinity });
    await settle(page);
    return (await page.locator('.salmon-toast').boundingBox())!;
  };
  await open(page);
  expect(await region(page).evaluate((el) => el.matches(':popover-open'))).toBe(true);
  let box = await corner();
  expect(Math.round(viewport.width - box.x - box.width)).toBe(16);
  expect(Math.round(viewport.height - box.y - box.height)).toBe(16);
  // A narrower per-toast width hugs the placement edge, not the stack's start.
  await add(page, { duration: Infinity, className: 'narrow', style: { inlineSize: '240px' } });
  await settle(page);
  const narrow = (await page.locator('.salmon-toast.narrow').boundingBox())!;
  expect(Math.round(viewport.width - narrow.x - narrow.width)).toBe(16);
  await open(page, '?dir=rtl');
  box = await corner();
  expect(Math.round(box.x)).toBe(16);
  await open(page, '?placement=topStart');
  box = await corner();
  expect([Math.round(box.x), Math.round(box.y)]).toEqual([16, 16]);
  await open(page, '?placement=top');
  box = await corner();
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
});

test('container renders a scoped region inside the element instead of the top layer', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?scoped');
  await add(page, { duration: Infinity });
  const scoped = page.locator('#box > .salmon-toaster');
  await expect(scoped).toHaveAttribute('data-scoped', '');
  expect(await scoped.getAttribute('popover')).toBeNull();
  const box = (await page.locator('#box').boundingBox())!;
  const toast = (await page.locator('.salmon-toast').boundingBox())!;
  expect(toast.x + toast.width).toBeLessThanOrEqual(box.x + box.width);
  expect(toast.y + toast.height).toBeLessThanOrEqual(box.y + box.height);
  expect(problems).toEqual([]);
});

test('the countdown shrinks toward the inline end; reduced motion turns the transitions off', async ({ page }) => {
  await open(page);
  await add(page, { progress: true, duration: Infinity });
  await add(page, { progress: true });
  await expect(page.locator('.salmon-toast-progress')).toHaveCount(1);
  await expect(page.locator('.salmon-toast-progress')).toHaveCSS('transform-origin', /^\d+(\.\d+)?px/);
  const ltr = await page.locator('.salmon-toast-progress').evaluate((el) => getComputedStyle(el).transformOrigin.split(' ')[0]);
  expect(ltr).not.toBe('0px');
  await open(page, '?dir=rtl');
  await add(page, { progress: true });
  expect(await page.locator('.salmon-toast-progress').evaluate((el) => getComputedStyle(el).transformOrigin.split(' ')[0])).toBe('0px');
  await expect(page.locator('.salmon-toast')).toHaveCSS('transition-duration', /0\.2s/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await add(page, { progress: true });
  await expect(page.locator('.salmon-toast')).toHaveCSS('transition-property', 'none');
  await expect(page.locator('.salmon-toast-progress')).toHaveCSS('animation-name', 'none');
});

test('performance: no React render while toasts count down; 100 adds in one task are one commit showing max toasts', async ({ page }) => {
  await open(page);
  await add(page, { duration: 5000, progress: true });
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => (window as unknown as Win).__toastCommits);
  await page.locator('.salmon-toast').hover();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as unknown as Win).__toastCommits)).toBe(before);
  const result = await page.evaluate(
    () =>
      new Promise<{ commits: number; ms: number; count: number }>((resolve) => {
        const w = window as unknown as Win;
        const start = performance.now();
        const commits = w.__toastCommits;
        for (let i = 0; i < 100; i++) w.__toasts.add({ title: `Bulk ${i}` });
        requestAnimationFrame(() =>
          setTimeout(() => resolve({ commits: w.__toastCommits - commits, ms: performance.now() - start, count: document.querySelectorAll('.salmon-toast').length }), 0),
        );
      }),
  );
  expect(result.commits).toBe(1);
  expect(result.count).toBe(5);
  console.log(`100 toasts in one task: ${result.commits} commit, ${result.ms.toFixed(1)} ms to painted`);
});

test('server markup hydrates with zero warnings; the empty region exists before toasts arrive', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate');
  await expect(region(page)).toHaveCount(1);
  await expect(page.locator('.salmon-toaster-list')).toBeEmpty();
  await page.locator('#add').click();
  await expect(page.locator('.salmon-toast')).toHaveCount(1);
  await expect(page.locator('.salmon-toaster > [role="status"]')).toHaveText('From useToast()');
  expect(problems).toEqual([]);
});

for (const query of ['', '?scheme=dark', '?dir=rtl']) {
  test(`axe clean with every tone${query ? ` (${query.slice(1)})` : ''}`, async ({ page }) => {
    await open(page, `${query}${query ? '&' : '?'}max=6`);
    await page.evaluate(() => (window as unknown as Win).__demo.tones());
    await page.evaluate(() => (window as unknown as Win).__demo.action());
    await expect(page.locator('.salmon-toast')).toHaveCount(6);
    await settle(page);
    await expectClean(page, `toast${query}`);
  });
}
