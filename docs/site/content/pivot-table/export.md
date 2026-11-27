---
title: Export
description: Export a pivot result to an outlined XLSX sheet, a paginated PDF or CSV with exportPivot, with number formats, total styles, conditional formats, a cell hook, streamed CSV and server-side export of remote pivots.
category: Pivot Table
order: 90
---

`exportPivot()` in `@salmonui/export/pivot` writes a pivot result
as a file. It reuses the Data Grid writers: the XLSX and PDF writers load
on first use, so importing the entry costs a few kilobytes.

```ts
import { exportPivot } from '@salmonui/export/pivot';

// `result`: `api.getResult()` of a PivotTable, `computePivot()` or a remote engine.
const file = await exportPivot(result, { format: 'xlsx', fileName: 'sales' });
// { fileName: 'sales.xlsx', mimeType, data: Uint8Array } (null when onBeforeExport prevented it)
```

`format` is `xlsx` (default), `pdf` or `csv`. The source is a
`PivotResult` (`@salmonui/pivot-table/engine`), a remote snapshot, the
reference handler's `compute()` result, or a remote engine, which is paged
through (see [Remote and server export](#remote-and-server-export)).

## XLSX

The sheet is the table as the pivot shows it, not a native Excel
PivotTable:

- Row headers in one indented column (`rowLayout: 'compact'`, default) or
  one column per row level (`rowLayout: 'tabular'`; an outer member label
  sits on the first row of its member).
- Each visible leaf row is one sheet row with its tree depth as the
  outline level, so Excel's outline buttons collapse and expand the row
  tree. Subtotal rows sit above their members (`summaryBelow="0"`).
- Column headers are the column tree: stacked rows with merged cells; the
  header rows and the row header columns are frozen.
- Values are numbers. `model.formats[measure].number` (`Intl.NumberFormat`
  options) becomes the Excel number format; the display text of PDF and CSV
  is the engine's `formattedValue`.
- Subtotal and grand total rows and columns are bold
  (`pivotStyles: { subtotal, grandTotal, rowHeader }` overrides them).
- `model.conditionalFormats` color the matching cells: the `tone` maps to
  a light fill with dark text, and `style.backgroundColor` / `color` /
  `fontWeight` apply as given. `className` has no file form.

```ts
await exportPivot(result, {
  fileName: 'sales',
  rowLayout: 'tabular',
  includeColumn: (header) => header.measure !== 'Units', // exclude columns
  rowRange: [0, 50], // current page only
  rowHeaders: true, // false removes the row headers
  cell: ({ pivotCell, cell }) => (pivotCell?.value !== null && (pivotCell?.value ?? 0) < 0 ? { style: { color: '#B91C1C' } } : undefined),
  headerCell: ({ text }) => (text === 'Grand Total' ? { text: 'Total' } : undefined),
  xlsx: { sheetName: 'Sales', header: { rows: [{ cells: [{ value: 'Sales report', style: { bold: true } }] }], gap: 1 } },
});
```

Several results go to one workbook, one sheet each (`xlsx.sheetNames`), or
stacked on one sheet with `xlsx: { layout: 'stacked' }`:

```ts
await exportPivot([byRegion, byProduct], { xlsx: { sheetNames: ['Regions', 'Products'] } });
```

The `cell(ctx)` hook runs for every body cell with the row header node, the
column header node (null in row header columns), the `pivotCell` (null in
row header columns) and the computed cell; it returns `value`, `text`,
`style`, `colSpan`, `rowSpan`, `formula` or `image` overrides.
`headerCell(ctx)` does the same for header cells.

### Native PivotTable

The export does not write a native Excel PivotTable with a pivot cache:
a pivot cache doubles the raw rows in the file and
Excel's aggregation differs from the engine's (show values as, calculated
fields, custom groups). The outlined sheet carries the same numbers the
table shows. To re-pivot in Excel, export the raw rows (drill through or
the data source) and insert a PivotTable there.

## PDF

```ts
await exportPivot(result, { format: 'pdf', fileName: 'sales', pdf: { orientation: 'landscape', footer: 'Page {page} of {pages}' } });
```

The column headers repeat on every page, rows break across pages, row
headers are indented by depth, and the total styles, conditional formats
and the `cell` hook apply as in XLSX.
Columns scale to the page width; `pdf: { columnOverflow: 'paginate' }`
continues them on extra page sets instead. Embed a TrueType font with
`pdf: { font }` for text outside WinAnsi.

## CSV

```ts
const csv = await exportPivot(result, { format: 'csv', csv: { bom: true } }); // csv.escapeFormulas defaults to true
```

One header line of column paths (`2026 / Q1 / Sum of Amount`), then one
line per visible row with raw numbers (`csv: { values: 'formatted' }`
writes the formatted text instead). For
large results `streamPivotCsv()` yields chunks and yields to the event loop
between them:

```ts
import { streamPivotCsv } from '@salmonui/export/pivot';

for await (const chunk of streamPivotCsv(result, { chunkRows: 5000 })) await writable.write(chunk);
```

## Export events

`exportPivot(source, options, { onBeforeExport, onExport })`:
`onBeforeExport` is synchronous and `preventDefault()` cancels the export
(it resolves to null); `onExport` receives `{ format, file }` where `file`
resolves when the bytes are ready.

## Remote and server export

A remote engine (`createJsonPivotSource().createEngine()`, see
[Remote pivot](/docs/pivot-table/remote-pivot)) has `loadWindow()`, and
`exportPivot()` pages through the whole result with `pivot` requests:
every column, row windows of `windowCells` cells (default 200,000), then
writes the file. `streamPivotCsv()` over a remote engine never holds the
whole result: it requests, writes and drops one row window at a time.

```ts
const engine = createJsonPivotSource({ url: '/api/pivot' }).createEngine({ model });
await exportPivot(engine, { format: 'xlsx', windowCells: 100_000 });
for await (const chunk of streamPivotCsv(engine)) await writable.write(chunk);
```

On the server, the reference handler's `compute()` returns the whole
result, and `exportPivot()` runs in Node as well:

```ts
// app/api/pivot/export/route.ts
import { exportPivot } from '@salmonui/export/pivot';

export async function POST(request: Request) {
  const { model } = await request.json();
  const file = await exportPivot(handler.compute(model), { fileName: 'sales', xlsx: { header: { rows: [{ cells: [{ value: 'Sales' }] }] } } });
  return new Response(file?.data, { headers: { 'content-type': file?.mimeType ?? '', 'content-disposition': `attachment; filename="${file?.fileName}"` } });
}
```

## The export model

`createPivotExportModel(result, options)` is the format-neutral model the
writers consume: columns (row header columns first), stacked header rows,
one body row per leaf row with its depth, and the `cell` hook. It is the
Data Grid export model, so `writeXlsx`, `writePdf` and `writeCsv` accept it
directly, for example to put a pivot and a grid in one workbook.
