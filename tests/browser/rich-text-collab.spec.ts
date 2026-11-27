import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';
import { axe } from './axe.ts';

// `@salmonui/rich-text/collab` (page:
// examples/vite-spa/src/rich-text-collab.tsx): two editors on two Y.Docs
// connected in-page.

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

for (const variant of ['RichTextEditor', 'BlockEditor'] as const) {
  const query = variant === 'BlockEditor' ? '?block' : '';
  const content = (page: Page, peer: 'a' | 'b') => page.locator(`.peer-${peer} .salmon-rich-text-content[contenteditable="true"]`);
  // Text without the remote cursor widgets.
  const text = (page: Page, peer: 'a' | 'b') =>
    content(page, peer).evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.ProseMirror-yjs-cursor').forEach((c) => c.remove());
      return copy.textContent ?? '';
    });

  test.describe(`collaboration: ${variant}`, () => {
    test(`typing syncs, remote cursors carry the user name, undo is per user, axe is clean`, async ({ page }) => {
      const problems = collectProblems(page);
      await page.goto(`${DEV_URL}rich-text-collab.html${query}`);
      const a = content(page, 'a');
      const b = content(page, 'b');
      await expect.poll(() => text(page, 'a')).toContain('Shared text');
      await expect.poll(() => text(page, 'b')).toContain('Shared text');

      // Ann types at the end.
      await a.click();
      await page.keyboard.press('End');
      await page.keyboard.type(' from Ann');
      await expect.poll(() => text(page, 'b')).toContain('Shared text from Ann');

      // Bob types at the start; Ann sees Bob's cursor labelled with his name.
      await b.click();
      await page.keyboard.press('Home');
      await page.keyboard.type('Bob: ');
      await expect.poll(() => text(page, 'a')).toContain('Bob: Shared text from Ann');
      await expect(a.locator('.ProseMirror-yjs-cursor')).toContainText('Bob');
      await a.click();
      await page.keyboard.press('End');
      await expect(b.locator('.ProseMirror-yjs-cursor')).toContainText('Ann');

      // Bob's undo reverts only Bob's change.
      await b.click();
      await page.keyboard.press(`${MOD}+z`);
      await expect.poll(() => text(page, 'b')).toContain('Shared text from Ann');
      await expect.poll(() => text(page, 'b')).not.toContain('Bob:');
      await expect.poll(() => text(page, 'a')).not.toContain('Bob:');
      await expect.poll(() => text(page, 'a')).toContain('Shared text from Ann');
      // Redo brings it back on both sides.
      await page.keyboard.press(`${MOD}+Shift+z`);
      await expect.poll(() => text(page, 'a')).toContain('Bob: Shared text from Ann');

      const html = await page.evaluate(() => (window as unknown as { __collab: { html(): Promise<string[]> } }).__collab.html());
      expect(html[0]).toBe(html[1]);
      expect((await axe(page)).violations).toEqual([]);
      expect(problems).toEqual([]);
    });
  });
}
