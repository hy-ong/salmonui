---
title: Columns
description: Column definitions, widths, alignment, types and formats, visibility, resizing, reordering and auto-size.
category: Columns
order: 10
demos: [columns-basics, column-api, column-capabilities, column-layout, column-fit, row-number]
---

Columns are plain definition objects, passed as the `columns` array or as
`<DataGridColumn>` children (nested children form stacked headers). Each one is compiled once per stable
definition and addressed by a stable column id (its `id`, else its `field`),
so state such as width, order and visibility survives data changes.

## Defining columns

A column reads a row field or computes its value from the row.
Widths accept pixels, percentages of the viewport and `auto`, with
minimum and maximum bounds that also clamp resizing. Cell and header
text align with logical directions, so alignment mirrors in RTL.

Typed columns format numbers, currency, percentages and dates
through the platform `Intl` API using the grid locale, currency and time
zone. Boolean columns can render as checkboxes. Overflowing
text is clipped, truncated with an ellipsis, or truncated with a tooltip
(`overflow: 'clip' | 'ellipsis' | 'ellipsisWithTooltip'`).
A `primaryKey` column derives the stable row id.

```tsx
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import '@salmonui/data-grid/styles.css';

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', type: 'number', primaryKey: true, width: 100 },
  { field: 'customer.name', header: 'Customer', width: '30%', minWidth: 160 },
  { field: 'total', header: 'Total', type: 'number', format: 'C2', align: 'end' },
  { id: 'net', header: 'Net', valueGetter: (row) => row.total - row.tax, type: 'number' },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true },
];

<DataGrid data={orders} columns={columns} locale="en-US" currency="USD" timeZone="UTC" aria-label="Orders" />
```

<!-- demo: columns-basics -->

Dates are formatted on the server as well as in the browser, so a server
rendered grid must pin the time zone and locale; otherwise the two outputs
differ and hydration fails.

## Array or children, inferred types and column ids

The `columns` array and `<DataGridColumn>` children take the same fields and compile to the same stable
columns; pass one form (with both, the children win and development builds
warn).

Without `type`, a column infers it from the first non-null value of its
field: `number`, `boolean`, `string` or `date`. Rows that arrive
later resolve a pending type without recompiling the columns. When no value
decides the type, the column falls back to `string` with a development
warning; set `type` to silence it.

A column id resolves from `column.id`, then `column.field`; a column with
neither, such as a template-only column, gets a deterministic generated id
(`__col_<position>`, identical on the server and the client) and a
development warning, and a duplicate id gets a `~2` suffix. Give
such columns an `id` so state, events and methods can address them.

The instance reads the compiled columns:

| Method | Returns |
| --- | --- |
| `api.getColumn(fieldOrId)` | The column with that id, else the first with that field |
| `api.getColumns()` | Every leaf column in definition order, hidden ones included |
| `api.getVisibleColumns()` / `api.getHiddenColumns()` | Visible leaves in runtime order / hidden leaves |
| `api.getColumnAt(index)` | The visible leaf at an index (`getColumnByIndex`) |
| `api.getColumnIndex(fieldOrId)` | Its index among the visible leaves, or -1 |

## Text, markup and templates

Cell text is always text: React escapes it, so a value such as
`<b>Aiko Tan</b>` shows its angle brackets and can never inject markup.
There is no switch that renders cell values as HTML: it would add a per-cell branch and an XSS footgun
for no capability gain. Return elements from `column.renderCell` instead
of building HTML strings; for trusted HTML the
application owns the `dangerouslySetInnerHTML` call inside its template.

Templates are functions only: there are
no `${field}` string templates. `column.renderCell(ctx)` and
`column.renderHeader(ctx)` receive the row, value and formatted value
and return React content. Functions are type-checked, need no template
compiler (string evaluation breaks a strict CSP), and keep untrusted data
out of HTML parsing. For example, `renderCell: ({ row }) => <b>{row.Name}</b>`. See
[Templates](/docs/data-grid/templates) for every template hook.

<!-- demo: column-api -->

## Capability flags, locked and identity columns

Data Grid-wide features turn on with `sorting`, `filtering`, `search`,
`grouping`, `editing`, `resizable` and `reorderable`; a column turns its
part off with `sortable`, `filterable`, `searchable`, `groupable`,
`editable`, `resizable` or `reorderable` set to `false`. The flags are enforced
by the core, so methods respect them as well as the header, filter bar,
search box and menus.

`column.lockPosition` keeps a column first in its
pinned zone: it cannot be reordered, and no other column can move before it.
`column.identity` (`isIdentity`) marks a key the server generates;
it defaults `editable` to `false`.

<!-- demo: column-capabilities -->

## Row numbers

