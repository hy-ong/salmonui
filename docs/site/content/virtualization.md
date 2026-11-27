---
title: Virtualization
description: Row and column virtualization, scaled scrolling for millions of rows, measured row heights and the server-rendered initial range.
category: Virtual Scroll
order: 30
demos: [virtualization, million-rows, variable-row-height, skeleton-rows, virtual-interactions, column-virtualization]
---

Rows and columns are virtualized by default whenever the grid has a height:
the DOM holds the visible cells plus a small
overscan on each edge, and the header stays sticky while
the body scrolls. Scrolling writes only to the DOM and a renderer
store, never to React state, which is what keeps a
100,000 × 100 grid smooth. A smaller row height shows more rows
per viewport.

`virtualization` is `true` by default; an object tunes it and `false`
renders every row and column. `height` (default 400 px) sets the viewport;
`height="auto"` grows the grid with its rows and turns row virtualization
off.

| Option | Default | Meaning |
| --- | --- | --- |
| `rows` | `true` | Row virtualization |
| `columns` | `true` | Column virtualization of the center (unpinned) zone |
| `rowOverscan` | 5 | Rows rendered beyond each edge of the viewport |
| `columnOverscan` | 2 | Center columns rendered beyond each edge |
| `maxScrollHeight` | 15,000,000 px | Physical scroll height cap; taller content is compressed |
| `skeletonRows` | `true` | Skeleton bars in rows that are not loaded yet |

```tsx
<DataGrid data={rows} columns={columns} height={600} rowHeight={32} virtualization={{ rowOverscan: 10 }} />
```

Percent column widths are resolved once per viewport width, so they work
under column virtualization.

<!-- demo: virtualization -->

## Millions of rows

Browsers cap element height at roughly 22 million pixels in some engines.
Beyond `virtualization.maxScrollHeight` the grid compresses the scroll range
and maps the scroll offset back to row positions, so every row stays
reachable. A percentage height needs a parent with a fixed height;
the grid observes its viewport size.

<!-- demo: million-rows -->

## Variable row heights

With `estimatedRowHeight` (an estimate in px) the grid measures rendered rows and corrects
offsets as it scrolls, so wrapped text and templates can produce
rows of different heights under virtualization. Fixed per-row
heights without measuring come from `getRowHeight(row)`. Row templates are
virtualized too (see Templates).

<!-- demo: variable-row-height -->

## Skeleton rows

Rows a remote source has not delivered yet (the unloaded blocks of
[infinite scrolling](/docs/data-grid/infinite-scroll)) render as skeleton rows by default
(`virtualization.skeletonRows`, default `true`): one shimmering bar per visible column (up to eight), in place of
the loading text, which stays in the row for screen readers. The
row keeps `aria-busy="true"` and is
replaced by the data row when its block lands; a failed block still shows
the error and Retry, and `renderLoadingRow` wins over skeleton rows.

The shimmer is a CSS transform on a pseudo-element (no layout or paint per
frame), so scrolling over skeleton rows keeps the scroll budgets and causes
no React commits while the rendered range stays the same. It stops under
`prefers-reduced-motion: reduce` and in forced colors, where the bars stay
static. Skeleton rows are on by default; a grid with no unloaded rows renders no bars and
runs no animation, and `virtualization: { skeletonRows: false }` shows the
loading text instead. The first load of a source shows the loading indicator
instead, which has a skeleton variant too (`loadingIndicator: 'skeleton'`,
see [Data sources](/docs/data-grid/data-sources)).

```tsx
<DataGrid data={source} columns={columns} height={400} infiniteScroll />
// The loading text instead of skeleton bars:
<DataGrid data={source} columns={columns} height={400} infiniteScroll virtualization={{ skeletonRows: false }} />
```

<!-- demo: skeleton-rows -->

## Server rendering

The server renders a deterministic initial range (the first `initialRows`
rows and `initialColumns` center columns, 20 each by default), independent
of the data size; the client hydrates that exact markup
and then measures the real viewport, so no hydration warning results.

