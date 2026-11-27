---
title: Filtering
description: The filter row, menu, checklist and Excel filter UIs, operators, initial and nested filters, case and accent matching, filter methods and server-side filtering.
category: Filtering
order: 62
demos: [filter-row, filter-menus, filter-builder, filter-status, remote-query]
---

`filtering` turns filtering on: `true` for the defaults, or a
`DataGridFiltering` object. Filtering is a core pipeline stage, so the
filter state lives in the engine and survives virtual scrolling, sorting and
grouping. A column opts out with `filterable: false`.

## Filter row

The default UI, `filtering.ui: 'row'`, is a row of labelled inputs under the
header. A plain value uses the column's default operator
(`contains` for strings, `equal` otherwise). An operator prefix picks
another one: `>=`, `<=`, `>`, `<`, `=`, `!=` or `<>`; `*` and `%` in string
text are wildcards, so `Lyo*` is a `like` condition. Escape clears
the cell. Invalid text, for example letters in a number column, marks the
input `aria-invalid` and keeps the previous filter. A filter set elsewhere
(the initial `filtering.filters`, a menu or a method) is written into the
cell with its operator prefix (`>=50`), a `between` range as `100..500`, and
the cell is marked `data-filtered`; Enter on that text keeps the condition,
also for operators without a prefix such as `startsWith`.

`filtering.showOperators` adds an operator dropdown to each cell, which
replaces the prefixes; with `between` the cell is a text input
that takes `from..to`. `filtering.trigger` decides when a cell
applies: `'enter'` (the default) on Enter, `'input'` while typing, after
`filtering.debounce` milliseconds (default 1500). A column's
`renderFilterCell(ctx)` replaces its cell, for example with a select; the
context carries the column, the applied value and operator, and `apply`,
`setValue` and `clear`.

With the filter row and paging, the pager shows the applied filters on a
line under its controls, for example "Filtered by Country: Equal Japan;
Amount: Greater than or equal 200". It lists every condition, whatever set it, flattens nested groups
and shortens an `in` list after five values; the initial filters are part
of the server render. `filtering.showStatus: false` hides it. The message
belongs to the pager: a grid without paging, a
`renderPager` template or the menu UIs show none. The text comes from the
`localeText` keys `filterStatus` (`{conditions}`), `filterStatusCondition`
(`{column}`, `{operator}`, `{value}`) and `filterStatusSeparator`.

<!-- demo: filter-row -->

## Filter menus

`filtering.ui: 'menu'` puts a filter button in each header that opens a
filter dialog with an operator and a typed value.
`'checklist'` lists the column's distinct values with checkboxes,
and `'excel'` combines the checklist with a custom filter of up to two
conditions joined by And or Or. Alt+↓ on a focused header opens
the dialog; Escape closes it and returns focus to the header. A column's
`filter.ui` overrides the grid-wide UI, and
`filtering.headerButton: false` hides the header buttons when the dialogs
are opened only from the column menu or `api.openFilterMenu(field)`.

```tsx
<DataGrid
  data={orders}
  columns={[
    { field: 'customer', header: 'Customer' },
    { field: 'country', header: 'Country', filter: { ui: 'checklist' } },
    { field: 'amount', header: 'Amount', type: 'number', filter: { operator: 'greaterThanOrEqual' } },
  ]}
  filtering={{ ui: 'excel', filters: [{ field: 'country', operator: 'in', value: ['Japan', 'France'] }] }}
  onFilterChange={(event) => console.log(event.filters)}
/>
```

The value editors follow the column type: text, number (with From and To
for `between`), date, date and time, and a true/false select for booleans.
A column's `filter.editorProps` passes attributes such as `min`,
`max` and `placeholder` to the built-in editors, and `renderFilter(ctx)`
replaces the value editor with your own, for example a dropdown.

The checklist has a search box that narrows the list, a Select All
checkbox with a mixed state, one Blanks entry for empty and missing values,
and the row count of each value. The counts exclude the column's own filter,
so unchecked values stay listed. The list requests
`filtering.checklistPageSize` values at a time (default 100) and the next
batch as it scrolls to its end; `filtering.checklistInfiniteScroll:
false` requests every value at once. The list is virtualized either
way, and Select All or a single toggle applies to values that are not loaded
yet. Custom filter UIs read the same distinct values and counts with
`getColumnFacet(field, options)`.

