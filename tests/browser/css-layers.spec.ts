import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Cascade layers of the published stylesheets: a family stylesheet carries the shared modules it renders, so an
// application that imports several family stylesheets loads some modules
// twice. Every module sits in a sublayer of `salmon` ranked by the
// composition graph, so the copy a later stylesheet repeats never beats the
// family rules of an earlier one: the computed styles are the same in either
// import order. Unlayered application CSS beats every library rule.

const root = new URL('../../', import.meta.url);
const sheet = (path: string) => readFileSync(new URL(`packages/${path}`, root), 'utf8');

type Case = {
  readonly name: string;
  /** Published stylesheets under packages/, imported in this order and reversed. */
  readonly sheets: readonly [string, string];
  readonly markup: string;
  /** Element read (inside the markup) and the property with its expected value. */
  readonly target: string;
  readonly property: string;
  readonly value: string;
};

const CASES: readonly Case[] = [
  {
    // combobox.css and select.css both carry dropdown.css; the grid row keeps its grid display.
    name: 'a Combobox grid row next to Select',
    sheets: ['dropdowns/dist/combobox.css', 'dropdowns/dist/select.css'],
    markup: '<div role="row" class="salmon-dropdown-option salmon-combobox-grid-row"><span>a</span></div>',
    target: '.salmon-combobox-grid-row',
    property: 'display',
    value: 'grid',
  },
  {
    // rating.css and checkbox.css both carry choice-group.css; the rating row stays a row.
    name: 'the Rating row next to Checkbox',
    sheets: ['inputs/dist/rating.css', 'inputs/dist/checkbox.css'],
    markup: '<fieldset class="salmon-field salmon-choice-group"><div class="salmon-choice-group-items salmon-rating-row"><span></span></div></fieldset>',
    target: '.salmon-rating-row',
    property: 'flex-direction',
    value: 'row',
  },
  {
    // The opt-in RTL sheet outranks the chart rules it mirrors, whichever loads first.
    name: 'the RTL chart title with viz-rtl.css',
    sheets: ['charts/dist/viz-rtl.css', 'charts/dist/chart.css'],
    markup: '<div dir="rtl"><div class="salmon-viz"><svg><text class="salmon-viz-title">T</text></svg></div></div>',
    target: '.salmon-viz-title',
    property: 'text-anchor',
    value: 'end',
  },
];

async function computed(page: Page, css: readonly string[], markup: string, target: string, property: string): Promise<string> {
  await page.setContent(`<!doctype html><html><head>${css.map((c) => `<style>${c}</style>`).join('')}</head><body>${markup}</body></html>`);
  return page.locator(target).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
}

test.describe('cascade layers of the family stylesheets', () => {
  for (const c of CASES) {
    test(`${c.name} computes the same in both import orders`, async ({ page }) => {
      const theme = sheet('core/dist/styles.css');
      const [a, b] = c.sheets.map(sheet) as [string, string];
      const forward = await computed(page, [theme, a, b], c.markup, c.target, c.property);
      const reverse = await computed(page, [theme, b, a], c.markup, c.target, c.property);
      expect(reverse, `${c.sheets[1]} then ${c.sheets[0]}`).toBe(forward);
      expect(forward).toBe(c.value);
    });
  }

  test('every published family stylesheet declares the same layer order (a prefix of one sequence)', () => {
    const statements = new Set<string>();
    for (const pkg of ['buttons', 'dropdowns', 'inputs', 'charts', 'chat', 'gantt', 'scheduler', 'pivot-table', 'overlays', 'calendars']) {
      const dir = new URL(`packages/${pkg}/dist/`, root);
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.css'))) {
        const first = readFileSync(new URL(file, dir), 'utf8').split('\n', 1)[0]!;
        // The extra chart sheets (viz-rtl.css, viz-animations.css) sit directly in `salmon`, above every sublayer.
        if (first === '@layer salmon {') continue;
        expect(first, `${pkg}/dist/${file}`).toMatch(/^@layer salmon\.a(,salmon\.[a-z]+)*;$/);
        statements.add(first);
      }
    }
    const longest = [...statements].sort((x, y) => y.length - x.length)[0]!;
    for (const s of statements) expect(longest.startsWith(s.slice(0, -1)), s).toBe(true);
  });

  test('unlayered application CSS beats library rules whatever their specificity', async ({ page }) => {
    const css = [sheet('core/dist/styles.css'), sheet('dropdowns/dist/combobox.css'), 'div { display: block; }'];
    const value = await computed(page, css, '<div class="salmon-dropdown-option salmon-combobox-grid-row"></div>', '.salmon-combobox-grid-row', 'display');
    expect(value).toBe('block');
  });

  test('a library rule loses to application rules in a layer ordered after salmon', async ({ page }) => {
    const css = ['@layer salmon, app;', sheet('dropdowns/dist/combobox.css'), '@layer app { div { display: block; } }'];
    const value = await computed(page, css, '<div class="salmon-combobox-grid-row"></div>', '.salmon-combobox-grid-row', 'display');
    expect(value).toBe('block');
  });
});
