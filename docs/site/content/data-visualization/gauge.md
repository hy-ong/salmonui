---
title: Gauge
description: Circular gauges with several axes, ticks, labels, tapered ranges, needle, bar and marker pointers, annotations, a range legend, tooltips, pointer transitions, and draggable pointers and ranges that follow the slider pattern.
category: Gauges
order: 10
demos: [gauge-basic, gauge-thermostat]
---

```tsx
import { Gauge } from '@salmonui/charts/gauge';
import '@salmonui/charts/gauge/styles.css';

<Gauge
  title="Speed"
  axes={[{ ranges: [{ from: 0, to: 60, color: '#2e7d32' }, { from: 60, to: 100, color: '#c62828' }] }]}
  pointers={[{ value: 72, label: 'Speed', valueText: (v) => `${v} km/h` }]}
/>;
```

`Gauge` draws circular and linear gauges with one
component: `shape="circular"` (default) or `shape="linear"` (see
[Linear gauge](/docs/data-visualization/linear-gauge)). The markup is final on
the server: the drawing has a fixed size (`width` / `height`, default 240 x
240) and a `viewBox`, so it scales with its container and never relays out
after hydration (no `onResize`).

`axes` and `pointers` also have a JSX form: `GaugeAxis` and `GaugePointer`
children take the same fields as an array entry and are read in order when
the array prop is absent (`pointer.axis` then counts `GaugeAxis` children).

```tsx
import { Gauge, GaugeAxis, GaugePointer } from '@salmonui/charts/gauge';

<Gauge title="Load">
  <GaugeAxis min={0} max={200} ranges={[{ from: 150, to: 200, label: 'High' }]} />
  <GaugePointer value={120} label="Load" />
</Gauge>;
```

## Axes

`axes` is an array (default one axis from 0 to 100). Each axis takes `min`,
`max`, `startAngle` and `endAngle` in degrees clockwise from 12 o'clock
(default 225 and 135, a 270-degree dial), `direction: 'clockwise' |
'counterclockwise'` and `radius` as a fraction of the available radius.
`center` moves the dial (fractions of the drawing) and `rangeGap`
separates inside ranges from the axis line. Several axes draw concentric
dials; a pointer picks its axis with `pointer.axis`.

## Ticks and labels

- `axis.ticks`: `interval` (default a nice step), `minor` (minor tick
  interval), `position: 'inside' | 'outside' | 'cross'`, `rangeColor` (ticks
  inside a range take its color) and `hidden`.
- `axis.labels`: `position: 'inside' | 'outside'`, `rotate` (along the arc),
  `hide: 'first' | 'last'`, `showLast`, `overlap: 'hide'` (default) and
  `format` (`Intl.NumberFormatOptions`, with the `locale` prop).
- `axis.formatLabel(value)` returns any label text.

## Ranges

`axis.ranges: [{ id, from, to, width, position, color, label }]`.
`width` is a number or `[start, end]` for a tapered band; `position` is
`'inside'`, `'outside'` or `'cross'`. A range without a `color` takes the
next slot of the categorical palette, or of `palette` when given. Colors are
data colors: they are used as given.

## Pointers

`pointers` is an array; each pointer is reactive: change `value` and the
gauge redraws (no `setPointerValue()`).

- `type: 'needle'` (default on circular gauges): `length` and `tail` as
  fractions of the radius, `width` and `cap` in pixels.
- `type: 'bar'`: a range bar from the minimum to the value.
- `type: 'marker'`: `shape` is `circle`, `rectangle`, `triangle`,
  `invertedTriangle`, `diamond`, `arrow`, `invertedArrow` or `text` (with
  `text`); `render` draws any React content, an image for example, at the
  pointer.

## Dragging

`draggable` turns a pointer into an APG slider: drag it, or focus it
and press the arrow keys (one `step`, default 1 % of the axis), Page Up /
Page Down (ten steps) and Home / End. Arrow keys follow the data direction,
which never mirrors in right-to-left pages. `onPointerValueChange({ pointerId,
value }, event)` proposes values during a drag and on each key press;
`onPointerValueCommit` fires on release and once per key press. Both receive
a frozen event with `source` (`'pointer'`, `'keyboard'`, `'touch'`) and
`reason` (`'drag'`, `'release'`, `'keyboard'`). A controlled pointer (`value`)
moves only when you update the prop; an uncontrolled one starts at
`defaultValue` and keeps the committed value itself. The drag preview lives in
the component's store, never in React state.

