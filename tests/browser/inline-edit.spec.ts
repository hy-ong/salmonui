import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// InlineEdit (page:
// examples/vite-spa/src/editors.tsx). ARIA and axe checks are in
// inline-edit-a11y.spec.ts (also run by `npm run test:a11y`).

interface Log {
  events: string[];
  value: unknown;
  saves: number;
  aborted: number;
}

const url = (query = ''): string => `${DEV_URL}editors.html${query ? `?${query}` : ''}`;
const root = (page: Page) => page.locator('.demo-inline');
const preview = (page: Page) => page.locator('.demo-inline .salmon-inline-edit-preview');
const input = (page: Page) => page.locator('.salmon-inline-edit-editor input[type="text"]');
const popover = (page: Page) => page.locator('.salmon-inline-edit-popover');
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __editors: Log }).__editors);

test.describe('InlineEdit', () => {
  test('popover mode by default: click opens a dialog anchored to the preview, Enter saves', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(url());
    await expect(preview(page)).toHaveText('Title: Quarterly report');
    await preview(page).click();
    await expect(popover(page)).toBeVisible();
    await expect(popover(page)).toHaveAttribute('role', 'dialog');
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveValue('Quarterly report');
    // The popover sits below the preview.
    const p = (await preview(page).boundingBox())!;
    const o = (await popover(page).boundingBox())!;
    expect(o.y).toBeGreaterThanOrEqual(p.y + p.height);
    await input(page).fill('Annual report');
    await page.keyboard.press('Enter');
    await expect(popover(page)).toHaveCount(0);
    await expect(preview(page)).toHaveText('Title: Annual report');
    await expect(preview(page)).toBeFocused();
    await expect(page.locator('input[type="hidden"][name="title"]')).toHaveValue('Annual report');
    const l = await log(page);
    expect(l.events).toContain('save:Annual report:Quarterly report:enter:keyboard');
    expect(l.events.filter((e) => e.startsWith('start'))).toEqual(['start:pointer']);
    expect(problems).toEqual([]);
  });

  test('inline mode replaces the preview; Escape cancels and returns focus', async ({ page }) => {
    await page.goto(url('mode=inline'));
    await preview(page).focus();
    await page.keyboard.press('Enter');
    await expect(preview(page)).toHaveCount(0);
    await expect(input(page)).toBeFocused();
    await page.keyboard.type(' draft');
    await page.keyboard.press('Escape');
    await expect(preview(page)).toHaveText('Title: Quarterly report');
    await expect(preview(page)).toBeFocused();
    const l = await log(page);
    expect(l.events).toContain('beforeCancel:escape');
    expect(l.events).toContain('cancel:Quarterly report draft:escape');
    expect(l.events).toContain('start:keyboard');
    // Space starts editing too.
    await page.keyboard.press(' ');
    await expect(input(page)).toBeFocused();
  });

  test('trigger: doubleClick ignores a single click; editButton starts from the button', async ({ page }) => {
    await page.goto(url('trigger=doubleClick&mode=inline'));
    await preview(page).click();
    await expect(input(page)).toHaveCount(0);
    await preview(page).dblclick();
    await expect(input(page)).toBeFocused();
    await page.goto(url('trigger=editButton&mode=inline'));
    await expect(page.locator('.demo-inline span.salmon-inline-edit-preview')).toHaveText('Quarterly report');
    await page.locator('.demo-inline .salmon-inline-edit-edit-button').click();
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.demo-inline .salmon-inline-edit-edit-button')).toBeFocused();
  });

  test('controlled editing and ref methods startEdit / save / cancelEdit / validate', async ({ page }) => {
    await page.goto(url('controlled&mode=inline'));
    await page.evaluate(() => window.__inline!.startEdit());
    await expect(input(page)).toBeVisible();
    expect((await log(page)).events).toContain('editing:true:start:api');
    await input(page).fill('');
    expect(await page.evaluate(() => window.__inline!.validate())).toEqual(['This field is required.']);
    await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
    await input(page).fill('Via API');
    expect(await page.evaluate(() => window.__inline!.save())).toBe(true);
    await expect(preview(page)).toHaveText('Title: Via API');
    expect((await log(page)).events).toContain('editing:false:save:api');
    await page.evaluate(() => window.__inline!.startEdit());
    await page.evaluate(() => window.__inline!.cancelEdit());
    await expect(input(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__inline!.element?.className)).toContain('salmon-inline-edit');
  });

  test('popoverProps: placement and offset; reduced motion drops the fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url('placement=top-start'));
    await page.locator('main').evaluate((el) => (el.style.paddingTop = '300px'));
    await preview(page).click();
    await expect(popover(page)).toHaveAttribute('data-placement', 'top-start');
    const p = (await preview(page).boundingBox())!;
    const o = (await popover(page).boundingBox())!;
    expect(Math.round(p.y - (o.y + o.height))).toBeGreaterThanOrEqual(11);
    expect(await popover(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  test('disabled: the preview does not start editing', async ({ page }) => {
    await page.goto(url('disabled&mode=inline'));
    await expect(preview(page)).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled keeps the preview focusable; force the click past Playwright's enabled check.
    await preview(page).click({ force: true });
    await preview(page).focus();
    await page.keyboard.press('Enter');
    await expect(input(page)).toHaveCount(0);
  });

  test('blurAction save / cancel / keep', async ({ page }) => {
    await page.goto(url('mode=inline'));
    await preview(page).click();
    await input(page).fill('Blurred');
    await page.locator('#after').click();
    await expect(preview(page)).toHaveText('Title: Blurred');
    expect((await log(page)).events).toContain('save:Blurred:Quarterly report:blur:pointer');
    await expect(page.locator('#after')).toBeFocused();

    await page.goto(url('mode=inline&blur=cancel'));
    await preview(page).click();
    await input(page).fill('Dropped');
    await page.locator('#after').click();
    await expect(preview(page)).toHaveText('Title: Quarterly report');

    await page.goto(url('mode=inline&blur=keep'));
    await preview(page).click();
    await input(page).fill('Kept');
    await page.locator('#after').click();
    await expect(input(page)).toHaveValue('Kept');
  });

  test('saveOnEnter=false and multiline Mod+Enter', async ({ page }) => {
    await page.goto(url('mode=inline&enter=0'));
    await preview(page).click();
    await page.keyboard.press('Enter');
    await expect(input(page)).toBeVisible();
    await page.goto(url());
    const notes = page.locator('.demo-notes');
    await notes.locator('.salmon-inline-edit-preview').click();
    const area = notes.locator('textarea');
    await expect(area).toBeFocused();
    await area.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line two');
    await expect(area).toHaveValue('Line one\nLine two');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(notes.locator('.salmon-inline-edit-preview')).toHaveText('Notes: Line one\nLine two');
  });

  test('actions: Save and Cancel buttons, hidden with showActions=false', async ({ page }) => {
    await page.goto(url('mode=inline'));
    await preview(page).click();
    await input(page).fill('By button');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(preview(page)).toHaveText('Title: By button');
    expect((await log(page)).events).toContain('save:By button:Quarterly report:actions:pointer');
    await preview(page).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect((await log(page)).events.at(-1)).toBe('cancel:By button:actions');
    await page.goto(url('mode=inline&actions=0'));
    await preview(page).click();
    await expect(root(page).locator('.salmon-inline-edit-actions')).toHaveCount(0);
  });

  test('a custom editor through children: number input with a range rule and a preview label', async ({ page }) => {
    await page.goto(url());
    const qty = page.locator('.demo-number');
    await expect(qty.locator('.salmon-inline-edit-preview')).toHaveText('Quantity: 3 pcs');
    await qty.locator('.salmon-inline-edit-preview').click();
    const field = qty.locator('input[type="number"]');
    await field.fill('42');
    await page.keyboard.press('Enter');
    await expect(qty.locator('.salmon-inline-edit-error')).toHaveText('Please enter a value between 1 and 10.');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAttribute('aria-describedby', (await qty.locator('.salmon-inline-edit-error').getAttribute('id'))!);
    await field.fill('7');
    await page.keyboard.press('Enter');
    await expect(qty.locator('.salmon-inline-edit-preview')).toHaveText('Quantity: 7 pcs');
  });

  test('validation blocks the save: required and maxLength messages', async ({ page }) => {
    await page.goto(url('mode=inline'));
    await preview(page).click();
    await input(page).fill('');
    await page.keyboard.press('Enter');
    await expect(root(page).locator('.salmon-inline-edit-error')).toHaveText('This field is required.');
    await input(page).fill('x'.repeat(25));
    await page.keyboard.press('Enter');
    await expect(root(page).locator('.salmon-inline-edit-error')).toHaveText('At most 20 characters');
    expect((await log(page)).saves).toBe(0);
  });

  test('pending save: aria-busy, read-only input, abort on cancel; rejection keeps editing', async ({ page }) => {
    await page.goto(url('mode=inline&delay=400'));
    await preview(page).click();
    await input(page).fill('Slow');
    await page.keyboard.press('Enter');
    await expect(root(page).locator('.salmon-inline-edit-editor')).toHaveAttribute('aria-busy', 'true');
    await expect(input(page)).toHaveAttribute('readonly', '');
    await expect(root(page).locator('.salmon-inline-edit-status')).toHaveText('Saving');
    await page.keyboard.press('Escape');
    await expect(input(page)).toHaveCount(0);
    expect((await log(page)).aborted).toBe(1);
    await expect(preview(page)).toHaveText('Title: Quarterly report');

    await page.goto(url('mode=inline&fail'));
    await preview(page).click();
    await input(page).fill('Offline');
    await page.keyboard.press('Enter');
    await expect(root(page).locator('.salmon-inline-edit-error')).toHaveText('The value could not be saved.');
    await expect(root(page).locator('.salmon-inline-edit-status')).toHaveText('The value could not be saved.');
    await expect(input(page)).toHaveValue('Offline');
    await expect(input(page)).not.toHaveAttribute('readonly');
    expect((await log(page)).events).toContain('saveError:offline');
  });

  test('onBeforeSave vetoes; events report draft changes', async ({ page }) => {
    await page.goto(url('mode=inline&veto'));
    await preview(page).click();
    await input(page).fill('veto');
    await page.keyboard.press('Enter');
    await expect(input(page)).toBeVisible();
    const l = await log(page);
    expect(l.events).toContain('beforeSave:veto:enter');
    expect(l.events).not.toContain(expect.stringMatching(/^save:/));
    expect(l.events).toContain('draft:veto');
    expect(l.events.indexOf('beforeStart:pointer')).toBeLessThan(l.events.indexOf('start:pointer'));
  });

  test('RTL: actions sit at the inline end and the popover aligns to the start', async ({ page }) => {
    await page.goto(url('dir=rtl&mode=inline'));
    await preview(page).click();
    const box = (await root(page).locator('.salmon-inline-edit-field').boundingBox())!;
    const actions = (await root(page).locator('.salmon-inline-edit-actions').boundingBox())!;
    expect(actions.x + actions.width).toBeLessThanOrEqual(box.x + 1);
    await page.goto(url('dir=rtl'));
    await preview(page).click();
    await expect(popover(page)).toHaveAttribute('dir', 'rtl');
    const p = (await preview(page).boundingBox())!;
    const o = (await popover(page).boundingBox())!;
    expect(Math.abs(o.x + o.width - (p.x + p.width))).toBeLessThan(2);
  });

  test('1,000 idle InlineEdits mount no editor and no popover; activation focuses within a frame', { tag: '@perf' }, async ({ page }) => {
    await page.goto(url('many=1000'));
    await expect(page.locator('#many .salmon-inline-edit')).toHaveCount(1000);
    await expect(page.locator('.salmon-inline-edit-editor, .salmon-inline-edit-popover, input[type="text"]')).toHaveCount(0);
    const ms = await page.evaluate(async () => {
      const button = document.querySelector<HTMLButtonElement>('#many .salmon-inline-edit-preview')!;
      const t0 = performance.now();
      button.click();
      for (let i = 0; i < 50 && !(document.activeElement instanceof HTMLInputElement); i++) await new Promise((r) => setTimeout(r, 0));
      return document.activeElement instanceof HTMLInputElement ? performance.now() - t0 : Infinity;
    });
    // Infinity: the editor input never took focus (a functional failure, not a timing miss).
    expect(ms).not.toBe(Infinity);
    expectBudget(ms, 50, 'InlineEdit activation to focused', { strict: true });
  });

  test('server-rendered markup hydrates without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(url('hydrate'));
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    await preview(page).click();
    await expect(input(page)).toBeFocused();
    expect(problems).toEqual([]);
  });
});
