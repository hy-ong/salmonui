---
title: Rich text media, code, import and AI
description: RichTextEditor inserts - audio and video from a URL or an upload, allow-listed embeds, a code block with an application highlight hook, an application file browser, file import, HTML export and a streaming, provider-agnostic AI assistant.
category: editors
---

- **Audio and video**: the Audio and Video items open a dialog for a URL or
  a file (`onUpload` turns files into object URLs here); "Insert the
  generated tone" inserts a WAV made in the browser through
  `commands.insertAudio`. Both render with native controls. Embed accepts
  only `www.youtube-nocookie.com` and `player.vimeo.com` (`embedHosts`).
- **Code block**: the TypeScript block is colored by a ten-line `highlight`
  hook that returns class ranges; pick another language from the block's
  language list.
- **File browser**: in the Image or Audio dialog press "Browse files". The
  editor calls `onBrowseFiles(kind)` and this page answers with its own
  modal list of generated assets; any file picker or asset manager can
  answer the same way.
- **Import and export**: the Import item reads a `.txt`, `.md` or `.html`
  file through `onImport`, which returns HTML (plain text becomes
  paragraphs); "Export HTML" downloads `actionsRef.current.getHtml()`. Word
  and PDF conversion belong on a server.
- **AI assistant**: select some text (or not), press the assistant item and
  send a prompt. The answer streams from an async generator into a pending
  insert you accept or discard; no model or provider is built in.
