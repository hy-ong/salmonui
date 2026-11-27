// `exportVisualizations`, re-exported by every visualization
// subpath: a stub that loads the combine code (the shared lazy `export.ts`
// chunk) on the first call, so no entry carries more than this function.

import type { VizExportWriters } from './instance.js';

/** Anything with the `element` of a visualization instance (every `ref` API), or the element itself. */
export type ExportableVisualization = { readonly element: Element | null } | Element | null | undefined;

export interface ExportVisualizationsOptions {
  /** Default `png`. */
  readonly format?: 'png' | 'jpeg' | 'svg' | 'pdf' | undefined;
  /** Stack the drawings top to bottom (default) or side by side. */
  readonly direction?: 'vertical' | 'horizontal' | undefined;
  /** Space between drawings in px. Default 16. */
  readonly gap?: number | undefined;
  /** Default `visualizations.<format>`. */
  readonly fileName?: string | undefined;
  /** Raster scale on top of the device pixel ratio. */
  readonly scale?: number | undefined;
  /** PDF page orientation and size (`format: 'pdf'`). */
  readonly orientation?: 'portrait' | 'landscape' | undefined;
  readonly pageSize?: string | undefined;
  /** `pdf` needs `writers.pdf` (a dynamic import of @salmonui/export `graphics` subpath). */
  readonly writers?: Pick<VizExportWriters, 'pdf'> | undefined;
  /** Download the file (default true); the promise resolves to it either way. */
  readonly download?: boolean | undefined;
}

/** Exports several visualizations as one image or PDF page. */
export function exportVisualizations(items: readonly ExportableVisualization[], options?: ExportVisualizationsOptions): Promise<Blob> {
  return import('./export.js').then((m) => m.combine(items, options ?? {}));
}
