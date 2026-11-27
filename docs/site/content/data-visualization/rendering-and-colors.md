---
title: Rendering and colors
description: Server-rendered SVG with deterministic layout, decimation for large data, the opt-in canvas plot layer and the visualization palette derived from the five theme seeds.
category: Foundation
order: 5
demos: [chart-rendering, chart-export]
---

Every visualization renders SVG on the server from a pure layout of the
props and the nominal size (the given `width`, else 600 px), and relays out
once after hydration when the measured width differs. Text widths come
from a fixed table, so the server and the first client render agree.

Every family renders SVG. The figure families (`Chart`,
`BulletChart`, `StockChart`, `PieChart`, `FunnelChart`, `HeatMap`,
`TreeMap`, `SankeyChart`, `GeoMap`, `Gauge`) hide the drawing from
assistive technology and render a `<figure>` labelled by the `title` and
described by an automatic summary, with an accessible equivalent: a
visually hidden data table (`accessibleTable`, default on;
`showDataTable` shows it), the TreeMap hierarchy as a nested list, a
`meter` per gauge pointer. `Sparkline`, `Barcode` and `QRCode` are images
named by an automatic summary or the encoded value, and `RangeSelector`
is a multi-thumb slider.

Data is a plain array on every data-bound component, with per-series
`data` on `Chart` and dotted field paths (`'price.close'`) everywhere a
field is named. An empty chart keeps its axes and shows the
localized `text.noData`, or `renderEmpty()` on `Chart`, `StockChart` and
`PieChart`.

<!-- demo: chart-rendering -->

## Animation

`animated` (default `true`) plays one entrance and transitions later
layouts on `Chart` (including the canvas plot layer): the reveal and the
path transitions are CSS keyed on a `data-animate` attribute that is set
after hydration, never in the server markup, and `prefers-reduced-motion`
turns them off.

## Export and print

Every instance (`ref`) exports: `api.export({ format: 'png' | 'jpeg' |
'svg', fileName, scale })` downloads the drawing and settles once the
download started; `api.toBlob(format)` and `api.toDataURL(format)` return
the image. `api.print()` prints the vector drawing from a
print document (every family except the barcode symbols). The
export code is one lazy chunk shared by every family. `Sparkline` has no
instance: its `ref` is the root `<svg>`; `RangeSelector` is a slider
control whose `ref` offers `element` and `focus` only (export it with its
`StockChart`).

`api.toSVGString()` returns a `string` synchronously on every family:
the drawn SVG markup with the `xmlns`, theme colors kept as
`var(--salmon-*)` references so the markup re-themes when it is inlined into
a page that loads Salmon UI styles. `api.toBlob('svg')` (and
`export({ format: 'svg' })`) is the standalone file: colors and the
stylesheet's text and line styles inlined. On the server there is no
instance; `visualizationSvg(html, { theme, colorScheme })` from
`@salmonui/charts/server` (server-safe, like
`@salmonui/core/server`) turns the server-rendered HTML of any visualization
into the same drawing as standalone SVG, colors resolved from the theme
seeds, without a DOM:

```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { visualizationSvg } from '@salmonui/charts/server';

const svg = visualizationSvg(renderToStaticMarkup(<Chart title="Sales" data={rows} series={series} />), { colorScheme: 'light' });
```

### Data and documents

`Chart` (and `StockChart` and `BulletChart`, which render one) also exports
its data and vector documents. The writers are not in any
visualization bundle: the application passes loaders that import them on
first use.

```tsx
<Chart
  ref={chartRef}
  exportWriters={{
    pdf: () => import('@salmonui/export/graphics'),
    xlsx: () => import('@salmonui/export/xlsx'),
  }}
  {...props}
/>;

await chartRef.current?.export({ format: 'pdf', orientation: 'landscape', pageSize: 'a4' });
await chartRef.current?.export({ format: 'xlsx' });
await chartRef.current?.export({ format: 'csv' });
```

- `format: 'csv'` writes the accessible table (the category column and one
  column per series) with the Data Grid's CSV writer from
  `@salmonui/data-grid/engine/export` (RFC 4180 quoting, spreadsheet formula
  prefixes neutralized). No loader is needed.
- `format: 'xlsx'` writes the same table through `exportWriters.xlsx`;
  columns whose cells are all plain numbers become number cells.
- `format: 'pdf'` writes the drawing as a vector PDF page through
  `exportWriters.pdf` (`writeGraphicsPdf` of
  `@salmonui/export/graphics`): paths, rectangles, circles and
  text become PDF path and text operators, never an image. `orientation`
  defaults to landscape for a wide drawing; `pageSize` takes the PDF
  writer's names (`a4`, `letter`, ...). The writer takes standalone SVG
  markup, so it also runs on the server with `visualizationSvg` output.
- Without the loader, `xlsx` and `pdf` reject with a message naming the
  missing `exportWriters` entry. The other families export `csv` (their
  table) and images; put them in a PDF with `exportVisualizations`.

### Several visualizations at once

