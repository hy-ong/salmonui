import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DATA_GRID_DEFAULT_LOCALE_TEXT, type DataGridColumn } from '@salmonui/data-grid';
import { count, personColumns, render, type Person } from './fixtures.ts';

// on the server: `editing.showNewRow` renders the at-rest add row
// (empty cells, from the pure `./edit-state` at-rest state), the same with
// and without the editing chunk, and only in row mode.

const commands: DataGridColumn<Person> = { id: 'commands', header: 'Commands', width: 160, commands: [{ type: 'edit' }, { type: 'delete' }, { type: 'save' }, { type: 'cancel' }] };

describe('SSR: always-visible add row', () => {
  it('renders one labelled add row with empty cells at newRowPosition, deterministically', () => {
    assert.equal(DATA_GRID_DEFAULT_LOCALE_TEXT.newRowLabel, 'Add new row');
    const top = render({ rows: 10, editing: { showNewRow: true } });
    assert.equal(count(top, /data-new-row=""/), 1);
    assert.match(top, /<div role="rowgroup" class="salmon-data-grid-added-rows salmon-data-grid-added-rows--top"><div role="row" aria-rowindex="2" aria-label="Add new row" data-row-id="__new:blank-1" data-new="" data-new-row="" class="salmon-data-grid-row salmon-data-grid-added-row salmon-data-grid-new-row">/);
    assert.equal(count(top, /salmon-data-grid-editor/), 0, 'editors render on the client');
    // One empty gridcell per column, pinned zone included.
    const row = /data-new-row=""[^>]*>(.*?)<\/div><\/div><\/div>/.exec(top)?.[1] ?? '';
    assert.equal(count(row, /role="gridcell"/), personColumns.length);
    assert.equal(render({ rows: 10, editing: { showNewRow: true } }), top);
    // Top: before the body rows; bottom: after them.
    assert.ok(top.indexOf('data-new-row') < top.indexOf('data-row-id="p0"'));
    const bottom = render({ rows: 10, editing: { showNewRow: true, newRowPosition: 'bottom' } });
    assert.match(bottom, /salmon-data-grid-added-rows--bottom/);
    assert.ok(bottom.indexOf('data-new-row') > bottom.indexOf('data-row-id="p9"'));
  });

  it('is absent without showNewRow, in batch, dialog and cell mode, and without add', () => {
    for (const editing of [true, { mode: 'batch' }, { mode: 'dialog' }, { mode: 'cell' }, { showNewRow: true, add: false }].map((e) => (typeof e === 'object' && !('showNewRow' in e) ? { ...e, showNewRow: true } : e))) {
      assert.equal(count(render({ rows: 5, editing: editing as never }), /data-new-row/), 0, JSON.stringify(editing));
    }
  });

  it('the at-rest stand-in renders the same add row as the loaded editing chunk (command column, localized label)', async () => {
    const props = { rows: 8, editing: { showNewRow: true }, columns: [commands, ...personColumns], localeText: { newRowLabel: 'Neue Zeile' } } as const;
    const before = render(props);
    assert.match(before, /aria-label="Neue Zeile"/);
    const host = (await import(new URL('../dist/data-grid/editing/edit-host.js', import.meta.url).href)) as { loadEditChunk(): Promise<unknown> };
    await host.loadEditChunk();
    assert.equal(render(props), before);
  });
});
