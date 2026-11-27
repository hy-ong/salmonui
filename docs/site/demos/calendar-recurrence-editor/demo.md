---
title: RecurrenceEditor
description: A controlled recurrence rule editor that emits an RRULE string, with the next occurrences expanded in Europe/Berlin.
category: calendars
---

Choose a repeat type, the weekdays or the day of the month, and how the
series ends. The editor emits the RRULE string (`null` for "never"); the
list below expands it with `getRecurrenceDates`.
