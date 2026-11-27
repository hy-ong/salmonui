---
title: Inline edit events and ref
description: A controlled InlineEdit driven from outside - editing / onEditingChange, the ref methods startEdit, validate, save and cancelEdit, a cancellable onBeforeEditStart and every before/after event with its source and trigger.
category: editors
---

The owner field is controlled twice: `value` holds the saved text and
`editing` the edit state, so the toggle button opens and closes the editor
from code. The buttons call the `InlineEditApi`
ref (`mode="inline"` and `blurAction="keep"` keep the editor open in place while you click them): clear the field and press `validate()` to read the error list, or
`save()` to see it refused. Every event lands in the log with its `source`
(`pointer`, `keyboard`, `api`) and its `trigger` (`actions`, `enter`,
`escape`, `blur`, `api`); tick "Veto onBeforeEditStart" to cancel the start.

From the keyboard: Tab to the preview (a button named "Owner: …"), press
Enter or Space to edit, Enter to save, Escape to cancel; focus returns to
the preview.
