import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// ImageEditor (page:
// examples/vite-spa/src/image-editor.tsx). The page loads a generated
// 200 x 100 image: left half red, right half blue, a 20 x 20 green square at
// the top-left. Assertions read the exported pixels (actionsRef.toImageData /
// toBlob). Accessibility (axe, ARIA) is in image-editor-a11y.spec.ts.

interface Log {
  events: string[];
  changes: string[];
  history: { canUndo: boolean; canRedo: boolean; undoCount: number; redoCount: number } | null;
  saved: number;
  transform: Record<string, unknown> | null;
  annotations: { id: string; kind: string; [k: string]: unknown }[] | null;
}
type RGBA = [number, number, number, number];

const url = (query = ''): string => `${DEV_URL}image-editor.html${query ? `?${query}` : ''}`;
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __ieLog: Log }).__ieLog);
const canvas = (page: Page) => page.locator('.salmon-image-editor-canvas');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Image editing' });
const item = (page: Page, name: string) => toolbar(page).getByRole('button', { name, exact: true });
const quick = (page: Page) => page.getByRole('toolbar', { name: 'Selection actions' });

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(url(query));
  await page.waitForFunction(() => (window as unknown as { __ieLog: Log }).__ieLog.events.some((e) => e.startsWith('load')));
  await expect(page.locator('.salmon-image-editor')).toHaveAttribute('data-status', 'ready');
  // The interaction chunk loads after mount.
  await page.waitForFunction(() => !!(window as unknown as { __ie?: unknown }).__ie);
  await expect(canvas(page)).toHaveAttribute('data-interactive', '');
}

/** Exported pixels: size and RGBA at the given points. */
async function pixels(page: Page, points: [number, number][] = []): Promise<{ w: number; h: number; px: RGBA[] }> {
  return page.evaluate(async (pts) => {
    const ie = (window as unknown as { __ie: { toImageData(): Promise<ImageData | null> } }).__ie;
    const d = (await ie.toImageData())!;
    const px = pts.map(([x, y]) => Array.from(d.data.slice((y * d.width + x) * 4, (y * d.width + x) * 4 + 4)) as RGBA);
    return { w: d.width, h: d.height, px };
  }, points);
}

const near = (a: RGBA, b: RGBA, tol = 12): boolean => a.every((v, i) => Math.abs(v - b[i]!) <= tol);
const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];
const GREEN: RGBA = [0, 255, 0, 255];

