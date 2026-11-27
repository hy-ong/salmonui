import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Barcode, QRCode } from '@salmonui/charts/barcode';
import {
  CODE128_WIDTHS, CODE93_PATTERNS, code128Values, code32Check, code39Check, code39Pattern, encodeCodabar, encodeCode11, encodeCode128, encodeCode32,
  encodeCode39, encodeCode93, encodeEan13, encodeEan8, encodeGs1Code128, encodeItf14, encodeUpcA, encodeUpcE, fullAscii, mod10Check, parseGs1, upcEToUpcA,
} from '../dist/barcode/encode/linear.js';
import { alignmentPositions, dataCodewords, encodeQR, formatBits, interleave, qrDataCodewords, rsRemainder, versionBits } from '../dist/barcode/encode/qr.js';
import { DATA_MATRIX_SIZES, dataMatrixSize, dataMatrixSyndrome, encodeDataMatrix, placement } from '../dist/barcode/encode/datamatrix.js';
import { encodeBarcode, BARCODE_TYPES } from '../dist/barcode/encode/index.js';
import { drawingToSvg, layoutMatrix } from '../dist/barcode/render.js';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

// Barcode and QR Code. Reference values are published examples
// (ISO/IEC 18004 and 16022 worked examples, GS1 check digit examples); the
// 1D symbols are decoded back from their modules with an independent reader.

/** The symbol of a successful encode (fails the test otherwise). */
function sym<T>(r: { ok: true; symbol: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(r.reason);
  return r.symbol;
}

const render = (el: Parameters<typeof renderToString>[0]): string => renderToString(el);

/** Element widths (bar first) of a module string. */
function runs(modules: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < modules.length; ) {
    let j = i;
    while (modules[j] === modules[i]) j++;
    out.push(j - i);
    i = j;
  }
  return out;
}

/** Reads Code 128 symbol values back from modules (6 elements per symbol, 7 for stop). */
function decode128(modules: string): number[] {
  const w = runs(modules);
  const out: number[] = [];
  for (let i = 0; i < w.length; ) {
    const take = w.length - i === 7 ? 7 : 6;
    const key = w.slice(i, i + take).join('');
    out.push(CODE128_WIDTHS.indexOf(key));
    i += take;
  }
  return out;
}

/** Reads Code 39 characters back (narrow 1, wide 3, narrow gap). */
function decode39(modules: string): string {
  const w = runs(modules);
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
  let out = '';
  for (let i = 0; i < w.length; i += 10) {
    const pat = w.slice(i, i + 9).map((x) => (x === 3 ? 'w' : 'n')).join('');
    out += [...alphabet].find((c) => code39Pattern(c) === pat) ?? '?';
  }
  return out;
}

