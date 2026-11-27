---
title: State persistence
description: Save and restore the user's grid state with persistState, read and apply it with getState and restoreState, reset it, share it as a URL-safe string, and keep named saved views.
category: State Persistence
order: 115
demos: [state-persistence, saved-views, controlled-state]
---

`persistState` saves what the user did to the grid and restores it the next
time the grid mounts:

```tsx
<DataGrid id="orders" persistState data={orders} columns={columns} sorting filtering paging />
```

With `true` the state goes to `localStorage` under the key
`salmon-data-grid:<id>`, so the grid needs a stable `id` (without one a
development warning explains that nothing is persisted). Saves are
coalesced: a burst of changes writes once.

## What is persisted

The state (`DataGridState`) has one part per feature (`DataGridStatePart`):

| Part | Contents |
| --- | --- |
| `columns` | Column order, widths and visibility |
| `pinning` | Columns pinned at runtime |
| `sorting` | Sorted columns and directions |
| `filters` | Filter conditions per column |
| `grouping` | Grouped columns |
| `paging` | Page and page size |
| `search` | Search text and options |
| `pinnedRows` | Rows pinned at runtime |
| `tree` | Tree mode expansion |
| `selection` | Selected rows |
| `scroll` | Scroll position |

Columns are referenced by field or column id; a stored column that no longer
exists is dropped and reported instead of failing the restore. Templates and
other definition-time settings are never stored: they come from the props.

## Options

An object configures the binding:

```tsx
<DataGrid
  id="orders"
  persistState={{
    key: 'orders-view',            // default `salmon-data-grid:<id>`
    storage: myStorage,            // default localStorage
    exclude: ['selection', 'scroll'],
    version: 3,
    migrate: (state, version) => (version === 2 ? upgrade(state) : null),
  }}
/>
```

- `storage` is any object with `load(key)`, `save(key, state)` and an
  optional `remove(key)`; each may be synchronous or return a promise, so
  `sessionStorage`, IndexedDB or a server endpoint fit. `@salmonui/data`
  `createKeyValueStateStorage` and `createJsonStateStorage` build such
  storages over a key-value store or the JSON protocol endpoint.
- `exclude` leaves parts out of saving and restoring.
- `version` is the application state version. A state saved by
  another version is discarded, unless `migrate` upgrades it; returning
  `null` from `migrate` discards it too. The state itself also carries a
  schema version, so a state from an older Salmon UI release is upgraded or
  rejected rather than half applied.

## SSR and hydration

Storage is read only in the browser, after mount. The server and the
hydrating client both render the definition state, so there is no hydration
mismatch; the stored state is restored right after hydration, in the same
task, before the browser paints.

## The state API

The same state is available through the grid instance (`ref` or
`useDataGridApi()`):

- `api.getState(options?)` returns the current `DataGridState`, a plain JSON
  object; `{ exclude }` leaves parts out.
- `api.restoreState(stateOrString, options?)` applies a state in one batch
  without recompiling columns. It returns
  `{ status: 'applied' | 'partial', ignoredColumns, rejected, skipped, scroll }`:
  `partial` lists columns that no longer exist, commands the grid rejected,
  and parts whose feature is not enabled.
- `api.resetState()` returns to the definition state (the props the grid was
  created with) and, when `persistState` is on, clears the stored entry.

`serializeDataGridState(state)` and `deserializeDataGridState(text)` from
`@salmonui/data-grid` convert a state to and from a compact, URL-safe
base64url string, for example to share a view in a link:

```ts
const url = `${location.pathname}?view=${serializeDataGridState(api.getState({ exclude: ['selection', 'scroll'] }))}`;
// Later: api.restoreState(new URLSearchParams(location.search).get('view') ?? '');
```

`restoreState` accepts the serialized string directly.

## Named saved views

Named views sit on top of the same state API: `createSavedViews` from `@salmonui/data/views`
keeps a list of named `DataGridState` values for one grid in any key-value store
(`localStorage`, `sessionStorage`, an IndexedDB wrapper, a server-backed
store). The grid never imports it, so it adds nothing to a grid that does
not use it.

```tsx
import { createSavedViews } from '@salmonui/data/views';

// In an effect or event handler (localStorage does not exist on the server):
const views = createSavedViews(localStorage, { gridId: 'orders' });

// Save the current layout under a name (an existing `id` replaces that view).
await views.save({ name: 'Open orders', state: api.getState({ exclude: ['selection', 'scroll'] }) });

// List, apply, rename and delete.
const list = await views.list();          // [{ id, name, description?, state, createdAt, updatedAt, schemaVersion }]
api.restoreState(list[0].state);
await views.rename(list[0].id, 'Unshipped');
await views.remove(list[0].id);
```

- A view is `{ id, name, description?, state, createdAt, updatedAt,
  schemaVersion }`. All views of a grid are stored as one JSON document under
  `salmonui:grid-views:<gridId>` (`prefix` changes the key).
- `subscribe(listener)` reports the list after every change, so a view
  picker stays in sync; writes are queued, so two quick saves never drop
  each other.
- `migrate(record, schemaVersion)` upgrades records written by an older
  format or drops them by returning `null`. The grid state inside a view
  keeps its own schema version, which `restoreState` checks as usual.
- Applying a view is an ordinary `restoreState`: one batch, no column
  recompile, and the same `RestoreResult`. Combine it with `persistState`
  to also remember the last layout the user had.

<!-- demo: saved-views -->

## Restoring keeps the compiled columns

`restoreState` and `resetState` apply column order, widths, visibility and
pinning as runtime commands on the existing columns; the column definitions
are never recompiled, so templates, formatters and lookups stay in place and
the restore costs one notification. The demo below checks it:
`api.getColumn(field)` returns the same compiled column before and after a
restore.

## Controlled state

State persistence is optional. An application that owns the view (in a URL,
a store or a server) can control it entirely through props, the additive
counterpart of `getState()` / `restoreState()`:

| State | Prop | Change event |
| --- | --- | --- |
| Sort | `sorting.sortBy` | `onSortChange` |
| Filters | `filtering.filters` | `onFilterChange` |
| Search | `search.text` | `onSearchChange` |
| Page | `paging.page`, `paging.pageSize` | `onPageChange` |
| Grouping | `grouping.groupBy` | `onGroupChange` |
| Column visibility, width, pinning, order | column `hidden`, `width`, `pinned`, array order | `onColumnVisibilityChange`, `onColumnResizeEnd`, `onColumnPinChange`, `onColumnReorder` |
| Selection | `selection.rowIds` | `onSelectionChange` |

Options props are compared structurally with their previous value, so an
object recreated with the same content is a no-op, and a changed value is
applied as a command (not a remount). Writing the event payload back into
your state closes the loop. Every change event carries `source`
(`'pointer'`, `'keyboard'`, `'touch'` or `'api'`), and `restoreState` raises the same
events, so a restored snapshot reaches the application state too. Keep
scroll positions, hover and drag state out of React state: the grid owns
those transients.

<!-- demo: controlled-state -->

<!-- demo: state-persistence -->

## API reference

See [`DataGridPersistState`](/docs/reference/data-grid/DataGridPersistState),
[`DataGridState`](/docs/reference/data-grid/engine/DataGridState),
[`RestoreResult`](/docs/reference/data-grid/engine/RestoreResult) and
[`createSavedViews`](/docs/reference/data/views/createSavedViews) in the API
reference.