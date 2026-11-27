---
title: Event layout and more indicators
description: A busy week with a collapsible, scrollable all-day row, a night shift across midnight in the all-day row or the time slots, a minimum drawn height, a lane limit with +N more and its popover or day navigation, and auto row height.
category: calendars
---

The all-day row of the week shows two lanes and "+N more"; its toggle
expands it (`allDayRowExpanded` / `onAllDayRowExpandedChange`) and, being
`allDayRowScroll`, it scrolls when expanded. The night migration crosses
midnight: switch "Events across midnight" to split it into the time slots.
"Quick check" lasts five minutes but is drawn 20 minutes tall
(`minimumDuration`). In Month and Timeline week, Wednesday and Thursday
overflow: "+N more" opens a popover of the day's events, or the day view
when "+N more opens the day view" is ticked (`event.navigate('day')`).
Tick "Auto row height" to grow the month and timeline rows to fit every
event instead.
