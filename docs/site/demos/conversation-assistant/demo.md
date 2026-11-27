---
title: AI assistant with streaming, parts and alternatives
description: A Conversation with variant="assistant" over a fake streaming adapter - reasoning and a tool call stream before the answer, Stop, prompt suggestions, regenerate with previous / next responses, feedback, edit, a clearable composer, dictation and an application Markdown renderer.
category: chat
---

Pick a suggestion or type a prompt and press Enter. The adapter in the demo
file is a local async generator (no provider and no API key): it waits for
a moment, so the pending skeleton shows, then streams three reasoning
deltas into the collapsed "Reasoning" disclosure, runs a `search` tool part
and finally yields the answer word by word. Press Stop (it replaces Send)
to cut it short.

Hover a response for its toolbar: Copy, Regenerate (the previous text
becomes an alternative, browse it with the arrows) and the Helpful / Not
helpful toggles. A prompt's toolbar has Edit, which copies the prompt back
into the composer. `renderContent` is a ten-line application renderer that
turns `**bold**` into `<strong>` nodes; the event log shows `onSend`,
`onStop`, `onItemActionClick`, `onReasoningClick` and `onMessagesChange`
with its `reason`.
