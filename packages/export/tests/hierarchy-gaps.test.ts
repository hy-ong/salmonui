// Writer-level hierarchy and custom aggregate checks:
// XLSX `outlineLevel` per nested child-grid row (clamped to the Excel limit
// of 7), PDF child-grid rows, and custom aggregates in XLSX and PDF footers.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, type ChildGridConfig } from '@salmonui/data-grid/engine';
import { createDetailModule } from '@salmonui/data-grid/engine/expansion';
import { createExportModel, type ExportModel } from '@salmonui/core/export-model';
import { createExportModule, hierarchyExportDetail } from '@salmonui/data-grid/engine/export';
import { createHierarchyModule } from '@salmonui/data-grid/engine/hierarchy';
import { writePdf } from '@salmonui/export/pdf';
import { writeXlsx } from '@salmonui/export/xlsx';
import { columnLetter } from '../dist/xlsx-writer.js';
import { makeEngine, pdfStreams, pdfText, sheetCells, unzip } from './helpers.ts';

interface Node {
  readonly id: string;
  readonly parent: string;
  readonly level: number;
}

/** One node per level: n0 (root) > n1 > ... > n12. */
const nodes: Node[] = Array.from({ length: 13 }, (_, level) => ({ id: `n${level}`, parent: level ? `n${level - 1}` : '', level }));

function chain(levels: number): ChildGridConfig {
  let config: ChildGridConfig | undefined;
  for (let i = 0; i < levels; i++) {
    config = {
      parentField: 'id',
      childField: 'parent',
      data: nodes,
      columns: [{ field: 'id', primaryKey: true }, { field: 'level' }],
      ...(config ? { childGrid: config } : {}),
    };
  }
  return config as ChildGridConfig;
}

function hierarchyModel(levels: number, maxDepth?: number): ExportModel<Node> {
  const engine = createDataGridEngine({
    id: 'tree',
    getRowId: (r: Node) => r.id,
    columns: [{ field: 'id', primaryKey: true }, { field: 'level' }],
    dataSource: [nodes[0] as Node],
    modules: [createDetailModule<Node>(), createHierarchyModule<Node>(), createExportModule<Node>()],
    hierarchy: { childGrid: chain(levels) },
  });
  const detail = hierarchyExportDetail(engine, 'all', undefined, maxDepth === undefined ? {} : { maxDepth });
  assert.ok(detail);
  return createExportModel(engine, { hierarchy: 'all', detail });
}

/** `outlineLevel` of every sheet row by row number (0 when absent). */
function outlines(sheet: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of sheet.matchAll(/<row r="(\d+)"([^>]*)>/g)) out.set(Number(m[1]), Number(/outlineLevel="(\d+)"/.exec(m[2] ?? '')?.[1] ?? 0));
  return out;
}

/** Sheet row number holding node `n{level}` (its id cell sits at column `level`). */
function rowOf(cells: Record<string, string | number | boolean>, level: number): number {
  const prefix = columnLetter(level);
  const ref = Object.keys(cells).find((k) => cells[k] === `n${level}` && k.slice(0, prefix.length) === prefix && /^\d+$/.test(k.slice(prefix.length)));
  assert.ok(ref, `n${level} at column ${prefix}`);
  return Number(ref.slice(prefix.length));
}

describe('XLSX hierarchy outline levels', () => {
  it('nested child-grid rows carry outlineLevel equal to their child level, header rows included', async () => {
    const files = unzip(await writeXlsx(hierarchyModel(3)));
    const sheet = files.get('xl/worksheets/sheet1.xml') as string;
    const cells = sheetCells(files);
    const levels = outlines(sheet);
    for (let level = 0; level <= 3; level++) {
      const r = rowOf(cells, level);
      assert.equal(levels.get(r), level, `n${level} data row outline`);
      // The child grid's own header row sits just above its data row, at the same outline level.
      assert.equal(levels.get(r - 1), level, `level ${level} header row outline`);
    }
    // Header cells of nested levels are offset one column per level.
    assert.equal(cells[`${columnLetter(2)}${rowOf(cells, 2) - 1}`], 'id');
  });

  it('the default 7-level export cap keeps every row within outline level 7', async () => {
    const files = unzip(await writeXlsx(hierarchyModel(10)));
    const sheet = files.get('xl/worksheets/sheet1.xml') as string;
    const cells = sheetCells(files);
    const levels = outlines(sheet);
    assert.equal(levels.get(rowOf(cells, 7)), 7);
    // Levels deeper than 7 are dropped by the export model: no n8..n10 cell.
    for (const level of [8, 9, 10]) assert.ok(!Object.values(cells).includes(`n${level}`), `n${level} dropped`);
    assert.equal(Math.max(...levels.values()), 7);
  });

  it('deeper models (maxDepth 10) write every level, with outlineLevel clamped to 7', async () => {
    const files = unzip(await writeXlsx(hierarchyModel(10, 10)));
    const sheet = files.get('xl/worksheets/sheet1.xml') as string;
    const cells = sheetCells(files);
    const levels = outlines(sheet);
    for (let level = 0; level <= 10; level++) assert.equal(levels.get(rowOf(cells, level)), Math.min(7, level), `n${level} outline`);
    assert.equal(Math.max(...levels.values()), 7);
  });
});

describe('PDF hierarchy', () => {
  it('writes every child-grid level after its parent row, in order', async () => {
    const text = pdfStreams(await writePdf(hierarchyModel(3))).flatMap(pdfText);
    assert.ok(text.includes('n0'), 'root row');
    const at = ['n0', 'n1', 'n2', 'n3'].map((t) => text.indexOf(t));
    assert.ok(at.every((i) => i >= 0), 'every level is drawn');
    assert.deepEqual([...at].sort((x, y) => x - y), at, 'each level after its parent');
  });
});

describe('custom aggregates in writers', () => {
  const evens = (list: readonly unknown[]): number => (list as { qty: number }[]).filter((r) => r.qty % 2 === 0).length;
  const engine = () => makeEngine({ defaultQuery: { aggregates: [{ columnId: 'qty', type: 'custom', custom: evens, placement: ['footer'] }] } });

  it('XLSX writes a custom aggregate footer value as a number', async () => {
    const model = createExportModel(engine(), { columns: [{ columnId: 'id' }, { columnId: 'qty' }] });
    const cells = sheetCells(unzip(await writeXlsx(model)));
    // sales(): qty 1..6 → three even quantities; header row 1, data rows 2..7, footer row 8.
    assert.equal(cells['B8'], 3);
  });

  it('PDF writes a custom aggregate footer text, also through the aggregate hook', async () => {
    const plain = pdfStreams(await writePdf(createExportModel(engine(), { columns: [{ columnId: 'id' }, { columnId: 'qty' }] }))).flatMap(pdfText);
    assert.equal(plain.at(-2), '3');
    const hooked = pdfStreams(await writePdf(createExportModel(engine(), { aggregate: (a) => (a.type === 'custom' ? `Evens: ${String(a.value)}` : undefined) }))).flatMap(pdfText);
    assert.ok(hooked.includes('Evens: 3'));
  });
});
