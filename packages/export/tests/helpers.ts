// Test helpers: a tiny ZIP reader (node:zlib for inflate) and PDF stream
// extraction, so the writers are checked against an independent decoder.
import { inflateRawSync, inflateSync } from 'node:zlib';
import {
  createAggregatesModule,
  createFilterModule,
  createDataGridEngine,
  createGroupingModule,
  createPagingModule,
  createSelectionModule,
  createSortModule,
  type ChildGridConfig,
  type ColumnDef,
  type DataGridModule,
  type DataGridQueryInit,
} from '@salmonui/data-grid/engine';
import { createDetailModule } from '@salmonui/data-grid/engine/expansion';
import { createExportModule } from '@salmonui/data-grid/engine/export';
import { createHierarchyModule } from '@salmonui/data-grid/engine/hierarchy';

export function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('no end of central directory');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('bad central directory');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('bad local header');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    const raw = method === 8 ? inflateRawSync(data) : data;
    out.set(name, new TextDecoder().decode(raw));
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return out;
}

/** Shared strings of a workbook, in index order. */
export function sharedStrings(files: Map<string, string>): string[] {
  const xml = files.get('xl/sharedStrings.xml') ?? '';
  return [...xml.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)].map((m) => (m[1] as string).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

/** Cell values of a sheet as `{ A1: 'text' | number }` (shared strings resolved). */
export function sheetCells(files: Map<string, string>, sheet = 1): Record<string, string | number | boolean> {
  const xml = files.get(`xl/worksheets/sheet${sheet}.xml`) ?? '';
  const strings = sharedStrings(files);
  const out: Record<string, string | number | boolean> = {};
  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = m[1] as string;
    const attrs = m[2] ?? '';
    const body = m[3] ?? '';
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    const f = /<f>([\s\S]*?)<\/f>/.exec(body)?.[1];
    if (f !== undefined) out[ref] = `=${f}`;
    else if (v === undefined) continue;
    else if (attrs.includes('t="s"')) out[ref] = strings[Number(v)] as string;
    else if (attrs.includes('t="b"')) out[ref] = v === '1';
    else out[ref] = Number(v);
  }
  return out;
}

/** Decoded content streams of a PDF (and ToUnicode CMaps; not font programs). */
export function pdfStreams(bytes: Uint8Array): string[] {
  return pdfRawStreams(bytes)
    .filter((s) => s.length1 === null)
    .map((s) => Buffer.from(s.data).toString('latin1'));
}

/** Every stream of a PDF, inflated, with its object id and `/Length1` (font programs). */
export function pdfRawStreams(bytes: Uint8Array): { id: number; data: Uint8Array; length1: number | null }[] {
  const text = Buffer.from(bytes).toString('latin1');
  const out: { id: number; data: Uint8Array; length1: number | null }[] = [];
  const re = /(\d+) 0 obj\n<< \/Length (\d+)( \/Filter \/FlateDecode)?(?: \/Length1 (\d+))? >>\nstream\n/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[0].length;
    const data = bytes.subarray(start, start + Number(m[2]));
    out.push({ id: Number(m[1]), data: m[3] ? new Uint8Array(inflateSync(data)) : data, length1: m[4] ? Number(m[4]) : null });
  }
  return out;
}

/** Strings shown by hex `<...> Tj` operators, decoded through the document's ToUnicode CMaps. */
export function pdfUnicodeText(bytes: Uint8Array): string[] {
  const streams = pdfStreams(bytes);
  const map = new Map<string, string>();
  for (const s of streams.filter((x) => x.includes('beginbfchar'))) {
    for (const m of s.matchAll(/<([0-9A-F]{4})> <([0-9A-F]+)>/g)) {
      const hex = m[2] as string;
      let u = '';
      for (let i = 0; i < hex.length; i += 4) u += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
      map.set(m[1] as string, u);
    }
  }
  const out: string[] = [];
  for (const s of streams.filter((x) => !x.includes('beginbfchar'))) {
    for (const m of s.matchAll(/<([0-9A-F]*)> Tj/g)) {
      const hex = m[1] as string;
      let t = '';
      for (let i = 0; i < hex.length; i += 4) t += map.get(hex.slice(i, i + 4)) ?? '\uFFFD';
      out.push(t);
    }
  }
  return out;
}

/** Text drawn by `Tj` operators, octal escapes decoded. */
export function pdfText(stream: string): string[] {
  return [...stream.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) =>
    (m[1] as string).replace(/\\([0-7]{3}|.)/g, (_, e: string) => (e.length === 3 ? String.fromCharCode(Number.parseInt(e, 8)) : e)),
  );
}

