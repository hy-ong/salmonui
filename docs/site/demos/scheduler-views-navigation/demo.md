---
title: Views, navigation and work hours
description: Day, week, work week, a custom 3-day view and a read-only month with per-view options, controlled view and date, a cancellable navigation, min and max, visible and work hours, time scale, week numbers, header items and the date range text.
category: calendars
---

Switch views in the header: Week shows 07:00 to 21:00 (a per-view
`startHour` / `endHour`), the other day views 06:00 to 22:00; "3 days" is a
`{ type: 'day', interval: 3 }` entry, and Month is read-only and shows two
event lanes per day. Click the date range text to pick a date from the
header calendar; navigation and that calendar stop at 1 November 2026 and
31 January 2027. Tick "Cancel navigation" and press Next until December:
`onBeforeNavigate` cancels it. Work hours (08:30 to 17:30) are highlighted;
"Friday works 12:00 to 16:00" overrides one day through
`api.setWorkHours`. Untick "Show weekend" to drop Saturday and Sunday from
the week and month, and change the slot length (`timeScale`). Week numbers
follow the ISO rule from Monday, dates use `dateFormat` and times a 24-hour
clock. The current time marker appears only when today is in view, and
only after hydration. "Next review" is a custom header item.
