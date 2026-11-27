import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Slider and SignaturePad in the browser.
// Page: examples/vite-spa/inputs.html?only=slider,signature.

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html?only=slider,signature${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
}
const events = (page: Page, kind: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const forms = (page: Page, id: string) => page.evaluate((k) => window.__inputForms?.[k] ?? null, id);
const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
const inputs = (page: Page, id: string) => page.locator(`#${id} input[type="range"]`);

/** Client point at `fraction` along the track of slider `id` (0 = inline start, or bottom for vertical). */
async function at(page: Page, id: string, fraction: number, rtl = false): Promise<{ x: number; y: number }> {
  await page.locator(`#${id} .salmon-slider-track`).scrollIntoViewIfNeeded();
  const box = (await page.locator(`#${id} .salmon-slider-track`).boundingBox())!;
  const vertical = (await page.locator(`#${id}`).getAttribute('data-orientation')) === 'vertical';
  if (vertical) return { x: box.x + box.width / 2, y: box.y + box.height * (1 - fraction) };
  return { x: box.x + box.width * (rtl ? 1 - fraction : fraction), y: box.y + box.height / 2 };
}
const cssVar = (loc: Locator, name: string) => loc.evaluate((el, n) => (el as HTMLElement).style.getPropertyValue(n), name);

test.describe('Slider', () => {
  test('an uncontrolled drag moves the thumb with zero React renders; one commit on pointerup', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const root = page.locator('#sld-basic');
    const input = inputs(page, 'sld-basic');
    await expect(input).toHaveValue('40');
    await expect(input).toHaveAttribute('aria-valuetext', '40');
    const start = await at(page, 'sld-basic', 0.5);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await frame(page);
    const renders = await page.evaluate(() => window.__sliderRenders);
    for (let f = 0.5; f <= 0.8001; f += 0.05) {
      const p = await at(page, 'sld-basic', f);
      await page.mouse.move(p.x, p.y, { steps: 3 });
    }
    await frame(page);
    await expect(input).toHaveValue('80');
    await expect(input).toHaveAttribute('aria-valuetext', '80');
    expect(await cssVar(root, '--salmon-slider-end')).toBe('80%');
    await expect(root.locator('.salmon-slider-value-label')).toHaveText('80');
    await expect(input).toBeFocused();
    // Zero React renders while dragging an uncontrolled slider.
    expect(await page.evaluate(() => window.__sliderRenders)).toBe(renders);
    const changes = await events(page, 'slider');
    expect(changes.at(-1)).toEqual({ kind: 'slider', value: 80, source: 'pointer', reason: 'drag' });
    expect(await events(page, 'slider-commit')).toEqual([]);
    await page.mouse.up();
    await frame(page);
    expect(await events(page, 'slider-commit')).toEqual([{ kind: 'slider-commit', value: 80, source: 'pointer', reason: 'drag' }]);
    expect(await page.evaluate(() => window.__sliderRenders)).toBeGreaterThan(renders!);
    expect(problems).toEqual([]);
  });

  test('onValueChange fires at most once per frame during a drag', async ({ page }) => {
    await open(page);
    const p0 = await at(page, 'sld-basic', 0.1);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    // 30 moves dispatched inside one task (one frame): one change after the frame.
    const before = (await events(page, 'slider')).length;
    const box = (await page.locator('#sld-basic .salmon-slider-track').boundingBox())!;
    await page.evaluate(
      ({ x, y, w }) => {
        const target = document.querySelector('#sld-basic .salmon-slider-control')!;
        for (let i = 1; i <= 30; i++) target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: x + (w * (10 + i)) / 100, clientY: y }));
      },
      { x: box.x, y: box.y + box.height / 2, w: box.width },
    );
    await frame(page);
    const after = await events(page, 'slider');
    expect(after.length - before).toBe(1);
    expect(after.at(-1)!['value']).toBe(40);
    await page.mouse.up();
  });

  test('APG keys by step, PageUp / PageDown, Home / End; commit on key-up', async ({ page }) => {
    await open(page);
    const input = inputs(page, 'sld-basic');
    await input.focus();
    await page.keyboard.press('ArrowRight');
    await expect(input).toHaveValue('41');
    await page.keyboard.press('ArrowUp');
    await expect(input).toHaveValue('42');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown');
    await expect(input).toHaveValue('40');
    await page.keyboard.press('PageUp');
    await expect(input).toHaveValue('50');
    await page.keyboard.press('PageDown');
    await expect(input).toHaveValue('40');
    await page.keyboard.press('End');
    await expect(input).toHaveValue('100');
    await page.keyboard.press('Home');
    await expect(input).toHaveValue('0');
    expect((await events(page, 'slider')).at(-1)).toEqual({ kind: 'slider', value: 0, source: 'keyboard', reason: 'keyboard' });
    expect((await events(page, 'slider-commit')).at(-1)).toEqual({ kind: 'slider-commit', value: 0, source: 'keyboard', reason: 'keyboard' });
    expect((await events(page, 'slider-commit')).length).toBe(8);
    // Currency aria-valuetext from formatOptions; step 5.
    const range = inputs(page, 'sld-range');
    await expect(range.first()).toHaveAttribute('aria-valuetext', '$20');
    await range.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(range.first()).toHaveValue('25');
    await expect(range.first()).toHaveAttribute('aria-valuetext', '$25');
  });

  test('RTL mirrors horizontal arrows and pointer positions; vertical does not mirror', async ({ page }) => {
    await open(page, '&dir=rtl');
    const input = inputs(page, 'sld-basic');
    await input.focus();
    await page.keyboard.press('ArrowRight');
    await expect(input).toHaveValue('39');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(input).toHaveValue('41');
    // 90 % from the inline start is near the left edge in RTL.
    const p = await at(page, 'sld-basic', 0.9, true);
    await page.mouse.click(p.x, p.y);
    await expect(input).toHaveValue('90');
    const thumb = (await page.locator('#sld-basic .salmon-slider-thumb').boundingBox())!;
    const track = (await page.locator('#sld-basic .salmon-slider-track').boundingBox())!;
    expect(Math.abs(thumb.x + thumb.width / 2 - (track.x + track.width * 0.1))).toBeLessThan(2);
    const vertical = inputs(page, 'sld-vertical');
    await vertical.focus();
    await page.keyboard.press('ArrowRight');
    await expect(vertical).toHaveValue('26');
  });

  test('range thumbs keep minStepsBetweenThumbs and never cross; the nearest thumb follows the pointer', async ({ page }) => {
    await open(page);
    const [startInput, endInput] = [inputs(page, 'sld-range').nth(0), inputs(page, 'sld-range').nth(1)];
    await expect(startInput).toHaveAccessibleName('Price Minimum');
    await expect(endInput).toHaveAccessibleName('Price Maximum');
    await startInput.focus();
    await page.keyboard.press('End');
    await expect(startInput).toHaveValue('50');
    await endInput.focus();
    await page.keyboard.press('Home');
    await expect(endInput).toHaveValue('60');
    // Pointer near the end thumb drags it; it stops 10 above the start.
    const p = await at(page, 'sld-range', 0.62);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    const q = await at(page, 'sld-range', 0.1);
    await page.mouse.move(q.x, q.y, { steps: 5 });
    await page.mouse.up();
    await expect(endInput).toHaveValue('60');
    await expect(startInput).toHaveValue('50');
    const r = await at(page, 'sld-range', 0.9);
    await page.mouse.click(r.x, r.y);
    await expect(endInput).toHaveValue('90');
    expect((await events(page, 'range-commit')).at(-1)).toEqual({ kind: 'range-commit', value: [50, 90] });
    const t = await at(page, 'sld-range', 0.05);
    await page.mouse.click(t.x, t.y);
    await expect(startInput).toHaveValue('5');
    expect((await events(page, 'range')).at(-1)).toMatchObject({ value: [5, 90], thumb: 0, source: 'pointer' });
  });

  test('values entries, name submitted per thumb, form reset', async ({ page }) => {
    await open(page);
    const size = inputs(page, 'sld-values');
    await expect(size).toHaveAttribute('aria-valuetext', 'M');
    await size.focus();
    await page.keyboard.press('ArrowRight');
    await expect(size).toHaveAttribute('aria-valuetext', 'L');
    expect((await events(page, 'values')).at(-1)).toEqual({ kind: 'values', value: 'L' });
    await page.locator('#sld-submit').click();
    expect(await forms(page, 'sld-form')).toEqual([
      ['volume', '40'],
      ['price', '20'],
      ['price', '60'],
      ['size', 'L'],
    ]);
    await inputs(page, 'sld-basic').focus();
    await page.keyboard.press('End');
    await page.locator('#sld-reset').click();
    await expect(inputs(page, 'sld-basic')).toHaveValue('40');
    await expect(size).toHaveAttribute('aria-valuetext', 'M');
    expect(await cssVar(page.locator('#sld-basic'), '--salmon-slider-end')).toBe('40%');
  });

  test('limits bound each thumb; a fixed thumb does not move and the pointer takes the other', async ({ page }) => {
    await open(page);
    const [s, e] = [inputs(page, 'sld-limits').nth(0), inputs(page, 'sld-limits').nth(1)];
    await s.focus();
    await page.keyboard.press('Home');
    await expect(s).toHaveValue('10');
    await page.keyboard.press('End');
    await expect(s).toHaveValue('40');
    await e.focus();
    await page.keyboard.press('Home');
    await expect(e).toHaveValue('60');
    await page.keyboard.press('End');
    await expect(e).toHaveValue('90');
    const [fs, fe] = [inputs(page, 'sld-fixed').nth(0), inputs(page, 'sld-fixed').nth(1)];
    await fs.focus();
    await page.keyboard.press('ArrowRight');
    await expect(fs).toHaveValue('30');
    const p = await at(page, 'sld-fixed', 0.2);
    await page.mouse.click(p.x, p.y);
    await expect(fs).toHaveValue('30');
    await expect(fe).toHaveValue('30');
  });

  test('vertical slider grows upward; pointer and arrows', async ({ page }) => {
    await open(page);
    const v = inputs(page, 'sld-vertical');
    await expect(v).toHaveAttribute('aria-orientation', 'vertical');
    const p = await at(page, 'sld-vertical', 0.75);
    await page.mouse.click(p.x, p.y);
    await expect(v).toHaveValue('75');
    await page.keyboard.press('ArrowDown');
    await expect(v).toHaveValue('74');
    const thumb = (await page.locator('#sld-vertical .salmon-slider-thumb').boundingBox())!;
    const track = (await page.locator('#sld-vertical .salmon-slider-track').boundingBox())!;
    expect(Math.abs(thumb.y + thumb.height / 2 - (track.y + track.height * 0.26))).toBeLessThan(2);
    // Ticks on both sides with custom labels.
    await expect(page.locator('#sld-vertical .salmon-slider-ticks')).toHaveCount(2);
    await expect(page.locator('#sld-vertical .salmon-slider-ticks[data-side="after"] .salmon-slider-tick-label').first()).toHaveText('0%');
  });

  test('value labels show always, on focus, with format and placement', async ({ page }) => {
    await open(page);
    await expect(page.locator('#sld-basic .salmon-slider-value-label')).toBeVisible();
    // An always-visible bubble above the thumb gets its own space: it never
    // covers the field label.
    const bubble = (await page.locator('#sld-basic .salmon-slider-value-label').boundingBox())!;
    const fieldLabel = (await page.locator('#sld-basic .salmon-field-label').boundingBox())!;
    expect(bubble.y).toBeGreaterThanOrEqual(fieldLabel.y + fieldLabel.height);
    const label = page.locator('#sld-label .salmon-slider-value-label');
    await expect(label).toHaveText('50 percent');
    await expect(label).toHaveAttribute('data-placement', 'after');
    await expect(label).toBeHidden();
    await inputs(page, 'sld-label').focus();
    await page.keyboard.press('ArrowRight');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('60 percent');
    await expect(inputs(page, 'sld-label')).toHaveValue('0.6');
  });

  test('controlled slider follows its owner (which clamps at 80); disabled and read-only', async ({ page }) => {
    await open(page);
    const c = inputs(page, 'sld-controlled');
    await c.focus();
    await page.keyboard.press('End');
    await expect(page.locator('#sld-controlled-out')).toHaveText('80');
    await expect(c).toHaveValue('80');
    const p = await at(page, 'sld-controlled', 0.95);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.up();
    await frame(page);
    await expect(c).toHaveValue('80');
    expect(await cssVar(page.locator('#sld-controlled'), '--salmon-slider-end')).toBe('80%');
    await expect(inputs(page, 'sld-disabled')).toBeDisabled();
    // read-only stays focusable and ignores keys and the pointer.
    const ro = inputs(page, 'sld-readonly');
    await ro.focus();
    await expect(ro).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(ro).toHaveValue('20');
    const q = await at(page, 'sld-readonly', 0.9);
    await page.mouse.click(q.x, q.y);
    await expect(ro).toHaveValue('20');
    await expect(ro).toHaveAttribute('aria-readonly', 'true');
  });

  test('one Slider pointermove frame costs ≤ 1 ms', { tag: '@perf' }, async ({ page }) => {
    await open(page);
    const box = (await page.locator('#sld-basic .salmon-slider-track').boundingBox())!;
    const p0 = await at(page, 'sld-basic', 0.2);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    const ms = await page.evaluate(async ({ x, y, w }) => {
      const target = document.querySelector('#sld-basic .salmon-slider-control')!;
      const samples: number[] = [];
      const raf = window.requestAnimationFrame;
      for (let i = 0; i < 40; i++) {
        let frameMs = 0;
        // Time the component's frame callback.
        window.requestAnimationFrame = (cb) => raf((t) => {
          const s = performance.now();
          cb(t);
          frameMs = performance.now() - s;
        });
        const t = performance.now();
        target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: x + (w * (20 + i)) / 100, clientY: y }));
        const handler = performance.now() - t;
        window.requestAnimationFrame = raf;
        await new Promise((r) => raf(() => raf(() => r(null))));
        samples.push(handler + frameMs);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)]!;
    }, { x: box.x, y: box.y + box.height / 2, w: box.width });
    await page.mouse.up();
    expectBudget(ms, 1, 'Slider pointermove frame median');
  });

  test('slider and signature pad server markup hydrates with zero warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '&hydrate');
    await inputs(page, 'sld-basic').focus();
    await page.keyboard.press('ArrowRight');
    await expect(inputs(page, 'sld-basic')).toHaveValue('41');
    await expect(page.locator('#sig-basic canvas')).toHaveAttribute('aria-label', 'Signature, empty');
    expect(problems).toEqual([]);
  });
});

