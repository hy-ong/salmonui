// Export timing gates, `ref-node`:
// - XLSX 100k x 20 (8 string, 6 number, 4 date, 2 boolean) on the main
//   thread: <= 5 s end to end (`createExportModel` + `writeXlsx`: model, worksheet XML, shared strings, deflate,
//   ZIP), and no slice between two yields longer than 50 ms.
// - PDF 10k x 10 under the same rule.
// - PDF 10k x 10 of CJK text with an embedded TrueType font: the
//   same budget, and the embedded subset font holds only the used glyphs.
// The longest slice is measured by the injected `yield`: the time from the
// previous yield's resumption to the next yield call (the first slice starts
// when the export starts). One warm-up run, one retry on a failing timing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../tooling/bench/budget.mjs';
import { createDataGridEngine, createSortModule, type ColumnDef, type DataGridModule } from '@salmonui/data-grid/engine';
import { createExportModel } from '@salmonui/core/export-model';
import { createExportModule } from '@salmonui/data-grid/engine/export';
import { writePdf } from '@salmonui/export/pdf';
import { writeXlsx } from '@salmonui/export/xlsx';
import { buildTestFont, readFont } from './font-fixture.ts';
import { pdfRawStreams } from './helpers.ts';

type Row = Record<string, string | number | boolean | Date> & { readonly id: string };

function fixture(rowCount: number, strings: number, numbers: number, dates: number, booleans: number): { rows: Row[]; columns: ColumnDef<Row>[] } {
  let state = 7;
  const next = (): number => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  const words = Array.from({ length: 256 }, (_, i) => `word-${i}`);
  const days = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)));
  const columns: ColumnDef<Row>[] = [];
  for (let c = 0; c < strings; c++) columns.push({ field: `s${c}` });
  for (let c = 0; c < numbers; c++) columns.push({ field: `n${c}`, type: 'number', ...(c === 0 ? { format: 'N2' } : {}) });
  for (let c = 0; c < dates; c++) columns.push({ field: `d${c}`, type: 'date', format: 'yyyy-MM-dd' });
  for (let c = 0; c < booleans; c++) columns.push({ field: `b${c}`, type: 'boolean' });
  const rows: Row[] = new Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, string | number | boolean | Date> = { id: `r${r}` };
    for (let c = 0; c < strings; c++) row[`s${c}`] = words[next() & 255] as string;
    for (let c = 0; c < numbers; c++) row[`n${c}`] = (next() % 1_000_000) / 100;
    for (let c = 0; c < dates; c++) row[`d${c}`] = days[next() % 365] as Date;
    for (let c = 0; c < booleans; c++) row[`b${c}`] = (next() & 1) === 1;
    rows[r] = row as Row;
  }
  return { rows, columns };
}

/** 10k x 10: 8 CJK text columns (words of 2-4 ideographs from a 3,000-ideograph font), 2 number columns. */
function cjkFixture(rowCount: number): { rows: Row[]; columns: ColumnDef<Row>[]; font: Uint8Array } {
  let state = 11;
  const next = (): number => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  const ideographs = Array.from({ length: 3000 }, (_, i) => 0x4e00 + i);
  const words = Array.from({ length: 512 }, () => String.fromCodePoint(...Array.from({ length: 2 + (next() % 3) }, () => ideographs[next() % ideographs.length] as number)));
  const columns: ColumnDef<Row>[] = [];
  for (let c = 0; c < 8; c++) columns.push({ field: `s${c}`, header: `列${c}` });
  for (let c = 0; c < 2; c++) columns.push({ field: `n${c}`, type: 'number', format: 'N2' });
  const rows: Row[] = new Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, string | number> = { id: `r${r}` };
    for (let c = 0; c < 8; c++) row[`s${c}`] = words[next() & 511] as string;
    for (let c = 0; c < 2; c++) row[`n${c}`] = (next() % 1_000_000) / 100;
    rows[r] = row as Row;
  }
  const ascii = Array.from({ length: 95 }, (_, i) => 32 + i);
  return { rows, columns, font: buildTestFont({ codePoints: [...ascii, ...ideographs, 0x5217, 0x2026] }).bytes };
}

