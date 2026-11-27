---
title: Selection, keyboard, clipboard and menus
description: Cell range selection kept in one day column, event selection with Ctrl / Cmd and Shift, a roving-tabindex grid with remapped navigation shortcuts, clipboard copy, cut and paste, a context menu on cells and events, and event tooltips with one suppressed.
category: calendars
---

Drag over free slots (or Shift+click) to select a time range; it stays in
one day column (`cellSelectionRows={false}`). Click an event to select it,
Ctrl / Cmd + click to add another, Shift + click for every event in
between. Tab into the week: it is one tab stop; the arrow keys move between
cells and events, Home / End go to the row ends, Enter opens the quick
info, Alt+1..4 switch views, and Alt+PageDown / Alt+PageUp (remapped
through `keyBindings`, besides Ctrl / Cmd + arrows) change the week. With
events selected, Ctrl / Cmd + C copies, Ctrl / Cmd + X cuts, and Ctrl /
Cmd + V pastes at the selected or focused cell; `onBeforePaste` renames
copies. Right-click (or Shift+F10 on a focused item) for the context menu;
"Duplicate to next day" is a custom item. Hover or focus an event for its
tooltip; the private appointment has none (`onBeforeTooltipOpen`).
