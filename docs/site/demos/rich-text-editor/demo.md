---
title: Rich Text Editor
description: An HTML editor with the default toolbar, quick toolbars, tables, uploads through a callback, mentions, a character limit and the live HTML value.
category: editors
---

Edit the release notes: the toolbar formats text and blocks, a text
selection shows the quick toolbar, `/` opens the block menu, `@` mentions a
person and `:` completes an emoji. Pasted or dropped images go through
`onUpload` (object URLs in this demo). The HTML value below updates after
each batch of edits (`changeDelay`), and the status bar counts characters
against `maxLength`.
