// embedded TrueType fonts in the PDF writer. Fonts are synthetic
// (tests/font-fixture.ts) so the checks run anywhere; the subset font is
// read back with an independent reader, text is decoded through the
// document's ToUnicode CMap, and Arabic forms are identified by comparing
// subset glyph outlines with the original glyphs.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, type ColumnDef, type DataGridModule } from '@salmonui/data-grid/engine';
import { createExportModel } from '@salmonui/core/export-model';
import { createExportModule } from '@salmonui/data-grid/engine/export';
import { exportPdf, writePdf, type PdfOptions } from '@salmonui/export/pdf';
import { buildTestFont, readFont, type TestFont } from './font-fixture.ts';
import { pdfRawStreams, pdfStreams, pdfUnicodeText } from './helpers.ts';

interface Row {
  readonly id: string;
  readonly text: string;
}

const cps = (s: string): number[] => Array.from(s, (c) => c.codePointAt(0) as number);
const ASCII = Array.from({ length: 95 }, (_, i) => 32 + i);

function engine(texts: readonly string[], options: { direction?: 'ltr' | 'rtl'; header?: string } = {}) {
  const rows = texts.map((text, i) => ({ id: `r${i}`, text }));
  const columns: ColumnDef<Row>[] = [{ field: 'text', header: options.header ?? 'Text', width: 400 }];
  return createDataGridEngine<Row, readonly DataGridModule<Row, any, any, string>[]>({
    getRowId: (r) => r.id,
    columns,
    dataSource: rows,
    dev: false,
    ...(options.direction ? { direction: options.direction } : {}),
    modules: [createExportModule<Row>()],
  });
}

async function render(texts: readonly string[], font: NonNullable<PdfOptions['font']>, options: PdfOptions & { direction?: 'ltr' | 'rtl'; header?: string } = {}): Promise<Uint8Array> {
  const { direction, header, ...pdf } = options;
  return writePdf(createExportModel(engine(texts, { ...(direction ? { direction } : {}), ...(header ? { header } : {}) })), { footer: '', ...pdf, font });
}

const latin = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

function checkXref(bytes: Uint8Array): void {
  const text = latin(bytes);
  const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
  const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
  assert.equal(Number(/\/Size (\d+)/.exec(text)?.[1]), entries.length + 1);
}

function fontPrograms(bytes: Uint8Array): Uint8Array[] {
  return pdfRawStreams(bytes)
    .filter((s) => s.length1 !== null)
    .map((s) => {
      assert.equal(s.data.length, s.length1, '/Length1 is the program length');
      return s.data;
    });
}

/** Original glyph ids of the glyphs shown by each `Tj`, by outline comparison. */
function shownGlyphs(bytes: Uint8Array, font: TestFont): number[][] {
  const subset = readFont(fontPrograms(bytes)[0] as Uint8Array);
  const original = readFont(font.bytes);
  const key = (b: Uint8Array): string => Buffer.from(b).toString('hex').padEnd(Math.ceil(b.length / 4) * 8, '0');
  const byOutline = new Map<string, number>();
  for (let g = 0; g < original.numGlyphs; g++) byOutline.set(key(original.glyph(g)), g);
  return pdfStreams(bytes)
    .filter((s) => !s.includes('beginbfchar'))
    .flatMap((s) => [...s.matchAll(/<([0-9A-F]*)> Tj/g)])
    .map((m) => {
      const hex = m[1] as string;
      const out: number[] = [];
      for (let i = 0; i < hex.length; i += 4) out.push(byOutline.get(key(subset.glyph(Number.parseInt(hex.slice(i, i + 4), 16)))) ?? -1);
      return out;
    });
}

const CJK = '中文測試日本語한국어';
const CYRILLIC = 'Привет мир';
const GREEK = 'Ελληνικά';

