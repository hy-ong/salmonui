---
title: DOCX Editor
description: Integration guide - edit Word documents by embedding ONLYOFFICE Docs or Collabora Online next to Salmon UI components; Salmon UI ships no DOCX component and no private document format.
category: Integration guides
order: 70
---

Salmon UI has no DOCX editor. A faithful paginated Word
editor is a layout engine plus OOXML round-tripping, and no
permissive-license one exists to build on; Salmon UI does not invent a
private document format. This page describes how to provide the DOCX
capabilities with an embedded document editor.

Pick one of two paths:

| Need | Use |
| --- | --- |
| Real Word documents: pagination, sections, headers and footers, track changes, comments, fields, DOC / RTF / ODT | A document server you host: **ONLYOFFICE Docs** or **Collabora Online**, embedded in an `<iframe>` |
| Rich text that does not need pages | [`RichTextEditor`](/docs/editors/rich-text-editor) (HTML value) or [`BlockEditor`](/docs/editors/block-editor), converting DOCX on your side |

Both document servers are separate products with their own licenses
(reported AGPL-3.0 for the ONLYOFFICE Docs community edition and MPL-2.0 for
Collabora Online; commercial editions exist). Check the license against how
you deploy before adopting one. Nothing on this page adds a dependency to a
Salmon UI package, and the snippets below are illustrative, not built.

## Architecture

1. Your application stores the `.docx` files and exposes two endpoints: a
   download URL the document server can fetch, and a save callback the
   document server calls when the user saves or closes.
2. The document server (a container you run) renders the editor in an
   iframe, keeps the editing session and, for co-editing, merges changes
   between users.
3. Your page embeds the iframe and surrounds it with Salmon UI chrome:
   `Toolbar`, `Breadcrumbs`, `Dialog`, `Toast` for save notifications,
   `SidebarLayout` for a file list.

The editor UI inside the iframe (ribbon, formatting, tables, images, track
changes, comments, find and replace, spell check, protection, print) is the
document server's, so map to that product,
not to Salmon UI props.

## ONLYOFFICE Docs

ONLYOFFICE loads `api.js` from your document server and creates the editor
in a placeholder element. Sign the config with the JWT secret configured on
the server, on your server, never in the browser.

```tsx
'use client';
import { useEffect, useId } from 'react';

declare global {
  interface Window { DocsAPI?: { DocEditor: new (id: string, config: object) => { destroyEditor(): void } } }
}

export function DocxEditor({ serverUrl, config }: { serverUrl: string; config: object }) {
  const id = useId().replace(/:/g, '');
  useEffect(() => {
    let editor: { destroyEditor(): void } | undefined;
    const script = document.createElement('script');
    script.src = `${serverUrl}/web-apps/apps/api/documents/api.js`;
    script.onload = () => { editor = new window.DocsAPI!.DocEditor(id, config); };
    document.head.append(script);
    return () => { editor?.destroyEditor(); script.remove(); };
  }, [serverUrl, config, id]);
  return <div id={id} style={{ height: '80vh' }} />;
}
```

`config` comes from your server and names the document (`document.url`, a
stable `document.key` per version, `documentType: 'word'`), the user, the
permissions (`edit`, `comment`, `review` for track changes) and
`editorConfig.callbackUrl`, the save endpoint. The callback receives a
status and a URL of the saved file; download it and store it as the new
version.

## Collabora Online

Collabora implements the WOPI protocol. Your server exposes the WOPI
endpoints (`CheckFileInfo`, `GetFile`, `PutFile`) for a file id and hands
the page an access token; the page posts a form into an iframe.

```tsx
export function CollaboraFrame({ actionUrl, wopiSrc, accessToken }: { actionUrl: string; wopiSrc: string; accessToken: string }) {
  return (
    <>
      <form id="collabora-form" action={`${actionUrl}WOPISrc=${encodeURIComponent(wopiSrc)}`} method="post" target="collabora">
        <input type="hidden" name="access_token" value={accessToken} />
      </form>
      <iframe name="collabora" title="Document editor" style={{ width: '100%', height: '80vh', border: 0 }} />
    </>
  );
}
// After mount: document.getElementById('collabora-form')?.requestSubmit();
```

`actionUrl` is read from the server's discovery XML for the `docx` action.
`PutFile` is the save path.

## Without pagination: `RichTextEditor`

When users write content that is not printed as pages (articles, notes,
emails, knowledge-base entries), use `RichTextEditor` and convert DOCX on
your side: import with a converter such as `mammoth` (reported BSD-2) on the
server, sanitize, and pass the HTML as `value`; export with a writer such as
`docx` (reported MIT). The conversion is lossy (no pages, sections or
tracked changes) and is your application's code; a built-in lossy interop
subpath is not included.

## Capabilities

| Capability | Where it comes from |
| --- | --- |
| Editor UI: ribbon, properties pane | The document server's editor UI in an iframe; Salmon UI chrome around it |
| Open and save | The document server reads and writes DOCX directly; your save callback stores it |
| Character, paragraph, styles, lists, page setup, sections, headers and footers, tables, images, fields, form fields | Document server features |
| Comments, track changes, find and replace, spell check, protection | Document server features (permissions in its config) |
| Clipboard, undo and redo, context menu, zoom, print and export | Document server features |
| Paginated layout | Document server layout |
| Collaborative editing | Document server co-editing |
| Localization, RTL, styling, persistence | The document server's `lang` and UI options; persistence is your storage |
