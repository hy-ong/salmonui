---
title: Alert Dialog
description: A destructive confirm AlertDialog with an icon and an async confirm, an async publish whose first attempt fails and shows its error, useConfirm through DialogProvider, a one-action alert, and a draggable prompt at the top that returns its form data.
category: layout
---

Each dialog has `role="alertdialog"`. The confirm dialogs focus Cancel or
Keep first (the least destructive action); the alert has one action, which
takes the focus. A backdrop press never closes them, and Escape cancels.
Rename is a prompt: Enter submits its form and `onConfirm` receives the
`FormData`; it also takes Dialog options (`placement="top"`, `draggable`,
`closeButton`). Focus returns to the button that opened the dialog.

Publish fails on its first attempt: while the promise is pending the
confirm button shows its loading state, Cancel is disabled and Escape is
ignored; the rejection keeps the dialog open and shows the Error message
in a `role="alert"` region above the actions. Confirm again to succeed.
