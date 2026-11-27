---
title: Appearance and templates
description: The whitelisted display props, renderCell, renderHeader, getCellClassName and renderTooltip, a hyperlink recipe with onCellClick, and cell selection with its events.
category: Pivot Table
order: 30
demos: [pivot-table-templates]
---

## Display props

`PivotTable` renders through the Data Grid renderer but does not pass its
settings through. A whitelist of display props
is forwarded:

| Prop | Default |
| --- | --- |
| `rowHeight` | the Data Grid default |
| `columnWidth` | 120 |
| `rowHeaderWidth` | 220 (compact), 150 per column (tabular) |
| `height` | 400 |
| `resizable`, `reorderable` | off |
| `textWrap` | off |
| `overflow` | the Data Grid default |
| `gridLines` | `'both'` |
| `striped`, `highlightOnHover` | off, Data Grid default |
| `emptyCellText` | `''` |

Subtotal and grand total rows carry `salmon-pivot-table-subtotal-row` and
`salmon-pivot-table-grand-total-row`; colors come from the theme seeds.
Number and date formats are model data (`pivotModel.formats`,
[Editors](/docs/pivot-table/editors)).

## Templates

| Prop | Context |
| --- | --- |
| `renderCell(ctx)` | `{ cell, rowHeader, columnHeader, selected, defaultContent }` |
| `renderHeader(ctx)` | `{ header, axis, defaultContent }` |
| `getCellClassName(ctx)` | as `renderCell`; returns a class string |
| `renderTooltip(ctx)` | `{ cell, rowHeader, columnHeader }` |

`cell` is the engine's `PivotCell`: `value`, `formattedValue`, `kind`
(`value`, `subtotal`, `grandTotal`), `rowKey`, `columnKey`, `measure` and
`rowCount`. `defaultContent` is the formatted value (or `emptyCellText`),
so a template can wrap it instead of formatting again:

```tsx
const renderCell = ({ cell, defaultContent }: PivotCellContext) =>
  cell.value !== null && cell.value < 0 ? <span className="negative">{defaultContent}</span> : defaultContent;

<PivotTable pivot={pivot} renderCell={renderCell} />
```

Columns are rebuilt when a render prop changes identity, so define render
props at module level or memoize them. Templates return React elements;
no HTML strings are rendered. To change the value itself (not only its
display) use `getCellValue` ([Aggregation](/docs/pivot-table/aggregation)).

## Hyperlinks

To show links, render a link in `renderCell` or `renderHeader` and handle
the click in `onCellClick`:

```tsx
const renderHeader = ({ header, axis, defaultContent }: PivotHeaderContext) =>
  axis === 'rows' && header.field === 'country' ? <a href={`/countries/${header.label}`}>{defaultContent}</a> : defaultContent;

<PivotTable
  pivot={pivot}
  renderHeader={renderHeader}
  onCellClick={(event) => {
    // event.cell is null on a row header; event.rowHeader is the row's member.
    if (event.cell && event.cell.value !== null && event.cell.value > 10_000) openDetails(event.rowKey, event.columnKey);
  }}
/>
```

Any condition (all cells, row or column headers, value cells, by value or
by header text) is a branch in the render prop.

## Selection

Cell selection is off by default:

```tsx
<PivotTable
  data={data}
  defaultPivotModel={model}
  selection={{ multiple: true }}           // or `selection` for multiple cells, `{ multiple: false }` for one
  onBeforeSelectionChange={(event) => {}}  // preventDefault() cancels
  onSelectionChange={(event) => console.log(event.keys)}
/>
```

With a shared store (`pivot={pivot}`), pass `onBeforeSelectionChange` and
`onSelectionChange` to `usePivot()` instead: the store fires them.

Ranges select as a box (drag, Shift+click, Shift+arrows). Selected cells
are keyed `rowKey|columnKey` (`event.cells` holds `{ rowKey, columnKey }`
pairs) and stored in the pivot store (`usePivotState(pivot, (s) =>
s.selection)`), so they survive scrolling and re-renders.

## HTML strings and class names

Salmon UI never renders HTML strings and React escapes text, so there is no
HTML sanitizer option and no string templates, which would need a runtime
compiler that breaks a strict CSP. Use `renderCell`,
`renderHeader`, `renderTooltip` and `renderLoading` for custom content;
toolbar items can render React content. Style the root with `className`.
