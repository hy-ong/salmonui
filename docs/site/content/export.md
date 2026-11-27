---
title: Export
description: Excel, PDF and CSV export of the grid view with hooks, events, several grids per workbook, server export and on-demand writers.
category: Export and print
order: 130
demos: [export-print]
---

The grid exports what it shows: the current sort, filter, search and
grouping, over every page (`pages: 'all'`, the default) or the current page
(`pages: 'current'`). Three instance methods cover the
formats:

```tsx
const file = await api.exportToExcel({ fileName: 'orders' }); //
await api.exportToPdf({ orientation: 'landscape' });          //
await api.exportToCsv({ delimiter: ';', bom: true });         //
```

Each resolves to `{ fileName, mimeType, data }` and downloads it; pass
`download: false` to keep only the file, and `downloadBlob(file)` saves any
file or `Blob` later (it is a no-op on the server).

## Writers load on demand

CSV escapes spreadsheet formulas by default: text starting with `=`, `+`,
`-`, `@`, tab or CR (also after leading whitespace) gets a leading `'`; real
numbers stay as they are. `escapeFormulas: false` restores raw output.

CSV is a pure writer in `@salmonui/data-grid/engine` and needs nothing. Excel and
PDF writers live in `@salmonui/export` and are passed as loaders, so the
default Data Grid bundle never contains them:

```tsx
const writers = {
  excel: () => import('@salmonui/export/xlsx'),
  pdf: () => import('@salmonui/export/pdf'),
};
<DataGrid exportWriters={writers} toolbar={['exportExcel', 'exportPdf', 'exportCsv', 'print']} contextMenu />
```

The toolbar and context-menu export items run the export with default
options. Without a loader the matching item is disabled and its title says
why. To customize what an item does, register a handler:
`api.registerCommandHandler('export.excel', () => void api.exportToExcel({ ... }))`.
A status with a spinner shows while a file is produced; it is a
polite `role="status"` element, so screen readers announce "Exporting…"
(`localeText.exporting`).

## Options

- `rows` exports custom data with the grid's columns, for example
  `api.getSelectedRows()`; `includeHiddenColumns` adds hidden
  columns; `columns` picks and relabels columns; `fileName` names
  the file.
- Excel: `sheetName`, `styles` (`header`, `row`, `groupCaption`,
  `aggregate`), `header` / `footer` rows, `freezeHeader`, and
  `mergeRepeatedValues`, which merges equal adjacent values of a column
  into one cell.
- PDF: `orientation`, `pageSize`, `header` / `footer` with `{page}` and
  `{pages}`, `columnOverflow: 'fit' | 'paginate'`, `font` (see
  below), and `mergeRepeatedValues` as in Excel. In PDF a merged run
  restarts at every page (the value is drawn again at the top of the next
  page) and stops at group captions and detail blocks.
- Formatting follows the column formats. Lookup columns export
  their display text, not the key. Stacked headers export as merged
  header rows, split at pinned-column edges like the grid header.

```tsx
// Only the rows the user selected, with the grid's columns.
api.exportToExcel({ rows: api.getSelectedRows(), fileName: 'selected-orders' });
// Hidden columns too.
api.exportToCsv({ includeHiddenColumns: true });
```

## Several grids in one workbook

`grids` adds further grids to the same Excel file. `layout:
'sheets'` (the default) writes one sheet per grid, named by `sheetNames`;
`layout: 'stacked'` writes them one below the other on a single sheet with
`gap` blank rows between them:

```tsx
api.exportToExcel({ grids: [targetsApi], layout: 'sheets', sheetNames: ['Orders', 'Targets'] });
api.exportToExcel({ grids: [targetsApi], layout: 'stacked', gap: 2 });
```

PDF takes one grid per file. Multiple-grid export runs in the browser only;
the server entry exports one grid.

### Multiple-grid and outline limits

Two limits are intentional. Multiple-grid export composes the live export models of several grids in one client call;
a server job would need every grid's query and data source, so there is no
server-side multiple-grid export. Excel outlines stop at 7 levels, the
SpreadsheetML maximum: deeper group and detail rows are still written at
level 7, and child grids nested deeper than seven levels are left out. To
export several grids into one file, call `exportToExcel({ grids })` (or
`exportXlsx` from `@salmonui/export/xlsx` with every grid) on the
client.

## Hooks and events

Hooks are functions on the export options and return patches:

- `cell(ctx)` returns `{ value, text, style, formula, colSpan, rowSpan,
  image }` per data cell. `formula` writes a live Excel formula,
  with or without the leading `=`. **Security:** never build `formula` from untrusted input (user data, imported files, API responses); it is written as a live formula that runs when the workbook is opened. Text cells never
  execute: formula-like text stays a string and gets Excel's quote-prefix
  style, with no visible `'`. `colSpan` / `rowSpan` merge
  the cell with the following cells and rows in Excel and PDF; the
  covered cells are not written. In PDF a column span is clipped to its
  column page set (`columnOverflow: 'paginate'`), and a row span stops at
  a group caption or detail block and continues on the next page with the
  cell drawn again.
