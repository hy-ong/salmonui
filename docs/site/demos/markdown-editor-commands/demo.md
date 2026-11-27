---
title: Markdown editor commands
description: Every MarkdownEditor toolbar command - superscript and subscript, upper and lower case, headings, quotes, inline and fenced code, lists, an image dialog with uploads, a custom item - plus the overflow modes, a syntax override, the ref API and the command events.
category: editors
---

`MarkdownEditor` is a component of its own (no `editorMode`). Select text and
use the toolbar or the shortcuts: Ctrl+Shift+= / Ctrl+= for superscript and
subscript (`<sup>` / `<sub>`), Ctrl+Shift+U / Ctrl+Shift+L for upper and
lower case, the Heading menu for `#` levels, Blockquote, inline code and a
fenced code block, Ctrl+Shift+O / Ctrl+Alt+O for numbered and bulleted
lists (Enter continues a list, Enter on an empty item ends it). Use Cmd
instead of Ctrl on a Mac.

The Image item (or Ctrl+Shift+I) opens a dialog with a URL, alternative text
and, because `onUpload` is set, a file field; pasting an image file into the
textarea uploads it too. Text pastes, cuts and copies are the browser's own.
The last toolbar item is a custom item that inserts a signature.

Switch the overflow mode (`menu`, `wrap`, `scroll`) and tick "Phone width" to
see items move into the More menu, wrap or scroll. The `syntax` checkbox
switches bold to `__`, bullets to `* ` and numbers to `1)`. The buttons below
call the `ref` API (`runCommand`, `wrapSelection`, `insertText`,
`getSelection`, `setSelection`, `focus`); the log shows `onBeforeCommand`
(tick the box to cancel heading commands), `onCommand`, `onFocus` and
`onBlur`.

Keyboard: Alt+F10 (Option+F10) moves to the toolbar, arrows move between
items, Escape returns to the textarea or closes a menu or dialog, and Tab
leaves the editor.
