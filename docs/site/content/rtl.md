---
title: Right-to-left
description: RTL layout, keyboard and scrolling.
category: RTL
order: 120
demos: [rtl]
---

A grid inside a `dir="rtl"` ancestor, or with an explicit `dir` prop,
renders right to left. `dir` takes `'ltr'`, `'rtl'` or
`'auto'`; `'auto'` follows the script of the grid `locale`, so
`locale="ar-EG"` with `dir="auto"` is right to left (see
[Localization](/docs/data-grid/localization)). Without `dir` the grid inherits the
ancestor direction. All grid CSS uses logical properties, so the layout,
alignment, indents and frozen zones mirror without RTL-specific styles.
Arrow keys move in visual order: in RTL, ArrowLeft moves to the
next column, and the pager arrow keys flip the same way. Horizontal
scroll offsets are normalized across browsers, so column virtualization
works in RTL.

In an RTL grid each body cell lays out its text with its own direction
(`unicode-bidi: plaintext`), so a left-to-right value such as a German
date ("1. März 2014") or an amount keeps its order instead of being
reordered around the neutral characters, while Arabic or Hebrew text stays
right to left; cells stay aligned to the grid's start side (and `align:
'end'` to its end side).

```tsx
<DataGrid data={orders} columns={columns} locale="ar-EG" dir="auto" />
```

The resolved `dir` is computed from props alone (the `'auto'` case from the
`locale` string), so the server renders the same `dir` attribute the client
hydrates with; an inherited direction needs no prop, since the logical CSS
mirrors the server markup without script.

## Pinned columns, resizing and reordering

Pinning is logical: `pinned: 'start'` and `pinnedColumns.start` pin to the
right edge in RTL and `'end'` to the left edge, so the same column
definitions serve both directions. The resize handle sits on the
column's end edge, the left edge in RTL; dragging it to the left widens the
column, and the keyboard resize keys on a focused header
(Ctrl+Alt+ArrowLeft, Ctrl+Alt+ArrowRight) follow the visual direction, as do
the reorder keys (Alt+ArrowLeft, Alt+ArrowRight). While a header is dragged,
the drop indicator and the drag preview are positioned from the logical
start, so they track the pointer in either direction. `onColumnResizeEnd`
and `onColumnReorder` report the same widths and visible indices as in LTR.

<!-- demo: rtl -->

## API reference

`dir` is documented on
[`DataGridProps`](/docs/reference/data-grid/DataGridProps).