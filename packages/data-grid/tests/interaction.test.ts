import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DATA_GRID_SELECTION_COLUMN_ID, type DataGridColumn } from '@salmonui/data-grid';
import { count, personColumns, render, type Person } from './fixtures.ts';

// SSR accessibility: ARIA
// focus and selection attributes are in the server HTML, deterministic, and
// computed from the same state the client hydrates with.

describe('SSR: roving tabindex and selection ARIA', () => {
  it('renders exactly one tab stop: the first body cell', () => {
    const html = render({ rows: 50 });
    assert.equal(count(html, /tabindex="0"/), 1);
    assert.match(html, /data-row-id="p0"[^>]*>(?:<div[^>]*>)*<div role="gridcell" aria-colindex="1" tabindex="0"/);
    assert.equal(count(html, /role="columnheader"[^>]*tabindex="-1"/), personColumns.length);
    assert.equal(render({ rows: 50 }), html, 'deterministic');
  });

  it('without rows the first header cell is the tab stop', () => {
    const html = render({ rows: 0 });
    assert.equal(count(html, /tabindex="0"/), 1);
    assert.match(html, /role="columnheader" aria-colindex="1"[^>]*tabindex="0"/);
  });

  it('row selection: aria-selected on every row, multiselectable root, default ids', () => {
    const html = render({ rows: 30, selection: { multiple: true, rowIds: ['p1', 'p3'] } });
    assert.match(html, /role="grid"[^>]*aria-multiselectable="true"/);
    assert.equal(count(html, /role="row"[^>]*aria-selected="true"/), 2);
    assert.equal(count(html, /role="row"[^>]*aria-selected="false"/), 18);
    assert.match(html, /data-row-id="p3"[^>]*data-selected=""/);
    assert.doesNotMatch(html, /role="gridcell"[^>]*aria-selected/, 'row mode puts aria-selected on rows only');
  });

  it('single selection: selection.rowIds render on the server', () => {
    const html = render({ rows: 30, selection: { rowIds: ['p7'] } });
    assert.doesNotMatch(html, /aria-multiselectable/);
    assert.equal(count(html, /aria-selected="true"/), 1);
    assert.match(html, /data-row-id="p7"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-row-id="p7"/);
  });

  it('cell mode puts aria-selected on gridcells and not on rows', () => {
    const html = render({ rows: 10, selection: { mode: 'cell', multiple: true } });
    assert.equal(count(html, /role="gridcell"[^>]*aria-selected="false"/), 10 * personColumns.length);
    assert.doesNotMatch(html, /role="row"[^>]*aria-selected/);
  });

  it('selection column: labelled checkboxes, header select-all mixed state', () => {
    const withSelection: DataGridColumn<Person>[] = [{ type: 'selection', pinned: 'start' }, ...personColumns];
    const html = render({ rows: 20, columns: withSelection, selection: { rowIds: ['p2'] } });
    assert.match(html, /role="grid"[^>]*aria-multiselectable="true"/, 'a selection column selects several rows by default');
    assert.match(html, /role="grid"[^>]*aria-colcount="6"/);
    assert.match(html, new RegExp(`role="columnheader" aria-colindex="1"[^>]*data-column-id="${DATA_GRID_SELECTION_COLUMN_ID}"`));
    assert.match(html, /role="checkbox" aria-checked="mixed" aria-label="Select all rows"/);
    assert.equal(count(html, /role="checkbox" aria-checked="true" aria-label="Select row"/), 1);
    assert.equal(count(html, /role="checkbox" aria-checked="false" aria-label="Select row"/), 19);
    // A `type: 'selection'` column with its own id keeps that id.
    const columns: DataGridColumn<Person>[] = [{ id: 'pick', type: 'selection', width: 40 }, ...personColumns];
    const custom = render({ rows: 5, columns, selection: { multiple: true } });
    assert.equal(count(custom, /aria-label="Select row"/), 5);
    assert.doesNotMatch(custom, new RegExp(DATA_GRID_SELECTION_COLUMN_ID));
  });

  it('selection disabled: no aria-selected, no multiselectable', () => {
    const html = render({ rows: 10, selection: false });
    assert.doesNotMatch(html, /aria-selected|aria-multiselectable/);
  });

  it('live regions are siblings of the grid, empty on the server', () => {
    const html = render({ rows: 5, sorting: true });
    assert.match(html, /<\/div><div class="salmon-data-grid-live" role="status" aria-live="polite" aria-atomic="true"><\/div><div class="salmon-data-grid-live salmon-data-grid-live-assertive" role="alert" aria-atomic="true"><\/div>$/);
  });

  it('localeText overrides the assistive labels', () => {
    const html = render({ rows: 3, columns: [{ type: 'selection' }, ...personColumns], localeText: { selectRow: 'Zeile auswählen', selectAllRows: 'Alle auswählen' } });
    assert.match(html, /aria-label="Alle auswählen"/);
    assert.equal(count(html, /aria-label="Zeile auswählen"/), 3);
  });
});
