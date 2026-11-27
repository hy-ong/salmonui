# @salmonui/data

Data sources for Salmon UI components over one efficient JSON protocol:
remote reads, offset/cursor/infinite paging, lazy group and tree loads,
facets, optimistic CRUD with row/cell errors and conflicts, live patches,
offline mode, cache/dedupe/retry/prefetch, and state storage. The
`DataGrid` is the main consumer; the dropdown components,
`PivotTable` and `Gantt` read remote data through the same sources.

```sh
npm install @salmonui/data
```

Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other).

- Zero runtime dependencies, ESM only, `sideEffects: false`, no React, no DOM.
- `fetch`, `AbortController`, and timers are injected or read lazily from
  `globalThis`; tests inject `createManualScheduler()`.

```ts
import { createDataGridEngine } from '@salmonui/data-grid/engine';
import { createJsonDataSource, tupleColumns, tupleRowId } from '@salmonui/data';

const fields = ['id', 'name', 'country', 'amount', 'createdAt'];
const dataSource = createJsonDataSource({
  url: '/api/orders',            // POST application/json, Salmon UI protocol v1
  key: 'id',
  fields,                        // rows stay decoded tuples in this order
  paging: { kind: 'offset' },
  policy: { cache: { ttlMs: 30_000 }, retry: { attempts: 3, delayMs: 200 }, prefetch: { adjacentPages: 1 } },
});

const engine = createDataGridEngine({
  getRowId: tupleRowId(fields, 'id'),
  columns: tupleColumns([{ field: 'name' }, { field: 'amount', type: 'number' }, { field: 'createdAt', type: 'date' }], fields),
  dataSource,
});
```

Any other backend (GraphQL, WebSocket, an RPC client) plugs in through
`transport: (request, { signal }) => Promise<response>`. The reference
handler `@salmonui/data/server` (`createJsonQueryHandler(rows, { key })`)
answers the protocol over an in-memory array and doubles as an in-process
transport for tests and SSR.

## Entry points

| Entry | Contents |
| --- | --- |
| `@salmonui/data` | Everything below except `./server` |
| `@salmonui/data/json` | `createJsonDataSource`, transports, protocol types and codecs, `tupleColumns` |
| `@salmonui/data/stream` | `createLiveDataSource` |
| `@salmonui/data/local` | `createOfflineDataSource` |
| `@salmonui/data/storage` | `createKeyValueStateStorage`, `createJsonStateStorage` |
| `@salmonui/data/views` | `createSavedViews` (named saved views) |
| `@salmonui/data/lookup` | `createLookup`, `createJsonLookup` (cached lookup sources) |
| `@salmonui/data/server` | `createJsonQueryHandler` reference server |

## License

MIT
