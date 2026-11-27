---
title: Toolbar, export and print
description: PivotToolbar built-in and custom items, export to Excel, PDF and CSV and print from the toolbar or the instance API with a lazily loaded writer, and the onBeforeExport and onExport events.
category: Pivot Table
order: 70
demos: [pivot-table-toolbar-export]
---

## Toolbar

`PivotToolbar` is a `toolbar` of
built-in and custom items bound to the store. Use it standalone or through
the `toolbar` prop of `PivotTable`:

```tsx
<PivotToolbar pivot={pivot} items={['fieldList', 'totals', 'formatting', 'export']} exportWriters={exportWriters} />
<PivotTable pivot={pivot} toolbar={['fieldList', 'expandAll', 'collapseAll', 'export']} exportWriters={exportWriters} />
```

| Item | Kind | Action |
| --- | --- | --- |
| `fieldList` | button | Opens the popup [field list](/docs/pivot-table/field-list) |
| `totals` | menu | Subtotals on or off, grand totals for both, rows, columns or none |
| `subtotals` | toggle button | Subtotals on or off (`aria-pressed`) |
| `grandTotals` | menu | Grand totals for both, rows, columns or none |
| `formatting` | menu | Number format…, Conditional format…, Calculated field… |
| `numberFormat`, `conditionalFormat`, `calculatedField` | button | Opens that [editor](/docs/pivot-table/editors) |
| `export` | menu | Excel, CSV, PDF, Print |
| `expandAll`, `collapseAll` | button | Expands or collapses every member on both axes |

The default items are `['fieldList', 'totals', 'formatting', 'export']`.
Custom items are objects: `{ id, label, onClick, disabled }`, or `{ id,
render }` for any content:

```tsx
<PivotToolbar
  pivot={pivot}
  items={[
    'fieldList',
    { id: 'reset', label: 'Reset', onClick: () => pivot.setModel(initialModel) },
    { id: 'layout', render: () => <LayoutSwitch /> },
    'export',
  ]}
/>
```

Arrow keys move between items (one tab stop); ArrowDown opens a menu.
Menus load on first open. The dialogs the toolbar opens are rendered by a
`PivotTable` bound to the same store, so keep one mounted.

## Export and print

| Instance API (`ref`) | Toolbar | Needs a writer |
| --- | --- | --- |
| `api.exportToExcel(options)` | Export > Excel | yes |
| `api.exportToPdf(options)` | Export > PDF | yes |
| `api.exportToCsv(options)` | Export > CSV | no |
| `api.print()` | Export > Print | no |

The XLSX and PDF writers live in `@salmonui/export`, a separate
package; `@salmonui/pivot-table` never imports it.
Pass a loader, a dynamic import, so the writers load on the first export
and stay out of your initial JavaScript:

```tsx
const exportWriters = { pivot: () => import('@salmonui/export/pivot') };

<PivotTable pivot={pivot} toolbar={['export']} exportWriters={exportWriters} />
```

Without `exportWriters` the Excel and PDF items are disabled and the
instance methods report an error; CSV and print still work, built from the
result in `@salmonui/pivot-table`: one header line of column paths
(`2026 / Q1 / Sum of Amount`) and one line per visible row with raw
numbers. With `exportWriters`, CSV goes through `exportPivot()` like the
other formats, with the same column-path header and raw numbers by
default; `api.exportToCsv({ csv: { values: 'formatted' } })` writes the
formatted text instead. Print renders the result as a plain table in
a hidden frame and opens the browser's print dialog.

```ts
await api.exportToExcel({ fileName: 'sales', rowLayout: 'tabular' });
await api.exportToPdf({ fileName: 'sales' });
```

`fileName` defaults to `pivot`. Each method resolves with the written
file, `{ fileName, mimeType, data }` (null when cancelled);
`download: false` returns it without starting a download, for example to
upload it.
Other options pass through to `exportPivot()` (row layout, column filter,
styles, cell hooks, sheet names); see [Export](/docs/pivot-table/export)
for the file formats and every option, including server-side export.

### Events

| Event | Payload |
| --- | --- |
| `onBeforeExport` | `{ format: 'xlsx' \| 'csv' \| 'pdf' \| 'print', fileName }`; `preventDefault()` cancels |
| `onExport` | the same, after the file is written |

A writer error goes to `onError` with `action: 'export'` (thrown when no
`onError` is set).

## On-demand code

Export follows the rule of every pivot feature: there is nothing to
register. The
export and print code is a chunk of `@salmonui/pivot-table` loaded on the first
export, the writers load through your `exportWriters` loader, and the
toolbar's menus load on first open.

Why: a registration list makes the bundle depend on a list you maintain
by hand, and a forgotten entry fails only at run time. Splitting at the
feature boundary keeps the initial chunk small (the pivot bundle budgets
are release gates) without any registration step.

Turn each feature on with its prop or part: `toolbar` or `PivotToolbar`,
`fieldList="popup"` or `PivotFieldList`, `axisBar` or `PivotAxisBar`,
`drillThrough`, and `exportWriters` for Excel and PDF export; the
calculated field, number format and conditional format editors open
from the toolbar or the instance API with no prop.
