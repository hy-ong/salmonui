---
title: Theme surfaces
description: A SidebarLayout with a near-black sidebar surface, a white app bar surface and a primary-colored Data Grid header, on a teal-tinted neutral ramp, all from one theme object.
---

The theme sets `surfaces: { sidebar: '#192225', appBar: '#ffffff',
tableHeader: 'primary' }` and `neutral: { chroma: 0.032 }`. The sidebar
panel, the `<header data-salmon-surface="app-bar">` and the grid header
paint their surface and derive readable text, hover, selected, border and
accent colors from it: the sort arrow and the header checkbox stay visible
on the primary header. The `SidebarMenu` in the panel reads
`--salmon-surface-sidebar-fg`, `-muted`, `-hover`, `-selected-bg` and
`-selected-fg`, so its headings, hover and selected item follow the dark
surface.
