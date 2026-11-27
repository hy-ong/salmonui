---
title: Row and column spans
description: Span cells across columns and rows with column `colSpan` and `rowSpan`, or merge equal adjacent values grid-wide with `mergeCells`.
category: Row and Column Spanning
order: 13
demos: [cell-spans]
---

Spans are declarative column fields, not per-cell callbacks or global
switches. Spans are computed for rendered rows only, so the default path pays
one flag check per row when no column spans.

## Column fields

`colSpan` covers the following visible columns of the same row and `rowSpan` the following rows of the same column.
Both take either:

- a function of the cell context (`row`, `rowId`, `rowIndex`, `column`,
  `field`, `value`) that returns the span, where `1` means no span; or
- `true`, which merges equal adjacent non-empty values.

```tsx
const columns = [
  { field: 'block', header: 'Block', rowSpan: true },
  { field: 'tue', header: 'Tuesday', colSpan: ({ row }) => (row.id === 's10' ? 3 : 1) },
];
```

## Data Grid-wide merging

The grid `mergeCells` prop merges equal adjacent values without touching the
column definitions: `'rows'` merges vertically (as if every column had
`rowSpan: true`), `'columns'` horizontally, and `true` both ways. A column's
own `colSpan` or `rowSpan` wins over `mergeCells`.

## Rendering, pinning and virtualization

A spanning cell covers the cells it spans and carries `aria-colspan` or
`aria-rowspan` for assistive technology. Column spans work with column
virtualization: a span that starts before the rendered column range is drawn
from the start of the range, as long as it starts at most 16 columns before
it; a `colSpan` wider than that which starts further left is not
drawn while its start is out of that reach. Row spans work with row
virtualization too: a span whose first row has scrolled above the
rendered rows is drawn from that row, with its value, however far above it
starts, so a `rowSpan` of 20,000 rows stays one cell while you scroll through
it. Explicit `rowSpan` functions are read through an anchor index: the rows
are scanned once, as they come into view (or once up to the target of a
jump), and the index is rebuilt only when the data, sorting, filtering or
the span settings change, so scrolling never re-reads the rows above the
window. A span function should therefore depend only on its cell context.
Merges of equal values (`rowSpan: true`) are drawn from up to 64 rows above
the window, which looks the same since every covered row has the same value.
Spans never cross the edge of the sticky top or bottom rows. Their height
follows the row heights: the fixed `rowHeight`, or the per-row heights of
`getRowHeight`; with rows measured from their content
(`estimatedRowHeight`) a span assumes the fixed row height. The demo below
renders every row with `virtualization: { rows: false }` only because it is
small.

A span never crosses a pin edge: a `colSpan` that would leave its pin zone,
or run past the last column, is clamped there with a development warning.

## Focus, selection and editing

Spanning works with editing, CRUD and `updateCell`: a span behaves as one
cell at its anchor, the top-left cell that draws it:

- **Keyboard.** Arrow keys skip covered cells. Moving into a span lands on
  its anchor; moving out leaves from the span's edge, so ArrowRight from a
  three-column span goes to the column after it and ArrowDown from a
  two-row span goes two rows down. Moving down through a column span
  returns to the column you started in, and moving sideways through a row
  span returns to your row, as in a spreadsheet. Home, End, Ctrl+Home,
  Ctrl+End (⌘+Home and ⌘+End on macOS) and PageUp/PageDown land on anchors
  too.
- **Pointer and selection.** Clicking anywhere on a span focuses and
  selects its anchor cell; `api` calls that name a covered cell use the
  anchor. With `selection: { cellRange: 'box' }` a range grows to cover
  every span it touches (Shift+click, Shift+Arrow); a `flow` range runs
  between anchor cells.
- **Editing.** F2, double-click and Enter edit the anchor cell; Tab,
  Shift+Tab, Enter and Shift+Enter in cell and batch editing skip covered
  cells. `updateCell`, `updateRow`, adding, deleting and batch saves write
  any cell, covered or not, and spans are recomputed from the changed data
  (an edited value can start or end a `rowSpan: true` merge).

Span lookups run only on these actions, never while scrolling, and answer
for any row, including rows outside the rendered window: column spans of the
row, explicit row spans that start any distance above it (from the same
anchor index), and equal-value merges followed up to 4,096 rows each way. A box range whose edges hold more
than 1,024 cells is kept as drawn instead of growing.

<!-- demo: cell-spans -->

## API reference

[`DataGridSpan`](/docs/reference/data-grid/DataGridSpan) and
[`DataGridSpanContext`](/docs/reference/data-grid/DataGridSpanContext)
describe the column `colSpan` / `rowSpan` fields, and
[`DataGridMergeCells`](/docs/reference/data-grid/DataGridMergeCells) the
`mergeCells` prop.