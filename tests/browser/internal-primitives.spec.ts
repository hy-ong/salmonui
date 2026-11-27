import { expect, test, type Page } from '@playwright/test';
import { build, type Rollup } from 'vite';
import { collectProblems } from './helpers.ts';

// Internal primitives in Chromium:
// overlay placement and top layer, the dismiss layer stack, focus scope and
// restore, controllable state and press-and-hold repeat. The fixture
// (fixtures/internal-primitives.tsx) is bundled here from the built dist
// and served on a routed origin, so no example app changes.

const ORIGIN = 'http://primitives.test';
let script = '';

test.beforeAll(async () => {
  // Vite (already the examples' bundler) in memory; development React for the dev warnings.
  const result = (await build({
    configFile: false,
    logLevel: 'silent',
    mode: 'development',
    define: { 'process.env.NODE_ENV': '"development"' },
    build: { write: false, minify: false, emptyOutDir: false, rollupOptions: { input: new URL('./fixtures/internal-primitives.tsx', import.meta.url).pathname, output: { format: 'es' } } },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[];
  const output = Array.isArray(result) ? (result[0] as Rollup.RollupOutput).output : result.output;
  script = (output.find((o) => o.type === 'chunk' && o.isEntry) as Rollup.OutputChunk).code;
});

async function open(page: Page, query: string, dir: 'ltr' | 'rtl' = 'ltr'): Promise<void> {
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: script });
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><style>body{margin:0}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`,
    });
  });
  await page.goto(`${ORIGIN}/?${query}`);
  await page.locator('#root > *').first().waitFor();
}

const rect = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) };
  });

const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
const log = (page: Page) => page.evaluate(() => window.__log);

test.describe('internal position and overlay', () => {
  test('places the box at each placement and shows it in the top layer', async ({ page }) => {
    const problems = collectProblems(page);
    const cases: [string, (a: { left: number; top: number; right: number; bottom: number }) => { left: number; top: number }][] = [
      ['bottom-start', (a) => ({ left: a.left, top: a.bottom + 4 })],
      ['bottom-end', (a) => ({ left: a.right - 200, top: a.bottom + 4 })],
      ['top', (a) => ({ left: a.left - 50, top: a.top - 4 - 100 })],
      ['right-start', (a) => ({ left: a.right + 4, top: a.top })],
      ['left-end', (a) => ({ left: a.left - 4 - 200, top: a.bottom - 100 })],
    ];
    for (const [placement, expected] of cases) {
      await open(page, `scenario=position&placement=${placement}`);
      await page.locator('#anchor').click();
      const a = await rect(page, '#anchor');
      const b = await rect(page, '#box');
      expect({ left: b.left, top: b.top }, placement).toEqual(expected(a));
      expect(await page.locator('#box').getAttribute('data-placement')).toBe(placement);
      expect(await page.locator('#box').evaluate((el) => el.matches(':popover-open'))).toBe(true);
    }
    expect(problems).toEqual([]);
  });

  test('flips near the viewport edge, mirrors in RTL, anchors to a point, follows scroll', async ({ page }) => {
    await open(page, 'scenario=position&placement=bottom-start&top=740');
    await page.locator('#anchor').click();
    expect(await page.locator('#box').getAttribute('data-placement')).toBe('top-start');
    expect((await rect(page, '#box')).bottom).toBe((await rect(page, '#anchor')).top - 4);

    await open(page, 'scenario=position&placement=bottom-start', 'rtl');
    await page.locator('#anchor').click();
    expect((await rect(page, '#box')).right).toBe((await rect(page, '#anchor')).right);

    await open(page, 'scenario=position&point=1');
    await page.locator('#anchor').click();
    expect(await rect(page, '#box')).toMatchObject({ left: 120, top: 84 });

    // A tall page: the overlay follows its anchor on scroll.
    await open(page, 'scenario=position&placement=bottom-start&top=300');
    await page.evaluate(() => (document.body.style.height = '3000px'));
    await page.locator('#anchor').click();
    await page.evaluate(() => window.scrollBy(0, 100));
    await expect.poll(async () => (await rect(page, '#box')).top).toBe((await rect(page, '#anchor')).bottom + 4);
  });
});

test.describe('internal dismiss stack and focus scope', () => {
  test('Escape closes the top layer only; focus returns to each opener', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'scenario=dismiss');
    await page.locator('#trigger').click();
    expect(await focusedId(page)).toBe('p1');
    await page.locator('#open-child').click();
    expect(await focusedId(page)).toBe('c1');
    await page.keyboard.press('Escape');
    await expect(page.locator('#child')).toHaveCount(0);
    await expect(page.locator('#parent')).toHaveCount(1);
    expect(await focusedId(page)).toBe('open-child');
    // Content that handles Escape itself keeps the layer open.
    await page.locator('#escape-eater').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#parent')).toHaveCount(1);
    await page.locator('#p1').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#parent')).toHaveCount(0);
    expect(await focusedId(page)).toBe('trigger');
    expect(await log(page)).toEqual(['child:escape', 'parent:escape']);
    expect(problems).toEqual([]);
  });

  test('outside press: a child press is inside the parent; a parent press closes the child only; the trigger is inside', async ({ page }) => {
    await open(page, 'scenario=dismiss');
    await page.locator('#trigger').click();
    await page.locator('#open-child').click();
    await page.locator('#c2').click();
    await expect(page.locator('#child')).toHaveCount(1);
    await page.locator('#p1').click();
    await expect(page.locator('#child')).toHaveCount(0);
    await expect(page.locator('#parent')).toHaveCount(1);
    // The trigger counts as inside: its own click toggles the layer closed (no dismiss + reopen).
    await page.locator('#trigger').click();
    await expect(page.locator('#parent')).toHaveCount(0);
    await page.locator('#trigger').click();
    await page.locator('#outside').click();
    await expect(page.locator('#parent')).toHaveCount(0);
    // A press elsewhere keeps its own focus (no restore to the trigger).
    expect(await focusedId(page)).toBe('outside');
    expect(await log(page)).toEqual(['child:outside', 'parent:outside']);
  });

  test('Tab is contained in a contain scope and leaves a leave scope', async ({ page }) => {
    await open(page, 'scenario=dismiss&contain=1');
    await page.locator('#trigger').click();
    expect(await focusedId(page)).toBe('p1');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('escape-eater');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('p1');
    await page.keyboard.press('Shift+Tab');
    expect(await focusedId(page)).toBe('escape-eater');

    await open(page, 'scenario=dismiss');
    await page.locator('#trigger').click();
    await page.locator('#escape-eater').focus();
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).not.toBe('p1');
  });
});

test.describe('internal controllable state and press repeat', () => {
  test('uncontrolled toggles; controlled proposes and can veto; switching modes warns', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'scenario=controllable');
    await page.locator('#uncontrolled').click();
    await expect(page.locator('#uncontrolled')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#controlled').click();
    await page.locator('#controlled').click();
    await expect(page.locator('#controlled')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#allow').click();
    await page.locator('#controlled').click();
    await expect(page.locator('#controlled')).toHaveAttribute('aria-pressed', 'true');
    expect(await log(page)).toEqual(['uncontrolled:true', 'controlled:true', 'controlled:true', 'controlled:true']);
    expect(problems).toEqual([]);
    await page.locator('#switch').click();
    await expect.poll(() => problems.join('\n')).toContain('changing switching from uncontrolled to controlled');
  });

  test('press-and-hold repeats after the delay and stops on release, leave and key up', async ({ page }) => {
    await open(page, 'scenario=press');
    const spin = page.locator('#spin');
    await spin.hover();
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    const held = await page.evaluate(() => window.__count);
    expect(held).toBeGreaterThanOrEqual(4);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__count)).toBe(held);
    expect((await log(page))[0]).toBe('pointer:false');

    // Pointer leave stops the repeat.
    await page.mouse.down();
    await page.locator('#elsewhere').hover();
    const left = await page.evaluate(() => window.__count);
    await page.waitForTimeout(500);
    await page.mouse.up();
    expect(await page.evaluate(() => window.__count)).toBe(left);

    // Keyboard: one press per key down, repeating while held.
    await spin.focus();
    const before = await page.evaluate(() => window.__count);
    await page.keyboard.down('Enter');
    await page.waitForTimeout(450);
    await page.keyboard.up('Enter');
    const after = await page.evaluate(() => window.__count);
    expect(after - before).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__count)).toBe(after);
    expect(await log(page)).toContain('keyboard:false');
  });
});
