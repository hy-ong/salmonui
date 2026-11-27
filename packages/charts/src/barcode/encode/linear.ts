// One-dimensional barcode encoders (`barcode/`): pure, deterministic, zero dependencies. Every encoder returns
// the module string of the symbol (`'1'` dark, `'0'` light, one character per
// module), the human-readable text and the guard ranges that EAN / UPC draw
// taller. Invalid input returns `{ ok: false, reason }` instead of throwing.

export interface LinearSymbol {
  readonly kind: 'linear';
  /** One character per module: `'1'` bar, `'0'` space. Quiet zones excluded. */
  readonly modules: string;
  /** Human-readable text under (or over) the bars. */
  readonly text: string;
  /** Recommended quiet zone on each side, in modules. */
  readonly quietZone: number;
  /** Module ranges `[start, end)` drawn as long guard bars (EAN, UPC). */
  readonly guards?: readonly (readonly [number, number])[] | undefined;
  /** Text segments placed between guards (EAN, UPC): `[text, startModule, endModule]`. */
  readonly textSegments?: readonly (readonly [string, number, number])[] | undefined;
}

export type EncodeResult<T> = { readonly ok: true; readonly symbol: T } | { readonly ok: false; readonly reason: string };

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Narrow / wide element pattern (`n` / `w`, bars and spaces alternating, bar first) to modules. */
function nw(pattern: string, wide = 3): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) out += (i % 2 === 0 ? '1' : '0').repeat(pattern[i] === 'w' ? wide : 1);
  return out;
}

/** Element widths (`'2122'`, bars and spaces alternating, bar first) to modules. */
export function widthsToModules(widths: string): string {
  let out = '';
  for (let i = 0; i < widths.length; i++) out += (i % 2 === 0 ? '1' : '0').repeat(Number(widths[i]));
  return out;
}

// ---------------------------------------------------------------- Code 39

const C39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
// Bar patterns (2 of 5 wide) for the ten positions of each group, and the wide-space position per group.
const C39_BARS = ['wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn', 'nnwwn'];
const C39_SPACES = ['nwnn', 'nnwn', 'nnnw', 'wnnn'];
const C39_GROUPS = ['1234567890', 'ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ-. *'];
const C39_SPECIAL: Record<string, string> = { $: 'wwwn', '/': 'wwnw', '+': 'wnww', '%': 'nwww' };

function interleave(bars: string, spaces: string): string {
  let out = '';
  for (let i = 0; i < 5; i++) out += bars[i]! + (i < 4 ? spaces[i]! : '');
  return out;
}

/** Narrow / wide pattern (9 elements) of a Code 39 character, or undefined. */
export function code39Pattern(ch: string): string | undefined {
  if (ch in C39_SPECIAL) return interleave('nnnnn', C39_SPECIAL[ch]!);
  for (let g = 0; g < 4; g++) {
    const i = C39_GROUPS[g]!.indexOf(ch);
    if (i >= 0) return interleave(C39_BARS[i]!, C39_SPACES[g]!);
  }
  return undefined;
}

/** Full ASCII to Code 39 shift pairs (Code 39 Extended); `shifts` maps `$ % / +` to the shift symbols. */
export function fullAscii(value: string, shifts: { readonly $: string; readonly '%': string; readonly '/': string; readonly '+': string } = { $: '$', '%': '%', '/': '/', '+': '+' }): string | undefined {
  let out = '';
  for (const ch of value) {
    const c = ch.charCodeAt(0);
    if (c > 127 || ch.length > 1) return undefined;
    if (c === 0) out += `${shifts['%']}U`;
    else if (c <= 26) out += shifts.$ + String.fromCharCode(64 + c);
    else if (c <= 31) out += shifts['%'] + String.fromCharCode(65 + c - 27);
    else if (c === 32 || c === 45 || c === 46 || (c >= 48 && c <= 57) || (c >= 65 && c <= 90)) out += ch;
    else if (c <= 44 || c === 47) out += shifts['/'] + String.fromCharCode(65 + c - 33);
    else if (c === 58) out += `${shifts['/']}Z`;
    else if (c <= 63) out += shifts['%'] + String.fromCharCode(70 + c - 59);
    else if (c === 64) out += `${shifts['%']}V`;
    else if (c <= 95) out += shifts['%'] + String.fromCharCode(75 + c - 91);
    else if (c === 96) out += `${shifts['%']}W`;
    else if (c <= 122) out += shifts['+'] + String.fromCharCode(c - 32);
    else out += shifts['%'] + String.fromCharCode(80 + c - 123);
  }
  return out;
}

