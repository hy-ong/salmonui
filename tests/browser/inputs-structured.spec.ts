import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// MaskedField and NumberField in the browser.
// Page: examples/vite-spa/inputs.html.

async function open(page: Page, query = '?only=masked,number'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
}
const events = (page: Page, kind: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const forms = (page: Page, id: string) => page.evaluate((k) => window.__inputForms?.[k] ?? null, id);
const caret = (page: Page, id: string) => page.locator(`#${id}`).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]);

test.describe('MaskedField', () => {
  test('typing fills slots past literals; raw value and masked details', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const phone = page.locator('#mask-phone');
    await phone.click();
    await expect(phone).toHaveValue('(___) ___-____');
    expect(await caret(page, 'mask-phone')).toEqual([1, 1]);
    await page.keyboard.type('555x1234567');
    await expect(phone).toHaveValue('(555) 123-4567');
    expect((await events(page, 'mask')).at(-1)).toEqual({ kind: 'mask', value: '5551234567', masked: '(555) 123-4567', reason: 'input', complete: true });
    expect(problems).toEqual([]);
  });

  test('Backspace and Delete skip literals; a selection is replaced; paste is masked', async ({ page }) => {
    await open(page);
    const phone = page.locator('#mask-phone');
    await phone.click();
    await page.keyboard.type('5551234567');
    // Caret after "(555) " -> Backspace clears the previous digit (skips ") ").
    await phone.evaluate((el: HTMLInputElement) => el.setSelectionRange(6, 6));
    await page.keyboard.press('Backspace');
    await expect(phone).toHaveValue('(55_) 123-4567');
    expect(await caret(page, 'mask-phone')).toEqual([3, 3]);
    await page.keyboard.type('9');
    await expect(phone).toHaveValue('(559) 123-4567');
    await phone.evaluate((el: HTMLInputElement) => el.setSelectionRange(6, 9));
    await page.keyboard.type('8');
    await expect(phone).toHaveValue('(559) 8__-4567');
    await phone.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, el.value.length));
    await page.keyboard.press('Delete');
    await expect(phone).toHaveValue('(___) ___-____');
    await phone.evaluate((el: HTMLInputElement) => {
      el.setSelectionRange(0, el.value.length);
      const dt = new DataTransfer();
      dt.setData('text/plain', '+1 (212) 555-0100');
      el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await expect(phone).toHaveValue('(121) 255-5010');
  });

  test('case shift, custom tokens and the placeholder character', async ({ page }) => {
    await open(page);
    await expect(page.locator('#mask-code')).toHaveValue('AB-1234');
    await page.locator('#mask-custom').click();
    await expect(page.locator('#mask-custom')).toHaveValue('••:••');
    await page.keyboard.type('0930');
    await expect(page.locator('#mask-custom')).toHaveValue('09:30');
  });

  test('hidden inputs submit raw or masked values; incomplete values are invalid', async ({ page }) => {
    await open(page);
    const phone = page.locator('#mask-phone');
    await phone.click();
    await page.keyboard.type('555');
    await phone.blur();
    await expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(await phone.evaluate((el: HTMLInputElement) => el.validationMessage)).toBe('Please complete the value.');
    await phone.click();
    await page.keyboard.type('1234567');
    await expect(phone).not.toHaveAttribute('aria-invalid', 'true');
    await page.locator('#mask-required').fill('');
    await page.locator('#mask-required').click();
    await page.keyboard.type('1234');
    await page.locator('#masked-submit').click();
    expect(await forms(page, 'masked')).toEqual([['phone', '5551234567'], ['code', 'AB-1234'], ['req', '1234']]);
  });

  test('a form reset restores the default raw value', async ({ page }) => {
    await open(page);
    const code = page.locator('#mask-code');
    await code.click();
    await code.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, el.value.length));
    await page.keyboard.press('Backspace');
    await expect(code).toHaveValue('__-____');
    await page.locator('#masked-reset').click();
    await expect(code).toHaveValue('AB-1234');
  });

  test('digit masks are left-to-right in RTL pages', async ({ page }) => {
    await open(page, '?dir=rtl&only=masked');
    await expect(page.locator('#mask-phone')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('#mask-code')).not.toHaveAttribute('dir', 'ltr');
  });
});

