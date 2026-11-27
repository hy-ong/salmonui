'use client';

// `<DotCode>`: DotCode from
// `@salmonui/charts/barcode/dotcode`, its own subpath so `/barcode` never
// carries the GF(113) encoder. Dots are square modules drawn through the
// matrix layout of `Barcode`; same SVG view, export API and stylesheet. Pure
// render: the server markup is final (no lazy chunk, no Suspense).

import { useMemo, type ReactNode } from 'react';
import { encodeDotCode } from './encode/dotcode.js';
import { symbolName, type SymbolBaseProps } from './props.js';
import { layoutMatrix } from './render.js';
import { SymbolSvg } from './SymbolSvg.js';

export interface DotCodeProps extends SymbolBaseProps {
  /** ISO 8859-1 text, or a GS1 element string with `gs1`. */
  readonly value: string;
  /** Symbol width in dot columns, 5 to 200 (default automatic, about 3:2). */
  readonly columns?: number | undefined;
  /** GS1 DotCode: `value` is an element string `(01)…(10)…` (FNC1). */
  readonly gs1?: boolean | undefined;
}

export function DotCode(props: DotCodeProps): ReactNode {
  const { value, columns, gs1, text, moduleSize, width, quietZone, color = '#000000', background = '#ffffff', label, invalidLabel, onInvalid, ref, className, style, ...rest } = props;
  const result = useMemo(() => encodeDotCode(value, { columns, gs1 }), [value, columns, gs1]);
  const drawing = useMemo(
    () => (result.ok ? layoutMatrix(result.symbol, { moduleSize, width, quietZone, text: typeof text === 'string' ? text : text === true ? value : null }) : null),
    [result, moduleSize, width, quietZone, text, value],
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
      extra={{ ...rest, 'data-type': 'dotCode' }}
      idHint="dotcode"
    />
  );
}
