---
title: Detail rows
description: Expandable detail rows with a render prop, async loading, per-row and expand-all control, keyboard support and virtualization.
category: Detail Template
order: 150
demos: [detail-rows]
---

`renderDetail` renders a detail row below every expanded row. The grid adds a toggle column in front of the columns; the detail
row is one `role="row"` with a single cell spanning every column, so it
spans the full width even with pinned columns. With pinned rows
(row pinning), detail rows belong to the scrolling rows only: a
pinned row shows no toggle and no detail row, and Enter on its toggle cell
does nothing. `api.expandDetail()` still records the expansion of a pinned
row, and its detail row appears once the row is unpinned. Detail rows of
scrolling rows render directly below their row, under the pinned zone, and
scroll with it. The toggle button
carries `aria-expanded` (a row of a `grid` may not), and the parent row
`data-expanded` for styles and row templates. `detailHeight` is the estimated height before the
row is measured (default 150 px).

```tsx
<DataGrid
  aria-label="Orders"
  data={orders}
  columns={columns}
  renderDetail={({ row, collapse }) => <OrderSummary order={row} onClose={collapse} />}
/>
```

## Loading and rows without a detail

`loadDetail({ rowId, row, signal })` loads the content of a row when it is
expanded. `renderDetail`
receives `status` (`loading`, `ready`, `error`), `data`, `error` and
`retry`; the load runs once per row object and is aborted when the row is
replaced. `hasDetail(row)` hides the toggle for rows without a detail.

## Expanding

Methods expand or collapse one detail row or all of them:
`expandDetail(rowId)`, `collapseDetail(rowId)`, `toggleDetail(rowId)`,
`expandAllDetails()`, `collapseAllDetails()`, `isDetailExpanded(rowId)`.
`defaultExpandedDetails` starts with every row (`true`) or a list of row
ids expanded. `onBeforeDetailToggle` (cancel with `preventDefault()`) and
`onDetailToggle` fire for each row. Expansion is kept by row id across
sorting, filtering, paging and data updates.

## Keyboard

Enter or Space on the toggle cell toggles the detail. Arrow keys
move onto the detail row; Enter moves focus into its content and Escape
returns. Mod+ArrowDown and Mod+ArrowUp (Mod is Ctrl, or ⌘ on macOS) expand
and collapse every detail row when the grid is not grouped.

## Virtualization and export

Detail rows are rows of the virtualized row model: only rendered detail
rows mount, and their measured heights feed sparse row metrics, so a grid
of 10,000 expanded rows scrolls like a plain one. Excel and PDF
exports follow the expansion (`hierarchy: 'expanded' | 'all' | 'none'`): the
`detail` export hook returns `{ text }` lines for a detail template, and
child grids are written automatically (see
[Child grids](/docs/data-grid/child-grids)). `print()` and `printing` take the same
`detail` hook, so a detail template prints as its `{ text }` lines. In
`'expanded'` mode (the default) only rows whose detail is expanded get a
block, whatever the hook returns for the others; `'all'` calls the hook for
every row and `'none'` writes no detail rows. CSV has no detail rows.

<!-- demo: detail-rows -->

## API reference

[`DataGridDetailContext`](/docs/reference/data-grid/DataGridDetailContext),
[`DataGridDetailLoadContext`](/docs/reference/data-grid/DataGridDetailLoadContext)
and [`DataGridDetailToggleEvent`](/docs/reference/data-grid/DataGridDetailToggleEvent)
describe the render, load and toggle payloads;
[`DataGridProps`](/docs/reference/data-grid/DataGridProps) lists the
detail props and [`DataGridApi`](/docs/reference/data-grid/DataGridApi)
the expand methods.