describe('PDF embedded fonts', () => {
  it('embeds a Type0 / CIDFontType2 subset with Identity-H and a ToUnicode CMap', async () => {
    const all = [...ASCII, ...cps(CJK + CYRILLIC + GREEK + '…'), ...cps('未使用字形漢字')];
    const font = buildTestFont({ codePoints: all });
    const bytes = await render([CJK, CYRILLIC, GREEK], font.bytes, { title: '報告 Отчёт' });
    checkXref(bytes);
    const text = latin(bytes);
    assert.match(text, /\/Subtype \/Type0 \/BaseFont \/[A-Z]{6}\+SalmonTest-Regular \/Encoding \/Identity-H \/DescendantFonts \[\d+ 0 R\] \/ToUnicode \d+ 0 R/);
    assert.match(text, /\/Subtype \/CIDFontType2 .*\/CIDSystemInfo << \/Registry \(Adobe\) \/Ordering \(Identity\) \/Supplement 0 >> .*\/W \[0 \[/);
    assert.match(text, /\/CIDToGIDMap \/Identity/);
    assert.match(text, /\/Type \/FontDescriptor .*\/FontFile2 \d+ 0 R/);
    assert.ok(!text.includes('/Helvetica'), 'no standard font when a font is embedded');
    assert.match(text, /\/Title <FEFF5831544a0020041e/i);
    const decoded = pdfUnicodeText(bytes);
    for (const t of ['Text', CJK, CYRILLIC, GREEK]) assert.ok(decoded.includes(t), t);

    // Subset: .notdef plus the distinct used characters only, valid checksum, required tables.
    const programs = fontPrograms(bytes);
    assert.equal(programs.length, 1);
    const subset = readFont(programs[0] as Uint8Array);
    const used = new Set(cps(`Text${CJK}${CYRILLIC}${GREEK}`));
    assert.equal(subset.numGlyphs, used.size + 1);
    assert.ok(subset.checksumOk, 'head checkSumAdjustment');
    for (const t of ['glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp']) assert.ok(subset.tags.includes(t), t);
    assert.ok(!subset.tags.includes('cmap') && !subset.tags.includes('GSUB'));
    assert.ok(programs[0]!.length < font.bytes.length / 2, 'subset is smaller than the font');
  });

  it('accepts ArrayBuffer, format 12 cmaps, and .ttc collections; keeps composite components', async () => {
    const font = buildTestFont({ codePoints: [...ASCII, ...cps('𠀀中')], format12: true, composite: true, collection: true });
    const buffer = font.bytes.buffer.slice(font.bytes.byteOffset, font.bytes.byteOffset + font.bytes.byteLength);
    const bytes = await render(['Ä 𠀀中'], buffer as ArrayBuffer);
    checkXref(bytes);
    assert.ok(pdfUnicodeText(bytes).includes('Ä 𠀀中'));
    const subset = readFont(fontPrograms(bytes)[0] as Uint8Array);
    // Composite Ä references A and the dot; both are in the subset and the indices are remapped.
    const composite = [...Array(subset.numGlyphs).keys()].map((i) => subset.glyph(i)).find((g) => g.length > 2 && new DataView(g.buffer, g.byteOffset).getInt16(0) < 0);
    assert.ok(composite, 'composite glyph embedded');
    const view = new DataView(composite.buffer, composite.byteOffset, composite.byteLength);
    const first = view.getUint16(12);
    const second = view.getUint16(20);
    for (const c of [first, second]) assert.ok(c > 0 && c < subset.numGlyphs, `component ${c} remapped`);
    assert.equal(Buffer.from(subset.glyph(second)).toString('hex'), Buffer.from(readFont(font.bytes).glyph(font.componentGid)).toString('hex').padEnd(subset.glyph(second).length * 2, '0'));
  });

  it('lays out Hebrew right to left with numbers and mirrored brackets', async () => {
    const font = buildTestFont({ codePoints: [...ASCII, ...cps('שלוםעולם')] });
    const bytes = await render(['שלום 123', 'Hello עולם!', '(שלום)'], font.bytes);
    const decoded = pdfUnicodeText(bytes);
    assert.ok(decoded.includes('123 םולש'), 'RTL paragraph, number stays left to right');
    assert.ok(decoded.includes('Hello םלוע!'), 'LTR paragraph with an RTL run');
    assert.ok(decoded.includes('(םולש)'), 'brackets mirrored in the RTL run');
    const rtlGrid = pdfUnicodeText(await render(['123 - 456', '2025-01-31', '$1,234.50'], font.bytes, { direction: 'rtl' }));
    assert.ok(rtlGrid.includes('2025-01-31') && rtlGrid.includes('$1,234.50'), 'dates and amounts stay one number run');
    assert.ok(rtlGrid.includes('456 - 123'), 'numbers run right to left in an RTL paragraph, digits left to right');
  });

  it('shapes Arabic with GSUB forms and the lam-alef ligature', async () => {
    const font = buildTestFont({ codePoints: [...ASCII, 0x627, 0x628, 0x644, 0x645, 0x64e], gsub: true });
    // "بلا" (beh lam alef), "ملب" (meem lam beh), "لا" (lam alef alone), beh with fatha.
    const bytes = await render(['بلا', 'ملب', 'لا', 'بَب'], font.bytes);
    const glyphs = shownGlyphs(bytes, font).slice(1);
    const f = (cp: number, form: string): number => font.forms.get(`${cp}:${form}`) as number;
    // Visual order is reversed: the logical end is drawn first.
    assert.deepEqual(glyphs[0], [font.forms.get('lamalef:medi'), f(0x628, 'init')]);
    assert.deepEqual(glyphs[1], [f(0x628, 'fina'), f(0x644, 'medi'), f(0x645, 'init')]);
    assert.deepEqual(glyphs[2], [font.forms.get('lamalef:init')]);
    // The mark stays with its base and is transparent for joining.
    assert.deepEqual(glyphs[3], [f(0x628, 'fina'), f(0x628, 'init'), font.gid.get(0x64e)]);
    const decoded = pdfUnicodeText(bytes);
    assert.ok(decoded.includes('لاب'), 'ligature maps back to lam + alef');
  });

  it('falls back to Arabic Presentation Forms-B without GSUB', async () => {
    // beh: FE8F isol, FE90 fina, FE91 init, FE92 medi; lam-alef FEFB isolated.
    const font = buildTestFont({ codePoints: [...ASCII, 0x627, 0x628, 0x644, 0xfe8f, 0xfe90, 0xfe91, 0xfe92, 0xfefb] });
    const bytes = await render(['ببب', 'لا'], font.bytes);
    const glyphs = shownGlyphs(bytes, font).slice(1);
    const g = (cp: number): number => font.gid.get(cp) as number;
    assert.deepEqual(glyphs[0], [g(0xfe90), g(0xfe92), g(0xfe91)]);
    assert.deepEqual(glyphs[1], [g(0xfefb)]);
  });

  it('fits with an ellipsis, uses a bold face, or strokes a synthetic bold', async () => {
    const font = buildTestFont({ codePoints: [...ASCII, ...cps(CJK + '…')] });
    const long = CJK.repeat(30);
    const synthetic = await render([long], font.bytes, { header: '' });
    const decoded = pdfUnicodeText(synthetic);
    const cut = decoded.find((t) => t.endsWith('…'));
    assert.ok(cut && cut.length < long.length, 'truncated with an ellipsis');
    assert.match(pdfStreams(synthetic)[0] as string, /q BT \/F1 8 Tf [\d. ]+ rg [\d. ]+ RG 2 Tr [\d.]+ w/);
    assert.match(latin(synthetic), /\/F1 3 0 R \/F2 3 0 R/);

    const bold = buildTestFont({ codePoints: [...ASCII, ...cps(CJK)], name: 'SalmonTest-Bold' });
    const both = await render([CJK], { regular: font.bytes, bold: bold.bytes });
    checkXref(both);
    assert.match(latin(both), /\/F1 3 0 R \/F2 4 0 R/);
    assert.match(latin(both), /4 0 obj\n<< \/Type \/Font \/Subtype \/Type0 \/BaseFont \/[A-Z]{6}\+SalmonTest-Bold/);
    assert.equal(fontPrograms(both).length, 2);
    assert.match(pdfStreams(both)[0] as string, /BT \/F2 8 Tf/);
  });

  it('rejects CFF fonts and fonts without glyf outlines', async () => {
    const otto = new Uint8Array(64);
    otto.set([0x4f, 0x54, 0x54, 0x4f]);
    await assert.rejects(render(['x'], otto), /CFF-based OpenType/);
    const empty = new Uint8Array(12);
    empty.set([0, 1, 0, 0]);
    await assert.rejects(render(['x'], empty), /missing the "head" table/);
  });

  it('exportPdf passes the font option through', async () => {
    const font = buildTestFont({ codePoints: [...ASCII, ...cps(CJK)] });
    const file = await exportPdf(engine([CJK]), { font: font.bytes, fileName: 'cjk' });
    assert.ok(file);
    assert.equal(file.fileName, 'cjk.pdf');
    assert.ok(pdfUnicodeText(file.data).includes(CJK));
  });
});
