import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// ColorPicker and its parts in the browser.
// Page: examples/vite-spa/inputs.html?only=color (examples/vite-spa/src/inputs-color.tsx).

async function open(page: Page, query = '?only=color'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
  await page.waitForSelector('#color');
}
const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const formData = (page: Page, id: string) => page.evaluate((k) => window.__inputForms?.[k] ?? null, id);
const hidden = (page: Page, name: string) => page.locator(`input[type="hidden"][name="${name}"]`).inputValue();
const brand = (page: Page) => page.getByRole('button', { name: /^Brand/ });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Brand' });

test.describe('ColorPicker', () => {
  test('the trigger opens a dialog that takes focus; Escape and outside presses close it and focus returns', async ({ page }) => {
    await open(page);
    await expect(brand(page)).toHaveAccessibleName('Brand dark vibrant green');
    await expect(brand(page)).toHaveAttribute('aria-expanded', 'false');
    await brand(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(brand(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog(page).getByRole('slider', { name: 'Saturation' })).toBeFocused();
    expect(await events(page, 'clr-before-open')).toEqual([{ kind: 'clr-before-open', open: true, reason: 'trigger' }]);
    expect((await events(page, 'clr-open')).at(-1)).toEqual({ kind: 'clr-open', open: true, reason: 'trigger' });
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(brand(page)).toBeFocused();
    expect((await events(page, 'clr-open')).at(-1)).toEqual({ kind: 'clr-open', open: false, reason: 'escape' });
    // Keyboard open (Enter on the trigger), then an outside press.
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog(page)).toHaveCount(0);
    expect((await events(page, 'clr-open')).at(-1)).toEqual({ kind: 'clr-open', open: false, reason: 'outside' });
    // A cancelled onBeforeOpenChange keeps the popover closed.
    const locked = page.getByRole('button', { name: /^Locked/ });
    await locked.click();
    await expect(locked).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await events(page, 'clr-veto')).toEqual([{ kind: 'clr-veto', open: true }]);
  });

  test('confirm mode reports live picks, Cancel reverts, Apply commits and records a recent color', async ({ page }) => {
    await open(page);
    await brand(page).click();
    await expect(dialog(page).getByRole('slider', { name: 'Saturation' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(dialog(page).getByRole('slider', { name: 'Brightness' })).toBeFocused();
    expect((await events(page, 'clr-change')).at(-1)).toEqual({ kind: 'clr-change', value: '#008200ff', reason: 'area', source: 'keyboard' });
    expect(await events(page, 'clr-commit')).toEqual([]);
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(brand(page)).toBeFocused();
    expect((await events(page, 'clr-change')).at(-1)).toEqual({ kind: 'clr-change', value: '#008000ff', reason: 'cancel', source: 'pointer' });
    expect(await hidden(page, 'brand')).toBe('#008000ff');
    expect(await events(page, 'clr-commit')).toEqual([]);

    await brand(page).click();
    await expect(dialog(page).getByRole('listbox', { name: 'Recent colors' })).toHaveCount(0);
    await dialog(page).getByRole('slider', { name: 'Hue' }).focus();
    await page.keyboard.press('PageUp');
    await dialog(page).getByRole('button', { name: 'Apply' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(brand(page)).toBeFocused();
    const applied = await hidden(page, 'brand');
    expect(applied).toBe('#008015ff');
    expect(await events(page, 'clr-commit')).toEqual([{ kind: 'clr-commit', value: applied, reason: 'apply' }]);
    expect(await events(page, 'clr-recent')).toEqual([{ kind: 'clr-recent', colors: [applied] }]);
    // Dismissing after a pick discards it too.
    await brand(page).click();
    const recent = dialog(page).getByRole('listbox', { name: 'Recent colors' });
    await expect(recent.getByRole('option')).toHaveCount(1);
    await dialog(page).getByRole('slider', { name: 'Hue' }).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Escape');
    expect(await hidden(page, 'brand')).toBe(applied);
  });

  test('the alpha slider changes alpha; dragging the area reports at most one change per frame', async ({ page }) => {
    await open(page);
    await brand(page).click();
    await dialog(page).getByRole('slider', { name: 'Alpha' }).focus();
    await page.keyboard.press('ArrowLeft');
    expect((await events(page, 'clr-change')).at(-1)).toMatchObject({ value: '#008000fc', reason: 'alpha' });
    await expect(dialog(page).getByRole('textbox', { name: 'Hex' })).toHaveValue('#008000fc');
    const area = dialog(page).locator('.salmon-color-area');
    const box = (await area.boundingBox())!;
    const before = (await events(page, 'clr-change')).length;
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.mouse.down();
    // A burst of moves inside one frame is coalesced to one report.
    await area.evaluate((el, b) => {
      for (let i = 0; i < 20; i++) el.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: b.x + b.width * (0.3 + i * 0.01), clientY: b.y + b.height * 0.5 }));
    }, box);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const burst = (await events(page, 'clr-change')).slice(before);
    expect(burst.length).toBeGreaterThanOrEqual(1);
    expect(burst.length).toBeLessThanOrEqual(3);
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.1, { steps: 4 });
    await page.mouse.up();
    const last = (await events(page, 'clr-change')).at(-1)!;
    expect(last).toMatchObject({ reason: 'area', source: 'pointer' });
    // Saturation 75 %, brightness 90 % of hue 120.
    const field = await dialog(page).getByRole('textbox', { name: 'Hex' }).inputValue();
    expect(field).toBe(last['value']);
    await expect(dialog(page).getByRole('slider', { name: 'Saturation' })).toHaveAttribute('aria-valuetext', /^Saturation 75%, /);
    await expect(dialog(page).getByRole('slider', { name: 'Brightness' })).toHaveAttribute('aria-valuetext', /^Brightness 90%, /);
    expect(await events(page, 'clr-commit')).toEqual([]);
  });

  test('immediate mode commits a swatch pick and closes; the trigger previews it', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: /^Immediate/ });
    await trigger.click();
    const popup = page.getByRole('dialog', { name: 'Immediate' });
    await expect(popup.getByRole('listbox', { name: 'Colors' }).getByRole('option')).toHaveCount(8);
    await popup.getByRole('option', { name: 'vibrant blue' }).click();
    await expect(popup).toHaveCount(0);
    expect(await events(page, 'clr-immediate-commit')).toEqual([{ kind: 'clr-immediate-commit', value: '#0000ffff', reason: 'swatch' }]);
    await expect(trigger).toHaveAccessibleName('Immediate vibrant blue');
    expect(await hidden(page, 'accent')).toBe('#0000ffff');
  });

  test('the mode switch shows the palette; onBeforeModeChange can cancel it', async ({ page }) => {
    await open(page);
    const inline = page.getByRole('group', { name: 'Inline' });
    await inline.getByRole('button', { name: 'Show swatches' }).click();
    expect(await events(page, 'clr-before-mode')).toEqual([{ kind: 'clr-before-mode', mode: 'swatches' }]);
    expect(await events(page, 'clr-mode')).toEqual([{ kind: 'clr-mode', mode: 'swatches' }]);
    await expect(inline.locator('.salmon-color-area')).toHaveCount(0);
    await inline.getByRole('option', { name: 'vibrant yellow' }).click();
    expect((await events(page, 'clr-inline')).at(-1)).toEqual({ kind: 'clr-inline', value: '#ffff00ff', reason: 'swatch', source: 'pointer' });
    expect((await events(page, 'clr-inline-commit')).at(-1)).toEqual({ kind: 'clr-inline-commit', value: '#ffff00ff', reason: 'swatch' });
    await inline.getByRole('button', { name: 'Show color area' }).click();
    await expect(inline.locator('.salmon-color-area')).toHaveCount(1);
    const locked = page.getByRole('group', { name: 'Mode locked' });
    await locked.getByRole('button', { name: 'Show swatches' }).click();
    await expect(locked.locator('.salmon-color-area')).toHaveCount(1);
    await expect(locked.getByRole('listbox')).toHaveCount(0);
  });

  test('ColorArea is two sliders; arrows move their axis, Shift and Page keys take large steps; RTL mirrors', async ({ page }) => {
    await open(page);
    const area = page.locator('#clr-area');
    const sat = area.getByRole('slider', { name: 'Saturation' });
    const bri = area.getByRole('slider', { name: 'Brightness' });
    await sat.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(sat).toHaveAttribute('aria-valuetext', 'Saturation 99%, vibrant red');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(sat).toHaveAttribute('aria-valuetext', /^Saturation 89%/);
    await page.keyboard.press('ArrowDown');
    await expect(bri).toBeFocused();
    await expect(bri).toHaveAttribute('aria-valuetext', /^Brightness 99%/);
    await page.keyboard.press('PageDown');
    await expect(bri).toHaveAttribute('aria-valuetext', /^Brightness 89%/);
    await page.keyboard.press('Home');
    await expect(bri).toHaveAttribute('aria-valuetext', 'Brightness 0%, black');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    await expect(sat).toBeFocused();
    await expect(sat).toHaveAttribute('aria-valuetext', /^Saturation 90%/);
    expect((await events(page, 'clr-area-commit')).at(-1)).toMatchObject({ reason: 'step' });
    // Hue slider: arrows, Page keys, Home / End.
    const hue = page.locator('#clr-hue').getByRole('slider', { name: 'Hue' });
    await hue.focus();
    await page.keyboard.press('ArrowRight');
    await expect(hue).toHaveAttribute('aria-valuetext', '1°, red');
    await page.keyboard.press('PageUp');
    await expect(hue).toHaveAttribute('aria-valuetext', '11°, red');
    await page.keyboard.press('End');
    await expect(hue).toHaveValue('360');
    // Vertical alpha: up increases, left decreases (never mirrored).
    const alpha = page.locator('#clr-alpha').getByRole('slider', { name: 'Alpha' });
    await alpha.focus();
    await page.keyboard.press('ArrowDown');
    await expect(alpha).toHaveAttribute('aria-valuetext', '99%');

    await open(page, '?only=color&dir=rtl');
    const rtlArea = page.locator('#clr-area');
    const rtlSat = rtlArea.getByRole('slider', { name: 'Saturation' });
    // Saturation 100 % sits at the inline end: the left edge in RTL.
    const box = (await rtlArea.boundingBox())!;
    const thumb = (await rtlArea.locator('.salmon-color-area-thumb').boundingBox())!;
    expect(thumb.x + thumb.width / 2).toBeLessThan(box.x + 2);
    await rtlSat.focus();
    await page.keyboard.press('ArrowRight');
    await expect(rtlSat).toHaveAttribute('aria-valuetext', /^Saturation 99%/);
    await page.keyboard.press('ArrowLeft');
    await expect(rtlSat).toHaveAttribute('aria-valuetext', /^Saturation 100%/);
    const rtlHue = page.locator('#clr-hue').getByRole('slider', { name: 'Hue' });
    await rtlHue.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(rtlHue).toHaveAttribute('aria-valuetext', '1°, red');
    const rtlAlpha = page.locator('#clr-alpha').getByRole('slider', { name: 'Alpha' });
    await rtlAlpha.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(rtlAlpha).toHaveAttribute('aria-valuetext', '99%');
  });

  test('dragging an uncontrolled ColorArea and ColorSlider paints without React renders and commits once', async ({ page }) => {
    await open(page);
    const area = page.locator('#clr-area');
    const box = (await area.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8, { steps: 6 });
    // Mid-drag the thumb and the hidden input already follow the pointer.
    const thumb = (await area.locator('.salmon-color-area-thumb').boundingBox())!;
    expect(Math.abs(thumb.x + thumb.width / 2 - (box.x + box.width * 0.2))).toBeLessThan(3);
    expect(await hidden(page, 'area')).toBe((await events(page, 'clr-area')).at(-1)!['value']);
    expect(await events(page, 'clr-area-commit')).toEqual([]);
    await page.mouse.up();
    const commits = await events(page, 'clr-area-commit');
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ reason: 'drag', value: (await events(page, 'clr-area')).at(-1)!['value'] });
    await expect(area.getByRole('slider', { name: 'Saturation' })).toHaveAttribute('aria-valuetext', /^Saturation 20%/);
    await expect(area.getByRole('slider', { name: 'Brightness' })).toHaveAttribute('aria-valuetext', /^Brightness 20%/);
    expect((await events(page, 'clr-area')).every((e) => e['reason'] === 'drag' && e['source'] === 'pointer')).toBe(true);
    // Hue slider drag to the middle of the track.
    const track = page.locator('#clr-hue');
    const t = (await track.boundingBox())!;
    await page.mouse.move(t.x + 2, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect(track.getByRole('slider', { name: 'Hue' })).toHaveValue('180');
    expect((await events(page, 'clr-hue')).at(-1)).toEqual({ kind: 'clr-hue', hue: 180, reason: 'drag' });
  });

  test('ColorSwatchPicker is a listbox grid with roving focus', async ({ page }) => {
    await open(page);
    const list = page.getByRole('listbox', { name: 'Palette' });
    const option = (name: string) => list.getByRole('option', { name });
    await option('vibrant green').focus();
    await expect(list.locator('[tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await expect(option('vibrant cyan')).toBeFocused();
    await expect(option('vibrant green')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(option('vibrant cyan')).toHaveAttribute('aria-selected', 'true');
    expect((await events(page, 'clr-swatch')).at(-1)).toEqual({ kind: 'clr-swatch', value: '#00ffff', source: 'keyboard' });
    await page.keyboard.press('ArrowDown');
    await expect(option('black')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(option('vibrant green')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(option('No color')).toBeFocused();
    await page.keyboard.press('End');
    await expect(option('vibrant yellow')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(option('No color')).toBeFocused();
    await page.keyboard.press('Control+End');
    await expect(option('black')).toBeFocused();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press(' ');
    expect((await events(page, 'clr-swatch')).at(-1)).toEqual({ kind: 'clr-swatch', value: null, source: 'keyboard' });
    expect(await hidden(page, 'swatch')).toBe('');
    // Tab leaves the grid in one stop.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Hex color' })).toBeFocused();
    await open(page, '?only=color&dir=rtl');
    const rtl = page.getByRole('listbox', { name: 'Palette' });
    await rtl.getByRole('option', { name: 'vibrant green' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(rtl.getByRole('option', { name: 'vibrant cyan' })).toBeFocused();
  });

  test('the trigger chevron keeps its down shape under dir="rtl" (physical borders, not mirrored)', async ({ page }) => {
    for (const dir of ['ltr', 'rtl']) {
      await open(page, `?only=color&dir=${dir}`);
      const borders = await brand(page).evaluate((el) => {
        const s = getComputedStyle(el.querySelector('.salmon-color-picker-chevron')!);
        return [s.direction, s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth];
      });
      // Right and bottom drawn, top and left empty: rotated 45deg it points down in both directions.
      const [direction, top, right, bottom, left] = borders;
      expect([direction, top, left]).toEqual([dir, '0px', '0px']);
      expect(parseFloat(right!)).toBeGreaterThan(0);
      expect(bottom).toBe(right);
    }
  });

  test('ColorField parses rgb and hsl text on Enter or blur, reverts invalid text and clears with Escape', async ({ page }) => {
    await open(page);
    const field = page.getByRole('textbox', { name: 'Hex color' });
    await field.fill('rgb(255 0 0)');
    await page.keyboard.press('Enter');
    await expect(field).toHaveValue('#ff0000');
    expect((await events(page, 'clr-field')).at(-1)).toEqual({ kind: 'clr-field', value: '#ff0000', reason: 'input' });
    await field.fill('hsl(240, 100%, 50%)');
    await field.blur();
    await expect(field).toHaveValue('#0000ff');
    await field.fill('nope');
    await field.blur();
    await expect(field).toHaveValue('#0000ff');
    await field.focus();
    await page.keyboard.press('Escape');
    await expect(field).toHaveValue('');
    expect((await events(page, 'clr-field')).at(-1)).toEqual({ kind: 'clr-field', value: null, reason: 'clear' });
    // The picker's no-color swatch sets null and the trigger previews no color.
    await brand(page).click();
    await dialog(page).getByRole('button', { name: 'Show swatches' }).click();
    await dialog(page).getByRole('option', { name: 'No color' }).click();
    await dialog(page).getByRole('button', { name: 'Apply' }).click();
    expect(await hidden(page, 'brand')).toBe('');
    await expect(brand(page)).toHaveAccessibleName('Brand No color');
  });

  test('hidden inputs submit every value; form reset restores the defaults', async ({ page }) => {
    await open(page);
    await page.locator('#clr-submit').click();
    expect(await formData(page, 'clr-form')).toEqual([
      ['brand', '#008000ff'],
      ['accent', '#ff0000'],
      ['area', '#ff0000ff'],
      ['hue', '#ff0000ff'],
      ['swatch', '#00ff00'],
      ['hex', '#336699'],
    ]);
    await page.getByRole('listbox', { name: 'Palette' }).getByRole('option', { name: 'black' }).click();
    const hue = page.locator('#clr-hue').getByRole('slider', { name: 'Hue' });
    await hue.focus();
    await page.keyboard.press('PageUp');
    await page.locator('#clr-area').getByRole('slider', { name: 'Saturation' }).focus();
    await page.keyboard.press('ArrowLeft');
    await page.getByRole('textbox', { name: 'Hex color' }).fill('#000');
    await page.keyboard.press('Enter');
    await brand(page).click();
    await expect(dialog(page).getByRole('slider', { name: 'Saturation' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await dialog(page).getByRole('button', { name: 'Apply' }).click();
    expect(await hidden(page, 'brand')).not.toBe('#008000ff');
    await page.locator('#clr-reset').click();
    await expect.poll(() => hidden(page, 'brand')).toBe('#008000ff');
    expect(await hidden(page, 'swatch')).toBe('#00ff00');
    expect(await hidden(page, 'hue')).toBe('#ff0000ff');
    expect(await hidden(page, 'area')).toBe('#ff0000ff');
    await expect(page.getByRole('textbox', { name: 'Hex color' })).toHaveValue('#336699');
    await expect(hue).toHaveValue('0');
    expect((await events(page, 'clr-change')).at(-1)).toMatchObject({ value: '#008000ff', reason: 'reset', source: 'api' });
  });
});

test('color picker server markup hydrates with zero warnings and stays interactive', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate&only=color');
  await brand(page).click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(brand(page)).toBeFocused();
  expect(problems).toEqual([]);
});

test('the picker trigger is sized by its swatch and the mode switch is a square icon button', async ({ page }) => {
  await open(page);
  const trigger = (await brand(page).boundingBox())!;
  // Not stretched to the field width: swatch, chevron and padding only.
  expect(trigger.width).toBeLessThan(100);
  expect(Math.round(trigger.height)).toBe(32);
  await brand(page).click();
  const mode = (await dialog(page).getByRole('button', { name: 'Show swatches' }).boundingBox())!;
  expect(Math.round(mode.width)).toBe(32);
  expect(Math.round(mode.height)).toBe(32);
});
