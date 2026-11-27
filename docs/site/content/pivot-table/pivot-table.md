---
title: Pivot Table
description: PivotTable, PivotFieldList, PivotAxisBar and PivotToolbar bound to one usePivot store; the report model, lifecycle events, virtualization, paging, on-demand features, loading state and SSR.
category: Pivot Table
order: 10
demos: [pivot-table-overview]
---

`PivotTable` aggregates raw rows into a cross-tab: row members down the
side, column members across the top, aggregated values in the cells. The
engine is `@salmonui/pivot-table/engine`
([Pivot engine](/docs/pivot-table/engine)); the React parts live at
`@salmonui/pivot-table`.

```tsx
import { PivotAxisBar, PivotFieldList, PivotTable, PivotToolbar, usePivot } from '@salmonui/pivot-table';
import '@salmonui/pivot-table/styles.css'; // carries the Data Grid and Menu rules

const fields = [
  { field: 'region', caption: 'Region' },
  { field: 'country', caption: 'Country' },
  { field: 'year', caption: 'Year' },
  { field: 'amount', caption: 'Amount', type: 'number' },
];

function SalesReport({ data }: { data: readonly Sale[] }) {
  const pivot = usePivot({
    data,
    fields,
    defaultPivotModel: {
      rows: [{ field: 'region' }, { field: 'country' }],
      columns: [{ field: 'year' }],
      values: [{ field: 'amount', aggregate: 'sum' }],
    },
  });
  return (
    <>
      <PivotToolbar pivot={pivot} items={['fieldList', 'totals', 'formatting', 'export']} />
      <PivotAxisBar pivot={pivot} />
      <PivotTable pivot={pivot} drillThrough />
      <PivotFieldList pivot={pivot} deferUpdate />
    </>
  );
}
```

## One store, several parts

`usePivot(options)` returns a `PivotController`: the report model, the
current result, the compute status, the selection and the open dialog.
Every part takes it as `pivot` and subscribes to the slice it renders
(`useSyncExternalStore` with narrow selectors), so a field dragged in the
field list updates the axis bar, the toolbar menus and the table without
any synchronization code.

Events are store options too: with a shared store, pass `onPivotModelChange`,
`onBeforeExpandedChange`, `onSelectionChange`, `onBeforeExport` and the
other handlers to `usePivot()`. On a `PivotTable` that receives `pivot`,
only `onCellClick` (a table event) applies; the other event props are read
only when the table owns its store.

For a table alone, pass the same options straight to `PivotTable`; it
creates its own store:

```tsx
<PivotTable data={data} fields={fields} defaultPivotModel={model} axisBar toolbar={['fieldList', 'export']} fieldList="popup" />
```

`usePivotState(pivot, selector)` reads one field of the store in your own
components (`(s) => s.model`, `(s) => s.status`); the selector must return
a value that keeps its identity.

## Data and the report model

