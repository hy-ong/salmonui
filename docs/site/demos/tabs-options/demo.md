---
title: Tabs options
description: Twelve month tabs with icon placement, panelMount (lazy, active, eager), scrollStep for the overflow scroll buttons, the whole-component disabled flag and a live readout of the tablist, tab and tabpanel ARIA wiring.
category: navigation
---

- **Icon placement** moves each tab's decorative icon to the start, end,
  top or bottom of its label (`Tab iconPlacement`).
- **Panel mount**: type into a panel, switch tabs and come back. With
  `lazy` (the default) and `eager` the text survives because visited (or
  all) panels stay mounted; with `active` only the selected panel is
  mounted, so the text is gone.
- **Scroll step**: the twelve tabs overflow the strip, so scroll buttons
  appear; each press scrolls by `scrollStep` pixels.
- **Disabled** sets `disabled` on `Tabs`: every tab becomes
  `aria-disabled` and nothing can be selected.
- The **ARIA** line reads the rendered `aria-orientation`,
  `aria-selected`, `aria-controls` and the panel's `aria-labelledby`.
