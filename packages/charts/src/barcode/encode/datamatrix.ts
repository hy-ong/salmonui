// Data Matrix ECC200 encoder (ISO/IEC 16022): ASCII (digit
// pairs, upper shift), ASCII-numeric, Base256 and automatic encodation, GS1
// (FNC1), every square and rectangular symbol size, Reed-Solomon over
// GF(256) (polynomial 0x12D) with block interleaving, and the standard
// module placement. Pure and deterministic.

import type { EncodeResult } from './linear.js';

export type DataMatrixEncoding = 'auto' | 'ascii' | 'asciiNumeric' | 'base256';

export interface DataMatrixOptions {
  readonly encoding?: DataMatrixEncoding | undefined;
  /** `'auto'` (default: smallest square), `'auto-rectangular'`, or `'<rows>x<cols>'` such as `'16x16'`, `'8x18'`. */
  readonly size?: string | undefined;
  readonly gs1?: boolean | undefined;
}

export interface DataMatrixSymbol {
  readonly kind: 'matrix';
  readonly width: number;
  readonly height: number;
  readonly modules: Uint8Array;
  readonly quietZone: number;
  readonly size: string;
}

interface SizeSpec {
  readonly rows: number;
  readonly cols: number;
  /** Data region rows / cols per region, region counts. */
  readonly regionRows: number;
  readonly regionCols: number;
  readonly vRegions: number;
  readonly hRegions: number;
  readonly data: number;
  readonly ecc: number;
  readonly blocks: number;
}

// rows, cols, data region size (rows, cols), regions vertically, regions horizontally, data codewords, error codewords, blocks
const TABLE: readonly (readonly number[])[] = [
  [10, 10, 8, 8, 1, 1, 3, 5, 1], [12, 12, 10, 10, 1, 1, 5, 7, 1], [14, 14, 12, 12, 1, 1, 8, 10, 1], [16, 16, 14, 14, 1, 1, 12, 12, 1],
  [18, 18, 16, 16, 1, 1, 18, 14, 1], [20, 20, 18, 18, 1, 1, 22, 18, 1], [22, 22, 20, 20, 1, 1, 30, 20, 1], [24, 24, 22, 22, 1, 1, 36, 24, 1],
  [26, 26, 24, 24, 1, 1, 44, 28, 1], [32, 32, 14, 14, 2, 2, 62, 36, 1], [36, 36, 16, 16, 2, 2, 86, 42, 1], [40, 40, 18, 18, 2, 2, 114, 48, 1],
  [44, 44, 20, 20, 2, 2, 144, 56, 1], [48, 48, 22, 22, 2, 2, 174, 68, 1], [52, 52, 24, 24, 2, 2, 204, 84, 2], [64, 64, 14, 14, 4, 4, 280, 112, 2],
  [72, 72, 16, 16, 4, 4, 368, 144, 4], [80, 80, 18, 18, 4, 4, 456, 192, 4], [88, 88, 20, 20, 4, 4, 576, 224, 4], [96, 96, 22, 22, 4, 4, 696, 272, 4],
  [104, 104, 24, 24, 4, 4, 816, 336, 6], [120, 120, 18, 18, 6, 6, 1050, 408, 6], [132, 132, 20, 20, 6, 6, 1304, 496, 8], [144, 144, 22, 22, 6, 6, 1558, 620, 10],
  [8, 18, 6, 16, 1, 1, 5, 7, 1], [8, 32, 6, 14, 1, 2, 10, 11, 1], [12, 26, 10, 24, 1, 1, 16, 14, 1], [12, 36, 10, 16, 1, 2, 22, 18, 1],
  [16, 36, 14, 16, 1, 2, 32, 24, 1], [16, 48, 14, 22, 1, 2, 49, 28, 1],
];

const SIZES: readonly SizeSpec[] = TABLE.map(([rows, cols, rr, rc, vr, hr, data, ecc, blocks]) => ({
  rows: rows!, cols: cols!, regionRows: rr!, regionCols: rc!, vRegions: vr!, hRegions: hr!, data: data!, ecc: ecc!, blocks: blocks!,
}));

