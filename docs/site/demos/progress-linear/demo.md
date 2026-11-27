---
title: Linear progress
description: Linear Progress bars driven by one slider, with a buffer, a value label and value text, range colors, indeterminate, striped and segmented bars, every tone, a custom range, a German percent label, a pointer event handler and right-to-left.
category: notifications
---

Move the slider: the upload bar changes tone with the value (a `tone`
function), shows the percent (`label`) and a lighter buffer, and its
`aria-valuetext` comes from `valueLabel`. "Indeterminate" sets
`value={null}`: `aria-valuenow` is dropped and the bars animate (a static
partial bar under reduced motion). The striped bar is 12 px thick
(`thickness`), the segmented bar uses `segments` and `size="lg"`, the steps
bar runs from `min` 3 to `max` 12 with a function `label`, and the German
bar formats its percent for `locale="de-DE"`. Point at the upload bar: DOM
event props such as `onPointerEnter` reach the root. "Right to left" fills the bars
from the right.
