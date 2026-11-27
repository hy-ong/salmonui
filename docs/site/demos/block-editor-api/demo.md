---
title: Block Editor API
description: BlockEditor from code - insert, update, move, turn into and remove blocks through actionsRef, selection and commands, a custom context menu, image upload, highlighted code, a table block, paste events, sanitized HTML import and export, rebound keys, read only, print, right to left and localized menus.
category: editors
---

- **Blocks from code**: the first row of buttons calls `actionsRef`
  (`insertBlocks`, `updateBlock`, `moveBlock`, `turnInto`, `removeBlocks`,
  `getBlock`, `getSelection`, `setSelection` + `focus`, `runCommand`,
  `print`). Each edit is one undo step: press Ctrl+Z (Cmd+Z) or
  `runCommand('undo')` to revert it.
- **Serialization**: `blocksToHtml(getBlocks())` shows the HTML of the
  document; "htmlToBlocks(unsafe HTML)" converts a fragment with an
  `onclick`, an `onerror` image, a `javascript:` link and a `<script>`, and
  inserts what survives the sanitizer.
- **Context menu**: right click a block (or Shift+F10) for cut, copy,
  duplicate, delete, turn into and a custom "Log block id" entry.
- **Images, code and tables**: type `/` and choose Image to pick a file; the
  block stays pending for the one-second `onUpload`. The code block is
  colored by a `highlight` hook and has a language picker; the table block
  takes row, column, merge and header commands from its block menu.
- **Paste**: paste anything to see `onBeforePaste` and `onPaste` in the log;
  tick the box to refuse pastes that carry files.
- **Keys**: `keyBindings` moves Duplicate to Ctrl+Shift+D (Cmd+Shift+D) and
  removes the Ctrl+P print binding.
- **Read only and RTL**: `readOnly` hides the handles and menus; "Right to
  left" moves the handles to the right and switches the menus to Arabic
  `localeText`.
