---
title: Select events and methods
description: onValueChange and onOpenChange with their reason and source, a change vetoed by a controlled value, a controlled open state, focus through the ref, the loading state, the placeholder and the full-screen sheet popup.
category: dropdowns
---

The placeholder shows until a plan is chosen. Use the keyboard on the
trigger (Alt+Down, Arrow keys, Home / End, Page Up / Down, Enter, Escape,
Tab) and watch the log: every change reports its `reason`, `source` and
`previousValue`. Picking "Enterprise" is vetoed: the handler does not apply
it, so the value stays. "Open the list" sets the controlled `open`, "Focus
the Select" calls `focus()` on the `ref`, and "Loading" sets the `loading`
prop (the list shows the loading state and `aria-busy`). Inspect the trigger
to see `aria-expanded`, `aria-controls` and `aria-activedescendant` change.
The time zone Select uses `popupMode="sheet"`: a full-screen dialog with a
search field.
