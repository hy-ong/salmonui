---
title: Smart paste into a contact form
description: useSmartPaste with two Buttons - one pastes the sample text, one reads the clipboard - filling TextFields, a Checkbox and a TextArea, plus a Select as a custom field, with the pending state and the filled and skipped fields in a log.
category: chat
---

Press "Smart paste the text above" and the form fills in after a moment:
the button shows its loading state (`aria-busy`) while the adapter runs,
and the log lists the filled and skipped fields. Edit the text first to see
how the answer changes, or copy your own text and use "Paste from
clipboard" (the browser asks for permission). The adapter in the demo file
uses regular expressions instead of a model so no API key is involved; a
real one posts the text and the field descriptors to your server. The
"Plan" `Select` is not a native control, so it is passed in `fields` with
its own `fill`. The "Agent" field sits inside `data-salmon-paste="off"` and
is never touched.
