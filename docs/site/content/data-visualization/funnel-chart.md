---
title: FunnelChart
description: Funnel and pyramid charts from @salmonui/charts/pie-chart with neck size, a trapezoidal variant, gaps, linear or area pyramids and the shared legend, selection, tooltip and keyboard model.
category: Data Visualization
order: 30
demos: [funnel-chart]
---

`FunnelChart` draws funnel and pyramid charts. It shares the figure of [PieChart](/docs/data-visualization/pie-chart):
legend, `hiddenPoints`, `selection`, tooltips, keyboard, table and the
instance work the same way.

```tsx
import { FunnelChart } from '@salmonui/charts/pie-chart';
import '@salmonui/charts/pie-chart/styles.css';

<FunnelChart data={stages} valueField="n" labelField="stage" neckWidth="20%" neckHeight="20%" gap={2} />
<FunnelChart variant="trapezoidal" data={stages} valueField="n" labelField="stage" />
<FunnelChart shape="pyramid" mode="area" data={stages} valueField="n" labelField="stage" />
```

The first value is on top. `shape` is `'funnel'` (default) or `'pyramid'`.
Segment heights are proportional to the value; `shape="pyramid"` with
`mode="area"` makes each segment's area proportional instead (`mode` is
`'linear'` by default and applies to pyramids only). `neckWidth` and
`neckHeight` take px or percents (default `'20%'` of the width and height);
`gap` is the space between segments in px (default 2).

`variant="trapezoidal"` (funnels only; `'standard'` is the default) draws
each value as a bar of equal height whose width is the value over the
largest visible value, centered, and joins each bar to the next with a
translucent trapezoid in the gap. The neck props do not apply and `gap`
defaults to 10 px so the joins are visible. Labels are drawn
inside segments that fit them, `labels={{ position: 'outside' }}` puts
every label beside the funnel with a connector, and `labels={false}` hides
them; `formatLabel(point)` changes the text.

## State, events and keyboard

`FunnelChart` takes the props of the shared accumulation figure described on
the [PieChart](/docs/data-visualization/pie-chart) page: the
`hiddenPoints` and `selectedPoints` triads (controlled with the value prop,
uncontrolled with the `default*` prop), `onPointClick`, `onPointHover`,
`tooltip`, `highlight`, `annotations`, `colorField`, `palette`, `patterns`
and `emptyPoints`. Explosion, rings and `groupSmall` are pie-only. The plot
is one tab stop: arrow keys, Home and End move between segments, Enter and
Space select, Escape closes the tooltip, and a polite live region announces
"Visits: 1,200, 40%". The figure is described by an automatic summary and a
visually hidden label / value / percent table (`showDataTable` shows it).

Segments, labels, the legend and the table are server-rendered; without
`height` (prop or CSS) the chart relays out once after hydration, and the
tooltip and the entrance animation are client only.

<!-- demo: funnel-chart -->

Every prop is listed in the
[API reference](/docs/reference/charts/pie-chart).