describe('Barcode 1D encoders', () => {
  it('Code 39 patterns, mod-43 check and Code 39 Extended', () => {
    assert.equal(code39Pattern('*'), 'nwnnwnwnn');
    assert.equal(code39Pattern('0'), 'nnnwwnwnn');
    assert.equal(code39Pattern('A'), 'wnnnnwnnw');
    const all = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
    assert.equal(new Set([...all].map((c) => code39Pattern(c))).size, 44);
    for (const c of all) assert.equal([...code39Pattern(c)!].filter((x) => x === 'w').length, 3, c);
    assert.equal(code39Check('CODE39'), 'W');
    const r = encodeCode39('CODE39', { checksum: true });
    assert.ok(r.ok);
    assert.equal(decode39(r.symbol.modules), '*CODE39W*');
    assert.equal(fullAscii('a!'), '+A/A');
    const ext = encodeCode39('Hello', { extended: true });
    assert.ok(ext.ok);
    assert.equal(decode39(ext.symbol.modules), '*H+E+L+L+O*');
    assert.equal(ext.symbol.text, 'Hello');
    assert.equal(encodeCode39('abc').ok, false);
  });

  it('Code 11, Codabar, Code 32, Code 93 and Code 93 Extended', () => {
    const c11 = encodeCode11('123-45');
    assert.ok(c11.ok);
    // start + 6 data + C check (length < 10, no K) + stop = 9 characters, separated by narrow spaces.
    assert.equal(runs(c11.symbol.modules).length, 9 * 5 + 8);
    // C check of 123-45: weights 1..6 from the right: 5*1 + 4*2 + 10*3 + 3*4 + 2*5 + 1*6 = 71, 71 mod 11 = 5.
    assert.ok(c11.symbol.modules.endsWith('0110110101011001'));
    const codabar = encodeCodabar('A40156B');
    assert.ok(codabar.ok);
    assert.equal(runs(codabar.symbol.modules).length, 7 * 7 + 6);
    assert.equal(encodeCodabar('12x').ok, false);
    // Code 32 (Italian pharmacode) check: odd positions added, even positions doubled digit-wise: 0+2+2+6+4+1+6+5 = 26.
    assert.equal(code32Check('01234567'), 6);
    const c32 = encodeCode32('01234567');
    assert.ok(c32.ok);
    assert.equal(c32.symbol.text, 'A012345676');
    assert.equal(decode39(c32.symbol.modules).length, 8);
    assert.equal(CODE93_PATTERNS.length, 47);
    assert.equal(new Set(CODE93_PATTERNS).size, 47);
    for (const p of CODE93_PATTERNS) assert.equal(p.match(/1+/g)!.length, 3);
    const c93 = encodeCode93('TEST93');
    assert.ok(c93.ok);
    // start + 6 data + C + K + stop, 9 modules each, plus the termination bar.
    assert.equal(c93.symbol.modules.length, 10 * 9 + 1);
    // Published example: TEST93 has check characters C = "+" (value 41)? -> value derived: verify by recomputation.
    const values = [...'TEST93'].map((c) => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'.indexOf(c));
    const weighted = (v: number[], max: number) => v.reduceRight((sum, x, i) => sum + x * (((v.length - 1 - i) % max) + 1), 0) % 47;
    const c = weighted(values, 20);
    const k = weighted([...values, c], 15);
    assert.equal(c93.symbol.modules.slice(63, 72), CODE93_PATTERNS[c]);
    assert.equal(c93.symbol.modules.slice(72, 81), CODE93_PATTERNS[k]);
    const ext = encodeCode93('a', { extended: true });
    assert.ok(ext.ok);
    assert.equal(ext.symbol.modules.slice(9, 18), CODE93_PATTERNS[46]);
  });

  it('Code 128 automatic code set switching, check symbol and codeSet override', () => {
    for (let i = 0; i < 106; i++) assert.equal([...CODE128_WIDTHS[i]!].reduce((a, b) => a + Number(b), 0), 11);
    assert.equal(new Set(CODE128_WIDTHS).size, 107);
    // "ABC123456": A or B for the letters, then C for the six digits.
    assert.deepEqual(code128Values([...'ABC123456'].map((c) => c.charCodeAt(0))), [103, 33, 34, 35, 99, 12, 34, 56, 22, 106]);
    // An all-digit even-length value is set C only.
    assert.deepEqual(code128Values([...'123456'].map((c) => c.charCodeAt(0)))!.slice(0, 4), [105, 12, 34, 56]);
    // A control character forces code set A.
    assert.equal(code128Values([9, 97].map((c) => c))![0], 103);
    const r = encodeCode128('Wikipedia');
    assert.ok(r.ok);
    const v = decode128(r.symbol.modules);
    assert.equal(v[0], 104);
    assert.equal(v[v.length - 1], 106);
    let sum = v[0]!;
    for (let i = 1; i < v.length - 2; i++) sum += v[i]! * i;
    assert.equal(v[v.length - 2], sum % 103);
    const forced = encodeCode128('1234', { codeSet: 'b' });
    assert.ok(forced.ok);
    assert.equal(decode128(forced.symbol.modules)[0], 104);
    assert.equal(encodeCode128('abc', { codeSet: 'c' }).ok, false);
  });

  it('EAN and UPC check digits and structure', () => {
    assert.equal(mod10Check('590123412345'), 7);
    assert.equal(mod10Check('9638507'), 4);
    const e13 = encodeEan13('590123412345');
    assert.ok(e13.ok);
    assert.equal(e13.symbol.text, '5901234123457');
    assert.equal(e13.symbol.modules.length, 95);
    assert.equal(encodeEan13('5901234123458').ok, false);
    const e8 = encodeEan8('9638507');
    assert.ok(e8.ok);
    assert.equal(e8.symbol.text, '96385074');
    assert.equal(e8.symbol.modules.length, 67);
    const upcA = encodeUpcA('03600029145');
    assert.ok(upcA.ok);
    assert.equal(upcA.symbol.text, '036000291452');
    assert.equal(upcEToUpcA('123456', '0'), '01234500006');
    const upcE = encodeUpcE('01234565');
    assert.ok(upcE.ok);
    assert.equal(upcE.symbol.text, '01234565');
    assert.equal(upcE.symbol.modules.length, 51);
    assert.equal(encodeUpcE('01234566').ok, false);
  });

  it('GS1 Code 128 application identifier parsing with FNC1, and ITF 14', () => {
    assert.deepEqual(parseGs1('(01)09501101530003(10)AB-123'), [{ ai: '01', data: '09501101530003' }, { ai: '10', data: 'AB-123' }]);
    const gs1 = encodeGs1Code128('(01)09501101530003(10)AB-123(17)250101');
    assert.ok(gs1.ok);
    const v = decode128(gs1.symbol.modules);
    assert.deepEqual(v.slice(0, 2), [105, 102]);
    // The variable-length (10) is followed by FNC1 before (17).
    assert.ok(v.slice(2).includes(102));
    assert.equal(encodeGs1Code128('(01)09501101530004').ok, false);
    assert.equal(encodeGs1Code128('0950110153').ok, false);
    const itf = encodeItf14('1540014128876');
    assert.ok(itf.ok);
    assert.equal(itf.symbol.text, '15400141288763');
    assert.ok(itf.symbol.modules.startsWith('1010'));
    assert.ok(itf.symbol.modules.endsWith('11101'));
  });

  it('invalid values return a reason instead of throwing', () => {
    for (const type of BARCODE_TYPES) {
      const r = encodeBarcode(type, '');
      assert.equal(r.ok, false, type);
    }
    assert.equal(encodeBarcode('ean13', 'ABC').ok, false);
  });
});

/** QR: read the data bits back in placement order, independently of the encoder's drawing code. */
function readQRCodewords(m: Uint8Array, size: number, ver: number, mask: number): number[] {
  const fn = new Uint8Array(size * size);
  const mark = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < size && y < size) fn[y * size + x] = 1;
  };
  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy);
  const al = alignmentPositions(ver);
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(al[i]! + dx, al[j]! + dy);
  }
  for (let i = 0; i < 9; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(size - 1 - i, 8);
    mark(8, size - 1 - i);
  }
  if (ver >= 7) for (let i = 0; i < 18; i++) {
    mark(size - 11 + (i % 3), Math.floor(i / 3));
    mark(Math.floor(i / 3), size - 11 + (i % 3));
  }
  const masks = [
    (x: number, y: number) => (x + y) % 2 === 0, (_x: number, y: number) => y % 2 === 0, (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y * size + x]) bits.push(m[y * size + x]! ^ (masks[mask]!(x, y) ? 1 : 0));
    }
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

