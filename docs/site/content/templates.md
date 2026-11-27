---
title: Templates
description: Cell, header and row templates, filter, pager, toolbar, editor and empty templates, per-row and per-cell attribute hooks, and the rules templates follow.
category: Templates
order: 20
demos: [cell-templates, row-template, slot-templates]
---

Templates are functions that return React nodes. String templates are not
supported; React escapes values by default.

## Cell and header templates

A column `renderCell` receives a context with the `row`,
its `rowId` and view `rowIndex`, the `column`, the raw `value`, the
`formattedValue`, and the `selected` and `editing` flags. A column
`renderHeader` receives `{ column, sortDirection,
sortIndex, filtered, grouped }` and replaces the header content while
sorting, resizing and reordering affordances stay in place.

```tsx
const columns: DataGridColumn<Order>[] = [
  {
    field: 'status',
    header: 'Status',
    renderCell: ({ value }) => <StatusBadge status={value as Status} />,
    renderHeader: ({ column, filtered }) => <>{column.header}{filtered ? ' (filtered)' : ''}</>,
    cellClassName: ({ value }) => (value === 'late' ? 'is-late' : undefined),
  },
];
```

Cells and headers accept extra attributes and class names: column
`cellProps` and `cellClassName` take a value or a function of the cell
context, and `headerProps` a value. The grid-level hooks `getRowProps(row,
rowIndex)`, `rowClassName(row, rowIndex)` and `getCellProps(ctx)` (the equivalents of `rowDataBound` and `queryCellInfo`)
return props instead of mutating the DOM, and run only for rendered rows and
cells, so their cost is bounded by the viewport, not the data size.

<!-- demo: cell-templates -->

## Row templates

`renderRow` replaces the whole row element. Its context
is `{ row, rowId, rowIndex, defaultRow, rowProps, cells }`: the template
must spread `rowProps`, which carry `role="row"`, the ARIA row index and the
row id, and place `cells` inside; `defaultRow` is the built-in row,
to wrap instead of replace. Row templates work with row virtualization.

<!-- demo: row-template -->

## Templates for the grid parts

Each grid part has a render prop with a typed context:

| Render prop | Context |
| --- | --- |
| column `renderEditor` | `{ value, setValue, inputProps, ... }` (see [Editing](/docs/data-grid/editing)) |
| column `renderFilter` | `{ column, field, value, setValue, operator, operators, setOperator, apply, clear, editorProps }` |
| column `renderFilterCell` | the same context, for the filter row cell |
| `renderPager` | `{ page, pageSize, pageCount, totalRowCount, pageSizeOptions, goToPage, setPageSize, defaultPager }` |
| `renderToolbar` | `{ items, defaultToolbar, api }` (see [Toolbar](/docs/data-grid/toolbar)) |
| `renderEmpty` | `{ reason: 'noData' \| 'noMatch' }` |
| `renderDetail` | `{ row, rowId, collapse, ... }` (see [Detail rows](/docs/data-grid/detail-rows)) |

`renderFilter` replaces the value editor inside the filter menu: call
`setValue` to change the draft and let the user press OK, or `apply(value)`
to apply at once and close the menu. `renderPager` replaces the pager;
`defaultPager` is the built-in one, to wrap or decorate. `renderEmpty`
receives `noData` when there are no rows and `noMatch` when the search or
the filters match nothing.

<!-- demo: slot-templates -->

## Rules for templates

Templates render inside the grid's virtualized rows, so they follow a few
rules:

- Define templates once, at module scope or in a memo, not inline in a
  component that re-renders often. Render-time functions (`renderCell`,
  `renderHeader`, `renderFilter`, `renderFilterCell`, `cellProps`,
  `cellClassName`, `headerProps`, `colSpan`, `rowSpan`) never recompile
  columns, but other function fields (`valueGetter`, `valueFormatter`,
  `sortComparator`, ...) compare by identity and recompile the column when
  they change. Data Grid-level templates (`renderRow`, `renderEmpty`,
  `getRowProps`, `rowClassName`, `getCellProps`) re-render every visible
  cell when their identity changes. Development builds report a template
  whose identity changes on three consecutive commits through `onWarning`
  (code `template-identity-unstable`).
- Read everything from the context. Do not put scroll positions, pointer
  coordinates, drag state or other high-frequency values into React state
  for a template to read: the grid keeps those transients outside React, and
  a state update per scroll frame would re-render every visible cell.
- Keep templates pure: no side effects while rendering, and no module-level
  mutable state, so they stay SSR- and React Compiler-safe. Effects inside a
  template component run when the row mounts and unmount when it scrolls
  out of the rendered window.

## API reference

[`DataGridColumn`](/docs/reference/data-grid/DataGridColumn) lists the
column render props and attribute hooks, and
[`DataGridProps`](/docs/reference/data-grid/DataGridProps) the grid
ones; the contexts are
[`DataGridCellContext`](/docs/reference/data-grid/DataGridCellContext),
[`DataGridHeaderContext`](/docs/reference/data-grid/DataGridHeaderContext),
[`DataGridRowContext`](/docs/reference/data-grid/DataGridRowContext),
[`DataGridFilterContext`](/docs/reference/data-grid/DataGridFilterContext),
[`DataGridPagerContext`](/docs/reference/data-grid/DataGridPagerContext)
and [`DataGridEmptyContext`](/docs/reference/data-grid/DataGridEmptyContext).
Per-row and per-cell attributes (`getRowProps`, `getCellProps`) are covered
in [Events](/docs/data-grid/events).
