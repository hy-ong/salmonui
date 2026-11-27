---
title: Mentions and custom items in an assistant
description: An assistant Conversation whose composer mentions teammates through the Dropdowns Mention (one cancelled by onBeforeMentionSelect), an adapter that reads message.mentions, and renderItem decorating items with the default item and Conversation.Item.
category: chat
---

Type `@` in the composer to open the teammate list, filter it by typing a
name and pick one with the arrow keys and Enter (or a click). The mention is
inserted as `@Name` and, when the prompt is sent, its user id travels in
`message.mentions`: the event log shows it from `onSend`, the sent prompt
renders the name as a mention token, and the fake adapter reads it to
answer. Picking Linus Pauling is cancelled in `onBeforeMentionSelect`
with `preventDefault()` because he is away; `onMentionSelect` logs every
mention that is inserted. The mention list is the Dropdowns `Mention`
component, loaded after hydration only when `mentions` is set.

`renderItem({ message, index, defaultItem })` customizes items without
rebuilding them: the welcome message (index 0) is a `Conversation.Item`
whose children replace the plain text with richer content, prompts that
mention someone get a "Shared with" line under `defaultItem`, and every
other item returns `defaultItem` unchanged. The item keeps its avatar,
name, time, actions and the feed's accessible labelling either way.
