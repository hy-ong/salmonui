---
title: Fields in a form
description: Uncontrolled text, masked, number, radio, checkbox, switch, range slider, rating and signature fields in a native form - names and values submitted through FormData, a required incomplete mask blocking the submit, and a form reset restoring every default.
category: inputs
---

Submit the form: the log lists the `FormData` entries, read straight from
the native form. Custom-drawn controls submit through native inputs: the
range slider's `name` appears twice (one native range input per thumb), the
rating submits its checked radio, the checkbox and switch submit their
`value` only while on, and a drawn signature submits a PNG data URL.

Switch the MaskedField's `submitValue` between `raw` and `masked` and
submit again. Delete a digit of the phone number and submit: the incomplete
required mask is invalid, the submit is blocked and focus moves to the
field. Change anything and press Reset: every field returns to its
`defaultValue` and the shown errors clear.

The demo is server-rendered with identical server and client markup (ids
come from `useId`): view the page source, or turn JavaScript off and
reload, and the labelled fields are already there and the form still
submits natively.
