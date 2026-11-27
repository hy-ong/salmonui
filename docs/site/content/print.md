---
title: Print
description: Print every row of the grid view without virtualization, all pages or the current page, with print events and a print stylesheet.
category: Export and print
order: 140
demos: [export-print]
---

`api.print()` and the toolbar `'print'` item print the grid. The
grid renders a print projection: one static table of every row in the print
scope, with stacked headers, group captions, aggregates and detail or
child-grid tables. Virtualization does not apply, so printing a large grid
prints all of its rows.

```tsx
<DataGrid
  ref={api}
  data={orders}
  columns={columns}
  toolbar={['print']}
  printing={{ scope: 'page', hierarchy: 'expanded' }}
  onBeforePrint={(event) => {
    if (event.scope === 'all' && !confirm('Print every page?')) event.preventDefault();
  }}
  onAfterPrint={() => console.log('printed')}
/>

// print() options override `printing`; resolves false when prevented
const printed = await api.current?.print({ scope: 'all' });
```

- `printing.scope` is `'all'` (every page, the default) or `'page'` (the
  current page); `printing.hierarchy` picks which detail rows and
  child grids print: `'expanded'` (the default), `'all'` or `'none'`. `printing.detail` (or the `detail` option of
  `print()`) is the export `detail` hook: return `{ text }` lines (or a
  child `model`) for a row's detail template, `null` for none; React
  detail templates never print by themselves. `print()` options override
  `printing`.
- `onBeforePrint` runs before the browser's print dialog and cancels it with
  `preventDefault()`; `onAfterPrint` follows the window's `afterprint` event.
- `printable: false` on a column (a `DataGridColumn` option) leaves it out of print; the pager and
  toolbar never print, also when the page is printed from the browser menu.
- With focus in the grid, Ctrl+P (Cmd+P on macOS) prints the grid instead
  of the page.

The print document for 10,000 rows by 20 columns reaches the print dialog
within one second. Nothing print-related runs during render: the print
document is built on demand in the browser, and `print()` resolves `false`
outside a browser, so server rendering is unaffected.

<!-- demo: export-print -->

## API reference

See [`DataGridPrinting`](/docs/reference/data-grid/DataGridPrinting),
[`DataGridPrintOptions`](/docs/reference/data-grid/DataGridPrintOptions),
[`DataGridBeforePrintEvent`](/docs/reference/data-grid/DataGridBeforePrintEvent)
and [`DataGridAfterPrintEvent`](/docs/reference/data-grid/DataGridAfterPrintEvent)
in the API reference.