A column with `type: 'rowNumber'` and no field numbers the rows.
The number is the position of the data row in the current view: it follows
sorting and filtering, continues across pages (page 2 of 25-row pages starts
at 26) and skips group captions and footers. Only rendered rows compute a
number, so the column adds no work beyond the visible window. The column
defaults to the header `#` (`localeText.rowNumberColumnHeader`), end
alignment, and no sorting, filtering, searching, grouping or editing; its
own fields win, and `renderCell` receives the number as `value`.

<!-- demo: row-number -->

## Visibility, resizing, reordering and auto-size

Columns are hidden and shown through the reactive column `hidden` field or
by id or field through `api.hideColumns()` and `api.showColumns()`,
which raise `onBeforeColumnVisibilityChange` (cancellable) and
`onColumnVisibilityChange`. Resizing and reordering are opt in
with the grid `resizable` and `reorderable` props. Header edges resize
columns with the pointer and the keyboard; double-clicking an edge,
or calling the auto-size method,
fits the width to the header and the rendered cells. Headers drag
to reorder, and `Alt+ArrowLeft` / `Alt+ArrowRight` move the focused
header. Width, order and visibility are engine state, so they never
re-render rows while a drag is in progress.

On a focused header, `Ctrl+Alt+ArrowRight` and `Ctrl+Alt+ArrowLeft` widen and
narrow the column by 10 px (mirrored in RTL), and `Ctrl+Alt+Enter` auto-sizes
it. Every width, from the pointer, the keyboard, auto-size,
`api.setColumnWidth()` or a changed `column.width`, is clamped to the
column's `minWidth` and `maxWidth` by the core.

Pointer resizes raise `onColumnResizeStart`, `onColumnResize` once per frame
and `onColumnResizeEnd` with `{ field, width, previousWidth }`; `preventDefault()` in
`onColumnResizeStart` cancels the gesture. The keyboard resize keys raise the
same three events once per key press with `source: 'keyboard'`, so
a reactive `column.width` stays in sync; `api.autoSizeColumns()` and the
column menu auto-size items do not raise them. Header drags raise `onColumnDragStart`,
`onColumnDrag` per frame and `onColumnDrop` with `{ field, fromIndex,
toIndex }` (`toIndex` is -1 while the drop target is invalid); every
move, by pointer, keyboard or method, also raises `onBeforeColumnReorder`
(cancellable) and `onColumnReorder`. `preventDefault()` in
`onBeforeColumnReorder` keeps the column where it was: a pointer drag still
reports `onColumnDrop`, but the order does not change and `onColumnReorder`
does not fire. While a header is dragged, a preview with the header text
follows the pointer and a line marks the drop position; both disappear on
drop or when the pointer is cancelled (a cancelled pointer moves nothing).

`api.moveColumn(field, toIndex)` moves a column to an index of the visible
columns; it is rejected across pinned zones and
for locked columns. To keep widths, treat `column.width` as
reactive state written back from `onColumnResizeEnd`, as the demo does for
Customer, or let `persistState` save widths with the rest of the grid state
(see [State persistence](/docs/data-grid/state-persistence)).

<!-- demo: column-layout -->

## Column fit and computed headers

`resizeMode` picks how the
columns relate to the grid width. `'normal'`, the default, keeps every
width: narrow columns leave empty space at the end and wide ones scroll, and
a resize changes only the resized column. With `'auto'`, columns narrower
than the grid stretch in proportion to their width until they fill it,
again whenever the grid is resized; `maxWidth` caps a column and columns
with `resizable: false` (such as the selection column) keep their width.
Dragging a header edge then re-fits the other columns live, and the release
stores the fitted widths so nothing jumps. Columns are never shrunk below
their widths to avoid scrolling: wide
content still scrolls horizontally (shrinking below declared widths would truncate content and add a layout
pass on every viewport resize). To fit more columns without scrolling, use
`resizeMode="auto"` and give columns a smaller `width` or a percentage
where they must fit without scrolling.

```tsx
<DataGrid data={orders} columns={columns} resizable resizeMode="auto" />
```

`headerValueGetter` computes a
header text from the compiled column, for example to add a unit or a
currency. It runs when the column compiles, and its result is the header
text everywhere: the header cell, the column chooser and menu, filter and
group labels, accessible names, and CSV, Excel and PDF exports. Give it new
values by passing a new column definition.

```tsx
{ field: 'amount', type: 'number', headerValueGetter: () => `Amount (${currency})` }
```

<!-- demo: column-fit -->

## API reference

[`DataGridColumn`](/docs/reference/data-grid/DataGridColumn) and the
core [`ColumnDef`](/docs/reference/data-grid/engine/ColumnDef) list every column
field; the column methods are on
[`DataGridApi`](/docs/reference/data-grid/DataGridApi).
