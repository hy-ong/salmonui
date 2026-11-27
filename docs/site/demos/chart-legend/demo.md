---
title: Legend
description: A ten-series legend with positions, alignment, wrapping or paging, a title, truncated labels, legend shapes, custom items and a controlled list of hidden series.
category: data-visualization
---

The legend is a toolbar of toggle buttons: Tab to it, move with the arrow
keys and press Space or Enter to hide or show a series (`aria-pressed`).
The hidden series are the controlled `hiddenSeries` triad, starting with
Geneva and Helsinki; "Toggle on click" off sets `legend.toggle: false`.

Change `legend.position`, `align`, `orientation` and `reverse`;
`overflow: 'page'` pages the items with previous / next buttons, `'wrap'`
wraps them. `title` heads the legend and `maxLabelWidth: 90` truncates
"Istanbul (European side)" with an ellipsis while the button keeps the
full name. Each series has its own `legendShape`. "Custom items" passes
`legend.renderItem(item)`.
