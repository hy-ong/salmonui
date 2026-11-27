import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// InlineAssist (page:
// examples/vite-spa/src/inline-assist.tsx). ARIA and axe checks are in
// inline-assist-a11y.spec.ts (also run by `npm run test:a11y`).

interface Log {
  open: string[];
  sends: { prompt: string; command?: string; selection: string; history: number }[];
  accepts: string[];
  discards: string[];
  actions: string[];
  commands: string[];
  messages: { reason: string; items: { id: string; prompt: string; response: string; status: string; command?: string }[] }[];
  values: string[];
  errors: string[];
  aborted: number;
  renders: number;
}

const url = (query = ''): string => `${DEV_URL}inline-assist.html${query ? `?${query}` : ''}`;
const dialog = (page: Page) => page.locator('.salmon-inline-assist');
const prompt = (page: Page) => page.getByRole('textbox', { name: 'Prompt' });
const response = (page: Page) => page.locator('.salmon-inline-assist__response');
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __ia: Log }).__ia);

/** Selects "quick brown" in the editor. */
async function selectWords(page: Page): Promise<void> {
  await page.evaluate(() => {
    const text = document.getElementById('editor')!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 15);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

async function open(page: Page, query = '', select = true): Promise<void> {
  await page.goto(url(query));
  await expect(page.locator('#editor')).toBeVisible();
  if (select) await selectWords(page);
  await page.locator('#ask').click();
  await expect(dialog(page)).toBeVisible();
}

async function ask(page: Page, text: string): Promise<void> {
  await prompt(page).fill(text);
  await prompt(page).press('Enter');
}

const finished = (page: Page) => expect(response(page)).toHaveAttribute('data-status', 'done');

test.describe('InlineAssist', () => {
  test('opens next to the selection in the top layer; focus moves in and returns to the editor on Escape', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(url());
    await selectWords(page);
    const range = await page.evaluate(() => getSelection()!.getRangeAt(0).getBoundingClientRect().toJSON() as DOMRect);
    await page.locator('#ask').click();
    await expect(dialog(page)).toHaveAttribute('data-mode', 'popover');
    expect(await dialog(page).evaluate((el) => el.matches(':popover-open'))).toBe(true);
    await expect(prompt(page)).toBeFocused();
    const box = (await dialog(page).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(range.bottom);
    expect(box.y - range.bottom).toBeLessThan(10);
    expect(Math.abs(box.x - range.left)).toBeLessThan(1);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('#editor')).toBeFocused();
    expect((await log(page)).open).toEqual(['false:escape']);
    expect(problems).toEqual([]);
  });

  test('a point anchor; an outside press closes', async ({ page }) => {
    await open(page, 'anchor=point', false);
    const box = (await dialog(page).boundingBox())!;
    expect(Math.round(box.x)).toBe(200);
    expect(Math.round(box.y)).toBe(306);
    await page.locator('h1').click();
    await expect(dialog(page)).toHaveCount(0);
    expect((await log(page)).open).toEqual(['false:outside']);
  });

  test('inline mode renders in the page flow and closes on Escape only', async ({ page }) => {
    await open(page, 'mode=inline');
    await expect(dialog(page)).toHaveAttribute('data-mode', 'inline');
    expect(await dialog(page).evaluate((el) => el.hasAttribute('popover') || el.parentElement !== document.querySelector('main'))).toBe(false);
    expect(await dialog(page).evaluate((el) => el.previousElementSibling?.id)).toBe('editor');
    await expect(prompt(page)).toBeFocused();
    await page.locator('h1').click();
    await expect(dialog(page)).toBeVisible();
    await prompt(page).focus();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    expect((await log(page)).open).toEqual(['false:escape']);
  });

  test('controlled prompt value, placeholder and the message history', async ({ page }) => {
    await open(page, 'controlled');
    await expect(prompt(page)).toHaveAttribute('placeholder', 'Ask AI to edit or write');
    await prompt(page).pressSequentially('Hi');
    expect((await log(page)).values).toEqual(['H', 'Hi']);
    await prompt(page).press('Enter');
    await expect(prompt(page)).toHaveValue('');
    await finished(page);
    await ask(page, 'Again');
    await finished(page);
    const l = await log(page);
    expect(l.messages.map((m) => [m.reason, m.items.map((i) => i.prompt)])).toEqual([
      ['response', ['Hi']],
      ['response', ['Hi', 'Again']],
    ]);
    expect(l.sends.map((s) => s.history)).toEqual([0, 1]);
  });

  test('the request carries the selection; onBeforeSend keeps a vetoed prompt; api.send', async ({ page }) => {
    await open(page, 'veto');
    await ask(page, 'please veto');
    await expect(prompt(page)).toHaveValue('please veto');
    expect((await log(page)).sends).toEqual([]);
    await ask(page, 'Rewrite');
    await finished(page);
    await expect(response(page)).toContainText('Reply to "Rewrite" about "quick brown".');
    await page.evaluate(() => (window as unknown as { __iaApi: { send(t: string): void } }).__iaApi.send('From the API'));
    await finished(page);
    await expect(response(page)).toContainText('Reply to "From the API"');
    expect((await log(page)).sends).toEqual([
      { prompt: 'Rewrite', selection: 'quick brown', history: 0 },
      { prompt: 'From the API', selection: 'quick brown', history: 1 },
    ]);
  });

  test('streams outside React state, commits once; Stop aborts and drops late chunks', async ({ page }) => {
    await open(page);
    // Count text mutations of the streaming node against React commits of the page.
    await ask(page, 'slow reply');
    await expect(response(page)).toHaveAttribute('aria-busy', 'true');
    const stop = dialog(page).getByRole('button', { name: 'Stop' });
    await expect(stop).toBeVisible();
    await expect(response(page)).toContainText('Reply to');
    await stop.click();
    await expect(response(page)).toHaveAttribute('data-status', 'aborted');
    const text = await response(page).locator('.salmon-inline-assist__text').textContent();
    await page.waitForTimeout(500);
    await expect(response(page).locator('.salmon-inline-assist__text')).toHaveText(text!);
    const l = await log(page);
    expect(l.aborted).toBe(1);
    expect(l.messages).toHaveLength(1);
    expect(l.messages[0]!.items[0]!.status).toBe('aborted');
    expect(l.messages[0]!.items[0]!.response).toBe(text);
    await expect(response(page)).not.toHaveAttribute('aria-busy', 'true');
    // A full stream: many chunks, one history commit, the page itself never re-renders.
    const renders = l.renders;
    await ask(page, 'fast');
    await finished(page);
    const after = await log(page);
    expect(after.messages).toHaveLength(2);
    expect(after.messages[1]!.items[1]!.status).toBe('done');
    expect(after.renders).toBe(renders);
  });

  test('a Promise adapter is one final response; an adapter error shows Retry', async ({ page }) => {
    await open(page, 'promise');
    await ask(page, 'Once');
    await finished(page);
    await expect(response(page)).toContainText('Reply to "Once"');
    await page.goto(url());
    await page.locator('#ask').click();
    await ask(page, 'fail now');
    await expect(response(page)).toHaveAttribute('data-status', 'error');
    await expect(response(page)).toContainText('The response failed.');
    expect((await log(page)).errors).toEqual(['adapter failed']);
  });

  test('slash commands: the Menu filters, keys select, onCommandSelect, api.showCommands', async ({ page }) => {
    await open(page);
    await prompt(page).pressSequentially('/');
    const menu = page.getByRole('menu', { name: 'Commands' });
    await expect(menu.getByRole('menuitem')).toHaveCount(4);
    await expect(prompt(page)).toHaveAttribute('aria-controls', (await menu.getAttribute('id'))!);
    await prompt(page).pressSequentially('tr');
    await expect(menu.getByRole('menuitem')).toHaveText(['Translate to French']);
    await prompt(page).press('Enter');
    await expect(menu).toHaveCount(0);
    await expect(prompt(page)).toHaveValue('');
    await finished(page);
    // Arrow keys move into the menu; Escape returns to the prompt and hides it.
    await prompt(page).pressSequentially('/');
    await prompt(page).press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Summarize' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
    await expect(prompt(page)).toBeFocused();
    await page.evaluate(() => (window as unknown as { __iaApi: { showCommands(): void } }).__iaApi.showCommands());
    await expect(menu.getByRole('menuitem')).toHaveCount(4);
    await expect(menu.getByRole('menuitem', { name: 'Fix grammar' })).toHaveAttribute('aria-disabled', 'true');
    await menu.getByRole('menuitem', { name: 'Summarize' }).click();
    await finished(page);
    const l = await log(page);
    expect(l.commands).toEqual(['translate', 'summarize']);
    expect(l.sends.map((s) => [s.prompt, s.command])).toEqual([
      ['Translate to French', 'translate'],
      ['Summarize the selection', 'summarize'],
    ]);
    expect(l.messages.at(-1)!.items.at(-1)!.command).toBe('summarize');
  });

  test('response actions: retry, custom, cancelled discard, accept inserts and closes', async ({ page }) => {
    await open(page, 'custom&keep');
    await ask(page, 'Draft');
    await finished(page);
    const actions = dialog(page).getByRole('group', { name: 'Response actions' });
    await expect(actions.getByRole('button')).toHaveText(['Accept', 'Discard', 'Retry', 'Shorter']);
    await actions.getByRole('button', { name: 'Retry' }).click();
    await finished(page);
    await actions.getByRole('button', { name: 'Shorter' }).click();
    await actions.getByRole('button', { name: 'Discard' }).click();
    await expect(dialog(page)).toBeVisible();
    await actions.getByRole('button', { name: 'Accept' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('#editor')).toContainText('Reply to "Draft" about "quick brown".');
    await expect(page.locator('#editor')).toBeFocused();
    const l = await log(page);
    expect(l.actions).toEqual(['retry', 'shorter', 'discard', 'accept']);
    expect(l.messages.map((m) => [m.reason, m.items.length])).toEqual([
      ['response', 1],
      ['retry', 1],
    ]);
    expect(l.accepts).toHaveLength(1);
    expect(l.discards).toEqual([]);
    expect(l.open).toEqual(['false:accept']);
    // Without the veto, Discard drops the response and closes.
    await open(page);
    await ask(page, 'Draft');
    await finished(page);
    await dialog(page).getByRole('button', { name: 'Discard' }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect((await log(page)).open).toEqual(['false:discard']);
  });

  test('toolbar slot inline and at the bottom', async ({ page }) => {
    await open(page, 'toolbar=inline');
    await expect(dialog(page).locator('.salmon-inline-assist__composer > .salmon-inline-assist__toolbar #tone')).toBeVisible();
    await open(page, 'toolbar=bottom');
    const bar = dialog(page).locator(':scope > .salmon-inline-assist__toolbar');
    await expect(bar).toHaveAttribute('data-placement', 'bottom');
    const [composer, toolbar] = await Promise.all([dialog(page).locator('.salmon-inline-assist__composer').boundingBox(), bar.boundingBox()]);
    expect(toolbar!.y).toBeGreaterThan(composer!.y + composer!.height - 1);
  });

  test('renderComposer and renderContent with streaming flag', async ({ page }) => {
    await open(page, 'composer&markdown');
    const input = dialog(page).locator('input.custom-composer');
    await expect(input).toBeFocused();
    await input.fill('**bold** slow');
    await input.press('Enter');
    await expect(dialog(page).locator('.md[data-streaming]')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Stop' }).click();
    await input.fill('**bold**');
    await input.press('Enter');
    await finished(page);
    await expect(dialog(page).locator('.md:not([data-streaming]) strong')).toHaveText('bold');
  });

  test('default content is plain text with line breaks, never HTML', async ({ page }) => {
    await open(page);
    await ask(page, '<img src=x onerror=alert(1)><b>x</b>');
    await finished(page);
    const text = response(page).locator('.salmon-inline-assist__text');
    await expect(text).toContainText('<b>x</b>');
    await expect(response(page).locator('b, img')).toHaveCount(0);
    expect(await text.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('pre-wrap');
    expect(await text.evaluate((el) => (el as HTMLElement).innerText.split('\n').length)).toBe(2);
  });

  test('prompt row: the input, Dictation and Send share the 32px md height', async ({ page }) => {
    await open(page, 'dictation');
    const boxes = await dialog(page)
      .locator('.salmon-inline-assist__composer > :is(textarea, button)')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ height: r.height, top: r.top })));
    expect(boxes.length).toBe(3);
    for (const box of boxes) {
      expect(box.height).toBe(32);
      expect(box.top).toBe(boxes[0]!.top);
    }
  });

  test('Dictation writes the transcript into the prompt', async ({ page }) => {
    await open(page, 'dictation');
    await prompt(page).fill('Rewrite');
    const mic = dialog(page).getByRole('button', { name: 'Dictate' });
    await mic.click();
    await expect(mic).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => (window as unknown as { __speech: { emit(t: string, f: boolean): void } }).__speech.emit('more', false));
    await expect(prompt(page)).toHaveValue('Rewrite more');
    await page.evaluate(() => (window as unknown as { __speech: { emit(t: string, f: boolean): void } }).__speech.emit('more formally', true));
    await expect(prompt(page)).toHaveValue('Rewrite more formally');
    await mic.click();
    await expect(mic).toHaveAttribute('aria-pressed', 'false');
  });

  test('server markup hydrates without warnings; the assist opens on the client', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(url('hydrate'));
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    await expect(dialog(page)).toHaveCount(0);
    await page.locator('#ask').click();
    await expect(dialog(page)).toBeVisible();
    await page.waitForTimeout(100);
    expect(problems).toEqual([]);
  });
});
