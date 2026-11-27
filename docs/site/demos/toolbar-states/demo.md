---
title: Toolbar states
description: A paragraph toolbar with icon-only buttons that read as text in the overflow menu, a disabled item, a conditionally rendered item, a native onKeyDown that can block roving keys, the whole-toolbar disabled flag and vertical orientation.
category: navigation
---

- Narrow the toolbar with **Width** and open the more button: the
  icon-only alignment buttons show as icons in the bar and as their
  `aria-label` text in the menu. The toolbar sits at the inline end of the
  page, so the menu shifts or flips to stay inside the viewport.
- **Undo** is disabled on its own `Button`; **Show Print** renders or
  drops the Print item (there is no `visible` flag).
- Focus a button and press the arrow keys, Home or End: every key reaches
  the native `onKeyDown` first. With **Block Home and End** it calls
  `preventDefault()` and the roving focus ignores those keys.
- **Disabled** disables every control in the toolbar; **Vertical** sets
  `orientation="vertical"` (ArrowUp and ArrowDown move focus,
  `aria-orientation="vertical"`).
