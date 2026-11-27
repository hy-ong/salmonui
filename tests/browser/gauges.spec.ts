import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Gauge, Barcode and QRCode behaviour on examples/vite-spa/gauges.html;
// axe and ARIA snapshots are in gauges-a11y.spec.ts.

const URL = `${DEV_URL}gauges.html`;

interface VizLog {
  events: { case: string; type: string; value: unknown; source?: string; reason?: string }[];
  invalid: string[];
}

declare global {
  interface Window {
    __viz: VizLog & { apis: Record<string, { element: Element | null; toDataURL(format?: string): Promise<string>; toBlob(format?: string): Promise<Blob>; toSVGString(): string } | null> };
    __hydrated?: boolean;
  }
}

const section = (page: Page, id: string): Locator => page.locator(`section[data-case="${id}"]`);
const events = (page: Page, c: string, type?: string) => page.evaluate(([c, type]) => window.__viz.events.filter((e) => e.case === c && (!type || e.type === type)), [c, type] as const);

async function load(page: Page, query = ''): Promise<string[]> {
  // The page also holds a GeoMap tile layer (geo-map.spec.ts); serve its fake tile host.
  await page.route('https://tiles.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
  const problems = collectProblems(page);
  await page.goto(`${URL}${query}`);
  await page.waitForSelector('section[data-case="qr"] svg');
  return problems;
}

test.describe('Gauge', () => {
  test('read-only pointers are meters with value text; draggable pointers are sliders', async ({ page }) => {
    const problems = await load(page);
    const meter = section(page, 'speed').getByRole('meter', { name: 'Speed' });
    await expect(meter).toHaveAttribute('aria-valuenow', '72');
    await expect(meter).toHaveAttribute('aria-valuetext', '72 km/h');
    await expect(meter).toHaveAttribute('aria-valuemin', '0');
    await expect(meter).toHaveAttribute('aria-valuemax', '100');
    const slider = section(page, 'controlled').getByRole('slider', { name: 'Volume' });
    await expect(slider).toHaveAttribute('aria-valuenow', '30');
    await expect(section(page, 'uncontrolled').getByRole('slider', { name: 'Temperature' })).toHaveAttribute('aria-orientation', 'horizontal');
    expect(problems).toEqual([]);
  });

  test('keyboard steps a controlled pointer and reports change and commit', async ({ page }) => {
    await load(page);
    const slider = section(page, 'controlled').getByRole('slider', { name: 'Volume' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '35');
    await page.keyboard.press('PageUp');
    await expect(slider).toHaveAttribute('aria-valuenow', '85');
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '100');
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    const commits = await events(page, 'controlled', 'commit');
    expect(commits.map((e) => e.value)).toEqual([35, 85, 100, 0]);
    expect(commits.every((e) => e.source === 'keyboard')).toBe(true);
  });

  test('pointer drag previews outside React state and commits once on release', async ({ page }) => {
    await load(page);
    const svg = section(page, 'controlled').locator('svg').first();
    const box = (await svg.boundingBox())!;
    const thumb = section(page, 'controlled').getByRole('slider', { name: 'Volume' });
    const t = (await thumb.boundingBox())!;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await page.mouse.down();
    // Drag to the top of the dial: the value at 12 o'clock is the middle of a 225..135 degree arc.
    await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 6 });
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    const changes = await events(page, 'controlled', 'change');
    const commits = await events(page, 'controlled', 'commit');
    expect(changes.length).toBeGreaterThan(1);
    expect(changes.every((e) => e.reason === 'drag' && e.source === 'pointer')).toBe(true);
    expect(commits).toHaveLength(1);
    expect(commits[0]!.reason).toBe('release');
    const v = commits[0]!.value as number;
    expect(v).toBeGreaterThan(60);
    expect(v).toBeLessThan(90);
    expect(v % 5).toBe(0);
    await expect(page.locator('#controlled-value')).toHaveText(String(v));
  });

  test('an uncontrolled linear marker keeps its committed value', async ({ page }) => {
    await load(page);
    const slider = section(page, 'uncontrolled').getByRole('slider', { name: 'Temperature' });
    await expect(slider).toHaveAttribute('aria-valuenow', '20');
    await slider.focus();
    await page.keyboard.press('ArrowUp');
    await expect(slider).toHaveAttribute('aria-valuenow', '20.5');
    const t = (await slider.boundingBox())!;
    const svg = (await section(page, 'uncontrolled').locator('svg').first().boundingBox())!;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(svg.x + svg.width * 0.25, t.y + t.height / 2, { steps: 5 });
    await page.mouse.up();
    const value = Number(await slider.getAttribute('aria-valuenow'));
    expect(value).toBeLessThan(10);
    expect((await events(page, 'uncontrolled', 'commit')).at(-1)!.value).toBe(value);
  });

  test('the range legend is a toolbar of toggle buttons that hide ranges', async ({ page }) => {
    await load(page);
    const legend = section(page, 'speed').getByRole('toolbar', { name: 'Ranges' });
    const high = legend.getByRole('button', { name: 'High' });
    await expect(high).toHaveAttribute('aria-pressed', 'true');
    await expect(section(page, 'speed').locator('[data-range="high"]')).toHaveCount(1);
    await high.click();
    await expect(high).toHaveAttribute('aria-pressed', 'false');
    await expect(section(page, 'speed').locator('[data-range="high"]')).toHaveCount(0);
    const hidden = await events(page, 'speed', 'hidden');
    expect(hidden.at(-1)!.value).toEqual(['high']);
    // Roving focus: arrows move between the toggles, Enter toggles.
    await legend.getByRole('button', { name: 'Normal' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(high).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(section(page, 'speed').locator('[data-range="high"]')).toHaveCount(1);
  });

  test('hovering a range shows its tooltip', async ({ page }) => {
    await load(page);
    const range = section(page, 'speed').locator('[data-range="critical"]');
    await range.hover({ force: true });
    const tip = section(page, 'speed').getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Critical');
    await page.mouse.move(0, 0);
    await expect(tip).toHaveCount(0);
  });

  test('a draggable range is a two-thumb slider for keyboard and pointer', async ({ page }) => {
    await load(page);
    const start = section(page, 'ranges').getByRole('slider', { name: 'Comfort band start' });
    const end = section(page, 'ranges').getByRole('slider', { name: 'Comfort band end' });
    await expect(start).toHaveAttribute('aria-valuenow', '40');
    await expect(start).toHaveAttribute('aria-valuemax', '70');
    await expect(end).toHaveAttribute('aria-valuemin', '40');
    await start.focus();
    await page.keyboard.press('ArrowRight');
    await expect(start).toHaveAttribute('aria-valuenow', '45');
    await expect(end).toHaveAttribute('aria-valuemin', '45');
    // End stops at the other thumb.
    await page.keyboard.press('End');
    await expect(start).toHaveAttribute('aria-valuenow', '70');
    await page.keyboard.press('ArrowRight');
    await expect(start).toHaveAttribute('aria-valuenow', '70');
    await page.keyboard.press('Home');
    await expect(start).toHaveAttribute('aria-valuenow', '0');
    const keys = await events(page, 'ranges', 'range');
    expect(keys.map((e) => e.value)).toEqual([['band', 45, 70], ['band', 70, 70], ['band', 0, 70]]);
    expect(keys.every((e) => e.source === 'keyboard' && e.reason === 'keyboard')).toBe(true);
    // Pointer: drag the end thumb to 3 o'clock (about 83 on a 225..135 arc, snapped to the step of 5).
    const box = (await section(page, 'ranges').locator('svg').first().boundingBox())!;
    const t = (await end.boundingBox())!;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 4 });
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    const moves = (await events(page, 'ranges', 'range')).slice(3);
    expect(moves.at(-1)!.reason).toBe('release');
    expect(moves.slice(0, -1).every((e) => e.reason === 'drag' && e.source === 'pointer')).toBe(true);
    const [, from, to] = moves.at(-1)!.value as [string, number, number];
    expect(from).toBe(0);
    expect(to % 5).toBe(0);
    expect(to).toBeGreaterThan(70);
    expect(to).toBeLessThan(95);
    await expect(page.locator('#ranges-value')).toHaveText(`0-${to}`);
    await expect(end).toHaveAttribute('aria-valuenow', String(to));
  });

  test('hovering an annotation shows its tooltip', async ({ page }) => {
    await load(page);
    await section(page, 'animated').locator('.salmon-gauge-annotation').hover();
    const tip = section(page, 'animated').getByRole('tooltip');
    await expect(tip).toHaveText('Peak load since restart');
    await page.mouse.move(0, 0);
    await expect(tip).toHaveCount(0);
  });

  test('pointers transition after hydration and jump under reduced motion', async ({ page }) => {
    const sample = (delay: number) =>
      page.evaluate((ms) => new Promise<string>((done) => setTimeout(() => done(document.querySelector('section[data-case="animated"] .salmon-gauge-pointer path')!.getAttribute('d')!), ms)), delay);
    // Reduced motion: the drawn path is the final one at once; it is the reference for the animated run.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await load(page);
    const at20 = await sample(0);
    await page.click('#animated-set');
    const at90 = await sample(0);
    expect(at90).not.toBe(at20);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await load(page);
    // Entrance: mid-transition the needle is not yet at its value, then it settles on the final markup.
    expect(await sample(60)).not.toBe(at20);
    expect(await sample(900)).toBe(at20);
    await page.click('#animated-set');
    await expect(section(page, 'animated').getByRole('meter', { name: 'Load' })).toHaveAttribute('aria-valuenow', '90');
    const mid = await sample(120);
    expect(mid).not.toBe(at20);
    expect(mid).not.toBe(at90);
    expect(await sample(900)).toBe(at90);
  });

  test('server markup hydrates without warnings', async ({ page }) => {
    const problems = await load(page, '?hydrate');
    expect(await page.evaluate(() => window.__hydrated)).toBe(true);
    await expect(section(page, 'speed').getByRole('meter', { name: 'Speed' })).toHaveAttribute('aria-valuenow', '72');
    expect(problems).toEqual([]);
  });
});

