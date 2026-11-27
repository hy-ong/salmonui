// Public types of `@salmonui/pdf-viewer`. Nothing here references the
// engine's types: pdf.js stays an implementation detail behind the lazy chunk.
import type { CSSProperties, HTMLAttributes, ReactNode, Ref, RefObject } from 'react';
import type { PdfViewerLocaleText } from './locale.js';

/** A document: a URL (string or `URL`) or the bytes (`ArrayBuffer`, `Uint8Array`, `Blob`). */
export type PdfViewerSource = string | URL | ArrayBuffer | Uint8Array | Blob;
/** A scale (`1` = 100 %) or a fit mode. */
export type PdfViewerZoom = number | 'page-fit' | 'page-width' | 'auto';
export type PdfViewerScrollMode = 'vertical' | 'horizontal' | 'wrapped' | 'page';
/** `'odd'` starts spreads on odd pages (1-2, 3-4), `'even'` on even pages (1, 2-3). */
export type PdfViewerSpreadMode = 'none' | 'odd' | 'even';
export type PdfViewerSidebar = 'thumbnails' | 'outline';
/** Page size in PDF points (1/72 inch), in the displayed orientation. */
export interface PdfPageSize {
  readonly width: number;
  readonly height: number;
}
/** A rectangle in PDF user space: `[x1, y1, x2, y2]`, origin at the bottom left of the page. */
export type PdfRect = readonly [number, number, number, number];
export type PdfTextMarkupKind = 'highlight' | 'underline' | 'strikethrough';

/** A text markup annotation. Coordinates are zoom independent. */
export interface PdfTextMarkupAnnotation {
  readonly id: string;
  readonly kind: PdfTextMarkupKind;
  /** 1-based page number. */
  readonly page: number;
  /** One rectangle per marked line, PDF user space. */
  readonly rects: readonly PdfRect[];
  /** CSS hex color `#rrggbb`. */
  readonly color: string;
  /** 0..1; default 1 (highlights render with a multiply blend). */
  readonly opacity?: number | undefined;
  readonly author?: string | undefined;
  readonly comment?: string | undefined;
  /** The marked text, when known. */
  readonly text?: string | undefined;
  /** ISO 8601 creation time. */
  readonly createdAt?: string | undefined;
}

/** AcroForm field values by field name: text and choice fields are strings, list boxes string arrays, check boxes booleans, radio groups the selected export value. */
export type PdfFormValue = string | boolean | readonly string[];
export type PdfFormValues = Readonly<Record<string, PdfFormValue>>;

export type PdfViewerEventSource = 'toolbar' | 'keyboard' | 'scroll' | 'pinch' | 'wheel' | 'api' | 'link' | 'outline' | 'thumbnail' | 'search' | 'prop' | 'load';

export type PdfViewerToolbarItemId =
  | 'sidebar'
  | 'previous'
  | 'next'
  | 'pageNumber'
  | 'zoomOut'
  | 'zoomIn'
  | 'zoom'
  | 'search'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'print'
  | 'download';

/** A custom toolbar button, or any content through `render`. */
export interface PdfViewerToolbarCustomItem {
  readonly id: string;
  /** Accessible name, tooltip and overflow menu text. */
  readonly label: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean | undefined;
  readonly onSelect?: ((actions: PdfViewerActions) => void) | undefined;
  /** Replaces the button. */
  readonly render?: ((actions: PdfViewerActions) => ReactNode) | undefined;
}

/** Built-in ids, custom items, `'|'` (separator) and `'-'` (spacer). */
export type PdfViewerToolbarItem = PdfViewerToolbarItemId | '|' | '-' | PdfViewerToolbarCustomItem;

export interface PdfViewerOutlineItem {
  readonly id: string;
  readonly title: string;
  /** Target page (1-based) when it resolves to one. */
  readonly page: number | null;
  readonly url: string | null;
  readonly items: readonly PdfViewerOutlineItem[];
}

export interface PdfViewerLoadInfo {
  readonly pageCount: number;
  readonly pageSizes: readonly PdfPageSize[];
  readonly title: string | null;
  readonly outline: readonly PdfViewerOutlineItem[];
  /** AcroForm field names in document order. */
  readonly formFields: readonly string[];
}

