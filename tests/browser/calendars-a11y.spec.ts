import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Calendars accessibility gates: forced-colors styles for selection, focus, today and
// disabled days, and axe-core plus ARIA snapshots (YAML under
// `calendars-a11y.spec.ts-snapshots/`) for every component and every popup:
// Calendar, RangeCalendar, DateField, TimeField, DatePicker (popover, modal
// sheet, date and time), DateRangePicker and TimePicker. The clock is fixed
// so today and the default months are deterministic. Update the snapshots
// with `npx playwright test calendars-a11y.spec --update-snapshots` and
// review the YAML diff like code.

// Reduced motion: axe samples colors after the day transitions settle.
test.use({ locale: 'en-US', timezoneId: 'UTC', contextOptions: { reducedMotion: 'reduce' } });

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const NOW = new Date('2026-11-24T12:00:00Z');

async function openPage(page: Page, file: 'calendars' | 'pickers', query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.clock.setFixedTime(NOW);
  await page.goto(`${DEV_URL}${file}.html${query}`);
  if (file === 'calendars') await page.waitForFunction(() => (window as unknown as { __mountMs?: number }).__mountMs !== undefined);
  else await page.waitForSelector('section[data-case]');
  return problems;
}

/** axe-core over the page and its top-layer popups (page-level landmark and heading rules belong to the host app). */
async function axe(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const api = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await api.run(document, { resultTypes: ['violations'], rules: { region: { enabled: false }, 'page-has-heading-one': { enabled: false }, 'landmark-one-main': { enabled: false } } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
  });
}

const scenario = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const pickerCase = (page: Page, id: string): Locator => page.locator(`section[data-case="${id}"]`);

async function openPopup(page: Page, id: string): Promise<Locator> {
  await pickerCase(page, id).locator('.salmon-picker__trigger').click();
  const popup = page.locator('.salmon-picker__popup');
  await expect(popup).toBeVisible();
  return popup;
}

test.describe('forced colors', () => {
  test('selection, focus, today and disabled days use system colors in forced-colors mode', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    const problems = await openPage(page, 'calendars');
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    // System colors resolved by the browser, to compare computed values against.
    const system = await page.evaluate(() => {
      const probe = document.createElement('div');
      document.body.append(probe);
      const read = (prop: 'color' | 'backgroundColor', value: string): string => {
        probe.style.cssText = `forced-color-adjust: none; ${prop === 'color' ? 'color' : 'background-color'}: ${value}`;
        return getComputedStyle(probe)[prop];
      };
      const out = { highlight: read('backgroundColor', 'Highlight'), highlightText: read('color', 'HighlightText'), grayText: read('color', 'GrayText'), canvasText: read('color', 'CanvasText') };
      probe.remove();
      return out;
    });
    const style = (el: Locator) =>
      el.evaluate((e) => {
        const s = getComputedStyle(e);
        return { color: s.color, background: s.backgroundColor, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor };
      });
    // Selection: Highlight / HighlightText (single day, range ends).
    const selected = await style(scenario(page, 'single').locator('[data-day="2026-11-23"]'));
    expect(selected.background).toBe(system.highlight);
    expect(selected.color).toBe(system.highlightText);
    // Today: a dashed CanvasText outline (the clock is fixed to 2026-11-24).
    const today = scenario(page, 'views').locator('[data-day="2026-11-24"]');
    await expect(today).toHaveAttribute('data-today');
    const todayStyle = await style(today);
    expect(todayStyle.outlineStyle).toBe('dashed');
    expect(todayStyle.outlineColor).toBe(system.canvasText);
    // Disabled days: GrayText.
    const disabled = scenario(page, 'minmax').locator('[data-day="2026-11-04"]');
    await expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect((await style(disabled)).color).toBe(system.grayText);
    // Keyboard focus: a 2 px CanvasText outline on the focused day.
    await scenario(page, 'views').locator('[data-day="2026-11-23"]').focus();
    await page.keyboard.press('ArrowRight');
    const focused = await style(scenario(page, 'views').locator('[data-day="2026-11-24"]'));
    expect(focused.outlineStyle).toBe('solid');
    expect(focused.outlineWidth).toBe('2px');
    // Range ends are highlighted and the days between are outlined.
    await scenario(page, 'range-span').locator('[data-day="2026-11-10"]').click();
    await scenario(page, 'range-span').locator('[data-day="2026-11-13"]').click();
    expect((await style(scenario(page, 'range-span').locator('[data-day="2026-11-10"]'))).background).toBe(system.highlight);
    const between = await style(scenario(page, 'range-span').locator('[data-day="2026-11-11"]'));
    expect(between.outlineStyle).toBe('solid');
    expect(between.outlineColor).toBe(system.highlight);
    // A focused DateField segment is highlighted.
    await scenario(page, 'field').locator('[role="spinbutton"]').first().focus();
    const segment = await style(scenario(page, 'field').locator('[role="spinbutton"]').first());
    expect(segment.background).toBe(system.highlight);
    expect(segment.color).toBe(system.highlightText);
    expect(problems).toEqual([]);
  });

  test('the selected time option and the clear icon use system colors', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    const problems = await openPage(page, 'pickers');
    const highlight = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.cssText = 'forced-color-adjust: none; background-color: Highlight';
      document.body.append(probe);
      const v = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return v;
    });
    const popup = await openPopup(page, 'tp');
    const option = popup.locator('[role="option"][aria-selected="true"]');
    await expect(option).toHaveText(/9:30/);
    expect(await option.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(highlight);
    await page.keyboard.press('Escape');
    const clear = pickerCase(page, 'tp').locator('.salmon-picker__clear');
    const icon = await clear.evaluate((e) => ({ before: getComputedStyle(e, '::before').backgroundColor, text: getComputedStyle(e).color }));
    // ButtonText: the color of the button text in forced colors.
    expect(icon.before).toBe(icon.text);
    expect(problems).toEqual([]);
  });
});

