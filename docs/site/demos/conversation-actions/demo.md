---
title: Team chat with actions and attachments
description: A controlled Conversation with item actions (reply, copy, pin, a custom Forward, delete), reply previews, a pinned bar, forwarded labels, delivery status with retry, quick replies, @ mentions and attachments with a fake upload.
category: chat
---

Hover or focus a message to show its actions, then use the arrow keys
inside the toolbar. Reply quotes the message above the composer (Escape or
the close button cancels it); clicking a quoted preview jumps to the
original. Pin toggles the pinned bar at the top, Forward is a custom action
the demo handles by appending a forwarded copy, and deleting the pinned
message is cancelled in `onItemActionClick` with `preventDefault()`.

Your last message failed to send: Retry calls `onRetry`, which sets the
status to `sending` and then `sent`. Quick replies send their text in one
click. Type `@` to mention a teammate (the mention is sent in
`message.mentions` and rendered as a token). Attach up to
three images, PDFs or text files under 5 MB with the paper-clip button or
by dropping them on the composer: a fake `upload` transport reports
progress for a second and returns a `blob:` URL that the attachment opens.
