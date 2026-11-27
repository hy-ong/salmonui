---
title: JavaScript PDF Library
description: Integration guide - Salmon UI is a component library and ships no PDF document SDK; create, merge, fill, sign or redact PDFs with a library your application chooses, then show the result with PdfViewer.
category: Integration guides
order: 73
---

Creating and editing PDF files is the job of a UI-less document SDK, not a
React component. Salmon UI is a component library and ships no PDF
document SDK. Digital signatures and encryption in particular carry
cryptography and compliance risk that a UI library should not own.

What to use instead:

| Task | Use |
| --- | --- |
| Create and edit PDFs, merge and split, fill and flatten forms, add annotations | A PDF library chosen by your application, for example `pdf-lib` (reported MIT; check its maintenance and license), or a server-side tool |
| Encryption and permissions, digital signatures and verification | A server-side signing service or library with the compliance your domain needs |
| Redaction | A server-side tool that removes the content (not just covers it) |
| Text extraction | pdf.js `getTextContent()` (the engine of `PdfViewer`) or a server-side extractor |
| Show the result, fill forms, highlight text, print, download | [`PdfViewer`](/docs/editors/pdf-viewer) |
| A PDF of a Data Grid | `@salmonui/export/pdf` ([Export](/docs/data-grid/export)) |

A typical flow: build or modify the document with your library, produce a
`Uint8Array`, and pass it to `PdfViewer` as `src`:

```tsx
import { PDFDocument } from 'pdf-lib';
import { PdfViewer } from '@salmonui/pdf-viewer';
import '@salmonui/pdf-viewer/styles.css';

const merged = await PDFDocument.create();
for (const bytes of files) {
  const doc = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(doc, doc.getPageIndices());
  pages.forEach((page) => merged.addPage(page));
}
const data = await merged.save();

<PdfViewer src={data} aria-label="Merged document" />;
```

The snippet is illustrative and not built; `pdf-lib` is not a dependency of
any Salmon UI package.
