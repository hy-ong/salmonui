---
title: HeatMap
description: Heat maps from @salmonui/charts/heat-map with category, numeric and time axes, label groups, gradient and step color scales, bubbles, legends, selection, tooltips and a canvas renderer for a million cells.
category: Data Visualization
order: 40
demos: [heat-map-basic, heat-map-large, heat-map-bubbles]
---

`HeatMap` lives in `@salmonui/charts/heat-map`. `data` is a 2D table
(`data[row][column]`, rows are y) or records read through `xField`,
`yField` and `valueField`; `sizeField` adds a second value for bubbles.

```tsx
import { HeatMap } from '@salmonui/charts/heat-map';
import '@salmonui/charts/heat-map/styles.css';

<HeatMap data={table} xAxis={{ labels: days }} yAxis={{ labels: hours }} cells={{ labels: true }} height={360} />
```

<!-- demo: heat-map-basic -->

## Axes

`xAxis` and `yAxis` take `labels`, `scale` (`'category'`, `'linear'` or
`'time'`: numeric and time keys are sorted and filtered by `min` / `max`),
`interval` (every n-th label), `format` (`Intl` options or a function of the
key), `labelOverlap` (`'none'`, `'hide'`, `'trim'`, `'wrap'`, `'rotate45'`,
`'rotate90'`), `maxLabelWidth`, `position`
(`'bottom'` / `'top'`, `'start'` / `'end'`), `reversed`, `title` and
`labelGroups: [{ from, to, text }]` for a second level of labels. Time keys
format in `timeZone` (UTC by default, so server and client agree).

## Colors and legend

Without stops the cells use the derived sequential roles
(`--salmon-chart-sequential-1..9`). `colorScale` takes data colors:
`{ kind: 'gradient' | 'steps', stops: [{ value, color, label }], domain:
'all' | 'row' | 'column', outOfRange }`. A gradient scale shows a gradient
legend; a steps scale shows a list legend whose toggle buttons hide the cells
of a step through `hiddenItems` / `defaultHiddenItems` /
`onHiddenItemsChange` (indices of the steps stops). `legend` is `true` or
`{ position: 'top' | 'bottom' | 'start' | 'end', title, labels: 'all' |
'edge' | 'none', format, toggle }`. Empty cells
(null) use the neutral empty color and read "No value" in the table.

`cells: { labels, format, shape: 'rect' | 'bubble', bubble: 'size' | 'color'
| 'sizeAndColor' | 'sector', highlight }`. `formatCell(cell)` changes the
label text and `getCellStyle(cell)` the color.

## Selection, events and tooltip

`selection` (`true` or `{ multiple }`) toggles cells on click, Enter and
Space. Selection is controlled with `selectedCells` + `onSelectedCellsChange`
or uncontrolled with `defaultSelectedCells`; cells are `{ x, y }` column and
row indices, and the event carries `source` and `reason` (`'click'` or
`'keyboard'`).

```tsx
import { useState } from 'react';
import { HeatMap, type HeatMapCellRef } from '@salmonui/charts/heat-map';

function Picker({ table }: { table: number[][] }) {
  const [selected, setSelected] = useState<readonly HeatMapCellRef[]>([]);
  return <HeatMap data={table} selection={{ multiple: true }} selectedCells={selected} onSelectedCellsChange={setSelected} height={300} />;
}
```

`onCellClick(cell, event)`, `onCellDoubleClick(cell)` and
`onCellHover(cell | null)` report a `HeatMapCell` (`x`, `y`, `xKey`, `yKey`,
`value`, `size`, `color`). The tooltip (`tooltip: true` or `{ render(cell)
}`) is driven by the store: a pointer move that stays in a cell re-renders
nothing.

<!-- demo: heat-map-bubbles -->

## Large matrices

`renderer` is `'svg'`, `'canvas'` or `'auto'` (default): from 10,000 cells
the cells draw on a lazily loaded canvas (one pixel per cell, scaled), while
axes, legend, labels and the accessible table stay SVG and DOM. A
1,000 × 1,000 heat map mounts within 200 ms and hit-testing is index
arithmetic. The server renders the axes and an empty, sized canvas.

<!-- demo: heat-map-large -->

## Keyboard and accessibility

One tab stop; arrow keys move by cell (reversed axes flip their arrows),
Home / End to the row ends (with Ctrl to the corners), PageUp / PageDown to
the first and last row, Enter or Space selects, Escape hides the tooltip. The
focused cell is announced ("08, Wed: 12"). The table lists the cells, capped
with a summary row for large matrices (`showDataTable` shows it). `title`
and `subtitle` label the figure; `description` replaces the automatic
summary.

## Server rendering and API

The server renders the final SVG markup (or the sized empty canvas) at
`width` / `height`, and time keys format in `timeZone`, so hydration matches;
tooltips are client only. `animated` (default `true`) runs the entrance
transition after hydration with the opt-in
`@salmonui/charts/viz-animations.css`; it is off under
`prefers-reduced-motion`. `onResize` reports size changes.

`ref` receives a `HeatMapApi`: `element`, `export(options)`, `toBlob`,
`toDataURL`, `toSVGString`, `print()` and `focus()`. Every prop and type is
in the [API reference](/docs/reference/charts/heat-map).

Custom content uses render props (`tooltip.render`, `formatCell`,
`getCellStyle`), not HTML string templates; colors follow the theme and
visual tokens are system-owned (see [Rendering and colors](/docs/data-visualization/rendering-and-colors)).