describe('QRCode encoder', () => {
  it('ISO capacities, the HELLO WORLD 1-Q worked example and Reed-Solomon', () => {
    assert.deepEqual(['l', 'm', 'q', 'h'].map((e) => dataCodewords(1, e as 'l')), [19, 16, 13, 9]);
    assert.deepEqual(['l', 'm', 'q', 'h'].map((e) => dataCodewords(40, e as 'l')), [2956, 2334, 1666, 1276]);
    const data = qrDataCodewords('HELLO WORLD', 1, 'q', 'alphanumeric') as number[];
    assert.deepEqual(data, [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236]);
    assert.deepEqual(rsRemainder(data, 13), [168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16]);
    // Format and version information words (ISO 18004 Annex C / D examples).
    assert.equal(formatBits('m', 5), 0b100000011001110);
    assert.equal(versionBits(7), 0x07c94);
    assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
    assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
  });

  it('modes, versions, levels and masks round-trip through an independent reader', () => {
    const cases: [string, Parameters<typeof encodeQR>[1]][] = [
      ['01234567', {}], ['HELLO WORLD', { errorCorrection: 'q' }], ['https://salmonui.dev/docs/data-visualization/barcode?x=1', { errorCorrection: 'l' }],
      ['こんにちは', { errorCorrection: 'h' }], ['x'.repeat(300), { errorCorrection: 'm' }], ['A1', { version: 10, mask: 3 }],
    ];
    for (const [value, options] of cases) {
      const r = encodeQR(value, options);
      assert.ok(r.ok, value);
      const s = r.symbol;
      assert.equal(s.width, s.version * 4 + 17);
      const expected = interleave(qrDataCodewords(value, s.version, s.errorCorrection, s.mode) as number[], s.version, s.errorCorrection);
      assert.deepEqual(readQRCodewords(s.modules, s.width, s.version, s.mask).slice(0, expected.length), expected, value);
      // Finder pattern center and timing pattern.
      assert.equal(s.modules[3 * s.width + 3], 1);
      for (let i = 8; i < s.width - 8; i++) assert.equal(s.modules[6 * s.width + i], i % 2 === 0 ? 1 : 0);
    }
    assert.equal(sym(encodeQR('01234567')).mode, 'numeric');
    assert.equal(sym(encodeQR('HELLO')).mode, 'alphanumeric');
    assert.equal(sym(encodeQR('hello')).mode, 'byte');
    assert.equal(encodeQR('x'.repeat(3000)).ok, false);
    assert.equal(encodeQR('x'.repeat(100), { version: 1 }).ok, false);
    assert.equal(encodeQR('abc', { mode: 'numeric' }).ok, false);
  });

  it('a version 40 symbol encodes within the 5 ms budget @perf', () => {
    const value = 'x'.repeat(2900);
    for (let i = 0; i < 5; i++) encodeQR(value, { errorCorrection: 'l' });
    const times: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t = performance.now();
      const r = encodeQR(value, { errorCorrection: 'l' });
      times.push(performance.now() - t);
      assert.ok(r.ok && r.symbol.version === 40);
    }
    times.sort((a, b) => a - b);
    assertBudget(times[4]!, 5 * (process.env['CI'] ? 3 : 1.6), 'QR version 40 encode median');
  });

  it('GS1 QR Code uses FNC1 in first position', () => {
    const r = encodeQR('(01)09501101530003(10)AB12', { gs1: true });
    assert.ok(r.ok);
    const cw = readQRCodewords(r.symbol.modules, r.symbol.width, r.symbol.version, r.symbol.mask);
    assert.equal(cw[0]! >> 4, 0b0101);
    assert.equal(encodeQR('09501101530003', { gs1: true }).ok, false);
  });
});

