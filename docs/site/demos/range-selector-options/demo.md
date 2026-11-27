---
title: RangeSelector scales, labels, snapping and forms
description: A time RangeSelector with month intervals, year label groups, snapping, tooltips, grid lines and ticks inside a form, a log-scale selector without a series and a linear one snapping to whole steps.
category: data-visualization
---

The rainfall selector is a time scale with `interval: { unit: 'month',
step: 1 }`, a `'MMM'` label format and a second row of year labels
(`groupLabels`). Try `labelPosition`, `labelOverlap`, `gridLines` and
`ticks`, `snap` (to data points, or whole intervals) and `tooltip`
(during drag and focus, or `'always'`). With `name="season"` it submits
two hidden inputs (ISO dates), and the form's reset restores
`defaultValue`.

The file size selector has no series, so it is a plain axis on a `'log'`
scale with `base`, `min`, `max` and `formatLabel`. The rating selector is
linear with `interval: 1` and `snap="interval"`.
