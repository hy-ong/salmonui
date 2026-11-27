// QR Code encoder (ISO/IEC 18004): numeric, alphanumeric and
// byte (UTF-8) segments, versions 1 to 40, error correction L / M / Q / H,
// Reed-Solomon over GF(256) (polynomial 0x11D), the eight masks with the ISO
// penalty rules, format and version information, GS1 (FNC1 in first
// position). Pure and deterministic; depends on nothing so `QRCode` tree-shakes
// alone.

export type QRErrorCorrection = 'l' | 'm' | 'q' | 'h';
export type QRMode = 'auto' | 'numeric' | 'alphanumeric' | 'byte';
type Mode = Exclude<QRMode, 'auto'>;

export interface QROptions {
  readonly errorCorrection?: QRErrorCorrection | undefined;
  /** `'auto'` (default) picks the smallest version that fits. */
  readonly version?: 'auto' | number | undefined;
  readonly mode?: QRMode | undefined;
  /** GS1 element string `(01)…(10)…`: FNC1 in first position, `%` for FNC1 (alphanumeric) or GS (byte). */
  readonly gs1?: boolean | undefined;
  /** Force a mask 0..7 (default: lowest penalty). */
  readonly mask?: number | undefined;
}

export interface QRSymbol {
  readonly kind: 'matrix';
  readonly width: number;
  readonly height: number;
  /** Row-major, 1 = dark. */
  readonly modules: Uint8Array;
  readonly quietZone: number;
  readonly version: number;
  readonly errorCorrection: QRErrorCorrection;
  readonly mask: number;
  readonly mode: Mode;
}

export type QRResult = { readonly ok: true; readonly symbol: QRSymbol } | { readonly ok: false; readonly reason: string };

// Index 0 unused; per version 1..40.
const ECC_PER_BLOCK: Record<QRErrorCorrection, readonly number[]> = {
  l: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  m: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  h: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const BLOCKS: Record<QRErrorCorrection, readonly number[]> = {
  l: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  m: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  h: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};
const EC_BITS: Record<QRErrorCorrection, number> = { l: 1, m: 0, q: 3, h: 2 };
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** Data modules of a version (everything but function patterns), in bits. */
export function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

/** Data codewords (excluding error correction) of a version and level. */
export function dataCodewords(ver: number, ecl: QRErrorCorrection): number {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver]! * BLOCKS[ecl][ver]!;
}

// ------------------------------------------------------------ Reed-Solomon (GF(256), 0x11D)

const EXP = new Uint8Array(510);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++, x = (x << 1) ^ (x & 0x80 ? 0x11d : 0)) {
  EXP[i] = x;
  EXP[i + 255] = x;
  LOG[x] = i;
}
const gfMul = (x: number, y: number): number => (x && y ? EXP[LOG[x]! + LOG[y]!]! : 0);

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < result.length) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Reed-Solomon remainder (error correction codewords) of `data`. */
export function rsRemainder(data: readonly number[], degree: number, divisor: readonly number[] = rsDivisor(degree)): number[] {
  const result = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < degree; i++) result[i] = result[i]! ^ gfMul(divisor[i]!, factor);
  }
  return result;
}

// ------------------------------------------------------------ Segments

class Bits {
  readonly bits: number[] = [];
  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

const MODE_BITS = { numeric: 1, alphanumeric: 2, byte: 4 } as const;

function countBits(mode: Mode, ver: number): number {
  const i = ver <= 9 ? 0 : ver <= 26 ? 1 : 2;
  return { numeric: [10, 12, 14], alphanumeric: [9, 11, 13], byte: [8, 16, 16] }[mode][i]!;
}

function pickMode(text: string): Mode {
  if (/^\d*$/.test(text)) return 'numeric';
  if ([...text].every((ch) => ALNUM.includes(ch))) return 'alphanumeric';
  return 'byte';
}

function segmentBits(text: string, mode: Mode, ver: number, gs1: boolean): Bits | string {
  const bb = new Bits();
  if (gs1) bb.put(0b0101, 4);
  bb.put(MODE_BITS[mode], 4);
  if (mode === 'numeric') {
    if (!/^\d*$/.test(text)) return 'numeric mode encodes digits only';
    bb.put(text.length, countBits(mode, ver));
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      bb.put(Number(chunk), chunk.length * 3 + 1);
    }
  } else if (mode === 'alphanumeric') {
    for (const ch of text) if (!ALNUM.includes(ch)) return `"${ch}" is not an alphanumeric-mode character`;
    bb.put(text.length, countBits(mode, ver));
    for (let i = 0; i + 1 < text.length; i += 2) bb.put(ALNUM.indexOf(text[i]!) * 45 + ALNUM.indexOf(text[i + 1]!), 11);
    if (text.length % 2) bb.put(ALNUM.indexOf(text[text.length - 1]!), 6);
  } else {
    const bytes = utf8(text);
    bb.put(bytes.length, countBits(mode, ver));
    for (const b of bytes) bb.put(b, 8);
  }
  return bb;
}