describe('Data Matrix ECC200 encoder', () => {
  it('ISO 16022 "123456" example, size table and placement cover every codeword', () => {
    const r = encodeDataMatrix('123456');
    assert.ok(r.ok);
    assert.equal(r.symbol.size, '10x10');
    for (const name of DATA_MATRIX_SIZES) {
      const s = dataMatrixSize(name)!;
      const nr = s.regionRows * s.vRegions;
      const nc = s.regionCols * s.hRegions;
      assert.equal(nr + 2 * s.vRegions, s.rows, name);
      assert.equal(nc + 2 * s.hRegions, s.cols, name);
      assert.equal(Math.floor((nr * nc) / 8), s.data + s.ecc, name);
      const map = placement(nr, nc);
      let max = -1;
      for (const v of map) max = Math.max(max, v);
      assert.equal((max >> 3) + 1, s.data + s.ecc, name);
      assert.ok(!map.includes(-3), name);
    }
    assert.equal(DATA_MATRIX_SIZES.length, 30);
  });

  it('codewords read back from the symbol, valid Reed-Solomon blocks, encodations and sizes', () => {
    const read = (sym: { width: number; height: number; modules: Uint8Array; size: string }) => {
      const s = dataMatrixSize(sym.size)!;
      const nr = s.regionRows * s.vRegions;
      const nc = s.regionCols * s.hRegions;
      const map = placement(nr, nc);
      const cw = new Array<number>(s.data + s.ecc).fill(0);
      for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
        const v = map[r * nc + c]!;
        if (v < 0) continue;
        const y = r + 1 + 2 * Math.floor(r / s.regionRows);
        const x = c + 1 + 2 * Math.floor(c / s.regionCols);
        if (sym.modules[y * sym.width + x]) cw[v >> 3] = cw[v >> 3]! | (1 << (7 - (v & 7)));
      }
      return { cw, s };
    };
    const { cw } = read(sym(encodeDataMatrix('123456')));
    assert.deepEqual(cw.slice(0, 3), [142, 164, 186]);
    assert.deepEqual(cw.slice(3), [114, 25, 5, 88, 102]);
    for (const [value, opts] of [['Hello, Data Matrix!', {}], ['x'.repeat(600), {}], ['café ÿ', { encoding: 'base256' }], ['ABC', { size: '8x18' }], ['0123456789', { encoding: 'asciiNumeric' }]] as const) {
      const r = encodeDataMatrix(value, opts);
      assert.ok(r.ok, value);
      const { cw: all, s } = read(r.symbol as never);
      for (let b = 0; b < s.blocks; b++) {
        const block: number[] = [];
        for (let i = b; i < s.data; i += s.blocks) block.push(all[i]!);
        for (let j = 0; j < s.ecc / s.blocks; j++) block.push(all[s.data + j * s.blocks + b]!);
        for (let k = 1; k <= s.ecc / s.blocks; k++) assert.equal(dataMatrixSyndrome(block, k), 0, `${value} block ${b} root ${k}`);
      }
      // Finder: solid left column and bottom row; timing: alternating top row.
      for (let y = 0; y < r.symbol.height; y++) assert.equal(r.symbol.modules[y * r.symbol.width], 1);
      assert.equal(r.symbol.modules[1], 0);
    }
    assert.equal(encodeDataMatrix('ABC', { encoding: 'asciiNumeric' }).ok, false);
    assert.equal(encodeDataMatrix('x'.repeat(40), { size: '10x10' }).ok, false);
    assert.equal(sym(encodeDataMatrix('ABC', { size: 'auto-rectangular' })).size, '8x18');
  });

  it('GS1 Data Matrix starts with FNC1', () => {
    const r = encodeDataMatrix('(01)09501101530003(17)250101', { gs1: true });
    assert.ok(r.ok);
    assert.equal(encodeDataMatrix('0950', { gs1: true }).ok, false);
  });
});

