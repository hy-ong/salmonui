---
title: Layouts and drill down
description: The compact layout (row members as a treegrid in one column) and the tabular layout (one pinned column per row field), drill down and up, expanded members, expand and collapse all, and the keyboard.
category: Pivot Table
order: 20
demos: [pivot-table-layouts]
---

```tsx
<PivotTable pivot={pivot} layout="compact" />  // default
<PivotTable pivot={pivot} layout="tabular" />
```

| Layout | Row headers | ARIA |
| --- | --- | --- |
| Compact (default) | One pinned column; members of every row field nest as tree rows, indented per level, with subtotal rows. | `treegrid`: rows carry `aria-level` and `aria-expanded` on members that drill. |
| Tabular | One pinned column per row field, headed by the field caption; an outer member's label shows on the first row of its block. | `grid`: row header cells are `rowheader`s, drill toggles are buttons with `aria-expanded`. |

In the tabular layout the outer label is visually hidden on the following
rows of its block but stays in the cell, so a screen reader announces the
full path on every row. Column members are stacked header rows in both
layouts. The layout is a view setting: switching it keeps the model and
the expanded members of the store. `rowHeaderWidth` sets the row header
column width (default 220 in the compact layout, 150 per column in the
tabular one).

The server renders both layouts as a `grid` with plain cells; after
hydration the client upgrades the compact root to `treegrid` and sets the
row header roles, `aria-level` and `aria-expanded`, so the server HTML is
valid ARIA without the tree attributes.

## Drill down and up

A member with inner members has a toggle. Clicking it, or Enter or Space on
a focused member header, drills it down or up; column headers drill the
same way. Expanded members are part of the model:

```ts
const model = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }, { field: 'quarter' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  expanded: [['rows', 'Asia'], ['columns', 2026]], // expanded member paths
  // expanded: 'all'                               // expand every member
};
```

A path starts with its axis, then the member keys from the outer level in:
`['rows', 'Asia', 'Japan']`. From code:

```ts
pivot.expand(['rows', 'Asia']);
pivot.collapse(['rows', 'Asia']);
pivot.expandAll('rows');   // or 'columns', or both without an argument
pivot.collapseAll();
```

Drilling down computes only the new member's subtree; drilling up is a
view change. Both fire `onBeforeExpandedChange` (cancel with
`preventDefault()`) and `onExpandedChange` with `{ action, path, axis,
expanded, source }`:

```tsx
const pivot = usePivot({
  data,
  defaultPivotModel: model,
  onBeforeExpandedChange: (event) => {
    if (event.action === 'expandAll') event.preventDefault(); // too large for this report
  },
});
```

## Keyboard

Inside the table the Data Grid keyboard model applies (arrows, Home / End,
PageUp / PageDown, Ctrl+Home / Ctrl+End). In addition:

| Key | Action |
| --- | --- |
| Enter or Space on a member header | Drill the member down or up |
| Ctrl+ArrowDown / Ctrl+ArrowUp in the body | Expand or collapse every row member |
| Enter on a value cell | Open drill through (when `drillThrough` is on, [Drill through](/docs/pivot-table/drill-through)) |

Totals and their positions (`pivotModel.totals`) are covered in
[Totals and layout](/docs/pivot-table/totals-and-layout).
