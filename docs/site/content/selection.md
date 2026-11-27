---
title: Selection
description: Row, cell and column selection with pointer, keyboard and methods; id-based, persistent and virtualization-safe.
category: Selection
order: 50
demos: [selection-rows, selection-cells, fill-range]
---

Selection is on by default as single row selection; `selection={false}`
turns it off, and an object configures it. It is stored by row id
and column id, never by view index, so virtualization and live data changes
never shift it to another row.

```tsx
import { DataGrid } from '@salmonui/data-grid';
import '@salmonui/data-grid/styles.css';

<DataGrid
  aria-label="Orders"
  data={orders}
  columns={[{ field: 'select', type: 'selection' }, ...columns]}
  selection={{ multiple: true, persistent: true, rowIds: selectedIds }}
  onSelectionChange={(event) => setSelectedIds(event.rowIds)}
/>
```

## Rows

`multiple` (default `false`) switches from single to multiple selection.
Ctrl/⌘+click toggles a row and Shift+click selects a range.
A checkbox column (a column with `type: 'selection'`) adds a
header select-all checkbox; `checkboxOnly` makes it the only way to
select, and `checkboxRowClick: 'replace'` makes a plain row click
replace the checkbox selection instead of toggling the row (`'add'`, the
default). With `toggle` (default `true`) clicking the only selected
row deselects it, and `additive` toggles rows without a modifier.

By default a sort, filter, search, grouping or page change clears the
selection. `persistent: true` keeps it across those changes (this
also works for cells and does not need multiple selection).

Initial and controlled selection use row ids: `selection.rowIds` is
reactive, so a changed array re-applies. There is no selection by
row index, on purpose: an index is invalidated by every sort, filter, page
or live update, while an id is not. To select by position, map the index
to the id of that row (`api.getViewRows()[index]` through
`getRowId` or the `primaryKey` column) and pass it in `rowIds`.

`api.selectAll()` selects every filtered row in O(1): it stores a scope plus
excluded ids, which serializes and survives paging;
`selectAll({ scope: 'page' })` selects the current page only.

Methods select rows or id ranges (`selectRows(rowIds, { mode })`,
`selectRowRange(fromRowId, toRowId)`), clear rows, cells or columns
(`clearSelection({ rows, cells, columns })`), and read the
selection (`getSelectedRows()`, `getSelectedRowIds()`, `isRowSelected()`,
and the serializable `getSelection()` / `setSelection()`). The
cancelable `onBeforeSelectionChange` and `onSelectionChange` report the
selected `rowIds`, the `added` and `removed` ids, `rows()`, the input
`target` and the `scope`. Rows and cells expose `aria-selected`.

<!-- demo: selection-rows -->

## Cells and columns

`mode: 'cell'`, or row plus cell mode `mode: 'both'`, selects
`cellRange: 'flow'` (text-like, the default) or `'box'` / `'boxWithBorder'`
(rectangular) ranges; `columns: true` adds column selection.
`selectCells(cells, { mode })`, `selectCellRange(anchor, focus)`
and `selectColumns(fields, { mode })` select from code, and
`getSelectedCells()` / `getSelectedColumns()` read the result.

The keyboard map (Mod is Ctrl, or ⌘ on macOS):

| Keys | Action |
| --- | --- |
| Arrow keys | Move focus |
| Shift+Arrow keys | Extend the selection |
| Enter / Shift+Enter | Move to the cell below / above and select it |
| Space | Toggle the focused row or cell |
| Shift+Space | Select the focused row |
| Ctrl+Space | Toggle the focused column (with `columns: true`) |
| Mod+A | Select every row in view, or every cell in cell mode (multiple selection) |
| Mod+Shift+A | Select every filtered row (multiple selection) |
| Escape | Clear the selection |
 Cell and column changes raise the same cancelable
`onBeforeSelectionChange` and `onSelectionChange` events as rows:
`target` is `'cell'` or `'column'`, and `addedCells` / `removedCells` /
`addedColumns` / `removedColumns` list what changed. In row plus cell mode a
click raises a row event and a cell event. Ranges are stored as anchors, so a range can span rows and
columns that are not rendered, so cell selection works with
virtualization.

<!-- demo: selection-cells -->

## Range fill

With `editing.fillHandle` and cell
selection, the cell at the bottom-right of the selected range shows a small
square, the fill handle. Dragging it down, up, left or right extends the
range along that one axis (a diagonal drag follows the axis the pointer has
moved farther along) and, on release, fills the new cells by tiling the
source range: a two-row source repeats every two rows. A dashed outline
previews the extended range, the grid auto-scrolls while the pointer is held
at or past the body edge, and Escape cancels the drag. The drag never
touches React state: the preview and the auto-scroll are DOM writes, and the
grid renders once, when the fill is applied. `api.fillSelection(rowId,
field)` is the programmatic form of the same action, and `onBeforeFill`
(`range`, `target`) cancels either with
`preventDefault()`.
Filled cells go through the edit pipeline, so parsing, validation, saving
and undo apply as for typed edits, and pending drafts of the source range
are copied as shown.

```tsx
<DataGrid
  selection={{ mode: 'cell', multiple: true, cellRange: 'box' }}
  editing={{ mode: 'cell', fillHandle: true, undo: true }}
/>;
api.selectCellRange({ rowId: 'ORD-10000', field: 'customer' }, { rowId: 'ORD-10001', field: 'product' });
api.fillSelection('ORD-13999', 'product');
```

The fill addresses cells by row id and walks the full row model, not the
rendered window, so it works with row virtualization and fills rows that are
not rendered, including rows the drag scrolled past. Hold the pointer below or above the body while
dragging and the grid auto-scrolls; the rows that scroll into view join the
fill, and so do the rows that scroll out again. The drag also crosses pin
edges, from a start-pinned column into the scrolling columns or from them
into an end-pinned column. Read-only cells and the key column are skipped.

<!-- demo: fill-range -->

## API reference

[`DataGridSelection`](/docs/reference/data-grid/DataGridSelection)
lists the `selection` options,
[`DataGridSelectionChangeEvent`](/docs/reference/data-grid/DataGridSelectionChangeEvent)
and [`DataGridBeforeFillEvent`](/docs/reference/data-grid/DataGridBeforeFillEvent)
the event payloads, and [`DataGridApi`](/docs/reference/data-grid/DataGridApi)
the selection methods.