/** GS1 element string to QR data text: AI and data joined, FNC1 as `%` (alphanumeric) or GS (other modes). */
function gs1Text(value: string, alnum: boolean): string | undefined {
  const re = /\((\d{2,4})\)([^(]*)/g;
  const fixed = /^(0[0-4]|1[1-9]|20|3[1-6]|41)/;
  const parts: string[] = [];
  let consumed = 0;
  for (let m = re.exec(value); m; m = re.exec(value)) {
    if (m.index !== consumed) return undefined;
    parts.push(m[1]! + (alnum ? m[2]!.replace(/%/g, '%%') : m[2]!));
    if (re.lastIndex < value.length && !fixed.test(m[1]!)) parts.push(alnum ? '%' : '\u001d');
    consumed = re.lastIndex;
  }
  return parts.length && consumed === value.length ? parts.join('') : undefined;
}

// ------------------------------------------------------------ Matrix

class Grid {
  readonly size: number;
  readonly dark: Uint8Array;
  readonly fn: Uint8Array;
  constructor(size: number) {
    this.size = size;
    this.dark = new Uint8Array(size * size);
    this.fn = new Uint8Array(size * size);
  }
  set(x: number, y: number, dark: boolean): void {
    this.dark[y * this.size + x] = dark ? 1 : 0;
    this.fn[y * this.size + x] = 1;
  }
}

/** Alignment pattern center coordinates of a version. */
export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const num = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (num * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < num; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** 15-bit format information word (after masking) for a level and mask. */
export function formatBits(ecl: QRErrorCorrection, mask: number): number {
  const data = (EC_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormat(g: Grid, ecl: QRErrorCorrection, mask: number): void {
  const bits = formatBits(ecl, mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) g.set(8, i, bit(i));
  g.set(8, 7, bit(6));
  g.set(8, 8, bit(7));
  g.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) g.set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) g.set(g.size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) g.set(8, g.size - 15 + i, bit(i));
  g.set(8, g.size - 8, true);
}

/** 18-bit version information word (versions 7 to 40). */
export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

function drawVersion(g: Grid, ver: number): void {
  if (ver < 7) return;
  const bits = versionBits(ver);
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = g.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    g.set(a, b, dark);
    g.set(b, a, dark);
  }
}

function drawFunctionPatterns(g: Grid, ver: number, ecl: QRErrorCorrection): void {
  const n = g.size;
  for (let i = 0; i < n; i++) {
    g.set(6, i, i % 2 === 0);
    g.set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < n && y >= 0 && y < n) g.set(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(n - 4, 3);
  finder(3, n - 4);
  const align = alignmentPositions(ver);
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) g.set(align[i]! + dx, align[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  drawFormat(g, ecl, 0);
  drawVersion(g, ver);
}

function drawCodewords(g: Grid, data: readonly number[]): void {
  const n = g.size;
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? n - 1 - vert : vert;
        if (!g.fn[y * n + x] && i < data.length * 8) {
          g.dark[y * n + x] = (data[i >>> 3]! >>> (7 - (i & 7))) & 1;
          i++;
        }
      }
    }
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(g: Grid, mask: number): void {
  const n = g.size;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!g.fn[y * n + x] && maskBit(mask, x, y)) g.dark[y * n + x] = 1 - g.dark[y * n + x]!;
}

/** ISO 18004 penalty score (rules N1 to N4) of a finished matrix. */
export function penalty(dark: Uint8Array, n: number): number {
  let result = 0;
  // N1 runs and N3 finder-like 1:1:3:1:1 patterns with four light modules on one
  // side, rows then columns; an 11-bit window, outside the symbol counts as light.
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      let run = 0;
      let color = -1;
      let window = 0;
      for (let b = 0; b < n + 4; b++) {
        const v = b < n ? (pass === 0 ? dark[a * n + b]! : dark[b * n + a]!) : 0;
        if (b < n) {
          if (v === color) {
            run++;
            if (run === 5) result += 3;
            else if (run > 5) result++;
          } else {
            color = v;
            run = 1;
          }
        }
        window = ((window << 1) | v) & 0x7ff;
        if (b >= 6 && (window === 0x5d0 || window === 0x05d)) result += 40;
      }
    }
  }
  // N2 2x2 blocks.
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const i = y * n + x;
      const c = dark[i];
      if (c === dark[i + 1] && c === dark[i + n] && c === dark[i + n + 1]) result += 3;
    }
  }
  // N4 dark proportion.
  let darkCount = 0;
  for (const v of dark) darkCount += v;
  const total = n * n;
  result += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
  return result;
}

