---
title: Time zones, languages and calendars
description: Events stored with their own IANA zones shown in a zone you pick, a zone list in the editor, the time zone helper functions, German strings through localeText, and Arabic with the Islamic calendar right to left.
category: calendars
---

The Berlin, New York and Tokyo meetings store wall times with their own
`startTimeZone` / `endTimeZone`; the release is a UTC instant. Change
"Show in" and every event moves to its wall time in that zone. Double click
an event: the editor has start and end time zone fields offering the
`timeZones` list. The line under the Scheduler uses the pure helpers
`toZonedDateTime` and `getTimeZoneOffset` on the release instant. Switch the
language: German takes its names from `Intl` and its labels from
`localeText`; Arabic uses the Umm al-Qura Islamic calendar for dates and
lays the Scheduler out right to left, with mirrored arrows.
