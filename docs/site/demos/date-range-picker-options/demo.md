---
title: Range options and paste
description: A custom separator that also splits pasted text, onRangeSelect before Apply, getRangeDays, a month range picker, strict quarter bounds and weekends and holidays that block or allow a range.
category: calendars
---

Copy the text `2026-12-01 → 2026-12-11` and paste it into either Sprint
field: the picker splits it on the separator and fills both ends. In the
popup, the second click fires `onRangeSelect` before you press Apply. With
the popup open, Alt+ArrowRight and Alt+ArrowLeft move between the calendars
and the Apply / Cancel buttons. "Working days off" cannot span a disabled
day until "Allow ranges" is ticked. "Reporting months" picks months from
the year view (`granularity="month"`). In the Q1 picker, type a date in
April and leave the field: `strict` clamps it to 31 March.
