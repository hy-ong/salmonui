---
title: Copy and paste
description: Copy a cell range, the selected rows or the focused cell as TSV, with or without headers; paste TSV into batch drafts, skipping read-only cells; raw and display-text copies; `onBeforeCopy` / `onBeforePaste` changing or cancelling the text.
---

Select a range (drag, or Shift+click), then press Ctrl/⌘+C, Ctrl+Shift+H
(with headers), the toolbar Copy button or the context menu Copy item. The
text area shows what reached the clipboard. Click a cell and use “Paste the
text below” (or Ctrl/⌘+V) to paste a block into batch drafts. “Copy with
semicolons” rewrites the text in `onBeforeCopy`; “Cancel pastes” calls
`preventDefault()` in `onBeforePaste`. Served over plain HTTP (no Clipboard
API), copy falls back to the browser's copy command or a dialog, and keyboard
paste keeps working.