## Features that work with virtualization

- Remote group expansion state is preserved across virtual scrolling
  (see Grouping).
- Aggregates and group counts cover all loaded rows, not only the visible
  ones (see Aggregates).
- Row spans work with row virtualization: a span whose first row is above
  the rendered window, however far above, is drawn from its first row with
  that row's value, so spanned and merged cells stay merged at any scroll
  position. Explicit `rowSpan` functions are found through an
  anchor index that is built once per data version as rows come into view,
  so scrolling never re-reads the rows above the window; see
  [Row and column spans](/docs/data-grid/cell-spans).
- Cell selection works with virtualization: ranges are stored by row id and
  column id, so a Shift+click range can start in a row that is no longer
  rendered and cover tens of thousands of rows.
- Ctrl+Home and Ctrl+End (Cmd+Home and Cmd+End on macOS) move the logical
  focus to the first or last cell, then scroll it into view, under row and
  column virtualization.
- Batch editing works with row and column virtualization: drafts and
  delete marks are keyed by row id, keyboard moves scroll the next cell
  into view, and a save covers rows that are not rendered (see
  Editing).
- Pinned columns are excluded from the virtual column range: they stay
  rendered while the center columns scroll, and keyboard focus moves
  between pinned and center columns.
- Column virtualization works with every grid feature, and the column
  features act on columns outside the rendered window;
  see
  [Column virtualization compatibility](#column-virtualization-compatibility).

<!-- demo: virtual-interactions -->

## Column virtualization compatibility

Only the visible center columns plus a small overscan are in the DOM, but
the engine addresses every column by its column id, so no feature depends on
a column being rendered. All of these work with column virtualization on:

- Grouping: the indent and the caption text stay at the start edge while
  the columns scroll (see the wide grouping demo on the
  [Grouping](/docs/data-grid/grouping) page).
- Column spans and stacked headers: a span or a header group that starts
  before the rendered slice is still drawn; a header group spans its
  rendered leaves (stacked headers virtualize by leaf range).
- Batch editing: drafts are keyed by row id and column id, so a draft in a
  column that scrolled out of the DOM stays marked and saves.
- Row templates (`renderRow`): the template receives the rendered cells of
  the current column window.
- Detail templates and hierarchy (`renderDetail`, `childGrid`): the detail
  row spans every column, and its content, a child grid included, stays in
  view and mounted while the parent columns scroll.
- Autofill: `api.fillSelection()` and a fill handle drag that auto-scrolls
  past the right edge tile values into columns that were never rendered.

The column features work on columns outside the rendered window:

- Resize: `api.setColumnWidth()` on an unrendered column updates the scroll
  width at once, and a pointer resize works wherever the column scrolls to.
- Reorder: `api.moveColumn()`, Alt+ArrowLeft / Alt+ArrowRight on a header
  and a header drag move far columns.
- Autofit and Autofit All: widths are measured in an offscreen measurer
  from the header text and the formatted values of the rows in the rendered
  row window, read from the engine rather than from rendered cells, so a
  never-rendered column fits to the same width as a rendered one (a column
  with a `renderCell` template also reads its rendered cells).
- Print: the print projection renders every visible column and row of the
  scope without virtualization.
- Clipboard: a copied range writes every column of the range to the TSV,
  using the same display text as a rendered cell.
- Grouping from the column menu: the Group and Ungroup items work on any
  column, including one opened with `api.openColumnMenu()` while it is not
  rendered.

<!-- demo: column-virtualization -->

## API reference

See [`DataGridVirtualization`](/docs/reference/data-grid/DataGridVirtualization)
and the sizing props (`height`, `rowHeight`, `estimatedRowHeight`,
`getRowHeight`, `initialRows`, `initialColumns`) on
[`DataGridProps`](/docs/reference/data-grid/DataGridProps).