/** Every symbol size as `'<rows>x<cols>'`, squares first. */
export const DATA_MATRIX_SIZES: readonly string[] = SIZES.map((s) => `${s.rows}x${s.cols}`);

/** Size table entry, exposed for tests. */
export function dataMatrixSize(name: string): SizeSpec | undefined {
  return SIZES.find((s) => `${s.rows}x${s.cols}` === name);
}

// ------------------------------------------------------------ GF(256) 0x12D

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x12d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}
const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

/** Error correction codewords of one block (generator roots α^1..α^n). */
export function dataMatrixEcc(data: readonly number[], n: number): number[] {
  // Generator polynomial coefficients, highest degree first (monic).
  let gen = [1];
  for (let i = 1; i <= n; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] = next[j]! ^ gen[j]!;
      next[j + 1] = next[j + 1]! ^ mul(gen[j]!, EXP[i]!);
    }
    gen = next;
  }
  const rem = new Array<number>(n).fill(0);
  for (const d of data) {
    const f = d ^ rem[0]!;
    for (let j = 0; j < n - 1; j++) rem[j] = rem[j + 1]! ^ mul(f, gen[j + 1]!);
    rem[n - 1] = mul(f, gen[n]!);
  }
  return rem;
}

/** Evaluates a codeword polynomial at α^i (a zero syndrome for every root means a valid block). */
export function dataMatrixSyndrome(codewords: readonly number[], i: number): number {
  let s = 0;
  for (const c of codewords) s = mul(s, EXP[i]!) ^ c;
  return s;
}

// ------------------------------------------------------------ Encodation

function bytesOf(text: string): number[] | undefined {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c > 255) return undefined;
    out.push(c);
  }
  return out;
}

const isDigit = (c: number | undefined): boolean => c !== undefined && c >= 48 && c <= 57;
const FNC1 = -1;

function asciiCodewords(input: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (c === FNC1) out.push(232);
    else if (isDigit(c) && isDigit(input[i + 1])) {
      out.push(130 + (c - 48) * 10 + (input[i + 1]! - 48));
      i++;
    } else if (c > 127) out.push(235, c - 127);
    else out.push(c + 1);
  }
  return out;
}

function base256Codewords(input: readonly number[]): number[] {
  const len = input.length;
  const header = len < 250 ? [len] : [Math.floor(len / 250) + 249, len % 250];
  const raw = [...header, ...input];
  // Randomize every Base256 codeword by its position (1-based, counting the latch at position 1).
  return [231, ...raw.map((v, i) => {
    const pos = i + 2;
    const r = ((149 * pos) % 255) + 1;
    const t = v + r;
    return t <= 255 ? t : t - 256;
  })];
}

function pad(codewords: number[], capacity: number): number[] {
  const out = codewords.slice();
  if (out.length < capacity) out.push(129);
  while (out.length < capacity) {
    const pos = out.length + 1;
    const r = ((149 * pos) % 253) + 1;
    const t = 129 + r;
    out.push(t <= 254 ? t : t - 254);
  }
  return out;
}

// ------------------------------------------------------------ Placement

