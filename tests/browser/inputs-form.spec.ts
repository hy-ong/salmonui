import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Form, Field, TextField and TextArea in the browser.
// Page: examples/vite-spa/inputs.html.

async function open(page: Page, query = '?only=text,form'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
  await page.waitForSelector('#page');
}
const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const clear = (page: Page) => page.evaluate(() => void (window.__inputs = []));
const formData = (page: Page, id: string) => page.evaluate((k) => window.__inputForms?.[k] ?? null, id);
const errorOf = (page: Page, id: string) => page.locator(`#${id}`).evaluate((el) => {
  const err = el.getAttribute('aria-errormessage');
  return err ? (document.getElementById(err)?.textContent ?? null) : null;
});

test.describe('TextField and TextArea', () => {
  test('typing fires onChange and onValueChange; controlled values never fight the caret', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await page.locator('#tf-basic').fill('Ada');
    expect((await events(page, 'text')).at(-1)).toEqual({ kind: 'text', value: 'Ada', reason: 'input', source: 'keyboard' });
    const ctl = page.locator('#tf-controlled');
    await ctl.click();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('x');
    await expect(ctl).toHaveValue('Adxa');
    expect(await ctl.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(3);
    expect(problems).toEqual([]);
  });

  test('the clear button and Escape clear the value and fire onValueChange; the button is not a tab stop', async ({ page }) => {
    await open(page);
    const input = page.locator('#tf-clear');
    const button = page.getByRole('button', { name: 'Clear' }).first();
    await expect(button).toHaveAttribute('tabindex', '-1');
    await button.click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    expect((await events(page, 'clear')).at(-1)).toMatchObject({ value: '', reason: 'clear' });
    await input.fill('abc');
    await input.press('Escape');
    await expect(input).toHaveValue('');
  });

  test('ref and native focus / blur reach the input', async ({ page }) => {
    await open(page);
    await page.locator('#tf-basic').focus();
    await expect(page.locator('#tf-basic')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#tf-basic')).not.toBeFocused();
  });

  test('disabled inputs ignore typing, read-only ones stay focusable', async ({ page }) => {
    await open(page);
    await expect(page.locator('#tf-disabled')).toBeDisabled();
    await page.locator('#tf-readonly').focus();
    await page.keyboard.type('zz');
    await expect(page.locator('#tf-readonly')).toHaveValue('fixed');
  });

  test('autoResize grows the textarea with its content; resize maps to CSS', async ({ page }) => {
    await open(page);
    const ta = page.locator('#ta-auto');
    expect(await ta.evaluate((el) => getComputedStyle(el).resize)).toBe('vertical');
    const before = (await ta.boundingBox())!.height;
    await ta.fill('one\ntwo\nthree\nfour\nfive\nsix');
    const after = (await ta.boundingBox())!.height;
    expect(after).toBeGreaterThan(before + 20);
  });
});

test.describe('Form validation', () => {
  test('errors appear after the first blur, then update on every change', async ({ page }) => {
    await open(page);
    const email = page.locator('#f-email');
    await email.fill('nope');
    expect(await errorOf(page, 'f-email')).toBeNull();
    await email.blur();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(await errorOf(page, 'f-email')).toBe('Please enter a valid email address.');
    await email.fill('a@b.co');
    await expect(email).not.toHaveAttribute('aria-invalid', 'true');
    // validateOn="change" shows errors while typing.
    await page.locator('#f-change').fill('abcd');
    await expect(page.locator('#f-change')).toHaveAttribute('aria-invalid', 'true');
  });

  test('an invalid submit is blocked and focuses the first invalid field', async ({ page }) => {
    await open(page);
    await clear(page);
    await page.locator('#signup-submit').click();
    await expect(page.locator('#f-email')).toBeFocused();
    expect(await events(page, 'submit')).toEqual([]);
    const validate = (await events(page, 'validate')).at(-1)!;
    expect(validate['valid']).toBe(false);
    expect(validate['names']).toEqual(expect.arrayContaining(['email', 'code']));
    expect(await errorOf(page, 'f-email')).toBe('This field is required.');
  });

  test('native constraint attributes are reported through the field with the rule messages', async ({ page }) => {
    await open(page);
    const code = page.locator('#f-native');
    await code.fill('ab');
    await code.blur();
    expect(await errorOf(page, 'f-native')).toBe('Please enter at least 3 characters.');
    await code.fill('abc');
    expect(await errorOf(page, 'f-native')).toBe('Please enter a correct value.');
    await code.fill('ABC');
    await expect(code).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('reportValidity() and :invalid agree with Salmon rules (setCustomValidity)', async ({ page }) => {
    await open(page);
    await page.locator('#f-email').fill('bad');
    const state = await page.evaluate(() => {
      const el = document.getElementById('f-email') as HTMLInputElement;
      return { valid: el.checkValidity(), message: el.validationMessage, matches: el.matches(':invalid') };
    });
    expect(state).toEqual({ valid: false, message: 'Please enter a valid email address.', matches: true });
    await page.evaluate(() => (document.getElementById('f-email') as HTMLInputElement).reportValidity());
    await expect(page.locator('#f-email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('custom and async rules; a submit waits for pending rules, then submits', async ({ page }) => {
    await open(page);
    await page.locator('#f-email').fill('a@b.co');
    await page.locator('#f-native').fill('ABC');
    await page.locator('#f-plan').selectOption('pro');
    await page.locator('#f-confirm').fill('other');
    await page.locator('#f-confirm').blur();
    expect(await errorOf(page, 'f-confirm')).toBe('Passwords differ');
    await page.locator('#f-confirm').fill('secret');
    await page.locator('#f-async').fill('taken');
    await page.locator('#f-async').blur();
    await expect(page.locator('#f-async').locator('xpath=ancestor::div[contains(@class,"salmon-field")][1]')).toHaveAttribute('data-validating', '');
    await expect(page.locator('#f-async')).toHaveAttribute('aria-invalid', 'true');
    expect(await errorOf(page, 'f-async')).toBe('Handle taken');
    await page.locator('#f-async').fill('free');
    await clear(page);
    await page.locator('#signup-submit').click();
    await expect.poll(() => events(page, 'submit')).toEqual([{ kind: 'submit', form: 'signup' }]);
    expect(await formData(page, 'signup')).toEqual(expect.arrayContaining([['email', 'a@b.co'], ['handle', 'free'], ['plan', 'pro']]));
  });

  test('a form reset restores defaults and clears errors', async ({ page }) => {
    await open(page);
    await page.locator('#signup-submit').click();
    await expect(page.locator('#f-email')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#f-password').fill('changed');
    await page.locator('#signup-reset').click();
    await expect(page.locator('#f-password')).toHaveValue('secret');
    await expect(page.locator('#f-email')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('validationBehavior="aria" marks fields but lets the submit proceed', async ({ page }) => {
    await open(page);
    await clear(page);
    await page.locator('#aria-submit').click();
    await expect(page.locator('#a-email')).toHaveAttribute('aria-invalid', 'true');
    expect(await events(page, 'submit')).toEqual([{ kind: 'submit', form: 'aria' }]);
  });

  test('React 19 actions, useFormStatus pending state and server errors until the value changes', async ({ page }) => {
    await open(page);
    const user = page.locator('#action-form input[name="user"]');
    await user.fill('taken');
    await page.locator('#action-submit').click();
    await expect(page.locator('#action-submit')).toHaveAttribute('data-pending', '');
    await expect(user).toHaveAttribute('aria-invalid', 'true');
    expect(await page.locator('#action-form .salmon-field-error').textContent()).toBe('This user name is taken.');
    await user.fill('free');
    await expect(user).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('changing a field\'s validation prop adds and removes rules', async ({ page }) => {
    await open(page);
    const field = page.locator('#rules-field');
    await field.fill('ab');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#rules-toggle').click();
    await expect(field).not.toHaveAttribute('aria-invalid', 'true');
    await page.locator('#rules-toggle').click();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  test('server markup hydrates with zero warnings and stays interactive', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate&only=text,form');
    await page.locator('#tf-basic').fill('x');
    await expect(page.locator('#tf-basic')).toHaveValue('x');
    expect(problems).toEqual([]);
  });

  test('inputs follow the inherited direction', async ({ page }) => {
    await open(page, '?dir=rtl&only=text');
    expect(await page.locator('#tf-adorn').evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    const start = await page.locator('#text .salmon-input-group-adornment[data-position="start"]').first().boundingBox();
    const input = await page.locator('#tf-adorn').boundingBox();
    expect(start!.x).toBeGreaterThan(input!.x);
  });
});
