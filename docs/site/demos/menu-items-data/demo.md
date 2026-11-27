---
title: Menu items from data
description: MenuButtons built from `items` - item icons, a `renderItem` template with counts, a wider popup through `styles.menu`, trigger tone, variant, size and icon, and a custom or hidden open indicator.
category: buttons
---

Each choice reports its stable `id` and the data entry in `onAction`.
**Status** renders every entry through `renderItem` (label plus a count, with
`textValue` keeping typeahead on the label) in a popup widened by
`styles.menu`; its indicator is a custom node, and **Danger zone** hides it
with `indicator={false}`. The highlighted item is styled through
`.salmon-menu-item[data-highlighted]` and the disabled one through
`data-disabled`.
