'use client';

// `@salmonui/charts/barcode/gs1-databar`: `Gs1DataBar`, a subpath of the barcode family so `/barcode` stays
// within its budget. Styled by `@salmonui/charts/barcode/styles.css`.
export { Gs1DataBar } from './barcode/Gs1DataBar.js';
export type { Gs1DataBarProps, Gs1DataBarVariant } from './barcode/Gs1DataBar.js';
export type { BarcodeApi, BarcodeExportOptions, BarcodeImageFormat, BarcodeInvalidEvent } from './barcode/SymbolSvg.js';
// Several visualizations as one image or PDF page; the combine code is a lazy chunk.
export { exportVisualizations } from './internal/viz/export-all.js';
export type { ExportableVisualization, ExportVisualizationsOptions } from './internal/viz/export-all.js';
