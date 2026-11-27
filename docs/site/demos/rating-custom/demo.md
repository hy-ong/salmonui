---
title: Rating icons and minimum
description: Rating with a minimum value, highlightSelectedOnly, custom icon and emptyIcon, and items drawn by renderItem from their index and state.
category: inputs
---

Hotel stars has `min={1}`: one star is the default and the lowest value,
so there is no zero step and the value never drops below one.

The stay rating uses `highlightSelectedOnly` with `renderItem`: only the
chosen face is drawn as full, the others as empty (gray). Spiciness swaps
the star for an `icon` and an `emptyIcon`.
