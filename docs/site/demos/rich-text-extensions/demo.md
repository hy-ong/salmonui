---
title: Rich text extensions
description: One engine, two editors - a custom kbd mark and a shared review-stamp command added through the extensions API to RichTextEditor and BlockEditor, and the same engine run headless without React.
category: editors
---

`RichTextEditor` and `BlockEditor` run on one engine module. Two extensions
are plain objects:

- `kbd` adds a `<kbd>` mark with a `toggleKbd` command, a Ctrl+Shift+K
  (Cmd+Shift+K) key binding, a toolbar item and an `html` allow-list entry,
  so the element survives the sanitizer in the HTML value.
- `stamp` adds only a command, `insertStamp`, with Ctrl+Shift+Y
  (Cmd+Shift+Y) and a toolbar item. Both editors take it: the rich text
  editor through its toolbar, the block editor through a custom
  `inlineToolbar` entry that calls `actions.runCommand('insertStamp')`.

The last button loads the engine with `loadRichTextEngine()`, creates it
with the same extensions and no view, runs commands and reads the HTML:
the editing engine works without React or a DOM view.
