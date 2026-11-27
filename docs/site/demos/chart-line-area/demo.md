---
title: Lines, steps and areas
description: A Chart with a range area, a segmented line and an area on a second axis; switch the curve, the step position and the risers, and hide a series.
category: data-visualization
---

`curve` switches every series between `'linear'`, `'natural'`,
`'monotone'`, `'cardinal'`, `'clamped'` and `'step'`; with `'step'` the
`stepPosition` and `risers` controls apply. The average line is colored by
value through `segments` along `segmentAxis: 'y'` (the last segment is
dashed). The low to high band is an area with `lowField` / `highField`;
both read dotted paths (`'temp.low'`). The rain series sits on a second
axis, is dotted, semi-transparent and toggled through `series.hidden`.
