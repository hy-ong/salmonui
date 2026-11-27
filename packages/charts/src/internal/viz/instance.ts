// Imperative instance shared by the figure-based families: `element`, image
// and CSV export, data URLs, SVG markup, print and focus. The export code is
// the lazy `instance-run.ts` / `export.ts` chunk, loaded on the first call;
// `toSVGString` is synchronous on every family.

import type { ImageFormat } from './export.js';

/**
 * Writer loaders for the document formats, dynamic imports
 * of `@salmonui/export` subpaths supplied by the application, so no
 * visualization bundle carries a writer. Declared structurally: this package
 * never imports the export package.
 */
export interface VizExportWriters {
  /** A dynamic import of @salmonui/export `graphics` subpath: vector PDF pages. */
  readonly pdf?: (() => Promise<{ readonly writeGraphicsPdf: (...args: never[]) => Promise<{ readonly data: Uint8Array }> }>) | undefined;
  /** A dynamic import of @salmonui/export `xlsx` subpath: the table as a workbook. */
  readonly xlsx?: (() => Promise<{ readonly writeXlsx: (...args: never[]) => Promise<Uint8Array> }>) | undefined;
}

export interface VizExportOptions {
  readonly format?: ImageFormat | 'csv' | undefined;
  readonly fileName?: string | undefined;
  /** Raster scale on top of the device pixel ratio. */
  readonly scale?: number | undefined;
  /** CSV: neutralize spreadsheet formulas in text cells. Default true; `false` writes raw text. */
  readonly escapeFormulas?: boolean | undefined;
}

export interface VizInstance {
  /** The root `<figure>` (null before mount). */
  readonly element: HTMLElement | null;
  /** Downloads the visualization; settles after the download starts. */
  export(options?: VizExportOptions): Promise<void>;
  toBlob(format?: ImageFormat): Promise<Blob>;
  toDataURL(format?: ImageFormat): Promise<string>;
  /**
   * The drawn SVG markup with `xmlns`, synchronously; theme colors
   * stay `var(--salmon-*)` references. `toBlob('svg')` is the standalone
   * file with colors resolved. Empty before mount.
   */
  toSVGString(): string;
  print(): Promise<void>;
  /** Focuses the plot (the one tab stop). */
  focus(): void;
}

export interface VizInstanceSource {
  readonly root: () => HTMLElement | null;
  readonly name: string;
  /** CSV of the accessible table. */
  readonly csv?: (() => { columns: readonly string[]; rows: readonly (readonly string[])[] }) | undefined;
  /** Print title. */
  readonly title?: (() => string | undefined) | undefined;
}

/** `toSVGString` of every figure family: the drawn markup with the SVG namespace. */
export const svgMarkup = (svg: Element | null | undefined): string => (svg ? svg.outerHTML.replace(/^<svg(?![^>]*\sxmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"') : '');

export function createVizInstance(source: VizInstanceSource): VizInstance {
  const call = <T>(method: 'export' | 'toBlob' | 'toDataURL' | 'print', arg?: VizExportOptions | ImageFormat): Promise<T> => import('./instance-run.js').then((m) => m.run(source, method, arg) as Promise<T>);
  return {
    get element() {
      return source.root();
    },
    export: (options) => call('export', options),
    toBlob: (format) => call('toBlob', format),
    toDataURL: (format) => call('toDataURL', format),
    toSVGString: () => svgMarkup(source.root()?.querySelector('.salmon-viz-surface svg')),
    print: () => call('print'),
    focus() {
      source.root()?.querySelector<HTMLElement>('.salmon-viz-plot')?.focus();
    },
  };
}
