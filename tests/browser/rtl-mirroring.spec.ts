import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// RTL mirroring without the `:dir()` pseudo-class:
// every family that mirrors a part CSS cannot express with a logical
// property reads the `--salmon-dir` sign (or, for `viz-rtl.css`, a
// `[dir='rtl']` attribute selector). Bundlers that down-level CSS rewrite
// `:dir()` into `:lang()` lists, so `dir="rtl"` would never match; the
// isolation check rejects `:dir(` in the stylesheets and these specs pin the
// mirrored result. Each probe copies a part of a vite-spa fixture page (or
// writes the part's markup) into three containers, `dir="ltr"`, `dir="rtl"`
// and an LTR island inside RTL, and reads one computed property in each.

type Probe = {
  /** Fixture page under examples/vite-spa (with its query). */
  readonly page: string;
  /** Copied element of the fixture page, or markup when it starts with `<`. */
  readonly source: string;
  /** Element read inside the copy; empty for the copied root. */
  readonly target?: string;
  readonly pseudo?: '::before' | '::after';
  readonly property: string;
};

type Read = { readonly ltr: string; readonly rtl: string; readonly island: string };

async function probe(page: Page, p: Probe): Promise<Read> {
  await page.goto(`${DEV_URL}${p.page}`);
  if (p.source.startsWith('<')) await page.waitForLoadState('networkidle');
  else await page.waitForSelector(p.source, { state: 'attached' });
  return page.evaluate(({ source, target, pseudo, property }) => {
    const html = source.startsWith('<') ? source : document.querySelector(source)!.outerHTML;
    const host = document.createElement('div');
    host.innerHTML = `<div dir="ltr" data-probe="ltr">${html}</div><div dir="rtl" data-probe="rtl">${html}</div><div dir="rtl"><div dir="ltr" data-probe="island">${html}</div></div>`;
    host.style.cssText = 'position: absolute; inset-block-start: 0; inset-inline-start: 0; inline-size: 600px; visibility: hidden';
    document.body.append(host);
    const read = (name: string) => {
      const box = host.querySelector(`[data-probe="${name}"]`)!;
      const el = target ? box.querySelector(target)! : box.firstElementChild!;
      return getComputedStyle(el, pseudo ?? null).getPropertyValue(property);
    };
    const out = { ltr: read('ltr'), rtl: read('rtl'), island: read('island') };
    host.remove();
    return out;
  }, { source: p.source, target: p.target ?? '', pseudo: p.pseudo ?? null, property: p.property });
}

/** The `a` and `b` entries of a computed `matrix(a, b, c, d, e, f)`. */
const matrix = (value: string) => {
  const m = value.match(/matrix\(([^)]+)\)/);
  if (!m) throw new Error(`not a matrix: ${value}`);
  const [a, b] = m[1]!.split(',').map(Number);
  return { a: a!, b: b! };
};

/** Mirrored in RTL and back to LTR in an LTR island. */
function expectMirrored(r: Read) {
  expect(r.rtl).not.toBe(r.ltr);
  expect(r.island).toBe(r.ltr);
}

test('no published stylesheet uses the direction pseudo-class', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto(`${DEV_URL}dialog.html`);
  await page.waitForSelector('#page');
  // Every stylesheet the packages publish (packages/*/dist/*.css), each parsed by Chromium.
  const root = new URL('../../packages/', import.meta.url);
  const sheets = readdirSync(root).flatMap((dir) => {
    const dist = new URL(`${dir}/dist/`, root);
    return existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith('.css')).map((f) => readFileSync(new URL(f, dist), 'utf8')) : [];
  });
  expect(sheets.length).toBeGreaterThan(50);
  for (const content of sheets) await page.addStyleTag({ content });
  const selectors = await page.evaluate(() => {
    const out: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) out.push(rule.selectorText);
        if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules);
    return out;
  });
  expect(selectors.length).toBeGreaterThan(500);
  expect(selectors.filter((s) => /:dir\(/i.test(s))).toEqual([]);
  expect(problems).toEqual([]);
});

test('Breadcrumbs: the default chevron mirrors', async ({ page }) => {
  const r = await probe(page, { page: 'breadcrumbs.html', source: '#basic', target: 'li[data-index="1"]', pseudo: '::before', property: 'transform' });
  expectMirrored(r);
  expect(Math.sign(matrix(r.ltr).a)).toBe(1);
  expect(Math.sign(matrix(r.rtl).a)).toBe(-1);
});

