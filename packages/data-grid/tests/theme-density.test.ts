import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DataGrid, type DataGridColumn, type DataGridProps } from '@salmonui/data-grid';
import { ThemeProvider, type SalmonThemeInput } from '@salmonui/core/theme';
import { people, personColumns, type Person } from './fixtures.ts';

// Theme density and surfaces: a compact theme scope gives the grid its
// smaller default row and header heights (explicit props win), and the header
// rowgroup is the `table-header` surface region.

function renderIn(theme: SalmonThemeInput | null, props: Partial<DataGridProps<Person>> = {}): string {
  const grid: ReactElement = createElement(DataGrid as (p: DataGridProps<Person>) => ReactElement, {
    'aria-label': 'People',
    data: people(30),
    columns: personColumns,
    timeZone: 'UTC',
    ...props,
  } as DataGridProps<Person>);
  return renderToString(theme === null ? grid : createElement(ThemeProvider, { theme }, grid));
}

const rowHeight = (html: string) => /--salmon-data-grid-row-height:(\d+)px/.exec(html)?.[1];
const headerHeight = (html: string) => /--salmon-data-grid-header-height:(\d+)px/.exec(html)?.[1];
/** Rendered body rows: the body sizer is `count * rowHeight` tall. */
const bodyHeight = (html: string) => /class="salmon-data-grid-body" style="height:(\d+)px"/.exec(html)?.[1];

describe('theme density and the header surface', () => {
  it('default density keeps the 36 / 40 px row and header heights', () => {
    for (const html of [renderIn(null), renderIn({ density: 'default' }), renderIn({ colors: { primary: '#0e4d5c' } })]) {
      assert.equal(rowHeight(html), '36');
      assert.equal(headerHeight(html), '40');
      assert.equal(bodyHeight(html), String(30 * 36));
    }
  });

  it('compact density makes the default heights 32 / 36 px in the CSS variables and the layout', () => {
    const html = renderIn({ density: 'compact' });
    assert.equal(rowHeight(html), '32');
    assert.equal(headerHeight(html), '36');
    assert.equal(bodyHeight(html), String(30 * 32), 'the virtualization layout uses the compact row height');
    assert.equal(renderIn({ density: 'compact' }), html, 'deterministic server markup');
  });

  it('explicit rowHeight and headerHeight win over the compact defaults', () => {
    const html = renderIn({ density: 'compact' }, { rowHeight: 44, headerHeight: 48 });
    assert.equal(rowHeight(html), '44');
    assert.equal(headerHeight(html), '48');
    assert.equal(bodyHeight(html), String(30 * 44));
    const one = renderIn({ density: 'compact' }, { rowHeight: 40 });
    assert.equal(rowHeight(one), '40');
    assert.equal(headerHeight(one), '36');
  });

  it('a nested scope without density inherits compact; a nested default scope restores the defaults', () => {
    const grid = createElement(DataGrid as (p: DataGridProps<Person>) => ReactElement, { 'aria-label': 'People', data: people(3), columns: personColumns } as DataGridProps<Person>);
    const inherit = renderToString(createElement(ThemeProvider, { theme: { density: 'compact' } }, createElement(ThemeProvider, { theme: { colors: { primary: '#0e4d5c' } } }, grid)));
    assert.equal(rowHeight(inherit), '32');
    const reset = renderToString(createElement(ThemeProvider, { theme: { density: 'compact' } }, createElement(ThemeProvider, { theme: { density: 'default' } }, grid)));
    assert.equal(rowHeight(reset), '36');
  });

  it('stacked headers and the filter bar size their total height from the compact header height', () => {
    const columns = [
      { field: 'id', header: 'ID', primaryKey: true, width: 80 },
      { id: 'group', header: 'Person', columns: [{ field: 'name', header: 'Name' }, { field: 'age', header: 'Age', type: 'number' }] },
    ] as DataGridColumn<Person>[];
    const html = renderIn({ density: 'compact' }, { columns, filtering: { ui: 'row' } });
    assert.match(html, /--salmon-data-grid-header-total-height:108px/, '2 header rows + the filter bar at 36 px');
  });

  it('the header rowgroup is the table-header surface region, with or without a theme surface', () => {
    for (const html of [renderIn(null), renderIn({ surfaces: { tableHeader: 'primary' }, colors: { primary: '#0e4d5c' } })]) {
      const header = /<div role="rowgroup" class="salmon-data-grid-header"[^>]*>/.exec(html)?.[0];
      assert.ok(header, 'header rowgroup');
      assert.match(header, /data-salmon-surface="table-header"/);
      assert.equal([...html.matchAll(/data-salmon-surface=/g)].length, 1, 'one surface region per grid');
    }
  });
});
