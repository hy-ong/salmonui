import { expect, test, type Page } from '@playwright/test';

// RTL through the docs site CSS pipeline: Next.js
// compiles the @salmonui/* stylesheets with Lightning CSS for the
// `browserslist` targets of docs/site/package.json. A `:dir()` selector
// down-leveled into a `:lang()` list would never match `dir="rtl"`, so the
// demos are switched to right-to-left here and the mirrored result is
// measured, and no compiled rule may keep `:dir(` or its `:lang()` expansion.

async function open(page: Page, path: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBe(200);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  await page.waitForLoadState('networkidle');
  return problems;
}

/** Selectors of every style rule the page loaded. */
const selectors = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) out.push(rule.selectorText);
        if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
        // A cross-origin sheet (none expected) is not readable.
      }
    }
    return out;
  });

test('the compiled stylesheets keep no direction pseudo-class and no :lang() expansion of it', async ({ page }) => {
  const problems = await open(page, '/demos/notifications/progress-linear');
  const all = await selectors(page);
  expect(all.some((s) => s.includes('.salmon-progress'))).toBe(true);
  expect(all.filter((s) => /:dir\(/i.test(s))).toEqual([]);
  // Lightning CSS writes `:dir(rtl)` as a `:lang(ae, ar, arc, ...)` list.
  expect(all.filter((s) => /:lang\(\s*"?ae"?\s*[,)]/i.test(s))).toEqual([]);
  expect(problems).toEqual([]);
});

test('linear progress fills from the inline start and the indeterminate motion mirrors in RTL', async ({ page }) => {
  const problems = await open(page, '/demos/notifications/progress-linear');
  const upload = page.getByRole('progressbar', { name: 'Upload (buffer, value label)' });
  const fill = () =>
    upload.evaluate((el) => {
      const t = el.querySelector('.salmon-progress-track')!.getBoundingClientRect();
      const b = el.querySelector('.salmon-progress-bar')!.getBoundingClientRect();
      return { start: b.left - t.left, end: t.right - b.right, width: b.width, track: t.width, scale: getComputedStyle(el.querySelector('.salmon-progress-track')!).scale };
    });
  const ltr = await fill();
  expect(ltr.width).toBeGreaterThan(0);
  expect(ltr.width).toBeLessThan(ltr.track);
  expect(Math.abs(ltr.start)).toBeLessThan(1);
  await page.getByRole('checkbox', { name: 'Right to left' }).check();
  await expect(upload.locator('xpath=ancestor::*[@dir][1]')).toHaveAttribute('dir', 'rtl');
  const rtl = await fill();
  expect(rtl.scale).toBe('-1 1');
  expect(Math.abs(rtl.end)).toBeLessThan(1);
  expect(rtl.start).toBeGreaterThan(1);
  // Indeterminate: the first frame of the motion sits past the inline start (the right edge).
  await page.getByRole('checkbox', { name: 'Indeterminate' }).check();
  const bar = page.locator('.salmon-progress[data-indeterminate][data-shape="linear"]').first();
  await expect(bar).toBeVisible();
  const first = await bar.evaluate((el) => {
    const b = el.querySelector('.salmon-progress-bar')!;
    for (const a of b.getAnimations()) {
      a.pause();
      a.currentTime = 0;
    }
    return { bar: b.getBoundingClientRect().left, trackEnd: el.querySelector('.salmon-progress-track')!.getBoundingClientRect().right };
  });
  expect(first.bar).toBeGreaterThanOrEqual(first.trackEnd - 1);
  expect(problems).toEqual([]);
});

test('the skeleton wave mirrors in RTL', async ({ page }) => {
  const problems = await open(page, '/demos/notifications/skeleton-card');
  const wave = page.locator('.salmon-skeleton[data-animation="wave"]:not([data-lines])').first();
  await expect(wave).toBeAttached();
  const scale = () => wave.evaluate((el) => getComputedStyle(el, '::after').scale);
  expect(['1', '1 1']).toContain(await scale());
  await page.getByRole('checkbox', { name: 'Right to left' }).check();
  expect(await scale()).toBe('-1 1');
  expect(problems).toEqual([]);
});
