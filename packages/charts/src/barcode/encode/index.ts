// Barcode encoders (`barcode/`).
// Kept out of the `#viz` index on purpose: `QRCode` imports `qr.ts` alone, so
// a QR-only page never pays for the 1D and Data Matrix tables. PDF417, GS1
// DataBar and DotCode are not `Barcode` types: their components import their
// encoders directly from their own subpaths (`barcode-*.ts`), so `/barcode`
// never carries them.

import { encodeCodabar, encodeCode11, encodeCode128, encodeCode32, encodeCode39, encodeCode93, encodeEan13, encodeEan8, encodeGs1Code128, encodeItf14, encodeUpcA, encodeUpcE } from './linear.js';
import type { EncodeResult, LinearSymbol } from './linear.js';
import { encodeDataMatrix } from './datamatrix.js';
import type { DataMatrixEncoding, DataMatrixSymbol } from './datamatrix.js';

export type BarcodeType =
  | 'code39' | 'code39Extended' | 'code11' | 'codabar' | 'code32' | 'code93' | 'code93Extended'
  | 'code128' | 'gs1Code128' | 'ean8' | 'ean13' | 'upcA' | 'upcE' | 'itf14' | 'dataMatrix';

export interface BarcodeEncodeOptions {
  readonly checksum?: boolean | undefined;
  readonly codeSet?: 'a' | 'b' | 'c' | undefined;
  readonly encoding?: DataMatrixEncoding | undefined;
  readonly size?: string | undefined;
  readonly gs1?: boolean | undefined;
}

export type BarcodeSymbol = LinearSymbol | DataMatrixSymbol;

export const BARCODE_TYPES: readonly BarcodeType[] = ['code39', 'code39Extended', 'code11', 'codabar', 'code32', 'code93', 'code93Extended', 'code128', 'gs1Code128', 'ean8', 'ean13', 'upcA', 'upcE', 'itf14', 'dataMatrix'];

export function encodeBarcode(type: BarcodeType, value: string, options: BarcodeEncodeOptions = {}): EncodeResult<BarcodeSymbol> {
  switch (type) {
    case 'code39': return encodeCode39(value, { checksum: options.checksum === true });
    case 'code39Extended': return encodeCode39(value, { extended: true, checksum: options.checksum === true });
    case 'code11': return encodeCode11(value, { checksum: options.checksum !== false });
    case 'codabar': return encodeCodabar(value);
    case 'code32': return encodeCode32(value);
    case 'code93': return encodeCode93(value);
    case 'code93Extended': return encodeCode93(value, { extended: true });
    case 'code128': return encodeCode128(value, { codeSet: options.codeSet });
    case 'gs1Code128': return encodeGs1Code128(value);
    case 'ean8': return encodeEan8(value);
    case 'ean13': return encodeEan13(value);
    case 'upcA': return encodeUpcA(value);
    case 'upcE': return encodeUpcE(value);
    case 'itf14': return encodeItf14(value);
    case 'dataMatrix': return encodeDataMatrix(value, { encoding: options.encoding, size: options.size, gs1: options.gs1 });
    default: return { ok: false, reason: `unknown barcode type ${String(type)}` };
  }
}

export type { EncodeResult, LinearSymbol, DataMatrixSymbol, DataMatrixEncoding };
