---
title: Slider ranges, ticks and limits
description: Slider min, max and step set live, tick labels formatted with ticks.formatOptions or drawn by renderTick, value label text from valueLabel.format, and range limits with a fixed start thumb.
category: inputs
---

Change `min`, `max` and `step` in the toolbar: the Discount slider snaps to
the new step and its ticks follow, labelled through
`ticks.formatOptions`; the always-visible bubble uses `valueLabel.format`.
The Mood slider draws its ticks with `renderTick` and names the value in
its hover label.

Drag the Opening hours thumbs: `limits` keeps the opening time between
06:00 and 12:00 and the closing time between 14:00 and 22:00, beyond the
slider's own 0 to 24 range. Check `limits.startFixed` and the start thumb
no longer moves.
