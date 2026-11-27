---
title: Spreadsheet
description: Integration guide - Salmon UI has no Spreadsheet; use the Data Grid's Excel-like range selection, fill handle, clipboard, editing and Excel export for tabular work, or embed a spreadsheet product for real workbooks with formulas.
category: Integration guides
order: 72
---

There is no `Spreadsheet` in Salmon UI. A spreadsheet is
three new products, a formula engine with incremental recalculation, a
sparse cell-format model and an xlsx reader, and the Data Grid is
record-centric by design (it has no formulas), so a spreadsheet is
not a Data Grid mode. Salmon UI provides no spreadsheet capabilities;
this page shows what to use instead.

## Most "Excel-like" needs: `DataGrid`

When the data is records (rows with typed columns), the Data Grid already
behaves like a sheet:

```tsx
import { DataGrid } from '@salmonui/data-grid';
import '@salmonui/data-grid/styles.css';

<DataGrid
  aria-label="Budget"
  data={rows}
  columns={columns}
  selection={{ mode: 'cell', multiple: true, cellRange: 'box' }}  // rectangular ranges
  editing={{ mode: 'cell', fillHandle: true, undo: true }}         // type to edit, fill handle, undo
/>```

| Spreadsheet need | Data Grid |
| --- | --- |
| Cell editing | Cell edit mode, typed editors, validation ([Editing](/docs/data-grid/editing)) |
| Selection of cells, ranges, rows, columns | Range selection ([Selection](/docs/data-grid/selection)) |
| Autofill | The fill handle |
| Clipboard | Range copy and multi-cell paste ([Clipboard](/docs/data-grid/clipboard)) |
| Sorting, filtering, find | Sorting, filtering, search |
| Freeze panes | Pinned rows and columns |
| Insert, delete, resize, hide rows and columns | Row editing, column resize, reorder and chooser |
| Virtualization | Row and column virtualization ([Virtualization](/docs/data-grid/virtualization)) |
| Number formatting | Column `format` |
| Conditional formatting | Cell class and style callbacks |
| Undo and redo | `editing.undo` |
| Export to xlsx, csv; print | Excel and CSV export, print ([Export](/docs/data-grid/export)) |
| Keyboard and accessibility | The APG grid pattern ([Accessibility](/docs/data-grid/accessibility)) |
| Data binding | Local rows or a data source ([Data sources](/docs/data-grid/data-sources)) |

Derived values that a sheet would compute with formulas are
column `valueGetter`s or computed in your application, so they stay typed
and testable. Charts next to the data are the Data Visualization
components fed from the same rows.

## Real workbooks: embed a spreadsheet product

When users author free-form workbooks (formulas across sheets, merged cells,
cell styles, sheet tabs, protection, xlsx round-tripping), embed a
spreadsheet chosen by your application, for example Univer (reported
Apache-2.0) or a document server's spreadsheet editor (see
[DOCX Editor](/docs/editors/docx-editor) for hosting ONLYOFFICE Docs or
Collabora Online). Check the product's license and maintenance before
adopting it; nothing on this page adds a dependency to a Salmon UI package.
Workbooks, formulas, cell styles, data validation, merge, hyperlinks,
images, protection, a ribbon and a spreadsheet API all come from that
product.
