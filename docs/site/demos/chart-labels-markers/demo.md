---
title: Titles, data labels, markers and annotations
description: A titled column chart with positioned, rotated and templated data labels and annotations, and a line chart with marker shapes, custom SVG markers and labels, smart label overlap, last-value badges and inline series labels.
category: data-visualization
---

The sign-ups chart has a `title` and `subtitle` (the figure caption).
Its labels take `position`, `angle`, `showZero` (April is 0) and a
`'{value} users'` template. Two `annotations` place a badge at a data
point and one at a pixel position.

The price chart draws diamond and open triangle `markers`; cocoa uses
`renderMarker` and `labels.render` for SVG content. Coffee and tea labels
collide: `labels.overlap` hides them, shifts them or rotates them, and
`dedupe` drops a label equal to the previous one. `lastValue` draws the
last value at the plot edge and `inlineLabel` the series name at the end
of the line.
