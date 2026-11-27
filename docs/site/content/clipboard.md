---
title: Clipboard
description: Copy cell ranges, selected rows or the focused cell as TSV with or without headers, paste spreadsheet blocks into edit drafts, formatted or raw copy text per column, `onBeforeCopy` and `onBeforePaste`, and the fallbacks when the browser blocks clipboard access.
category: Clipboard
order: 77
demos: [clipboard]
---

A grid with `editing` copies and pastes like a spreadsheet: the `editing`
prop registers the core `clipboard` module, and the keyboard, toolbar and
menu wiring lives in the lazy editing chunk, so a grid without `editing`
loads none of it. A read-only grid that should still copy turns the
capabilities off:

```tsx
<DataGrid data={orders} columns={columns} editing={{ edit: false, add: false, delete: false }} selection={{ mode: 'cell', cellRange: 'box' }} />
```

## Copy

Ctrl+C (⌘C on macOS) copies, Ctrl+Shift+H copies with the header row.
`api.copy({ includeHeaders })` does the same from code
 and returns `applied`, or
`rejected` with `nothingToCopy` or `cancelled`. The toolbar item `'copy'`
and the context menu item `'copy'` copy the selection too.

The text is TSV: fields holding a tab, a newline or a quote are quoted with
`""`. A copy takes, in order of priority, the bounding box of the selected
cell ranges, else the selected rows, else the focused cell; only data rows
(group captions and footers are left out), and a row number column copies
empty. Pending drafts are copied as shown. A copy above one million cells is
refused.

## Formatted or raw text

A copy uses the display text of each cell by default: formats, lookup
display values and `valueFormatter` output. `column.clipboardFormatter(value,
ctx)` replaces that text for one column, for example a raw number for a
currency column. `api.copy({ copyFormatted: false })` copies raw
values instead (numbers unformatted, dates as ISO strings) for every column
except those with a `clipboardFormatter`, which always wins; lookup columns
still copy their display text. Keyboard and menu copies use the display text.

## Paste

Ctrl+V (⌘V) pastes TSV (quoted fields, CRLF, CR or LF) from the top-left
cell of the selected range, or from the focused cell.
`api.paste(text)` pastes text from code; `api.paste()` without text reads the
system clipboard.

- one value fills the whole selected range; a larger block is clipped to
  the range or the grid edge;
- read-only cells (`editable: false`, `isCellEditable`, primary keys on
  existing rows) and utility columns are skipped;
- values are parsed by the column type and validated like typed input
  (accepting a copied `$18.50` or `25%` back);
- in `cell` mode the values are written at once; in the other modes they
  become drafts (in batch mode marked until Save).

## Events

```tsx
<DataGrid
  editing={{ mode: 'batch' }}
  selection={{ mode: 'cell', multiple: true, cellRange: 'box' }}
  onBeforeCopy={(e) => {
    // e.data: the TSV text; e.copied: 'range' | 'rows' | 'cell'; e.cells, e.rowIds, e.fields, e.includeHeaders
    e.data = e.data.replaceAll('\t', ';');
  }}
  onBeforePaste={(e) => {
    // e.data: the clipboard text; e.target: the top-left target cell
    if (e.data.length > 100_000) e.preventDefault();
  }}
/>
```

`onBeforeCopy` and `onBeforePaste` are cancellable with `preventDefault()`, and assigning
`event.data` replaces the text that is written or pasted; `data`
is the one writable field of these otherwise frozen event objects.
`e.cells` is the number of copied data cells. Paste
raises one event per paste with the whole text, not one per cell: per-cell
conversions belong in the column parser.

## Without clipboard access

The async Clipboard API exists only in secure contexts (HTTPS, localhost) and
can be blocked by permissions. The grid falls back instead of failing:

- Copy writes with `navigator.clipboard.writeText` when it is available,
  else selects the text in a hidden textarea and runs the browser's copy
  command. When both are refused, a small dialog shows the text selected:
  press Ctrl/⌘+C, and the dialog closes.
- Ctrl/⌘+V never needs the Clipboard API: the keystroke moves focus to a
  hidden textarea for an instant, the browser pastes into it, and the grid
  reads the paste event. There is no permission prompt.
- `api.paste()` without text reads `navigator.clipboard.readText()`, or opens
  a paste dialog: press Ctrl/⌘+V in it.

The dialogs are native `<dialog>` elements with the grid's localized texts
(`clipboardCopyHint`, `clipboardPasteHint`, `clipboardText`, `copy`,
`paste`); focus returns to the grid when they close.

<!-- demo: clipboard -->

## API reference

See [`DataGridClipboardApi`](/docs/reference/data-grid/DataGridClipboardApi),
[`DataGridClipboardProps`](/docs/reference/data-grid/DataGridClipboardProps)
and [`ColumnDef`](/docs/reference/data-grid/engine/ColumnDef)
(`clipboardFormatter`) in the API reference.