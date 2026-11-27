'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/pdf-viewer`: PdfViewer on pdf.js. pdf.js and its worker load with
// dynamic import() on the client only; everything this entry exports
// statically is server-safe. Styles: `@salmonui/pdf-viewer/styles.css`.
export { PdfViewer } from './PdfViewer.js';
export { PDF_VIEWER_DEFAULT_LOCALE_TEXT } from './locale.js';
export type { PdfViewerLocaleText } from './locale.js';
export { DEFAULT_TOOLBAR as PDF_VIEWER_DEFAULT_TOOLBAR } from './toolbar.js';
export { resolveScale, stepScale, ZOOM_STEPS, PDF_TO_CSS } from './zoom.js';
export type { FitContext } from './zoom.js';
export type {
  PdfFormValue,
  PdfFormValues,
  PdfPageSize,
  PdfRect,
  PdfTextMarkupAnnotation,
  PdfTextMarkupKind,
  PdfViewerActions,
  PdfViewerAnnotationsChangeEvent,
  PdfViewerCancelableEvent,
  PdfViewerEventSource,
  PdfViewerLinkEvent,
  PdfViewerLoadInfo,
  PdfViewerOutlineItem,
  PdfViewerPart,
  PdfViewerPasswordRequest,
  PdfViewerProps,
  PdfViewerScrollMode,
  PdfViewerSearchOptions,
  PdfViewerSearchResult,
  PdfViewerSidebar,
  PdfViewerSource,
  PdfViewerSpreadMode,
  PdfViewerStateSnapshot,
  PdfViewerToolbarContext,
  PdfViewerToolbarCustomItem,
  PdfViewerToolbarItem,
  PdfViewerToolbarItemId,
  PdfViewerZoom,
} from './types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/pdf-viewer', 'salmon-pdf-viewer');