function engineOf(data: { rows: Row[]; columns: ColumnDef<Row>[] }) {
  const engine = createDataGridEngine<Row, readonly DataGridModule<Row, any, any, string>[]>({
    getRowId: (r) => r.id,
    columns: data.columns,
    dataSource: data.rows,
    dev: false,
    timeZone: 'UTC',
    modules: [createSortModule<Row>(), createExportModule<Row>()],
  });
  engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n1', direction: 'asc' }] });
  engine.getSnapshot();
  return engine;
}

interface Timing {
  readonly totalMs: number;
  readonly maxSliceMs: number;
  readonly bytes: number;
}

async function measure(run: (yieldFn: () => Promise<void>) => Promise<Uint8Array>): Promise<Timing> {
  let sliceStart = performance.now();
  let maxSlice = 0;
  const yieldFn = async (): Promise<void> => {
    maxSlice = Math.max(maxSlice, performance.now() - sliceStart);
    await new Promise((resolve) => setTimeout(resolve, 0));
    sliceStart = performance.now();
  };
  const t0 = performance.now();
  sliceStart = t0;
  const bytes = await run(yieldFn);
  maxSlice = Math.max(maxSlice, performance.now() - sliceStart);
  return { totalMs: performance.now() - t0, maxSliceMs: maxSlice, bytes: bytes.length };
}

async function gate(name: string, run: (yieldFn: () => Promise<void>) => Promise<Uint8Array>, budgetMs: number): Promise<void> {
  await measure(run);
  let t = await measure(run);
  if (t.totalMs > budgetMs || t.maxSliceMs > 50) t = await measure(run);
  console.log(`${name}: total ${t.totalMs.toFixed(0)} ms, max slice ${t.maxSliceMs.toFixed(1)} ms, ${(t.bytes / 1024 / 1024).toFixed(2)} MB`);
  assertBudget(t.totalMs, budgetMs, `${name} total`);
  assertBudget(t.maxSliceMs, 50, `${name} max slice`);
}

describe('export performance', () => {
  it('XLSX 100k x 20 within 5 s, <= 50 ms per slice', async () => {
    const engine = engineOf(fixture(100_000, 8, 6, 4, 2));
    await gate('xlsx 100k x 20', (yieldFn) => writeXlsx(createExportModel(engine), { yield: yieldFn }), 5000);
  });

  it('PDF 10k x 10 within 5 s, <= 50 ms per slice', async () => {
    const engine = engineOf(fixture(10_000, 4, 3, 2, 1));
    await gate('pdf 10k x 10', (yieldFn) => writePdf(createExportModel(engine), { yield: yieldFn }), 5000);
  });

  it('PDF 10k x 10 CJK with an embedded font within 5 s, <= 50 ms per slice, subset only', async () => {
    const data = cjkFixture(10_000);
    const engine = engineOf(data);
    let last: Uint8Array = new Uint8Array();
    await gate('pdf 10k x 10 cjk', async (yieldFn) => (last = await writePdf(createExportModel(engine), { yield: yieldFn, font: data.font })), 5000);
    const program = pdfRawStreams(last).find((s) => s.length1 !== null);
    assert.ok(program, 'font program embedded');
    const used = new Set<string>();
    for (const row of data.rows) for (let c = 0; c < 8; c++) for (const ch of row[`s${c}`] as string) used.add(ch);
    const glyphs = readFont(program.data).numGlyphs;
    console.log(`pdf 10k x 10 cjk: ${used.size} ideographs used of 3000, font program ${(program.data.length / 1024).toFixed(1)} KB of ${(data.font.length / 1024).toFixed(1)} KB`);
    assert.ok(program.data.length < data.font.length, 'subset smaller than the font');
    assert.ok(glyphs >= used.size && glyphs <= used.size + 100, `subset holds ${glyphs} glyphs for ${used.size} ideographs`);
  });
});
