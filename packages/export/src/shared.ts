// Options and helpers shared by the XLSX and PDF writers.

import type { ExportCellStyle } from '@salmonui/core/export-model';
import type { YieldFn } from './bytes.js';

/** Styles of the exported row kinds, merged under per-cell styles. */
export interface ExportStyles {
  readonly header?: ExportCellStyle;
  readonly row?: ExportCellStyle;
  readonly groupCaption?: ExportCellStyle;
  readonly aggregate?: ExportCellStyle;
}

/** Writer options shared by every format. */
export interface ExportWriterOptions {
  readonly styles?: ExportStyles;
  /** Time slice in ms before the writer yields to the event loop. Default 25. */
  readonly sliceMs?: number;
  /** Awaited between slices. Default: a macrotask. */
  readonly yield?: YieldFn;
}

/** @internal */
export const DEFAULT_STYLES: Required<ExportStyles> = Object.freeze({
  header: Object.freeze({ bold: true, backgroundColor: '#F2F2F2' }),
  row: Object.freeze({}),
  groupCaption: Object.freeze({ bold: true, backgroundColor: '#FAFAFA' }),
  aggregate: Object.freeze({ bold: true }),
});

/** @internal */
export function stylesOf(styles: ExportStyles | undefined): Required<ExportStyles> {
  return {
    header: { ...DEFAULT_STYLES.header, ...styles?.header },
    row: { ...DEFAULT_STYLES.row, ...styles?.row },
    groupCaption: { ...DEFAULT_STYLES.groupCaption, ...styles?.groupCaption },
    aggregate: { ...DEFAULT_STYLES.aggregate, ...styles?.aggregate },
  };
}

/** @internal Merges two styles (b wins). */
export function mergeStyle(a: ExportCellStyle | undefined, b: ExportCellStyle | undefined): ExportCellStyle {
  if (!b) return a ?? {};
  if (!a) return b;
  return { ...a, ...b };
}

/** @internal `#rgb` / `#rrggbb` to `RRGGBB`, or null. */
export function hexColor(color: string | undefined): string | null {
  if (!color) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const h = m[1] as string;
  return (h.length === 3 ? h.replace(/./g, (c) => c + c) : h).toUpperCase();
}
