import { test } from '@playwright/test';
import { SSR_URL } from './helpers.ts';
import { assertDropdownSsr } from './ssr-dropdowns-check.ts';

// Dropdowns in the Vite SSR example (`?dropdowns`): the server renders the triggers, labels, hidden form elements
// and the Listbox lists only, never a popup; hydration in StrictMode
// development mode reports no warning or recoverable error.
test('dropdowns server render and hydrate without warnings in the Vite SSR example', async ({ page }) => {
  await assertDropdownSsr(page, `${SSR_URL}?dropdowns`, async () => {
    await page.waitForFunction(() => window.__hydrated === true);
  });
});
