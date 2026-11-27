---
title: Rewrite a selection with InlineAssist
description: An InlineAssist anchored to a textarea with slash commands, a fake streaming adapter (one word every 40 ms, no API key), Stop, and Accept, Discard and Retry on the finished response.
category: chat
---

Select a sentence in the draft and press "Ask AI" (or Ctrl+Space inside
the textarea). The assist opens below the editor with focus in its
prompt. Type a request and press Enter, or type `/` to filter the
commands and pick one with the arrow keys. The adapter is an async
generator in the demo file that yields one word at a time, so you can
watch the response stream in and press Stop to keep a partial answer.

Accept replaces the selection through `setRangeText`, so undo and form
libraries see a normal edit, and focus returns to the textarea. Discard
drops the response and Retry asks again. Escape or a click outside closes
the assist. The event log shows `onOpenChange` with its `reason`,
`onSend`, `onCommandSelect` and `onMessagesChange`.
