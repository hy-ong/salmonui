---
title: Long history with load on demand
description: A virtualized Conversation with 2,000 messages, 600 older ones that load on demand as you scroll up, the jump-to-latest button with an unread count, autoScroll modes and the ConversationApi.
category: chat
---

The feed starts with 2,000 messages but mounts only the items near the
viewport. Scroll up: when the top is within one viewport, `onLoadOlder`
runs and the demo prepends 100 older messages after 600 ms, keeping the
visible message in place, until the 600 archived messages are loaded.

Scroll away from the bottom and press "Receive a message": with
`autoScroll="whenAtBottom"` the view stays put and the jump button shows
the unread count; `always` follows every message and `never` never moves.
"Go to message 1,001" calls `api.scrollToMessage('h1000', { focus: true })`
on an item that is not mounted, and "Focus composer" calls `api.focus()`.
