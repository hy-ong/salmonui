---
title: Inline rich text
description: Rich text editing in place as a composition - InlineEdit with RichTextEditor as its editor and RichTextContent rendering the saved HTML as the preview.
category: editors
---

Click the description to edit it with `RichTextEditor`; format some text and
press Save. The preview is `RichTextContent`, which renders the stored HTML
through the sanitizer on the server and the client. `saveOnEnter={false}`
keeps Enter for new paragraphs and `blurAction="keep"` lets the editor's own
link dialog take focus without saving. Escape (outside a dialog) or Cancel
discards the draft.