/** Mod-43 check character of Code 39 data. */
export function code39Check(data: string): string {
  let sum = 0;
  for (const ch of data) sum += C39_CHARS.indexOf(ch);
  return C39_CHARS[sum % 43]!;
}

export function encodeCode39(value: string, options: { readonly extended?: boolean; readonly checksum?: boolean } = {}): EncodeResult<LinearSymbol> {
  if (!value) return fail('empty value');
  const data = options.extended ? fullAscii(value) : value;
  if (data === undefined) return fail('Code 39 Extended encodes ASCII 0-127 only');
  for (const ch of data) if (!C39_CHARS.includes(ch)) return fail(`"${ch}" is not a Code 39 character`);
  const full = options.checksum ? data + code39Check(data) : data;
  const parts = ['*', ...full, '*'].map((ch) => nw(code39Pattern(ch)!, 3));
  return { ok: true, symbol: { kind: 'linear', modules: parts.join('0'), text: options.extended ? value : full, quietZone: 10 } };
}

// ---------------------------------------------------------------- Code 32 (Italian pharmacode)

const C32_ALPHABET = '0123456789BCDFGHJKLMNPQRSTUVWXYZ';

/** Code 32 check digit over the first 8 digits. */
export function code32Check(digits: string): number {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 0) sum += d;
    else sum += Math.floor((d * 2) / 10) + ((d * 2) % 10);
  }
  return sum % 10;
}

export function encodeCode32(value: string): EncodeResult<LinearSymbol> {
  const raw = value.replace(/^A/, '');
  if (!/^\d{8,9}$/.test(raw)) return fail('Code 32 needs 8 digits (plus an optional check digit)');
  const check = code32Check(raw);
  if (raw.length === 9 && Number(raw[8]) !== check) return fail('invalid Code 32 check digit');
  const nine = raw.slice(0, 8) + String(check);
  let n = Number(nine);
  let b32 = '';
  for (let i = 0; i < 6; i++) {
    b32 = C32_ALPHABET[n % 32]! + b32;
    n = Math.floor(n / 32);
  }
  const parts = ['*', ...b32, '*'].map((ch) => nw(code39Pattern(ch)!, 3));
  return { ok: true, symbol: { kind: 'linear', modules: parts.join('0'), text: `A${nine}`, quietZone: 10 } };
}

// ---------------------------------------------------------------- Code 93

const C93_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%abcd';
// `a b c d` stand for the shift symbols ($) (%) (/) (+).
const C93_PATTERNS = [
  '100010100', '101001000', '101000100', '101000010', '100101000', '100100100', '100100010', '101010000', '100010010', '100001010',
  '110101000', '110100100', '110100010', '110010100', '110010010', '110001010', '101101000', '101100100', '101100010', '100110100',
  '100011010', '101011000', '101001100', '101000110', '100101100', '100010110', '110110100', '110110010', '110101100', '110100110',
  '110010110', '110011010', '101101100', '101100110', '100110110', '100111010', '100101110', '111010100', '111010010', '111001010',
  '101101110', '101110110', '110101110', '100100110', '111011010', '111010110', '100110010',
];
const C93_START = '101011110';

/** Code 93 module patterns, exposed for tests. */
export const CODE93_PATTERNS: readonly string[] = C93_PATTERNS;

function code93Weighted(values: readonly number[], max: number): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[values.length - 1 - i]! * ((i % max) + 1);
  return sum % 47;
}