export interface PdfViewerPasswordRequest {
  /** `'required'` on the first prompt, `'incorrect'` after a wrong password. */
  readonly reason: 'required' | 'incorrect';
  submit(password: string): void;
  /** Gives up; `onLoadError` reports a `PasswordException`. */
  cancel(): void;
}

export interface PdfViewerSearchOptions {
  readonly matchCase?: boolean | undefined;
  readonly wholeWord?: boolean | undefined;
  /** Highlight every match, not only the current one. Default true. */
  readonly highlightAll?: boolean | undefined;
}

export interface PdfViewerSearchResult {
  readonly query: string;
  readonly total: number;
  /** 1-based index of the current match; 0 when there is none. */
  readonly current: number;
  /** Page of the current match; 0 when there is none. */
  readonly page: number;
  /** Matches per page (1-based page -> count). */
  readonly pages: Readonly<Record<number, number>>;
}

export interface PdfViewerCancelableEvent {
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface PdfViewerLinkEvent extends PdfViewerCancelableEvent {
  /** External link target; `null` for an internal link. */
  readonly url: string | null;
  /** Target page of an internal link; `null` when external or unresolved. */
  readonly page: number | null;
}

export interface PdfViewerAnnotationsChangeEvent {
  readonly reason: 'create' | 'remove';
  readonly annotation: PdfTextMarkupAnnotation;
}

/** Commands (`actionsRef`). */
export interface PdfViewerActions {
  /** Scrolls to a page (1-based, clamped). */
  goToPage(page: number): void;
  /** Runs a search over every page; resolves when all pages are searched. */
  search(query: string, options?: PdfViewerSearchOptions): Promise<PdfViewerSearchResult>;
  findNext(): void;
  findPrevious(): void;
  clearSearch(): void;
  setZoom(zoom: PdfViewerZoom): void;
  /** Opens the print dialog; resolves `false` when `onBeforePrint` cancelled. */
  print(): Promise<boolean>;
  /** The document with the current form values and text markup annotations written into it. */
  save(): Promise<Blob>;
  /** Saves and downloads as `fileName` (default the `fileName` prop). */
  download(fileName?: string): Promise<void>;
  /** Marks the current text selection; returns the new annotations (one per page). */
  addTextMarkup(kind: PdfTextMarkupKind, options?: { readonly color?: string; readonly opacity?: number; readonly comment?: string }): readonly PdfTextMarkupAnnotation[];
  removeAnnotation(id: string): void;
  /** Current page, page count and scale. */
  getState(): PdfViewerStateSnapshot;
  /** Opens or closes the find bar. */
  openFind(open?: boolean): void;
}

export interface PdfViewerStateSnapshot {
  readonly status: 'empty' | 'loading' | 'password' | 'ready' | 'error';
  readonly page: number;
  readonly pageCount: number;
  /** Effective scale (a fit mode resolved). */
  readonly scale: number;
  readonly zoom: PdfViewerZoom;
}

export interface PdfViewerToolbarContext {
  /** The built-in toolbar content (place it in your own bar, or ignore it). */
  readonly items: ReactNode;
  readonly actions: PdfViewerActions;
  readonly state: PdfViewerStateSnapshot;
}

export type PdfViewerPart = 'toolbar' | 'sidebar' | 'viewport' | 'findBar';

export interface PdfViewerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onLoad' | 'onError' | 'children' | 'defaultValue'> {
  /** The document. Changing it loads the new document. */
  readonly src?: PdfViewerSource | null | undefined;
  /** URL of the pdf.js worker module; default the worker that ships with `pdfjs-dist`, bundled through `new Worker(new URL(...))`. */
  readonly workerSrc?: string | URL | undefined;
  /** Extra `getDocument()` options (`cMapUrl`, `standardFontDataUrl`, `wasmUrl`, `withCredentials`, `httpHeaders`). */
  readonly documentOptions?: Readonly<Record<string, unknown>> | undefined;
  /** Password of an encrypted document. */
  readonly password?: string | undefined;
  /** Replaces the built-in password dialog. */
  readonly onPasswordRequired?: ((request: PdfViewerPasswordRequest) => void) | undefined;
  readonly onLoad?: ((info: PdfViewerLoadInfo) => void) | undefined;
  readonly onLoadError?: ((error: Error) => void) | undefined;
  /** Page sizes in PDF points the server can lay out before the engine loads; one size applies to every page. */
  readonly pageSizes?: readonly PdfPageSize[] | PdfPageSize | undefined;
  /** Number of pages for placeholders when `pageSizes` is a single size. */
  readonly pageCount?: number | undefined;

