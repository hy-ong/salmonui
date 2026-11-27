import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// TextArea `suggest` and smart paste (page: examples/vite-spa/src/smart.tsx).

interface Log {
  requests: string[];
  aborted: number;
  shown: string[];
  accepted: string[];
  inputs: number;
  value: string;
  pasteRequests: { clipboardText: string; fields: { name: string; label?: string; description?: string; type: string; options?: string[] }[] }[];
  pasteAborted: number;
  results: { filled: string[]; skipped: string[] }[];
  errors: string[];
  form: Record<string, unknown>;
}

const url = (query = ''): string => `${DEV_URL}smart.html${query ? `?${query}` : ''}`;
const message = (page: Page) => page.locator('#message');
const ghost = (page: Page) => page.locator('.salmon-text-suggest');
const live = (page: Page) => page.locator('.salmon-text-suggest-live');
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __smart: Log }).__smart);

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(url(query));
  await expect(message(page)).toBeVisible();
}

async function typeIn(page: Page, text: string): Promise<void> {
  await message(page).click();
  await page.keyboard.type(text);
}

test.describe('TextArea suggest', () => {
  test('inline ghost text at the caret, hint by aria-describedby, Tab accepts through the native input path', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'display=inline');
    // The chunk loads only after mount; the server-safe markup has no overlay until then.
    await typeIn(page, 'Thank');
    await expect(ghost(page)).toBeVisible();
    await expect(ghost(page)).toHaveText(' you for your message');
    await expect(ghost(page)).toHaveAttribute('data-suggestion-display', 'inline');
    await expect(ghost(page)).toHaveAttribute('aria-hidden', 'true');
    // Placed on the caret line, inside the field.
    const field = (await message(page).boundingBox())!;
    const box = (await ghost(page).boundingBox())!;
    expect(box.x).toBeGreaterThan(field.x + 10);
    expect(box.y).toBeGreaterThanOrEqual(field.y);
    expect(box.y + box.height).toBeLessThanOrEqual(field.y + field.height);
    const describedBy = (await message(page).getAttribute('aria-describedby'))!.split(' ');
    const hintId = describedBy.find((id) => id.includes('suggestion-hint'))!;
    await expect(page.locator(`[id="${hintId}"]`)).toHaveText('Tab to accept');
    await expect(live(page)).toHaveText('');
    const before = await log(page);
    expect(before.shown).toEqual([' you for your message']);
    expect(before.requests.at(-1)).toBe('Thank');

    await page.keyboard.press('Tab');
    await expect(message(page)).toBeFocused();
    await expect(message(page)).toHaveValue('Thank you for your message');
    await expect(ghost(page)).toBeHidden();
    expect(await message(page).getAttribute('aria-describedby')).not.toContain(hintId);
    const after = await log(page);
    expect(after.accepted).toEqual([' you for your message']);
    // The insertion fired a native input event the page saw.
    expect(after.value).toBe('Thank you for your message');
    // Native undo stack: one undo removes the accepted text.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(message(page)).toHaveValue('Thank');
    // Without a visible suggestion Tab moves focus on.
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await expect(message(page)).not.toBeFocused();
    expect(problems).toEqual([]);
  });

  test('typing the suggestion keeps the remainder; Escape dismisses and keeps the value', async ({ page }) => {
    await open(page, 'display=inline');
    await typeIn(page, 'Kind');
    await expect(ghost(page)).toHaveText(' regards');
    await page.keyboard.type(' re');
    await expect(ghost(page)).toHaveText('gards');
    await page.keyboard.press('Escape');
    await expect(ghost(page)).toBeHidden();
    await expect(message(page)).toHaveValue('Kind re');
    await expect(message(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(message(page)).not.toBeFocused();
    await expect(message(page)).toHaveValue('Kind re');
    expect((await log(page)).accepted).toEqual([]);
  });

  test('popover display: a box below the caret, announced politely, accepted by Tab or a press', async ({ page }) => {
    await open(page, 'display=popover');
    await typeIn(page, 'Looking');
    await expect(ghost(page)).toHaveAttribute('data-suggestion-display', 'popover');
    await expect(ghost(page)).toHaveText(' forward to hearing from you');
    await expect(live(page)).toHaveText(' forward to hearing from you');
    await expect(live(page)).toHaveAttribute('aria-live', 'polite');
    const style = await ghost(page).evaluate((el) => getComputedStyle(el));
    expect(style.borderTopStyle).toBe('solid');
    expect(style.pointerEvents).toBe('auto');
    await ghost(page).click();
    await expect(message(page)).toBeFocused();
    await expect(message(page)).toHaveValue('Looking forward to hearing from you');
    await expect(live(page)).toHaveText('');
    await page.keyboard.type('. Kind');
    await expect(ghost(page)).toHaveText(' regards');
    await page.keyboard.press('Tab');
    await expect(message(page)).toHaveValue('Looking forward to hearing from you. Kind regards');
  });

  test('auto display follows the pointer media query: inline on fine pointers, popover on coarse pointers', async ({ page, browser }) => {
    await open(page);
    await typeIn(page, 'Thank');
    await expect(ghost(page)).toHaveAttribute('data-suggestion-display', 'auto');
    expect(await ghost(page).evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('none');
    await expect(live(page)).toHaveText('');

    const touch = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const mobile = await touch.newPage();
    await mobile.goto(url());
    expect(await mobile.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await message(mobile).tap();
    await mobile.keyboard.type('Thank');
    await expect(ghost(mobile)).toHaveText(' you for your message');
    expect(await ghost(mobile).evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
    await expect(live(mobile)).toHaveText(' you for your message');
    await ghost(mobile).tap();
    await expect(message(mobile)).toHaveValue('Thank you for your message');
    await touch.close();
  });

  test('each keystroke aborts the request in flight; only the latest answer shows', async ({ page }) => {
    await open(page, 'slow&delay=0');
    await message(page).click();
    await page.keyboard.type('Kin', { delay: 30 });
    await page.keyboard.type('d');
    await expect(ghost(page)).toHaveText(' regards');
    const result = await log(page);
    expect(result.aborted).toBeGreaterThanOrEqual(2);
    expect(result.requests.at(-1)).toBe('Kind');
    expect(result.shown).toEqual([' regards']);
    // A caret move dismisses and drops a pending answer.
    await page.keyboard.type(' ');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(400);
    await expect(ghost(page)).toBeHidden();
  });

  test('suggestDelay waits for idle typing; onBeforeSuggestionShow preventDefault hides the suggestion', async ({ page }) => {
    await open(page, 'veto&delay=200');
    await message(page).click();
    await page.keyboard.type('Kind', { delay: 40 });
    await expect.poll(async () => (await log(page)).requests).toEqual(['Kind']);
    await page.waitForTimeout(100);
    await expect(ghost(page)).toBeHidden();
    expect((await log(page)).shown).toEqual([]);
    // Other phrases still show.
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Thank');
    await expect(ghost(page)).toHaveText(' you for your message');
  });

  test('controlled value and FormData see the accepted text; the pending suggestion is never part of the value', async ({ page }) => {
    await open(page, 'controlled&display=inline');
    await typeIn(page, 'Thank');
    await expect(ghost(page)).toBeVisible();
    const pendingData = await page.evaluate(() => new FormData(document.getElementById('suggest-form') as HTMLFormElement).get('message'));
    expect(pendingData).toBe('Thank');
    await page.keyboard.press('Tab');
    await expect(page.locator('#controlled-value')).toHaveText('Thank you for your message');
    const data = await page.evaluate(() => new FormData(document.getElementById('suggest-form') as HTMLFormElement).get('message'));
    expect(data).toBe('Thank you for your message');
  });

  for (const display of ['inline', 'popover']) {
    test(`axe: no violations with a visible ${display} suggestion and the smart paste form`, async ({ page }) => {
      await open(page, `display=${display}`);
      await typeIn(page, 'Thank');
      await expect(ghost(page)).toBeVisible();
      await expectClean(page, `suggest ${display}`);
    });
  }

  test('server markup hydrates without warnings and the suggestion attaches after hydration', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'hydrate&display=inline');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __hydrated?: boolean }).__hydrated)).toBe(true);
    await typeIn(page, 'Thank');
    await expect(ghost(page)).toHaveText(' you for your message');
    expect(problems).toEqual([]);
  });
});