test('TreeView: collapsed and expanded twisties mirror', async ({ page }) => {
  const collapsed = await probe(page, { page: 'tree-view.html', source: '<div class="salmon-tree-view-item"><span class="salmon-tree-view-twisty"></span></div>', target: '.salmon-tree-view-twisty', pseudo: '::before', property: 'transform' });
  expectMirrored(collapsed);
  expect(matrix(collapsed.ltr).b).toBeGreaterThan(0);
  expect(matrix(collapsed.rtl).b).toBeLessThan(0);
  const expanded = await probe(page, { page: 'tree-view.html', source: '<div class="salmon-tree-view-item" data-expanded><span class="salmon-tree-view-twisty"></span></div>', target: '.salmon-tree-view-twisty', pseudo: '::before', property: 'transform' });
  expectMirrored(expanded);
  expect(matrix(expanded.ltr).b).toBeGreaterThan(0);
  expect(matrix(expanded.rtl).b).toBeLessThan(0);
});

test('Dialog: the drag offset mirrors', async ({ page }) => {
  const r = await probe(page, { page: 'dialog.html', source: '<dialog class="salmon-dialog" style="--salmon-dialog-x: 40px; --salmon-dialog-y: 10px"></dialog>', property: 'translate' });
  expect(r.ltr).toBe('40px 10px');
  expect(r.rtl).toBe('-40px 10px');
  expect(r.island).toBe(r.ltr);
});

test('Drawer: a start drawer slides in from the inline start', async ({ page }) => {
  for (const rtl of [false, true]) {
    await page.goto(`${DEV_URL}dialog.html${rtl ? '?dir=rtl' : ''}`);
    await page.waitForSelector('#page');
    // Slow the slide-in down so its first frame can be measured.
    await page.addStyleTag({ content: '.salmon-dialog.salmon-drawer { transition-duration: 60s !important; }' });
    await page.locator('#drawer-trigger').click();
    const d = page.locator('dialog[data-test=drawer]');
    await expect(d).toBeVisible();
    const b = (await d.boundingBox())!;
    // 280 px wide, docked at the inline start, still (almost) fully outside the viewport.
    if (rtl) expect(b.x).toBeGreaterThan(1280 - 20);
    else expect(b.x + b.width).toBeLessThan(20);
  }
});

test('Tabs: the scroll button chevron mirrors', async ({ page }) => {
  const r = await probe(page, { page: 'tabs.html', source: '#scroll', target: '.salmon-tab-scroll', pseudo: '::before', property: 'scale' });
  expectMirrored(r);
  expect(['1', '1 1']).toContain(r.ltr);
  expect(r.rtl).toBe('-1 1');
});

test('Progress: the linear track mirrors, so fill and indeterminate motion start at the inline start', async ({ page }) => {
  const r = await probe(page, { page: 'progress.html', source: '#indeterminate', target: '.salmon-progress-track', property: 'scale' });
  expectMirrored(r);
  expect(r.rtl).toBe('-1 1');
  for (const rtl of [false, true]) {
    await page.goto(`${DEV_URL}progress.html${rtl ? '?dir=rtl' : ''}`);
    await page.waitForSelector('#indeterminate');
    const at = await page.evaluate(() => {
      const bar = document.querySelector('#indeterminate .salmon-progress-bar')!;
      for (const a of bar.getAnimations()) {
        a.pause();
        a.currentTime = 0;
      }
      const t = document.querySelector('#indeterminate .salmon-progress-track')!.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      return { trackLeft: t.left, trackRight: t.right, barLeft: b.left, barRight: b.right };
    });
    // The first frame is just outside the inline start of the track.
    if (rtl) expect(at.barLeft).toBeGreaterThanOrEqual(at.trackRight - 1);
    else expect(at.barRight).toBeLessThanOrEqual(at.trackLeft + 1);
    // The value fill grows from the inline start.
    const fill = await page.evaluate(() => {
      const t = document.querySelector('#linear .salmon-progress-track')!.getBoundingClientRect();
      const b = document.querySelector('#linear .salmon-progress-bar')!.getBoundingClientRect();
      return { start: Math.abs(b.left - t.left), end: Math.abs(b.right - t.right) };
    });
    expect(rtl ? fill.end : fill.start).toBeLessThan(1);
  }
});

test('Skeleton: the wave mirrors', async ({ page }) => {
  const r = await probe(page, { page: 'spinner-skeleton.html', source: '#sk-text', pseudo: '::after', property: 'scale' });
  expectMirrored(r);
  expect(r.rtl).toBe('-1 1');
});

test('SidebarLayout: the built-in collapse icon mirrors', async ({ page }) => {
  const r = await probe(page, { page: 'sidebar-layout.html', source: '<button class="salmon-sidebar-trigger" data-action="collapse"><span class="salmon-sidebar-trigger__icon"></span></button>', target: '.salmon-sidebar-trigger__icon', property: 'scale' });
  expectMirrored(r);
  expect(r.rtl).toBe('-1 1');
});

