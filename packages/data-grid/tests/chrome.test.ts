import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClipboardModule } from '@salmonui/data-grid/engine/clipboard';
import { createEditModule } from '@salmonui/data-grid/engine/edit';
import type { DataGridColumn } from '@salmonui/data-grid';
import { count, render, type Person } from './fixtures.ts';

// Column chrome in the server HTML: toolbar enablement from the core
// modules, pinned column counts, cell spans, and the filter bar row.

const columns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 80 },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'age', header: 'Age', type: 'number', width: 90 },
];

function toolbarButton(html: string, id: string): string {
  const match = html.match(new RegExp(`<button[^>]*data-toolbar-item="${id}"[^>]*>`));
  assert.ok(match, `toolbar item ${id}`);
  return match[0];
}

describe('toolbar UI commands', () => {
  it('edit and copy items are unavailable without the edit / clipboard modules', () => {
    const html = render({ rows: 5, toolbar: ['add', 'edit', 'delete', 'save', 'cancel'] });
    for (const id of ['add', 'edit', 'delete', 'save', 'cancel']) assert.match(toolbarButton(html, id), /aria-disabled="true"/);
  });

  it('the core edit module makes the items available; at rest the edit state enables add only', () => {
    const html = render({ rows: 5, modules: [createEditModule<Person>(), createClipboardModule<Person>()], toolbar: ['add', 'edit', 'delete', 'save', 'cancel'] });
    assert.doesNotMatch(toolbarButton(html, 'add'), /aria-disabled/);
    // No selected row or focused cell, nothing editing: no reason title (the items exist, the state disables them).
    for (const id of ['edit', 'delete', 'save', 'cancel']) {
      assert.match(toolbarButton(html, id), /aria-disabled="true"/, id);
      assert.doesNotMatch(toolbarButton(html, id), /title=/, id);
    }
  });

  it('a selected row enables edit and delete in the server HTML; save and cancel wait for an edit', () => {
    const html = render({ rows: 5, selection: { rowIds: ['p1'] }, editing: { mode: 'row' }, toolbar: ['add', 'edit', 'delete', 'save', 'cancel'] });
    for (const id of ['add', 'edit', 'delete']) assert.doesNotMatch(toolbarButton(html, id), /aria-disabled/, id);
    for (const id of ['save', 'cancel']) assert.match(toolbarButton(html, id), /aria-disabled="true"/, id);
    const batch = render({ rows: 5, editing: { mode: 'batch', add: false }, toolbar: ['add', 'save', 'cancel'] });
    for (const id of ['add', 'save', 'cancel']) assert.match(toolbarButton(batch, id), /aria-disabled="true"/, id);
  });

  it('an item object with a built-in id keeps the built-in and takes label, title and disabled', () => {
    const html = render({ rows: 5, modules: [createEditModule<Person>()], toolbar: [{ id: 'add', label: 'New person', title: 'Add a row', disabled: true }] });
    const button = toolbarButton(html, 'add');
    assert.match(button, /data-builtin="add"/);
    assert.match(button, /aria-disabled="true"/);
    assert.match(button, /title="Add a row"/);
    assert.match(html, /New person/);
  });
});

describe('pinned columns', () => {
  it('pinnedColumns.start pins the first N visible columns', () => {
    const html = render({ rows: 5, columns, pinnedColumns: { start: 1 } });
    const left = html.match(/<div class="salmon-data-grid-pin salmon-data-grid-pin--left"[^>]*>(.*?)<div class="salmon-data-grid-center">/)?.[1] ?? '';
    assert.match(left, /data-column-id="id"/);
    assert.doesNotMatch(left, /data-column-id="name"/);
  });
});

describe('cell spans', () => {
  it('a colSpan function spans the following columns of the rendered row', () => {
    const spanned: readonly DataGridColumn<Person>[] = [{ ...columns[0], colSpan: ({ rowIndex }) => (rowIndex === 0 ? 2 : 1) } as DataGridColumn<Person>, columns[1] as DataGridColumn<Person>, columns[2] as DataGridColumn<Person>];
    const html = render({ rows: 3, columns: spanned });
    assert.equal(count(html, /aria-colspan="2"/), 1);
  });

  it('rowSpan: true merges equal adjacent values without row virtualization', () => {
    const merged: readonly DataGridColumn<Person>[] = [
      { field: 'active', header: 'Active', type: 'boolean', width: 90, valueGetter: () => 'same', rowSpan: true } as DataGridColumn<Person>,
      columns[1] as DataGridColumn<Person>,
    ];
    const html = render({ rows: 3, columns: merged, virtualization: { rows: false } });
    assert.match(html, /aria-rowspan="3"/);
  });

  it('mergeCells: "columns" merges equal values of adjacent columns', () => {
    const same: readonly DataGridColumn<Person>[] = [
      { id: 'a', header: 'A', width: 80, valueGetter: () => 'x' },
      { id: 'b', header: 'B', width: 80, valueGetter: () => 'x' },
      columns[1] as DataGridColumn<Person>,
    ];
    const html = render({ rows: 2, columns: same, mergeCells: 'columns' });
    assert.equal(count(html, /aria-colspan="2"/), 2);
  });
});

describe('filter bar', () => {
  it('renders one filter row below the header and counts it in aria-rowindex', () => {
    const html = render({ rows: 5, filtering: { ui: 'row' } });
    assert.equal(count(html, /class="salmon-data-grid-header-row salmon-data-grid-filter-bar"/), 1);
    assert.match(html, /role="row" aria-rowindex="2" class="salmon-data-grid-header-row salmon-data-grid-filter-bar"/);
    assert.match(html, /role="row" aria-rowindex="3"[^>]*data-row-id="p0"/);
  });
});
