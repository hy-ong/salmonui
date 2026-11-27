---
title: Large heat map on canvas
description: A 400 × 400 HeatMap (160,000 cells) that switches to the canvas renderer automatically, with a gradient of data colors per row.
category: data-visualization
---

Above 10,000 cells `renderer="auto"` draws the cells on a lazily loaded
canvas while axes, legend and the accessible table stay in the DOM; hover
hit-testing is index arithmetic.
