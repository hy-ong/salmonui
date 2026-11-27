---
title: Sparklines in Data Grid cells
description: A Data Grid with a Sparkline cell template on every row; the sparklines render as static SVG, so scrolling keeps the grid scroll budgets.
category: data-visualization
---

Each row's `trend` array becomes a `<Sparkline>` through `renderCell`. The
"500 sparklines in a grid" scroll budget is a release benchmark gate.