| Option | Meaning |
| --- | --- |
| `data` | Raw rows by reference. A new array re-aggregates, incrementally for small changes. |
| `fields` | `PivotFieldDefinition[]`: `field`, `caption`, `type`, `folder`, `hidden`, `sortable`, `filterable`, `removable`, `draggable`, `valueGetter`. Inferred from the first rows when omitted. |
| `defaultPivotModel` / `pivotModel` | The report: `rows`, `columns`, `values`, `filters`, `filterBy`, `sort`, `valueSort`, `groups`, `calculatedFields`, `formats`, `conditionalFormats`, `expanded`, `totals`, `valuesPlacement`, `showEmptyMembers`, `showValueHeader`. Plain JSON. |
| `locale` | `Intl` locale of member labels and number formats. |
| `customAggregates`, `getCellValue` | Custom aggregators and a pure per-cell value override ([Aggregation](/docs/pivot-table/aggregation)). |
| `worker` | Run the engine in a Worker ([Pivot engine](/docs/pivot-table/engine)). |
| `deferComputeAbove` | Rows above which the first compute waits for the client (default 50,000; see [Server rendering](#server-rendering)). |
| `createEngine` | Replace the local engine, for example with a remote one: `(o) => source.createEngine(o)` ([Remote pivot](/docs/pivot-table/remote-pivot)). |

`fields`, `locale`, `customAggregates`, `getCellValue`, `worker` and
`createEngine` are read when the store is created; to change one, remount
the component that calls `usePivot()` (or the `PivotTable`) with a new
`key`.

`pivotModel` is reactive in the same way as the Data Grid options props: it
is applied on mount, applied again when its content changes, and an equal
fresh literal on every render does not reset user changes. Use
`defaultPivotModel` for an uncontrolled report and read changes from
`onPivotModelChange` ([State and events](/docs/pivot-table/state)).

The result is `pivot.result` (or `api.getResult()`): `valueAt(r, c)`,
`cellAt(r, c)`, `memberAt(axis, index)` and the `rowTree` / `columnTree`
header trees.

## Lifecycle

The component follows the React lifecycle: it mounts with its props, and
effects run after commit. Each computation raises
`onComputeStart({ phase: 'initial' | 'update' })` before it runs and
`onComputeEnd({ phase, status, duration, result })` when it ends.

`pivot.status` is `idle`, `computing`, `ready` or `error`; the component
that calls `usePivot()` re-renders when it or the result changes.

## Size, virtualization and paging

The table renders through the Data Grid renderer, so rows and columns are
always virtualized: only the visible cells are formatted and mounted, at
any result size. There is no `enableVirtualization` switch. Size the
component with `height` (default 400) and `style` / `className` on the
root, like any Salmon UI component:

```tsx
<PivotTable pivot={pivot} height="60vh" className="report" style={{ maxInlineSize: 1200 }} />
```

`paging` (opt-in) replaces virtualization:
`{ rows: 50 }` pages the rows with the Data Grid pager and `columns: 12`
pages the column members (the column pager sits under the table).
`paging` (`true` or `{}`) uses the default page sizes, 10 rows and 5
column members.

## Features load on demand

There is no registration step. A prop or a part enables a
feature, and its code loads when first used: the field menus and toolbar
menus on first open, the dialogs (member editor, calculated field,
formatting, grouping, drill through) when one opens, export and print on
the first export ([Toolbar, export and print](/docs/pivot-table/toolbar-and-export#on-demand-code)).
A table without those features never downloads them.

## Loading state

While the engine computes (a large first compute, a Worker or a remote
source) the root has `aria-busy="true"` and a `role="status"` overlay with
a spinner. `renderLoading` replaces the spinner:

```tsx
<PivotTable pivot={pivot} renderLoading={({ status }) => <span className="my-spinner">Aggregating…</span>} />
```

## Server rendering

For local `data` the engine runs synchronously during the server render,
so the server HTML is the first report and hydration matches it. Above
`deferComputeAbove` rows (default 50,000), with a `worker` or a remote
source, the server renders the sized table frame and the loading state,
and the client computes after the first paint. The field list and axis bar render
their static markup on the server; menus, drag and drop and dialogs attach
on the client. No render reads browser globals.

## Accessibility

The table is a `treegrid` in the compact layout and a `grid` in the
tabular one, the axis bar is one `toolbar` per axis, the field list axes
are `listbox`es, and every dialog is modal with focus return. Every drag
has a keyboard alternative. See
[Accessibility and localization](/docs/pivot-table/accessibility) for the
keyboard map and `localeText`.

## API reference

- [`@salmonui/pivot-table`](/docs/reference/pivot-table):
  `PivotTable`, `PivotFieldList`, `PivotAxisBar`, `PivotToolbar`,
  `usePivot`, `PivotController` and their types.
- [`@salmonui/pivot-table/engine`](/docs/reference/pivot-table/engine):
  the engine, `PivotModel`, `PivotResult`, `parseCsv()`.
- [`@salmonui/export/pivot`](/docs/reference/export/pivot):
  the Excel, CSV and PDF writers.

<<<