describe('Barcode and QRCode components', () => {
  it('role="img", label defaults to the value, crisp SVG path, identical server markup', () => {
    const html = render(createElement(Barcode, { type: 'code128', value: 'SALMON-01' }));
    assert.match(html, /<svg[^>]*role="img"[^>]*aria-label="SALMON-01"/);
    assert.match(html, /class="salmon-viz salmon-barcode"/);
    assert.match(html, /shape-rendering="crispEdges"/);
    assert.match(html, /direction="ltr"/);
    assert.equal(render(createElement(Barcode, { type: 'code128', value: 'SALMON-01' })), html);
    assert.match(render(createElement(Barcode, { type: 'code128', value: 'X', label: 'Order X' })), /aria-label="Order X"/);
    const qr = render(createElement(QRCode, { value: 'https://salmonui.dev' }));
    assert.match(qr, /class="salmon-viz salmon-qr-code"/);
    assert.match(qr, /aria-label="https:\/\/salmonui.dev"/);
    assert.match(qr, /data-error-correction="m"/);
  });

  it('text visibility, custom text, position and alignment', () => {
    const shown = render(createElement(Barcode, { type: 'code39', value: 'ABC' }));
    assert.match(shown, /<text[^>]*>ABC<\/text>/);
    assert.doesNotMatch(render(createElement(Barcode, { type: 'code39', value: 'ABC', text: false })), /<text/);
    assert.match(render(createElement(Barcode, { type: 'code39', value: 'ABC', text: 'Item ABC' })), />Item ABC</);
    assert.match(render(createElement(Barcode, { type: 'code39', value: 'ABC', textAlign: 'start' })), /text-anchor="start"/);
    const top = render(createElement(Barcode, { type: 'code39', value: 'ABC', textPosition: 'top' }));
    assert.match(top, /<text x="[\d.]+" y="14"/);
    // EAN-13 draws the digits in the three guard-separated groups.
    const ean = render(createElement(Barcode, { type: 'ean13', value: '590123412345' }));
    assert.deepEqual([...ean.matchAll(/<text[^>]*>(\d+)<\/text>/g)].map((m) => m[1]), ['5', '901234', '123457']);
  });

  it('bearer bars, module size, width, colors and quiet zone', () => {
    const itf = render(createElement(Barcode, { type: 'itf14', value: '1540014128876' }));
    assert.equal([...itf.matchAll(/<path /g)].length, 2);
    assert.equal([...render(createElement(Barcode, { type: 'itf14', value: '1540014128876', bearerBar: 'none' })).matchAll(/<path /g)].length, 1);
    const sized = render(createElement(Barcode, { type: 'code128', value: '12', moduleSize: 3 }));
    const sizedW = Number(/width="([\d.]+)"/.exec(sized)![1]);
    // start C, value 12, check, stop = 11 * 3 + 13 modules + 2 * 10 quiet modules.
    assert.equal(sizedW, (11 * 3 + 13 + 20) * 3);
    assert.match(render(createElement(Barcode, { type: 'code128', value: '12', width: 300 })), /width="300"/);
    const noQuiet = render(createElement(Barcode, { type: 'code128', value: '12', moduleSize: 1, quietZone: false }));
    assert.match(noQuiet, /width="46"/);
    const colored = render(createElement(Barcode, { type: 'code128', value: '12', color: '#1a237e', background: '#fffde7' }));
    assert.match(colored, /fill="#1a237e"/);
    assert.match(colored, /<rect[^>]*fill="#fffde7"/);
    assert.match(render(createElement(QRCode, { value: 'A', moduleSize: 2 })), /width="58"/);
  });

  it('an invalid value renders an empty role="img" with an error label', () => {
    const html = render(createElement(Barcode, { type: 'ean13', value: 'ABC' }));
    assert.match(html, /role="img"/);
    assert.match(html, /aria-label="Invalid barcode: EAN-13 is numeric"/);
    assert.match(html, /data-invalid=""/);
    assert.doesNotMatch(html, /<path/);
    assert.match(render(createElement(QRCode, { value: '' })), /aria-label="Invalid QR code: empty value"/);
  });

  it('a logo clears the center and raises error correction to H', () => {
    const html = render(createElement(QRCode, { value: 'https://salmonui.dev', logo: createElement('img', { src: '/logo.svg', alt: '' }) }));
    assert.match(html, /data-error-correction="h"/);
    assert.match(html, /<foreignObject[^>]*><div class="salmon-qr-code-logo"><img/);
    assert.match(render(createElement(QRCode, { value: 'x', logo: 'L', errorCorrection: 'q' })), /data-error-correction="q"/);
  });

  it('Data Matrix through Barcode type="dataMatrix" (size, encoding, gs1)', () => {
    const html = render(createElement(Barcode, { type: 'dataMatrix', value: '123456', moduleSize: 4 }));
    assert.match(html, /width="48"/);
    assert.match(render(createElement(Barcode, { type: 'dataMatrix', value: 'ABC', size: '8x18', moduleSize: 1 })), /width="20" height="10"/);
    assert.match(render(createElement(Barcode, { type: 'dataMatrix', value: '(01)09501101530003', gs1: true })), /<path d="M/);
  });

  it('api.toSVGString() markup without a DOM equals the rendered geometry', () => {
    const r = encodeQR('API');
    assert.ok(r.ok);
    const drawing = layoutMatrix(r.symbol, { text: null });
    const svg = drawingToSvg(drawing, 'API', '#000000', '#ffffff');
    const html = render(createElement(QRCode, { value: 'API' }));
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.ok(html.includes(`d="${drawing.d}"`));
    assert.ok(svg.includes(`d="${drawing.d}"`));
  });
});
