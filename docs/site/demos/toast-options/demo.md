---
title: Toast placement, content and events
description: A Toaster over an application-held queue with placement, newest-on-top, scoped-container and right-to-left controls, a custom icon and width, custom content, events with a vetoed close, and a toast raised from non-React code.
category: notifications
---

The queue is an ordinary object created once (`createToastQueue()`), so the
plain `saveDraft(queue)` function adds and updates a toast without any
React code. At most three toasts show (`max={3}`); further toasts wait.
"Reminder" logs `onOpen`, `onClick`, `onBeforeClose` and `onClose`; with
"Keep open" `onBeforeClose` calls `preventDefault()` and the toast stays.
"Custom content" replaces the default layout (`content`). "Inside the
panel" renders the region in the dashed box (`container`). The region is a
labelled landmark (`localeText.notifications`); F6 moves focus into it and
back, and Escape closes a focused dismissible toast. "Right to left" swaps
the logical placements.
