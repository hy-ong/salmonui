// Props shared by the stacked and dot symbologies (`Pdf417`, `Gs1DataBar`,
// `DotCode`): the output, color, accessibility and invalid-value options of
// `Barcode`, plus the accessible name rule.

import type { CSSProperties, Ref, SVGProps } from 'react';
import type { BarcodeApi, BarcodeInvalidEvent } from './SymbolSvg.js';

export type SymbolSvgPassthrough = Omit<SVGProps<SVGSVGElement>, 'ref' | 'width' | 'height' | 'color' | 'type' | 'children' | 'className' | 'style' | 'role' | 'aria-label' | 'onInvalid' | 'rows' | 'columns'>;

export interface SymbolBaseProps extends SymbolSvgPassthrough {
  /** The data to encode. */
  readonly value: string;
  /** Human-readable text under the symbol: `true` shows the value, a string replaces it, `false` hides it. */
  readonly text?: boolean | string | undefined;
  /** Module (narrow bar or dot) size in px. */
  readonly moduleSize?: number | undefined;
  /** Total width in px (overrides `moduleSize`). */
  readonly width?: number | undefined;
  /** Keep the quiet zone (default true). */
  readonly quietZone?: boolean | undefined;
  /** Bar color: a data color, default `#000000` (scanners need dark on light in every color scheme). */
  readonly color?: string | undefined;
  /** Background color: a data color, default `#ffffff`. */
  readonly background?: string | undefined;
  /** Accessible name; default the encoded value. */
  readonly label?: string | undefined;
  /** Accessible name when the value cannot be encoded (`{reason}` is replaced). Default `Invalid barcode: {reason}`. */
  readonly invalidLabel?: string | undefined;
  readonly onInvalid?: ((event: BarcodeInvalidEvent) => void) | undefined;
  readonly ref?: Ref<BarcodeApi> | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

/** The accessible name of a symbol: the label or the value, or the invalid reason. */
export function symbolName(reason: string | null, value: string, label: string | undefined, invalidLabel: string | undefined): string {
  return reason !== null ? (invalidLabel ?? 'Invalid barcode: {reason}').replace('{reason}', reason) : (label ?? value);
}