/** Screen point of a scene point (the output, or the oriented image in the crop tool) at zoom 1. */
async function at(page: Page, x: number, y: number, scene = { w: 200, h: 100 }): Promise<{ x: number; y: number }> {
  const box = (await canvas(page).boundingBox())!;
  const k = Math.min(box.width / scene.w, box.height / scene.h);
  return { x: box.x + (box.width - scene.w * k) / 2 + x * k, y: box.y + (box.height - scene.h * k) / 2 + y * k };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Sets a panel slider: input events preview, the change event commits. */
async function slide(page: Page, label: string, value: number): Promise<void> {
  await page
    .locator('.salmon-image-editor-panel')
    .getByLabel(label, { exact: true })
    .evaluate((el: HTMLInputElement, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
}

const annotations = async (page: Page) => (await log(page)).annotations ?? [];

test.describe('ImageEditor', () => {
  test('opens a data URL, a Blob and ImageData; exports the pixels', async ({ page }) => {
    const problems = collectProblems(page);
    for (const src of ['url', 'blob', 'imagedata']) {
      await open(page, `src=${src}`);
      expect((await log(page)).events).toContain('load:200x100');
      const p = await pixels(page, [
        [5, 5],
        [50, 50],
        [150, 50],
      ]);
      expect([p.w, p.h]).toEqual([200, 100]);
      expect(near(p.px[0]!, GREEN)).toBe(true);
      expect(near(p.px[1]!, RED)).toBe(true);
      expect(near(p.px[2]!, BLUE)).toBe(true);
    }
    await expect(canvas(page)).toHaveAttribute('role', 'img');
    expect(problems).toEqual([]);
  });

  test('the open item reads a file through a native input and starts a fresh edit', async ({ page }) => {
    // Subscribe before the page loads: Playwright turns on file chooser interception asynchronously
    // when the first listener is added, and a chooser opened before that never emits the event.
    const chooser = page.waitForEvent('filechooser');
    await open(page);
    await item(page, 'Rotate right').click();
    await expect.poll(async () => (await pixels(page)).w).toBe(100);
    await item(page, 'Open image').click();
    const buffer = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 30;
      c.height = 40;
      c.getContext('2d')!.fillRect(0, 0, 30, 40);
      const b: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/png'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await (await chooser).setFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: Buffer.from(buffer) });
    await page.waitForFunction(() => (window as unknown as { __ieLog: Log }).__ieLog.events.includes('load:30x40'));
    await expect.poll(async () => [(await pixels(page)).w, (await pixels(page)).h]).toEqual([30, 40]);
    expect((await log(page)).changes).toContain('transform:open');
    await expect(item(page, 'Undo')).toBeDisabled();
  });

  test('toBlob / toDataURL with type and quality; onBeforeExport cancels', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const ie = (window as unknown as { __ie: { toBlob(o?: unknown): Promise<Blob | null>; toDataURL(o?: unknown): Promise<string | null> } }).__ie;
      const png = (await ie.toBlob())!;
      const jpeg = (await ie.toBlob({ type: 'image/jpeg', quality: 0.5 }))!;
      const bmp = await createImageBitmap(jpeg);
      const data = (await ie.toDataURL())!;
      return { png: png.type, jpeg: jpeg.type, size: [bmp.width, bmp.height], data: data.slice(0, 22) };
    });
    expect(r).toEqual({ png: 'image/png', jpeg: 'image/jpeg', size: [200, 100], data: 'data:image/png;base64,' });
    expect((await log(page)).events).toContain('export:image/jpeg:200x100');
    await open(page, 'veto=export');
    expect(await page.evaluate(() => (window as unknown as { __ie: { toBlob(): Promise<Blob | null> } }).__ie.toBlob())).toBeNull();
  });

  test('crop: ratio presets, handle drag, circle, keyboard and Apply', async ({ page }) => {
    await open(page);
    await item(page, 'Crop').click();
    const panel = page.getByRole('group', { name: 'Crop' }).first();
    await panel.getByRole('button', { name: 'Square' }).click();
    await page.locator('.salmon-image-editor-panel').getByRole('button', { name: 'Apply' }).click();
    let p = await pixels(page, [
      [10, 50],
      [90, 50],
    ]);
    expect([p.w, p.h]).toEqual([100, 100]);
    expect(near(p.px[0]!, RED)).toBe(true);
    expect(near(p.px[1]!, BLUE)).toBe(true);
    let l = await log(page);
    expect(l.transform?.['crop']).toEqual({ x: 50, y: 0, width: 100, height: 100 });
    expect(l.events).toEqual(expect.arrayContaining(['before:crop:pointer', 'after:crop:pointer', 'complete:crop:pointer']));

    // Handle drag: the bottom-right handle of the whole image moves inward.
    await open(page);
    await item(page, 'Crop').click();
    await drag(page, await at(page, 199, 99), await at(page, 100, 50));
    await quick(page).getByRole('button', { name: 'Apply crop' }).click();
    p = await pixels(page);
    expect(Math.abs(p.w - 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.h - 50)).toBeLessThanOrEqual(1);

    // Circle crop exports transparent corners.
    await open(page);
    await item(page, 'Crop').click();
    await page.getByRole('group', { name: 'Crop' }).first().getByRole('button', { name: 'Circle' }).click();
    await quick(page).getByRole('button', { name: 'Apply crop' }).click();
    p = await pixels(page, [
      [1, 1],
      [50, 50],
    ]);
    expect(p.px[0]![3]).toBe(0);
    expect(p.px[1]![3]).toBe(255);
    expect((await log(page)).transform?.['crop']).toMatchObject({ shape: 'circle' });

    // Keyboard: Alt+arrows shrink the draft, arrows move it, Enter applies.
    await open(page);
    await item(page, 'Crop').click();
    await canvas(page).focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('Alt+Shift+ArrowLeft');
    await page.keyboard.press('Enter');
    p = await pixels(page);
    expect([p.w, p.h]).toEqual([150, 100]);
    l = await log(page);
    expect(l.events).toContain('after:crop:keyboard');
  });

  test('rotate, flip and straighten move the pixels; annotations follow', async ({ page }) => {
    await open(page, 'annotations');
    await item(page, 'Rotate right').click();
    let p = await pixels(page, [
      [95, 5],
      [5, 5],
    ]);
    expect([p.w, p.h]).toEqual([100, 200]);
    expect(near(p.px[0]!, GREEN)).toBe(true);
    // The rectangle at (10, 10, 40 x 30) turned with the image.
    expect((await annotations(page))[0]).toMatchObject({ kind: 'rectangle', x: 60, y: 10, width: 30, height: 40 });
    await item(page, 'Rotate left').click();
    await item(page, 'Flip horizontal').click();
    p = await pixels(page, [
      [195, 5],
      [5, 5],
    ]);
    expect([p.w, p.h]).toEqual([200, 100]);
    expect(near(p.px[0]!, GREEN)).toBe(true);
    expect(near(p.px[1]!, BLUE)).toBe(true);
    await item(page, 'Flip vertical').click();
    p = await pixels(page, [[195, 95]]);
    expect(near(p.px[0]!, GREEN)).toBe(true);
    expect((await log(page)).events).toEqual(expect.arrayContaining(['before:rotate:pointer', 'after:rotate:pointer', 'before:flip:pointer', 'after:flip:pointer']));

    await open(page);
    await item(page, 'Straighten').click();
    await slide(page, 'Straighten', 30);
    expect((await log(page)).transform).toMatchObject({ straighten: 30 });
    // Straightening scales up to cover: no transparent corner.
    p = await pixels(page, [
      [0, 0],
      [199, 99],
    ]);
    expect(p.px[0]![3]).toBe(255);
    expect(p.px[1]![3]).toBe(255);
  });

  test('resize keeps the aspect ratio by default', async ({ page }) => {
    await open(page);
    await item(page, 'Resize').click();
    const panel = page.locator('.salmon-image-editor-panel');
    await panel.getByLabel('Width').fill('100');
    await expect(panel.getByLabel('Height')).toHaveValue('50');
    await panel.getByRole('button', { name: 'Apply' }).click();
    const p = await pixels(page);
    expect([p.w, p.h]).toEqual([100, 50]);
    expect((await log(page)).transform).toMatchObject({ resize: { width: 100, height: 50 } });
    await panel.getByLabel('Keep aspect ratio').uncheck();
    await panel.getByLabel('Height').fill('80');
    await panel.getByRole('button', { name: 'Apply' }).click();
    expect([(await pixels(page)).w, (await pixels(page)).h]).toEqual([100, 80]);
  });

  test('zoom buttons, Ctrl+wheel and pan commit once per gesture', async ({ page }) => {
    await open(page);
    await item(page, 'Zoom in').click();
    let l = await log(page);
    expect(l.transform).toMatchObject({ zoom: 1.25 });
    expect(l.events).toEqual(expect.arrayContaining(['before:zoom:pointer', 'after:zoom:pointer']));
    const before = (await log(page)).changes.length;
    const c = await at(page, 100, 50);
    await page.mouse.move(c.x, c.y);
    await page.keyboard.down('Control');
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -40);
    await page.keyboard.up('Control');
    await page.waitForTimeout(400);
    l = await log(page);
    // Ten wheel steps, one committed zoom (the steps live outside React state).
    expect(l.changes.slice(before)).toEqual(['transform:zoom']);
    expect(l.transform!['zoom'] as number).toBeGreaterThan(1.25);
    await item(page, 'Pan').click();
    await drag(page, c, { x: c.x + 80, y: c.y + 40 });
    l = await log(page);
    expect(l.events).toEqual(expect.arrayContaining(['before:pan:pointer', 'after:pan:pointer']));
    // Zoom is clamped to maxZoom (10) and minZoom (1).
    for (let i = 0; i < 20; i++) await item(page, 'Zoom out').click();
    expect((await log(page)).transform).toMatchObject({ zoom: 1 });
  });

  for (const fallback of [false, true]) {
    test(`finetune and filter presets${fallback ? ' (pixel fallback without ctx.filter)' : ''}`, async ({ page }) => {
      await open(page, fallback ? 'nofilter' : '');
      expect(await page.evaluate(() => 'filter' in document.createElement('canvas').getContext('2d')!)).toBe(!fallback);
      await item(page, 'Finetune').click();
      await slide(page, 'Brightness', -100);
      let p = await pixels(page, [[50, 50]]);
      expect(near(p.px[0]!, [0, 0, 0, 255])).toBe(true);
      expect((await log(page)).changes).toContain('adjustments:adjustment');
      await slide(page, 'Brightness', 0);
      await slide(page, 'Opacity', 50);
      p = await pixels(page, [[50, 50]]);
      expect(Math.abs(p.px[0]![3] - 128)).toBeLessThanOrEqual(2);
      await slide(page, 'Opacity', 100);
      await item(page, 'Filter').click();
      await page.getByRole('group', { name: 'Filter' }).last().getByRole('button', { name: 'Grayscale' }).click();
      p = await pixels(page, [[50, 50]]);
      const [r, g, b] = p.px[0]!;
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(3);
      await page.getByRole('group', { name: 'Filter' }).last().getByRole('button', { name: 'Invert' }).click();
      p = await pixels(page, [[150, 50]]);
      expect(near(p.px[0]!, [255, 255, 0, 255], 4)).toBe(true);
      expect((await log(page)).changes).toEqual(expect.arrayContaining(['filter:grayscale:filter', 'filter:invert:filter']));
    });
  }

  test('frames draw over the edges', async ({ page }) => {
    await open(page);
    await item(page, 'Frame').click();
    await page.getByRole('group', { name: 'Frame' }).last().getByRole('button', { name: 'Mat' }).click();
    let p = await pixels(page, [
      [1, 50],
      [100, 98],
      [50, 50],
    ]);
    expect(near(p.px[0]!, [255, 255, 255, 255])).toBe(true);
    expect(near(p.px[1]!, [255, 255, 255, 255])).toBe(true);
    expect(near(p.px[2]!, RED)).toBe(true);
    await slide(page, 'Frame size', 20);
    p = await pixels(page, [[15, 50]]);
    expect(near(p.px[0]!, [255, 255, 255, 255])).toBe(true);
    for (const type of ['Bevel', 'Line', 'Inset', 'Hook']) {
      await page.getByRole('group', { name: 'Frame' }).last().getByRole('button', { name: type }).click();
      p = await pixels(page, [type === 'Hook' ? [20, 20] : [5, 5]]);
      expect(near(p.px[0]!, GREEN), type).toBe(false);
    }
    expect((await log(page)).changes).toContain('frame:hook:frame');
  });

  test('shape annotations: drag to draw, click for a default size', async ({ page }) => {
    await open(page);
    await item(page, 'Rectangle').click();
    await drag(page, await at(page, 120, 20), await at(page, 180, 80));
    let list = await annotations(page);
    expect(list).toHaveLength(1);
    const rect = list[0]!;
    expect(rect).toMatchObject({ kind: 'rectangle', stroke: '#e5484d', strokeWidth: 4 });
    expect(Math.abs((rect['x'] as number) - 120)).toBeLessThanOrEqual(1);
    expect(Math.abs((rect['width'] as number) - 60)).toBeLessThanOrEqual(1);
    let p = await pixels(page, [
      [150, 20],
      [150, 50],
    ]);
    expect(near(p.px[0]!, [229, 72, 77, 255], 20)).toBe(true);
    expect(near(p.px[1]!, BLUE)).toBe(true);
    // After drawing, the new shape is selected and the tool returns to select.
    await expect(quick(page)).toBeVisible();
    for (const name of ['Ellipse', 'Line', 'Arrow']) {
      await item(page, name).click();
      await page.mouse.click((await at(page, 60, 50)).x, (await at(page, 60, 50)).y);
    }
    list = await annotations(page);
    expect(list.map((a) => a.kind)).toEqual(['rectangle', 'ellipse', 'line', 'arrow']);
    // Path: click points, double click ends.
    await item(page, 'Path').click();
    for (const [x, y] of [
      [20, 80],
      [40, 60],
    ])
      await page.mouse.click((await at(page, x, y)).x, (await at(page, x, y)).y);
    const end = await at(page, 60, 80);
    await page.mouse.dblclick(end.x, end.y);
    list = await annotations(page);
    expect(list[4]).toMatchObject({ kind: 'path', points: [20, 80, 40, 60, 60, 80] });
    p = await pixels(page, [[40, 60]]);
    expect(near(p.px[0]!, RED)).toBe(false);
  });

  test('text annotation edited in an input over the canvas', async ({ page }) => {
    await open(page);
    await item(page, 'Text').click();
    const c = await at(page, 110, 30);
    await page.mouse.click(c.x, c.y);
    const input = page.getByRole('textbox', { name: 'Annotation text' });
    await expect(input).toBeFocused();
    await input.fill('Hi');
    await input.press('Enter');
    await expect(input).toBeHidden();
    const list = await annotations(page);
    expect(list.at(-1)).toMatchObject({ kind: 'text', text: 'Hi', fontSize: 32 });
    const p = await pixels(page);
    expect(p.w).toBe(200);
    // Double click on the selected text edits it again; an empty text removes it.
    await canvas(page).focus();
    await page.keyboard.press('Enter');
    await expect(input).toBeFocused();
    await input.fill('');
    await input.press('Enter');
    expect(await annotations(page)).toEqual([]);
  });

  test('freehand records points outside React state and commits once', async ({ page }) => {
    await open(page);
    await item(page, 'Draw').click();
    const before = (await log(page)).changes.length;
    const a = await at(page, 20, 50);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(a.x + i * 15, a.y + Math.sin(i / 3) * 30);
    await page.mouse.up();
    const l = await log(page);
    expect(l.changes.slice(before).filter((c) => c.startsWith('annotations'))).toEqual(['annotations:add']);
    const f = (await annotations(page))[0]!;
    expect(f['kind']).toBe('freehand');
    expect((f['points'] as number[]).length).toBeGreaterThanOrEqual(20);
  });

  test('image annotation from a file', async ({ page }) => {
    // Subscribe before the page loads: Playwright turns on file chooser interception asynchronously
    // when the first listener is added, and a chooser opened before that never emits the event.
    const chooser = page.waitForEvent('filechooser');
    await open(page);
    await item(page, 'Add image').click();
    const buffer = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 40;
      c.height = 40;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(0, 0, 40, 40);
      const b: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/png'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await (await chooser).setFiles({ name: 'stamp.png', mimeType: 'image/png', buffer: Buffer.from(buffer) });
    await expect.poll(async () => (await annotations(page)).length).toBe(1);
    expect((await annotations(page))[0]).toMatchObject({ kind: 'image', x: 80, y: 30, width: 40, height: 40 });
    const p = await pixels(page, [[100, 50]]);
    expect(near(p.px[0]!, [255, 255, 0, 255])).toBe(true);
  });

  test('select, move, resize, rotate, clone, delete and z-order', async ({ page }) => {
    await open(page, 'annotations');
    // Click the rectangle (10, 10, 40 x 30): selected, quick toolbar shows.
    await page.mouse.click((await at(page, 30, 25)).x, (await at(page, 30, 25)).y);
    await expect(quick(page)).toBeVisible();
    expect((await log(page)).events).toEqual(expect.arrayContaining(['before:selection:pointer', 'after:selection:pointer']));
    // Move by 20 x 10.
    await drag(page, await at(page, 30, 25), await at(page, 50, 35));
    expect((await annotations(page))[0]).toMatchObject({ x: 30, y: 20, width: 40, height: 30 });
    // Resize from the bottom-right handle.
    await drag(page, await at(page, 70, 50), await at(page, 90, 60));
    expect((await annotations(page))[0]).toMatchObject({ x: 30, y: 20, width: 60, height: 40 });
    // Rotate with the knob above the top edge.
    const top = await at(page, 60, 20);
    const knob = { x: top.x, y: top.y - 24 };
    const right = await at(page, 120, 40);
    await drag(page, knob, right);
    expect(Math.round(((await annotations(page))[0]!['rotation'] as number) / 10) * 10).toBe(90);
    // Clone, z-order and delete from the quick toolbar.
    await quick(page).getByRole('button', { name: 'Duplicate' }).click();
    let list = await annotations(page);
    expect(list.map((a) => a.id)).toEqual(['r1', 'e1', 'rectangle-3']);
    await quick(page).getByRole('button', { name: 'Send to back' }).click();
    list = await annotations(page);
    expect(list.map((a) => a.id)).toEqual(['rectangle-3', 'r1', 'e1']);
    await quick(page).getByRole('button', { name: 'Bring forward' }).click();
    expect((await annotations(page)).map((a) => a.id)).toEqual(['r1', 'rectangle-3', 'e1']);
    await quick(page).getByRole('button', { name: 'Bring to front' }).click();
    expect((await annotations(page)).map((a) => a.id)).toEqual(['r1', 'e1', 'rectangle-3']);
    await quick(page).getByRole('button', { name: 'Send backward' }).click();
    expect((await annotations(page)).map((a) => a.id)).toEqual(['r1', 'rectangle-3', 'e1']);
    await quick(page).getByRole('button', { name: 'Delete' }).click();
    expect((await annotations(page)).map((a) => a.id)).toEqual(['r1', 'e1']);
    await expect(quick(page)).toBeHidden();
    // quickAccessToolbar={false} hides it.
    await open(page, 'annotations&quick=0');
    await page.mouse.click((await at(page, 30, 25)).x, (await at(page, 30, 25)).y);
    await expect(page.locator('.salmon-image-editor-panel')).toBeVisible();
    await expect(quick(page)).toHaveCount(0);
  });

  for (const fallback of [false, true]) {
    test(`redaction blurs or pixelates the pixels below it${fallback ? ' (pixel fallback)' : ''}`, async ({ page }) => {
      await open(page, fallback ? 'nofilter' : '');
      await item(page, 'Redact').click();
      await drag(page, await at(page, 80, 20), await at(page, 120, 80));
      expect((await annotations(page))[0]).toMatchObject({ kind: 'redact', mode: 'blur', strength: 12 });
      let p = await pixels(page, [
        [99, 50],
        [100, 50],
        [10, 50],
      ]);
      // The red / blue edge inside the box is mixed; pixels outside stay sharp.
      expect(p.px[0]![2]).toBeGreaterThan(40);
      expect(p.px[1]![0]).toBeGreaterThan(40);
      expect(near(p.px[2]!, RED)).toBe(true);
      await page.locator('.salmon-image-editor-panel').getByRole('button', { name: 'Pixelate' }).click();
      expect((await annotations(page))[0]).toMatchObject({ mode: 'pixelate' });
      p = await pixels(page, [
        [96, 30],
        [99, 30],
      ]);
      expect(p.px[0]).toEqual(p.px[1]);
    });
  }

  test('undo, redo, reset, Mod+Z and undoLimit; onHistoryChange', async ({ page }) => {
    await open(page);
    await item(page, 'Rotate right').click();
    await item(page, 'Flip horizontal').click();
    let l = await log(page);
    expect(l.history).toMatchObject({ canUndo: true, canRedo: false, undoCount: 2 });
    await item(page, 'Undo').click();
    expect((await log(page)).transform).toMatchObject({ rotation: 90 });
    expect(((await log(page)).transform!['flip'] as { horizontal?: boolean } | undefined)?.horizontal).toBeFalsy();
    await canvas(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    expect([(await pixels(page)).w]).toEqual([200]);
    l = await log(page);
    expect(l.history).toMatchObject({ canUndo: false, canRedo: true, redoCount: 2 });
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect((await pixels(page)).w).toBe(100);
    await item(page, 'Reset').click();
    expect((await pixels(page)).w).toBe(200);
    expect((await log(page)).changes).toContain('transform:reset');
    await item(page, 'Undo').click();
    expect((await pixels(page)).w).toBe(100);
    // undoLimit=1 keeps one step.
    await open(page, 'undoLimit=1');
    await item(page, 'Rotate right').click();
    await item(page, 'Rotate right').click();
    expect((await log(page)).history).toMatchObject({ undoCount: 1 });
  });

  test('toolbar items, custom items and onToolbarItemClick', async ({ page }) => {
    await open(page, 'toolbar=custom');
    await toolbar(page).getByRole('button', { name: 'Stamp' }).click();
    expect((await log(page)).events).toEqual(expect.arrayContaining(['item:stamp:pointer', 'custom:stamp']));
    await item(page, 'Rotate right').click();
    expect((await log(page)).events).toContain('item:rotateRight:pointer');
    await item(page, 'Save').click();
    await expect.poll(async () => (await log(page)).saved).toBe(1);
    await expect(item(page, 'Crop')).toHaveAttribute('aria-pressed', 'false');
    await item(page, 'Crop').click();
    await expect(item(page, 'Crop')).toHaveAttribute('aria-pressed', 'true');
    // preventDefault in onToolbarItemClick skips the built-in action.
    await open(page, 'vetoReset');
    await item(page, 'Rotate right').click();
    await item(page, 'Reset').click();
    expect((await pixels(page)).w).toBe(100);
    await open(page, 'toolbar=none');
    await expect(page.getByRole('toolbar')).toHaveCount(0);
  });

  test('before-callbacks cancel the operation; after-callbacks and onEditComplete report it', async ({ page }) => {
    for (const [veto, name] of [
      ['rotate', 'Rotate right'],
      ['flip', 'Flip vertical'],
      ['zoom', 'Zoom in'],
    ] as const) {
      await open(page, `veto=${veto}`);
      await item(page, name).click();
      const l = await log(page);
      expect(l.events).toContain(`before:${veto}:pointer`);
      expect(l.events).not.toContain(`after:${veto}:pointer`);
      expect(l.changes.filter((c) => c.startsWith('transform'))).toEqual([]);
    }
    await open(page, 'veto=annotation');
    await item(page, 'Rectangle').click();
    await page.mouse.click((await at(page, 100, 50)).x, (await at(page, 100, 50)).y);
    expect(await annotations(page)).toEqual([]);
    await open(page);
    await item(page, 'Rotate right').click();
    expect((await log(page)).events.filter((e) => !e.startsWith('load') && !e.startsWith('item'))).toEqual(['before:rotate:pointer', 'after:rotate:pointer', 'complete:rotate:pointer']);
  });

  test('keyboard: every tool reachable; arrows move and resize the selection; live region', async ({ page }) => {
    await open(page, 'annotations');
    // Tab enters the toolbar (one stop), arrows reach the Rectangle tool, Enter inserts a centered rectangle.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Tab');
    await expect(item(page, 'Open image')).toBeFocused();
    // Arrow keys walk the toolbar (disabled undo / redo are skipped) until the Rectangle tool has focus.
    for (let i = 0; i < 40 && !(await item(page, 'Rectangle').evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('ArrowRight');
    await expect(item(page, 'Rectangle')).toBeFocused();
    await page.keyboard.press('Enter');
    let list = await annotations(page);
    expect(list.at(-1)).toMatchObject({ kind: 'rectangle', x: 88, y: 38, width: 25, height: 25 });
    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('r');
    await expect.poll(async () => (await annotations(page)).at(-1)).toMatchObject({ x: 89, y: 48, width: 26, rotation: 15 });
    // Repeated nudges merge into one undo step.
    expect((await log(page)).history).toMatchObject({ undoCount: 2 });
    await page.keyboard.press(']');
    await page.keyboard.press('Delete');
    expect((await annotations(page)).map((a) => a.id)).toEqual(['e1', 'rectangle-3']);
    await expect(page.locator('.salmon-image-editor [role="status"]')).toHaveText(/Annotation/);
    // Zoom keys.
    await page.keyboard.press('Escape');
    await page.keyboard.press('+');
    expect((await log(page)).transform).toMatchObject({ zoom: 1.25 });
    await page.keyboard.press('0');
    expect((await log(page)).transform).toMatchObject({ zoom: 1 });
  });

  test('narrow container: toolbar overflow menu; touch pinch zoom and two-finger pan', async ({ page }) => {
    await open(page, 'width=360');
    const more = toolbar(page).getByRole('button', { name: 'More' });
    await expect(more).toBeVisible();
    await more.click();
    await page.getByRole('menuitem', { name: 'Flip horizontal' }).click();
    expect(near((await pixels(page, [[195, 5]])).px[0]!, GREEN)).toBe(true);
    const before = (await log(page)).changes.length;
    // Pinch: two touch pointers move apart, then lift.
    await page.locator('.salmon-image-editor-canvas').evaluate((el: HTMLCanvasElement) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const ev = (type: string, id: number, x: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true, isPrimary: id === 1, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
      ev('pointerdown', 1, cx - 20);
      ev('pointerdown', 2, cx + 20);
      for (let i = 1; i <= 10; i++) {
        ev('pointermove', 1, cx - 20 - i * 6);
        ev('pointermove', 2, cx + 20 + i * 6);
      }
    });
    await page.waitForTimeout(100);
    await page.locator('.salmon-image-editor-canvas').evaluate((el: HTMLCanvasElement) => {
      const r = el.getBoundingClientRect();
      const cy = r.top + r.height / 2;
      for (const id of [1, 2]) el.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: cy, bubbles: true }));
    });
    const l = await log(page);
    expect(l.changes.slice(before)).toEqual(['transform:zoom']);
    expect(l.transform!['zoom'] as number).toBeGreaterThan(2);
    expect(l.events).toContain('after:zoom:touch');
  });

  test('imageSmoothing maps to ctx.imageSmoothingEnabled', async ({ page }) => {
    const edge = async (query: string): Promise<RGBA> => {
      await open(page, query);
      await item(page, 'Resize').click();
      await page.locator('.salmon-image-editor-panel').getByLabel('Width').fill('800');
      await page.locator('.salmon-image-editor-panel').getByRole('button', { name: 'Apply' }).click();
      return (await pixels(page, [[399, 200]])).px[0]!;
    };
    expect(near(await edge('smoothing=0'), RED, 0)).toBe(true);
    const smooth = await edge('');
    expect(smooth[0]).toBeLessThan(255);
    expect(smooth[2]).toBeGreaterThan(0);
  });

  test('localeText, className / style, inherited dir with a mirrored toolbar; hydration', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'dir=rtl&hydrate');
    const first = await item(page, 'Open image').boundingBox();
    const crop = await item(page, 'Crop').boundingBox();
    expect(first!.x).toBeGreaterThan(crop!.x);
    await expect(page.locator('.salmon-image-editor')).toHaveClass(/demo-image-editor/);
    expect(problems.filter((p) => !p.includes('Download the React DevTools'))).toEqual([]);
    // RTL arrows: ArrowLeft moves to the next item.
    await item(page, 'Open image').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(item(page, 'Reset')).toBeFocused();
  });
});
