---
title: Dropdown accessibility
description: A Select, a Combobox with chips and a Listbox with selected, active and disabled options for keyboard, screen reader, forced-colors, touch and server-rendering checks.
category: dropdowns
---

- Focus: Tab to each control and open it. Focus stays on the trigger or
  input while the active option moves (`aria-activedescendant`), returns to
  it after you pick with the pointer, and the focused control shows the
  theme focus ring.
- High contrast: turn on Windows high contrast, or emulate
  `forced-colors: active` in the browser's rendering tools. Selected options
  use `Highlight`, the active option an outline, the disabled "Yellow"
  `GrayText`, and chips and fields keep their borders.
- Contrast: every color comes from the theme variables derived from the five
  seeds; switch the site's color scheme to compare light and dark.
- Touch: options, triggers and chip remove buttons are at least 24 × 24 px,
  and nothing appears on hover only.
- Server rendering: view the page source. It holds the triggers, the value
  labels, the chips and the Listbox options, never a popup.
- The site tests run axe-core over this demo closed and open with zero
  violations (`docs/site/tests/dropdowns.spec.ts`).
