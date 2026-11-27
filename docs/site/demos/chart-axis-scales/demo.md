---
title: Axis scales and ranges
description: Time and time-category axes with calendar intervals, linear and log value axes, an indexed category axis with label placement, and axis ranges with includeZero, padding, min, max, interval and tickCount.
category: data-visualization
---

- The price chart has trading days only. `scale: 'time'` keeps the weekend
  gaps and ticks on calendar boundaries (`interval: { unit, step }`, a
  date skeleton `format`, `timeZone="UTC"`); `'timeCategory'` closes the
  gaps. `includeZero` and `padding` change the value axis range.
- The users chart switches its value axis between `'linear'` (1-2-5 nice
  ticks) and `'log'` with `base` 2 or 10; its x axis is linear with
  `min`, `max` and `interval: 1`.
- The shift chart repeats "Mon" and "Tue": `indexed` gives each point its
  own band, and `labelPlacement` puts the labels between or on the ticks.
  Its value axis fixes `min`, `max` and `tickCount`.
