import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Progress and Meter in the browser:
// drawing from custom properties, RTL fill direction, indeterminate
// motion and reduced motion, value updates as attribute writes only,
// hydration and axe. Page: examples/vite-spa/progress.html.

const PAGE = `${DEV_URL}progress.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
  // Let the value transitions settle.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => !(a instanceof CSSAnimation)).map((a) => a.finished)));
}

const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test('the linear bar fills the value fraction from the inline start (LTR and RTL)', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page);
  const track = await box(page, '#linear .salmon-progress-track');
  const bar = await box(page, '#linear .salmon-progress-bar');
  expect(Math.abs(bar.width - track.width * 0.4)).toBeLessThan(1.5);
  expect(Math.abs(bar.x - track.x)).toBeLessThan(1);
  await expect(page.locator('#linear .salmon-progress-label')).toHaveText('40%');
  await open(page, '?dir=rtl');
  const rtlTrack = await box(page, '#linear .salmon-progress-track');
  const rtlBar = await box(page, '#linear .salmon-progress-bar');
  expect(Math.abs(rtlBar.x + rtlBar.width - (rtlTrack.x + rtlTrack.width))).toBeLessThan(1);
  expect(problems).toEqual([]);
});

test('the buffer layer is drawn behind the value', async ({ page }) => {
  await open(page);
  const track = await box(page, '#buffer .salmon-progress-track');
  const buffer = await box(page, '#buffer .salmon-progress-buffer');
  expect(Math.abs(buffer.width - track.width * 0.6)).toBeLessThan(1.5);
});

test('a value update writes the style and ARIA attributes only, no other DOM change', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const w = window as unknown as { __mutations: string[] };
    w.__mutations = [];
    new MutationObserver((records) => {
      for (const r of records) w.__mutations.push(r.type === 'attributes' ? `${(r.target as Element).className}:${r.attributeName}` : `${r.type}`);
    }).observe(document.querySelector('#linear')!, { attributes: true, subtree: true, childList: true, characterData: true });
  });
  await page.locator('#advance').click();
  await expect(page.locator('#linear')).toHaveAttribute('aria-valuenow', '60');
  const mutations = await page.evaluate(() => (window as unknown as { __mutations: string[] }).__mutations);
  // The root's style (one custom property), its value attributes and the visible label text.
  expect(mutations.filter((m) => !m.startsWith('characterData'))).toEqual(['salmon-progress:aria-valuenow', 'salmon-progress:aria-valuetext', 'salmon-progress:style']);
});

test('circular shapes draw an SVG arc of the value and center the label', async ({ page }) => {
  await open(page);
  const svg = await box(page, '#circular-big .salmon-progress-svg');
  expect([Math.round(svg.width), Math.round(svg.height)]).toEqual([96, 96]);
  const dash = await page.locator('#circular-big .salmon-progress-bar').evaluate((el) => getComputedStyle(el).strokeDasharray);
  expect(dash.replace(/px|calc\(|\)/g, '')).toBe('75, 200');
  const label = await box(page, '#circular-big .salmon-progress-label');
  expect(Math.abs(label.x + label.width / 2 - (svg.x + svg.width / 2))).toBeLessThan(1);
  expect(Math.abs(label.y + label.height / 2 - (svg.y + svg.height / 2))).toBeLessThan(1);
  await expect(page.locator('#circular-big .salmon-progress-label')).toHaveText('3/4');
});

test('the semicircle is half as tall as wide and draws half of the circle at most', async ({ page }) => {
  await open(page);
  const svg = await box(page, '#semicircle .salmon-progress-svg');
  expect(Math.round(svg.width)).toBe(64);
  expect(Math.round(svg.height)).toBe(32);
  const [track, bar] = await page.locator('#semicircle circle').evaluateAll((els) => els.map((el) => getComputedStyle(el).strokeDasharray.replace(/px|calc\(|\)/g, '')));
  expect([track, bar]).toEqual(['100, 200', '50, 200']);
});

test('indeterminate shapes animate on the shared keyframes; reduced motion shows a static state', async ({ page }) => {
  await open(page);
  const anim = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).animationName);
  expect(await anim('#indeterminate .salmon-progress-bar')).toBe('salmon-indeterminate');
  expect(await anim('#circular-spin .salmon-progress-svg')).toBe('salmon-spin');
  // The linear bar motion never reaches the SVG arc: it keeps its rotate
  // transform and stays inside the ring (a scaleX/translate would draw it
  // outside its own circle).
  expect(await anim('#circular-spin .salmon-progress-bar')).toBe('none');
  expect(await page.locator('#circular-spin .salmon-progress-bar').evaluate((el) => getComputedStyle(el).transform)).not.toContain('0.4');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  expect(await anim('#indeterminate .salmon-progress-bar')).toBe('none');
  expect(await anim('#circular-spin .salmon-progress-svg')).toBe('none');
  const track = await box(page, '#indeterminate .salmon-progress-track');
  const bar = await box(page, '#indeterminate .salmon-progress-bar');
  expect(bar.width).toBeGreaterThan(track.width * 0.3);
  expect(bar.width).toBeLessThan(track.width * 0.5);
});

test('segments mask the track; stripes texture the bar', async ({ page }) => {
  await open(page);
  expect(await page.locator('#segments .salmon-progress-track').evaluate((el) => getComputedStyle(el).maskImage)).toContain('repeating-linear-gradient');
  expect(await page.locator('#circular-seg .salmon-progress-svg').evaluate((el) => getComputedStyle(el).maskImage)).toContain('repeating-conic-gradient');
  // The linear segment mask is not applied to the circular track circle as well.
  expect(await page.locator('#circular-seg circle.salmon-progress-track').evaluate((el) => getComputedStyle(el).maskImage)).toBe('none');
  expect(await page.locator('#striped .salmon-progress-bar').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
});

test('Meter exposes role meter, value text and the range tone', async ({ page }) => {
  await open(page);
  const meter = page.getByRole('meter', { name: 'Disk usage' });
  await expect(meter).toHaveAttribute('aria-valuetext', '85 of 100 GB');
  await expect(meter).toHaveAttribute('data-tone', 'danger');
  await expect(page.getByRole('progressbar', { name: 'Connecting' })).not.toHaveAttribute('aria-valuenow', /./);
});

test('server-rendered markup hydrates without warnings', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate');
  await page.locator('#advance').click();
  await expect(page.locator('#linear')).toHaveAttribute('aria-valuenow', '60');
  expect(problems).toEqual([]);
});

for (const query of ['', '?scheme=dark', '?dir=rtl']) {
  test(`axe clean${query ? ` (${query.slice(1)})` : ''}`, async ({ page }) => {
    await open(page, query);
    await expectClean(page, `progress${query}`);
  });
}
