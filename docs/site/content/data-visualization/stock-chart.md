---
title: StockChart
description: A financial chart composed of Chart, RangeSelector, PeriodSelector and a toolbar with series type, indicator, trendline and export menus, with large OHLC data bucketed per pixel.
category: Charts
order: 65
demos: [stock-chart-basic, stock-chart-events]
---

`StockChart` (`@salmonui/charts/stock-chart`) composes `Chart`, a
`RangeSelector` navigator, a `PeriodSelector` and a Navigation `Toolbar`
of `MenuButton`s. It imports them through their public subpaths,
so a page pays for its own code only once. Import the chart,
range-selector, menu (it carries the Button rules), toolbar and stock-chart
stylesheets (and the date-range-picker one with `customRange`).

```tsx
import { StockChart } from '@salmonui/charts/stock-chart';
import '@salmonui/charts/chart/styles.css';
import '@salmonui/charts/range-selector/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/navigation/toolbar/styles.css';
import '@salmonui/charts/stock-chart/styles.css';

<StockChart data={prices} xField="date" openField="open" highField="high" lowField="low" closeField="close" volumeField="volume" />;
```

- `periods` (default 1M, 3M, 6M, YTD, 1Y, All) and
  `periodSelector={{ position: 'top' | 'bottom' }}`. The triad `period` /
  `defaultPeriod` / `onPeriodChange(id | null, event)` selects one: a
  selected period holds its window at the data end as data grows, moving
  the range away reports the period that matches it or `null`, and a
  controlled `range` wins over the period for the view; `defaultPeriod`
  sets the initial selection.
- `customRange` adds a `DateRangePicker` to the toolbar; it loads after
  hydration from `@salmonui/calendars/date-range-picker`, shows the visible
  range as UTC calendar days between the first and last data date, and a
  picked range calls `onRangeChange` with `reason: 'customRange'`;
  `stockText.customRange` names it.
- `navigator={false}` hides the range selector; an object passes
  `RangeSelector` props.
- `seriesType` / `defaultSeriesType` / `onSeriesTypeChange` with
  `toolbar.seriesTypes` (candle, ohlc, hilo, line, area, column).
- `indicators` / `defaultIndicators` / `onIndicatorsChange` with
  `toolbar.indicators`: SMA, EMA, TMA and Bollinger bands on the price
  axis, momentum, RSI, ATR, accumulation distribution, MACD and stochastic
  on a secondary axis.
- `trendlines` / `defaultTrendlines` / `onTrendlinesChange` with
  `toolbar.trendlines`.
- The visible range is the triad `range` / `defaultRange` /
  `onRangeChange`, shared by the chart's x zoom, the navigator and the
  period buttons.
- Every other `Chart` prop applies: `tooltip`, `crosshair`
  (`{ snap: true }` with a shared tooltip is the trackball), `zoom`,
  `legend`, `annotations` (date strings resolve on the time axis),
  `selection`, `orientation="horizontal"` (transposed), `aria-label` /
  `aria-labelledby`, `panes` with `axes`. An axis with the id `volume` or
  `indicator` refines the generated one, so
  `panes={{ rows: ['70%', '30%'] }}` with
  `axes={[{ id: 'indicator', direction: 'y', pane: { row: 1 } }]}` moves
  the indicators to their own pane.
- Large OHLC data merges candles per pixel bucket (open of the first, close
  of the last, extreme high and low) before rendering.
- `events: [{ date, label, description, shape, seriesIds }]` mark dates on
  the chart: a glyph per `shape` (circle, square, flag, pin, triangle,
  invertedTriangle, triangleRight, triangleLeft, arrowUp, arrowDown,
  arrowLeft, arrowRight, text) before the label, one marker per series in
  `seriesIds` (`'price'` by default, `'volume'` on the volume bars), and a
  visually hidden list for assistive technology; `renderEvent(event)`
  replaces the marker content.

<!-- demo: stock-chart-basic -->

## Export menu

`toolbar.export` lists the export menu items: `'png' | 'jpeg' | 'svg' |
'csv' | 'xlsx' | 'pdf' | 'print'` (default PNG, SVG, CSV, XLSX, PDF and
print). PDF and XLSX go through the `exportWriters` loaders of the
underlying `Chart`, so they appear only when the matching loader is set:

```tsx
<StockChart
  {...props}
  exportWriters={{
    pdf: () => import('@salmonui/export/graphics'),
    xlsx: () => import('@salmonui/export/xlsx'),
  }}
/>
```

PDF is the vector drawing of the price chart; XLSX and CSV are its
accessible table (Rendering and colors, "Data and documents").

## Live data

`StockChart` passes `data` to its `Chart`, so live data behaves as on a
chart: a new array relays out within the live-append budget and
`ref.current.appendPoints('price', rows, { maxPoints })` streams rows into
the price series. Until the user narrows the range the chart
follows the full data, so new points stay in view; a narrowed range stays
put, and a selected period keeps its window at the data end. The navigator and period buttons read `data`, so streamed points
reach them when you pass the new array.

<!-- demo: stock-chart-events -->

## Accessibility and SSR

The chart part is a `Chart` (one tab stop, arrow keys between candles, a
hidden data table), the navigator a multi-thumb slider, the period
buttons a radio group and the toolbar an APG Toolbar of menu buttons. The
server renders the chart, the navigator, the period buttons and the
toolbar; only the `customRange` picker loads after hydration. Set
`timeZone` and `locale` so period boundaries and labels agree between the
server and the browser.

Every prop is listed in the [API reference](/docs/reference/charts/stock-chart).
`series` and `indicators` are reactive props, so there is no refresh
method: pass new arrays to update the chart (see
[Chart](/docs/data-visualization/chart), "Data, state and lifecycle").
