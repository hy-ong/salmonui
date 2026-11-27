---
title: Polar and radar charts
description: Wind speed by direction on polar circles or radar polygons, drawn as lines, areas, wedges or points, stacked or not, from any start angle.
category: data-visualization
---

`coordinate` switches between `'polar'` (circles) and `'radar'`
(polygons); the series `type` picks how each series is drawn, `stack` gives
the stacking variants and `xAxis.startAngle` rotates the first category.
The polar layout is the opt-in `polar` feature from
`@salmonui/charts/chart/features`, passed in `features`, so it renders on
the server too.