test.describe('Barcode and QRCode', () => {
  test('toDataURL, toBlob and toSVGString on Barcode and QRCode', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
      const b = window.__viz.apis['barcode']!;
      const q = window.__viz.apis['qr']!;
      const png = await b.toDataURL('png');
      const jpeg = await q.toBlob('jpeg');
      const svg = q.toSVGString();
      const img = new Image();
      img.src = png;
      await img.decode();
      return { png: png.slice(0, 22), jpeg: jpeg.type, jpegSize: jpeg.size, svg: svg.slice(0, 4), width: img.naturalWidth, element: b.element?.tagName };
    });
    expect(result.png).toBe('data:image/png;base64,');
    expect(result.jpeg).toBe('image/jpeg');
    expect(result.jpegSize).toBeGreaterThan(500);
    expect(result.svg).toBe('<svg');
    expect(result.width).toBeGreaterThan(100);
    expect(result.element).toBe('svg');
  });

  test('an invalid value calls onInvalid with the reason', async ({ page }) => {
    await load(page);
    await expect.poll(() => page.evaluate(() => window.__viz.invalid)).toContain('EAN-13 is numeric');
    await expect(section(page, 'barcode').getByRole('img', { name: 'Invalid barcode: EAN-13 is numeric' })).toBeAttached();
  });

  test('Pdf417, Gs1DataBar and DotCode from their own subpaths render, hydrate and export', async ({ page }) => {
    for (const query of ['', '?hydrate']) {
      const problems = await load(page, query);
      const stacked = section(page, 'stacked');
      await expect(stacked.getByRole('img', { name: 'PDF417 Symbology Standard' })).toHaveAttribute('data-type', 'pdf417');
      await expect(stacked.getByRole('img', { name: '0950110153000' })).toHaveAttribute('data-type', 'gs1DataBar');
      await expect(stacked.getByRole('img', { name: '0950110153000' }).locator('text')).toHaveText('(01)09501101530003');
      await expect(stacked.locator('svg[data-variant="expandedStacked"] path')).toHaveCount(1);
      await expect(stacked.getByRole('img', { name: '(17)070620(10)ABC123456' })).toHaveAttribute('data-type', 'dotCode');
      await expect(stacked.getByRole('img', { name: /^Invalid barcode: / })).toBeAttached();
      await expect.poll(() => page.evaluate(() => window.__viz.invalid.some((r) => r.startsWith('pdf417: ')))).toBe(true);
      const png = await page.evaluate(() => window.__viz.apis['pdf417']!.toDataURL('png'));
      expect(png.startsWith('data:image/png;base64,')).toBe(true);
      if (query) expect(await page.evaluate(() => window.__hydrated)).toBe(true);
      expect(problems).toEqual([]);
    }
  });

  test('symbols never mirror under dir="rtl"', async ({ page }) => {
    await load(page, '?dir=rtl');
    const dir = await section(page, 'barcode').locator('svg').first().evaluate((el) => getComputedStyle(el).direction);
    expect(dir).toBe('ltr');
    const first = await section(page, 'qr').locator('svg path').first().getAttribute('d');
    await load(page);
    expect(await section(page, 'qr').locator('svg path').first().getAttribute('d')).toBe(first);
  });
});
