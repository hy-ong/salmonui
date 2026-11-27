---
title: Linear gauge
description: Linear gauges as Gauge shape="linear": horizontal or vertical axes, reversed axes, normal, rounded and thermometer containers, bar and marker pointers with placement, ranges and annotations.
category: Gauges
order: 20
demos: [gauge-linear]
---

```tsx
import { Gauge } from '@salmonui/charts/gauge';
import '@salmonui/charts/gauge/styles.css';

<Gauge shape="linear" orientation="vertical" container="thermometer" axes={[{ min: -10, max: 40 }]} pointers={[{ value: 22, label: 'Room' }]} />;
```

The linear gauge is the same component with the same axes, ranges and
pointers as the [circular gauge](/docs/data-visualization/gauge); only the
geometry differs. Dragging, controlled and uncontrolled pointers
(`value` / `defaultValue` with `onPointerValueChange` and
`onPointerValueCommit`), the legend, tooltips, animation, export, the
`role="meter"` / `role="slider"` semantics and the server rendering all work
as described there.

- `orientation: 'horizontal' | 'vertical'` (default horizontal). The default
  drawing is 360 x 100 horizontally and 120 x 320 vertically; `width` /
  `height` change it and the SVG scales through its `viewBox`.
  The minimum is at the left or the bottom; `axis.reversed` flips it. The data
  axis does not mirror in right-to-left pages.
- `axis.position: 'start' | 'end'` puts ticks and labels above / left or
  below / right of the track; `axis.edgeLabels: 'shift' | 'hide'` keeps the
  first and last labels inside the drawing or drops them.
- `container: 'none' | 'normal' | 'rounded' | 'thermometer'` (default
  `'normal'`) draws the track;
  the thermometer adds a bulb at the minimum that a bar pointer fills.
- Pointers: `type: 'bar'` (default) fills the track from the minimum, with
  `placement: 'near' | 'center' | 'far'` across it (default `'center'`);
  `type: 'marker'` with the same `shape` vocabulary as circular markers sits
  on the far side of the track by default (`placement: 'far'`; `'near'` is the
  label side) and points at it.
- Ranges use the circular model: `from`, `to`, `width` (or `[start, end]`),
  `position` and `color`, with `palette` for ranges without a color.
- `axis.annotations: [{ value, x, y, content }]` place content at a value
  plus a pixel offset.

Keyboard: a draggable pointer takes the arrow keys in data direction (Up and
Right increase), Page Up / Page Down for ten steps and Home / End for the
bounds; the axis never mirrors in right-to-left pages. The full prop list is
in the [API reference](/docs/reference/charts/gauge).

Container width and offset, annotation stacking order and other visual
tokens are system-owned, not props (see [Rendering and colors](/docs/data-visualization/rendering-and-colors)).
