---
title: Financial series
description: Candle, OHLC and high-low series over daily prices, with hollow candles and volume columns in the candle colors.
category: data-visualization
---

One series reads `openField`, `highField`, `lowField` and `closeField`;
switch its `type` between `'candle'`, `'ohlc'` and `'hilo'`. Candles use
the `success` / `danger` seeds for up and down days, `hollow` draws rising
candles as outlines, and `volumeField` adds volume columns in the bottom
fifth of the plot (also listed in the tooltip).