test.describe('axe-core and ARIA snapshots', () => {
  test('Calendar, RangeCalendar, DateField and TimeField', async ({ page }) => {
    const problems = await openPage(page, 'calendars');
    expect(await axe(page)).toEqual([]);
    await expect(scenario(page, 'views')).toMatchAriaSnapshot({ name: 'calendar.aria.yml' });
    await expect(scenario(page, 'locale-de')).toMatchAriaSnapshot({ name: 'calendar-week-numbers.aria.yml' });
    await scenario(page, 'range-span').locator('[data-day="2026-11-10"]').click();
    await scenario(page, 'range-span').locator('[data-day="2026-11-12"]').hover();
    await expect(scenario(page, 'range-span')).toMatchAriaSnapshot({ name: 'range-calendar.aria.yml' });
    await expect(scenario(page, 'field')).toMatchAriaSnapshot({ name: 'date-field.aria.yml' });
    await expect(scenario(page, 'time-24')).toMatchAriaSnapshot({ name: 'time-field.aria.yml' });
    // The year and decade views.
    await scenario(page, 'views').locator('.salmon-calendar__heading').first().click();
    await expect(scenario(page, 'views')).toMatchAriaSnapshot({ name: 'calendar-year.aria.yml' });
    expect(await axe(page)).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('every picker and its popup', async ({ page }) => {
    const problems = await openPage(page, 'pickers');
    expect(await axe(page)).toEqual([]);
    await expect(pickerCase(page, 'dp-basic')).toMatchAriaSnapshot({ name: 'date-picker.aria.yml' });
    await expect(pickerCase(page, 'drp')).toMatchAriaSnapshot({ name: 'date-range-picker.aria.yml' });
    await expect(pickerCase(page, 'tp')).toMatchAriaSnapshot({ name: 'time-picker.aria.yml' });
    const cases: [string, string][] = [
      ['dp-basic', 'date-picker-popup.aria.yml'],
      ['dtp', 'date-time-picker-popup.aria.yml'],
      ['drp', 'date-range-picker-popup.aria.yml'],
      ['tp', 'time-picker-popup.aria.yml'],
      ['dp-modal', 'date-picker-modal.aria.yml'],
    ];
    for (const [id, snapshot] of cases) {
      const popup = await openPopup(page, id);
      expect(await axe(page), id).toEqual([]);
      await expect(popup).toMatchAriaSnapshot({ name: snapshot });
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
    }
    expect(problems).toEqual([]);
  });
});
