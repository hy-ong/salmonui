// Tree mode export writers: XLSX outline levels per tree
// depth (clamped at 7) with the collapsed outline state of
// `outlineCollapsed`, PDF indentation of the tree column, and the server
// export path with tree options and a client state.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, type ColumnDef, type DataGridModule } from '@salmonui/data-grid/engine';
import { createExportModel } from '@salmonui/core/export-model';
import { createExportModule } from '@salmonui/data-grid/engine/export';
import { DATA_GRID_PERSISTENCE_FNS } from '@salmonui/data-grid/engine/persistence';
import { createTreeModule, flattenTree, withTreePersistence } from '@salmonui/data-grid/engine/tree';
import { exportPdf, writePdf } from '@salmonui/export/pdf';
import { createExportStream } from '@salmonui/data-grid/engine/export-server';
import { exportXlsx, writeXlsx } from '@salmonui/export/xlsx';
import { pdfStreams, pdfText, sheetCells, unzip } from './helpers.ts';

interface Node {
  readonly id: string;
  readonly name: string;
  readonly children?: Node[];
}

const columns: ColumnDef<Node>[] = [{ field: 'id', primaryKey: true }, { field: 'name' }];

/** a [a1, a2 [a21]], b [b1], c */
function nested(): Node[] {
  return [
    { id: 'a', name: 'Alpha', children: [{ id: 'a1', name: 'Apple' }, { id: 'a2', name: 'Avocado', children: [{ id: 'a21', name: 'Acorn' }] }] },
    { id: 'b', name: 'Beta', children: [{ id: 'b1', name: 'Banana' }] },
    { id: 'c', name: 'Gamma' },
  ];
}

/** A chain n0 > n1 > ... > n{levels - 1}. */
function chain(levels: number): Node[] {
  let node: Node | undefined;
  for (let i = levels - 1; i >= 0; i--) node = { id: `n${i}`, name: `N${i}`, ...(node ? { children: [node] } : {}) };
  return [node as Node];
}

type Modules = readonly DataGridModule<Node, any, any, string>[];

function makeEngine(rows: Node[] = nested(), tree: Record<string, unknown> | true = true) {
  return createDataGridEngine<Node, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: flattenTree(rows, 'children'),
    modules: [createTreeModule<Node>(), createExportModule<Node>()],
    tree,
  });
}

interface SheetRow {
  readonly r: number;
  readonly id: string;
  readonly level: number;
  readonly hidden: boolean;
  readonly collapsed: boolean;
}

/** Body rows of sheet 1 (header row skipped): id (column A), outline level, hidden and collapsed flags. */
function sheetRows(bytes: Uint8Array): { rows: SheetRow[]; sheet: string } {
  const files = unzip(bytes);
  const sheet = files.get('xl/worksheets/sheet1.xml') ?? '';
  const cells = sheetCells(files);
  const rows: SheetRow[] = [];
  for (const m of sheet.matchAll(/<row r="(\d+)"([^>]*)>/g)) {
    const r = Number(m[1]);
    if (r === 1) continue;
    const attrs = m[2] ?? '';
    rows.push({ r, id: String(cells[`A${r}`]), level: Number(/outlineLevel="(\d+)"/.exec(attrs)?.[1] ?? 0), hidden: attrs.includes('hidden="1"'), collapsed: attrs.includes('collapsed="1"') });
  }
  return { rows, sheet };
}

describe('tree XLSX export', () => {
  it('every row gets the outline level of its tree depth; the sheet declares the deepest level', async () => {
    const file = await exportXlsx(makeEngine());
    assert.ok(file);
    const { rows, sheet } = sheetRows(file.data);
    assert.deepEqual(
      rows.map((r) => `${r.id}:${r.level}`),
      ['a:0', 'a1:1', 'a2:1', 'a21:2', 'b:0', 'b1:1', 'c:0'],
    );
    assert.match(sheet, /outlineLevelRow="2"/);
    assert.match(sheet, /<outlinePr summaryBelow="0"\/>/);
    assert.ok(rows.every((r) => !r.hidden && !r.collapsed));
  });

  it('outline levels clamp at 7 (the Excel limit, as)', async () => {
    const bytes = await writeXlsx([createExportModel(makeEngine(chain(10)))]);
    const { rows, sheet } = sheetRows(bytes);
    assert.deepEqual(
      rows.map((r) => r.level),
      [0, 1, 2, 3, 4, 5, 6, 7, 7, 7],
    );
    assert.match(sheet, /outlineLevelRow="7"/);
  });

  it("tree 'expanded' (default) leaves collapsed subtrees out; 'all' writes them, open unless outlineCollapsed", async () => {
    const engine = makeEngine();
    engine.dispatch({ type: 'tree.collapse', rowIds: ['a2', 'b'] } as never);
    const expanded = sheetRows((await exportXlsx(engine))!.data).rows;
    assert.deepEqual(
      expanded.map((r) => r.id),
      ['a', 'a1', 'a2', 'b', 'c'],
    );
    assert.ok(expanded.every((r) => !r.hidden && !r.collapsed));

    const open = sheetRows((await exportXlsx(engine, { tree: 'all' }))!.data).rows;
    assert.deepEqual(
      open.map((r) => `${r.id}:${r.level}`),
      ['a:0', 'a1:1', 'a2:1', 'a21:2', 'b:0', 'b1:1', 'c:0'],
    );
    assert.ok(open.every((r) => !r.hidden && !r.collapsed));

    const kept = sheetRows((await exportXlsx(engine, { tree: 'all', outlineCollapsed: true }))!.data).rows;
    assert.deepEqual(
      kept.map((r) => `${r.id}${r.hidden ? ' hidden' : ''}${r.collapsed ? ' collapsed' : ''}`),
      ['a', 'a1', 'a2 collapsed', 'a21 hidden', 'b collapsed', 'b1 hidden', 'c'],
    );
  });
});

