---
title: Mention in rich text
description: Mention chips in a plain contenteditable element through createContentEditableMentionTarget, and in RichTextEditor through its mentions prop.
category: dropdowns
---

Type `@` in the status update: picking a person inserts a non-editable chip
(`<span class="salmon-mention-chip" contenteditable="false">`) and puts the
caret after it; Backspace removes the chip as one unit. The target comes
from `createContentEditableMentionTarget(element)` in `@salmonui/rich-text`,
created after mount. In the meeting notes, `RichTextEditor` builds the
target over its own engine from the `mentions` prop, so `@` there inserts a
mention node.
