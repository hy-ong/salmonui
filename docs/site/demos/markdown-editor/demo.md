---
title: Markdown editor
description: A Markdown textarea with a formatting toolbar, keyboard shortcuts, link / image / table dialogs, a split preview from an app-supplied renderer, a character count and fullscreen.
category: editors
---

Select text and press a toolbar button or a shortcut (Ctrl+B, Ctrl+I, Ctrl+K
for a link). Lists continue when you press Enter. Ctrl+Z undoes a toolbar
command like typing. The preview on the right is rendered by a tiny
application function (headings, bold, italics and line breaks only); a real
application passes `marked` or `markdown-it` output to `renderPreview`. Alt+F10
moves focus to the toolbar.
