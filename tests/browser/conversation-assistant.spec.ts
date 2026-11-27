import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Conversation, assistant variant (page:
// examples/vite-spa/src/assistant.tsx, a fake adapter: no provider, no
// network). ARIA and axe checks are in conversation-assistant-a11y.spec.ts.

interface Log {
  sends: string[];
  requests: { text: string; history: number; attachments: number }[];
  changes: string[];
  actions: string[];
  stops: number;
  errors: string[];
  reasoning: boolean[];
  content: boolean[];
  values: string[];
  aborted: number;
  lastMessages: { id: string; author: string; text: string; status?: string; parts?: unknown[]; alternatives?: string[]; feedback?: string; mentions?: string[]; attachments?: { name: string }[] }[];
}

const composer = (page: Page) => page.locator('.salmon-conversation-composer__input');
const articles = (page: Page) => page.locator('.salmon-conversation-feed > article');
const responses = (page: Page) => page.locator('.salmon-conversation-item[data-role="response"]');
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __assistant: Log }).__assistant);

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${DEV_URL}assistant.html${query ? `?${query}` : ''}`);
  await expect(page.locator('.salmon-conversation[data-variant="assistant"]')).toBeVisible();
  // Items render from the lazy assistant chunk; until it arrives the history articles are empty.
  await expect(articles(page).filter({ hasNot: page.locator('.salmon-conversation-item') })).toHaveCount(0);
  return problems;
}

async function ask(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await composer(page).press('Enter');
}

test.describe('Conversation assistant variant', () => {
  test('the banner shows while empty; a prompt and its response are two records keyed by id', async ({ page }) => {
    const problems = await open(page);
    await expect(page.locator('.banner')).toHaveText('How can I help you today?');
    await ask(page, 'hello stream:3');
    await expect(responses(page).last()).toContainText('w1 w2');
    await expect(page.locator('.banner')).toHaveCount(0);
    const l = await log(page);
    expect(l.lastMessages.map((m) => m.author)).toEqual(['user', 'assistant']);
    expect(new Set(l.lastMessages.map((m) => m.id)).size).toBe(2);
    expect(l.lastMessages[1]).not.toHaveProperty('status');
    expect(l.requests[0]).toEqual({ text: 'hello stream:3', history: 1, attachments: 0 });
    expect(problems).toEqual([]);
  });

  test('controlled composer value and the clear button', async ({ page }) => {
    await open(page, 'controlled');
    const clear = page.locator('.salmon-conversation-composer__clear');
    await expect(clear).toBeHidden();
    await composer(page).fill('draft');
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(composer(page)).toHaveValue('');
    await expect(composer(page)).toBeFocused();
    expect((await log(page)).values.at(-1)).toBe('');
  });

  test('a Promise adapter is one final response; api.send runs onSend and the adapter', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as { __api: { send(text: string): void } }).__api.send('promise please'));
    await expect(responses(page).last()).toHaveText(/Answer to promise please/);
    const l = await log(page);
    expect(l.sends).toEqual(['promise please']);
    expect(l.changes).toEqual(['send', 'response']);
  });

  test('streaming publishes once per frame and commits the response once; only the streaming item renders', async ({ page }) => {
    await open(page, 'history');
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number; __mutations: number };
      w.__frames = 0;
      w.__mutations = 0;
      const tick = () => {
        w.__frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const first = document.querySelector('.salmon-conversation-feed > article');
      new MutationObserver((records) => (w.__mutations += records.length)).observe(first as Node, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    await ask(page, 'slow stream:12');
    // Count from the first streamed chunk: sending moves the feed's tab stop once (an attribute write).
    await expect(responses(page).last()).toContainText('w0');
    await page.evaluate(() => ((window as unknown as { __mutations: number }).__mutations = 0));
    await expect(responses(page).last()).toContainText('w11');
    const l = await log(page);
    expect(l.changes.filter((c) => c === 'response')).toHaveLength(1);
    const mutations = await page.evaluate(() => (window as unknown as { __mutations: number }).__mutations);
    expect(mutations, 'the earlier article is not re-rendered while streaming').toBe(0);
    // The text parts and strings joined, with the leading text part's markup kept as text (no Markdown renderer).
    expect(l.lastMessages.at(-1)?.text).toBe('**w0** w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 ');
  });

  test('Stop aborts the adapter, keeps the partial response and fires onStop', async ({ page }) => {
    await open(page);
    await ask(page, 'slow stream:40');
    const stop = page.locator('.salmon-conversation-composer__stop');
    await expect(stop).toBeVisible();
    await expect(responses(page).last()).toContainText('w1');
    await stop.click();
    await expect(page.locator('.salmon-conversation-composer__send')).toBeVisible();
    const l = await log(page);
    expect(l.stops).toBe(1);
    expect(l.aborted).toBe(1);
    const last = l.lastMessages.at(-1);
    expect(last?.text).toMatch(/^\*\*w0\*\* w1/);
    expect(last?.text).not.toContain('w39');
    await expect(composer(page)).toBeFocused();
  });

  test('the pending response shows the skeleton with aria-busy until the first chunk', async ({ page }) => {
    await open(page);
    await ask(page, 'wait stream:2');
    const pending = page.locator('.salmon-conversation-pending');
    await expect(pending).toBeVisible();
    await expect(page.locator('article[aria-busy="true"]')).toHaveCount(1);
    await expect(pending).toBeHidden();
    await expect(page.locator('article[aria-busy="true"]')).toHaveCount(0);
    await expect(pending).toHaveCount(0);
  });

  test('prompt suggestions send their text', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Summarize this page' }).click();
    await expect(responses(page)).toHaveCount(1);
    expect((await log(page)).sends).toEqual(['Summarize this page']);
  });

  test('reasoning streams into a collapsed disclosure, tools show their status; both are committed as parts', async ({ page }) => {
    await open(page);
    await ask(page, 'slow parts stream:2');
    const reasoning = page.locator('details.salmon-conversation-reasoning:not([data-tool])');
    await expect(reasoning).toHaveCount(1);
    await expect(page.locator('details[data-tool="weather"] summary')).toHaveText(/weather: (running|done)/);
    await expect(page.locator('details[data-tool="weather"] summary')).toHaveText('weather: done');
    await expect(responses(page).last()).toContainText('w1');
    expect(await reasoning.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    await reasoning.locator('summary').click();
    await expect(reasoning.locator('div')).toBeVisible();
    await expect(reasoning.locator('div')).toHaveText('Looking up the weather');
    await expect.poll(async () => (await log(page)).reasoning).toEqual([true]);
    const l = await log(page);
    expect(l.lastMessages.at(-1)?.parts).toEqual([
      { type: 'reasoning', delta: 'Looking up the weather' },
      { type: 'tool', id: 'w1', name: 'weather', input: { city: 'Oslo' }, output: { celsius: 3 }, status: 'done' },
    ]);
  });

  test('renderTool replaces the default tool summary by tool name', async ({ page }) => {
    await open(page, 'tools');
    await ask(page, 'parts stream:1');
    await expect(page.locator('output.weather')).toHaveText('3 °C');
    await expect(page.locator('details[data-tool]')).toHaveCount(0);
  });

  test('regenerate keeps the previous response as an alternative; previous / next and feedback', async ({ page }) => {
    await open(page);
    await ask(page, 'stream:2');
    await expect(responses(page).last()).toContainText('w1');
    const response = responses(page).last();
    await response.hover();
    await response.getByRole('button', { name: 'Regenerate' }).click();
    await expect(page.locator('.salmon-conversation-alternatives')).toHaveAttribute('aria-label', '2 of 2');
    let l = await log(page);
    expect(l.changes).toContain('regenerate');
    expect(l.requests.map((r) => r.history)).toEqual([1, 1]);
    expect(l.lastMessages.at(-1)?.alternatives).toEqual(['**w0** w1 ']);
    await page.getByRole('button', { name: 'Previous response' }).click();
    await expect(page.locator('.salmon-conversation-alternatives')).toHaveAttribute('aria-label', '1 of 2');
    await expect(page.getByRole('button', { name: 'Previous response' })).toBeDisabled();
    await page.getByRole('button', { name: 'Next response' }).click();
    await expect(page.locator('.salmon-conversation-alternatives')).toHaveAttribute('aria-label', '2 of 2');

    const helpful = response.getByRole('button', { name: 'Helpful', exact: true });
    await helpful.click();
    await expect(helpful).toHaveAttribute('aria-pressed', 'true');
    await response.getByRole('button', { name: 'Not helpful' }).click();
    await expect(helpful).toHaveAttribute('aria-pressed', 'false');
    await expect(response.getByRole('button', { name: 'Not helpful' })).toHaveAttribute('aria-pressed', 'true');
    l = await log(page);
    expect(l.lastMessages.at(-1)?.feedback).toBe('negative');
    expect(l.actions.filter((a) => a.startsWith('feedback'))).toHaveLength(2);
    expect(l.actions.at(-1)).toMatch(/^feedback:negative:/);
  });

  test('response toolbar: copy, regenerate and feedback; prompt toolbar: edit and copy; arrow keys rove', async ({ page }) => {
    await open(page);
    await ask(page, 'stream:2');
    await expect(responses(page).last()).toContainText('w1');
    const prompt = page.locator('.salmon-conversation-item[data-role="prompt"]');
    const promptBar = prompt.getByRole('toolbar');
    await expect(promptBar.getByRole('button')).toHaveText(['', '']);
    expect(await promptBar.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('data-action')))).toEqual(['edit', 'copy']);
    const responseBar = responses(page).last().getByRole('toolbar');
    expect(await responseBar.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('data-action')))).toEqual(['copy', 'regenerate', 'positive', 'negative']);
    await page.locator('.salmon-conversation-feed > article').last().focus();
    await page.keyboard.press('Tab');
    await expect(responseBar.locator('[data-action="copy"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(responseBar.locator('[data-action="regenerate"]')).toBeFocused();
    await page.keyboard.press('End');
    await expect(responseBar.locator('[data-action="negative"]')).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    expect((await log(page)).actions.at(-1)).toMatch(/^copy:/);
    // Edit copies the prompt into the composer through the native input path.
    await prompt.hover();
    await prompt.locator('[data-action="edit"]').click();
    await expect(composer(page)).toHaveValue('stream:2');
    expect((await log(page)).values.at(-1)).toBe('stream:2');
  });

  test('mentions and attachments work in the assistant composer', async ({ page }) => {
    await open(page);
    // Mention is a lazy chunk attached after hydration.
    await page.waitForLoadState('networkidle');
    await composer(page).click();
    await page.keyboard.type('ask @Bo');
    await expect(page.locator('.salmon-mention-popup [role="option"]').first()).toBeVisible();
    await page.keyboard.press('Enter');
    await page.keyboard.type('now');
    await page.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
    await expect(page.locator('.salmon-conversation-composer__attachments')).toContainText('notes.txt');
    await composer(page).press('Enter');
    await expect(responses(page)).toHaveCount(1);
    const l = await log(page);
    expect(l.requests[0]?.attachments).toBe(1);
    expect(l.lastMessages[0]?.mentions).toEqual(['bob']);
    expect(l.lastMessages[0]?.attachments?.[0]?.name).toBe('notes.txt');
  });

  test('dictation writes the transcript after the draft through the native input path', async ({ page }) => {
    await open(page);
    const mic = page.locator('.salmon-conversation-composer__dictate');
    await expect(mic).toBeEnabled();
    await composer(page).fill('Note');
    await mic.click();
    await expect(mic).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => (window as unknown as { __speech: { say(t: string, f: boolean): void } }).__speech.say('hello', false));
    await expect(composer(page)).toHaveValue('Note hello');
    await page.evaluate(() => (window as unknown as { __speech: { say(t: string, f: boolean): void } }).__speech.say('hello world', true));
    await expect(composer(page)).toHaveValue('Note hello world');
    await mic.click();
    await expect(mic).toHaveAttribute('aria-pressed', 'false');
    expect((await log(page)).values.at(-1)).toBe('Note hello world');
  });

  test('renderContent renders streaming and final text as React nodes, never HTML', async ({ page }) => {
    await open(page, 'markdown&history');
    await expect(page.locator('.salmon-conversation-item[data-role="prompt"]').first()).toContainText('Hello <b>there</b>');
    await ask(page, 'slow stream:4');
    await expect(responses(page).last().locator('strong')).toHaveText('w0');
    await expect(responses(page).last()).toContainText('w3');
    const l = await log(page);
    expect(l.content).toContain(true);
    expect(l.content.at(-1)).toBe(false);
    expect(await page.locator('b').count()).toBe(0);
  });

  test('an error marks the response; Retry regenerates it with reason retry', async ({ page }) => {
    await open(page);
    await ask(page, 'fail');
    await expect(page.locator('.salmon-conversation-item[data-role="response"][data-status="error"]')).toBeVisible();
    expect((await log(page)).errors).toEqual(['model unavailable']);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('.salmon-conversation-item[data-status="error"]')).toBeVisible();
    expect((await log(page)).requests).toHaveLength(2);
    // The retry commit reports 'retry', not 'regenerate'.
    expect((await log(page)).changes).toEqual(['send', 'response', 'retry', 'response']);
  });

  test('auto-scroll follows the response; the jump button returns to it', async ({ page }) => {
    await open(page);
    for (let i = 0; i < 6; i++) {
      await ask(page, `q${i} stream:6`);
      await expect(articles(page)).toHaveCount((i + 1) * 2);
      await expect(page.locator('.salmon-conversation-composer__send')).toBeVisible();
    }
    const scroller = page.locator('.salmon-conversation-scroller');
    await expect.poll(() => scroller.evaluate((el) => -el.scrollTop)).toBeLessThanOrEqual(4);
    await scroller.evaluate((el) => el.scrollTo({ top: -400 }));
    await expect(page.locator('.salmon-conversation-jump')).toBeVisible();
    await page.locator('.salmon-conversation-jump').click();
    await expect.poll(() => scroller.evaluate((el) => -el.scrollTop)).toBeLessThanOrEqual(4);
  });
});