  /** Controlled 1-based page. */
  readonly page?: number | undefined;
  readonly defaultPage?: number | undefined;
  readonly onPageChange?: ((page: number, event: { readonly source: PdfViewerEventSource }) => void) | undefined;
  /** Controlled zoom. Default `'auto'`. */
  readonly zoom?: PdfViewerZoom | undefined;
  readonly defaultZoom?: PdfViewerZoom | undefined;
  readonly onZoomChange?: ((zoom: PdfViewerZoom, event: { readonly scale: number; readonly source: PdfViewerEventSource }) => void) | undefined;
  /** Default `'vertical'`. */
  readonly scrollMode?: PdfViewerScrollMode | undefined;
  /** Default `'none'`. */
  readonly spreadMode?: PdfViewerSpreadMode | undefined;
  /** Open panel; `null` closes it. */
  readonly sidebar?: PdfViewerSidebar | null | undefined;
  readonly defaultSidebar?: PdfViewerSidebar | null | undefined;
  readonly onSidebarChange?: ((sidebar: PdfViewerSidebar | null) => void) | undefined;

  /** Toolbar items; `false` hides the toolbar. */
  readonly toolbar?: readonly PdfViewerToolbarItem[] | false | undefined;
  /** Replaces the toolbar. */
  readonly renderToolbar?: ((context: PdfViewerToolbarContext) => ReactNode) | undefined;

  /** Native text selection and copy over the text layer. Default true. */
  readonly textSelection?: boolean | undefined;
  /** Where external links open. Default `'_blank'`. */
  readonly linkTarget?: '_blank' | '_self' | '_parent' | '_top' | undefined;
  /** Cancellable; `preventDefault()` keeps the viewer from following the link. */
  readonly onLinkClick?: ((event: PdfViewerLinkEvent) => void) | undefined;
  /** Cancellable. */
  readonly onBeforePrint?: ((event: PdfViewerCancelableEvent) => void) | undefined;
  /** Print resolution in DPI. Default 150. */
  readonly printResolution?: number | undefined;
  /** Download file name. Default `'document.pdf'`. */
  readonly fileName?: string | undefined;
  readonly onSearchResult?: ((result: PdfViewerSearchResult) => void) | undefined;

  /** Controlled text markup annotations. */
  readonly annotations?: readonly PdfTextMarkupAnnotation[] | undefined;
  readonly defaultAnnotations?: readonly PdfTextMarkupAnnotation[] | undefined;
  readonly onAnnotationsChange?: ((annotations: readonly PdfTextMarkupAnnotation[], event: PdfViewerAnnotationsChangeEvent) => void) | undefined;
  /** Author written into new annotations. */
  readonly annotationAuthor?: string | undefined;
  /** Default colors of the markup kinds. */
  readonly annotationColors?: Partial<Record<PdfTextMarkupKind, string>> | undefined;

  /** Controlled AcroForm values by field name; fields not listed keep the document's values. */
  readonly formValues?: PdfFormValues | undefined;
  readonly defaultFormValues?: PdfFormValues | undefined;
  readonly onFormValuesChange?: ((values: PdfFormValues, event: { readonly name: string }) => void) | undefined;

  readonly actionsRef?: RefObject<PdfViewerActions | null> | ((actions: PdfViewerActions | null) => void) | undefined;
  readonly localeText?: Partial<PdfViewerLocaleText> | undefined;
  readonly classNames?: Partial<Record<PdfViewerPart, string>> | undefined;
  readonly styles?: Partial<Record<PdfViewerPart, CSSProperties>> | undefined;
  readonly ref?: Ref<HTMLDivElement> | undefined;
}
