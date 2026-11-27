'use client';

// `<Pdf417>`: PDF417 and
// Compact PDF417 from `@salmonui/charts/barcode/pdf417`, its own subpath so
// `/barcode` never carries the cluster tables. Shares the SVG view, export
// API and stylesheet of `Barcode`. Pure render: the encoder runs during
// render, so the server markup is final (no lazy chunk, no Suspense).

import { useMemo, type ReactNode } from 'react';
import { encodePdf417, type Pdf417Compaction, type Pdf417ErrorCorrection } from './encode/pdf417.js';
import { symbolName, type SymbolBaseProps } from './props.js';
import { layoutRows } from './rows.js';
import { SymbolSvg } from './SymbolSvg.js';

export type { Pdf417Compaction, Pdf417ErrorCorrection };

export interface Pdf417Props extends SymbolBaseProps {
  /** ISO 8859-1 text. */
  readonly value: string;
  /** Compaction mode (default `'auto'`). */
  readonly compaction?: Pdf417Compaction | undefined;
  /** Error correction level 0 to 8 (default `'auto'`: the ISO recommended minimum for the data length). */
  readonly errorCorrection?: Pdf417ErrorCorrection | undefined;
  /** Data columns, 1 to 30 (default automatic, about 2:1 width to height). */
  readonly columns?: number | undefined;
  /** Rows, 3 to 90 (default automatic). */
  readonly rows?: number | undefined;
  /** Compact PDF417 (no right row indicator, one-module stop bar). */
  readonly compact?: boolean | undefined;
  /** Row height in modules (default 3). */
  readonly rowHeightRatio?: number | undefined;
  /** Total height in px: scales the rows. */
  readonly height?: number | undefined;
}

export function Pdf417(props: Pdf417Props): ReactNode {
  const {
    value, compaction, errorCorrection, columns, rows, compact, rowHeightRatio, text, moduleSize, width, height, quietZone,
    color = '#000000', background = '#ffffff', label, invalidLabel, onInvalid, ref, className, style, ...rest
  } = props;
  const result = useMemo(
    () => encodePdf417(value, { compaction, errorCorrection, columns, rows, compact, rowHeightRatio }),
    [value, compaction, errorCorrection, columns, rows, compact, rowHeightRatio],
  );
  const drawing = useMemo(
    () => (result.ok ? layoutRows(result.symbol, { moduleSize, width, height, quietZone, text: typeof text === 'string' ? text : text === true ? value : null }) : null),
    [result, moduleSize, width, height, quietZone, text, value],
  );
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
      extra={{ ...rest, 'data-type': 'pdf417' }}
      idHint="pdf417"
    />
  );
}
