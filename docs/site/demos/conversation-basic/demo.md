---
title: Support chat with a bot
description: A Conversation with a header toolbar, quick replies, a typing indicator, a composer and a fake bot adapter that streams its replies word by word - Stop, a cancellable send, compact layout and date separators.
category: chat
---

Type a message and press Enter (Shift+Enter adds a line) or pick a quick
reply. The bot is an async generator in the demo file: it shows "Salmon
Support is typing" through `typingUsers` for a moment, then yields one word
every 60 ms, so you can watch the reply stream in and press the Stop
button that replaces Send (or "Stop reply" in the header) to cut it
short. The streamed text is painted once per animation frame outside React
state; the message list changes once, when the reply is complete.

Sending "spam" is cancelled in `onBeforeSend`, so the draft stays in the
composer. The header buttons switch to the compact layout and toggle the
date separators; delete every message with its Delete action to see the
empty state. Timestamps use `timeZone="UTC"` so the server HTML and the
hydrated page agree. The event log shows `onSend`, `onTypingChange` and
`onMessagesChange` with its `reason`.
