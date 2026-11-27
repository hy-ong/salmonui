'use client';

// `<Barcode>`: every 1D symbology plus Data Matrix as one `type` union, drawn as
// one SVG path. Pure render: the encoder runs during render (it is a pure
// function of the props) and the server markup is final.

import { useMemo, type CSSProperties, type ReactNode, type Ref, type SVGProps } from 'react';
import { encodeBarcode, type BarcodeType } from './encode/index.js';
import type { DataMatrixEncoding } from './encode/datamatrix.js';
import { layoutLinear, layoutMatrix, type BearerBar, type TextAlign, type TextPosition } from './render.js';
import { SymbolSvg, type BarcodeApi, type BarcodeInvalidEvent } from './SymbolSvg.js';

export type { BarcodeType };
export type BarcodeDataMatrixEncoding = DataMatrixEncoding;

type SvgPassthrough = Omit<SVGProps<SVGSVGElement>, 'ref' | 'width' | 'height' | 'color' | 'type' | 'children' | 'className' | 'style' | 'role' | 'aria-label' | 'onInvalid'>;

export interface BarcodeProps extends SvgPassthrough {
  readonly type: BarcodeType;
  /** The data to encode. GS1 types take element strings: `(01)09501101530003(10)ABC`. */
  readonly value: string;
  /** Code 39 mod-43 check character (default off); Code 11 C / K check digits (default on). */
  readonly checksum?: boolean | undefined;
  /** Code 128: force one code set instead of automatic switching. */
  readonly codeSet?: 'a' | 'b' | 'c' | undefined;
  /** Data Matrix encodation (default `'auto'`). */
  readonly encoding?: BarcodeDataMatrixEncoding | undefined;
  /** Data Matrix symbol size: `'auto'` (smallest square), `'auto-rectangular'`, or `'<rows>x<cols>'`. */
  readonly size?: string | undefined;
  /** Data Matrix: GS1 element string with FNC1. */
  readonly gs1?: boolean | undefined;
  /** Human-readable text: `true` (default for 1D) shows the encoded value, a string replaces it, `false` hides it. */
  readonly text?: boolean | string | undefined;
  readonly textPosition?: TextPosition | undefined;
  readonly textAlign?: TextAlign | undefined;
  /** Module (narrow bar) width in px. Default 2 (1D), 4 (Data Matrix). */
  readonly moduleSize?: number | undefined;
  /** Total width in px (overrides `moduleSize`). */
  readonly width?: number | undefined;
  /** Total height in px (1D). */
  readonly height?: number | undefined;
  /** Keep the quiet zone (default true). */
  readonly quietZone?: boolean | undefined;
  /** Bar color: a data color, default `#000000` (scanners need dark on light in every color scheme). */
  readonly color?: string | undefined;
  /** Background color: a data color, default `#ffffff`. */
  readonly background?: string | undefined;
  /** ITF-14 bearer bars (default `'frame'` for `itf14`, `'none'` otherwise). */
  readonly bearerBar?: BearerBar | undefined;
  /** Accessible name; default the encoded value. */
  readonly label?: string | undefined;
  /** Accessible name when the value cannot be encoded (`{reason}` is replaced). Default `Invalid barcode: {reason}`. */
  readonly invalidLabel?: string | undefined;
  readonly onInvalid?: ((event: BarcodeInvalidEvent) => void) | undefined;
  readonly ref?: Ref<BarcodeApi> | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

export function Barcode(props: BarcodeProps): ReactNode {
  const {
    type, value, checksum, codeSet, encoding, size, gs1, text, textPosition, textAlign, moduleSize, width, height, quietZone,
    color = '#000000', background = '#ffffff', bearerBar, label, invalidLabel, onInvalid, ref, className, style, ...rest
  } = props;
  const result = useMemo(() => encodeBarcode(type, value, { checksum, codeSet, encoding, size, gs1 }), [type, value, checksum, codeSet, encoding, size, gs1]);
  const drawing = useMemo(() => {
    if (!result.ok) return null;
    const symbol = result.symbol;
    if (symbol.kind === 'matrix') {
      return layoutMatrix(symbol, { moduleSize, width, quietZone, text: typeof text === 'string' ? text : text === true ? value : null });
    }
    const shown = text === false ? null : typeof text === 'string' ? text : symbol.text;
    return layoutLinear(symbol, {
      moduleSize, width, height, quietZone, text: shown, segmented: typeof text !== 'string',
      textPosition: textPosition ?? 'bottom', textAlign: textAlign ?? 'center', bearerBar: bearerBar ?? (type === 'itf14' ? 'frame' : 'none'),
    });
  }, [result, moduleSize, width, height, quietZone, text, value, textPosition, textAlign, bearerBar, type]);
  const reason = result.ok ? null : result.reason;
  const name = reason !== null ? (invalidLabel ?? 'Invalid barcode: {reason}').replace('{reason}', reason) : (label ?? value);
  return (
    <SymbolSvg
      family="salmon-barcode"
      drawing={drawing}
      label={name}
      invalidReason={reason}
      color={color}
      background={background}
      className={className}
      style={style}
      apiRef={ref}
      onInvalid={onInvalid}
      extra={{ ...rest, 'data-type': type }}
      idHint={type}
    />
  );
}
