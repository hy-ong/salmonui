---
title: Chart analysis
description: Trendlines (linear, exponential, logarithmic, polynomial, power, moving average) with forecasts, technical indicators in panes, and empty-point handling.
category: Charts
order: 50
demos: [chart-trendlines, chart-indicators]
---

## Trendlines

`series.trendlines` adds fitted lines to a series:

```tsx
{ xField: 'x', yField: 'y', trendlines: [{ kind: 'polynomial', order: 3, forecast: { forward: 5 }, name: 'Trend' }] }
```

`kind` is `'linear'`, `'exponential'`, `'logarithmic'`, `'polynomial'`
(`order` 2 to 6), `'power'` or `'movingAverage'` (`period`); the math
lives in the internal chart engine. `forecast: { forward,
backward }` extends the line, `intercept` forces it through `(0,
intercept)`, `name` and `color` label it; each trendline gets its own
legend entry and tooltip. `markers` (`true` or marker options,
default off) draws points on the line, one per data point up to 256 on a
fitted line; `tooltip: false` leaves the line out of the tooltip and
keyboard focus (default: the series' `tooltip`).

<!-- demo: chart-trendlines -->

## Technical indicators

`indicators` computes indicators over a series, reactively (a new array is
a new layout; there is no refresh method):

```tsx
import { technicalIndicators } from '@salmonui/charts/chart/indicators';

<Chart
  data={prices}
  panes={{ rows: ['70%', '30%'] }}
  axes={[{ id: 'oscillator', direction: 'y', pane: { row: 1 }, min: 0, max: 100 }]}
  series={[{ id: 'price', type: 'candle', xField: 'date', openField: 'open', highField: 'high', lowField: 'low', closeField: 'close', volumeField: 'volume' }]}
  indicators={[
    { kind: 'sma', seriesId: 'price', period: 20 },
    { kind: 'bollinger', seriesId: 'price', period: 20, deviations: 2 },
    { kind: 'rsi', seriesId: 'price', yAxis: 'oscillator', zones: { upper: 70, lower: 30 } },
  ]}
  features={[technicalIndicators]}
/>
```

| `kind` | Options | Drawn as |
| --- | --- | --- |
| `'sma'`, `'ema'`, `'tma'` | `period` (14), `field` (`'close'`, `'open'`, `'high'`, `'low'`) | a line on the series axis |
| `'momentum'`, `'rsi'` | `period`, `zones` (RSI: 70 / 30) | a line; zones are two axis lines and a band |
| `'atr'`, `'accumulationDistribution'` | `period`; A/D reads `series.volumeField` | a line |
| `'bollinger'` | `period` (20), `deviations` (2) | a range area and the middle line |
| `'macd'` | `fastPeriod` (12), `slowPeriod` (26), `signalPeriod` (9), `display: 'line' \| 'histogram' \| 'both'` | MACD and signal lines, histogram columns |
| `'stochastic'` | `kPeriod` (14), `dPeriod` (3), `zones` (80 / 20) | %K and %D lines |

The moving averages and Bollinger bands share the price axis. Every other
kind goes to `indicator.yAxis`, usually an axis in its own pane
(`panes`, `axis.pane`, see [Chart axes](/docs/data-visualization/chart-axes)), or to a
generated secondary axis when none is named. `name` and `color`
(a data color) label and color it; each indicator series has a legend
entry and tooltip.

## Loading

Indicators are an opt-in feature: pass `features={[technicalIndicators]}` from
`@salmonui/charts/chart/indicators`. The feature renders on the server and
the client alike; a chart without it never loads the indicator code (and
warns in development when `indicators` is set). Trendlines are part of
`@salmonui/charts/chart` itself.

<!-- demo: chart-indicators -->

## Empty points

`series.emptyPoints` decides what a missing value does: `'gap'` (default)
breaks the line, `'zero'` plots 0, `'average'` the mean of the neighbors,
`'drop'` skips the point.

The trendlines demo above also switches `emptyPoints`. `ChartTrendline`
and `ChartIndicator` are in the [API reference](/docs/reference/charts/chart),
`technicalIndicators` in
[`@salmonui/charts/chart/indicators`](/docs/reference/charts/chart-indicators).