/** ECC200 module placement: returns, per mapping-matrix cell, `codeword * 8 + bit` (bit 0 = MSB) or -1 / -2 (fixed light / dark). */
export function placement(nrow: number, ncol: number): Int32Array {
  const grid = new Int32Array(nrow * ncol).fill(-3);
  const module = (r: number, c: number, chr: number, bit: number) => {
    let row = r;
    let col = c;
    if (row < 0) {
      row += nrow;
      col += 4 - ((nrow + 4) % 8);
    }
    if (col < 0) {
      col += ncol;
      row += 4 - ((ncol + 4) % 8);
    }
    grid[row * ncol + col] = chr * 8 + bit;
  };
  const utah = (r: number, c: number, chr: number) => {
    module(r - 2, c - 2, chr, 0);
    module(r - 2, c - 1, chr, 1);
    module(r - 1, c - 2, chr, 2);
    module(r - 1, c - 1, chr, 3);
    module(r - 1, c, chr, 4);
    module(r, c - 2, chr, 5);
    module(r, c - 1, chr, 6);
    module(r, c, chr, 7);
  };
  const corner = (cells: readonly (readonly [number, number])[], chr: number) => cells.forEach(([r, c], bit) => module(r, c, chr, bit));
  let chr = 0;
  let row = 4;
  let col = 0;
  do {
    if (row === nrow && col === 0) corner([[nrow - 1, 0], [nrow - 1, 1], [nrow - 1, 2], [0, ncol - 2], [0, ncol - 1], [1, ncol - 1], [2, ncol - 1], [3, ncol - 1]], chr++);
    if (row === nrow - 2 && col === 0 && ncol % 4) corner([[nrow - 3, 0], [nrow - 2, 0], [nrow - 1, 0], [0, ncol - 4], [0, ncol - 3], [0, ncol - 2], [0, ncol - 1], [1, ncol - 1]], chr++);
    if (row === nrow - 2 && col === 0 && ncol % 8 === 4) corner([[nrow - 3, 0], [nrow - 2, 0], [nrow - 1, 0], [0, ncol - 2], [0, ncol - 1], [1, ncol - 1], [2, ncol - 1], [3, ncol - 1]], chr++);
    if (row === nrow + 4 && col === 2 && !(ncol % 8)) corner([[nrow - 1, 0], [nrow - 1, ncol - 1], [0, ncol - 3], [0, ncol - 2], [0, ncol - 1], [1, ncol - 3], [1, ncol - 2], [1, ncol - 1]], chr++);
    do {
      if (row < nrow && col >= 0 && grid[row * ncol + col] === -3) utah(row, col, chr++);
      row -= 2;
      col += 2;
    } while (row >= 0 && col < ncol);
    row += 1;
    col += 3;
    do {
      if (row >= 0 && col < ncol && grid[row * ncol + col] === -3) utah(row, col, chr++);
      row += 2;
      col -= 2;
    } while (row < nrow && col >= 0);
    row += 3;
    col += 1;
  } while (row < nrow || col < ncol);
  if (grid[nrow * ncol - 1] === -3) {
    grid[nrow * ncol - 1] = -2;
    grid[(nrow - 2) * ncol + ncol - 2] = -2;
    grid[(nrow - 1) * ncol + ncol - 2] = -1;
    grid[(nrow - 2) * ncol + ncol - 1] = -1;
  }
  return grid;
}

function interleaveBlocks(data: readonly number[], spec: SizeSpec): number[] {
  const { blocks } = spec;
  const eccPer = spec.ecc / blocks;
  const out = data.slice();
  const ecc: number[][] = [];
  for (let b = 0; b < blocks; b++) {
    const block: number[] = [];
    for (let i = b; i < data.length; i += blocks) block.push(data[i]!);
    ecc.push(dataMatrixEcc(block, eccPer));
  }
  for (let j = 0; j < eccPer; j++) for (let b = 0; b < blocks; b++) out.push(ecc[b]![j]!);
  return out;
}

function encodeCodewords(input: number[], encoding: DataMatrixEncoding): number[] | string {
  if (encoding === 'asciiNumeric' && input.some((c) => c !== FNC1 && !isDigit(c))) return 'asciiNumeric encodes digits only';
  if (encoding === 'base256') {
    if (input.includes(FNC1)) return 'GS1 needs ASCII encodation';
    return base256Codewords(input);
  }
  const ascii = asciiCodewords(input);
  if (encoding === 'auto' && !input.includes(FNC1)) {
    const b256 = base256Codewords(input);
    if (b256.length < ascii.length) return b256;
  }
  return ascii;
}

