---
title: Controlled form validation
description: Check-in and check-out pickers bound to external form state with a cross-field rule, invalid and errorMessage, onBlur touch tracking, onInvalid from native constraint validation and ref.focus() on the first error.
category: calendars
---

Press Book with empty fields: both pickers turn invalid, show their error
message and focus moves to the first invalid one through `ref.focus()`.
Choose a check-out on or before the check-in to see the cross-field rule.
The values live in the form's own state (`value` / `onValueChange`); "Clear
from outside" and "Reset check-in" change that state and the counter shows
that `onValueChange` does not echo programmatic changes. "Check native
validity" runs the browser's constraint validation: the required check-in
fires `onInvalid`, and an arrival typed outside 14:00 to 22:00 is reported
too.