<!-- demo: filter-menus -->

## Operators

String columns offer `contains`, `startsWith`, `endsWith`,
`doesNotContain`, `doesNotStartWith`, `doesNotEndWith`, `isEmpty` and
`isNotEmpty`. Every type has `equal` and `notEqual`;
numbers and dates add `greaterThan`, `greaterThanOrEqual`, `lessThan`,
`lessThanOrEqual` and `between` with a `[from, to]` value. `isNull`,
`isNotNull`, `in` and `notIn` (with an array value) work on every type,
and `like` (with `%` and `*`) and `wildcard` match patterns.
The core also accepts the lowercase spellings (`startswith`).

`filtering.operators` sets the operators offered per column type, in order,
with the first as the default; a column's `filter.operators` overrides it
for that column and `filter.operator` sets its default.

## Custom comparer

A column's `filterComparator(value, filterValue, operator)` replaces the
built-in test for every built-in operator on that column. It
receives the raw cell value, the condition's value
(an array for `between`, `in` and `notIn`) and the operator in its camelCase
name, and returns `true` when the cell matches. The comparator owns the
comparison, so `matchCase` and `ignoreAccents` are not applied to its
inputs. It runs once per distinct cell value, not once per row, so it must
not read other fields of the row; a longer value never narrows the previous
result. Columns without a comparator keep the built-in path. The comparator
runs on local data only: a remote source receives the condition as usual.
Custom operators registered with the filter module keep their own function.

```tsx
const squash = (v: unknown) => String(v ?? '').toLowerCase().replace(/[\s-]+/g, '');
const columns: DataGridColumn<Order>[] = [
  {
    field: 'customer',
    filterComparator: (value, filterValue, operator) =>
      operator === 'contains' ? squash(value).includes(squash(filterValue)) : squash(value) === squash(filterValue),
  },
];
```

## Filter state and methods

`filtering.filters` holds the active filters as `DataGridFilter[]`: conditions
`{ field, operator, value, logic, matchCase, ignoreAccents }` and nested
groups `{ logic, filters }`. A group's `logic` combines its
members: `(A OR B) AND C` is
`[{ logic: 'or', filters: [A, B] }, C]`, and groups nest; `not: true`
negates a group. A condition's
`logic` (default `'and'`) joins it to the previous condition on the same
column at the top level; inside a group it is ignored. Top-level columns
and groups are ANDed. The prop is reactive: a new value replaces the filters, and the
initial value is part of the server render. `onBeforeFilterChange` can
cancel a change with `preventDefault()`; `onFilterChange` reports the
applied `filters`, the `previousFilters` and the `field`.

`field` in a condition is the column id (its `id`, else its `field`), so two
columns over the same field filter independently.

`api.filterColumn(field, operator, value, { logic, matchCase, ignoreAccents })`
replaces a column's conditions; an array value with a single-value operator
ORs one condition per value. `clearFiltering(fields?)` removes the
filters of the given columns or all of them, and `removeFilter(field)`
removes one column's filters.
`getFilteredRows()` returns the rows that pass the search and every filter,
in sort order and across every page. It is synchronous and returns the same array while the rows,
filters and sort are unchanged. With a remote source that filters, the
server holds the filtered rows, so `getFilteredRows()` returns the rows the
grid loaded: the current page when the server pages, every filtered row
when it does not. To get every filtered row of a server-paged source,
read them from your data source with the current query.

<!-- demo: filter-status -->

## Filter builder

`filtering.builder` adds an advanced filter builder: a dialog that edits the whole filter tree as
nested AND/OR groups of conditions. Each group has an And / Or choice,
Add condition, Add group and (below the root) Remove group buttons; each
condition picks a field, an operator from the column's list and a typed
value. OK applies the tree as one filter change, Clear empties the draft
and Cancel or Escape closes the dialog without applying. The dialog is
modal: Tab stays inside it, and focus returns to the toolbar button or the
grid on close.