test.describe('NumberField', () => {
  test('formatted when blurred, raw while focused; spinbutton ARIA', async ({ page }) => {
    await open(page);
    const qty = page.locator('#num-basic');
    await expect(qty).toHaveValue('1,234.5');
    await expect(qty).toHaveAttribute('role', 'spinbutton');
    await expect(qty).toHaveAttribute('aria-valuenow', '1234.5');
    await expect(qty).toHaveAttribute('aria-valuetext', '1,234.5');
    await expect(qty).toHaveAttribute('aria-valuemax', '10000');
    await qty.focus();
    await expect(qty).toHaveValue('1234.5');
    await expect(page.locator('#num-currency')).toHaveValue(/^1\.234,50\s€$/);
    await expect(page.locator('#num-percent')).toHaveValue('25.0%');
  });

  test('arrows by step, Page keys by ten steps, Home / End to min / max', async ({ page }) => {
    await open(page);
    const qty = page.locator('#num-basic');
    await qty.focus();
    await page.keyboard.press('ArrowUp');
    await expect(qty).toHaveValue('1235');
    await page.keyboard.press('PageDown');
    await expect(qty).toHaveValue('1230');
    await page.keyboard.press('Home');
    await expect(qty).toHaveValue('0');
    await page.keyboard.press('ArrowDown');
    await expect(qty).toHaveValue('0');
    await page.keyboard.press('End');
    await expect(qty).toHaveValue('10000');
  });

  test('stepper buttons step and repeat while held; they are not tab stops', async ({ page }) => {
    await open(page);
    const ctl = page.locator('#num-controlled');
    const up = page.locator('#number .salmon-number-field').filter({ has: ctl }).getByRole('button', { name: 'Increment' });
    await expect(up).toHaveAttribute('tabindex', '-1');
    await up.click();
    await expect(page.locator('#num-controlled-out')).toHaveText('6');
    await up.hover();
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(page.locator('#num-controlled-out')).toHaveText('10');
    expect((await events(page, 'number')).at(-1)).toMatchObject({ reason: 'increment', source: 'pointer', formatted: '10' });
  });

  test('typing parses locale text; the locale prop drives format and parse', async ({ page }) => {
    await open(page);
    const price = page.locator('#num-currency');
    await price.focus();
    await price.fill('9.876,5');
    await price.blur();
    await expect(price).toHaveValue(/^9\.876,50\s€$/);
    await page.locator('#number-submit').click();
    expect(await forms(page, 'number')).toEqual(expect.arrayContaining([['price', '9876.5'], ['qty', '1234.5']]));
  });

  test('decimals rounds the committed value; restrictDecimals refuses extra digits', async ({ page }) => {
    await open(page);
    const field = page.locator('#num-restrict');
    await field.click();
    await page.keyboard.type('3.14159');
    await expect(field).toHaveValue('3.14');
    await field.blur();
    await expect(field).toHaveValue('3.14');
  });

  test('clampBehavior blur clamps; none keeps the value and reports the range error', async ({ page }) => {
    await open(page);
    const ctl = page.locator('#num-controlled');
    await ctl.fill('42');
    await ctl.blur();
    await expect(page.locator('#num-controlled-out')).toHaveText('10');
    const none = page.locator('#num-none');
    await none.fill('42');
    await none.blur();
    await expect(none).toHaveValue('42');
    await expect(none).toHaveAttribute('aria-invalid', 'true');
    expect(await none.evaluate((el: HTMLInputElement) => el.validationMessage)).toBe('Please enter a value less than or equal to 10.');
  });

  test('the wheel steps only with incrementOnWheel and only while focused', async ({ page }) => {
    await open(page);
    const wheel = page.locator('#num-wheel');
    await wheel.focus();
    await wheel.hover();
    await page.mouse.wheel(0, -100);
    await expect(wheel).toHaveValue('1');
    const plain = page.locator('#num-nowheel');
    await plain.focus();
    await plain.hover();
    await page.mouse.wheel(0, -100);
    await expect(plain).toHaveValue('0');
  });

  test('a form reset restores the default number', async ({ page }) => {
    await open(page);
    await page.locator('#num-basic').fill('7');
    await page.locator('#num-basic').blur();
    await page.locator('#number-reset').click();
    await expect(page.locator('#num-basic')).toHaveValue('1,234.5');
  });

  test('one keystroke in NumberField and MaskedField costs ≤ 0.5 ms of component work', { tag: '@perf' }, async ({ page }) => {
    await open(page);
    const ms = await page.evaluate(async () => {
      const time = async (id: string, data: string): Promise<number> => {
        const el = document.getElementById(id) as HTMLInputElement;
        el.focus();
        const samples: number[] = [];
        for (let i = 0; i < 40; i++) {
          el.setSelectionRange(0, 0);
          const t = performance.now();
          if (el.closest('.salmon-masked-field')) el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data, bubbles: true, cancelable: true }));
          else {
            el.value = `${i}`;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          samples.push(performance.now() - t);
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
        samples.sort((a, b) => a - b);
        return samples[Math.floor(samples.length * 0.5)] as number;
      };
      return { number: await time('num-basic', '1'), masked: await time('mask-phone', '5') };
    });
    expectBudget(ms.number, 0.5, 'NumberField keystroke component work median');
    expectBudget(ms.masked, 0.5, 'MaskedField keystroke component work median');
  });

  test('server markup hydrates with zero warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate&only=masked,number');
    await page.locator('#num-basic').focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#num-basic')).toHaveValue('1235');
    expect(problems).toEqual([]);
  });
});
