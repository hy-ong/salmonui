---
title: Waterfall, histogram, box plot, Pareto and error bars
description: The statistical Chart series: a profit bridge with subtotals and totals, a histogram with a normal curve, box plots with three quartile methods, a Pareto chart and columns with five kinds of error bars.
category: data-visualization
---

- Waterfall: `subtotals: [2]` and `totals: [6]` mark the bars computed from
  the steps before them; `connectors` joins the bars.
- Histogram: bins of `binWidth` ms over the raw values, with `normalCurve`.
- Box plot: `yField` holds an array per team; switch `quartileMethod` and
  see the boxes move. `mean` draws the mean marker and `outliers` the
  points beyond the whiskers.
- Pareto: sorted columns plus the cumulative percent line on a generated
  secondary axis.
- Error bars: `errorBars.kind` `'custom'` reads `plusField` /
  `minusField`; `'fixed'`, `'percent'`, `'standardDeviation'` and
  `'standardError'` compute the whiskers.
