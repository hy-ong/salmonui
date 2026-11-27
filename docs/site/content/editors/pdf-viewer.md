---
title: PDF Viewer
description: PdfViewer from @salmonui/pdf-viewer - a PDF viewer on pdf.js loaded lazily on the client, with virtualized pages, thumbnails, bookmarks, find, zoom, print, text markup annotations, form filling and save, plus server-rendered placeholders.
category: Components
order: 40
demos: [pdf-viewer, pdf-viewer-password, pdf-viewer-api]
---

`PdfViewer` shows PDF documents. It lives in
`@salmonui/pdf-viewer`, the one Salmon UI package that may use pdf.js;
every other package except `@salmonui/rich-text` has no runtime
dependencies.

```tsx
import { PdfViewer } from '@salmonui/pdf-viewer';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/pdf-viewer/styles.css';

<PdfViewer
  src="/files/contract.pdf"
  pageSizes={{ width: 612, height: 792 }}
  pageCount={12}
  defaultZoom="page-width"
  onLoad={(info) => console.log(info.pageCount)}
  style={{ height: 720 }}
/>;
```

The stylesheet carries the menu, toolbar, tree view and dialog rules the
viewer renders. It does not carry the Button rules (that would put it over
its size budget), so import `@salmonui/buttons/button/styles.css` with it,
as above; with `@salmonui/core/styles.css` (the theme, once per app) these
are all the viewer needs. Size the viewer with CSS
`width` and `height` (`style` or `className`); the default height is 600 px.

## Documents and loading

`src` takes a URL (`string` or `URL`), an `ArrayBuffer`, a `Uint8Array` or a
`Blob`. Bytes are copied before they go to the worker, so your buffer is
never detached. Memoize `src`: a new value loads a new document.
`documentOptions` passes extra pdf.js `getDocument()` options
(`cMapUrl`, `standardFontDataUrl`, `wasmUrl`, `withCredentials`,
`httpHeaders`). `onLoad` reports the page count, page sizes, title, outline
and form field names; `onLoadError` reports failures, and the viewer shows
an error state.

pdf.js loads with dynamic `import()` in an effect, so it never reaches a
server render or an initial bundle. Its worker is a module worker the
package starts with
`new Worker(new URL('./engine/pdf-worker.js', import.meta.url), { type: 'module' })`;
Vite, webpack 5, Rollup and Turbopack emit it as a worker chunk. To serve
another worker file, pass `workerSrc` (a URL of a pdf.js worker module, for
example `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` in
your own code), or set `GlobalWorkerOptions.workerSrc` / `workerPort` of
`pdfjs-dist` yourself. With Vite, keep `@salmonui/pdf-viewer` out of
`optimizeDeps` pre-bundling or pass `workerSrc`.

## Passwords

Encrypted documents open with the `password` prop. Without it, a
built-in dialog asks for the password and says when it was wrong;
`onPasswordRequired({ reason, submit, cancel })` replaces the dialog, with
`reason` `'required'` or `'incorrect'`. Cancelling reports a
`PasswordException` through `onLoadError`.

<!-- demo: pdf-viewer-password -->

## Pages, scrolling and server rendering

Pages render to a canvas at the device pixel ratio with pdf.js's text layer
over it and the annotation layer (links and form fields) on top.
Only the pages near the viewport exist in the DOM: the page boxes are laid
out in rows and virtualized with the Data Grid range math
(`createVariableRowMetrics`, `computeRange` from
`@salmonui/data-grid/engine`), so a 1,000-page document mounts a handful of
pages. Scrolling changes React state only when the set of rendered pages or
the current page changes.

| Prop | Values |
| --- | --- |
| `scrollMode` | `'vertical'` (default), `'horizontal'`, `'wrapped'` (as many pages per row as fit), `'page'` (one page or spread at a time) |
| `spreadMode` | `'none'` (default), `'odd'` (1-2, 3-4), `'even'` (1, 2-3) |

On the server and in the first client render the viewer has no engine, so
it lays out `pageSizes` (PDF points, one size per page, or one size for
`pageCount` pages) against a fixed 816 x 1056 px viewport and renders sized,
labelled placeholders for the pages in that window. The engine then fills
the same page elements after hydration; nothing reads the DOM during
render, so the markup matches. Without `pageSizes`, the server renders the
toolbar and a loading status.

## Toolbar

