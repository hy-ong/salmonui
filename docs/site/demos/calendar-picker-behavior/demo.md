---
title: Field states, popup control and events
description: Disabled, read-only, placeholder, pick-only and open-on-focus pickers; a controlled popup that can veto opening; ref open, close, focus and blur; focus, view and value events; placeholderValue seeds; RTL.
category: calendars
---

Alt+ArrowDown opens a popup, Alt+ArrowUp or Escape closes it and focus
returns to the field. The first picker's `open` is controlled: tick "Keep
the popup closed" and the trigger, Alt+ArrowDown and `ref.open()` only log a
vetoed `onOpenChange`. Click the month heading to move to the year view
(`onViewChange`). "Pick from the calendar only" has read-only segments and
opens on a click; "Opens on focus" opens when you Tab into it. The meeting
and reminder fields have no value: `placeholderValue` seeds the segments and
positions the time list at 13:00 and 18:00. In the reminder's list, Up,
Down, Home, End and type-ahead move the active option while focus stays in
the field. The first field passes `className` and `style` to its root and `title`
and `data-testid` to the field group. "Right to left" mirrors the layout and the arrow
keys.
