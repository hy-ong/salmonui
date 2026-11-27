import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Mention over <textarea> and <input>
// (page: examples/vite-spa/src/mention.tsx). ARIA and axe checks are
// in mention-a11y.spec.ts (also run by `npm run test:a11y`).

interface Log {
  inserts: { text: string; trigger: string; source: string }[];
  opens: { open: boolean; reason: string }[];
  searches: string[];
  before: number;
  reads: string[];
  aborted: number;
  value: string;
}

const url = (query = ''): string => `${DEV_URL}mention.html${query ? `?${query}` : ''}`;
const field = (page: Page) => page.locator('#field');
const popup = (page: Page) => page.locator('.salmon-mention-popup');
const options = (page: Page) => page.locator('.salmon-mention-popup [role="option"]');
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __mention: Log }).__mention);

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(url(query));
  await field(page).click();
}

test.describe('Mention', () => {
  test('wraps a textarea: typing the trigger opens a listbox at the caret', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await expect(page.locator('.salmon-mention.demo-mention')).toHaveCount(1);
    await page.keyboard.type('Hi @');
    await expect(popup(page)).toBeVisible();
    await expect(popup(page)).toHaveClass(/demo-popup/);
    await expect(options(page)).toHaveCount(6);
    await page.keyboard.type('al');
    // Contains, case-insensitive: Alice Smith, Malik Ali.
    await expect(options(page)).toHaveText(['Alice Smith', 'Malik Ali']);
    expect((await log(page)).searches).toEqual(['@', '@a', '@al']);
    expect(problems).toEqual([]);
  });

  test('a second trigger character uses its own data', async ({ page }) => {
    await open(page);
    await page.keyboard.type('see #');
    await expect(options(page)).toHaveText(['bug', 'docs', 'performance']);
    await page.keyboard.type('do');
    await page.keyboard.press('Enter');
    // `#` keeps its char and appends a space.
    await expect(field(page)).toHaveValue('see #docs ');
    expect((await log(page)).inserts).toEqual([{ text: '#docs ', trigger: '#', source: 'keyboard' }]);
  });

  test('attaches to an <input> and through `target`', async ({ page }) => {
    await open(page, 'field=input');
    await page.keyboard.type('@bo');
    await expect(options(page)).toHaveText(['Bob Jones']);
    await page.keyboard.press('Enter');
    await expect(field(page)).toHaveValue('Bob Jones');

    await open(page, 'target');
    await page.keyboard.type('@da');
    await expect(options(page)).toHaveText(['Dave Brown']);
    await page.keyboard.press('Tab');
    await expect(field(page)).toHaveValue('Dave Brown');
  });

  test('a trigger typed before Mention mounts opens the list when it mounts, only in the focused field', async ({ page }) => {
    // A host that loads Mention lazily (RichTextEditor) mounts it after the user may have typed.
    await open(page, 'target&late');
    await page.keyboard.type('Hi @al');
    await page.evaluate(() => (window as unknown as { __mountMention: () => void }).__mountMention());
    await expect(options(page)).toHaveText(['Alice Smith', 'Malik Ali']);
    await page.keyboard.press('Enter');
    await expect(field(page)).toHaveValue('Hi Alice Smith');
    // Not focused: existing text with a trigger before the caret stays closed on mount.
    await page.goto(url('target&late'));
    await field(page).fill('Hi @al');
    await page.locator('#after').focus();
    await page.evaluate(() => (window as unknown as { __mountMention: () => void }).__mountMention());
    // Two frames: the mount effect has run.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(popup(page)).toHaveCount(0);
    await field(page).focus();
    await page.keyboard.type('ic');
    await expect(options(page)).toHaveText(['Alice Smith']);
  });

  test('inserted text drops the trigger by default; keepChar and suffix', async ({ page }) => {
    await open(page);
    await page.keyboard.type('Hi @ali');
    await page.keyboard.press('Enter');
    await expect(field(page)).toHaveValue('Hi Alice Smith');
    await expect(popup(page)).toHaveCount(0);

    await open(page, 'keepChar&suffix=%20');
    await page.keyboard.type('Hi @ali');
    await page.keyboard.press('Enter');
    await expect(field(page)).toHaveValue('Hi @Alice Smith ');
    // The caret sits after the suffix.
    expect(await field(page).evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe('Hi @Alice Smith '.length);
    await page.keyboard.type('x');
    await expect(field(page)).toHaveValue('Hi @Alice Smith x');
    await expect(popup(page)).toHaveCount(0);
  });

  test('requireLeadingSpace ignores a trigger inside a word unless turned off', async ({ page }) => {
    await open(page);
    await page.keyboard.type('mail@al');
    await expect(popup(page)).toHaveCount(0);
    await open(page, 'leading=0');
    await page.keyboard.type('mail@al');
    await expect(options(page)).toHaveText(['Alice Smith', 'Malik Ali']);
  });

  test('multiWord keeps the list open across a space', async ({ page }) => {
    await open(page);
    await page.keyboard.type('@alice s');
    await expect(popup(page)).toHaveCount(0);
    await open(page, 'multiWord');
    await page.keyboard.type('@alice s');
    await expect(options(page)).toHaveText(['Alice Smith']);
    // A space after a search without matches turns it back into plain text.
    await page.keyboard.type('zz ');
    await expect(popup(page)).toHaveCount(0);
  });

  test('minSearchLength and maxResults', async ({ page }) => {
    await open(page, 'min=2');
    await page.keyboard.type('@a');
    await expect(popup(page)).toHaveCount(0);
    await page.keyboard.type('l');
    await expect(options(page)).toHaveCount(2);
    await open(page, 'max=2');
    await page.keyboard.type('@');
    await expect(options(page)).toHaveText(['Alice Smith', 'Bob Jones']);
  });

  test('highlightMatches marks the matched text', async ({ page }) => {
    await open(page, 'highlight');
    await page.keyboard.type('@eLo');
    await expect(options(page).locator('mark')).toHaveText(['Élo']);
  });

  test('the popup is placed at the caret, below the trigger line, and follows the trigger', async ({ page }) => {
    await open(page);
    const box = (await field(page).boundingBox())!;
    await page.keyboard.type('@');
    const first = (await popup(page).boundingBox())!;
    expect(Math.abs(first.x - box.x)).toBeLessThan(12);
    expect(first.y).toBeGreaterThan(box.y);
    expect(first.y).toBeLessThan(box.y + 40);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await page.keyboard.type('some words before the @');
    const second = (await popup(page).boundingBox())!;
    expect(second.x).toBeGreaterThan(first.x + 100);
    expect(second.y).toBeGreaterThan(first.y + 10);
    // Typing the search text does not move it (measured once per trigger).
    await page.keyboard.type('a');
    expect((await popup(page).boundingBox())!.x).toBe(second.x);
  });

  test('RTL: the popup aligns its inline start to the caret', async ({ page }) => {
    await open(page, 'dir=rtl');
    const box = (await field(page).boundingBox())!;
    await page.keyboard.type('@');
    await expect(popup(page)).toHaveAttribute('dir', 'rtl');
    const p = (await popup(page).boundingBox())!;
    expect(Math.abs(p.x + p.width - (box.x + box.width))).toBeLessThan(14);
  });

  test('insertion keeps the native undo history and updates a controlled field', async ({ page }) => {
    await open(page, 'controlled');
    await page.keyboard.type('Hi @bo');
    await page.keyboard.press('Enter');
    await expect(field(page)).toHaveValue('Hi Bob Jones');
    expect((await log(page)).value).toBe('Hi Bob Jones');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(field(page)).toHaveValue('Hi @bo');
  });

  for (const mode of ['uncontrolled', 'controlled'] as const) {
    test(`wraps Salmon's ${mode} TextArea: picking keeps the text before and after the mention`, async ({ page }) => {
      const problems = collectProblems(page);
      await open(page, `events&field=salmon${mode === 'controlled' ? '&controlled' : ''}&suffix=%20`);
      await page.keyboard.type('Hi @bo');
      await page.keyboard.press('Enter');
      await expect(field(page)).toHaveValue('Hi Bob Jones ');
      if (mode === 'controlled') expect((await log(page)).value).toBe('Hi Bob Jones ');
      await page.keyboard.type('and @al');
      await options(page).filter({ hasText: 'Alice Smith' }).click();
      await expect(field(page)).toHaveValue('Hi Bob Jones and Alice Smith ');
      await expect(field(page)).toBeFocused();
      await page.keyboard.type('!');
      await expect(field(page)).toHaveValue('Hi Bob Jones and Alice Smith !');
      if (mode === 'controlled') expect((await log(page)).value).toBe('Hi Bob Jones and Alice Smith !');
      expect(problems).toEqual([]);
    });
  }

  test('onBeforeInsert cancels, onInsert reports item, text and source', async ({ page }) => {
    await open(page, 'veto');
    await page.keyboard.type('@bo');
    await page.keyboard.press('Enter');
    await expect(field(page)).toHaveValue('@bo');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('al');
    await options(page).nth(1).click();
    await expect(field(page)).toHaveValue('Malik Ali');
    const l = await log(page);
    expect(l.before).toBe(2);
    expect(l.inserts).toEqual([{ text: 'Malik Ali', trigger: '@', source: 'pointer' }]);
    // Focus never left the field.
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('field');
  });

  test('keyboard: arrows skip disabled options and wrap, Enter and Tab insert, Escape closes', async ({ page }) => {
    await open(page);
    await page.keyboard.type('@');
    const active = () => page.locator('.salmon-mention-option[data-active]');
    await expect(active()).toHaveText('Alice Smith');
    await page.keyboard.press('ArrowDown');
    await expect(active()).toHaveText('Bob Jones');
    await page.keyboard.press('ArrowDown');
    // Carol is disabled.
    await expect(active()).toHaveText('Dave Brown');
    await page.keyboard.press('ArrowUp');
    await expect(active()).toHaveText('Bob Jones');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(active()).toHaveText('Malik Ali');
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    // Escape dismisses this mention: typing on does not reopen it.
    await page.keyboard.type('x');
    await expect(popup(page)).toHaveCount(0);
    await expect(field(page)).toHaveValue('@x');
    // A new trigger does.
    await page.keyboard.type(' @');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(field(page)).toHaveValue('@x Alice Smith');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('field');
    expect((await log(page)).opens.map((o) => `${o.open}:${o.reason}`)).toEqual(['true:trigger', 'false:escape', 'true:trigger', 'false:insert']);
  });

  test('closes on blur and outside press, and when the caret leaves the mention', async ({ page }) => {
    await open(page);
    await page.keyboard.type('@a');
    await expect(popup(page)).toBeVisible();
    await page.mouse.click(1200, 700);
    await expect(popup(page)).toHaveCount(0);
    await field(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type('l');
    await expect(popup(page)).toBeVisible();
    await field(page).evaluate((el) => el.blur());
    await expect(popup(page)).toHaveCount(0);
    await field(page).focus();
    await page.keyboard.type('i');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Home');
    await expect(popup(page)).toHaveCount(0);
    expect((await log(page)).opens.filter((o) => !o.open).map((o) => o.reason)).toEqual(['outside', 'blur', 'caret']);
  });

  test('IME composition: detection waits for compositionend', async ({ page }) => {
    await open(page);
    const cdp = await page.context().newCDPSession(page);
    await page.keyboard.type('Hi ');
    await cdp.send('Input.imeSetComposition', { text: '＠', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '＠あ', selectionStart: 2, selectionEnd: 2 });
    await expect(field(page)).toHaveValue('Hi ＠あ');
    await expect(popup(page)).toHaveCount(0);
    await cdp.send('Input.insertText', { text: '@' });
    await expect(field(page)).toHaveValue('Hi @');
    await expect(popup(page)).toBeVisible();
    // An Enter that commits a composition never inserts a suggestion.
    await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
    await expect(popup(page)).toBeVisible();
    await cdp.send('Input.insertText', { text: 'か' });
    await expect(field(page)).toHaveValue('Hi @か');
    expect((await log(page)).inserts).toEqual([]);
  });

  test('remote suggestions: debounced reads, superseded requests aborted, loading and error states', async ({ page }) => {
    await open(page, 'remote');
    await page.keyboard.type('@ali', { delay: 10 });
    await expect(popup(page)).toHaveAttribute('aria-busy', 'true');
    await expect(popup(page).getByRole('status')).toHaveText('Loading…');
    await expect(options(page)).toHaveText(['Alice Smith', 'Malik Ali']);
    const l = await log(page);
    // Typing faster than the debounce sends one read for the final text.
    expect(l.reads.at(-1)).toBe('ali');
    expect(l.reads.length).toBeLessThan(4);
    // "e" while the read for "alic" is in flight (300 ms latency) supersedes and aborts it.
    await page.keyboard.type('c');
    await expect.poll(async () => (await log(page)).reads.at(-1)).toBe('alic');
    await page.keyboard.type('e');
    await expect(options(page)).toHaveText(['Alice Smith']);
    expect((await log(page)).aborted).toBeGreaterThanOrEqual(1);
    await page.keyboard.press('Enter');
    await expect(field(page)).toHaveValue('Alice Smith');
    await page.keyboard.type(' @fail');
    await expect(popup(page).getByRole('alert')).toHaveText('Could not load suggestions');
  });

  test('empty result shows the no-results text', async ({ page }) => {
    await open(page);
    await page.keyboard.type('@zzz');
    await expect(popup(page).getByRole('status')).toHaveText('No results');
  });

  test('server markup hydrates without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(url('hydrate'));
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    await field(page).click();
    await page.keyboard.type('@a');
    await expect(popup(page)).toBeVisible();
    expect(problems).toEqual([]);
  });
});
