---
title: Drill through
description: Open the raw rows behind a value cell in a DataGrid dialog with a column chooser and a row limit, edit them in any Data Grid editing mode, and write the edits back with incremental re-aggregation and onDataChange.
category: Drill through and chart
order: 60
demos: [pivot-table-drill-through]
---

```tsx
<PivotTable pivot={pivot} drillThrough />
<PivotTable pivot={pivot} drillThrough={{ maxRows: 500 }} editing={{ mode: 'dialog' }} />
```

With `drillThrough`, double-clicking a
value cell, or Enter on a focused one, opens a dialog with a `DataGrid` of
the raw rows aggregated into that cell. Subtotal and grand total cells
open every row below them. The grid has one column per visible field, a
column chooser, resizable columns and the row count; `maxRows` caps the
listed rows and the dialog says when the
list is truncated. `@salmonui/pivot-table/styles.css` carries the grid's
rules.

## Events

| Event | Payload |
| --- | --- |
| `onBeforeDrillThrough` | `{ rowKey, columnKey, measure, rowIndex, columnIndex, cell, rows(), source }`; `preventDefault()` keeps the dialog closed |
| `onDrillThrough` | the same, after the dialog opened |

`rows()` returns the raw rows on call, so a handler that only checks the
cell does not pay for the lookup. To show the rows in your own UI, cancel
the dialog and use them:

```tsx
<PivotTable
  data={data}
  defaultPivotModel={model}
  drillThrough
  onBeforeDrillThrough={(event) => {
    event.preventDefault();
    openSidePanel(event.rows());
  }}
/>
```

With a shared store (`pivot={pivot}`), these handlers are options of
`usePivot()`.

From code: `pivot.drillThrough(rowIndex, columnIndex)` opens the dialog
and `pivot.getCellRows(rowIndex, columnIndex)` returns the rows without it.

## Editing raw rows

`editing` is forwarded to the drill-through `DataGrid`, so every Data
Grid editing mode works there (`mode: 'row'`, `'dialog'`, `'batch'` and
`'cell'`), with
the add, edit, delete, save and cancel toolbar items:

```tsx
const [data, setData] = useState(initialRows);

<PivotTable
  data={data}
  defaultPivotModel={model}
  drillThrough
  editing={{ mode: 'batch' }}
  onDataChange={(event) => {
    setData(event.data);   // keep `data` in sync with the edited rows
    save(event.changes);   // [{ index, row, previous }]
  }}
/>
```

Saved edits write through to the pivot's raw rows: changed rows replace
the originals, added rows are appended and deleted rows removed. The pivot
re-aggregates (incrementally for a small number of changed rows), the
dialog keeps its list, and `onDataChange` receives `{ data, changes, action: 'update' | 'add' | 'delete' }`. Store
`event.data` as your `data` so a later render does not restore the old
rows. `pivot.updateRows(changes)` writes rows the same way from code.

With a [remote engine](/docs/pivot-table/remote-pivot) the dialog loads
the first 1,000 raw rows of the cell from the server in one request and
lists up to `maxRows` of them; editing needs local `data`.

Drilling through from a chart point is covered with the
[pivot chart data](/docs/pivot-table/chart).
