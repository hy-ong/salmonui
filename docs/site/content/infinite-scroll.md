---
title: Infinite scrolling
description: Remote rows read in blocks as the viewport approaches them, with loading rows, a bounded block cache, a load-next command and server-rendered first blocks.
category: Infinite Scroll
order: 95
demos: [infinite-scroll]
---

`infiniteScroll` turns on infinite scrolling for a remote data source.
The grid reads rows in
blocks with `DataSourceRequest.range`: the first read covers
`initialBlocks` blocks, and later reads follow the viewport as it
approaches rows that are not loaded. `true` uses the defaults; an object
sets them.

```tsx
const source = createJsonDataSource<Order>({ url: '/api/orders', key: 'id' });

<DataGrid data={source} columns={columns} height={400} infiniteScroll={{ cache: true, maxBlocks: 6 }} />
```

| Option | Default | Meaning |
| --- | --- | --- |
| `infiniteScroll` | off | `true` or a settings object |
| `initialBlocks` | 3 | Blocks of the first read |
| `maxBlocks` | 3 | Blocks kept in memory with `cache` |
| `cache` | false | Bound the blocks in memory |
| `blockSize` | 100 | Rows per block and per read unit |
| `threshold` | half a block | Prefetch distance in rows |
| `debounce` | 50 ms | Quiet time before a jump target is read |
| `initialResult` | — | Seeded first blocks (server rendering) |

Without `cache` every loaded block is kept. With
`cache: true` at most `maxBlocks` blocks stay in memory (never fewer than
the viewport needs): the block farthest from the viewport is evicted and
read again when the viewport returns. The bound is a performance gate:
with `cache` and `maxBlocks: 3`, scrolling through 1,000,000
rows holds at most 400 rows and grows the heap by less than 4 MB
(see
[performance](/docs/data-grid/performance)). The demo below sets `maxBlocks: 6`,
and its status line shows the rows in memory and the evicted blocks. The
rendered DOM rows are bounded separately by virtualization. A scrollbar
drag or jump issues one read once the viewport is still; reads for
blocks scrolled past are aborted.

The data source keeps its default offset paging; the grid manages the
blocks. Remote reads themselves are covered on the
[data sources](/docs/data-grid/data-sources) page.

<!-- demo: infinite-scroll -->

## Known and unknown totals

When the server reports `totalRowCount`, the scroll range covers every row
from the start, and rows that are not loaded yet render as loading rows.
Without a total the grid grows as blocks arrive, with one loading row at
the end while more rows may follow.

## Loading rows

A loading row has the `.salmon-data-grid-loading-row` class, `aria-busy` and
`data-status="loading"`; after a failed read it switches to
`data-status="error"` with a Retry button. `renderLoadingRow`
replaces its content and receives `{ rowIndex, status, error, retry }`.
Without it, a loading row draws shimmering skeleton bars by default
([skeleton rows](/docs/data-grid/virtualization), `virtualization.skeletonRows`);
`virtualization: { skeletonRows: false }` shows the loading text instead.

```tsx
<DataGrid
  data={source}
  columns={columns}
  infiniteScroll
  renderLoadingRow={({ status, retry }) => (status === 'error' ? <button onClick={retry}>Try again</button> : 'Loading orders…')}
/>
```

## Sorting, filtering and search

A sort, filter or search change drops the loaded blocks, scrolls back to
the top and reads the first blocks of the new query.

## Grouping

With grouping, infinite scroll yields to group loading: group captions
load first and their children load on demand, in chunks. With
lazy grouping (`grouping.lazy`), scrolling near the end of an expanded
group's loaded rows appends its next chunk, so a long group scrolls like
an infinite list; `threshold` sets how many rows ahead the next
chunk is requested, and the caption's Load more button remains the
keyboard path. See [lazy grouping](/docs/data-grid/lazy-grouping) and its demo with
"Load more on scroll" checked.

## Editing and keyboard

Loaded rows can be selected and edited like any other rows; the data
source's write echoes update the loaded blocks in place, and added or
removed rows re-read the visible blocks. ArrowDown or Ctrl+End
onto a row that is not loaded yet loads its block first and then
focuses it.

### Adding rows at the bottom

With `editing.newRowPosition: 'bottom'`, `addRow()` (or Insert, or the
toolbar's Add) opens the new row in a band pinned to the bottom edge of
the body, wherever the viewport is; the row is not part of the loaded
blocks until the data source stores it.

```tsx
<DataGrid
  data={source}
  columns={columns}
  infiniteScroll
  editing={{ newRowPosition: 'bottom' }}
  ref={api}
/>;

api.current?.addRow({ customer: 'New customer' }); // Enter or api.save() writes it
```

Saving calls the source's `write()`. Its echo (a `patch` event with
`added`) is a structural write: the grid re-reads the blocks around the
viewport and keeps rendering them until the re-read lands, so nothing
blinks. The re-read requests whole blocks, so a row the server appended
past the old end is read with them, and the row count follows the new
`totalRowCount`. Without a total the end the grid found by reading is
dropped and found again, so appended rows are read when the viewport
reaches the end. Where the row lands is the server's choice (with a sort,
its sorted position); the demo appends it after the last row.

## Load next block

`infiniteScroll.loadNext` reads the block after the last loaded row.
`infiniteScroll.retry` repeats a failed read,
and `infiniteScroll.reload` re-reads from the start. The engine reports the
load state through `api.engine.infiniteScroll.getStatus()` (`status`,
`totalRowCount`, `loadedRowCount`, `hasMore`, ...) and request counters
through `getStats()` (`requests`, `aborted`, `evicted`).

`api.engine.infiniteScroll` is typed (`DataGridInfiniteScrollFacade`): it is
present when the grid has `infiniteScroll`, and its `loadNext()`,
`retry()` and `reload()` dispatch the commands above. Until the infinite
scroll code has loaded (right after mount), the commands are rejected with
`moduleLoading` and `getStats()` returns `undefined`.

```ts
api.engine.infiniteScroll?.loadNext();
// or
api.engine.dispatch({ type: 'infiniteScroll.loadNext' });
```

For "load next set" buttons instead of scroll-triggered loading, call
`loadNext` from your button.

## Server rendering

`initialResult: { rows, totalRowCount?, hasNextPage? }` seeds the first
blocks, for example with rows a server component fetched. They render on
the server and on the first client render, and are not requested again.
Rows start at row 0. The demo seeds its first 300 rows this way.

## Memory and the DOM

- Rows are always DOM-virtualized, so `cache` and `maxBlocks` bound the row
  data held in memory, not the rendered DOM rows; the DOM holds the visible
  rows plus overscan either way (rendered rows never accumulate,
  while the memory that grows with infinite scrolling is row data). With `infiniteScroll={{ cache: true, maxBlocks }}`,
  scrolling back to an evicted block shows a short loading row while the
  block is read again.
- With a local array, `infiniteScroll` has no effect: every row is already
  present and virtualized.

## API reference

See [`DataGridInfiniteScroll`](/docs/reference/data-grid/DataGridInfiniteScroll)
and [`DataGridLoadingRowContext`](/docs/reference/data-grid/DataGridLoadingRowContext)
in the API reference.
