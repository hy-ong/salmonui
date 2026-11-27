---
title: Lookup columns
description: Foreign-key columns that store a key and show, sort, filter, search and group by a looked-up value, from a local table or a cached remote source.
category: Foreign Key
order: 125
demos: [lookup-columns, lookup-remote]
---

A lookup column (a foreign-key column) holds a key in the row and
displays a value from another table:

```tsx
const customers = [{ id: 1, name: 'Aiko Tan' }, { id: 2, name: 'Bao Nguyen' }];

const columns: DataGridColumn<Order>[] = [
  { field: 'customerId', header: 'Customer', lookup: { data: customers, keyField: 'id', displayField: 'name' } },
];
```

`keyField` is the field of the lookup rows matched against the cell value
(default: the column `field`); `displayField` is the field shown. Both accept
dot paths. All lookup settings live in `column.lookup`. The React `DataGrid` registers the lookup module automatically as soon
as a column declares `lookup`; there is nothing to import or inject.

The display text is what the user sees, so it is also what the grid works
with: sorting orders by the name, not the key; the filter row, the
filter menus, checkbox facets and search match the name; and
grouping groups by the name. The row itself keeps the key, so
`api.getViewRows()` returns rows with the raw value. The display text feeds
the dictionary-encoded sort keys, so a warm re-sort or re-filter of a lookup
column runs no lookups.

To list the lookup columns, filter the compiled columns: those
returned by `api.getColumns()` carry `lookup` on lookup columns, so
`api.getColumns().filter((c) => c.lookup)` returns them. A dedicated method
would grow the API without adding a capability.

Export (CSV, Excel, PDF) and the clipboard module's `copy()` write the
display text, never the key; an unknown key, or a remote key still
loading, exports blank. Pasting either the key or the display text
into a lookup cell stores the key ([Clipboard](/docs/data-grid/clipboard)). Copying
an edited lookup cell copies the display text of its draft key.

<!-- demo: lookup-columns -->

## Server-side sources

The display-text ordering above is what the grid does when it holds the
rows (a local array or an offline source). With a server-side source (for
example `createJsonDataSource`), sorting and grouping run on the server, and
the grid sends a lookup column like any other column: by its `field`, which
holds the key (through `fieldOf` when set). Sorting the `customerId` lookup
column sends `sort: [{ field: 'customerId', dir: 'asc' }]`, and grouping by it
sends `group: [{ field: 'customerId' }]`; the lookup table never travels with
the query.

A server that sorts the raw key orders the rows by key, not by name. To
order by the display text, as the grid does locally, the server joins the
lookup table and sorts by the display value; for grouping it orders
the groups by the display value and keeps the key as the group key, which the
grid shows through the lookup. The reference handler does this join
when told which fields hold lookup keys:

```ts
import { createJsonQueryHandler } from '@salmonui/data/server';

createJsonQueryHandler(orders, {
  key: 'id',
  lookups: { customers },
  lookupFields: { customerId: { lookup: 'customers', keyField: 'id', displayField: 'name' } },
});
```

A SQL backend does the same with a join (`ORDER BY customers.name,
orders.customer_id`).

## Remote lookups

`lookup.data` can also be a `LookupSource`, an object with
`load({ keys, keyField, displayField, signal })` that returns the lookup rows
of the requested keys. The grid asks only for the keys it needs,
batched per microtask, and re-sorts or re-filters when they arrive.
`@salmonui/data/lookup` ships two cached sources:

- `createLookup({ load, keyField?, ttl? })` wraps any loader with a per-key
  cache: cached and known-missing keys never reach the loader, identical
  in-flight keys are joined, and entries expire after `ttl` ms.
- `createJsonLookup({ url, name, ttl? })` loads over the JSON protocol
  endpoint (`createJsonQueryHandler(rows, { lookups: { [name]: rows } })` on
  the server).

One lookup can back several columns and several grids. While a remote lookup
column is loading, its header carries `data-lookup-status="loading"` and
`aria-busy="true"` with a status indicator labelled by the `lookupLoading`
text; a failed load shows `data-lookup-status="error"` (`lookupError`).
Remote lookups display as strings.

<!-- demo: lookup-remote -->

## API reference

[`ColumnLookup`](/docs/reference/data-grid/engine/ColumnLookup) lists the
`lookup` options and [`LookupSource`](/docs/reference/data-grid/engine/LookupSource)
the remote contract; [`createLookup`](/docs/reference/data/lookup/createLookup),
[`createJsonLookup`](/docs/reference/data/lookup/createJsonLookup) and
[`createJsonQueryHandler`](/docs/reference/data/server/createJsonQueryHandler)
cover the cached sources and the server join.
