---
title: PPTX Editor
description: Integration guide - show PowerPoint decks by converting PPTX to PDF on the server (LibreOffice headless or a document server) and viewing the result with PdfViewer, including a one-slide-at-a-time slide show.
category: Integration guides
order: 71
---

Salmon UI has no PPTX component. Rendering PowerPoint in the
browser means DrawingML shapes, theme and layout inheritance, charts and
embedded fonts. To show a
deck, use a conversion step plus
[`PdfViewer`](/docs/editors/pdf-viewer): convert the deck to PDF once on the
server and display the PDF. This page describes how to provide the PPTX
capabilities that way.

## 1. Convert on the server

Any converter works; two common ones:

- **LibreOffice headless** (MPL-2.0), run in a worker or container:

  ```sh
  soffice --headless --convert-to pdf --outdir /tmp/out deck.pptx
  ```

- **The document server you already run for DOCX** (ONLYOFFICE Docs or
  Collabora Online, see [DOCX Editor](/docs/editors/docx-editor)) through
  its conversion API.

Run the conversion when the file is uploaded, store the PDF next to the
original, and cache it by a hash of the PPTX. Fonts used by the decks must
be installed where the converter runs, or slides fall back to other fonts.
Nothing here is a Salmon UI dependency; the commands are illustrative.

## 2. View with `PdfViewer`

```tsx
import { PdfViewer } from '@salmonui/pdf-viewer';
import '@salmonui/pdf-viewer/styles.css';

<PdfViewer
  src={`/files/${id}/deck.pdf`}
  aria-label="Quarterly review slides"
  defaultZoom="page-fit"
  scrollMode="page"            // one slide at a time
/>
```

- Slide rendering is the converter's output rendered by pdf.js:
  text stays selectable and searchable.
- Thumbnails, zoom and page virtualization are `PdfViewer`'s
  thumbnail panel, `zoom` and virtualized pages.
- A slide show is `scrollMode="page"` in a full-screen container
  (`element.requestFullscreen()`), with the arrow keys and Page Up / Page
  Down moving between pages. Speaker notes are not part of the PDF; export
  them separately (LibreOffice can export a notes view) if you need them.
- Print is `PdfViewer`'s print item. Export back to PPTX is the
  original file: keep it and offer it for download.
- Editing is not provided; for editing, embed the presentation
  editor of a document server as the DOCX guide describes.
- RTL and localization are `PdfViewer`'s `dir` and `localeText`.

## Capabilities

| Capability | Where it comes from |
| --- | --- |
| PPTX rendering | Server conversion to PDF, rendered by `PdfViewer` |
| Thumbnails, zoom, virtualization | `PdfViewer` thumbnails, `zoom`, virtualized pages |
| Ribbon, slide show, speaker notes | `PdfViewer` toolbar; `scrollMode="page"` full screen; notes exported separately |
| Print, export | `PdfViewer` print; download of the original file |
| Editing | A document server's presentation editor |
| RTL, localization | `PdfViewer` `dir`, `localeText` |
