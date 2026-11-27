---
title: Rich Text Content
description: Stored HTML rendered read-only by RichTextContent - checklists, a quote and a link kept, the script, event handlers and javascript link removed; the same markup on the server and the client.
category: editors
---

The content is rendered from a stored HTML string through the sanitizer:
the vocabulary of the editors survives, the `onclick`, the `onerror` image
handler, the `javascript:` link and the `<script>` do not. Tick the box to
compare the stored and the sanitized HTML.
