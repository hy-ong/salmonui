---
title: Inline rich text toolbar
description: RichTextEditor in inline mode - toolbar="floating" shows a toolbar over the selection with links, the format painter and the emoji picker; the link quick toolbar opens, edits and removes links.
category: editors
---

`toolbar="floating"` is the inline mode with minimal chrome: select text and its toolbar appears over the
selection. The item list comes from `quickToolbars.text`.

- **Links**: select a word and press Link (or Ctrl+K / Cmd+K) to insert one;
  the dialog has the text, the URL and "Open in a new window". Put the caret
  in "changelog" for the link quick toolbar: open, edit, remove.
- **Format painter**: select the bold italic words, press the painter, then
  select the plain words to copy the format once. A double click on the
  painter keeps it on until Escape.
- **Emoji**: press the emoji item, or type `:` and a word (`:rocket`). The
  list here is a short `emojiList`; without it the full list loads lazily.

The log shows `onBeforePopupOpen`, `onCommand` and `onDialogClose`.
