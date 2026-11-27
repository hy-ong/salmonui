---
title: Trendlines and empty points
description: Fit a linear, exponential, logarithmic, polynomial, power or moving-average trendline with a forecast, a forced intercept and markers, and choose how missing values are drawn.
category: data-visualization
---

`series.trendlines` fits the selected `kind` to the scatter series
(`order` for polynomials, `period: 3` for the moving average).
`forecast.forward` extends the line by months, `intercept` forces it
through (0, 30), `name` labels its legend entry and tooltip, and `markers`
draws points on it.

The sensor log has missing readings (`null`): `emptyPoints` breaks the
line (`'gap'`), plots 0, skips the point (`'drop'`) or uses the average of
the neighbors. The accessible table marks the empty points.