```tsx
import { useState } from 'react';
import { Gauge } from '@salmonui/charts/gauge';

function Volume() {
  const [volume, setVolume] = useState(40);
  return (
    <Gauge
      pointers={[{ id: 'volume', type: 'marker', value: volume, draggable: true, step: 5, label: 'Volume' }]}
      onPointerValueChange={(change) => setVolume(change.value)}
    />
  );
}
```

`range.draggable` makes both ends of a range slider thumbs (the APG
multi-thumb slider): each end is a `role="slider"` named after the range
(`"Comfort band start"`, `"Comfort band end"`) whose `aria-valuemin` /
`aria-valuemax` stop at the other end, so the ends never cross. Drag an end or
use the same keys as a pointer (`range.step`, default 1 % of the axis).
Ranges are reactive props: `onRangeChange({ rangeId, from, to }, event)`
reports the moved range during a drag (`event.reason === 'drag'`), on release
(`'release'`) and per key press (`'keyboard'`); apply it to `axes`.

```tsx
// inside a component
const [band, setBand] = useState({ from: 40, to: 70 });

<Gauge
  axes={[{ ranges: [{ id: 'band', ...band, label: 'Comfort band', draggable: true, step: 5 }] }]}
  onRangeChange={(change) => setBand({ from: change.from, to: change.to })}
/>;
```

<!-- demo: gauge-thermostat -->

## Annotations, legend and tooltips

- `axis.annotations: [{ angle, radius, content, rotate, label }]` place React
  content on the dial.
- `legend` (`true` or `{ position: 'top' | 'bottom', title, toggle }`) lists
  the ranges as a toolbar of toggle buttons; the triad `hiddenRanges` /
  `defaultHiddenRanges` / `onHiddenRangesChange(ids, event)` controls which
  ranges (by range `id`) are hidden.
- `tooltip` shows the value of a hovered or focused pointer and the span of a
  hovered range. `tooltip.targets` picks among `'pointer'`,
  `'range'` and `'annotation'` (default the first two); an annotation tooltip
  shows the annotation's `label`. `tooltip.render(ctx)` replaces the content;
  `ctx.target` tells which kind was hovered.

## Animation

`animated` (default `true`) moves pointers from the axis minimum on first
display and from the previous value on every later change: one
transition of about 0.6 s. The server and the hydration render draw the final
values, so there is no hydration difference; the transition starts after
hydration from a small lazy chunk and writes the pointer geometry to the DOM
per frame, never through React state. It is off under
`prefers-reduced-motion: reduce`, and drags and key presses move the pointer
directly. Ranges, ticks and labels render with the first frame.

## Accessibility

The gauge is a `<figure>` labelled by `title`, described by an automatic
summary and backed by a visually hidden data table (`showDataTable` shows
it). Each read-only pointer is a `role="meter"` with `aria-valuemin`,
`aria-valuemax`, `aria-valuenow` and `aria-valuetext` (from `valueText`); a
draggable pointer or range end is a `role="slider"` in the tab order.
`title` and `subtitle` are also drawn at the top of the drawing (the gauge
sits below them); `subtitle` and `description` (which replaces the summary)
complete the figure, and `locale` formats labels and value text. For a plain progress ring
use `Progress` from Notifications instead.

## Export and DOM events

`ref` receives a `GaugeApi`: `element`, `export({ format, fileName, scale })`
(`'png'`, `'jpeg'` or `'svg'`), `toBlob`, `toDataURL`, `toSVGString`,
`print()` and `focus()` (the first slider thumb); the export code is a lazy
chunk. DOM props and handlers (`onPointerMove`, `onClick`, `data-*`) go to the
root `<figure>`, so any pointer or mouse handler works on the whole gauge.
The full prop and type list is in the
[API reference](/docs/reference/charts/gauge).

## Design notes

Values, ranges and annotations are reactive props: change `value`, `ranges`
or `annotations` to update the gauge; there are no setter methods. Tooltips
and annotations take React content (`tooltip.render`, `content`), never
HTML strings. Animation is on or off (`animated`) with system-owned timing,
and surface colors come from the theme seeds; use `className` / `style`
for the rest (see [Rendering and colors](/docs/data-visualization/rendering-and-colors)).