/** `x` of every `(text) Tj` drawn in the content streams, by text. */
function textX(bytes: Uint8Array): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of pdfStreams(bytes)) {
    for (const m of s.matchAll(/([\d.]+) ([\d.]+) Td (\((?:\\.|[^\\)])*\)) Tj/g)) {
      const text = pdfText(`${m[3]} Tj`)[0] as string;
      if (!out.has(text)) out.set(text, Number(m[1]));
    }
  }
  return out;
}

describe('tree PDF export', () => {
  it('the tree column is indented by depth (font size per level); other columns are not', async () => {
    const file = await exportPdf(makeEngine(), { compress: false });
    assert.ok(file);
    const x = textX(file.data);
    const a = x.get('a') as number;
    assert.ok(a > 0);
    assert.equal(Math.round(((x.get('a1') as number) - a) * 100) / 100, 8);
    assert.equal(Math.round(((x.get('a21') as number) - a) * 100) / 100, 16);
    assert.equal(x.get('c'), a);
    // The name column (not the tree column) starts at the same x on every row.
    assert.equal(x.get('Acorn'), x.get('Alpha'));
  });

  it('tree.column picks the indented column', async () => {
    const bytes = await writePdf(createExportModel(makeEngine(nested(), { childrenField: 'children', column: 'name' })), { compress: false });
    const x = textX(bytes);
    assert.equal(x.get('a21'), x.get('a'));
    assert.equal(Math.round(((x.get('Acorn') as number) - (x.get('Alpha') as number)) * 100) / 100, 16);
  });
});

async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const c of chunks) parts.push(c);
  return new Uint8Array(Buffer.concat(parts));
}

describe('tree server export', () => {
  it('a headless grid with tree options exports depth (CSV depth column, XLSX outline levels)', async () => {
    const csv = await createExportStream({ rows: nested(), columns, tree: true }, { format: 'csv', treeDepthColumn: true, columns: [{ field: 'id' }] });
    assert.ok(csv);
    assert.equal(new TextDecoder().decode(await collect(csv.chunks)), 'Depth,id\r\n0,a\r\n1,a1\r\n1,a2\r\n2,a21\r\n0,b\r\n1,b1\r\n0,c\r\n');
    const xlsx = await createExportStream({ rows: nested(), columns, tree: { childrenField: 'children' } }, { format: 'excel' });
    assert.ok(xlsx);
    assert.deepEqual(
      sheetRows(await collect(xlsx.chunks)).rows.map((r) => r.level),
      [0, 1, 1, 2, 0, 1, 0],
    );
  });

  it('flat rows (parentIdField) and a client state with tree.expandedRows equal the client export', async () => {
    const flat = flattenTree(nested(), 'children').map(({ children: _children, ...r }) => r);
    const parents: Record<string, string> = { a1: 'a', a2: 'a', a21: 'a2', b1: 'b' };
    const rows = flat.map((r) => ({ ...r, parentId: parents[r.id] ?? null }));
    const client = makeEngine();
    client.dispatch({ type: 'tree.collapse', rowId: 'a' } as never);
    const fns = withTreePersistence(DATA_GRID_PERSISTENCE_FNS);
    const state = fns.getDataGridState(client);
    const stream = await createExportStream(
      { rows, columns: columns as unknown as ColumnDef<(typeof rows)[number]>[], tree: { parentIdField: 'parentId' }, state: JSON.stringify(state) },
      { format: 'excel', tree: 'all', outlineCollapsed: true },
    );
    assert.ok(stream);
    const kept = sheetRows(await collect(stream.chunks)).rows;
    assert.deepEqual(
      kept.map((r) => `${r.id}:${r.level}${r.hidden ? ' hidden' : ''}${r.collapsed ? ' collapsed' : ''}`),
      ['a:0 collapsed', 'a1:1 hidden', 'a2:1 hidden', 'a21:2 hidden', 'b:0', 'b1:1', 'c:0'],
    );
    // The same state as the serialized text a client sends.
    const text = fns.deserializeDataGridState(JSON.stringify(state));
    assert.deepEqual(text.tree?.expandedRows, { a: false });
  });
});
