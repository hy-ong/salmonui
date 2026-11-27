import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Conversation, chat variant (page:
// examples/vite-spa/src/conversation.tsx). ARIA and axe checks are in
// conversation-a11y.spec.ts (also run by `npm run test:a11y`).

interface Log {
  sends: string[];
  changes: string[];
  typing: boolean[];
  actions: string[];
  attach: string[];
  removed: string[];
  errors: string[];
  mentions: string[];
  older: number;
  lastMessages: { id: string; text: string; author: string; pinned?: boolean; replyTo?: string; mentions?: string[]; attachments?: { name: string; url?: string }[] }[];
}

const url = (query = ''): string => `${DEV_URL}conversation.html${query ? `?${query}` : ''}`;
const composer = (page: Page) => page.locator('.salmon-conversation-composer__input');
const articles = (page: Page) => page.locator('.salmon-conversation-feed > article');
const scroller = (page: Page) => page.locator('.salmon-conversation-scroller');
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __chat: Log }).__chat);
const distanceFromBottom = (page: Page): Promise<number> => scroller(page).evaluate((el) => -el.scrollTop);
const lastArticle = (page: Page) => articles(page).last();

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(url(query));
  await expect(articles(page).first()).toBeVisible();
}

test.describe('Conversation', () => {
  test('starts at the latest message and virtualizes the history', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'count=2000');
    await expect(lastArticle(page)).toHaveAttribute('data-id', 'm1999');
    await expect(lastArticle(page)).toBeInViewport();
    expect(await articles(page).count()).toBeLessThanOrEqual(60);
    expect(await distanceFromBottom(page)).toBeLessThanOrEqual(4);
    expect(problems).toEqual([]);
  });

  test('Enter sends, Shift+Enter inserts a newline, onBeforeSend keeps the draft', async ({ page }) => {
    await open(page, 'veto');
    await composer(page).click();
    await page.keyboard.type('first line');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('second');
    await page.keyboard.press('Enter');
    await expect(composer(page)).toHaveValue('');
    await expect(lastArticle(page)).toContainText('first line');
    await expect(lastArticle(page).locator('.salmon-conversation-item')).toHaveAttribute('data-own', '');
    expect((await log(page)).sends).toEqual(['first line\nsecond']);
    await page.keyboard.type('please veto this');
    await page.keyboard.press('Enter');
    await expect(composer(page)).toHaveValue('please veto this');
    expect((await log(page)).sends).toHaveLength(1);
    // Empty drafts send nothing.
    await composer(page).fill('   ');
    await page.keyboard.press('Enter');
    expect((await log(page)).sends).toHaveLength(1);
  });

  test('a bot adapter streams once per frame and commits the response once', async ({ page }) => {
    await open(page, 'bot');
    await composer(page).fill('hello stream:40 slow');
    await page.keyboard.press('Enter');
    const response = lastArticle(page);
    await expect(response).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.salmon-conversation-composer__stop')).toBeVisible();
    await expect(response).toContainText('w3');
    await expect(response).not.toHaveAttribute('aria-busy', 'true', { timeout: 5000 });
    await expect(response).toContainText('w39');
    // One proposal for the message and the pending reply, one for the final reply: never per chunk.
    expect((await log(page)).changes).toEqual(['send', 'response']);
    await expect(page.locator('.salmon-conversation-composer__send')).toBeVisible();
    await expect(page.locator('.salmon-conversation > [role="status"]')).toContainText('Helper: w0 w1');
  });

  test('Stop aborts the adapter and keeps the partial reply', async ({ page }) => {
    await open(page, 'bot');
    await composer(page).fill('stream:200 slow');
    await page.keyboard.press('Enter');
    await expect(lastArticle(page)).toContainText('w2');
    await page.locator('.salmon-conversation-composer__stop').click();
    await expect(lastArticle(page)).not.toHaveAttribute('aria-busy', 'true');
    const text = (await lastArticle(page).locator('.salmon-conversation-item__bubble').textContent()) ?? '';
    expect(text).toMatch(/^w0 w1 w2/);
    expect(text).not.toContain('w199');
  });

  test('typing reports one start and one stop per burst', async ({ page }) => {
    await open(page);
    await composer(page).click();
    await page.keyboard.type('abc', { delay: 20 });
    await expect.poll(async () => (await log(page)).typing).toEqual([true, false]);
    await page.keyboard.type('d');
    await page.keyboard.press('Enter');
    expect((await log(page)).typing).toEqual([true, false, true, false]);
  });

  test('typing indicator renders and is announced once', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as { __typing: (ids: string[]) => void }).__typing(['bob', 'cy']));
    await expect(page.locator('.salmon-conversation-typing')).toContainText('Bob Stone and Cy Young are typing');
    await expect(page.locator('.salmon-conversation > [role="status"]')).toHaveText('Bob Stone and Cy Young are typing');
  });

  test('item actions: toolbar keys, reply, pin and delete', async ({ page }) => {
    await open(page);
    const last = lastArticle(page);
    const id = await last.getAttribute('data-id');
    await last.focus();
    await page.keyboard.press('Tab');
    const copy = last.locator('[data-action="copy"]');
    await expect(copy).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(last.locator('[data-action="reply"]')).toBeFocused();
    await page.keyboard.press('End');
    await expect(last.locator('[data-action="delete"]')).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    expect((await log(page)).actions).toEqual([`copy:${id}`]);
    // Reply: the composer shows the target; the sent message carries replyTo; Escape cancels.
    await last.locator('[data-action="reply"]').click();
    await expect(composer(page)).toBeFocused();
    await expect(page.locator('.salmon-conversation-composer__reply')).toContainText('Replying to');
    await page.keyboard.press('Escape');
    await expect(page.locator('.salmon-conversation-composer__reply')).toHaveCount(0);
    await last.locator('[data-action="reply"]').click();
    await page.keyboard.type('an answer');
    await page.keyboard.press('Enter');
    const sent = (await log(page)).lastMessages.at(-1);
    expect(sent?.replyTo).toBe(id);
    await expect(lastArticle(page).locator('.salmon-conversation-reply-preview')).toBeVisible();
    // The preview jumps to its target.
    await lastArticle(page).locator('.salmon-conversation-reply-preview').click();
    await expect(page.locator(`article[data-id="${id}"]`)).toBeFocused();
    // Pin: the pinned bar appears and jumps to the message.
    await page.locator(`article[data-id="${id}"] [data-action="pin"]`).click();
    await expect(page.locator('.salmon-conversation-pinned-bar')).toBeVisible();
    expect((await log(page)).lastMessages.find((m) => m.id === id)?.pinned).toBe(true);
    // Delete.
    await page.locator(`article[data-id="${id}"] [data-action="delete"]`).click();
    await expect(page.locator(`article[data-id="${id}"]`)).toHaveCount(0);
    expect((await log(page)).changes.slice(-2)).toEqual(['pin', 'delete']);
  });

  test('quick replies send their text', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'On my way' }).click();
    await expect(lastArticle(page)).toContainText('On my way');
    expect((await log(page)).sends).toEqual(['On my way']);
  });

  test('mentions insert through Mention and are recorded on the message', async ({ page }) => {
    await open(page, 'mentions');
    // Mention is a lazy chunk attached after hydration.
    await page.waitForLoadState('networkidle');
    await composer(page).click();
    await page.keyboard.type('Hi @Bo');
    await expect(page.locator('.salmon-mention-popup [role="option"]').first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(composer(page)).toHaveValue('Hi @Bob Stone ');
    expect((await log(page)).sends).toEqual([]);
    await page.keyboard.press('Enter');
    const sent = (await log(page)).lastMessages.at(-1);
    expect(sent?.mentions).toEqual(['bob']);
    expect((await log(page)).mentions).toEqual(['bob']);
    await expect(lastArticle(page).locator('.salmon-conversation-mention')).toHaveText('@Bob Stone');
  });

  test('attachments: picker, limits, upload transport, remove and send', async ({ page }) => {
    await open(page, 'attachments');
    const input = page.locator('.salmon-conversation-composer input[type="file"]');
    await input.setInputFiles([
      { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') },
      { name: 'big.txt', mimeType: 'text/plain', buffer: Buffer.alloc(4096) },
      { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('b') },
      { name: 'c.txt', mimeType: 'text/plain', buffer: Buffer.from('c') },
    ]);
    const chips = page.locator('.salmon-conversation-composer__attachments .salmon-conversation-attachment');
    await expect(chips).toHaveCount(2);
    expect((await log(page)).errors).toEqual(['size:big.txt', 'count:c.txt']);
    await expect(chips.filter({ has: page.locator('progress') })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove b.txt' }).click();
    await expect(chips).toHaveCount(1);
    expect((await log(page)).removed).toEqual(['b.txt']);
    await composer(page).fill('see file');
    await page.keyboard.press('Enter');
    const sent = (await log(page)).lastMessages.at(-1);
    expect(sent?.attachments?.map((a) => [a.name, a.url])).toEqual([['a.txt', 'https://files.example/a.txt']]);
    await expect(lastArticle(page).locator('a.salmon-conversation-attachment')).toHaveAttribute('href', 'https://files.example/a.txt');
  });

  test('renderAttachment replaces the sent attachment chip and keeps the roving tab stop', async ({ page }) => {
    await open(page, 'attachments&customAttachment');
    await page.locator('.salmon-conversation-composer input[type="file"]').setInputFiles([{ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') }]);
    // The pending chip stays the default one: `renderAttachment` is for sent attachments.
    await expect(page.locator('.salmon-conversation-composer__attachments .salmon-conversation-attachment')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Remove a.txt' })).toBeVisible();
    await expect.poll(async () => page.locator('.salmon-conversation-composer__attachments progress').count()).toBe(0);
    await composer(page).fill('custom');
    await page.keyboard.press('Enter');
    const custom = lastArticle(page).locator('a.custom-attachment');
    await expect(custom).toHaveText('Open a.txt');
    await expect(custom).toHaveAttribute('href', 'https://files.example/a.txt');
    const id = await lastArticle(page).getAttribute('data-id');
    await expect(custom).toHaveAttribute('data-message', id!);
    await expect(lastArticle(page).locator('.salmon-conversation-attachment')).toHaveCount(0);
    // The tab index follows the item's roving tab stop.
    const tabbable = await lastArticle(page).getAttribute('tabindex');
    await expect(custom).toHaveAttribute('tabindex', tabbable === '0' ? '0' : '-1');
  });

  test('loading older history keeps the visible message in place', async ({ page }) => {
    await open(page, 'older&count=30');
    await expect(articles(page).first()).toBeAttached();
    expect((await log(page)).older).toBe(0);
    // Record aria-busy on the feed while older history loads.
    await page.evaluate(() => {
      const feed = document.querySelector('.salmon-conversation-feed')!;
      const w = window as unknown as { __busy: boolean };
      w.__busy = false;
      new MutationObserver(() => {
        if (feed.getAttribute('aria-busy') === 'true') w.__busy = true;
      }).observe(feed, { attributes: true });
    });
    // Scroll near the top: older messages load and are prepended.
    await scroller(page).evaluate((el) => {
      el.scrollTop = -(el.scrollHeight - el.clientHeight) + 200;
    });
    const anchor = page.locator('article[data-id="m200"]');
    const before = await anchor.boundingBox();
    await expect.poll(async () => (await log(page)).older).toBeGreaterThanOrEqual(1);
    await expect(page.locator('article[data-id="m199"]')).toBeAttached();
    await page.waitForTimeout(100);
    const after = await anchor.boundingBox();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => (window as unknown as { __busy: boolean }).__busy)).toBe(true);
    await expect(page.locator('.salmon-conversation-feed')).not.toHaveAttribute('aria-busy', 'true');
    await expect(articles(page).first()).toHaveAttribute('aria-setsize', '-1');
  });

  test('auto-scroll: stays at the bottom, else counts unread and shows the jump button', async ({ page }) => {
    await open(page, 'count=200&controlled');
    await page.evaluate(() => (window as unknown as { __push: (t: string) => void }).__push('incoming 1'));
    await expect(lastArticle(page)).toContainText('incoming 1');
    await expect(lastArticle(page)).toBeInViewport();
    await expect(page.locator('.salmon-conversation > [role="status"]')).toHaveText('Bob Stone: incoming 1');
    // Scroll up: new messages do not move the view and count as unread.
    await scroller(page).evaluate((el) => {
      el.scrollTop = -1500;
    });
    const jump = page.locator('.salmon-conversation-jump');
    await expect(jump).toBeVisible();
    const visible = articles(page).filter({ hasText: 'Message' });
    const probe = await page.evaluate(() => {
      const s = document.querySelector('.salmon-conversation-scroller')!.getBoundingClientRect();
      const a = [...document.querySelectorAll('article')].find((el) => el.getBoundingClientRect().top >= s.top)!;
      return { id: a.getAttribute('data-id'), top: a.getBoundingClientRect().top };
    });
    await page.evaluate(() => (window as unknown as { __push: (t: string) => void }).__push('incoming 2'));
    await page.evaluate(() => (window as unknown as { __push: (t: string) => void }).__push('incoming 3'));
    await expect(jump).toContainText('2');
    await expect(jump).toHaveAttribute('aria-label', 'Jump to latest, 2 new messages');
    const top = await page.locator(`article[data-id="${probe.id}"]`).evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top - probe.top)).toBeLessThanOrEqual(1);
    expect(await visible.count()).toBeGreaterThan(0);
    await jump.click();
    await expect(lastArticle(page)).toContainText('incoming 3');
    await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(4);
    await expect(jump).toHaveCount(0);
  });

  test('api.scrollToMessage reaches virtualized items; api.focus focuses the composer', async ({ page }) => {
    await open(page, 'count=2000');
    await expect(page.locator('article[data-id="m10"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __chatApi: { scrollToMessage(id: string, o?: { focus?: boolean }): boolean } }).__chatApi.scrollToMessage('m10', { focus: true }))).toBe(true);
    const target = page.locator('article[data-id="m10"]');
    await expect(target).toBeInViewport();
    await expect(target).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { __chatApi: { scrollToMessage(id: string): boolean } }).__chatApi.scrollToMessage('nope'))).toBe(false);
    await page.evaluate(() => (window as unknown as { __chatApi: { focus(): void } }).__chatApi.focus());
    await expect(composer(page)).toBeFocused();
    await page.evaluate(() => (window as unknown as { __chatApi: { scrollToBottom(): void } }).__chatApi.scrollToBottom());
    await expect(lastArticle(page)).toHaveAttribute('data-id', 'm1999');
    await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(4);
  });

  test('feed keys: Page Up / Page Down move between articles, Ctrl+Home / Ctrl+End leave the feed', async ({ page }) => {
    await open(page, 'count=100');
    await lastArticle(page).focus();
    await expect(page.locator('article[data-id="m99"]')).toBeFocused();
    await page.keyboard.press('PageUp');
    await expect(page.locator('article[data-id="m98"]')).toBeFocused();
    await page.keyboard.press('PageUp');
    await page.keyboard.press('PageDown');
    await expect(page.locator('article[data-id="m98"]')).toBeFocused();
    await expect(page.locator('article[data-id="m98"]')).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('Control+End');
    await expect(page.locator('.salmon-conversation-composer__input, .salmon-conversation-suggestion').first()).toBeFocused();
    await page.locator('article[data-id="m98"]').focus();
    await page.keyboard.press('Control+Home');
    await expect(page.locator('#call')).toBeFocused();
    // Header toolbar: one tab stop, arrows move.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#info')).toBeFocused();
  });

  test('composer row: input and icon buttons share the 32px md height; item actions take no inline space', async ({ page }) => {
    await open(page, 'attachments&count=6');
    const boxes = await page.locator('.salmon-conversation-composer__row > :is(button, textarea)').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, width: r.width, height: r.height, top: r.top };
      }),
    );
    expect(boxes.map((b) => b.tag)).toEqual(['BUTTON', 'TEXTAREA', 'BUTTON']);
    for (const box of boxes) {
      expect(box.height).toBe(32);
      expect(box.top).toBe(boxes[1]!.top);
      if (box.tag === 'BUTTON') expect(box.width).toBe(32);
    }
    // The hover toolbar floats over the item, so it never narrows the bubble column.
    const position = await page.locator('.salmon-conversation-item-actions').first().evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('absolute');
  });

  test('RTL mirrors own items to the inline end', async ({ page }) => {
    await open(page, 'dir=rtl&count=6');
    const own = page.locator('.salmon-conversation-item[data-own]').last();
    const other = page.locator('.salmon-conversation-item:not([data-own])').last();
    const ownBox = (await own.locator('.salmon-conversation-item__bubble').boundingBox())!;
    const otherBox = (await other.locator('.salmon-conversation-item__bubble').boundingBox())!;
    expect(ownBox.x).toBeLessThan(otherBox.x);
  });

  test('server markup hydrates without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(url('hydrate&count=50&separators'));
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    await expect(lastArticle(page)).toBeVisible();
    await page.waitForTimeout(200);
    expect(problems).toEqual([]);
  });
});
