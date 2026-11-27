'use client';

// `@salmonui/charts/barcode/pdf417`:
// `Pdf417`, a subpath of the barcode family so `/barcode` stays within its
// budget. Styled by `@salmonui/charts/barcode/styles.css`.
export { Pdf417 } from './barcode/Pdf417.js';
export type { Pdf417Compaction, Pdf417ErrorCorrection, Pdf417Props } from './barcode/Pdf417.js';
export type { BarcodeApi, BarcodeExportOptions, BarcodeImageFormat, BarcodeInvalidEvent } from './barcode/SymbolSvg.js';
// Several visualizations as one image or PDF page; the combine code is a lazy chunk.
export { exportVisualizations } from './internal/viz/export-all.js';
export type { ExportableVisualization, ExportVisualizationsOptions } from './internal/viz/export-all.js';
