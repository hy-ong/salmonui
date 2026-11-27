---
title: Drag, resize and drop
description: Events that move and resize in 15-minute steps with cancellable start, drop and resize events, several selected events dragged together, backlog items dropped onto slots, events dragged out to a remove area and between two Schedulers, and touch swipe navigation.
category: calendars
---

Drag an event to another time or day; starts and ends snap to 15 minutes.
The audit cannot be dragged (`onEventDragStart` cancels), a drop before
08:00 is refused (`onBeforeEventDrop`) and a resize to more than three
hours snaps back (`onBeforeEventResizeEnd`). Ctrl / Cmd + click two events,
then drag one: both move by the same offset (`dragOptions.multiple`).
Drag a backlog item onto a slot to create an event (`onExternalDrop`), or
drop an event on the dashed area to unschedule it (`onEventDragOut`). Drag
an event into the teammate's week below: both Schedulers share
`dragOptions.group`, so the target adds it and the source removes it. Rest
the pointer at the left or right edge while dragging to move to the
previous or next week. On a touch screen (or with touch emulation), a
quick horizontal swipe changes the week.
