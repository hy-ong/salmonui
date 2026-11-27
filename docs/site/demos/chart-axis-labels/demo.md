---
title: Axis labels, formats and groups
description: Crowded category labels resolved by hiding, trimming, wrapping, staggering or rotating; edge labels; inside labels and ticks; label formats, functions and SVG content; multi-level label groups; label clicks and locales.
category: data-visualization
---

The product chart has long category names: pick a `labelOverlap` strategy
(with `maxLabelWidth: 80`), an `edgeLabels` mode, and move the value
labels and ticks inside the plot (`labelPosition`, `tickPosition`, with a
`plotOffset`). Its value labels come from `formatLabel`.

The revenue chart formats its value axis with `Intl.NumberFormatOptions`
in the chosen `locale` and widens the computed range with the pure
`axis.domain(computed)`. Its x axis draws two rows of `labelGroups`
(quarters, then halves with a brace) and `renderLabel` bolds every
quarter's first month. Click a tick label (`onAxisLabelClick`) or a group
cell (`onAxisLabelGroupClick`) to see the event.
