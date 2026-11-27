// Default strings of PdfViewer. `{page}`, `{count}`, `{current}`
// and `{total}` are replaced at render time.

export interface PdfViewerLocaleText {
  readonly label: string;
  readonly toolbar: string;
  readonly loading: string;
  readonly loadError: string;
  readonly empty: string;
  readonly pageLabel: string;
  readonly pageNumber: string;
  readonly pageOf: string;
  readonly previous: string;
  readonly next: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly zoom: string;
  readonly zoomAuto: string;
  readonly zoomPageFit: string;
  readonly zoomPageWidth: string;
  readonly sidebar: string;
  readonly thumbnails: string;
  readonly outline: string;
  readonly noOutline: string;
  readonly thumbnailLabel: string;
  readonly search: string;
  readonly findLabel: string;
  readonly findPlaceholder: string;
  readonly findNext: string;
  readonly findPrevious: string;
  readonly matchCase: string;
  readonly wholeWord: string;
  readonly highlightAll: string;
  readonly matchCount: string;
  readonly noMatches: string;
  readonly closeFind: string;
  readonly highlight: string;
  readonly underline: string;
  readonly strikethrough: string;
  readonly print: string;
  readonly download: string;
  readonly passwordTitle: string;
  readonly passwordPrompt: string;
  readonly passwordIncorrect: string;
  readonly passwordLabel: string;
  readonly passwordSubmit: string;
  readonly passwordCancel: string;
  readonly more: string;
}

export const PDF_VIEWER_DEFAULT_LOCALE_TEXT: PdfViewerLocaleText = Object.freeze({
  label: 'PDF document',
  toolbar: 'PDF tools',
  loading: 'Loading document…',
  loadError: 'The document could not be loaded.',
  empty: 'No document',
  pageLabel: 'Page {page} of {count}',
  pageNumber: 'Page',
  pageOf: 'of {count}',
  previous: 'Previous page',
  next: 'Next page',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoom: 'Zoom',
  zoomAuto: 'Automatic',
  zoomPageFit: 'Page fit',
  zoomPageWidth: 'Page width',
  sidebar: 'Toggle sidebar',
  thumbnails: 'Thumbnails',
  outline: 'Bookmarks',
  noOutline: 'This document has no bookmarks.',
  thumbnailLabel: 'Page {page}',
  search: 'Find',
  findLabel: 'Find in document',
  findPlaceholder: 'Find',
  findNext: 'Next match',
  findPrevious: 'Previous match',
  matchCase: 'Match case',
  wholeWord: 'Whole words',
  highlightAll: 'Highlight all',
  matchCount: '{current} of {total}',
  noMatches: 'No matches',
  closeFind: 'Close find bar',
  highlight: 'Highlight',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  print: 'Print',
  download: 'Download',
  passwordTitle: 'Password required',
  passwordPrompt: 'Enter the password to open this PDF document.',
  passwordIncorrect: 'Incorrect password. Try again.',
  passwordLabel: 'Password',
  passwordSubmit: 'Open',
  passwordCancel: 'Cancel',
  more: 'More tools',
});

export const fill = (text: string, values: Readonly<Record<string, string | number>>): string => text.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