- The grid's own spans (column `colSpan` / `rowSpan`, `mergeCells`) are
  view settings and do not reach the export: return the same spans from
  `cell(ctx)`, or pass `mergeRepeatedValues`, to merge exported cells.
- A column with `renderCell` exports its value text; React output never
  becomes export text by itself. Return `{ text }` from `cell` for the
  exported text of a templated column (a `text` patch without `value`
  writes a text cell, even on a number, boolean or date column), and
  `image` with PNG or JPEG bytes
  (`{ data, type, width, height }`) to draw a picture in the Excel or PDF
  cell; CSV keeps the text.
- `headerCell(ctx)`, `aggregateCell(ctx)` and `groupCaption(ctx)` customize
  header, aggregate and caption cells; group captions and footer, group
  footer and caption aggregates are exported.
- `detail(ctx)` writes a detail block after a row: text lines
  (`{ text: [...] }`) or a nested export model (`{ model }`). `hierarchy`
  picks the rows: `'expanded'` (default, rows whose detail is expanded;
  collapsed rows get no block, also from the hook), `'all'` or `'none'`.
A grid without detail rows (no `renderDetail` or `childGrid`)
  has no expansion state, so its `detail` hook runs for every row unless
  the mode is `'none'`. Excel nests detail blocks one outline level
  deeper and clamps at 7 outline levels.

```tsx
api.exportToExcel({
  hierarchy: 'all',
  detail: ({ row }) => (row.note ? { text: [`Note: ${row.note}`] } : null),
  cell: ({ column, row }) => {
    if (column.field !== 'shipped') return undefined;
    const label = row.shipped ? 'Shipped' : 'Pending';
    return { value: label, text: label };
  },
});
```

`onBeforeExport` runs before every export and cancels it with
`preventDefault()`; `onExport` receives the finished file. Both
carry `format: 'excel' | 'pdf' | 'csv'` and the options.

## Unicode text in PDF

The built-in PDF fonts are the standard Helvetica faces, which cover only
Western European text; other characters print as `?`. Pass TrueType bytes
(`.ttf`, or the first face of a `.ttc`) as `font` and every text of the PDF
is drawn with that font, embedded as a subset with a `ToUnicode` map, so the
text stays searchable and copyable. CJK, Cyrillic, Greek and
Arabic (with shaping and basic bidi) work when the font covers them.
`font: { regular, bold }` adds a real bold face; without it bold is
synthetic. No font ships with the package, and CFF-based OpenType (`.otf`)
fonts are not supported.

```tsx
const font = new Uint8Array(await (await fetch('/fonts/NotoSansJP-Regular.ttf')).arrayBuffer());
api.exportToPdf({ font, header: '注文' });
```

## Server export

`@salmonui/data-grid/engine/export-server` builds the same export on a server.
The client sends its view as `serializeDataGridState(api.getState())`; the
server rebuilds a headless grid from the same rows and column definitions
with `createExportDataGrid`, or passes `{ rows, columns, state }` straight to
`exportToResponse` (a Web `Response` for route handlers) or
`exportToStream` (a Node `Writable` or Web `WritableStream`):

```ts
// app/api/export/route.ts (Next.js route handler)
import { exportToResponse } from '@salmonui/data-grid/engine/export-server';

export async function POST(request: Request) {
  const { format, state } = await request.json();
  return exportToResponse({ rows, columns, state, timeZone: 'UTC' }, { format, fileName: 'orders' });
}
```

The sort, filters, search, grouping and column order of the client apply;
selection and scroll do not. Keep the column definitions in a module both
sides import. Lookup columns export their display text on the server too;
remote lookup sources are loaded before the file is written. Multiple-grid
workbooks stay client-side.

The demo below runs every option above; its Server export buttons call a
route like the one shown.

<!-- demo: export-print -->

## API reference

See [`DataGridExportOptions`](/docs/reference/data-grid/DataGridExportOptions),
[`DataGridExcelExportOptions`](/docs/reference/data-grid/DataGridExcelExportOptions),
[`DataGridPdfExportOptions`](/docs/reference/data-grid/DataGridPdfExportOptions),
[`DataGridCsvExportOptions`](/docs/reference/data-grid/DataGridCsvExportOptions),
[`DataGridExportWriters`](/docs/reference/data-grid/DataGridExportWriters)
and the [`@salmonui/export`](/docs/reference#export)
writers in the API reference.
