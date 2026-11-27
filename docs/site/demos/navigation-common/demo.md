---
title: Navigation common behavior
description: Breadcrumbs, Tabs and a Pager sharing the category rules - a right-to-left switch, English or German localeText, className, style and data attributes on the root, a ReactNode icon, render props, keyboard support and server rendering.
category: navigation
---

- **Right to left** sets `dir="rtl"` on a wrapper; there is no
  `enableRtl`. The separators, the tab scroll buttons and the Pager's
  arrows mirror, and the arrow keys follow the visual direction.
- **Language** swaps each component's `localeText` partial (the
  breadcrumb landmark name, the tab scroll button names, the Pager button
  names and info text) and the Pager's `locale` for number formatting.
- The Breadcrumbs root takes `className`, `style` and a `data-section`
  attribute like any element; the home item's `icon` is a decorative
  `ReactNode`.
- The second crumb uses `render` (a stand-in for a router link) and the
  Pager's info text comes from `renderInfo(ctx)`: render props receive a
  stable context and return a node.
- Keyboard: Tab through the links, the tab list (arrow keys, Home, End)
  and the Pager buttons. Each component follows its WAI-ARIA APG pattern
  and has named landmarks (`<nav>`, `tablist`).
- Everything above is in the server HTML (view the page source); the
  **Render** readout changes to "hydrated" after hydration, which runs
  without warnings.
