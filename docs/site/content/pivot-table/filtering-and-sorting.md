---
title: Filtering, sorting and grouping
description: Pivot member, label and value filters (top and bottom N), member sort with locale collation and custom order, value sort, and number, date and custom grouping in the engine.
category: Engine
order: 120
demos: [pivot-table-sorting-grouping]
---

Filters live in `pivotModel.filterBy`, keyed by field. Each field takes one
filter of one of these shapes:

```ts
filterBy: {
  region: { include: ['Asia', 'Europe'] },                     // member filter
  country: { label: { operator: 'startsWith', value: 'G' } },  // label filter
  product: { value: { measure: 'amount', operator: 'top', value: 3 } }, // value filter
}
```

To clear a filter, remove its entry. The member editor builds member filters
(see [Member editor and filters](/docs/pivot-table/filtering-ui)).

## Label filters

Label filters use the Data Grid operator names: `equal`, `notEqual`,
`contains`, `doesNotContain`, `startsWith`, `doesNotStartWith`, `endsWith`,
`doesNotEndWith`, `greaterThan`, `greaterThanOrEqual`, `lessThan`,
`lessThanOrEqual`, `between` and `notBetween` (`value2` is the upper bound).
How values compare depends on the field type:

- String members compare by their label, ignoring case unless you set
  `caseSensitive: true`.
- Number members compare numerically: `{ operator: 'greaterThan', value: 2024 }`.
- Date members compare as dates (before, after and between):
  `{ operator: 'between', value: '2024-03-01', value2: '2024-06-30' }`.

## Value filters

A value filter keeps the members of a row or column field whose total for
`measure` passes the condition. The total is taken against the other axis's
grand total. The operators are `equal`, `notEqual`, `greaterThan`,
`greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `between`, `notBetween`,
and `top` / `bottom` with N in `value`. Top and bottom N apply within each
parent member. Filtered-out members are removed before aggregation, so
subtotals and grand totals cover only the members you see. `measure` is a
measure id or a calculated field name.

## Member sort

`pivotModel.sort[field]` is `'asc'` (the default), `'desc'`, `'none'` (data
order) or `{ order: [keys...] }`, which puts the listed members first and
sorts the rest ascending. Strings compare with
`Intl.Collator` for the engine `locale` with numeric collation, so `Item 2`
sorts before `Item 10` (alphanumeric sorting) and `ä` sorts as the locale
expects. Numbers and dates sort by value, and `(Blank)` comes first.

## Value sort

`<PivotTable valueSorting />` adds a sort button to each value column header: a click, or Enter / Space on the header
(Shift+Enter when the header also drills), cycles ascending, descending and
none, and fires the cancellable `onBeforeSortChange` and `onSortChange`.
`pivotModel.valueSort` orders row members by their values in one column:

```ts
valueSort: { columnKey: '["2025"]', measure: 'amount', direction: 'desc', multipleAxis: true }
```

`columnKey` is a column header key (with or without its `|measure` suffix).
`''` means the grand total column. Members without a value go last.
`multipleAxis: true` sorts every row level; without it only the innermost row
field is sorted, and the outer levels keep their member sort.

## Grouping

The engine maps grouped members to new members without copying any rows.
The grouping dialog lives in the React package (see
[Editors](/docs/pivot-table/editors)).

- `{ kind: 'number', start, end, interval }` creates ranges named `0-199`.
  Values below `start` or above `end` go to `< start` and `> end`.
- `{ kind: 'date', parts: ['years', 'quarters', 'months'] }` splits a date
  field into nested levels named `date_years`, `date_quarters` and
  `date_months` (a single part keeps the field's own name). The parts are
  `years`, `quarters`, `quarterYear`, `months`, `days`, `hours`, `minutes`
  and `seconds`, all read in UTC so that server and client render the same
  members.
- `{ kind: 'custom', groups: [{ caption, members }] }` merges the listed
  members under one caption.

Filters, sort and paths use the grouped members: for example
`filterBy.date_years` or `['rows', 2024, 1]`.

## From code

The store has one cancellable command per part of the model; each fires its
specific events and `onBeforePivotModelChange` / `onPivotModelChange`
([State and events](/docs/pivot-table/state)):

```ts
pivot.setFilter('country', { exclude: ['Japan'] }); // onBeforeFilterChange / onFilterChange
pivot.setSort('country', { order: ['Japan', 'India'] }); // onBeforeSortChange / onSortChange
pivot.setValueSort({ columnKey: '', measure: 'amount', direction: 'desc' }); // the same sort events
pivot.setGrouping('placed', { kind: 'date', parts: ['years', 'quarters'] }); // action: 'group'
pivot.setGrouping('placed', null); // ungroup
```

In the UI, the sort items of a field menu set the member sort, the value
column headers of `<PivotTable valueSorting>` set the value sort, and
"Group…" in the menu of a field on the rows or columns opens
the grouping dialog.
