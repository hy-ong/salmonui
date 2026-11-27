import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Form Renderer in the browser.
// Page: examples/vite-spa/inputs.html?only=form-renderer (examples/vite-spa/src/inputs-form-renderer.tsx).

async function open(page: Page, query = '?only=form-renderer'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
  await page.waitForSelector('#page');
}
const events = (page: Page, kind: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;

test.describe('Form Renderer', () => {
  test('schema properties render as Salmon fields named by their titles', async ({ page }) => {
    await open(page);
    const form = page.getByRole('form', { name: 'Sign up' });
    await expect(form.getByRole('textbox', { name: 'First name' })).toBeVisible();
    await expect(form.getByRole('textbox', { name: 'Email' })).toHaveAttribute('type', 'email');
    await expect(form.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription('We never share it');
    await expect(form.getByLabel('Password')).toHaveAttribute('type', 'password');
    await expect(form.getByRole('spinbutton', { name: 'Age' })).toBeVisible();
    await expect(form.getByRole('combobox', { name: 'Plan' })).toBeVisible();
    await expect(form.getByRole('radiogroup', { name: 'Team size' })).toBeVisible();
    await expect(form.getByRole('radio', { name: 'Small' })).toBeChecked();
    await expect(form.getByRole('switch', { name: 'Newsletter' })).toBeChecked();
    await expect(form.getByRole('checkbox', { name: 'I accept the terms' })).not.toBeChecked();
    await expect(form.getByRole('button', { name: 'Create account' })).toHaveAttribute('type', 'submit');
  });

  test('layout rows place properties side by side, stacking in a narrow container', async ({ page }) => {
    await open(page);
    const first = (await page.getByRole('textbox', { name: 'First name' }).boundingBox())!;
    const last = (await page.getByRole('textbox', { name: 'Last name' }).boundingBox())!;
    expect(Math.abs(first.y - last.y)).toBeLessThan(2);
    expect(last.x).toBeGreaterThan(first.x);
    const email = (await page.getByRole('textbox', { name: 'Email' }).boundingBox())!;
    expect(email.y).toBeGreaterThan(first.y);
    await page.locator('#frnd-form').evaluate((el) => ((el as HTMLElement).style.inlineSize = '20rem'));
    const first2 = (await page.getByRole('textbox', { name: 'First name' }).boundingBox())!;
    const last2 = (await page.getByRole('textbox', { name: 'Last name' }).boundingBox())!;
    expect(last2.y).toBeGreaterThan(first2.y);
  });

  test('an invalid submit reports errors from the schema rules and isValid false', async ({ page }) => {
    await open(page);
    const form = page.getByRole('form', { name: 'Sign up' });
    await form.getByRole('textbox', { name: 'First name' }).fill('A');
    await form.getByRole('textbox', { name: 'Last name' }).fill('Lovelace');
    await form.getByRole('textbox', { name: 'Email' }).fill('not-an-email');
    await form.getByLabel('Password').fill('a b');
    // Errors revealed on blur shift the layout: activate the submit button from the keyboard.
    await form.getByRole('button', { name: 'Create account' }).press('Enter');
    const last = (await events(page, 'form-renderer')).at(-1)!;
    expect(last['isValid']).toBe(false);
    const errors = last['errors'] as Record<string, string[]>;
    expect(errors['first']).toEqual(['Please enter at least 2 characters.']);
    expect(errors['last']).toEqual(['Please enter no more than 5 characters.']);
    expect(errors['email']).toEqual(['Please enter a valid email address.']);
    expect(errors['password']).toEqual(['Please enter a correct value.']);
    expect(errors['age']).toEqual(['This field is required.']);
    expect(errors['plan']).toEqual(['This field is required.']);
    expect(errors['terms']).toEqual(['This field is required.']);
    expect(Object.keys(errors)).not.toContain('news');
    // Native mode: the first invalid field is focused and its error shown.
    await expect(form.getByRole('textbox', { name: 'First name' })).toBeFocused();
    await expect(form.getByRole('textbox', { name: 'First name' })).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByRole('combobox', { name: 'Plan' })).toHaveAttribute('aria-invalid', 'true');
    // Range rules.
    await form.getByRole('spinbutton', { name: 'Age' }).fill('12');
    await form.getByRole('button', { name: 'Create account' }).press('Enter');
    const again = (await events(page, 'form-renderer')).at(-1)!;
    expect((again['errors'] as Record<string, string[]>)['age']).toBeDefined();
  });

  test('a valid submit passes typed data and isValid true once', async ({ page }) => {
    await open(page);
    const form = page.getByRole('form', { name: 'Sign up' });
    await form.getByRole('textbox', { name: 'First name' }).fill('Ada');
    await form.getByRole('textbox', { name: 'Email' }).fill('ada@example.com');
    await form.getByLabel('Password').fill('secret');
    await form.getByRole('spinbutton', { name: 'Age' }).fill('36');
    await form.getByRole('combobox', { name: 'Plan' }).click();
    await page.getByRole('option', { name: 'Pro' }).click();
    await form.getByRole('radio', { name: 'Team' }).check();
    await form.getByRole('switch', { name: 'Newsletter' }).uncheck();
    await form.getByRole('checkbox', { name: 'I accept the terms' }).check();
    await form.getByRole('button', { name: 'Create account' }).click();
    const submits = await events(page, 'form-renderer');
    expect(submits).toHaveLength(1);
    expect(submits[0]).toEqual({
      kind: 'form-renderer',
      isValid: true,
      errors: {},
      data: { first: 'Ada', last: '', email: 'ada@example.com', password: 'secret', age: 36, plan: 'pro', size: 10, news: false, terms: true },
    });
    // The page did not navigate (the native submit is prevented without `action`).
    await expect(page.locator('#frnd-form')).toBeVisible();
  });

  test("validationBehavior 'aria' submits once with isValid false", async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Send feedback' }).click();
    const sent = await events(page, 'form-renderer-aria');
    expect(sent).toEqual([{ kind: 'form-renderer-aria', data: { comment: '' }, isValid: false }]);
    await page.getByRole('textbox', { name: 'Comment' }).fill('Great');
    await page.getByRole('button', { name: 'Send feedback' }).click();
    expect((await events(page, 'form-renderer-aria')).at(-1)).toEqual({ kind: 'form-renderer-aria', data: { comment: 'Great' }, isValid: true });
  });
});

test('form renderer markup hydrates with zero warnings and stays interactive', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate&only=form-renderer');
  await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
  await expect(page.getByRole('textbox', { name: 'First name' })).toHaveValue('Ada');
  expect(problems).toEqual([]);
});
