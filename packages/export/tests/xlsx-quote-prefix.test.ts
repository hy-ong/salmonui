// XLSX formula-like text (exports escape formulas by default): a shared string with `quotePrefix` on its style,
// read back from the unzipped SpreadsheetML.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExportModel, type ExportCellPatch } from '@salmonui/core/export-model';
import { exportPivot } from '@salmonui/export/pivot';
import { writeXlsx } from '@salmonui/export/xlsx';
import { makeEngine, sheetCells, unzip } from './helpers.ts';
import { pivotFixture } from './pivot-fixture.ts';

const cellXml = (files: Map<string, string>, ref: string): string => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(files.get('xl/worksheets/sheet1.xml') as string)?.[0] ?? '';
const xfsOf = (files: Map<string, string>): string[] => [...(files.get('xl/styles.xml') as string).replace(/^[\s\S]*<cellXfs[^>]*>/, '').replace(/<\/cellXfs>[\s\S]*$/, '').matchAll(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
const xfOf = (files: Map<string, string>, ref: string): string => xfsOf(files)[Number(/ s="(\d+)"/.exec(cellXml(files, ref))?.[1] ?? 0)] as string;
const fontOf = (files: Map<string, string>, xf: string): string => [...(files.get('xl/styles.xml') as string).matchAll(/<font>[\s\S]*?<\/font>/g)][Number(/fontId="(\d+)"/.exec(xf)?.[1])]?.[0] ?? '';

const PATCHES: Record<string, ExportCellPatch> = {
  s0: { value: '=1+1', text: '=1+1', style: { bold: true, backgroundColor: '#ff0000', numberFormat: '0.00', textAlign: 'center' } },
  s1: { value: ' @cmd', text: ' @cmd' },
  s2: { value: 'plain', text: 'plain', style: { bold: true } },
  s3: { formula: 'SUM(B2:B3)', value: 3 },
  s4: { value: '\tx', text: '\tx' },
  s5: { value: '-text', text: '-text' },
};

async function book(): Promise<Map<string, string>> {
  const model = createExportModel(makeEngine(), {
    columns: ['region', 'qty', 'when'],
    cell: ({ column, rowId }) => {
      if (column.columnId === 'region') return PATCHES[rowId] ?? null;
      if (column.columnId === 'qty') return rowId === 's0' ? { value: -5 } : rowId === 's1' ? { value: true } : null;
      return null;
    },
  });
  return unzip(await writeXlsx(model));
}

describe('XLSX formula-like text', () => {
  it('stays a shared string, is never <f>, and shows no added quote', async () => {
    const files = await book();
    const cells = sheetCells(files);
    for (const [ref, text] of [['A2', '=1+1'], ['A3', ' @cmd'], ['A6', '\tx'], ['A7', '-text']] as const) {
      assert.match(cellXml(files, ref), / t="s"/, ref);
      assert.doesNotMatch(cellXml(files, ref), /<f>/, ref);
      assert.equal(cells[ref], text);
      assert.match(xfOf(files, ref), /quotePrefix="1"/, ref);
    }
    assert.doesNotMatch(files.get('xl/sharedStrings.xml') as string, /<t[^>]*>'/);
  });

  it('keeps the existing style of the cell', async () => {
    const files = await book();
    const xf = xfOf(files, 'A2');
    assert.match(xf, /applyNumberFormat="1"/);
    assert.match(xf, /applyFill="1"/);
    assert.match(xf, /horizontal="center"/);
    assert.match(fontOf(files, xf), /<b\/>/);
    assert.match(files.get('xl/styles.xml') as string, /formatCode="0\.00"/);
  });

  it('ordinary text, numbers, booleans and dates get no quote prefix', async () => {
    const files = await book();
    assert.doesNotMatch(xfOf(files, 'A4'), /quotePrefix/);
    assert.match(fontOf(files, xfOf(files, 'A4')), /<b\/>/);
    assert.equal(sheetCells(files).B2, -5);
    assert.doesNotMatch(cellXml(files, 'B2'), /t="s"/);
    assert.doesNotMatch(xfOf(files, 'B2'), /quotePrefix/);
    assert.match(cellXml(files, 'B3'), /t="b"/);
    assert.doesNotMatch(xfOf(files, 'B3'), /quotePrefix/);
    assert.doesNotMatch(cellXml(files, 'C2'), /t="s"/);
    assert.doesNotMatch(xfOf(files, 'C2'), /quotePrefix/);
  });

  it('an explicit cell.formula still writes <f>', async () => {
    const files = await book();
    assert.match(cellXml(files, 'A5'), /<f>SUM\(B2:B3\)<\/f>/);
    assert.doesNotMatch(xfOf(files, 'A5'), /quotePrefix/);
  });

  it('one quoted xf per base style', async () => {
    const files = await book();
    const xfs = xfsOf(files);
    const quoted = xfs.filter((xf) => xf.includes('quotePrefix'));
    assert.equal(new Set(quoted).size, quoted.length);
    assert.match(files.get('xl/styles.xml') as string, new RegExp(`<cellXfs count="${xfs.length}">`));
  });

  it('Pivot: formula-like header text goes through the same path', async () => {
    const file = await exportPivot(pivotFixture(), { format: 'xlsx', headerCell: (ctx) => (ctx.level === 0 ? { text: '=evil' } : null) });
    const files = unzip(file?.data as Uint8Array);
    const ref = Object.entries(sheetCells(files)).find(([, v]) => v === '=evil')?.[0] as string;
    assert.match(cellXml(files, ref), / t="s"/);
    assert.match(xfOf(files, ref), /quotePrefix="1"/);
    assert.doesNotMatch(files.get('xl/worksheets/sheet1.xml') as string, /<f>/);
  });
});