export function encodeCode93(value: string, options: { readonly extended?: boolean } = {}): EncodeResult<LinearSymbol> {
  if (!value) return fail('empty value');
  const data = options.extended ? fullAscii(value, { $: 'a', '%': 'b', '/': 'c', '+': 'd' }) : value;
  if (data === undefined) return fail('Code 93 Extended encodes ASCII 0-127 only');
  const values: number[] = [];
  for (const ch of data) {
    const v = C93_CHARS.indexOf(ch);
    if (v < 0 || v > (options.extended ? 46 : 42)) return fail(`"${ch}" is not a Code 93 character`);
    values.push(v);
  }
  const c = code93Weighted(values, 20);
  const k = code93Weighted([...values, c], 15);
  const modules = C93_START + [...values, c, k].map((v) => C93_PATTERNS[v]).join('') + C93_START + '1';
  return { ok: true, symbol: { kind: 'linear', modules, text: value, quietZone: 10 } };
}

// ---------------------------------------------------------------- Code 11

const C11_CHARS = '0123456789-';
const C11_PATTERNS = ['nnnnw', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'wnnnn', 'nnwnn'];
const C11_START = 'nnwwn';

function code11Check(values: readonly number[], max: number): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[values.length - 1 - i]! * ((i % max) + 1);
  return sum % 11;
}

export function encodeCode11(value: string, options: { readonly checksum?: boolean } = {}): EncodeResult<LinearSymbol> {
  if (!/^[0-9-]+$/.test(value)) return fail('Code 11 encodes digits and "-" only');
  const values = [...value].map((ch) => C11_CHARS.indexOf(ch));
  if (options.checksum !== false) {
    values.push(code11Check(values, 10));
    if (value.length >= 10) values.push(code11Check(values, 9));
  }
  const parts = [nw(C11_START, 2), ...values.map((v) => nw(C11_PATTERNS[v]!, 2)), nw(C11_START, 2)];
  return { ok: true, symbol: { kind: 'linear', modules: parts.join('0'), text: value, quietZone: 10 } };
}

// ---------------------------------------------------------------- Codabar

const CODABAR: Record<string, string> = {
  '0': '101010011', '1': '101011001', '2': '101001011', '3': '110010101', '4': '101101001', '5': '110101001', '6': '100101011',
  '7': '100101101', '8': '100110101', '9': '110100101', '-': '101001101', $: '101100101', ':': '1101011011', '/': '1101101011',
  '.': '1101101101', '+': '1011011011', A: '1011001001', B: '1001001011', C: '1010010011', D: '1010011001',
};

export function encodeCodabar(value: string): EncodeResult<LinearSymbol> {
  if (!value) return fail('empty value');
  let data = value.toUpperCase();
  if (!/^[A-D]/.test(data)) data = `A${data}`;
  if (!/[A-D]$/.test(data) || data.length < 2) data = `${data}A`;
  const body = data.slice(1, -1);
  if (!/^[0-9\-$:/.+]*$/.test(body)) return fail('Codabar encodes digits and - $ : / . + between the A-D start and stop characters');
  const modules = [...data].map((ch) => CODABAR[ch]!).join('0');
  return { ok: true, symbol: { kind: 'linear', modules, text: value, quietZone: 10 } };
}

// ---------------------------------------------------------------- Code 128 and GS1-128

const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

/** Code 128 element widths per symbol value (0..106), exposed for tests. */
export const CODE128_WIDTHS: readonly string[] = C128;

const FNC1 = -1;
type CodeSet = 'a' | 'b' | 'c';
const START: Record<CodeSet, number> = { a: 103, b: 104, c: 105 };
const SWITCH_TO: Record<CodeSet, number> = { a: 101, b: 100, c: 99 };

function inA(c: number): boolean {
  return c === FNC1 || (c >= 0 && c < 96);
}
function inB(c: number): boolean {
  return c === FNC1 || (c >= 32 && c < 128);
}
function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

/**
 * Optimal Code 128 symbol values for a sequence of character codes (FNC1 as
 * -1): a shortest-path search over (position, code set), so code set C is
 * used exactly where digit pairs pay for the switch. `codeSet` forces one set.
 */
