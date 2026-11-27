---
title: Paste cleanup and sanitizing
description: RichTextEditor paste cleanup - Word and Google Docs clipboard HTML normalized in clean, keep, plain text and prompt modes, denied tags, keepWordFormatting, and the always-on sanitizer removing scripts, handlers and unsafe URLs with a restriction-only sanitize hook.
category: editors
---

The three buttons paste clipboard HTML into the editor as a real paste
event: a Word fragment (`Mso*` classes, `o:p`, `mso-list` paragraphs), a
Google Docs fragment (the `docs-internal-guid` wrapper and styled spans) and
an unsafe fragment. Paste from Word, Google Docs or a web page yourself to
compare. The HTML below the editor is what the editor keeps.

- `clean` (default) turns the Word list into a real `<ol>` and keeps bold,
  italic and links while dropping fonts, sizes and colors;
  `keepWordFormatting` keeps the Word and Google Docs formatting too.
- `keep` keeps everything the vocabulary allows; `plainText` keeps
  paragraphs only; `prompt` asks each time.
- `deniedTags: ['a']` unwraps links and keeps their text.
- Whatever the mode, the sanitizer removes the `<script>`, the `onclick`
  and `onerror` handlers, the `javascript:` link, the `<iframe>` (its host
  is not in `embedHosts`) and the `url()` style; it cannot be turned off.
  The `sanitize` hook can only restrict further: ticked, it drops
  `target="_blank"` from links.
