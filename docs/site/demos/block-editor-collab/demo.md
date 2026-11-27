---
title: Block Editor collaboration
description: Two BlockEditors on one shared Yjs document through @salmonui/rich-text/collab - live edits, remote cursors with names and colors, per-user undo, a seeded document and its HTML read back.
category: editors
---

Ana and Ben each have a `BlockEditor` with the `createCollaboration`
extension on their own `Y.Doc` and `Awareness`; this page connects the two
documents with update events where a real application would use a provider
such as y-websocket. Type in one editor and the text appears in the other;
click into both to see the remote cursor with the other user's name and
color. Ctrl+Z (Cmd+Z) undoes only the changes made in that editor.

The document is seeded once with `seedCollaborationDoc(doc, html)`, and
`collaborationDocToHtml(doc)` reads the shared state back as sanitized HTML
(for server rendering or persistence). The Yjs documents exist only in the
browser, so the server renders the seed read-only while the editors load.