`toolbar` lists the items: built-in ids `'sidebar'`,
`'previous'`, `'next'`, `'pageNumber'`, `'zoomOut'`, `'zoom'`, `'zoomIn'`,
`'search'`, `'highlight'`, `'underline'`, `'strikethrough'`, `'print'`,
`'download'`, the separator `'|'`, the spacer `'-'`, and custom items
`{ id, label, icon?, disabled?, onSelect(actions), render?(actions) }`. The
default is `PDF_VIEWER_DEFAULT_TOOLBAR`; `toolbar={false}` hides it.
`renderToolbar({ items, actions, state })` replaces the bar: place the
built-in `items` in your own layout or build your own from `actions` and
`state`. The toolbar is the shared [Toolbar](/docs/navigation/toolbar): one tab
stop, arrow keys between controls, and items that do not fit move into a
"More tools" menu below the container width.

## Zoom

`zoom` / `defaultZoom` / `onZoomChange` take a scale (`1` is
100 %, one PDF point = 96/72 CSS px) or `'page-fit'`, `'page-width'`, `'auto'`
(default: portrait pages fit the width up to 125 %, landscape pages fit
whole). `onZoomChange(zoom, { scale, source })` reports the resolved scale.
Zoom in and out with the toolbar, the zoom menu, Ctrl+= / Ctrl+- / Ctrl+0
(Cmd on macOS), Ctrl+wheel or a trackpad pinch, or a two-finger touch pinch.
During a gesture the pages scale with a CSS transform; the zoom commits once
when the gesture ends, and the reading position is kept.

## Navigation and links

`page` / `defaultPage` / `onPageChange(page, { source })` control the
current page; `source` is `'scroll'`, `'toolbar'`, `'keyboard'`,
`'link'`, `'outline'`, `'thumbnail'`, `'search'` or `'api'`. Internal links
and named actions move to their page; external links open in `linkTarget`
(default `'_blank'`) with `rel="noopener noreferrer nofollow"`.
`onLinkClick({ url, page, preventDefault })` runs first; call
`preventDefault()` to handle the link yourself.

## Bookmarks and thumbnails

`sidebar` / `defaultSidebar` / `onSidebarChange` open the side panel with
`'outline'` (the document outline on the shared
[TreeView](/docs/navigation/tree-view)) or `'thumbnails'` (a
virtualized list of page images; the current page is marked with
`aria-current="page"`). The sidebar toolbar button toggles it.
In a viewer at most 480px wide the sidebar overlays the pages, so a
`defaultSidebar` stays closed there until the user opens it (a controlled
`sidebar` is always honoured).

## Find

Ctrl+F (or the Find button) opens the find bar: type to search
every page, Enter / Shift+Enter or the arrow buttons move between matches,
and the options are Match case, Whole words and Highlight all. The current
match scrolls into view; Escape closes the bar and clears the highlights.
`actionsRef.current.search(query, options)` runs a search and resolves
`{ query, total, current, page, pages }`; `onSearchResult` reports every
result.

## Text selection

The text layer is real, transparent text over the canvas, so selection,
copy and screen readers work natively. `textSelection={false}`
turns selection off; find still works.

## Text markup annotations

Select text and press Highlight, Underline or Strikethrough, or
call `actionsRef.current.addTextMarkup(kind, { color, opacity, comment })`.
Annotations are data: `annotations` / `defaultAnnotations` /
`onAnnotationsChange(list, { reason, annotation })` with entries
`{ id, kind, page, rects, color, opacity?, author?, comment?, text?, createdAt? }`.
`rects` are PDF user-space rectangles, one per line, so they do not depend
on the zoom. `annotationAuthor` and `annotationColors` set the defaults;
`removeAnnotation(id)` removes one. They are drawn over the page, printed,
and written into saved documents as `/Highlight`, `/Underline` and
`/StrikeOut` annotations with QuadPoints, an appearance stream and the
comment as `/Contents`.

## Forms

AcroForm fields render as native inputs over the page: text
fields, check boxes, radio buttons, combo and list boxes.
`formValues` / `defaultFormValues` / `onFormValuesChange(values, { name })`
map field names to values (text and choice fields are strings, list boxes
string arrays, check boxes booleans, radio groups the export value of the
chosen button); fields you do not list keep the document's values. XFA
forms are not supported.

## Print, download and save

Print (the toolbar, Ctrl+P or `actionsRef.current.print()`) renders every
page at `printResolution` DPI (default 150) with form values and markup
into an off-screen container that alone prints, then removes it.
`onBeforePrint(event)` runs first; `event.preventDefault()`
cancels. `actionsRef.current.save()` resolves a `Blob` of the document with
the current form values and markup annotations written into it (pdf.js
`saveDocument`, an incremental update), and Download saves that blob as
`fileName` (default `document.pdf`).

