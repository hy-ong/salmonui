---
title: Recurrence options, rules and DST
description: A RecurrenceEditor that starts on Weekly with French labels, until-date bounds and a long date format, RTL, rule parsing with error results for unsupported parts, exceptions and occurrences that keep 09:30 across the Berlin DST change.
category: calendars
---

The editor starts on Weekly (`defaultFrequency`) anchored at Monday
2 March 2026 (`start`), so the Monday button is pressed. Tab through it:
every control is labelled, and the arrow keys move between the weekday
toggle buttons. Choose an end date: the until picker stops at 2 March and
31 December (`min`, `max`) and shows the date in the long format. The list
expands the rule in Europe/Berlin with two exceptions; occurrences after
29 March stay at 09:30 local time although the UTC offset changes. Type
`BYHOUR=9` or `COUNT=3;UNTIL=20261231` into the parse field to see an error
result instead of a silently dropped part. Untick "French labels" for
en-GB, tick "Right to left" to mirror the rows.
