---
title: App Bar
description: A header with the salmon-app-bar class around a Toolbar inside a scrolling frame, switching between the default and primary tone, a theme app bar surface, top and bottom position, and sticky or static.
category: navigation
---

The bar is a plain `<header>` (or `<footer>` at the bottom) with
`.salmon-app-bar`; the `Toolbar` inside provides the keyboard model and the
alignment.

Turn **Sticky** on and scroll the frame: `data-sticky` makes the bar
`position: sticky`, pinned to the top (or to the bottom with
`data-position="bottom"`). Off, it scrolls away with the content.

The bar always carries `data-salmon-surface="app-bar"`. Turn **Theme
surface** on to wrap the frame in a theme with `surfaces: { appBar:
'#192225' }`: the bar turns near-black and its buttons and search field
switch to the derived light foreground.