export interface Sale {
  readonly id: string;
  readonly region: string;
  readonly qty: number;
  readonly price: number;
  readonly ok: boolean;
  readonly when: Date;
}

export function sales(count = 6): Sale[] {
  const regions = ['North', 'South', 'North', 'East', 'South', 'North'];
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    region: regions[i % regions.length] as string,
    qty: i + 1,
    price: 10 * (i + 1) + 0.5,
    ok: i % 2 === 0,
    when: new Date(Date.UTC(2025, 0, i + 1)),
  }));
}

export const saleColumns: ColumnDef<Sale>[] = [
  { field: 'id', header: 'ID', primaryKey: true },
  { field: 'region', header: 'Region' },
  { field: 'qty', header: 'Qty', type: 'number' },
  { field: 'price', header: 'Price', type: 'number', format: 'N2', width: 120 },
  { field: 'ok', header: 'OK', type: 'boolean' },
  { field: 'when', header: 'When', type: 'date', format: 'yyyy-MM-dd' },
];

/** Stacked headers: ID | Order (Qty, Price) | Region | Info (OK, When). */
export const stackedColumns: ColumnDef<Sale>[] = [
  { field: 'id', header: 'ID' },
  { id: 'order', header: 'Order', columns: [{ field: 'qty', header: 'Qty', type: 'number' }, { field: 'price', header: 'Price', type: 'number' }] },
  { field: 'region', header: 'Region' },
  { id: 'info', header: 'Info', columns: [{ field: 'ok', header: 'OK', type: 'boolean' }, { field: 'when', header: 'When', type: 'date', format: 'yyyy-MM-dd' }] },
];

export function makeEngine(options: { defaultQuery?: DataGridQueryInit; columns?: ColumnDef<Sale>[]; rows?: Sale[]; pageSize?: number } = {}) {
  return createDataGridEngine<Sale, readonly DataGridModule<Sale, any, any, string>[]>({
    getRowId: (r) => r.id,
    columns: options.columns ?? saleColumns,
    dataSource: options.rows ?? sales(),
    dev: false,
    timeZone: 'UTC',
    locale: 'en-US',
    modules: [
      createFilterModule<Sale>(),
      createSortModule<Sale>(),
      createGroupingModule<Sale>(),
      createAggregatesModule<Sale>(),
      createPagingModule<Sale>(),
      createSelectionModule<Sale>(),
      createExportModule<Sale>(),
    ],
    paging: { enabled: options.pageSize !== undefined, pageSize: options.pageSize ?? 12 },
    ...(options.defaultQuery ? { defaultQuery: options.defaultQuery } : {}),
  });
}

/**
 * Employees -> orders -> customers child grids; employee 2
 * is expanded. `levels` past 2 chain further customer grids below the
 * customers (for the outline cap).
 */
export function makeHierarchy(levels = 2) {
  const employees = [1, 2, 3].map((id) => ({ EmployeeID: id, name: `E${id}` }));
  const orders: { OrderID: number; EmployeeID: number; CustomerID: string }[] = [];
  for (let i = 0; i < 6; i++) orders.push({ OrderID: 100 + i, EmployeeID: 1 + (i % 3), CustomerID: `C${i % 2}` });
  const customers = [
    { CustomerID: 'C0', company: 'Zero' },
    { CustomerID: 'C1', company: 'One' },
  ];
  const customerGrid = (childGrid?: ChildGridConfig): ChildGridConfig => ({
    relationField: 'CustomerID',
    data: customers,
    columns: [{ field: 'CustomerID', primaryKey: true }, { field: 'company' }],
    ...(childGrid ? { childGrid } : {}),
  });
  let nested = customerGrid();
  for (let l = levels; l > 2; l--) nested = customerGrid(nested);
  const childGrid: ChildGridConfig = { relationField: 'EmployeeID', data: orders, columns: [{ field: 'OrderID', primaryKey: true }, { field: 'CustomerID' }], childGrid: nested };
  const engine = createDataGridEngine({
    getRowId: (r: { EmployeeID: number }) => String(r.EmployeeID),
    columns: [{ field: 'EmployeeID', primaryKey: true }, { field: 'name' }],
    dataSource: employees,
    modules: [createDetailModule<{ EmployeeID: number }>(), createHierarchyModule<{ EmployeeID: number }>(), createExportModule<{ EmployeeID: number }>()],
    hierarchy: { childGrid },
  });
  engine.dispatch({ type: 'detail.expand', rowId: '2' });
  return engine;
}