`exportVisualizations(items, options)` combines several visualizations
into one image or PDF page. `items` are instances (any `ref` API) or elements (a
`Sparkline`'s `<svg>`); unmounted entries are skipped.

```ts
import { exportVisualizations } from '@salmonui/charts/chart/export';

await exportVisualizations([chartApi, pieApi, gaugeApi], {
  format: 'pdf', // 'png' (default), 'jpeg', 'svg' or 'pdf'
  direction: 'horizontal', // 'vertical' (default)
  writers: { pdf: () => import('@salmonui/export/graphics') },
  fileName: 'dashboard.pdf',
});
```

It resolves to the file and downloads it unless `download: false`. The
function is a few bytes in each entry and loads the shared export chunk on
first use. It is exported by `/chart`, `/chart/bullet`, `/stock-chart`,
`/pie-chart`, `/heat-map`, `/tree-map`, `/sankey-chart`, `/barcode` and the
barcode symbology subpaths. `/gauge` and `/geo-map` (their initial bundles
are at their gates) and `/sparkline` (its bundle never reaches the
visualization export code) do not export it; a page with those uses it from
any of the other entries, and it accepts their instances and elements.

<!-- demo: chart-export -->

## Large data

`decimation` reduces what reaches the renderer, outside React render:
`'auto'` (default) keeps the first, minimum, maximum and last point of each
pixel column for lines and areas, `'lttb'` keeps two points per column with
Largest-Triangle-Three-Buckets, scatter series keep one point per pixel
cell, and financial series merge candles per pixel bucket. `false` turns it
off. Tooltips, keyboard navigation and the accessible table keep reading
the original data. A 1,000,000-point line decimates well within the
50 ms budget.

`renderer: 'canvas'` (or `'auto'`, above 20,000 drawn points) moves only the
marks to a canvas; axes, legend, labels and the accessible table stay SVG
and DOM.

## Render functions

Per-element customization uses pure function props, never events that
change their arguments in place. Every family calls them while rendering
(on the server too) and only for the elements it draws; they return a style
or content and never mutate their argument:

| Family | Functions |
| --- | --- |
| `Chart`, `StockChart` | `series.getPointStyle(point)` (data `color`, `hidden` leaves a gap; one call per point per layout), `series.labels.format` / `render`, `series.renderMarker`, `axis.formatLabel` / `renderLabel`, `legend.renderItem`, `tooltip.format` / `header` / `render` |
| `PieChart`, `FunnelChart` | `getPointStyle`, `formatLabel` |
| `Sparkline` | `getPointStyle`, `tooltip.format` |
| `HeatMap` | `getCellStyle` |
| `TreeMap` | `getItemStyle` |
| `SankeyChart` | `getNodeStyle`, `getLinkStyle` |
| `GeoMap` | `layer.getShapeStyle`, `markers.getStyle` |
| `Gauge` | `axis.formatLabel` |
| `RangeSelector` | `formatLabel`, `tooltip.format` |
| `Kanban` | `renderCard`, `getCardProps` |

## Colors

The theme stays five seeds plus `colorScheme`. Visualization colors are
derived roles, defined on `.salmon-viz` by the visualization stylesheet:

- `--salmon-chart-1` to `--salmon-chart-10`: slots 1 to 5 take the hues of
  `primary`, `warning`, `info`, `danger` and `success`, slots 6 to 10 the
  hues halfway between neighbors. Lightness alternates between two fixed
  values per scheme and chroma is fixed, so every slot meets 3:1 against
  the plot surface for any hue and adjacent slots stay apart under
  simulated protanopia, deuteranopia and tritanopia.
- `--salmon-chart-sequential-1..9` (primary, from the surface side) and
  `--salmon-chart-diverging-1..11` (danger through neutral to primary).

`palette={['#…', …]}` and `series.color` take data colors (hex values
that encode data, not theme tokens) and are used as given.

There is no named theme input: the theme is derived from a few
values (color seeds, scheme, density, font family, neutral tint, surfaces),
because named design-system themes would need a token table per component.
Set the five seeds and `colorScheme` (`light`, `dark` or `auto`) once on
`ThemeProvider` and every visualization follows, palette included; the
theme's `fontFamily` applies to axis labels and legends too. High
contrast relies on `forced-colors` support.

## Visual tokens and backgrounds

Typography, stroke widths, radii, spacing, gradients and focus rings are
system-owned, so contrast and layout stay guaranteed; there are no font,
border, corner radius, gradient or spacing props. Data colors stay
configurable. If a deviation is unavoidable, use `className` /
`style` and CSS on the `.salmon-chart-*` parts; such overrides are
unsupported but not blocked.

Surfaces follow the theme in both color schemes, because a hard-coded
background breaks dark mode and contrast, so there is no background color,
background image or plot area fill prop. Style the root with
`className` or `style`, and use axis `bands` for data-driven backgrounds.

## Fill patterns

`PieChart` takes `patterns`, a boolean that assigns one system pattern per
palette slot for non-color encoding; there are no named pattern options. `Chart` has no
pattern fill: distinguish its series by marker `shape` or `lineStyle`.

The [Chart](/docs/data-visualization/chart) page has a live-data demo
that clears its data to show `renderEmpty`. Export, renderer and
`decimation` props are listed under `ChartProps` and `ChartApi` in the
[API reference](/docs/reference/charts/chart), `exportVisualizations` in
[`@salmonui/charts/chart/export`](/docs/reference/charts/chart-export).