const PASTE = ['name: Ada Lovelace', 'email: ada@example.com', 'notes: Call after 5pm', 'country: Malaysia', 'plan: Pro', 'news: yes', 'password: hunter2', 'secret: 42'].join('\n');
const state = async (page: Page): Promise<Record<string, unknown>> => JSON.parse((await page.locator('#paste-state').textContent())!);

test.describe('useSmartPaste', () => {
  test('describes the fields and fills React-controlled inputs, select, radio and checkbox', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await page.evaluate((text) => (window as unknown as { __paste(t: string): void }).__paste(text), PASTE);
    await expect.poll(async () => (await log(page)).results.length).toBe(1);
    expect(await state(page)).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com', notes: 'Call after 5pm', country: 'my', plan: 'pro', news: true, secret: '' });
    await expect(page.locator('input[name="password"]')).toHaveValue('');
    const { pasteRequests, results } = await log(page);
    expect(pasteRequests[0]!.clipboardText).toBe(PASTE);
    const fields = pasteRequests[0]!.fields;
    expect(fields.map((f) => f.name)).toEqual(['name', 'email', 'notes', 'country', 'plan', 'news']);
    expect(fields.find((f) => f.name === 'name')).toEqual({ name: 'name', type: 'text', label: 'Full name' });
    expect(fields.find((f) => f.name === 'notes')).toMatchObject({ type: 'textarea', label: 'Notes', description: 'Anything else the customer said' });
    expect(fields.find((f) => f.name === 'country')).toEqual({ name: 'country', type: 'select', label: 'Country', options: ['nl', 'my'] });
    expect(fields.find((f) => f.name === 'plan')).toMatchObject({ type: 'radio', label: 'Plan', options: ['free', 'pro'] });
    expect(results[0]).toEqual({ filled: ['name', 'email', 'notes', 'country', 'plan', 'news'], skipped: [] });
    expect(problems).toEqual([]);
  });

  test('a Button reads the clipboard on click and is aria-busy while pending', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, 'pasteDelay=300');
    await page.evaluate((text) => navigator.clipboard.writeText(text), 'name: Grace Hopper\nplan: pro');
    const button = page.locator('#smart-paste');
    await expect(button).not.toHaveAttribute('aria-busy', 'true');
    await button.click();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect.poll(async () => (await state(page))['name']).toBe('Grace Hopper');
    await expect(button).not.toHaveAttribute('aria-busy', 'true');
    expect((await state(page))['plan']).toBe('pro');
    expect((await log(page)).results[0]!.filled).toEqual(['name', 'plan']);
  });

  test('a new paste aborts the one in flight; unmount aborts too', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'pasteDelay=300');
    const paste = (text: string) => page.evaluate((t) => (window as unknown as { __paste(t: string): void }).__paste(t), text);
    await paste('name: First');
    await expect.poll(async () => (await log(page)).pasteRequests.length).toBe(1);
    await paste('name: Second');
    await expect.poll(async () => (await state(page))['name']).toBe('Second');
    let result = await log(page);
    expect(result.pasteAborted).toBe(1);
    expect(result.errors).toEqual(['AbortError']);
    expect(result.results).toHaveLength(1);
    await paste('name: Third');
    await expect.poll(async () => (await log(page)).pasteRequests.length).toBe(3);
    await page.locator('#unmount').click();
    await expect.poll(async () => (await log(page)).pasteAborted).toBe(2);
    result = await log(page);
    expect(result.errors).toEqual(['AbortError', 'AbortError']);
    expect(problems).toEqual([]);
  });
});
