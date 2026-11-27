---
title: Tree View interaction
description: A handbook tree with long wrapping labels, a switch for what expands a parent, full-row or label-only highlight, an onItemClick log and a native onKeyDown that can skip the built-in keys.
category: navigation
---

- **Expand on** sets `expandOn`: `auto` (double-click with a mouse, tap on
  touch), `click`, `doubleClick`, or `none` (only the twisty and the
  arrow keys expand).
- **Row highlight** `full` paints hover and
  selection across the whole row, `label` only behind the label.
- **Wrap text** sets `textWrap`: long titles wrap onto more lines and the
  rows take their measured heights; off, they are cut with an ellipsis.
- Every click on a row logs `onItemClick({ id, item, source })`
  for any click handling.
- Focus the tree and press keys: the native `onKeyDown` sees each key
  first. With **Skip built-in Enter** it calls
  `preventDefault()` on Enter and the item is not selected or activated.
