---
title: Gantt calendars and working time
description: Office hours with a lunch break and a short Friday, Christmas and New Year holidays, shaded weekends, a night-shift and a seven-day calendar per task, a time zone switch, an hour-based duration and work, units and task types.
category: calendars
---

Durations count working time: 09:00 to 12:30 and 13:30 to 18:00 on
weekdays, and only until 13:00 on Friday while "Friday ends at 13:00" is
ticked. Weekends are shaded and the holidays are shaded and skipped, so
"Order parts" stretches over Christmas. The night install uses the `night`
calendar (20:00 to 24:00) and the weekend test run the `sevenDay` calendar,
whose 31 December exception is a half day. Dates are wall times in the
chosen zone: switch the zone and the timeline keeps them. Commissioning is
16 hours of work for two people: with `fixedWork`, change a unit in the
resources column or the work and the duration follows; switch the default
task type to compare `fixedUnit` and `fixedDuration`. The handover lasts
three hours (`durationUnit: 'hour'`); the button prints the formatted
durations and work.
