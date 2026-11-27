'use client';

// `<Gs1DataBar>`: the seven
// GS1 DataBar variants from `@salmonui/charts/barcode/gs1-databar`, its own
// subpath so `/barcode` never carries the DataBar tables. Shares the SVG
// view, export API and stylesheet of `Barcode`. Pure render: the server
// markup is final (no lazy chunk, no Suspense).

import { useMemo, type ReactNode } from 'react';
import { encodeDataBar, type DataBarVariant } from './encode/databar.js';
import { symbolName, type SymbolBaseProps } from './props.js';
import { layoutRows } from './rows.js';
import { SymbolSvg } from './SymbolSvg.js';

export type Gs1DataBarVariant = DataBarVariant;

export interface Gs1DataBarProps extends SymbolBaseProps {
  /** A GTIN (13 or 14 digits) or, for Expanded, a GS1 element string `(01)…(3202)…`. */
  readonly value: string;
  /** Default `'omnidirectional'`. */
  readonly variant?: Gs1DataBarVariant | undefined;
  /** Expanded Stacked: segments (symbol characters) per row, even, 2 to 22 (default 4). */
  readonly segmentsPerRow?: number | undefined;
  /** Total height in px: scales the rows. */
  readonly height?: number | undefined;
}

export function Gs1DataBar(props: Gs1DataBarProps): ReactNode {
  const {
    value, variant, segmentsPerRow, text, moduleSize, width, height, quietZone,
    color = '#000000', background = '#ffffff', label, invalidLabel, onInvalid, ref, className, style, ...rest
  } = props;
  const result = useMemo(() => encodeDataBar(value, { variant, segmentsPerRow }), [value, variant, segmentsPerRow]);
  const drawing = useMemo(() => {
    if (!result.ok) return null;
    // The GS1 element string is shown by default (`(01)` plus the GTIN with its check digit).
    const shown = text === false ? null : typeof text === 'string' ? text : result.symbol.text;
    return layoutRows(result.symbol, { moduleSize, width, height, quietZone, text: shown });
  }, [result, moduleSize, width, height, quietZone, text]);
  const reason = result.ok ? null : result.reason;
  return (
    <SymbolSvg
      family="salmon-barcode"
      drawing={drawing}
      label={symbolName(reason, value, label, invalidLabel)}
      invalidReason={reason}
      color={color}
      background={background}
      className={className}
      style={style}
      apiRef={ref}
      onInvalid={onInvalid}
      extra={{ ...rest, 'data-type': 'gs1DataBar', 'data-variant': variant ?? 'omnidirectional' }}
      idHint="gs1-databar"
    />
  );
}
