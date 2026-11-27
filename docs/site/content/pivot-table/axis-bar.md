---
title: Axis bar
description: PivotAxisBar, the grouping bar - field buttons for the Filters, Columns, Rows and Values axes with sort, filter, aggregation and remove, the fields panel, per-field options, drag and drop and the keyboard.
category: Fields and filters
order: 45
demos: [pivot-table-axis-bar]
---

The axis bar shows the report's fields as
buttons, one toolbar per axis, above the table. Use the built-in one or
place `PivotAxisBar` yourself; both bind to the store.

```tsx
<PivotTable pivot={pivot} axisBar />
<PivotTable pivot={pivot} axisBar={{ showFieldsPanel: true, showRemove: false }} />

// Standalone, anywhere in the page:
<PivotAxisBar pivot={pivot} axes={['rows', 'columns', 'values']} />
```

## Options

| Option | Default |
| --- | --- |
| `showFieldsPanel` | `false` |
| `showSort` | `true` |
| `showFilter` | `true` |
| `showAggregate` | `true` |
| `showRemove` | `true` |
| `draggable` | `true` |
| `axes` | every axis |

`PivotAxisBar` also takes `pivot` (required), `aggregateOptions`,
`localeText`, `className` and `style`. With `<PivotTable axisBar>`, the
table passes its own `aggregateOptions` and `localeText`.

Per field, `PivotFieldDefinition` options override the bar for that field:
`sortable`, `filterable`, `removable`, `draggable` and `hidden` (a hidden
field has no button). A sorted field shows an arrow, a filtered field a
filter mark.

## Field menu

Clicking a field button (or Enter, Space or Shift+F10 on it) opens its
menu: Sort ascending, descending or none; Filter… (the member editor,
[Filtering UI](/docs/pivot-table/filtering-ui)) and Clear filter; Group… and
Ungroup on row and column fields (ranges, date parts or custom member groups by field type); on value fields "Summarize values by" with the `aggregateOptions`
and Number format…; then "Move to" the
other axes, Move up, Move down and Remove. `onBeforeAggregateMenuOpen`
receives `{ field, index, items }`; edit
`items` to change the offered aggregates or call `preventDefault()` to
hide the submenu.

## Drag and drop and keyboard

Drag a button to another axis toolbar, or along its toolbar to reorder.
The keyboard alternative is the same as in the
[field list](/docs/pivot-table/field-list#moving-fields): ArrowLeft /
ArrowRight (mirrored in RTL), Home and End move focus inside a toolbar
(one tab stop per toolbar); Alt+ArrowUp / Alt+ArrowDown reorders; Delete
removes; the menu's "Move to" items move to another axis.

Moves fire `onBeforeFieldMove` and `onFieldMove` with `{ field, from, to,
index, source }`, the same events as the field list.

Each axis is a `toolbar` with one tab stop; a button's accessible name is
its caption and its description names its menu.

The bar renders its buttons on the server; menus load on first open.
