'use client';

// `<QRCode>`: imports only the QR encoder, so
// `import { QRCode } from '@salmonui/charts/barcode'` tree-shakes the 1D and
// Data Matrix code away.

import { useMemo, type CSSProperties, type ReactNode, type Ref, type SVGProps } from 'react';
import { encodeQR, type QRErrorCorrection, type QRMode } from './encode/qr.js';
import { layoutMatrix } from './render.js';
import { SymbolSvg, type BarcodeInvalidEvent, type QRCodeApi } from './SymbolSvg.js';

export type { QRErrorCorrection, QRMode };

type SvgPassthrough = Omit<SVGProps<SVGSVGElement>, 'ref' | 'width' | 'height' | 'color' | 'mode' | 'version' | 'mask' | 'children' | 'className' | 'style' | 'role' | 'aria-label' | 'onInvalid'>;

export interface QRCodeProps extends SvgPassthrough {
  readonly value: string;
  /** Default `'m'`, or `'h'` with a `logo`. */
  readonly errorCorrection?: QRErrorCorrection | undefined;
  /** `'auto'` (default): the smallest version 1..40 that fits. */
  readonly version?: 'auto' | number | undefined;
  /** Default `'auto'`: numeric, alphanumeric or byte (UTF-8), whichever encodes the whole value. */
  readonly mode?: QRMode | undefined;
  /** GS1 QR Code: `value` is an element string `(01)…(10)…`. */
  readonly gs1?: boolean | undefined;
  /** Mask 0..7 (default: the lowest ISO penalty). */
  readonly mask?: number | undefined;
  /** Centered over a cleared area (about 22 % of the symbol width); raises the default error correction to `'h'`. */
  readonly logo?: ReactNode;
  /** Module size in px (default 4). */
  readonly moduleSize?: number | undefined;
  /** Total width (and height) in px; overrides `moduleSize`. */
  readonly width?: number | undefined;
  readonly quietZone?: boolean | undefined;
  /** Optional caption under the symbol: `true` shows the value. */
  readonly text?: boolean | string | undefined;
  /** Module color: a data color, default `#000000`. */
  readonly color?: string | undefined;
  readonly background?: string | undefined;
  /** Accessible name; default the encoded value. */
  readonly label?: string | undefined;
  readonly invalidLabel?: string | undefined;
  readonly onInvalid?: ((event: BarcodeInvalidEvent) => void) | undefined;
  readonly ref?: Ref<QRCodeApi> | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

/** Fraction of the symbol width cleared for a logo (well inside level H's 30 % recovery). */
export const QR_LOGO_FRACTION = 0.22;

export function QRCode(props: QRCodeProps): ReactNode {
  const { value, errorCorrection, version, mode, gs1, mask, logo, moduleSize, width, quietZone, text, color = '#000000', background = '#ffffff', label, invalidLabel, onInvalid, ref, className, style, ...rest } = props;
  const hasLogo = logo !== undefined && logo !== null && logo !== false;
  const ecl = errorCorrection ?? (hasLogo ? 'h' : 'm');
  const result = useMemo(() => encodeQR(value, { errorCorrection: ecl, version, mode, gs1, mask }), [value, ecl, version, mode, gs1, mask]);
  const drawing = useMemo(
    () => (result.ok ? layoutMatrix(result.symbol, { moduleSize, width, quietZone, logoFraction: hasLogo ? QR_LOGO_FRACTION : 0, text: typeof text === 'string' ? text : text === true ? value : null }) : null),
    [result, moduleSize, width, quietZone, hasLogo, text, value],
  );
  const reason = result.ok ? null : result.reason;
  const name = reason !== null ? (invalidLabel ?? 'Invalid QR code: {reason}').replace('{reason}', reason) : (label ?? value);
  const extra = result.ok ? { ...rest, 'data-version': result.symbol.version, 'data-error-correction': result.symbol.errorCorrection } : rest;
  return (
    <SymbolSvg
      family="salmon-qr-code"
      drawing={drawing}
      label={name}
      invalidReason={reason}
      color={color}
      background={background}
      logo={hasLogo ? logo : undefined}
      className={className}
      style={style}
      apiRef={ref}
      onInvalid={onInvalid}
      extra={extra}
      idHint="qr"
    />
  );
}
