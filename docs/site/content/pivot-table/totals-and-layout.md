---
title: Totals and values placement
description: Pivot grand totals and subtotals with their positions, values on rows or columns at any level, empty members and the value header.
category: Engine
order: 130
demos: [pivot-table-totals]
---

## Grand totals and subtotals

```ts
totals: { grand: 'both', grandPosition: 'end', sub: true, subPosition: 'auto' }
```

- `grand` controls the grand totals: `'both'`, `'rows'` (the grand total row
  only), `'columns'` (the grand total column only) or `'none'`.
  `grandPosition` puts them at the `'start'` or the
  `'end'`.
- `sub` turns subtotals on or off. Set it to `true` or `false`, or pass a
  record per field (`{ year: false }`). The `showSubTotals` flag on a field
  placed on an axis overrides both.
- `subPosition` places subtotals. With `'auto'`, the compact row header of an
  expanded member carries its subtotal and column subtotals follow their
  children. With `'start'`, subtotals come before the children on both axes.
  With `'end'`, they come after: rows get a separate `Asia Total` row (key
  `'["Asia"]|total'`) and the member row holds no values.

An axis with no fields still shows one grand total position.

From code, `pivot.setTotals({ grand: 'rows', sub: false })` merges into
`totals` (action `totals`); the `totals`, `subtotals` and `grandTotals`
toolbar items do the same from the UI
([Toolbar](/docs/pivot-table/toolbar-and-export)), and `showSubTotals:
false` on a placed field (`rows: [{ field: 'region', showSubTotals: false }]`)
hides that field's subtotals only.

## Values placement

`valuesPlacement: { axis, index }` puts the measures on the `'columns'` (the
default) or `'rows'` axis, at level `index` among that axis's fields (`-1`
means innermost). With
`{ axis: 'columns', index: 0 }`, the measures are the outer column headers and
the column fields repeat under each one. On the rows axis, every member row
gets one child row per measure. With a single value field the value level is
hidden unless `showValueHeader` is `true`.

## Empty members

By default an axis shows only member tuples that have rows.
`showEmptyMembers: true` shows every member of
a field under each parent, with empty cells. Members removed by a filter stay
hidden. The text shown in empty cells (`emptyCellText`) is a `PivotTable`
prop.