/** Splits data codewords into blocks, appends error correction and interleaves (ISO 18004 8.6). */
export function interleave(data: readonly number[], ver: number, ecl: QRErrorCorrection): number[] {
  const numBlocks = BLOCKS[ecl][ver]!;
  const eccLen = ECC_PER_BLOCK[ecl][ver]!;
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, eccLen, divisor);
    if (i < numShort) dat.push(0);
    blocks.push([...dat, ...ecc]);
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) result.push(block[i]!);
    });
  }
  return result;
}

/** Data codewords (terminator and padding included) for `text` at a version. */
export function qrDataCodewords(text: string, ver: number, ecl: QRErrorCorrection, mode: Mode, gs1 = false): number[] | string {
  const bb = segmentBits(text, mode, ver, gs1);
  if (typeof bb === 'string') return bb;
  const capacity = dataCodewords(ver, ecl) * 8;
  if (bb.bits.length > capacity) return 'too long';
  bb.put(0, Math.min(4, capacity - bb.bits.length));
  bb.put(0, (8 - (bb.bits.length % 8)) % 8);
  for (let pad = 0xec; bb.bits.length < capacity; pad ^= 0xec ^ 0x11) bb.put(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.bits[i + j]!;
    out.push(v);
  }
  return out;
}

export function encodeQR(value: string, options: QROptions = {}): QRResult {
  if (!value) return { ok: false, reason: 'empty value' };
  const ecl = options.errorCorrection ?? 'm';
  const gs1 = options.gs1 === true;
  let text = value;
  let mode: Mode;
  if (gs1) {
    const alnum = gs1Text(value, true);
    if (alnum === undefined) return { ok: false, reason: 'GS1 QR Code needs application identifiers written as (AI)data' };
    mode = options.mode && options.mode !== 'auto' ? options.mode : pickMode(alnum);
    text = mode === 'byte' ? gs1Text(value, false)! : alnum;
  } else {
    mode = options.mode && options.mode !== 'auto' ? options.mode : pickMode(value);
  }
  const fixed = typeof options.version === 'number' ? options.version : undefined;
  if (fixed !== undefined && (!Number.isInteger(fixed) || fixed < 1 || fixed > 40)) return { ok: false, reason: 'version must be 1 to 40' };
  let ver = fixed ?? 1;
  // The bit length depends on the version only through the character count field (three classes).
  const lengths = new Map<number, number | string>();
  for (;;) {
    const cb = countBits(mode, ver);
    let len = lengths.get(cb);
    if (len === undefined) {
      const bb = segmentBits(text, mode, ver, gs1);
      len = typeof bb === 'string' ? bb : bb.bits.length;
      lengths.set(cb, len);
    }
    if (typeof len === 'string') return { ok: false, reason: len };
    if (len <= dataCodewords(ver, ecl) * 8) break;
    if (fixed !== undefined || ver === 40) return { ok: false, reason: fixed !== undefined ? `value does not fit version ${fixed}-${ecl.toUpperCase()}` : 'value exceeds the QR Code capacity' };
    ver++;
  }
  const data = qrDataCodewords(text, ver, ecl, mode, gs1) as number[];
  const size = ver * 4 + 17;
  const g = new Grid(size);
  drawFunctionPatterns(g, ver, ecl);
  drawCodewords(g, interleave(data, ver, ecl));
  let mask = options.mask ?? -1;
  if (mask < 0) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(g, m);
      drawFormat(g, ecl, m);
      const p = penalty(g.dark, size);
      if (p < best) {
        best = p;
        mask = m;
      }
      applyMask(g, m);
    }
  }
  applyMask(g, mask);
  drawFormat(g, ecl, mask);
  return { ok: true, symbol: { kind: 'matrix', width: size, height: size, modules: g.dark, quietZone: 4, version: ver, errorCorrection: ecl, mask, mode } };
}
