// Zoom math for PdfViewer. Pure: no DOM, no engine. A scale of 1
// shows a page at 100 %: one PDF point is 96/72 CSS pixels, as in pdf.js.

import type { PdfPageSize, PdfViewerScrollMode, PdfViewerSpreadMode, PdfViewerZoom } from './types.js';

/** CSS pixels per PDF point at scale 1. */
export const PDF_TO_CSS = 96 / 72;
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10;
/** Largest scale `'auto'` picks for a portrait page (pdf.js `MAX_AUTO_SCALE`). */
export const MAX_AUTO_SCALE = 1.25;
/** Zoom steps of the zoom in / out commands and the zoom menu. */
export const ZOOM_STEPS: readonly number[] = Object.freeze([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]);
const FINE_STEPS: readonly number[] = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6.5, 8, 10];

/** Space around pages (px) kept free by the fit modes. */
export const PAGE_GAP = 12;
export const VIEW_PADDING = 16;

export const clampScale = (scale: number): number => (Number.isFinite(scale) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) : 1);

export interface FitContext {
  /** Size of the reference page in PDF points (displayed orientation). */
  readonly page: PdfPageSize;
  /** Size of the scroll viewport in CSS px. */
  readonly viewport: { readonly width: number; readonly height: number };
  readonly scrollMode?: PdfViewerScrollMode | undefined;
  readonly spreadMode?: PdfViewerSpreadMode | undefined;
}

/** Resolves a zoom value to a numeric scale (fit modes measure the reference page against the viewport). */
export function resolveScale(zoom: PdfViewerZoom, context: FitContext): number {
  if (typeof zoom === 'number') return clampScale(zoom);
  const { page, viewport } = context;
  if (!(page.width > 0 && page.height > 0) || !(viewport.width > 0)) return 1;
  const spread = context.spreadMode && context.spreadMode !== 'none' && context.scrollMode !== 'horizontal' && context.scrollMode !== 'wrapped' ? 2 : 1;
  const availW = Math.max(1, viewport.width - 2 * VIEW_PADDING - (spread - 1) * PAGE_GAP);
  const availH = Math.max(1, (viewport.height || viewport.width) - 2 * VIEW_PADDING);
  const widthScale = availW / (spread * page.width * PDF_TO_CSS);
  const heightScale = availH / (page.height * PDF_TO_CSS);
  switch (zoom) {
    case 'page-width':
      return clampScale(widthScale);
    case 'page-fit':
      return clampScale(Math.min(widthScale, heightScale));
    default: {
      // 'auto': fit landscape pages whole, portrait pages to the width up to 125 %.
      const landscape = page.width > page.height;
      return clampScale(landscape ? Math.min(widthScale, heightScale) : Math.min(MAX_AUTO_SCALE, widthScale));
    }
  }
}

/** Next zoom step from `scale` (`direction` 1 zooms in, -1 out). */
export function stepScale(scale: number, direction: 1 | -1): number {
  const s = clampScale(scale);
  if (direction > 0) return FINE_STEPS.find((v) => v > s + 1e-6) ?? MAX_SCALE;
  for (let i = FINE_STEPS.length - 1; i >= 0; i--) if ((FINE_STEPS[i] as number) < s - 1e-6) return FINE_STEPS[i] as number;
  return MIN_SCALE;
}

/** Scale after a pinch or Ctrl+wheel gesture: multiplicative and clamped. */
export function pinchScale(start: number, factor: number): number {
  return clampScale(Math.round(start * factor * 1000) / 1000);
}

/** Wheel delta (ctrl/pinch wheel events) to a multiplicative factor. */
export const wheelFactor = (deltaY: number): number => Math.exp(-Math.max(-100, Math.min(100, deltaY)) / 100);

/** Percentage label of a scale (`1.25` -> `"125%"`). */
export const formatScale = (scale: number): string => `${Math.round(scale * 100)}%`;