test('Carousel: the previous and next chevrons mirror', async ({ page }) => {
  const previous = await probe(page, { page: 'carousel.html', source: '.salmon-carousel', target: '.salmon-carousel-previous .salmon-carousel-icon', property: 'rotate' });
  expectMirrored(previous);
  expect([previous.ltr, previous.rtl]).toEqual(['-45deg', '45deg']);
  const next = await probe(page, { page: 'carousel.html', source: '.salmon-carousel', target: '.salmon-carousel-next .salmon-carousel-icon', property: 'rotate' });
  expect([next.ltr, next.rtl, next.island]).toEqual(['135deg', '-135deg', '135deg']);
});

test('Kanban: the collapse toggle chevron mirrors', async ({ page }) => {
  const r = await probe(page, { page: 'kanban.html', source: '.salmon-kanban-toggle', target: 'svg', property: 'scale' });
  expectMirrored(r);
  expect(r.rtl).toBe('-1 1');
  const status = await probe(page, { page: 'kanban.html', source: '<div class="salmon-kanban-status"></div>', property: 'translate' });
  expectMirrored(status);
  expect(status.rtl).toBe('50% -50%');
});

test('ColorPicker: the saturation and hue gradients run toward the inline end', async ({ page }) => {
  const gradient = await probe(page, { page: 'inputs.html?only=color', source: '.salmon-color-area', property: 'background-image' });
  expectMirrored(gradient);
  expect(gradient.ltr).toContain('linear-gradient(90deg');
  expect(gradient.rtl).toContain('linear-gradient(-90deg');
});

test('Badge: the overlay offset mirrors for end and start placements', async ({ page }) => {
  const end = await probe(page, { page: 'badge-message.html', source: '<span class="salmon-badge-host"><span class="salmon-badge">3</span></span>', target: '.salmon-badge', property: 'translate' });
  expectMirrored(end);
  expect([end.ltr, end.rtl]).toEqual(['50% -50%', '-50% -50%']);
  const start = await probe(page, { page: 'badge-message.html', source: '<span class="salmon-badge-host" data-placement="topStart"><span class="salmon-badge">3</span></span>', target: '.salmon-badge', property: 'translate' });
  expectMirrored(start);
  expect([start.ltr, start.rtl]).toEqual(['-50% -50%', '50% -50%']);
});

test('Toast: the countdown shrinks toward the inline end', async ({ page }) => {
  const r = await probe(page, { page: 'toast.html', source: '<div class="salmon-toast-progress" style="inline-size: 100px; animation: none"></div>', property: 'transform-origin' });
  expectMirrored(r);
  expect(r.ltr.split(' ')[0]).toBe('100px');
  expect(r.rtl.split(' ')[0]).toBe('0px');
});

test('Pager: the built-in arrows mirror', async ({ page }) => {
  const next = await probe(page, { page: 'pager.html', source: '.salmon-pager', target: '[data-part="next"] > .salmon-pager-icon', pseudo: '::before', property: 'scale' });
  expectMirrored(next);
  expect(next.rtl).toBe('-1 1');
  // Previous and first draw the mirrored glyph in LTR.
  const previous = await probe(page, { page: 'pager.html', source: '.salmon-pager', target: '[data-part="previous"] > .salmon-pager-icon', pseudo: '::before', property: 'scale' });
  expect([previous.ltr, previous.island]).toEqual(['-1 1', '-1 1']);
  expect(['1', '1 1']).toContain(previous.rtl);
});

test('Button: centered floating buttons stay centered', async ({ page }) => {
  const r = await probe(page, { page: 'buttons.html', source: '<button class="salmon-button" data-floating="bottomCenter"></button>', property: 'translate' });
  expectMirrored(r);
  expect([r.ltr, r.rtl]).toEqual(['-50%', '50%']);
  const middle = await probe(page, { page: 'buttons.html', source: '<button class="salmon-button" data-floating="middleCenter"></button>', property: 'translate' });
  expectMirrored(middle);
  expect([middle.ltr, middle.rtl]).toEqual(['-50% -50%', '50% -50%']);
});

test('viz-rtl.css: drawn titles anchor at the inline end under an RTL ancestor', async ({ page }) => {
  const r = await probe(page, { page: 'data-visualization.html', source: '.salmon-viz:has(.salmon-viz-title)', target: '.salmon-viz-title', property: 'text-anchor' });
  expect(r.ltr).not.toBe('end');
  expect(r.rtl).toBe('end');
  // A page-level opt-in: the attribute selector matches any RTL ancestor.
  expect(r.island).toBe('end');
});