/** Draws a zigzag on the canvas of pad `id`. */
async function draw(page: Page, id: string, from = 0.2, to = 0.8): Promise<void> {
  await page.locator(`#${id} canvas`).scrollIntoViewIfNeeded();
  const box = (await page.locator(`#${id} canvas`).boundingBox())!;
  await page.mouse.move(box.x + box.width * from, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (from + ((to - from) * i) / 8), box.y + box.height * (i % 2 ? 0.3 : 0.7), { steps: 2 });
  await page.mouse.up();
}
/** Opaque pixels of the canvas of pad `id` (ignoring the background color). */
const inked = (page: Page, id: string, background = [255, 255, 255]) =>
  page.locator(`#${id} canvas`).evaluate((c: HTMLCanvasElement, bg) => {
    const d = ((src: HTMLCanvasElement) => { const t = document.createElement('canvas'); t.width = src.width; t.height = src.height; const x = t.getContext('2d', { willReadFrequently: true })!; x.drawImage(src, 0, 0); return x; })(c).getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 0 && (d[i] !== bg[0] || d[i + 1] !== bg[1] || d[i + 2] !== bg[2])) n++;
    return n;
  }, background);

test.describe('SignaturePad', () => {
  test('a mouse stroke draws, reports, names the canvas signed and submits a PNG data URL', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const canvas = page.locator('#sig-basic canvas');
    await expect(canvas).toHaveAttribute('role', 'img');
    await expect(canvas).toHaveAccessibleName('Signature Signature, empty');
    expect(await inked(page, 'sig-basic')).toBe(0);
    await draw(page, 'sig-basic');
    expect(await inked(page, 'sig-basic')).toBeGreaterThan(50);
    expect((await events(page, 'signature')).at(-1)).toEqual({ kind: 'signature', empty: false, prefix: 'data:image/png;base64,', action: 'stroke', source: 'pointer' });
    await expect(canvas).toHaveAttribute('aria-label', 'Signature, signed');
    await expect(canvas).toBeFocused();
    expect(await canvas.evaluate((c) => getComputedStyle(c).touchAction)).toBe('none');
    expect(await page.locator('#sig-basic').evaluate((c) => getComputedStyle(c).touchAction)).toBe('auto');
    await page.locator('#sig-submit').click();
    const entries = (await forms(page, 'sig-form'))!;
    expect(entries[0]![0]).toBe('signature');
    expect(entries[0]![1].startsWith('data:image/png;base64,')).toBe(true);
    expect(problems).toEqual([]);
  });

  test('Mod+Z / Mod+Shift+Z undo and redo strokes; clear and isEmpty', async ({ page }) => {
    await open(page);
    await draw(page, 'sig-basic', 0.1, 0.4);
    await draw(page, 'sig-basic', 0.5, 0.9);
    const both = await inked(page, 'sig-basic');
    expect(await page.evaluate(() => [window.__signature!.canUndo(), window.__signature!.canRedo()])).toEqual([true, false]);
    await page.keyboard.press('ControlOrMeta+z');
    const one = await inked(page, 'sig-basic');
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(both);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await inked(page, 'sig-basic')).toBe(0);
    expect(await page.evaluate(() => window.__signature!.isEmpty())).toBe(true);
    expect((await events(page, 'signature')).at(-1)).toEqual({ kind: 'signature', empty: true, prefix: null, action: 'undo', source: 'keyboard' });
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await inked(page, 'sig-basic')).toBe(both);
    expect((await events(page, 'signature')).at(-1)).toMatchObject({ action: 'redo', source: 'keyboard' });
    expect(await page.evaluate(() => window.__signature!.canRedo())).toBe(false);
    await page.getByRole('button', { name: 'Clear' }).first().click();
    expect(await inked(page, 'sig-basic')).toBe(0);
    expect((await events(page, 'signature')).at(-1)).toMatchObject({ action: 'clear', empty: true });
    await page.evaluate(() => window.__signature!.undo());
    expect(await inked(page, 'sig-basic')).toBe(both);
    await page.evaluate(() => window.__signature!.clear());
    expect(await page.evaluate(() => window.__signature!.isEmpty())).toBe(true);
  });

  test('"type your name" mode and drawText render text', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Type your name' }).first().click();
    await expect(page.getByRole('button', { name: 'Type your name' }).first()).toHaveAttribute('aria-pressed', 'true');
    const name = page.getByRole('textbox', { name: 'Name' });
    // The toggle moves focus into the name field, so typing starts at once.
    await expect(name).toBeFocused();
    await page.keyboard.type('Ada');
    expect(await inked(page, 'sig-basic')).toBeGreaterThan(20);
    expect((await events(page, 'signature')).at(-1)).toMatchObject({ action: 'text', source: 'keyboard', empty: false });
    // One undo step for the typed session.
    await page.evaluate(() => window.__signature!.undo());
    expect(await inked(page, 'sig-basic')).toBe(0);
    await page.evaluate(() => window.__signature!.drawText('Grace', { fontFamily: 'serif', fontSize: 40 }));
    expect(await inked(page, 'sig-basic')).toBeGreaterThan(20);
    expect(await page.evaluate(() => window.__signature!.toSVG())).toContain('>Grace</text>');
  });

  test('data URL, blob and SVG output with and without background', async ({ page }) => {
    await open(page);
    await draw(page, 'sig-basic');
    const out = await page.evaluate(async () => {
      const api = window.__signature!;
      const png = api.toDataURL();
      const jpeg = api.toDataURL('image/jpeg');
      const blob = await api.toBlob('image/jpeg');
      const bare = api.toDataURL('image/png', { background: false });
      const corner = async (src: string): Promise<number[]> => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return [...ctx.getImageData(1, 1, 1, 1).data];
      };
      return { png: png.slice(0, 22), jpeg: jpeg.slice(0, 23), blob: blob?.type, withBg: await corner(png), bare: await corner(bare), svg: api.toSVG(), svgBare: api.toSVG({ background: false }) };
    });
    expect(out.png).toBe('data:image/png;base64,');
    expect(out.jpeg).toBe('data:image/jpeg;base64,');
    expect(out.blob).toBe('image/jpeg');
    expect(out.withBg).toEqual([255, 255, 255, 255]);
    expect(out.bare[3]).toBe(0);
    expect(out.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(out.svg).toContain('<rect width="100%" height="100%" fill="#ffffff"/>');
    expect(out.svg).toContain('<path d="M');
    expect(out.svgBare).not.toContain('<rect');
  });

  test('controlled value and api.load', async ({ page }) => {
    await open(page);
    await draw(page, 'sig-controlled');
    await expect(page.locator('#sig-controlled-out')).toHaveText('signed');
    const before = await inked(page, 'sig-controlled', [0, 0, 0]);
    await page.locator('#sig-controlled-clear').click();
    await expect(page.locator('#sig-controlled canvas')).toHaveAttribute('aria-label', 'Signature, empty');
    expect(await inked(page, 'sig-controlled', [255, 255, 255])).toBe(0);
    expect(before).toBeGreaterThanOrEqual(0);
    // load(): an image becomes the signature.
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 20;
      c.height = 20;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 20, 20);
      await window.__signature!.load(c.toDataURL());
    });
    expect(await inked(page, 'sig-basic')).toBeGreaterThan(100);
    expect((await events(page, 'signature')).at(-1)).toMatchObject({ action: 'load', empty: false });
    await page.locator('#sig-reset').click();
    await expect.poll(() => inked(page, 'sig-basic')).toBe(0);
  });

  test('stroke color and width between min and max over a background color and image', async ({ page }) => {
    await open(page);
    const bg = await page.locator('#sig-styled canvas').evaluate((c: HTMLCanvasElement) => [...((src: HTMLCanvasElement) => { const t = document.createElement('canvas'); t.width = src.width; t.height = src.height; const x = t.getContext('2d', { willReadFrequently: true })!; x.drawImage(src, 0, 0); return x; })(c).getImageData(1, 1, 1, 1).data]);
    expect(bg).toEqual([254, 249, 195, 255]);
    await draw(page, 'sig-styled');
    const blue = await page.locator('#sig-styled canvas').evaluate((c: HTMLCanvasElement) => {
      const d = ((src: HTMLCanvasElement) => { const t = document.createElement('canvas'); t.width = src.width; t.height = src.height; const x = t.getContext('2d', { willReadFrequently: true })!; x.drawImage(src, 0, 0); return x; })(c).getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 2]! > 150 && d[i]! < 120 && d[i + 1]! < 160) n++;
      return n;
    });
    expect(blue).toBeGreaterThan(10);
    // the background image is drawn under the strokes, stretched to the pad.
    await expect.poll(() => page.locator('#sig-image canvas').evaluate((c: HTMLCanvasElement) => [...((src: HTMLCanvasElement) => { const t = document.createElement('canvas'); t.width = src.width; t.height = src.height; const x = t.getContext('2d', { willReadFrequently: true })!; x.drawImage(src, 0, 0); return x; })(c).getImageData(c.width - 2, c.height - 2, 1, 1).data])).toEqual([255, 0, 0, 255]);
    await expect(page.locator('#sig-readonly canvas')).toHaveAttribute('aria-label', 'Signature, empty');
    await draw(page, 'sig-readonly');
    expect(await inked(page, 'sig-readonly')).toBe(0);
  });

  test('SignaturePad pointermove with coalesced points at 120 Hz costs ≤ 2 ms', { tag: '@perf' }, async ({ page }) => {
    await open(page);
    await page.locator('#sig-basic canvas').scrollIntoViewIfNeeded();
    const box = (await page.locator('#sig-basic canvas').boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    const ms = await page.evaluate(async ({ x, y, w, h }) => {
      const target = document.querySelector('#sig-basic canvas')!;
      const raf = window.requestAnimationFrame;
      const samples: number[] = [];
      let t0 = 0;
      for (let i = 0; i < 60; i++) {
        let frameMs = 0;
        window.requestAnimationFrame = (cb) => raf((t) => {
          const s = performance.now();
          cb(t);
          frameMs = performance.now() - s;
        });
        let handler = 0;
        // Two 120 Hz moves per 60 Hz frame, each carrying 2 coalesced samples.
        for (let k = 0; k < 2; k++) {
          const step = i * 2 + k;
          const mk = (j: number) => new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: x + ((step * 2 + j) % w), clientY: y + h / 2 + Math.sin(step + j) * (h / 3) });
          const e = mk(1);
          const samples2 = [mk(0), e];
          Object.defineProperty(e, 'getCoalescedEvents', { value: () => samples2 });
          t0 = performance.now();
          target.dispatchEvent(e);
          handler += performance.now() - t0;
        }
        window.requestAnimationFrame = raf;
        await new Promise((r) => raf(() => raf(() => r(null))));
        samples.push(handler + frameMs);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)]!;
    }, { x: box.x + 10, y: box.y, w: box.width - 20, h: box.height });
    await page.mouse.up();
    expectBudget(ms, 2, 'SignaturePad coalesced pointermove frame median');
  });
});

test.describe('SignaturePad at devicePixelRatio 2', () => {
  test.use({ deviceScaleFactor: 2 });
  test('the canvas backing store follows the box at devicePixelRatio and redraws strokes on resize', async ({ page }) => {
    await open(page);
    const canvas = page.locator('#sig-basic canvas');
    const size = () => canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height, c.clientWidth, c.clientHeight]);
    let [w, h, cw, ch] = await size();
    expect([w, h]).toEqual([cw! * 2, ch! * 2]);
    await draw(page, 'sig-basic');
    const ink = await inked(page, 'sig-basic');
    await page.locator('#sig-basic').evaluate((el: HTMLElement) => (el.style.maxInlineSize = '300px'));
    await expect.poll(async () => (await size())[0]).not.toBe(w);
    [w, h, cw, ch] = await size();
    expect([w, h]).toEqual([cw! * 2, ch! * 2]);
    expect(await inked(page, 'sig-basic')).toBeGreaterThan(ink / 3);
  });
});
