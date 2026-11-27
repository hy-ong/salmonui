import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// GeoMap behaviour and accessibility on examples/vite-spa/gauges.html
// (sections "map", "tiles", "seats"). Tiles come from a routed fake XYZ
// server.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const URL = `${DEV_URL}gauges.html`;
// A 1 x 1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

interface Ev {
  case: string;
  type: string;
  value: unknown;
  source?: string;
  reason?: string;
}

const section = (page: Page, id: string): Locator => page.locator(`section[data-case="${id}"]`);
const plot = (page: Page, id: string): Locator => section(page, id).getByRole('group', { name: { map: 'Population', tiles: 'Tiles', editor: 'Editor' }[id] ?? 'Seats' });
const events = (page: Page, c: string, type?: string): Promise<Ev[]> => page.evaluate(([c, type]) => (window as unknown as { __viz: { events: Ev[] } }).__viz.events.filter((e) => e.case === c && (!type || e.type === type)), [c, type] as const);

async function load(page: Page, query = ''): Promise<{ problems: string[]; tiles: string[] }> {
  const tiles: string[] = [];
  await page.route('https://tiles.test/**', (route) => {
    tiles.push(new globalThis.URL(route.request().url()).pathname);
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  const problems = collectProblems(page);
  await page.goto(`${URL}${query}`);
  await page.waitForSelector('section[data-case="map"] svg');
  return { problems, tiles };
}

test.describe('GeoMap', () => {
  test('clicking shapes selects them (single), Seat maps select several (planar)', async ({ page }) => {
    const { problems } = await load(page);
    await section(page, 'map').locator('[data-key="layer0:Central"]').click();
    await expect(section(page, 'map').locator('[data-key="layer0:Central"]')).toHaveAttribute('data-selected', '');
    await section(page, 'map').locator('[data-key="layer0:East"]').click();
    await expect(section(page, 'map').locator('[data-key="layer0:Central"]')).not.toHaveAttribute('data-selected', '');
    expect((await events(page, 'map', 'select')).map((e) => e.value)).toEqual([['Central'], ['East']]);
    await section(page, 'seats').locator('[data-key="layer0:Seat B2"]').click();
    expect((await events(page, 'seats', 'select')).at(-1)!.value).toEqual(['Seat A1', 'Seat B2']);
    expect(problems).toEqual([]);
  });

  test('hovering a shape shows its tooltip with the joined value', async ({ page }) => {
    await load(page);
    await section(page, 'map').locator('[data-key="layer0:Central"]').hover();
    const tip = section(page, 'map').getByRole('tooltip');
    await expect(tip).toHaveText('Central: 60');
    await page.mouse.move(0, 0);
    await expect(tip).toHaveCount(0);
  });

  test('wheel, double-click and the zoom toolbar commit one view per step', async ({ page }) => {
    await load(page);
    // Raw mouse input does not scroll: bring the map into the viewport first.
    await plot(page, 'map').scrollIntoViewIfNeeded();
    const box = (await plot(page, 'map').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    await page.mouse.wheel(0, -100);
    await expect(page.locator('#map-view')).toHaveText(/@1\.25$/);
    await section(page, 'map').getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.locator('#map-view')).toHaveText(/@1\.88$/);
    await section(page, 'map').getByRole('button', { name: 'Reset zoom' }).click();
    await expect(page.locator('#map-view')).toHaveText(/@1$/);
    await plot(page, 'map').dblclick({ position: { x: box.width / 2, y: box.height / 3 } });
    await expect(page.locator('#map-view')).toHaveText(/@2$/);
    const views = await events(page, 'map', 'view');
    expect(views.map((e) => e.reason)).toEqual(['zoom', 'zoom', 'reset', 'zoom']);
    // Zoom out stops at the minimum.
    await section(page, 'map').getByRole('button', { name: 'Reset zoom' }).click();
    await expect(section(page, 'map').getByRole('button', { name: 'Zoom out' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('dragging pans with DOM transforms and commits once on release', async ({ page }) => {
    await load(page);
    await page.evaluate(() => {
      const w = window as unknown as { __commits: number; __hook?: unknown };
      w.__commits = 0;
    });
    await plot(page, 'map').scrollIntoViewIfNeeded();
    const box = (await plot(page, 'map').boundingBox())!;
    const before = (await events(page, 'map', 'view')).length;
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 60 + i * 10, box.y + 60 + i * 5);
    // Mid-drag: the overlay group carries a transient transform, no view was committed.
    expect(await section(page, 'map').locator('svg > g > g').nth(1).getAttribute('transform')).toMatch(/^translate\(/);
    expect((await events(page, 'map', 'view')).length).toBe(before);
    await page.mouse.up();
    const views = await events(page, 'map', 'view');
    expect(views.length).toBe(before + 1);
    expect(views.at(-1)!.reason).toBe('pan');
    expect(await section(page, 'map').locator('[data-target="shape"]').count()).toBe(9);
  });

  test('one tab stop; arrows move between shapes in reading order, Enter selects, + / - / 0 zoom, Ctrl+arrows pan', async ({ page }) => {
    await load(page);
    await plot(page, 'map').focus();
    await page.keyboard.press('ArrowRight');
    await expect(section(page, 'map').locator('[aria-live="polite"]')).toHaveText('Northwest: 12');
    await page.keyboard.press('ArrowRight');
    await expect(section(page, 'map').locator('[aria-live="polite"]')).toHaveText('North: 30');
    await page.keyboard.press('End');
    await expect(section(page, 'map').locator('[aria-live="polite"]')).toHaveText('Southeast: 40');
    await page.keyboard.press('Enter');
    expect((await events(page, 'map', 'select')).at(-1)).toMatchObject({ value: ['Southeast'], source: 'keyboard' });
    await page.keyboard.press('+');
    await expect(page.locator('#map-view')).toHaveText(/@1\.5$/);
    await page.keyboard.press('Control+ArrowLeft');
    expect((await events(page, 'map', 'view')).at(-1)).toMatchObject({ reason: 'pan', source: 'keyboard' });
    await page.keyboard.press('0');
    await expect(page.locator('#map-view')).toHaveText(/@1$/);
  });

  test('marker and cluster clicks, map click coordinates', async ({ page }) => {
    await load(page);
    const cluster = section(page, 'map').locator('[data-target="cluster"]');
    await expect(cluster).toHaveCount(1);
    await expect(cluster).toContainText('2');
    await section(page, 'map').locator('[data-target="marker"]').first().click({ force: true });
    expect((await events(page, 'map', 'marker')).length).toBe(1);
    await cluster.click();
    expect((await events(page, 'map', 'cluster')).at(-1)!.value).toBe(2);
    // The cluster click zoomed in; the two markers separate (deep clustering).
    await expect.poll(() => section(page, 'map').locator('[data-target="cluster"]').count()).toBe(0);
    const coords = await page.evaluate(() => {
      const api = (window as unknown as { __viz: { apis: Record<string, { toPoint(p: readonly [number, number]): { x: number; y: number }; toCoordinates(p: { x: number; y: number }): { latitude: number; longitude: number } }> } }).__viz.apis['map']!;
      const p = api.toPoint([45, 5]);
      return api.toCoordinates(p);
    });
    // toPoint rounds to 0.01 px, so the round trip is exact to about 1e-4 degrees.
    expect(coords.latitude).toBeCloseTo(45, 3);
    expect(coords.longitude).toBeCloseTo(5, 3);
    const clicks = await events(page, 'map', 'click');
    expect(clicks.length).toBeGreaterThan(0);
    const c = clicks[0]!.value as { latitude: number; longitude: number };
    expect(c.latitude).toBeGreaterThan(30);
    expect(c.latitude).toBeLessThan(62);
  });

  test('draggable markers move by pointer (one event on release) and by arrow keys', async ({ page }) => {
    await load(page);
    await section(page, 'editor').scrollIntoViewIfNeeded();
    const depot = section(page, 'editor').locator('[data-key="pins:0"]');
    const before = (await depot.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height - 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(before.x + before.width / 2 + i * 10, before.y + before.height - 2 + i * 5);
    // Mid-drag: the marker carries a transient transform; nothing was reported and the map did not pan.
    await expect(depot).toHaveAttribute('transform', /^translate\(/);
    expect(await events(page, 'editor', 'move')).toEqual([]);
    await page.mouse.up();
    const moves = await events(page, 'editor', 'move');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ source: 'pointer', reason: 'move' });
    const [id, lat, lon] = moves[0]!.value as [string, number, number];
    expect(id).toBe('pins:0');
    expect(lat).toBeLessThan(52);
    expect(lon).toBeGreaterThan(-2);
    expect(await events(page, 'editor', 'view')).toEqual([]);
    // The application applied the move: the marker is drawn at the new position without a transform.
    await expect(depot).not.toHaveAttribute('transform', /./);
    expect((await depot.boundingBox())!.x).toBeGreaterThan(before.x + 30);
    // Keyboard: the marker's handle is a tab stop; arrows move it and report each step.
    const handle = section(page, 'editor').getByRole('button', { name: 'Port' });
    await expect(handle).toHaveAttribute('aria-roledescription', 'movable marker');
    await handle.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    const keys = (await events(page, 'editor', 'move')).slice(1);
    expect(keys.map((e) => e.source)).toEqual(['keyboard', 'keyboard']);
    const [, lat1, lon1] = keys[0]!.value as [string, number, number];
    const [, lat2, lon2] = keys[1]!.value as [string, number, number];
    expect(lat1).toBeGreaterThan(40);
    expect(lat2).toBeCloseTo(lat1, 3);
    expect(lon2).toBeGreaterThan(lon1);
    await expect(handle).toBeFocused();
  });

  test('a spider cluster fans its markers out with connector lines; Escape closes it', async ({ page }) => {
    await load(page);
    await section(page, 'editor').scrollIntoViewIfNeeded();
    const stops = section(page, 'editor').locator('[data-group="stops"]');
    await expect(stops.locator('[data-target="cluster"]')).toHaveCount(1);
    await stops.locator('[data-target="cluster"]').click();
    expect((await events(page, 'editor', 'cluster')).map((e) => e.value)).toEqual([4]);
    await expect(stops.locator('[data-target="marker"]')).toHaveCount(4);
    await expect(stops.locator('.salmon-geo-map-spoke')).toHaveCount(4);
    await expect(stops.locator('[data-target="cluster"]')).toHaveCount(0);
    // Spider expansion does not zoom.
    expect(await events(page, 'editor', 'view')).toEqual([]);
    await plot(page, 'editor').focus();
    await page.keyboard.press('Escape');
    await expect(stops.locator('[data-target="cluster"]')).toHaveCount(1);
    await expect(stops.locator('.salmon-geo-map-spoke')).toHaveCount(0);
  });

  test('two-finger pinch zooms with transient transforms and commits once; Shift+drag zooms to a rectangle', async ({ page }) => {
    await load(page);
    const box = (await plot(page, 'map').boundingBox())!;
    const before = (await events(page, 'map', 'view')).length;
    const mid = await page.evaluate(([x, y]) => {
      const el = document.querySelector('section[data-case="map"] [aria-roledescription="map"]')!;
      const fire = (type: string, id: number, cx: number, cy: number) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: cx, clientY: cy, button: 0 }));
      fire('pointerdown', 1, x - 20, y);
      fire('pointerdown', 2, x + 20, y);
      fire('pointermove', 1, x - 40, y);
      fire('pointermove', 2, x + 40, y);
      const transform = document.querySelector('section[data-case="map"] svg > g > g')!.getAttribute('transform');
      fire('pointerup', 2, x + 40, y);
      fire('pointerup', 1, x - 40, y);
      return transform;
    }, [box.x + box.width / 2, box.y + box.height / 3]);
    expect(mid).toMatch(/^translate\([^)]*\) scale\(2\) translate/);
    const views = (await events(page, 'map', 'view')).slice(before);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ reason: 'zoom', source: 'touch' });
    expect((views[0]!.value as { zoom: number }).zoom).toBe(2);
    // Selection zoom on the editor map (zoom.selection): Shift + drag a rectangle.
    await section(page, 'editor').scrollIntoViewIfNeeded();
    const e = (await plot(page, 'editor').boundingBox())!;
    await page.keyboard.down('Shift');
    await page.mouse.move(e.x + e.width * 0.45, e.y + e.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(e.x + e.width * 0.6, e.y + e.height * 0.45, { steps: 5 });
    await expect(section(page, 'editor').locator('.salmon-geo-map-selection')).toHaveAttribute('d', /^M/);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const sel = await events(page, 'editor', 'view');
    expect(sel).toHaveLength(1);
    expect(sel[0]).toMatchObject({ reason: 'zoom', source: 'pointer' });
    expect((sel[0]!.value as { zoom: number }).zoom).toBeGreaterThan(3);
    await expect(section(page, 'editor').locator('.salmon-geo-map-selection')).toHaveAttribute('d', '');
  });

  test('a start legend sits beside the map', async ({ page }) => {
    await load(page);
    await section(page, 'editor').scrollIntoViewIfNeeded();
    const legend = section(page, 'editor').getByRole('toolbar', { name: 'Legend' });
    await expect(legend.getByRole('button')).toHaveCount(2);
    const item = (await legend.getByRole('button', { name: 'Pins' }).boundingBox())!;
    const shape = (await section(page, 'editor').locator('[data-key="layer0:Northwest"]').boundingBox())!;
    expect(item.x + item.width).toBeLessThan(shape.x);
  });

  test('legend items toggle their shapes', async ({ page }) => {
    await load(page);
    const legend = section(page, 'map').getByRole('toolbar', { name: 'Legend' });
    await legend.getByRole('button', { name: 'High' }).click();
    await expect(section(page, 'map').locator('[data-target="shape"]')).toHaveCount(6);
    await legend.getByRole('button', { name: 'High' }).click();
    await expect(section(page, 'map').locator('[data-target="shape"]')).toHaveCount(9);
  });

  test('tiles load on the client from the URL template; the attribution is always shown', async ({ page }) => {
    const { tiles } = await load(page);
    await expect(section(page, 'tiles').locator('.salmon-geo-map-tile').first()).toBeAttached();
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => /^\/\d+\/\d+\/\d+\.png$/.test(t))).toBe(true);
    await expect(section(page, 'tiles').getByRole('link', { name: '© Example tiles' })).toBeVisible();
    const z0 = Number(tiles[0]!.split('/')[1]);
    tiles.length = 0;
    await section(page, 'tiles').getByRole('button', { name: 'Zoom in' }).click();
    await section(page, 'tiles').getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(() => tiles.length).toBeGreaterThan(0);
    expect(Math.max(...tiles.map((t) => Number(t.split('/')[1])))).toBeGreaterThan(z0);
  });

  test('hydration is clean and axe passes in light, dark and RTL', async ({ page }) => {
    const { problems } = await load(page, '?hydrate');
    await expect(section(page, 'map').locator('[data-target="shape"]')).toHaveCount(9);
    expect(problems).toEqual([]);
    for (const q of ['', '?scheme=dark', '?dir=rtl']) {
      await page.goto(`${URL}${q}`);
      await page.waitForSelector('section[data-case="map"] svg');
      await page.addScriptTag({ path: AXE });
      const violations = await page.evaluate(async () => {
        const r = await (window as unknown as { axe: { run(ctx: Element): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document.querySelector('section[data-case="map"]')!);
        return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations, q).toEqual([]);
    }
  });
});
