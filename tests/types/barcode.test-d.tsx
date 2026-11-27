// Type contract of `@salmonui/charts/barcode` and its `/pdf417`,
// `/gs1-databar` and `/dotcode` subpaths. Compiles against dist/*.d.ts.
import { useRef } from 'react';
import { Barcode, type BarcodeApi, type BarcodeType } from '@salmonui/charts/barcode';
import { DotCode, type DotCodeProps } from '@salmonui/charts/barcode/dotcode';
import { Gs1DataBar, type Gs1DataBarVariant } from '@salmonui/charts/barcode/gs1-databar';
import { Pdf417, type Pdf417Compaction, type Pdf417ErrorCorrection } from '@salmonui/charts/barcode/pdf417';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

expectType<Equal<Gs1DataBarVariant, 'omnidirectional' | 'truncated' | 'stacked' | 'stackedOmnidirectional' | 'limited' | 'expanded' | 'expandedStacked'>>(true);
expectType<Equal<Pdf417Compaction, 'auto' | 'text' | 'numeric' | 'byte'>>(true);
expectType<Equal<Pdf417ErrorCorrection, 'auto' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>>(true);
expectType<Equal<DotCodeProps['columns'], number | undefined>>(true);
// PDF417, GS1 DataBar and DotCode are subpaths, not `Barcode` types.
expectType<Equal<Extract<BarcodeType, 'pdf417' | 'gs1DataBar' | 'dotCode'>, never>>(true);

export function Symbols() {
  const api = useRef<BarcodeApi>(null);
  return (
    <>
      <Barcode type="code128" value="A1" ref={api} />
      <Pdf417 value="PDF417" ref={api} compaction="text" errorCorrection={2} columns={3} rows={6} compact rowHeightRatio={4} height={80} onInvalid={(e) => e.reason} />
      <Gs1DataBar value="0950110153000" variant="expandedStacked" segmentsPerRow={4} text={false} ref={api} />
      <DotCode value="(01)00012345678905" gs1 columns={21} moduleSize={3} label="Item" ref={api} className="x" style={{ margin: 0 }} />
      {/* @ts-expect-error: `variant` is not a Pdf417 prop */}
      <Pdf417 value="x" variant="stacked" />
      {/* @ts-expect-error: `pdf417` is not a Barcode type */}
      <Barcode type="pdf417" value="x" />
    </>
  );
}