There is no second rule model: the builder reads and writes
`filtering.filters`, so the groups it builds are the `DataGridFilter` groups
above and the filter row or menus keep working on the same state. Open it
with the `'filterBuilder'` toolbar item or `api.openFilterBuilder()`, and
close it with `api.closeFilterBuilder()`. The field list offers the
filterable visible columns; `builder: { includeHidden: true }` adds the
hidden ones.
`onBeforeFilterBuilderOpen` receives the applied `filters` and cancels the
opening with `preventDefault()`; the applied change reports through
`onBeforeFilterChange` / `onFilterChange` with `ui: 'builder'`.

The dialog code is a lazy chunk: a grid without `filtering.builder` never
downloads it, and one with it preloads the chunk after mount.

The builder edits the same `filtering.filters` tree (`DataGridFilter[]`)
as every other filter UI, so there is no separate rule API: read the
applied tree from `onFilterChange`, `onBeforeFilterBuilderOpen` or
`getState().filters`, clear it with `clearFiltering()`, and open or close
the dialog with `openFilterBuilder()` / `closeFilterBuilder()`.
| `advancedFilterComplete` | `onFilterChange` with `ui: 'builder'` |

<!-- demo: filter-builder -->

## Lookup columns

A lookup column filters by its display text, not by the key stored in the
row: typing "loose" in the demo's Category cell finds the rows whose
key is `Tea`, and the checklist lists the names. See
[Lookup columns](/docs/data-grid/lookup-columns).

## Case and accents

Matching ignores case by default; `filtering.matchCase` makes it
case-sensitive and a condition's `matchCase` overrides it.
`filtering.ignoreAccents` folds accents before comparing, so "jose" matches
"José"; a condition's `ignoreAccents` overrides it.

## Server-side filtering

With a remote data source the filters, including nested groups, are part of
every read request; the server applies them, and the grid shows its
result. The demo's request log shows the wire query as the filter
row, the toolbar search and the pager change.

The `checklist` and `excel` UIs read their values from the server too.
The core computes facets over local rows only, so
`getColumnFacet` answers `status: 'unavailable'` for a remote source that
filters; the filter dialog then asks the data source with
`read({ facet: { columnId, search, limit } })`. The request carries the
current query, the server counts each value over the rows that pass the
search and every other column's filter, and answers `facet` with the
entries sorted by label and `complete: false` when `limit` cut the list.
The dialog requests `filtering.checklistPageSize` values first and raises
the limit by a page as the list scrolls to its end; typing in its search box
sends a narrowed request after 250 ms, each request aborts the previous one,
and closing the dialog aborts the last. OK with values that are not loaded
yet sends one more facet request for every value before applying. A source
without `capabilities.facets` shows "Filter is not available".
While the first values load, the dialog shows placeholder value rows;
`filtering.loadingIndicator: 'spinner'` shows a spinner instead.
Both are one
`role="status"` element with the "Loading…" text for assistive technology.
`createJsonDataSource` and the reference handler support facets; the
demo's Customer column uses an Excel filter over the remote source.

<!-- demo: remote-query -->

## Filter events

`onBeforeFilterChange` / `onFilterChange` report every filter change, from
the UI or a method (see above). The filter dialogs have their own pair:
`onBeforeFilterMenuOpen` fires before a menu, checklist or Excel dialog
opens and cancels the opening with `preventDefault()`; `onFilterMenuOpen`
fires once the dialog rendered. Both receive `{ field, ui, dialog }`: `ui`
is the dialog's filter UI (`'menu'`, `'checklist'` or `'excel'`) and
`dialog` is `'menu'` for the dialog itself or `'custom'` when the Excel
filter's custom-condition section opens. The filter menus demo above logs both
events and can cancel the Note column's menu.

## API reference

See [`DataGridFiltering`](/docs/reference/data-grid/DataGridFiltering),
[`DataGridColumnFilter`](/docs/reference/data-grid/DataGridColumnFilter),
[`DataGridFilterCondition`](/docs/reference/data-grid/DataGridFilterCondition),
[`DataGridFilterGroup`](/docs/reference/data-grid/DataGridFilterGroup),
[`DataGridFilterContext`](/docs/reference/data-grid/DataGridFilterContext)
and [`DataGridFilterChangeEvent`](/docs/reference/data-grid/DataGridFilterChangeEvent)
in the API reference.