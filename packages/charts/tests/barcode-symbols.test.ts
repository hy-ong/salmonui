import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DotCode } from '@salmonui/charts/barcode/dotcode';
import { Gs1DataBar } from '@salmonui/charts/barcode/gs1-databar';
import { Pdf417 } from '@salmonui/charts/barcode/pdf417';
import { encodePdf417, pdf417DataCodewords, pdf417ErrorCodewords, pdf417Patterns } from '../dist/barcode/encode/pdf417.js';
import { BARCODE_TYPES } from '../dist/barcode/encode/index.js';
import { encodeDataBar, type DataBarVariant } from '../dist/barcode/encode/databar.js';
import { dotCodeCodewords, dotCodeReedSolomon, encodeDotCode } from '../dist/barcode/encode/dotcode.js';

// PDF417, GS1 DataBar and DotCode. The reference symbols are
// published examples: ISO/IEC 15438:2015 Figure 1, Annex Q and Figure G.1
// (module rows as transcribed in the BSD-licensed zint test suite,
// backend/tests/test_pdf417.c), ISO/IEC 15438 Annex D (numeric compaction)
// and the first and last entries of the ISO/IEC 15438 Annex A cluster tables;
// for GS1 DataBar, ISO/IEC 24724:2011 Figures 1 to 13, F.2 and F.3, the
// encodation method examples of 7.2.5.4, GS1 General Specifications figures
// and NACAG coupon figures (module rows as transcribed in zint's
// backend/tests/test_rss.c); for DotCode, AIM ISS DotCode Rev 4.0 Figures 1
// and 5 to 8, Table G.1 and 5.2.1.4 Table 4 and GS1 General Specifications
// Figure 5.1-8 (zint's backend/tests/test_dotcode.c transcriptions), plus
// zint vectors it cross-checked against BWIPP and TEC-IT.

