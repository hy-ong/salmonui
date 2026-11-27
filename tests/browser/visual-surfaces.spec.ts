import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Visual consistency of the Layout, Notifications, Chat and Editors families:
// surfaces use --salmon-radius-lg,
// standalone controls md, items inside containers sm, round-by-design parts
// full; never a raw px radius. Read from the shipped style rules so the
// check does not depend on opening each overlay.

async function radius(page: Page, selector: string): Promise<string | null> {
  return page.evaluate((sel) => {
    // The rules sit inside `@layer` blocks.
    const find = (rules: CSSRuleList): string | null => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText === sel && rule.style.borderRadius) return rule.style.borderRadius;
        if (rule instanceof CSSLayerBlockRule) {
          const found = find(rule.cssRules);
          if (found) return found;
        }
      }
      return null;
    };
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const found = find(rules);
      if (found) return found;
    }
    return null;
  }, selector);
}

const token = (level: 'sm' | 'md' | 'lg' | 'full') => new RegExp(`^var\\(--salmon-radius-${level}(, \\d+px)?\\)$`);

const CASES: ReadonlyArray<readonly [page: string, selector: string, level: 'sm' | 'md' | 'lg' | 'full']> = [
  ['dialog.html', '.salmon-dialog', 'lg'],
  ['dialog.html', '.salmon-dialog-close-button', 'md'],
  ['popover.html', '.salmon-popover', 'lg'],
  ['tooltip.html', '.salmon-tooltip', 'md'],
  ['dashboard-layout.html', '.salmon-dashboard-panel, .salmon-dashboard-placeholder', 'lg'],
  ['kanban.html', '.salmon-kanban-cell', 'lg'],
  ['kanban.html', '.salmon-kanban-card', 'md'],
  ['toast.html', '.salmon-toast', 'lg'],
  ['toast.html', '.salmon-toast button', 'md'],
  ['badge-message.html', '.salmon-message', 'lg'],
  ['progress.html', '.salmon-progress-track', 'full'],
  ['conversation.html', '.salmon-conversation', 'lg'],
  ['inline-assist.html', '.salmon-inline-assist', 'lg'],
  ['rich-text.html', '.salmon-rich-text', 'lg'],
  ['image-editor.html', '.salmon-image-editor', 'lg'],
  ['pdf-viewer.html', '.salmon-pdf-viewer', 'lg'],
];

test.describe('visual consistency: surface radius hierarchy', () => {
  for (const [file, selector, level] of CASES) {
    test(`${file} ${selector} uses radius ${level}`, async ({ page }) => {
      await page.goto(`${DEV_URL}${file}`);
      await page.waitForLoadState('networkidle');
      expect(await radius(page, selector)).toMatch(token(level));
    });
  }
});

test('Conversation header keeps its title visible at 390px; toolbar buttons do not wrap their labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${DEV_URL}conversation.html`);
  const header = page.locator('.salmon-conversation-header').first();
  await expect(header).toBeVisible();
  const m = await header.evaluate((h) => ({
    title: h.querySelector('.salmon-conversation-header__title')?.getBoundingClientRect().width ?? 0,
    buttons: Array.from(h.querySelectorAll('.salmon-conversation-header__toolbar > button')).map((b) => b.getBoundingClientRect().height),
  }));
  expect(m.title).toBeGreaterThan(80);
  for (const height of m.buttons) expect(height).toBeLessThanOrEqual(28);
});

test('Message and Toast success and danger glyphs stay inside the 16px icon box', async ({ page }) => {
  await page.goto(`${DEV_URL}badge-message.html`);
  const boxes = await page.locator(".salmon-message:is([data-tone='success'], [data-tone='danger']) .salmon-message-icon path").evaluateAll((paths) =>
    paths.map((p) => (p as SVGPathElement).getBBox()).map((b) => [b.x, b.y, b.x + b.width, b.y + b.height]),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const [x0, y0, x1, y1] of boxes) {
    expect(Math.min(x0!, y0!)).toBeGreaterThanOrEqual(1);
    expect(Math.max(x1!, y1!)).toBeLessThanOrEqual(15);
  }
});
