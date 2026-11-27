---
title: PDF viewer API and navigation
description: A controlled PdfViewer page with links and bookmarks, the actionsRef methods, text selection on and off, cancellable print, a phone-width toolbar overflow, right to left, localized labels, part styles and every view event.
category: editors
---

- **Navigation**: the Page list and the viewer share one controlled `page`;
  scroll, the toolbar, a bookmark or a link inside the document all report
  through `onPageChange` with their `source`. External links go through
  `onLinkClick` (blocked here) and would open in `linkTarget`.
- **Text selection**: select and copy text from the page; untick
  `textSelection` to turn selection off (find still works).
- **Print**: the Print item, Ctrl+P (Cmd+P) with the viewer focused, or
  `print()` render the pages off screen and print them; tick "Cancel
  printing" to veto it in `onBeforePrint`.
- **Methods**: the buttons call `goToPage`, `search`, `findNext`,
  `setZoom`, `print`, `save` (a `Blob` of the document) and `getState`.
- **Keyboard**: Tab to the toolbar and move with the arrows; focus the
  pages and press n / p (or j / k), Home / End, Ctrl+F (Cmd+F) for find and
  Ctrl+= / Ctrl+- to zoom. Each page is a region named "Page n of m".
- **Phone width, RTL and labels**: "Phone width" narrows the viewer so the
  toolbar overflows into "More tools" and the sidebar overlays the pages;
  "Right to left" mirrors the chrome; "Spanish labels" passes `localeText`.
  `styles.viewport` tints the page area and `style` sets the height.
