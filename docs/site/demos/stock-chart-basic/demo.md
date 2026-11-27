---
title: StockChart with toolbar, periods and navigator
description: Three years of daily prices in a StockChart with period buttons, a custom date range, a navigator, series type, indicator, trendline and export menus, a trackball and an indicator pane, all controlled.
category: data-visualization
---

`StockChart` composes a `Chart`, a `RangeSelector` navigator, a
`PeriodSelector` and a toolbar of menu buttons. Every choice is a
controlled triad held by the demo and shown below the chart:

- period buttons (`period`, starting at 6M; `periodSelector.position`)
  and the date range picker of `customRange`;
- the navigator (`navigator={false}` hides it, an object passes
  `RangeSelector` props), the chart zoom and "Show Q1 2025" all drive the
  shared `range`, and moving it reports the matching period or `null`;
- the series type, indicators and trendlines menus (`toolbar`);
- the export menu: PNG, SVG, CSV, XLSX and PDF (through `exportWriters`)
  and print.

`Chart` props pass through: a shared tooltip with a snapping crosshair
(the trackball) and `panes` with an `indicator` axis that moves RSI and
MACD to their own pane. With "All" selected, the 1,096 candles merge per
pixel bucket before rendering.