export function encodeDataMatrix(value: string, options: DataMatrixOptions = {}): EncodeResult<DataMatrixSymbol> {
  if (!value) return { ok: false, reason: 'empty value' };
  let input: number[] | undefined;
  if (options.gs1) {
    const re = /\((\d{2,4})\)([^(]*)/g;
    const fixed = /^(0[0-4]|1[1-9]|20|3[1-6]|41)/;
    input = [FNC1];
    let consumed = 0;
    for (let m = re.exec(value); m; m = re.exec(value)) {
      if (m.index !== consumed) return { ok: false, reason: 'GS1 Data Matrix needs application identifiers written as (AI)data' };
      for (const ch of m[1]! + m[2]!) input.push(ch.charCodeAt(0));
      if (re.lastIndex < value.length && !fixed.test(m[1]!)) input.push(29);
      consumed = re.lastIndex;
    }
    if (input.length === 1 || consumed !== value.length) return { ok: false, reason: 'GS1 Data Matrix needs application identifiers written as (AI)data' };
  } else {
    input = bytesOf(value);
    if (!input) return { ok: false, reason: 'Data Matrix encodes ISO 8859-1 characters only' };
  }
  const codewords = encodeCodewords(input, options.encoding ?? 'auto');
  if (typeof codewords === 'string') return { ok: false, reason: codewords };
  const sizeOpt = options.size ?? 'auto';
  let spec: SizeSpec | undefined;
  if (sizeOpt === 'auto' || sizeOpt === 'auto-rectangular') {
    const pool = sizeOpt === 'auto' ? SIZES.filter((s) => s.rows === s.cols) : SIZES.filter((s) => s.rows !== s.cols);
    spec = pool.find((s) => s.data >= codewords.length);
    if (!spec) return { ok: false, reason: 'value exceeds the Data Matrix capacity' };
  } else {
    spec = dataMatrixSize(sizeOpt);
    if (!spec) return { ok: false, reason: `unknown Data Matrix size ${sizeOpt}` };
    if (spec.data < codewords.length) return { ok: false, reason: `value does not fit ${sizeOpt}` };
  }
  const all = interleaveBlocks(pad(codewords, spec.data), spec);
  const { vRegions, hRegions } = spec;
  const nrow = spec.regionRows * vRegions;
  const ncol = spec.regionCols * hRegions;
  const map = placement(nrow, ncol);
  const modules = new Uint8Array(spec.rows * spec.cols);
  for (let r = 0; r < nrow; r++) {
    for (let c = 0; c < ncol; c++) {
      const v = map[r * ncol + c]!;
      const dark = v === -2 ? 1 : v < 0 ? 0 : (all[v >> 3]! >> (7 - (v & 7))) & 1;
      const y = r + 1 + 2 * Math.floor(r / spec.regionRows);
      const x = c + 1 + 2 * Math.floor(c / spec.regionCols);
      modules[y * spec.cols + x] = dark;
    }
  }
  // Finder (solid left and bottom) and timing (alternating top and right) per region.
  for (let vr = 0; vr < vRegions; vr++) {
    for (let hr = 0; hr < hRegions; hr++) {
      const top = vr * (spec.regionRows + 2);
      const left = hr * (spec.regionCols + 2);
      const h = spec.regionRows + 2;
      const w = spec.regionCols + 2;
      for (let y = 0; y < h; y++) {
        modules[(top + y) * spec.cols + left] = 1;
        modules[(top + y) * spec.cols + left + w - 1] = y % 2 === 1 ? 1 : 0;
      }
      for (let x = 0; x < w; x++) {
        modules[(top + h - 1) * spec.cols + left + x] = 1;
        modules[top * spec.cols + left + x] = x % 2 === 0 ? 1 : 0;
      }
    }
  }
  return { ok: true, symbol: { kind: 'matrix', width: spec.cols, height: spec.rows, modules, quietZone: 1, size: `${spec.rows}x${spec.cols}` } };
}
