---
title: BulletChart
description: A bullet chart preset over Chart with a feature bar per item, qualitative bands, one or more targets, both orientations and value labels.
category: Charts
order: 60
demos: [bullet-chart-kpis]
---

`BulletChart` (`@salmonui/charts/chart/bullet`) is a preset over `Chart`
with one `bullet` series: one feature bar per data item. It is a
subpath of the chart family so a page with only `Chart` does not carry it;
its styles are in the chart stylesheet.

```tsx
import { BulletChart } from '@salmonui/charts/chart/bullet';
import '@salmonui/charts/chart/styles.css';

<BulletChart
  title="KPIs"
  name="Sales"
  data={[{ k: 'Revenue', v: 270, t: 250 }]}
  categoryField="k"
  valueField="v"
  targetField="t"
  max={300}
  bands={[{ to: 150 }, { to: 225 }, { to: 300 }]}
/>;
```

<!-- demo: bullet-chart-kpis -->

## Props

- `name` names the value in the legend and the announcements (default
  `valueField`).
- `targetField` takes one field or several, drawn with `targetShapes`, one
  of `'line'` (default), `'circle'` or `'cross'` per target.
- `bands: [{ to, color, label }]` are the qualitative ranges; without
  colors they take neutral tones from the theme.
- `orientation: 'horizontal' | 'vertical'` and `axisPosition: 'start' |
  'end'`.
- `min`, `max`, `interval`, `minorTicks`, `format`, `labelPosition` and
  `tickPosition` (`'inside' | 'outside'`, default following
  `labelPosition`) scale the value axis.
- `title` and `subtitle` as in `Chart`; category labels sit at the start
  of the category axis.
- `labels` (`true` or `{ format }`) prints the value on the feature bar.
- `valueShape: 'dot'` draws the feature as a dot at the value instead of a
  bar from zero.
- `tooltip` (default on) and keyboard focus come from `Chart`.
- `legend` (`true` or `{ position: 'top' | 'bottom', title }`, default off)
  lists the value, each target (with its glyph) and each band (its color
  and `label`, else "Band 1", "Band 2", ...) as a static list next to the
  figure; it is server rendered.
- `valueColor` and `targetColor` are data colors; bar and target
  widths are system-owned.
- `max` defaults to the last band's `to`, `min` to 0.

`animated` (default `true`) plays the chart entrance on the feature bars
after hydration and transitions later values; `prefers-reduced-motion`
turns it off.

## Events, keyboard and accessibility

`onItemClick(context, event)` fires on a pointer click on an item (it is
`Chart`'s `onPointClick`). `BulletChart` has no controlled state. The plot
is one tab stop; arrow keys move between items and the polite live region
announces the item, its value, every target and the band the value falls
in, for example "Sales, Revenue: 270.00, Target 250.00, Band 3. 1 of 2."
(`name="Sales"`). The same text is the tooltip and the accessible
table cell. `text: { target, band, legend }` localizes the words. `ref`
receives the `Chart` instance (`export`, `toSVGString`, `print`, `focus`,
...).

## Server rendering

The figure, bands, targets, labels and legend are server-rendered SVG and
HTML; the tooltip and the entrance animation start after hydration. Without
`height` a horizontal chart is 56 px plus 36 px per item tall (at least
120 px), so the server markup already has its final size.

Fonts, border widths and other visual tokens are system-owned, not props
(see [Rendering and colors](/docs/data-visualization/rendering-and-colors)).
Every prop is listed in the [API reference](/docs/reference/charts/chart-bullet).
