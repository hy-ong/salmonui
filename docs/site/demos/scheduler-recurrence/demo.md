---
title: Recurring series and edit scopes
description: A daily standup with a skipped day and a moved occurrence, the "this event / following / all events" prompt, a scope chosen in onBeforeSave without the prompt, recurrence validation, and getOccurrences, getDeletedOccurrences and getOccurrencesInRange.
category: calendars
---

The standup skips Wednesday 25 November (`recurrenceExceptions`) and
Thursday's occurrence was moved to 10:00 (a row with `recurrenceId`). Drag
an occurrence or delete one: the prompt asks for this event, this and the
following events (`editing.following`) or all events; the rows below show
the exception added, the series split with `UNTIL` and the new linked
series, or the whole series changed. Untick "Ask for the scope" to apply
the chosen scope from `onBeforeSave` / `onBeforeDelete` instead. Open the
1:1 series in the editor and set a daily rule with a duration of two days,
or drag one Tuesday occurrence onto the next Tuesday: recurrence validation
refuses with an alert. The buttons list the occurrences of the standup, its
deleted occurrences and the occurrences of a week.
