---
title: RangeSelector
description: A two-thumb range slider over a mini series with time, linear and log scales, grouped labels, snapping, tooltips, period buttons and a form bridge; PeriodSelector on its own.
category: Range selection
order: 70
demos: [range-selector-navigator, range-selector-options]
---

`RangeSelector` and `PeriodSelector` live in `@salmonui/charts/range-selector`
(CSS: `@salmonui/charts/range-selector/styles.css`; `PeriodSelector` also
uses `@salmonui/buttons/button/styles.css`).

```tsx
import { RangeSelector } from '@salmonui/charts/range-selector';
import '@salmonui/charts/range-selector/styles.css';
import '@salmonui/buttons/button/styles.css'; // with periods

<RangeSelector
  data={prices}
  xField="date"
  yField="close"
  value={range}
  onValueCommit={(next) => setRange(next)}
  periods={[{ id: '1m', unit: 'month', count: 1, label: '1M' }, { id: 'all', unit: 'all', label: 'All' }]}
/>;
```

## Value

The value is `[start, end]` (numbers; epoch ms on time scales) with the
triad `value` / `defaultValue` plus two callbacks:

- `onValueChange(value, event)` during a drag, at most once per animation
  frame, without touching React state;
- `onValueCommit(value, event)` on release and after every keyboard step;
  the uncontrolled value updates here.

## Series and scales

`series: [{ type: 'line' | 'area' | 'stepLine', data, xField, yField }]` or
`data` + `xField` / `yField` draw the background series; without series the
selector is a plain axis. `scale: 'time' | 'linear' |
'log'` (time is inferred from dates), `min`, `max`, `interval` (a number or
`{ unit, step }`) and `base` set the axis.

## Labels

`format`, `formatLabel`, `labelPosition: 'inside' | 'outside'`,
`labelOverlap` and `groupLabels: { unit, align }` (a second label row by
year, month, ...). `gridLines` and `ticks` can be turned off.

## Snapping and tooltips

`snap` snaps released thumbs to the nearest data point; `snap="interval"`
selects whole intervals. `tooltip` shows the thumb values while
dragging or focused, `tooltip="always"` keeps them.

## Periods

`periods: [{ id, unit, count, label }]` renders a `PeriodSelector` (an APG
radio group) above or below (`periodSelector={{ position: 'bottom' }}`);
`unit` is a calendar unit, `'ytd'` or `'all'`, and the range ends at the
data end. `PeriodSelector` is usable alone, and `periodRange()`
computes a period's range.

## Keyboard and accessibility

The two thumbs follow the APG Slider (Multi-Thumb) pattern: `role="slider"`
with `aria-valuemin` / `aria-valuemax` bounded by the other thumb and a
formatted `aria-valuetext`; arrows step by the interval (or 1 % of the
span), PageUp / PageDown and Shift by 10 %, Home / End jump. The selected
band is a third slider that moves both thumbs. The data axis does
not mirror in RTL.

## Linking to a chart

Pass the value to a chart's zoom range:
`<Chart zoomRange={{ x: range }} />`; `StockChart` wires this
internally.

<!-- demo: range-selector-navigator -->

## Forms

With `name`, two hidden inputs carry the start and end (ISO strings on
time scales), and a form reset restores `defaultValue`.

Colors come from the `primary` seed (selected band and thumbs) and the
surface (dimmed regions); thumb geometry is system-owned.

<!-- demo: range-selector-options -->

## SSR and reference

The selector renders on the server at its nominal size (600 px wide, 80 px
tall unless `height` or CSS says otherwise) and relays out once after
hydration; pass `timeZone` and `locale` for stable time labels. `ref`
gives `RangeSelectorApi` (`element`, `focus()`). Every prop is in the
[API reference](/docs/reference/charts/range-selector).
