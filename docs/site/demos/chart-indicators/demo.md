---
title: Technical indicators
description: Moving averages and Bollinger bands over a candle series, and RSI, momentum, ATR, accumulation distribution, MACD or stochastic in a lower pane, with zones and MACD display options.
category: data-visualization
---

`indicators` is plain data: change the selects and the chart lays out
again (there is no refresh method). SMA, EMA, TMA and Bollinger bands
(`period`, `deviations: 2`) share the price axis; the lower-pane indicator
names `yAxis: 'oscillator'`, an axis placed in the second row of
`panes`. RSI and stochastic draw their overbought / oversold `zones`,
MACD takes `fastPeriod`, `slowPeriod`, `signalPeriod` and `display`, and
accumulation distribution reads the series' `volumeField`. The indicator
code is the opt-in `technicalIndicators` feature from
`@salmonui/charts/chart/indicators`.
