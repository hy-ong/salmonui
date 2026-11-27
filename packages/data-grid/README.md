# @salmonui/data-grid

Virtualized React Data Grid for Salmon UI on a framework-agnostic engine: sorting, filtering, grouping, editing, tree, detail rows, export and server helpers.

```sh
npm install @salmonui/data-grid @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { DataGrid, DataGridColumn, type DataGridApi } from '@salmonui/data-grid';
import { grouping, paging } from '@salmonui/data-grid/features';
import { createDataGridEngine } from '@salmonui/data-grid/engine';
```

Import the theme stylesheet once per application, then the
package stylesheet:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/data-grid/styles.css';
```

Public entry points:

- `@salmonui/data-grid`
- `@salmonui/data-grid/features`
- `@salmonui/data-grid/server`
- `@salmonui/data-grid/engine`
- `@salmonui/data-grid/engine/sort`
- `@salmonui/data-grid/engine/filter`
- `@salmonui/data-grid/engine/search`
- `@salmonui/data-grid/engine/paging`
- `@salmonui/data-grid/engine/grouping`
- `@salmonui/data-grid/engine/aggregates`
- `@salmonui/data-grid/engine/selection`
- `@salmonui/data-grid/engine/focus`
- `@salmonui/data-grid/engine/keyboard`
- `@salmonui/data-grid/engine/edit`
- `@salmonui/data-grid/engine/edit-state`
- `@salmonui/data-grid/engine/clipboard`
- `@salmonui/data-grid/engine/validation`
- `@salmonui/data-grid/engine/expansion`
- `@salmonui/data-grid/engine/hierarchy`
- `@salmonui/data-grid/engine/row-drag-state`
- `@salmonui/data-grid/engine/row-drag-drop`
- `@salmonui/data-grid/engine/infinite`
- `@salmonui/data-grid/engine/lookup`
- `@salmonui/data-grid/engine/persistence`
- `@salmonui/data-grid/engine/locale`
- `@salmonui/data-grid/engine/export`
- `@salmonui/data-grid/engine/export-server`
- `@salmonui/data-grid/engine/row-pinning`
- `@salmonui/data-grid/engine/tree`
- `@salmonui/data-grid/engine/tree-remote`

The engine subpaths (`/engine`, `/engine/<module>`) import neither React nor
the DOM and run on servers and in workers. `/engine/export-server` streams
CSV, XLSX and PDF exports from a server and needs `@salmonui/export`
(optional peer) for XLSX and PDF.

## License

MIT
