---
title: Formats, locales and time zones
description: Pattern and Intl display formats, extra input formats for typing and paste, German strings through localeText, a Date value in Asia/Tokyo, seconds with a 12-hour clock, a New York DST gap and a calendar week rule.
category: calendars
---

Type `23.11.2026` or `20261123` over the invoice date, or paste either:
`inputFormats` parses them and the field keeps its `dd/MM/yyyy` display.
The German picker takes its month names from `Intl` and its button labels
from `localeText`. "Call in Tokyo" is given a `Date` instant and shows it
as wall time in `Asia/Tokyo`; ISO strings with or without an offset work the
same way. "Deploy at" adds a seconds segment and an AM/PM segment and takes
every `DatePicker` prop (`strict`, `clearable`, `inputFormats`). On the DST
day, set the hour to 2: the nonexistent wall time resolves forward and
`details.iso` switches from `-05:00` to `-04:00`. The panel prints the
value's `String()` and `JSON.stringify()` forms: plain, frozen ISO values.
Switch the week rule to see the week numbers of January 2027 change.
