import { expect, test } from '@playwright/test';
import { collectProblems, SSR_URL } from './helpers.ts';

// Conversation assistant variant in the Vite SSR example (`?assistant`,
// examples/vite-ssr/src/Assistant.tsx): the
// server resolves the assistant renderers statically, so prompts, responses,
// reasoning and tool parts, alternatives and both toolbars are in the server
// HTML (no placeholder, no client-rendered Suspense boundary); the browser
// hydrates them while the lazy chunk loads, with no warning or recoverable
// error in StrictMode development mode, and the page then streams a reply.

test('the assistant variant server renders and hydrates without warnings', async ({ page }) => {
  const problems = collectProblems(page);
  const url = `${SSR_URL}?assistant`;
  const html = await (await page.request.get(url)).text();
  expect(html).toContain('data-variant="assistant"');
  expect(html).toMatch(/data-role="prompt"[\s\S]*data-role="response"/);
  expect(html).toContain('<summary>Reasoning</summary>');
  expect(html).toContain('<summary>weather: done</summary>');
  expect(html).toContain('aria-label="2 of 2"');
  expect(html).toMatch(/data-action="positive"[^>]*aria-pressed="true"/);
  expect(html).toMatch(/class="salmon-conversation-composer__dictate"[^>]*disabled=""/);
  expect(html).not.toMatch(/<!--\$!-->/);

  await page.goto(url);
  await page.waitForFunction(() => window.__hydrated === true);
  await page.waitForTimeout(200);
  const root = page.locator('#ssr-assistant');
  await expect(root.locator('[data-action="positive"]')).toHaveAttribute('aria-pressed', 'true');
  await root.getByRole('button', { name: 'Previous response' }).click();
  await expect(root.locator('.salmon-conversation-item[data-role="response"] .salmon-conversation-item__bubble')).toHaveText('Oslo is cold today.');
  await root.getByRole('button', { name: 'Will it rain tomorrow?' }).click();
  await expect(root.locator('.salmon-conversation-item[data-role="response"]').last()).toContainText('You asked: Will it rain tomorrow?');
  expect(problems).toEqual([]);
});
