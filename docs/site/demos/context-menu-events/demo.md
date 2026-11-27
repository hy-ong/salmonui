---
title: Context menu events
description: A document context menu with rich MenuItem children, entries the application renders per state, onOpenChange and a cancellable onBeforeClose in a log, hover or click submenus with a hover delay, and a 60-entry submenu that scrolls.
category: navigation
---

- Each entry's children are any `ReactNode`: a label, a hint line and a
  shortcut (`textValue` keeps typeahead working).
- **Text selected** adds Cut and Copy: the application renders the entries
  it wants, so entries depend on any application state.
- The log shows `onOpenChange(open, { reason, source })`. With **Refuse
  outside close** on, `onBeforeClose` calls `preventDefault()` for an
  outside press, so only Escape, Tab or an action closes the menu.
- **Submenus open on** switches `submenuOpen` between hover and click;
  **Hover delay** sets `hoverDelay` (default 200 ms) before a hovered
  submenu opens.
- **Insert symbol** has 60 entries: the submenu caps its height to the
  viewport and scrolls.