function sym<T>(r: { ok: true; symbol: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(r.reason);
  return r.symbol;
}

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

const ISO_FIGURE_1 = [
  '1111111101010100011101010011100000111010110011110001110111011001100011110101011110000111111101000101001',
  '1111111101010100011111010100110000110100001110001001111010001010000011111010100110000111111101000101001',
  '1111111101010100011101010111111000101100110111100001110111111000101011010100111110000111111101000101001',
  '1111111101010100010101111101111100100000100100000101000101000100000010101111001111000111111101000101001',
  '1111111101010100011010111000100000111100100000101001001000011111011011010111000100000111111101000101001',
  '1111111101010100011110101111010000100111100001010001100111110010010011110101111001000111111101000101001',
  '1111111101010100010100111001110000101110001110100001111001101000111011010011101111000111111101000101001',
  '1111111101010100011010111111011110111101011001100001010011111101110011010111111011110111111101000101001',
  '1111111101010100011010011011111100110000101001111101101111100010001010100110011111000111111101000101001',
  '1111111101010100010100011000001100100010111101111001100011100011001011010001100011100111111101000101001',
];
const ISO_ANNEX_Q = [
  '1111111101010100011110101011110000110101000110000001110111011001100011110101011110000111111101000101001',
  '1111111101010100011111101010011100110100001110001001111010001010000011111101010111000111111101000101001',
  '1111111101010100011101010111111000101100110011110001100011111001001011101010011111100111111101000101001',
  '1111111101010100010101111001111000101011101110000001100001101000100010101111001111000111111101000101001',
  '1111111101010100011101011100011000100001101011111101111110110001011011101011100110000111111101000101001',
];
const ISO_FIGURE_G1 = [
  '111111110101010001111010101111000011010100001100000111011101100110001',
  '111111110101010001111010100010000011010000111000100111101000101000001',
  '111111110101010001110101011111100010110011011110000100111110011000101',
  '111111110101010001010111100111100011001100100000010110000110001010001',
  '111111110101010001111010111000111011111011000100100101110111111000101',
  '111111110101010001111010111101000010011111001110110100011100011011101',
];

/** Reads the codewords of a PDF417 symbol back, row by row, with the cluster of each row (independent of the encoder's row builder). */
function readPdf417(rows: readonly string[], compact: boolean): { readonly left: number[]; readonly data: number[]; readonly right: number[] } {
  const table = pdf417Patterns();
  const inverse = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
  for (let k = 0; k < 3; k++) for (let v = 0; v < 929; v++) inverse[k]!.set(table[k * 929 + v]!.toString(2), v);
  const left: number[] = [];
  const right: number[] = [];
  const data: number[] = [];
  rows.forEach((row, r) => {
    assert.equal(row.slice(0, 17), '11111111010101000', 'start pattern');
    const end = compact ? row.length - 1 : row.length - 18;
    if (compact) assert.equal(row.slice(end), '1');
    else assert.equal(row.slice(end), '111111101000101001', 'stop pattern');
    const words: number[] = [];
    for (let x = 17; x < end; x += 17) {
      const v = inverse[r % 3]!.get(row.slice(x, x + 17));
      assert.ok(v !== undefined, `row ${r} codeword at ${x} belongs to cluster ${(r % 3) * 3}`);
      words.push(v);
    }
    left.push(words.shift()!);
    if (!compact) right.push(words.pop()!);
    data.push(...words);
  });
  return { left, data, right };
}

/** The codeword sequence evaluated at 3^i over GF(929): zero for every root of a valid Reed-Solomon codeword. */
function syndromes(cw: readonly number[], k: number): number[] {
  const out: number[] = [];
  for (let i = 1, root = 3; i <= k; i++, root = (root * 3) % 929) {
    let s = 0;
    for (const c of cw) s = (s * root + c) % 929;
    out.push(s);
  }
  return out;
}

describe('PDF417 encoder', () => {
  it('ISO/IEC 15438 Annex A cluster tables (first and last entries, structure)', () => {
    const t = pdf417Patterns();
    assert.equal(t.length, 2787);
    // Annex A: codewords 0, 1 and 928 of clusters 0, 3 and 6.
    assert.deepEqual([0, 1, 928].map((v) => t[v]), [0x1d5c0, 0x1eaf0, 0x1bef4]);
    assert.deepEqual([0, 1, 928].map((v) => t[929 + v]), [0x1f560, 0x1fab8, 0x13f26]);
    assert.deepEqual([0, 1, 928].map((v) => t[1858 + v]), [0x1abe0, 0x1d5f8, 0x1c7ea]);
    for (let k = 0; k < 3; k++) {
      const seen = new Set<number>();
      for (let v = 0; v < 929; v++) {
        const p = t[k * 929 + v]!;
        const w = runs(p.toString(2));
        assert.equal(p.toString(2).length, 17);
        assert.equal(w.length, 8, 'four bars and four spaces');
        assert.ok(w.every((x) => x >= 1 && x <= 6));
        assert.equal((w[0]! - w[2]! + w[4]! - w[6]! + 9) % 9, k * 3, 'cluster number');
        seen.add(p);
      }
      assert.equal(seen.size, 929);
    }
  });

  it('ISO/IEC 15438 Figure 1, Annex Q and Figure G.1 symbols, module for module', () => {
    assert.deepEqual(sym(encodePdf417('PDF417 Symbology Standard', { errorCorrection: 1, columns: 2 })).rows, ISO_FIGURE_1);
    assert.deepEqual(sym(encodePdf417('PDF417', { errorCorrection: 1, columns: 2 })).rows, ISO_ANNEX_Q);
    assert.deepEqual(sym(encodePdf417('PDF417 APK\n', { errorCorrection: 1, columns: 2, compact: true })).rows, ISO_FIGURE_G1);
    // Annex Q reads back as the length descriptor, the text codewords and 4 error correction codewords.
    const q = readPdf417(ISO_ANNEX_Q, false);
    assert.deepEqual(q.data.slice(0, 6), [6, 453, 178, 121, 239, 900], "descriptor, text, one pad");
    assert.deepEqual(syndromes(q.data, 4), [0, 0, 0, 0]);
  });

  it('compaction modes (ISO/IEC 15438 Annex D numeric example, text sub-modes, byte groups)', () => {
    assert.deepEqual(pdf417DataCodewords([...'000213298174000'].map((c) => c.charCodeAt(0)), 'numeric'), [902, 1, 624, 434, 632, 282, 200]);
    const bytes = (s: string) => [...s].map((c) => c.charCodeAt(0));
    // Text: "PD" = P(15) * 30 + D(3); F, Mixed latch (28); 4, 1; 7 and the pad (29).
    assert.deepEqual(pdf417DataCodewords(bytes('PDF417'), 'text'), [453, 178, 121, 239]);
    assert.equal(pdf417DataCodewords(bytes('abcdef'), 'byte')[0], 924, 'a multiple of 6 bytes latches 924');
    assert.equal(pdf417DataCodewords(bytes('abcdefg'), 'byte')[0], 901);
    assert.equal((pdf417DataCodewords(bytes('abcdefg'), 'byte') as number[]).length, 1 + 5 + 1, '6 bytes in 5 codewords, then 1');
    assert.equal(typeof pdf417DataCodewords(bytes('12a'), 'numeric'), 'string', 'numeric compaction rejects letters');
    assert.equal(typeof pdf417DataCodewords([0x80], 'text'), 'string', 'text compaction rejects non-text bytes');
    // Automatic: 13 digits switch to Numeric (902), a lone binary byte shifts (913), text resumes after a latch (900).
    const auto = pdf417DataCodewords(bytes('ABCDEF1234567890123VWXYZ')) as number[];
    assert.ok(auto.includes(902) && auto.includes(900));
    assert.deepEqual((pdf417DataCodewords([65, 66, 67, 68, 69, 0x80, 70, 71, 72, 73, 74]) as number[]).filter((c) => c === 913), [913]);
    assert.equal((pdf417DataCodewords(bytes('12345678')) as number[])[0], 902, 'a digits-only value goes numeric');
    assert.equal(sym(encodePdf417('ÿé', { compaction: 'byte' })).rows.length >= 3, true);
    assert.equal(encodePdf417('€').ok, false, 'ISO 8859-1 only');
  });

  it('errorCorrection levels and Reed-Solomon codewords over GF(929)', () => {
    for (let level = 0; level <= 8; level++) {
      const s = sym(encodePdf417('Salmon UI PDF417', { errorCorrection: level as 0 }));
      assert.equal(s.level, level);
      const read = readPdf417(s.rows, false);
      assert.deepEqual(syndromes(read.data, 2 << level), new Array(2 << level).fill(0), `level ${level}`);
      assert.equal(read.data[0], read.data.length - (2 << level), 'length descriptor');
    }
    // 'auto': the ISO recommended minimum by data codewords (<= 40: 2, <= 160: 3, <= 320: 4, else 5).
    assert.equal(sym(encodePdf417('short')).level, 2);
    assert.equal(sym(encodePdf417('x'.repeat(200), { compaction: 'byte' })).level, 4);
    assert.equal(sym(encodePdf417('x'.repeat(400), { compaction: 'byte' })).level, 5);
    assert.deepEqual(pdf417ErrorCodewords([6, 453, 178, 121, 239, 900], 1), readPdf417(ISO_ANNEX_Q, false).data.slice(6));
    assert.equal(encodePdf417('x', { errorCorrection: 9 as 8 }).ok, false);
  });

  it('columns, rows, row indicators, compact and rowHeightRatio', () => {
    const s = sym(encodePdf417('Salmon UI', { columns: 4, errorCorrection: 2 }));
    assert.equal(s.columns, 4);
    assert.ok(s.rows.every((r) => r.length === 17 + 17 + 4 * 17 + 17 + 18));
    const read = readPdf417(s.rows, false);
    const rows = s.rows.length;
    // Row indicators (ISO/IEC 15438 5.3.1): rows, level and columns spread over clusters.
    read.left.forEach((v, r) => {
      const base = 30 * Math.floor(r / 3);
      assert.equal(v, base + [Math.floor((rows - 1) / 3), 2 * 3 + ((rows - 1) % 3), 4 - 1][r % 3]!);
    });
    assert.equal(sym(encodePdf417('Salmon UI', { rows: 12 })).rows.length, 12);
    const both = sym(encodePdf417('Salmon UI', { rows: 6, columns: 3 }));
    assert.equal(both.rows.length, 6);
    assert.equal(both.columns, 3);
    assert.equal(encodePdf417('x'.repeat(300), { rows: 3, columns: 2 }).ok, false, 'does not fit');
    assert.equal(encodePdf417('x', { columns: 31 }).ok, false);
    assert.equal(encodePdf417('x', { rows: 2 }).ok, false);
    const c = sym(encodePdf417('Salmon UI', { columns: 4, compact: true }));
    assert.ok(c.rows.every((r) => r.length === 17 + 17 + 4 * 17 + 1));
    readPdf417(c.rows, true);
    assert.deepEqual(sym(encodePdf417('x', { rowHeightRatio: 5 })).rowHeights.slice(0, 2), [5, 5]);
    assert.equal(sym(encodePdf417('x')).rowHeights[0], 3, 'default ISO minimum row height');
    // 928 codewords at most: 8 x 29 x 32 symbol of ISO max (zint "Max codewords").
    assert.equal(sym(encodePdf417('ABCDEFGHIJKLMNOPQRSTUVWXYZ', { errorCorrection: 8, columns: 29, rows: 32 })).rows.length, 32);
  });

  it('Pdf417 renders the final symbol on the server', () => {
    const html = renderToString(createElement(Pdf417, { value: 'PDF417', columns: 2, errorCorrection: 1, moduleSize: 1 }));
    // 103 modules + 2 x 2 quiet zone wide; 5 rows x 3 + 2 x 2 high.
    assert.match(html, /width="107" height="19"/);
    assert.match(html, /role="img" aria-label="PDF417"/);
    assert.doesNotMatch(html, /<text/, 'no human-readable text by default');
    const tall = renderToString(createElement(Pdf417, { value: 'PDF417', columns: 2, errorCorrection: 1, moduleSize: 1, rowHeightRatio: 4, compact: true }));
    assert.match(tall, /width="73" height="24"/);
    assert.match(renderToString(createElement(Pdf417, { value: '', invalidLabel: 'Bad: {reason}' })), /aria-label="Bad: /);
    assert.ok(!(BARCODE_TYPES as readonly string[]).includes('pdf417'), 'not a Barcode type: /barcode never carries the encoder');
  });
});

// [source, variant, value, module rows]; rows are padded with spaces to the symbol width.
const DATABAR_REFERENCES: readonly (readonly [string, DataBarVariant, string, readonly string[]])[] = [
  ['GGS Figure 5.5.2.1.1-1. GS1 DataBar Omnidirectional', 'omnidirectional', '0950110153001', [
    '010000010100000101000111110000010111101101011100100011011101000101100000000111001110110111001101',
  ]],
  ['GGS Figure 5.5.2.3.1-1. GS1 DataBar Expanded', 'expanded', '(01)90614141000015(3202)000150', [
    '0101100011001100001011111111000010100100010000111101110011100010100010111100000011100111010111111011010100000100000110001111110000101000000100011010010',
  ]],
  ['GGS Figure 5.5.2.3.2-1. GS1 DataBar Expanded Stacked', 'expandedStacked', '(01)90614141000015(3202)000150', [
    '010110001100110000101111111100001010010001000011110111001110001010001011110000001110011101011111101101',
    '000001110011001111010000000010100101101110111100001000110001110101110100001010100001100010100000010000',
    '000001010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010000',
    '000001011111011111001010000001010010111111011100100000000000000000000000000000000000000000000000000000',
    '001010100000100000110001111110000101000000100011010010000000000000000000000000000000000000000000000000',
  ]],
  ['24724:2011 Figure 1 - GS1 DataBar Omnidirectional', 'omnidirectional', '2001234567890', [
    '010100011101000001001111111000010100110110111110110000010010100101100000000111000110110110001101',
  ]],
  ['24724:2011 Figure 2 - GS1 DataBar Omnidirectional', 'omnidirectional', '0441234567890', [
    '010010001000010001000111000000010101000001100110101100100100000101111110000011000010100011100101',
  ]],
  ['24724:2011 Figure 4 - GS1 DataBar Truncated', 'truncated', '0001234567890', [
    '010101001000000001001111111000010111001011011110111001010110000101111111000111001100111101110101',
  ]],
  ['24724:2011 Figure 5 - GS1 DataBar Stacked', 'stacked', '0001234567890', [
    '01010100100000000100111111100001011100101101111010',
    '00001010101011111010000000111010100011010010000000',
    '10111001010110000101111111000111001100111101110101',
  ]],
  ['24724:2011 Figure 6 - GS1 DataBar Stacked Omnidirectional', 'stackedOmnidirectional', '0003456789012', [
    '01010100100000000100111110000001010011100110011010',
    '00001011011111111010000001010100101100011001100000',
    '00000101010101010101010101010101010101010101010000',
    '00001000100010111010010101010000111101001101110000',
    '10110111011101000101100000000111000010110010001101',
  ]],
  ['24724:2011 Figure 7 - GS1 DataBar Limited', 'limited', '1501234567890', [
    '0100011001100011011010100111010010101101001101001001011000110111001100110100000',
  ]],
  ['24724:2011 Figure 8 - (a) GS1 DataBar Limited', 'limited', '0031234567890', [
    '0101010000010010001000010111001010110110100101011000001010010010110000010100000',
  ]],
  ['24724:2011 Figure 10 - GS1 DataBar Expanded', 'expanded', '(01)98898765432106(3202)012345(15)991231', [
    '01001000011000110110111111110000101110000110010100011010000001100010101111110000111010011100000010010100111110111001100011111100001011101100000100100100011110010110001011111111001110001101111010000101',
  ]],
  ['24724:2011 Figure 11 - GS1 DataBar Expanded', 'expanded', '(01)90012345678908(3103)001750', [
    '0101110010000010011011111111000010111000010011000101011110111001100010111100000011100101110001110111011110101111000110001111110000101011000010011111010',
  ]],
  ['24724:2011 Figure 12 - GS1 DataBar Expanded Stacked symbol', 'expandedStacked', '(01)98898765432106(3202)012345(15)991231', [
    '010010000110001101101111111100001011100001100101000110100000011000101011111100001110100111000000100101',
    '000001111001110010010000000010100100011110011010111001011111100111010100000010100001011000111111010000',
    '000001010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010000',
    '000011101000010011100001000000001011100101100001110110110111110010001001010000001010011000100000110000',
    '101000010111101100011100111111110100011010011110001001001000001101110100001111110001100111011111001010',
  ]],
  ['24724:2011 Figure 13 - GS1 DataBar Expanded Stacked', 'expandedStacked', '(01)95012345678903(3103)000123', [
    '010100010001111000101111111100001010111000001100010111000110001001101011110000001110010111000111011101',
    '000011101110000111010000000010100101000111110011101000111001110110010100001010100001101000111000100000',
    '000001010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010000',
    '000000001010000111001010000001010010111011011111100000000000000000000000000000000000000000000000000000',
    '001011110101111000110001111110000101000100100000011010000000000000000000000000000000000000000000000000',
  ]],
  ['24724:2011 Figure F.2 - GS1 DataBar Limited', 'limited', '0009876543210', [
    '0101010010010011000011000001010110100101100101000100010100010000010010010100000',
  ]],
  ['24724:2011 Figure F.3 - GS1 DataBar Expanded', 'expanded', '(10)12A', [
    '010100000110100000101111111100001010001000000010110101111100100111001011110000000010011101111111010101',
  ]],
  ['24724:2011 7.2.5.4.1', 'expanded', '(01)00012345678905(10)ABC123', [
    '0100011000001011011011111111000010110011000010111101011110011011111010111110000001100010110000110111000111101101011110001111110000101110001100100001010011101111110110101111111100111001011011111101110011011100101111100011110000001010',
  ]],
  ['24724:2011 7.2.5.4.3', 'expanded', '(01)90012345678908(3202)000156', [
    '0101001000111100001011111111000010100111000100001101011110111001100010111100000011100101110001110111011110101111000110001111110000101100001000001010010',
  ]],
  ['24724:2011 7.2.5.4.5', 'expanded', '(01)90012345678908(3922)795', [
    '010110000010001011101111111100001010011100000101100101111001101111101011111100001110001011000011011100011110110101111000111111000010100111101110100001100011011100100010111111110011101',
  ]],
  ['24724:2011 7.2.5.4.6', 'expanded', '(01)90012345678908(3932)0081234', [
    '01001110000101100010111111110000101110100000110010010111100110111110101111110000111000101100001101110001111011010111100011111100001011000011010111100100111110001011101011111111001110001101111001011101',
  ]],
  ['24724:2011 7.2.5.4.4', 'expanded', '(01)90012345678908(3103)012233(15)991231', [
    '01001100000100111010111111110000101011100100000110010111100110111110101111110000111000101100001101110001111011010111100011111100001011000011010110000111001100110001001011111111001110001101111010000101',
  ]],
];

// NACAG (North American Coupon Application Guideline) Expanded Stacked figures: [source, segmentsPerRow, value, rows].
const DATABAR_SEGMENTS: readonly (readonly [string, number, string, readonly string[]])[] = [
  ['NACAG Figure 3', 6, '(8110)10614141011111275110111', [
    '0101011110011100001011111111000010100000110100000101011110011011100010111110000001101101000100000011000011100001101010001111110000101010000011000111010',
    '0000100001100011110100000000101001011111001011111010100001100100011101000001010100010010111011111100111100011110010101010000001010010101111100111000000',
    '0000010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010100000',
    '0000001000100001011010000000010000111001101101100001100111100100100010100001010100100001101011111000000000000000000000000000000000000000000000000000000',
    '1011110111011110100101111111100111000110010010011110011000011011011100011110000001011110010100000100100000000000000000000000000000000000000000000000000',
  ]],
  ['NACAG Figure 4', 12, '(8110)106141410222223100110222111101231023456721104561045678991201', [
    '0100101111101001111011111111000010110010000011001101011110011011100010111100000000101101000100000011000011100001101010001111110000101011000011100001010111000011011110101111000000111010011111000101110001110110011001100011110000001011100110000101000110101111110111001011111111001110011010011100001101',
    '0000010000010110000100000000101001001101111100110010100001100100011101000010101010010010111011111100111100011110010101010000001010010100111100011110101000111100100001010000101010000101100000111010001110001001100110010100001010100100011001111010111001010000001000110100000000100001100101100011110000',
    '0000010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010000',
    '0000011010011011100010100101010100100111000100000101010000111000110010100000101010001111000101110100011001110001101000100000001010101011011110000111010111110001101011101000000000100011110100100010000110101100111000001000101010101000000000000000000000000000000000000000000000000000000000000000000000',
    '0010000101100100011100011000000001011000111011111010101111000111001101011111000000110000111010001011100110001110010111001111110000010100100001111000101000001110010100010111111111001100001011011101111001010011000111110011000000000101000000000000000000000000000000000000000000000000000000000000000000',
  ]],
];

const padded = (rows: readonly string[]): string[] => {
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => r.padEnd(w, '0'));
};

describe('GS1 DataBar encoder', () => {
  it('ISO/IEC 24724 figures and encodation method examples, module for module', () => {
    for (const [source, variant, value, rows] of DATABAR_REFERENCES) {
      assert.deepEqual(padded(sym(encodeDataBar(value, { variant, segmentsPerRow: 4 })).rows), rows, source);
    }
    const variants = new Set(DATABAR_REFERENCES.map((r) => r[1]));
    assert.equal(variants.size, 7, 'every variant has a published reference');
  });

  it('segmentsPerRow lays Expanded Stacked out in rows of that many segments', () => {
    for (const [source, segments, value, rows] of DATABAR_SEGMENTS) {
      assert.deepEqual(padded(sym(encodeDataBar(value, { variant: 'expandedStacked', segmentsPerRow: segments })).rows), rows, source);
    }
    const value = '(01)98898765432106(3202)012345(15)991231';
    const two = sym(encodeDataBar(value, { variant: 'expandedStacked', segmentsPerRow: 2 }));
    const six = sym(encodeDataBar(value, { variant: 'expandedStacked', segmentsPerRow: 6 }));
    assert.ok(two.rows.length > six.rows.length);
    // Symbol rows are 34X high, separators 1X (3 between rows).
    assert.deepEqual(two.rowHeights.filter((h) => h === 34).length, (two.rows.length + 3) / 4);
    for (const bad of [0, 3, 24]) assert.equal(encodeDataBar(value, { variant: 'expandedStacked', segmentsPerRow: bad }).ok, false, String(bad));
  });

  it('GTIN input forms, row heights, human-readable text and invalid values', () => {
    const forms = ['0950110153000', '09501101530003', '(01)09501101530003'].map((v) => sym(encodeDataBar(v)).rows[0]);
    assert.equal(new Set(forms).size, 1);
    assert.equal(sym(encodeDataBar('0950110153000')).text, '(01)09501101530003');
    const heights = (variant: DataBarVariant, value = '0001234567890') => sym(encodeDataBar(value, { variant })).rowHeights;
    assert.deepEqual(heights('omnidirectional'), [33]);
    assert.deepEqual(heights('truncated'), [13]);
    assert.deepEqual(heights('stacked'), [5, 1, 7]);
    assert.deepEqual(heights('stackedOmnidirectional'), [33, 1, 1, 1, 33]);
    assert.deepEqual(heights('limited'), [10]);
    assert.deepEqual(heights('expanded', '(01)09501101530003'), [34]);
    assert.equal(encodeDataBar('09501101530004').ok, false, 'check digit');
    assert.equal(encodeDataBar('ABC').ok, false);
    assert.equal(encodeDataBar('2001234567890', { variant: 'limited' }).ok, false, 'Limited stops below 2000000000000');
    assert.equal(encodeDataBar('01234', { variant: 'expanded' }).ok, false, 'Expanded needs (AI) element strings');
    assert.equal(encodeDataBar('(10)' + 'A'.repeat(70), { variant: 'expanded' }).ok, false, 'too long');
    assert.equal(encodeDataBar('(10)a~', { variant: 'expanded' }).ok, false, 'outside the GS1 character set');
    assert.equal(encodeDataBar('').ok, false);
  });

  it('Gs1DataBar renders the symbol and its GTIN text on the server', () => {
    const html = renderToString(createElement(Gs1DataBar, { value: '0950110153000', moduleSize: 1 }));
    // 96 modules + 2 x 1 quiet zone wide; 33 + 2 high plus the text line.
    assert.match(html, /width="98" height="53"/);
    assert.match(html, />\(01\)09501101530003</);
    const stacked = renderToString(createElement(Gs1DataBar, { variant: 'stacked', value: '0001234567890', moduleSize: 1, text: false }));
    assert.match(stacked, /width="52" height="15"/);
    const expanded = renderToString(createElement(Gs1DataBar, { variant: 'expandedStacked', segmentsPerRow: 2, value: '(01)98898765432106(3202)012345(15)991231' }));
    assert.match(expanded, /<path d="M/);
    assert.match(expanded, /data-variant="expandedStacked"/);
    assert.match(renderToString(createElement(Gs1DataBar, { value: '0950110153000', text: 'Item 3' })), />Item 3</);
    assert.match(renderToString(createElement(Gs1DataBar, { value: 'ABC' })), /aria-label="Invalid barcode: /);
  });
});

// [source, value, gs1, columns, mask, dot rows] from AIM ISS DotCode Rev 4.0 and the GS1 General Specifications.
const DOTCODE_ISS: readonly (readonly [string, string, boolean, number | undefined, number | undefined, readonly string[]])[] = [
  ['ISS DotCode Rev 4.0 Figure 1 (left)', '(01)00012345678905(17)201231(10)ABC123456', true, 64, undefined, [
    '1010000000101000101010000010000010001010100010101000101000001010',
    '0100010001010001010001000001010100010100010001000100010101000001',
    '1010001010000000101010100010001010000010101000000010100010100000',
    '0000000101000101010001010100000001000100010001000100010100000001',
    '1000001000000010100010101000001010100000101010100000100010001010',
    '0101000101000001000001010001010100000001000100010101000101010001',
    '1000000010100010001000001000100010101000100010000010101000100000',
    '0001010100010001010100010001010000010001010000000101010001010101',
    '1000100010001000100010100010001010001000101000101000100010000010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 1 (right) (and Figure 10)', '(01)00012345678905(17)201231(10)ABC123456', true, undefined, undefined, [
    '10101000101010100010101000101',
    '00010100010100010100000001010',
    '00001010100010000000101010000',
    '01000001010101010101010101000',
    '10101010100000000010100010101',
    '01000100000000000101010101010',
    '00100010001010101000100000101',
    '00000101010000000001010000010',
    '10001010100010101010001010100',
    '01010000000000010000000100010',
    '00100000000010100000100000000',
    '00010000000101000001000001000',
    '10101000101000001010001010001',
    '01010001010001010101000000010',
    '00001000001010001010100000101',
    '01000100010100000000010100010',
    '10100010000010101000101010001',
    '00010101000001010100010100010',
    '10000010101000100000001000001',
    '01000100010101010000000101010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 5 (and Figure 6 top-left) when Mask = 0', '(17)070620(10)ABC123456', true, undefined, 0, [
    '10101000100010000000001',
    '01000101010001010000000',
    '00100010001000101000100',
    '01010001010000000101010',
    '00001000100010100010101',
    '00000101010101010000010',
    '00100010101000000010001',
    '00010100000101000100010',
    '00001000001000001010101',
    '01010101010001000001010',
    '10100000100010001000101',
    '01000100000100010101000',
    '10000010000010100010001',
    '00010000010100010101010',
    '10101000001000101010001',
    '01000001010101010000010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 6 top-right Mask = 1', '(17)070620(10)ABC123456', true, undefined, 1, [
    '10000000001010001000101',
    '01010101000100000101000',
    '00100010000000100000001',
    '01010001000001000001000',
    '10101010100000001010101',
    '00000100010100000100010',
    '00000000001010101010001',
    '00010001010001000001000',
    '00101010101000001010001',
    '01000100000001010000000',
    '10101000101000101000001',
    '00010101000100010101010',
    '10001000001010100000101',
    '01010001010001000001010',
    '10000010101010100010101',
    '01000101000101010101010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 6 bottom-left Mask = 2', '(17)070620(10)ABC123456', true, undefined, 2, [
    '10100000101010100010001',
    '01000101000100000000010',
    '10101010001010000010000',
    '01010100010000010101010',
    '00001000101000001000101',
    '00000000000001010000010',
    '00100010101010101000001',
    '00010101010100010000000',
    '00001000100010101010001',
    '01000000010101010101000',
    '10100010100000101000101',
    '00000000000101000001010',
    '10000010000010100010101',
    '01010100010100010001010',
    '10101010000000001010001',
    '01010101000001000101010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 6 bottom-right Mask = 3', '(17)070620(10)ABC123456', true, undefined, 3, [
    '10000000100000001010101',
    '01010001010100010001000',
    '10001000001010101010100',
    '01010101000101010000010',
    '10101010001000000010101',
    '00000100000100010101000',
    '00001000101010101000101',
    '00000001010000000101010',
    '00100010000000000000001',
    '01010100010101010101010',
    '10000000101010100010001',
    '01010101000001010000010',
    '10101010100000001000001',
    '01000001010001000001010',
    '10001000001010001000001',
    '01010100000101000100010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 6 top-right, auto Mask = 1', '(17)070620(10)ABC123456', true, undefined, undefined, [
    '10000000001010001000101',
    '01010101000100000101000',
    '00100010000000100000001',
    '01010001000001000001000',
    '10101010100000001010101',
    '00000100010100000100010',
    '00000000001010101010001',
    '00010001010001000001000',
    '00101010101000001010001',
    '01000100000001010000000',
    '10101000101000101000001',
    '00010101000100010101010',
    '10001000001010100000101',
    '01010001010001000001010',
    '10000010101010100010101',
    '01000101000101010101010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 7A top-left Mask = 0', '2741', false, undefined, 0, [
    '1010101010100',
    '0000010001010',
    '0000101000101',
    '0101000000000',
    '0000101010100',
    '0100010101000',
    '1000001000001',
    '0101000101010',
    '1000100010001',
    '0000000000000',
  ]],
  ['ISS DotCode Rev 4.0 Figure 7A top-right Mask = 1', '2741', false, undefined, 1, [
    '1010001000101',
    '0000000100010',
    '0000100000001',
    '0101010001000',
    '1000101000000',
    '0101010101010',
    '1000101000101',
    '0100010101010',
    '0000000010001',
    '0001000001000',
  ]],
  ['ISS DotCode Rev 4.0 Figure 7A bottom-left Mask = 2', '2741', false, undefined, 2, [
    '1010001010100',
    '0001000000000',
    '1000100010101',
    '0100000101000',
    '0000101000100',
    '0100010000010',
    '1000101010001',
    '0101010001000',
    '1000100010101',
    '0001000100000',
  ]],
  ['ISS DotCode Rev 4.0 Figure 7A bottom-right Mask = 3', '2741', false, undefined, 3, [
    '1010001000100',
    '0001000001010',
    '1000001000000',
    '0101000100010',
    '1000101010100',
    '0101010000010',
    '1000100000000',
    '0100000101000',
    '1000001010001',
    '0101010101010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 7B top-left Mask = 0\' (4)', '2741', false, undefined, 4, [
    '1010101010101',
    '0000010001010',
    '0000101000101',
    '0101000000000',
    '0000101010100',
    '0100010101000',
    '1000001000001',
    '0101000101010',
    '1000100010001',
    '0100000000010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 7B top-right Mask = 1\' (5)', '2741', false, undefined, 5, [
    '1010001000101',
    '0000000100010',
    '0000100000001',
    '0101010001000',
    '1000101000000',
    '0101010101010',
    '1000101000101',
    '0100010101010',
    '1000000010001',
    '0101000001010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 7B bottom-left Mask = 2\' (6)', '2741', false, undefined, 6, [
    '1010001010101',
    '0001000000000',
    '1000100010101',
    '0100000101000',
    '0000101000100',
    '0100010000010',
    '1000101010001',
    '0101010001000',
    '1000100010101',
    '0101000100010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 7B bottom-right Mask = 3\' (7)', '2741', false, undefined, 7, [
    '1010001000101',
    '0001000001010',
    '1000001000000',
    '0101000100010',
    '1000101010100',
    '0101010000010',
    '1000100000000',
    '0100000101000',
    '1000001010001',
    '0101010101010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 7B bottom-left auto Mask = 2\' (6)', '2741', false, undefined, undefined, [
    '1010001010101',
    '0001000000000',
    '1000100010101',
    '0100000101000',
    '0000101000100',
    '0100010000010',
    '1000101010001',
    '0101010001000',
    '1000100010101',
    '0101000100010',
  ]],
  ['ISS DotCode Rev 4.0 Figure 8 top-left 7x40, Mask = 1', '(01)00012345678905', true, 40, undefined, [
    '1010101010001000100010100010101000001000',
    '0000010101000100010100010000010001000001',
    '1010001000001000001000101010001000101000',
    '0001010101000000010100010001000001010001',
    '1010100010001010000010001010000000101010',
    '0001010001010001000100000001010100010001',
    '1000100010001000100010100010001010001000',
  ]],
  ['ISS DotCode Rev 4.0 Figure 8 bottom-left 8x35, Mask = 3', '(01)00012345678905', true, 35, undefined, [
    '10100010000000000010100000100010101',
    '00010101010001000000010100010100000',
    '10001000101010101010001010000010101',
    '01010001000100000101000100010101010',
    '10101000100000101000100010001000001',
    '00010100010000010001010001010000000',
    '10000010101010101010000010000010001',
    '01000001000101000100010100010001000',
  ]],
  ['ISS DotCode Rev 4.0 Table G.1 Mask 0', '(99)8766', true, undefined, 0, [
    '0000001010000',
    '0001010000010',
    '0000000010001',
    '0100010101000',
    '0010101000101',
    '0100010101010',
    '0010000010000',
    '0101010000010',
    '0010000000101',
    '0101000101010',
  ]],
  ['ISS DotCode Rev 4.0 Table G.1 Mask 1', '(99)8766', true, undefined, 1, [
    '0000100000001',
    '0001010000000',
    '0000000000001',
    '0101010000010',
    '1010101010101',
    '0100000101010',
    '0010000010100',
    '0100010101000',
    '0010101000101',
    '0100010101000',
  ]],
  ['ISS DotCode Rev 4.0 Table G.1 Mask 2', '(99)8766', true, undefined, 2, [
    '0000100010100',
    '0000000000000',
    '1000101010101',
    '0100010101010',
    '0010101000101',
    '0101010101010',
    '0010100000000',
    '0101010100000',
    '0000000010001',
    '0100000001010',
  ]],
  ['ISS DotCode Rev 4.0 Table G.1 Mask 3', '(99)8766', true, undefined, 3, [
    '0000000000000',
    '0001010001000',
    '1000001010000',
    '0101010100010',
    '1010101000101',
    '0101010101010',
    '0010001000101',
    '0101010101010',
    '1000000010000',
    '0100000000010',
  ]],
  ['ISS DotCode Rev 4.0 Table G.1 Mask 0\' (4)', '(99)8766', true, undefined, 4, [
    '1000001010001',
    '0001010000010',
    '0000000010001',
    '0100010101000',
    '0010101000101',
    '0100010101010',
    '0010000010000',
    '0101010000010',
    '1010000000101',
    '0101000101010',
  ]],
  ['ISS DotCode Rev 4.0 Table G.1 Mask 1\' (5)', '(99)8766', true, undefined, 5, [
    '1000100000001',
    '0001010000000',
    '0000000000001',
    '0101010000010',
    '1010101010101',
    '0100000101010',
    '0010000010100',
    '0100010101000',
    '1010101000101',
    '0100010101010',
  ]],
  ['ISS DotCode Rev 4.0 Table G.1 Mask 2\' (6)', '(99)8766', true, undefined, 6, [
    '1000100010101',
    '0000000000000',
    '1000101010101',
    '0100010101010',
    '0010101000101',
    '0101010101010',
    '0010100000000',
    '0101010100000',
    '1000000010001',
    '0100000001010',
  ]],
  ['ISS DotCode Rev 4.0 Table G.1 Mask 3\' (7)', '(99)8766', true, undefined, 7, [
    '1000000000001',
    '0001010001000',
    '1000001010000',
    '0101010100010',
    '1010101000101',
    '0101010101010',
    '0010001000101',
    '0101010101010',
    '1000000010001',
    '0100000000010',
  ]],
  ['ISS DotCode Rev 4.0 Table G.1 auto Mask 0\' (4)', '(99)8766', true, undefined, undefined, [
    '1000001010001',
    '0001010000010',
    '0000000010001',
    '0100010101000',
    '0010101000101',
    '0100010101010',
    '0010000010000',
    '0101010000010',
    '1010000000101',
    '0101000101010',
  ]],
  ['ISS DotCode Rev 4.0 5.2.1.4 2) Table 4, 1 padding dot available', 'A', false, 6, undefined, [
    '101000',
    '000101',
    '101010',
    '000001',
    '100010',
    '000100',
    '001010',
    '000101',
    '101000',
    '010000',
    '100010',
    '010000',
    '000010',
    '000101',
    '101010',
    '000001',
    '101000',
    '010000',
    '101000',
  ]],
  ['GS1 Gen Spec Figure 5.1-8.', '(17)070620(10)ABC123456', true, 50, undefined, [
    '10000010101000100010101010001000000010100000100000',
    '01000101000101010100000100010000010001000001010101',
    '00001010001000101000101000100010001010100000000010',
    '01000001000100000101010101010001000001000101000001',
    '10001000001010100010001010100000100010100010000010',
    '00010001010000000100010101000100010001010001000101',
    '10001000001010101000001000100010100010100000101010',
  ]],
];

// zint vectors verified against BWIPP or TEC-IT (interleaved Reed-Solomon, 200 columns, mask choice, FNC1).
const DOTCODE_CROSS: readonly (readonly [string, string, boolean, number | undefined, number | undefined, readonly string[]])[] = [
  ['Interleaved R-S', 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRS', false, 94, undefined, [
    '1000001010000000100010000010101010101000001000100000001010101000001000001000101010001000101010',
    '0101010000000101000001010001010001010100010001000001000000010101010000000101010100010001010100',
    '0010101000100010000010101010000000101010000010101000001000100010100000100010100010001000101000',
    '0000000100010101000001010000010000010101010100010100000100000101000100010001000001010001010001',
    '0010100000100010101000001000101010000010001000001010100000101000101010000010001000101010100010',
    '0100000101010001010001000101000001000100000101010001000101000100010100000100010100010001010100',
    '1010000000100010100000101010000010101000001000001010001010000010001010100000101010100000100000',
    '0001010100000101000001000000010001010100000101000100010101000001000101000100010000010101010001',
    '1010001010001010000000100000101010100000100010101000000010100010001010100010000010100010001010',
    '0001000100010100010001010000000101010100010000010100000100000101010100010000010100010001000001',
    '1000001010001010100010000010001000100010100010100010000010001000101010100000101000001000101010',
    '0101000001000101000100000001010001010101010001000001000000010001010100010101010000010100000001',
    '0000100000001010100010101000000010001010001010000000101010001000101010001000101000100000100010',
    '0000000100000100000101010101000000010101010001000100010001000101010001000100010000010100010101',
    '0010101000001010001000101000000000101010001010000010101010000010001000100000001010101010001010',
    '0100010001010100010000010100010001010100010000010001000100000100010101000101000100000101010001',
    '1000001000100010101010101000000010001000001010000010101010000010101010000000100010001000101000',
    '0000010000010101010000010101000000010101000001000101000100010001000101010001000100010000010100',
    '1000001000101010000010001000001000101010100000100000001010001010101000000010001010101010001000',
    '0100010001010001000100010000010100000100010100010100010001000001010100010101000100000101000101',
    '1010000000101000100000001000101010100010000000101010101010000010101000000010100010001000100010',
    '0100000101010000010100010001010100010000010101000100000100000101000001010100010000000101010001',
    '1000001000001010001010001000101000001000101010000010101000100010100000101000100000001000101010',
    '0101010100010001010101000000010101010000010100000100010100010001000100000100010001010100010100',
    '1000100000101000000010100010101000001010100010100000100000101010000010101000100000001010000000',
    '0001000001000101000101010000010001000100000101010001000100010100000101000101000100000101010001',
    '0000000010001000101000100000100000101010101000000010101010001000100010001000101010001000100010',
    '0101010100010000000100010101010001010100000001010101000001000001000001010100000101010001010101',
    '1000100010101000100000101010001000101010000010001010001010001010000010100010100010000000100000',
    '0000010101010000010101000000010101000001000101000100010001000101010001000100010000010100010000',
    '1000101010000010001000001000101010100000100000001010001010101000000010001010101010001000000010',
    '0100000101000001010001010000000100010100010100010001000001010100010101000100000101000101010000',
    '0000001010001000100010100010000010101000100010001000101000001000100000101000100010100010001010',
    '0101010000010100010000010100000101010100000101000001000000010101000101000101010000000101010101',
    '1000001010001010001000101000001000101010000010101000100010100000101000100000001000101010100000',
    '0001000101010100000001010101000001010000010001010001000100010000010001000101010001010001000001',
    '0010001000001010101000000010101000101000001000001010100000101010001000000010100000001010101000',
  ]],
  ['Max cols', '123456789012345678901234567890123456789012345678901234567890', false, 200, undefined, [
    '10101000100010101010000010101000000010001000100000101010100010100000101000100010000000101000101010001010100000100000101010100000001000101000001010100010001010000010001010001010100000100010101000000010',
    '00010101010000000101000100010001000101000101000100010001000001010001000001010100000001000101010000000101010100010101010000010001000101010001000001000001010000010100010001010101000001000001010100000001',
    '10100010000000100010101000101010100000001010001000100000101000101000001000101010001000000010101010100010101000000010100010001000001010100000101000100000101010100010000000001000001010101000101010100000',
    '00010001010001010000000101000100010001010000010000010100010100000100010101010001000101000000010100010001010100010000010100000101000100010100000101010000000101000001010100010100010001000101000001010001',
    '10100010001010101000000010001000001010001010001000001010100010000000101010001010000010101010000000101000100010100010100000100010100010001010100000001010101000001010000000001000101000101010000010101010',
  ]],
  ['Mask 1 selected', '4', false, 19, undefined, [
    '1010100000101000101',
    '0100000000010001010',
    '0010101010000000000',
    '0000010100000100000',
    '1000100010001010001',
    '0001010101010101010',
  ]],
  ['Mask 2 specified, unlit right edge mask', '4', false, 19, 2, [
    '1010101010000000100',
    '0000000101000100010',
    '1010100000001010100',
    '0000010101010000000',
    '1000001010100010100',
    '0101000100010001010',
  ]],
  ['Mask 2\' specified', '4', false, 19, 6, [
    '1010101010000000101',
    '0000000101000100010',
    '1010100000001010100',
    '0000010101010000000',
    '1000001010100010101',
    '0101000100010001010',
  ]],
  ['Code Set C with FNC1', '(10)12(20)12', true, undefined, undefined, [
    '10100000001000001',
    '00010100010101010',
    '10001000100000001',
    '01010100000101000',
    '10000010000010001',
    '01010001010100010',
    '00001010100000001',
    '00000101010001010',
    '10101000001010001',
    '01010101000101010',
    '10000010100000101',
    '01000100010101010',
  ]],
];

function dotRows(value: string, gs1: boolean, columns: number | undefined, mask: number | undefined): string[] {
  const s = sym(encodeDotCode(value, { gs1, columns, mask }));
  const rows: string[] = [];
  for (let y = 0; y < s.height; y++) rows.push([...s.modules.slice(y * s.width, (y + 1) * s.width)].join(''));
  return rows;
}

describe('DotCode encoder', () => {
  it('AIM ISS DotCode Rev 4.0 figures, every mask and the automatic mask, dot for dot', () => {
    for (const [source, value, gs1, columns, mask, rows] of DOTCODE_ISS) assert.deepEqual(dotRows(value, gs1, columns, mask), rows, source);
    for (const [source, value, gs1, columns, mask, rows] of DOTCODE_CROSS) assert.deepEqual(dotRows(value, gs1, columns, mask), rows, source);
  });

  it('code sets, binary latch and base-259 packing, and Reed-Solomon over GF(113)', () => {
    const bytes = (codes: number[]) => dotCodeCodewords(codes, false).cw;
    // zint's codeword vectors: Latch B, Binary Latch with 5 bytes in 6 base-103 codewords, Upper Shift A / B, Shift C.
    assert.deepEqual(bytes([0x61, 0x62, 0x63, 0x64, 0x65, 0x80, 0x81, 0x82, 0x83, 0x84, 0xff]), [0x6a, 0x41, 0x42, 0x43, 0x44, 0x45, 0x70, 0x31, 0x5a, 0x35, 0x21, 0x5a, 0x5f, 0x02, 0x31]);
    assert.deepEqual(bytes([0x80, 0x31, 0x32, 0xa0, 0x33, 0x34, 0x81, 0x82, 0x35, 0x36]), [0x6e, 0x40, 0x0c, 0x6f, 0x00, 0x22, 0x70, 0x03, 0x10, 0x42, 0x6e, 0x15, 0x16]);
    assert.deepEqual(bytes([0x80, 0x81, 0x82, 0x83, 0x31, 0x32, 0x33, 0x34]), [0x70, 0x13, 0x56, 0x0a, 0x59, 0x2c, 0x67, 0x0c, 0x22]);
    assert.deepEqual(bytes([0x01, 0x80, 0x81, 0x82, 0x83, 0x84, 0x80, 0x81, 0x82, 0x83, 0x84]), [0x65, 0x41, 0x70, 0x31, 0x5a, 0x35, 0x21, 0x5a, 0x5f, 0x31, 0x5a, 0x35, 0x21, 0x5a, 0x5f]);
    // A single block: the check words make every syndrome at 3^1..3^k vanish over GF(113).
    const wd = [1, 20, 30, 40, 50];
    dotCodeReedSolomon(wd, 5, 5);
    for (let i = 1, root = 3; i <= 5; i++, root = (root * 3) % 113) {
      let v = 0;
      for (const c of wd) v = (v * root + c) % 113;
      assert.equal(v, 0, `syndrome ${i}`);
    }
  });

  it('columns, gs1, quiet zone and invalid values', () => {
    const s = sym(encodeDotCode('Salmon UI', { columns: 21 }));
    assert.equal(s.width, 21);
    assert.equal((s.width + s.height) % 2, 1, 'width + height is odd');
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if ((x + y) % 2) assert.equal(s.modules[y * s.width + x], 0, 'dots only on the checkerboard');
    const auto = sym(encodeDotCode('Salmon UI'));
    assert.ok(auto.width > auto.height, 'automatic size is wider than high (3:2)');
    assert.equal(auto.quietZone, 3);
    assert.notDeepEqual(sym(encodeDotCode('(01)00012345678905', { gs1: true })).modules, sym(encodeDotCode('(01)00012345678905')).modules);
    assert.equal(encodeDotCode('x', { columns: 4 }).ok, false);
    assert.equal(encodeDotCode('x', { columns: 201 }).ok, false);
    assert.equal(encodeDotCode('01234', { gs1: true }).ok, false, 'GS1 needs (AI) element strings');
    assert.equal(encodeDotCode('€').ok, false);
    assert.equal(encodeDotCode('').ok, false);
  });

  it('DotCode renders the dots on the server', () => {
    const html = renderToString(createElement(DotCode, { value: '(17)070620(10)ABC123456', gs1: true, moduleSize: 2 }));
    // 23 x 16 dots + 3 quiet dots on each side.
    assert.match(html, /width="58" height="44"/);
    assert.match(html, /aria-label="\(17\)070620\(10\)ABC123456"/);
    assert.match(renderToString(createElement(DotCode, { value: 'Salmon UI', columns: 21, moduleSize: 1 })), /width="27"/);
  });
});
