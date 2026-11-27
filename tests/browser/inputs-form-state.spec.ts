import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// useFormState, requiredMark and the unsaved-changes Drawer flow
// Page: examples/vite-spa/form-state.html.

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}form-state.html${query}`);
  await page.waitForSelector('#page');
}
const log = (page: Page) => page.evaluate(() => window.__formState ?? []);
const dirty = (page: Page) => page.locator('#dirty');
const editor = (page: Page) => page.locator('dialog[data-test=editor]');
const mark = (page: Page, id: string) =>
  page.locator(`label[for="${id}"], #${id}`).first().evaluate((el) => {
    const label = el.tagName === 'LABEL' ? el : (document.querySelector(`[id="${el.getAttribute('aria-labelledby')}"]`) ?? document.querySelector(`label[for="${el.id}"]`));
    const before = getComputedStyle(label!, '::before');
    return before.content === 'none' || before.content === 'normal' ? null : { content: before.content, color: before.color };
  });

test.describe('useFormState', () => {
  test('tracks dirty fields against the initial values: typing, a Select, a checkbox; changing a value back is clean again', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await page.locator('#edit').click();
    await expect(editor(page)).toBeVisible();
    await expect(dirty(page)).toHaveText('clean');
    await expect(page.locator('#close')).toBeVisible();
    await expect(page.locator('#save')).toHaveCount(0);
    await page.locator('#customer').fill('Ada King');
    await expect(dirty(page)).toHaveText('customer');
    await expect(page.locator('#customer-dirty')).toHaveText('true');
    await expect(page.locator('#save')).toBeVisible();
    await expect(page.locator('#discard')).toBeVisible();
    await expect(page.locator('#close')).toHaveCount(0);
    // Back to the initial value: clean again.
    await page.locator('#customer').fill('Ada Lovelace');
    await expect(dirty(page)).toHaveText('clean');
    // A Select changes its hidden native select without input events.
    await page.locator('#status').click();
    await page.getByRole('option', { name: 'Pending' }).click();
    await expect(dirty(page)).toHaveText('status');
    await page.locator('#gift').check();
    await expect(dirty(page)).toHaveText('status,gift');
    await page.locator('#gift').uncheck();
    await expect(dirty(page)).toHaveText('status');
    expect(problems).toEqual([]);
  });

  test('Discard resets every field to its defaultValue and the state is clean; Save submits the FormData', async ({ page }) => {
    await open(page);
    await page.locator('#edit').click();
    await page.locator('#customer').fill('Grace');
    await page.locator('#note').fill('Rush');
    await page.locator('#status').click();
    await page.getByRole('option', { name: 'Payment failed' }).click();
    await expect(dirty(page)).toHaveText('customer,note,status');
    await page.locator('#discard').click();
    await expect(dirty(page)).toHaveText('clean');
    await expect(page.locator('#customer')).toHaveValue('Ada Lovelace');
    await expect(page.locator('#note')).toHaveValue('');
    await expect(page.locator('#status')).toHaveText(/Paid/);
    // Still clean after the fields settle (Salmon fields restore after the reset event).
    await page.waitForTimeout(100);
    await expect(dirty(page)).toHaveText('clean');
    await page.locator('#note').fill('Leave at the door');
    await page.locator('#save').click();
    await expect(editor(page)).toHaveCount(0);
    expect(await log(page)).toEqual([{ kind: 'save', values: [['customer', 'Ada Lovelace'], ['note', 'Leave at the door'], ['status', 'paid'], ['code', 'A1']] }]);
  });

  test('closing a dirty drawer asks with useConfirm: Escape, the close button and Keep editing keep it; Discard closes; a clean drawer closes at once', async ({ page }) => {
    await open(page);
    await page.locator('#edit').click();
    await page.locator('#close').click();
    await expect(editor(page)).toHaveCount(0);
    await page.locator('#edit').click();
    await page.locator('#customer').fill('Changed');
    // The state updates one task after the input event.
    await expect(dirty(page)).toHaveText('customer');
    await page.keyboard.press('Escape');
    const ask = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
    await expect(ask).toBeVisible();
    await expect(ask.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await ask.getByRole('button', { name: 'Keep editing' }).click();
    await expect(ask).toHaveCount(0);
    await expect(editor(page)).toBeVisible();
    await expect(page.locator('#customer')).toHaveValue('Changed');
    await editor(page).locator('.salmon-dialog-close-button').click();
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Discard' }).click();
    await expect(editor(page)).toHaveCount(0);
    // Opened again: a new snapshot of the defaults, clean.
    await page.locator('#edit').click();
    await expect(dirty(page)).toHaveText('clean');
    await expect(page.locator('#customer')).toHaveValue('Ada Lovelace');
    expect(await log(page)).toEqual([{ kind: 'closed' }, { kind: 'kept' }, { kind: 'closed' }]);
  });
});

test.describe('requiredMark', () => {
  test('marks required labels with a decorative asterisk (Form-wide, Select too, Field opt-in and opt-out); never in the accessible name', async ({ page }) => {
    await open(page);
    const required = await mark(page, 'mark-required');
    expect(required?.content).toMatch(/^"\*"/);
    expect(await mark(page, 'mark-optional')).toBeNull();
    expect((await mark(page, 'mark-select'))?.content).toMatch(/^"\*"/);
    expect((await mark(page, 'solo'))?.content).toMatch(/^"\*"/);
    await page.locator('#edit').click();
    // Field requiredMark={false} opts out under the marking Form.
    expect(await mark(page, 'code')).toBeNull();
    expect((await mark(page, 'customer'))?.content).toMatch(/^"\*"/);
    // The accessible names carry no asterisk; required-ness comes from the control.
    await expect(page.getByRole('textbox', { name: 'Required', exact: true })).toHaveAttribute('required', '');
    await expect(page.getByRole('combobox', { name: 'Select', exact: true })).toHaveAttribute('aria-required', 'true');
    // The mark sits at the inline start of the label: left in LTR, right under dir="rtl".
    for (const query of ['', '?dir=rtl']) {
      await open(page, query);
      const side = await page.locator('label[for="mark-required"]').evaluate((label) => {
        const box = label.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(label);
        const text = range.getBoundingClientRect();
        return { before: text.left - box.left, after: box.right - text.right };
      });
      if (query) expect(side.after).toBeGreaterThan(6);
      else expect(side.before).toBeGreaterThan(6);
    }
  });

  test('server markup hydrates without warnings; axe is clean with the drawer and the confirm open, in light, dark and RTL', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    await page.locator('#edit').click();
    await expect(editor(page)).toBeVisible();
    expect(problems).toEqual([]);
    for (const query of ['', '?scheme=dark', '?dir=rtl']) {
      await open(page, query);
      await expectClean(page, `marks ${query || 'light'}`);
      await page.locator('#edit').click();
      await page.locator('#customer').fill('Changed');
      await page.waitForTimeout(250);
      await expectClean(page, `editor dirty ${query || 'light'}`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await page.waitForTimeout(250);
      await expectClean(page, `confirm ${query || 'light'}`);
    }
  });
});
