import { expect, test } from '@playwright/test';
import { collectProblems, SSR_URL } from './helpers.ts';

// Kanban in the Vite SSR example (`?kanban`, examples/vite-ssr/src/Kanban.tsx):
// the board, its swimlanes, limits and selection are in the server HTML, no
// editor or tooltip renders on the server, and hydration in StrictMode
// development mode reports no warning or recoverable error.

test('Kanban server renders and hydrates without warnings', async ({ page }) => {
  const problems = collectProblems(page);
  const url = `${SSR_URL}?kanban`;
  const html = await (await page.request.get(url)).text();
  expect(html).toMatch(/role="grid"[^>]*aria-label="Sprint board"/);
  expect([...html.matchAll(/class="salmon-kanban-card"/g)].length).toBe(5);
  expect([...html.matchAll(/role="rowgroup" class="salmon-kanban-lane"/g)].length).toBe(2);
  expect(html).toContain('class="salmon-kanban-group"');
  expect(html).toMatch(/data-card="sk3"[^>]*aria-selected="true"/);
  expect(html).toMatch(/salmon-kanban-column-header"[^>]*data-column="doing"[^>]*data-limit="over"/);
  expect(html).not.toContain('salmon-kanban-editor');
  expect(html).not.toContain('role="tooltip"');

  await page.goto(url);
  await page.waitForFunction(() => window.__hydrated === true);
  await page.waitForTimeout(200);
  const board = page.locator('#ssr-kanban');
  await expect(board.locator('[data-card="sk3"]')).toHaveAttribute('aria-selected', 'true');
  // Interactive after hydration: keyboard, the lazy editor and the lazy drag chunk.
  await board.locator('[data-card="sk1"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(board.locator('[data-card="sk3"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog.salmon-kanban-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.salmon-kanban-editor')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-keyboard-drag', '');
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
});
