// Icons: built-in SVG icons live in the grid CSS (no markup); the
// `icons` prop and DataGridIconsProvider replace them with nodes that render on
// the server, deterministically, so hydration sees the same markup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DataGrid, DataGridIconsProvider, type DataGridIcons, type DataGridProps } from '@salmonui/data-grid';
import { count, people, personColumns, render, type Person } from './fixtures.ts';

const icon = (name: string) => createElement('svg', { className: `my-${name}`, 'aria-hidden': true, width: 12, height: 12 });

// Grouped by `active`, so four header cells remain (the grouped column is hidden).
const features: Partial<DataGridProps<Person>> = {
  rows: 30,
  sorting: { sortBy: [{ field: 'name', direction: 'asc' }] },
  filtering: { ui: 'menu' },
  paging: { pageSize: 5 },
  grouping: { groupBy: ['active'], showHeaderToggle: true },
} as Partial<DataGridProps<Person>>;
const HEADERS = 4;

describe('grid icons (SSR)', () => {
  it('renders no icon markup by default; an empty map changes nothing', () => {
    const plain = render(features);
    assert.equal(count(plain, /data-custom-icon/), 0);
    assert.equal(count(plain, /<svg/), 0, 'built-in icons are CSS, not markup');
    assert.equal(render({ ...features, icons: {} }), plain);
  });

  it('renders overrides on the server, deterministically, inside their controls', () => {
    const icons: DataGridIcons = {
      sortAscending: icon('sort-asc'),
      filter: icon('filter'),
      groupByColumn: icon('group-by'),
      expanded: icon('expanded'),
      collapsed: icon('collapsed'),
      ungroup: icon('ungroup'),
      pagerFirst: icon('first'),
      pagerNext: icon('next'),
    };
    const a = render({ ...features, icons });
    const b = render({ ...features, icons });
    assert.equal(a, b, 'same markup on every render (server and hydrating client)');
    assert.match(a, /class="salmon-data-grid-sort-indicator" data-direction="asc" aria-hidden="true" data-custom-icon=""><svg class="my-sort-asc"/);
    assert.equal(count(a, /salmon-data-grid-filter-button"[^>]*data-custom-icon=""><svg class="my-filter"/), HEADERS);
    assert.equal(count(a, /salmon-data-grid-group-toggle-button"[^>]*data-custom-icon=""><svg class="my-group-by"/), HEADERS);
    assert.match(a, /class="salmon-data-grid-group-toggle"[^>]*data-expanded=""[^>]*data-custom-icon=""><svg class="my-expanded"/);
    assert.match(a, /class="salmon-data-grid-group-chip__remove"[^>]*data-custom-icon=""><svg class="my-ungroup"/);
    assert.match(a, /salmon-data-grid-pager__first"[^>]*data-custom-icon=""><svg class="my-first"/);
    assert.match(a, /salmon-data-grid-pager__next"[^>]*data-custom-icon=""><svg class="my-next"/);
    // Icons that were not overridden keep the built-in (no attribute, no child).
    assert.match(a, /salmon-data-grid-pager__prev"[^>]*title="[^"]*"><\/button>/);
    // Accessible names stay on the controls.
    assert.match(a, /aria-label="[^"]*Name[^"]*"[^>]*data-custom-icon=""><svg class="my-filter"/);
  });

  it('null hides an icon', () => {
    const html = render({ ...features, columnMenu: true, icons: { columnMenu: null } } as Partial<DataGridProps<Person>>);
    assert.equal(count(html, /salmon-data-grid-column-menu-button"[^>]*data-custom-icon=""><\/button>/), HEADERS);
  });

  it('DataGridIconsProvider supplies icons to every grid below it; the prop merges over it', () => {
    const grid = (icons?: DataGridIcons): ReactElement =>
      createElement(DataGrid as (p: DataGridProps<Person>) => ReactElement, {
        'aria-label': 'People',
        data: people(5),
        columns: personColumns,
        filtering: { ui: 'menu' },
        sorting: { sortBy: [{ field: 'name', direction: 'asc' }] },
        ...(icons ? { icons } : {}),
      } as DataGridProps<Person>);
    const html = renderToString(
      createElement(DataGridIconsProvider, { icons: { sortAscending: icon('app-sort'), filter: icon('app-filter') } }, grid(), grid({ filter: icon('own-filter') })),
    );
    assert.equal(count(html, /<svg class="my-app-sort"/), 2, 'both grids inherit the provider icon');
    assert.equal(count(html, /<svg class="my-app-filter"/), personColumns.length);
    assert.equal(count(html, /<svg class="my-own-filter"/), personColumns.length);
  });

  it('the stylesheet draws every built-in as an SVG mask and hides it for custom icons', () => {
    const css = readFileSync(new URL('../dist/data-grid.css', import.meta.url), 'utf8');
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ selectors: m[1]!, body: m[2]! }));
    const hosts = ['sort-indicator', 'filter-button', 'column-menu-button', 'group-toggle-button', 'group-toggle', 'detail-toggle', 'group-chip__remove', 'pager__first', 'pager__prev', 'pager__next', 'pager__last', 'menu__check', 'menu__submenu-arrow', 'toolbar__more-icon', 'row-drag-handle', 'sheet__close-icon', 'edit-dialog__close'];
    for (const host of hosts) {
      const selector = new RegExp(`^\\s*\\.salmon-data-grid-${host}(\\[[^\\]]+\\])?::before\\s*$`);
      const drawn = rules.some((r) => r.body.includes('mask-image: url("data:image/svg+xml') && r.selectors.split(',').some((s) => selector.test(s)));
      assert.ok(drawn, host);
    }
    assert.match(css, /\[data-custom-icon\]\[data-custom-icon\]::before,\s*\[data-custom-icon\]\[data-custom-icon\]::after \{\s*content: none;/);
  });
});
