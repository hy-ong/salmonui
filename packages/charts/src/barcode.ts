'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/barcode`: Barcode
// (1D symbologies and Data Matrix) and QRCode. The encoders are pure and live
// in `barcode/encode/`, outside `#viz`, so this family stays independent of
// the chart engine and `QRCode` tree-shakes alone.
export { Barcode } from './barcode/Barcode.js';
export type { BarcodeDataMatrixEncoding, BarcodeProps, BarcodeType } from './barcode/Barcode.js';
export { QRCode, QR_LOGO_FRACTION } from './barcode/QRCode.js';
export type { QRCodeProps, QRErrorCorrection, QRMode } from './barcode/QRCode.js';
export type { BarcodeApi, BarcodeExportOptions, BarcodeImageFormat, BarcodeInvalidEvent, QRCodeApi } from './barcode/SymbolSvg.js';
export type { BearerBar as BarcodeBearerBar, TextAlign as BarcodeTextAlign, TextPosition as BarcodeTextPosition } from './barcode/render.js';
// Several visualizations as one image or PDF page; the combine code is a lazy chunk.
export { exportVisualizations } from './internal/viz/export-all.js';
export type { ExportableVisualization, ExportVisualizationsOptions } from './internal/viz/export-all.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/barcode', 'salmon-barcode');