export function code128Values(codes: readonly number[], codeSet?: CodeSet): number[] | undefined {
  const n = codes.length;
  const sets: CodeSet[] = codeSet ? [codeSet] : ['a', 'b', 'c'];
  // cost[i][s]: fewest symbols to encode codes[i..] given current set s.
  const INF = 1e9;
  const cost: Record<CodeSet, number>[] = Array.from({ length: n + 1 }, () => ({ a: INF, b: INF, c: INF }));
  const step: Record<CodeSet, { set: CodeSet; take: number } | null>[] = Array.from({ length: n + 1 }, () => ({ a: null, b: null, c: null }));
  for (const s of sets) cost[n]![s] = 0;
  const take = (i: number, s: CodeSet): number => {
    const c = codes[i]!;
    if (s === 'a') return inA(c) ? 1 : 0;
    if (s === 'b') return inB(c) ? 1 : 0;
    if (c === FNC1) return 1;
    return i + 1 < n && isDigit(c) && isDigit(codes[i + 1]!) ? 2 : 0;
  };
  for (let i = n - 1; i >= 0; i--) {
    // Stay in the set when it can take the next character.
    for (const s of sets) {
      const t = take(i, s);
      if (t) {
        const v = 1 + cost[i + t]![s];
        if (v < cost[i]![s]) {
          cost[i]![s] = v;
          step[i]![s] = { set: s, take: t };
        }
      }
    }
    // Or switch to another set first (one extra symbol).
    for (const s of sets) {
      for (const o of sets) {
        if (o === s || !step[i]![o]) continue;
        const v = 1 + cost[i]![o];
        if (v < cost[i]![s]) {
          cost[i]![s] = v;
          step[i]![s] = { set: o, take: 0 };
        }
      }
    }
  }
  let best: CodeSet | null = null;
  for (const s of sets) if (cost[0]![s] < INF && (best === null || cost[0]![s] < cost[0]![best])) best = s;
  if (best === null) return undefined;
  const out = [START[best]];
  let s = best;
  let i = 0;
  while (i < n) {
    const st = step[i]![s]!;
    if (st.take === 0) {
      out.push(SWITCH_TO[st.set]);
      s = st.set;
      continue;
    }
    const c = codes[i]!;
    if (c === FNC1) out.push(102);
    else if (s === 'c') out.push(Number(String.fromCharCode(c, codes[i + 1]!)));
    else if (s === 'a') out.push(c < 32 ? c + 64 : c - 32);
    else out.push(c - 32);
    i += st.take;
  }
  let sum = out[0]!;
  for (let k = 1; k < out.length; k++) sum += out[k]! * k;
  out.push(sum % 103, 106);
  return out;
}

function code128Symbol(values: readonly number[], text: string): LinearSymbol {
  return { kind: 'linear', modules: values.map((v) => widthsToModules(C128[v]!)).join(''), text, quietZone: 10 };
}

export function encodeCode128(value: string, options: { readonly codeSet?: CodeSet | undefined } = {}): EncodeResult<LinearSymbol> {
  if (!value) return fail('empty value');
  const codes = [...value].map((ch) => ch.charCodeAt(0));
  if (codes.some((c) => c > 127)) return fail('Code 128 encodes ASCII 0-127 only');
  const values = code128Values(codes, options.codeSet);
  if (!values) return fail(`value cannot be encoded in code set ${String(options.codeSet).toUpperCase()}`);
  return { ok: true, symbol: code128Symbol(values, value) };
}

// GS1 application identifiers with a predefined total length (AI digits included), keyed by the first two digits.
const GS1_FIXED: Record<string, number> = {
  '00': 20, '01': 16, '02': 16, '03': 16, '04': 18, '11': 8, '12': 8, '13': 8, '14': 8, '15': 8, '16': 8, '17': 8, '18': 8, '19': 8, '20': 4,
  '31': 10, '32': 10, '33': 10, '34': 10, '35': 10, '36': 10, '41': 16,
};

export interface Gs1Element {
  readonly ai: string;
  readonly data: string;
}

/**
 * Parses GS1 element strings written `(01)09501101530003(10)ABC` into
 * application identifiers and data. Returns undefined when the input has no
 * parenthesized AIs or an AI is not 2 to 4 digits.
 */