## Events and actions

| Callback | When |
| --- | --- |
| `onLoad`, `onLoadError` | The document opened, or failed |
| `onPasswordRequired` | An encrypted document needs a password |
| `onPageChange`, `onZoomChange`, `onSidebarChange` | Navigation and view state |
| `onSearchResult` | A search finished or moved to another match |
| `onAnnotationsChange`, `onFormValuesChange` | Annotation and form edits |
| `onLinkClick`, `onBeforePrint` | Cancellable |

`actionsRef.current`: `goToPage(page)`, `search(query, options)`,
`findNext()`, `findPrevious()`, `clearSearch()`, `setZoom(zoom)`, `print()`,
`save()`, `download(fileName?)`, `addTextMarkup(kind, options)`,
`removeAnnotation(id)`, `openFind(open?)` and `getState()`
(`{ status, page, pageCount, scale, zoom }`).

<!-- demo: pdf-viewer-api -->

## Keyboard and accessibility

The viewer is a labelled region (`aria-label`, default "PDF document") with
a focusable document viewport; each page is a region named "Page n of m",
the canvases are hidden from assistive technology and the text layer
carries the words.

| Key | Action |
| --- | --- |
| Ctrl+F | Open the find bar |
| Ctrl+= / Ctrl+- / Ctrl+0 | Zoom in / out / automatic |
| Ctrl+P | Print |
| n / j, p / k (viewport focused) | Next / previous page |
| Home / End (viewport focused) | First / last page |
| PageDown / PageUp, arrows (`'page'` and `'horizontal'` modes) | Next / previous page (arrows follow `dir`) |
| Arrows, Home / End in the toolbar | Move between toolbar controls |

## Mobile

Below the container width the toolbar overflows into a menu; a two-finger
pinch zooms; coarse pointers get 40 px toolbar targets, and on narrow
containers the sidebar overlays the pages.

## Localization, RTL and styling

`localeText` overrides any string of `PDF_VIEWER_DEFAULT_LOCALE_TEXT`
(`{page}`, `{count}`, `{current}` and `{total}` are placeholders). The
viewer follows the inherited `dir`: the toolbar mirrors and arrow keys
follow the direction. `className` and `style` apply to the root,
`classNames` / `styles` to the `toolbar`, `sidebar`, `viewport` and
`findBar` parts. Classes: `.salmon-pdf-viewer` (`data-status`,
`data-scroll-mode`, `data-sidebar`), `__toolbar`, `__find`, `__sidebar`,
`__thumbnails`, `__viewport`, `__pages`, `__page` (`data-page-number`),
`__markup` (`data-kind`), `__find-match` (`data-current`). Colors come from
the theme variables; the page itself stays white in dark mode.

## Bundle

The viewer's own code is 16 KB gzip initial and about 20 KB with the lazy
engine glue; pdf.js (about 130 KB gzip) and its worker (about 360 KB gzip)
load only when a document opens.

## Design notes

- Rendering runs in the browser with pdf.js, so no rendering
  server or extra engine resources are needed: pass the document as `src`
  (a URL, bytes or a `Blob`).
- Shape, free text, sticky note, stamp, ink, signature and measurement
  annotations and annotation import / export are not included:
  each needs an authoring UI and an object-editing layer outside the
  viewer. Text markup with comments and form filling
 are in; the controlled `annotations` value is the import /
  export format for text markup, so persist it instead of XFDF or JSON
  files, and collect signatures through a form field. Keep the other
  annotation workflows in a server tool.
- The form designer, page organizer and redaction are not included:
  they rewrite the PDF structure and need a PDF write layer
  that pdf.js does not provide (and a redaction that does not remove the
  content is a security risk). Run them on the server or with a PDF library
  of your choice and pass the new document as `src`.
- There is no built-in persistence: components never write to `localStorage`
  on their own, because hidden persistence breaks server rendering
  consistency. Control `page`, `zoom`, `annotations` and `formValues` and
  persist what their change callbacks report.
- Text markup annotations of other PDF tools show on the canvas as drawn
  by the document; only the viewer's own `annotations` are editable.

## API reference

[`@salmonui/pdf-viewer`](/docs/reference/pdf-viewer) lists every prop,
callback and type of `PdfViewer`.
