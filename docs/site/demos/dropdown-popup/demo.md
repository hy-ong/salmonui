---
title: Popup, type-ahead and remote labels
description: Option icons, popup height and width, type-ahead over a 10,000-item virtual list, typing to filter, remote values labelled without opening the popup, right-to-left placement and the dismissal rules.
category: dropdowns
---

- Status: `getItemIcon` draws a colored dot before each label;
  `maxVisibleItems={3}` makes the popup three options tall and
  `styles.popup` makes it wider than the trigger.
- Code: focus the closed Select and type `W`, then `i`: type-ahead selects
  "Willow 001", about 8,500 items down the virtual list, and opening the
  popup shows it scrolled into view. Typing in the open popup moves the
  active option the same way.
- Word: in a Combobox the text you type is the search text.
- Country: both values live on a remote source that answers after 600 ms.
  The first passes `selectedItems`, so its label is in the server markup;
  the second reads its label once after mount (see the log) without opening
  the popup.
- The right-to-left Select aligns its popup to the inline start (the right
  edge). Scroll the page so a trigger sits near the bottom of the window:
  the popup opens above it.
- Close a popup with Escape, Tab or a press outside it: the log shows the
  reason, and Escape never changes the value.