export function parseGs1(value: string): Gs1Element[] | undefined {
  const re = /\((\d{2,4})\)([^(]*)/g;
  const out: Gs1Element[] = [];
  let consumed = 0;
  for (let m = re.exec(value); m; m = re.exec(value)) {
    if (m.index !== consumed) return undefined;
    out.push({ ai: m[1]!, data: m[2]! });
    consumed = re.lastIndex;
  }
  return out.length && consumed === value.length ? out : undefined;
}

/** GS1 element string as character codes with FNC1 (-1) separators after variable-length elements. */
export function gs1Codes(elements: readonly Gs1Element[], separator = FNC1): number[] {
  const codes: number[] = [];
  elements.forEach((el, i) => {
    for (const ch of el.ai + el.data) codes.push(ch.charCodeAt(0));
    const fixed = GS1_FIXED[el.ai.slice(0, 2)];
    if (i < elements.length - 1 && fixed === undefined) codes.push(separator);
  });
  return codes;
}

/** Validates the fixed lengths and the mod-10 check digit of AI (01) / (00). */
export function gs1Problem(elements: readonly Gs1Element[]): string | undefined {
  for (const el of elements) {
    const fixed = GS1_FIXED[el.ai.slice(0, 2)];
    if (fixed !== undefined && el.ai.length + el.data.length !== fixed) return `AI (${el.ai}) needs ${fixed - el.ai.length} characters`;
    if ((el.ai === '01' || el.ai === '00') && !/^\d+$/.test(el.data)) return `AI (${el.ai}) is numeric`;
    if ((el.ai === '01' || el.ai === '00') && mod10Check(el.data.slice(0, -1)) !== Number(el.data.slice(-1))) return `invalid check digit in AI (${el.ai})`;
  }
  return undefined;
}

export function encodeGs1Code128(value: string): EncodeResult<LinearSymbol> {
  const elements = parseGs1(value);
  if (!elements) return fail('GS1-128 needs application identifiers written as (AI)data');
  const problem = gs1Problem(elements);
  if (problem) return fail(problem);
  const values = code128Values([FNC1, ...gs1Codes(elements)]);
  if (!values) return fail('value cannot be encoded');
  return { ok: true, symbol: code128Symbol(values, elements.map((e) => `(${e.ai})${e.data}`).join('')) };
}

// ---------------------------------------------------------------- EAN / UPC

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_R = EAN_L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
const EAN_G = EAN_R.map((p) => [...p].reverse().join(''));
const EAN13_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const UPCE_PARITY = ['GGGLLL', 'GGLGLL', 'GGLLGL', 'GGLLLG', 'GLGGLL', 'GLLGGL', 'GLLLGG', 'GLGLGL', 'GLGLLG', 'GLLGLG'];

/** GS1 mod-10 check digit (weights 3, 1 from the right) of `digits`. */
export function mod10Check(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

function withCheck(value: string, length: number, name: string): { digits?: string; reason?: string } {
  if (!/^\d+$/.test(value)) return { reason: `${name} is numeric` };
  if (value.length === length - 1) return { digits: value + String(mod10Check(value)) };
  if (value.length !== length) return { reason: `${name} needs ${length - 1} or ${length} digits` };
  if (mod10Check(value.slice(0, -1)) !== Number(value[length - 1])) return { reason: `invalid ${name} check digit` };
  return { digits: value };
}

const enc = (digit: string, set: string): string => (set === 'L' ? EAN_L : set === 'G' ? EAN_G : EAN_R)[Number(digit)]!;

export function encodeEan13(value: string): EncodeResult<LinearSymbol> {
  const { digits, reason } = withCheck(value, 13, 'EAN-13');
  if (!digits) return fail(reason!);
  const parity = EAN13_PARITY[Number(digits[0])]!;
  let left = '';
  for (let i = 1; i <= 6; i++) left += enc(digits[i]!, parity[i - 1]!);
  let right = '';
  for (let i = 7; i <= 12; i++) right += enc(digits[i]!, 'R');
  const modules = `101${left}01010${right}101`;
  return {
    ok: true,
    symbol: {
      kind: 'linear', modules, text: digits, quietZone: 11,
      guards: [[0, 3], [45, 50], [92, 95]],
      textSegments: [[digits[0]!, -8, -1], [digits.slice(1, 7), 3, 45], [digits.slice(7), 50, 92]],
    },
  };
}

export function encodeEan8(value: string): EncodeResult<LinearSymbol> {
  const { digits, reason } = withCheck(value, 8, 'EAN-8');
  if (!digits) return fail(reason!);
  let left = '';
  for (let i = 0; i < 4; i++) left += enc(digits[i]!, 'L');
  let right = '';
  for (let i = 4; i < 8; i++) right += enc(digits[i]!, 'R');
  return {
    ok: true,
    symbol: { kind: 'linear', modules: `101${left}01010${right}101`, text: digits, quietZone: 7, guards: [[0, 3], [31, 36], [64, 67]], textSegments: [[digits.slice(0, 4), 3, 31], [digits.slice(4), 36, 64]] },
  };
}

export function encodeUpcA(value: string): EncodeResult<LinearSymbol> {
  const { digits, reason } = withCheck(value, 12, 'UPC-A');
  if (!digits) return fail(reason!);
  const ean = encodeEan13(`0${digits}`);
  if (!ean.ok) return ean;
  return {
    ok: true,
    symbol: {
      ...ean.symbol, text: digits, quietZone: 9,
      guards: [[0, 10], [45, 50], [85, 95]],
      textSegments: [[digits[0]!, -8, -1], [digits.slice(1, 6), 10, 45], [digits.slice(6, 11), 50, 85], [digits[11]!, 96, 103]],
    },
  };
}

/** UPC-E (6 digits, number system and check digit optional) expanded to its UPC-A digits (without check). */
export function upcEToUpcA(six: string, numberSystem: string): string {
  const [d1, d2, d3, d4, d5, d6] = six;
  if (d6 === '0' || d6 === '1' || d6 === '2') return `${numberSystem}${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  if (d6 === '3') return `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}`;
  if (d6 === '4') return `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}`;
  return `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${d6}`;
}

export function encodeUpcE(value: string): EncodeResult<LinearSymbol> {
  if (!/^\d{6,8}$/.test(value)) return fail('UPC-E needs 6 digits, optionally with the number system and the check digit');
  const ns = value.length >= 7 ? value[0]! : '0';
  if (ns !== '0' && ns !== '1') return fail('UPC-E number system is 0 or 1');
  const six = value.length >= 7 ? value.slice(1, 7) : value;
  const upcA = upcEToUpcA(six, ns);
  const check = mod10Check(upcA);
  if (value.length === 8 && Number(value[7]) !== check) return fail('invalid UPC-E check digit');
  const parity = UPCE_PARITY[check]!;
  let body = '';
  for (let i = 0; i < 6; i++) {
    const p = parity[i]!;
    body += enc(six[i]!, ns === '0' ? p : p === 'G' ? 'L' : 'G');
  }
  const text = `${ns}${six}${check}`;
  return {
    ok: true,
    symbol: { kind: 'linear', modules: `101${body}010101`, text, quietZone: 9, guards: [[0, 3], [45, 51]], textSegments: [[ns, -8, -1], [six, 3, 45], [String(check), 52, 59]] },
  };
}

// ---------------------------------------------------------------- ITF-14

const ITF = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];

export function encodeItf14(value: string): EncodeResult<LinearSymbol> {
  const { digits, reason } = withCheck(value, 14, 'ITF-14');
  if (!digits) return fail(reason!);
  let modules = '1010';
  for (let i = 0; i < 14; i += 2) {
    const a = ITF[Number(digits[i])]!;
    const b = ITF[Number(digits[i + 1])]!;
    for (let k = 0; k < 5; k++) {
      modules += '1'.repeat(a[k] === 'w' ? 3 : 1);
      modules += '0'.repeat(b[k] === 'w' ? 3 : 1);
    }
  }
  modules += '11101';
  return { ok: true, symbol: { kind: 'linear', modules, text: digits, quietZone: 10 } };
}
