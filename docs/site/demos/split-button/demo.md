---
title: Split Button
description: A primary action with a grouped menu of alternatives, a named menu trigger and a styled popup part, and a disabled SplitButton.
category: buttons
---

**Save** and its trigger are two tab stops in one `role="group"` named
"Save". The trigger is named by `menuLabel` ("More save options") and carries
`aria-haspopup`, `aria-expanded` and, while open, `aria-controls` and
`data-open`. Enter, Space or ArrowDown on the trigger open the menu, and
Alt+ArrowDown on **Save** opens it too; inside, arrows, Home / End, Enter and
Escape (or Alt+ArrowUp) work as in any menu. The items sit in two labelled
`MenuGroup`s, and `classNames.menu` / `styles.menu` reach the popup part.
