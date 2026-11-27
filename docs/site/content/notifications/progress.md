---
title: Progress and Meter
description: Linear, circular and semicircle progress indicators and meters drawn with CSS and one inline SVG, with indeterminate, buffer, segments and stripes, rendered in Server Components with zero client JavaScript.
category: Components
order: 40
demos: [progress-linear, progress-circular]
---

```tsx
import { Meter, Progress } from '@salmonui/notifications/progress';
import '@salmonui/notifications/progress/styles.css';

<Progress aria-label="Upload" value={42} label />;
<Progress aria-label="Sync" shape="circular" value={null} />;
<Meter aria-label="Disk usage" value={85} tone={(v) => (v > 80 ? 'danger' : 'success')} />;
```

`Progress` (`role="progressbar"`) and `Meter` (`role="meter"`) are server
components with no client JavaScript. The value is written as inline custom
properties (`--salmon-progress-value`, `--salmon-progress-buffer`), so server
and client markup match and a value change is one style write: the owner's
render is the only React work.

<!-- demo: progress-linear -->

## Value and range

- `value`, `min` (default 0) and `max` (default 100); the value is clamped to
  the range.
- `value={null}` is indeterminate: `aria-valuenow` is omitted and the bar
  moves on the shared keyframes. Under `prefers-reduced-motion` the
  bar is a static partial fill.
- `buffer`: a lighter second layer on the same scale, for linear and circular
  shapes.

## Shapes

- `shape="linear"` (default): a track and a bar scaled with
  `transform: scaleX()` from the inline start, so right-to-left pages fill
  from the right.
- `shape="circular"` and `shape="semicircle"`: one inline SVG of `<circle>`
  elements drawn with `stroke-dasharray`, no chart engine.
  Other start and end angles, pointers and ranges belong to a
  [Gauge](/docs/data-visualization/gauge): the progress indicator
  stays one fixed SVG so it renders on the server with no chart code.
- `size`: `'sm'`, `'md'` (default), `'lg'`, or a diameter in pixels for the
  round shapes; for `linear` the metric set picks the bar thickness. `thickness` sets the stroke or bar thickness in pixels for track,
  value and buffer together.
- `segments`: equal segments with a fixed gap, a CSS mask on the track or the
  SVG. `striped`: stripes on a linear bar.

<!-- demo: progress-circular -->

## Color

`tone` is `'primary'` (default), `'neutral'`, `'info'`, `'success'`,
`'warning'` or `'danger'`, or a function of the value, so the color
can change by range: `tone={(value) => (value > 90 ? 'danger' : 'primary')}`.

Colors always come from the theme, which derives them from five semantic
seeds, so every progress bar matches the rest of the interface in
light, dark and forced-colors modes. There are no per-instance bar, track,
buffer or segment color props, gradients or corner radius
settings: pick a `tone`, or override `.salmon-progress-bar` /
`.salmon-progress-track` in your stylesheet. There is no pie fill:
use `shape="circular"` with a large `thickness`, or a
[pie chart](/docs/data-visualization/pie-chart).

## Labels and value text

- `label`: `true` shows the formatted percentage; a node is shown as is; a
  function receives `{ value, percent, valueText }`. Round shapes
  center the label, so any node (an icon, a value and unit) can sit in the
  middle of the ring.
  Label typography and placement are fixed.
- `valueLabel` sets `aria-valuetext`, as a string or a function of the same
  context. The default is the locale percent
  (`locale`, default `'en-US'`).
- Label font, color and position are fixed by the stylesheet: style
  `.salmon-progress-label` instead.
- An accessible name is required by the props type: `aria-label` or
  `aria-labelledby`.

## Meter

`Meter` is for measured values within a known range (disk usage, a score):
`role="meter"`, the same shapes, CSS and props except `buffer`, `striped` and
indeterminate values.

## Events, class and style

`className`, `style` and every DOM prop, including `onClick` and the pointer
events (`onPointerDown`, …), reach the root element. `ref`
is the root `<div>`.

Not included, on purpose:

- Value-changed and completed events: the application sets
  `value`, so it already knows when the value changes or reaches `max`; run
  that code where you set the value.
- Animation settings (duration, delay, an animation-complete event): value changes use one CSS transition, off under
  `prefers-reduced-motion`. Per-instance timing would need JavaScript
  animation on the server-rendered component.
- An active moving sheen: use `value={null}` or `striped`.
- A built-in tooltip: wrap the progress in a
  [Tooltip](/docs/layout/tooltip) or show `label`; a built-in tooltip would
  add client code to a component that has none.
- Persistence: there is no state to persist; the value is a prop.
- Load events and a teardown method: React's lifecycle replaces
  them; the component renders synchronously and has no load phase.

## SSR

`Progress` and `Meter` are server components: the subpath has no
`"use client"` directive, they use no hooks, and the server HTML is final
(no measurement, no hydration work).

API reference: [`@salmonui/notifications/progress`](/docs/reference/notifications/progress).
