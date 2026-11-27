---
title: Size, animation and RTL
description: CSS-driven size with onResize, the entrance and update transitions, right-to-left pages, the Sparkline and HeatMap canvas renderers, JSX children forms and the data-color contrast check across the visualization families.
category: Foundation
order: 6
demos: [chart-size-rtl]
---

These behaviors are shared by the visualization families. Two of them ship
as opt-in stylesheets, because the family stylesheets stay within their
size budgets:

```tsx
import '@salmonui/charts/viz-animations.css'; // entrance and update transitions
import '@salmonui/charts/viz-rtl.css'; // mirrored titles and legends under dir="rtl"
```

Neither is part of a family stylesheet or of the
`@salmonui/charts/styles.css` aggregate; import them next to it when you
need them.

## Size

`Chart`, `PieChart`, `FunnelChart`, `HeatMap`, `TreeMap`, `SankeyChart`
and `RangeSelector` take their size from CSS when `height` (or `width`) is
not given: the drawing fills a root whose height CSS fixes (`style={{
height: 300 }}`, a class, `aspect-ratio`, a stretched grid cell). Without
such a height `Chart` is 300 px tall, the frame families keep the nominal
aspect ratio and `RangeSelector` is 80 px tall. A number fixes that side,
even inside a taller root.

```tsx
<HeatMap data={matrix} style={{ aspectRatio: '2 / 1' }} onResize={(size) => console.log(size)} />
```

The server renders the nominal size (600 px wide); after hydration one
`ResizeObserver` per component writes the measured size into the
component's store, never React state, and the drawing relays out once.
`onResize({ width, height })` runs after each committed change.

`Gauge`, `GeoMap` and `Sparkline` are fixed drawings: `width` and `height`
are the drawing size, the CSS box scales it through `viewBox`, nothing
relays out, so there is no `onResize`.

## Animation

`animated` (default `true`) plays one entrance and then transitions later
layouts: slices, links and range-selector series move their paths, heat
map cells, treemap rectangles and Sankey nodes move and resize. The
entrance is a fade, so pointer hit-testing and the keyboard work during it.
The transitions are CSS keyed on a `data-animate` attribute that is set
after hydration only, so the server markup is always the final state, and
`prefers-reduced-motion: reduce` turns them off.

Motion timing is system-owned: there are no duration or delay props, so
every family moves alike and honors reduced motion. Set `animated={false}`
for static rendering.

| Component | Transitions |
| --- | --- |
| `PieChart`, `FunnelChart` | entrance; slice and segment paths |
| `HeatMap` | entrance (SVG cells and the canvas layer); cell geometry |
| `TreeMap` | entrance; rectangle geometry on drill and resize |
| `SankeyChart` | entrance; link paths and node geometry |
| `GeoMap` | entrance of the layers and markers (zoom and pan are transforms) |
| `RangeSelector` | entrance; series paths |
| `Sparkline` | entrance (also on the canvas renderer) |
| `Chart`, `Gauge` | their own: see [Rendering and colors](/docs/data-visualization/rendering-and-colors) and [Gauge](/docs/data-visualization/gauge) |

For hundreds of sparklines in a scrolling grid pass `animated={false}`, so
rows that scroll into view do not fade in.

## Right-to-left

Direction is inherited from `dir`; there is no `rtl` prop. Data never
mirrors: axes, heat map columns, treemap and Sankey layouts, map
projections and sparklines read left to right as in print, unless an axis
is `reversed`. Every drawing keeps its text anchors in RTL, so labels stay
where the layout put them. HTML parts mirror through logical properties:
tooltips, the accessible tables, TreeMap breadcrumbs, the GeoMap header and
zoom toolbar, and legend keyboard navigation.

With `@salmonui/charts/viz-rtl.css` the parts drawn in the SVG mirror too:
the title and subtitle move to the right edge, and a top or bottom legend
lists its first item at the right, with its toolbar buttons mirrored over
the items, so Left Arrow moves to the next item. `Chart` follows
the same rules: its x axis runs left to right unless `reversed`. Start and end
legends keep their side of the drawing.

## Renderers

SVG is the default. `Chart` and `StockChart` take `renderer="canvas"` (or
`"auto"`): only the plot marks move to a canvas, while axes, legend,
titles, labels and the accessible table stay SVG and DOM; a 1,000,000-point
line mounts to its first painted frame within 300 ms, decimated to a few
points per pixel column first. `HeatMap` moves its cells to a canvas layer with
`renderer="canvas"`, or automatically from 10,000 cells
(`renderer="auto"`, the default). `Sparkline` takes `renderer="canvas"`
(or `"auto"`, from 20,000 points) with the canvas mark layer passed in, so
`@salmonui/charts/sparkline` itself stays a few kilobytes:

```tsx
import { Sparkline } from '@salmonui/charts/sparkline';
import { sparklineCanvas } from '@salmonui/charts/sparkline/canvas';

<Sparkline data={points} renderer="canvas" canvasRenderer={sparklineCanvas} />
```

The server renders an empty, sized canvas; the line, area, bars and
markers are drawn on commit at the device pixel ratio, while bands, the
axis line and labels stay SVG and the summary stays the accessible name.
Without `canvasRenderer` the marks stay SVG.

## JSX children

The collection props also come as children: `GaugeAxis` and
`GaugePointer` for `Gauge` `axes` and `pointers`, `GeoMapLayer` for
`GeoMap` `layers`, like `ChartSeries`, `ChartAxis` and `KanbanColumn`.

```tsx
<Gauge title="Speed">
  <GaugeAxis min={0} max={200} ranges={[{ from: 160, to: 200, color: '#dc2626' }]} />
  <GaugePointer value={72} label="Speed" />
</Gauge>

<GeoMap title="Population">
  <GeoMapLayer shapes={regions} data={population} dataKey="region" />
</GeoMap>
```

They render nothing; the owner reads the props of its direct children
(arrays flatten) during render, so the server markup is the same as the
array form, and the array prop wins when both are given.
`axis` indexes count `GaugeAxis` children in order.

<!-- demo: chart-size-rtl -->

## Data colors

A hex (or `rgb()`) color passed as `color`, `palette`, a color scale stop
or a gauge range color encodes data and is used as given, not mapped to a
theme token. In development builds each component checks, after mount,
the literal colors it drew against the plot surface and logs one warning
listing those under 3:1 contrast; production builds contain no check.
The derived palette (`var(--salmon-chart-*)`) is not checked:
it meets 3:1 by construction.
