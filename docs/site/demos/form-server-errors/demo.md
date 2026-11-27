---
title: Server errors and actions
description: A Form driven by a React 19 action and useActionState - server errors shown as field errors until the value changes, blocking or non-blocking client validation, and a submit button reading useFormStatus.
category: inputs
---

Enter the handle `ada` and a valid address and press "Save profile". The
button reads `useFormStatus()` and shows "Saving…" while the action runs;
the action (a stand-in for a server action, answering after a delay)
returns errors keyed by field name, which `Form validationErrors` shows on
the fields. Edit the handle: its server error disappears as soon as the
value changes.

Clear both fields and submit. With `validationBehavior="native"` the client
rules block the submit and focus the first invalid field; switch to
`"aria"` and the fields are marked invalid but the submit still reaches the
action, which answers with its own errors.
