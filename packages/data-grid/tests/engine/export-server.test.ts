// `@salmonui/data-grid/engine/export-server`. A headless grid from rows and
// columns gives the same export as a client grid with the same query or
// state; CSV, XLSX, and PDF stream into Node Writables (with backpressure),
// Web WritableStreams, and Web Responses (a Next.js-style route handler).
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { describe, it } from 'node:test';
import { exportCsv } from '@salmonui/data-grid/engine/export';
import { getDataGridState, serializeDataGridState } from '@salmonui/data-grid/engine/persistence';
import { createExportDataGrid, createExportStream, exportToResponse, exportToStream, type ServerExportOptions } from '@salmonui/data-grid/engine/export-server';
import { buildTestFont } from '../../../export/tests/font-fixture.ts';
import { makeEngine, pdfUnicodeText, saleColumns, sales, sheetCells, unzip, type Sale } from '../../../export/tests/helpers.ts';

/** A Node Writable that collects bytes, optionally slowly with a tiny buffer. */
function collector(options: { slow?: boolean } = {}): { stream: Writable; bytes(): Uint8Array; drains: number } {
  const parts: Buffer[] = [];
  const state = { drains: 0 };
  const stream = new Writable({
    highWaterMark: options.slow ? 16 : 16 * 1024,
    write(chunk: Buffer, _encoding, callback) {
      parts.push(Buffer.from(chunk));
      if (options.slow) setImmediate(callback);
      else callback();
    },
  });
  stream.on('drain', () => state.drains++);
  return {
    stream,
    bytes: () => new Uint8Array(Buffer.concat(parts)),
    get drains() {
      return state.drains;
    },
  };
}

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
/** The client side of a server export: the grid state as URL-safe text. */
const createPersistence = (engine: ReturnType<typeof makeEngine>): string => serializeDataGridState(getDataGridState(engine));

describe('createExportDataGrid', () => {
  it('matches a client grid export for the same query', async () => {
    const query = { sorting: [{ columnId: 'qty', direction: 'desc' as const }], filters: [{ columnId: 'region', operator: 'notEqual', value: 'East', predicate: 'and' as const, source: 'api' as const }] };
    const client = await exportCsv(makeEngine({ defaultQuery: query }));
    const server = await exportCsv(createExportDataGrid({ rows: sales(), columns: saleColumns, query, timeZone: 'UTC', locale: 'en-US' }));
    assert.ok(client && server);
    assert.equal(server.data, client.data);
    assert.match(server.data, /^ID,Region,Qty/);
    assert.ok(!server.data.includes('East'));
  });

  it('applies a serialized client state (sorting, filters, grouping, page)', async () => {
    const client = makeEngine({ pageSize: 2 });
    client.dispatch({ type: 'sort.set', sorting: [{ columnId: 'price', direction: 'desc' }] });
    client.dispatch({ type: 'paging.goToPage', page: 2 });
    const state = createPersistence(client);
    const expected = await exportCsv(client, { pages: 'current' });
    const actual = await exportCsv(createExportDataGrid({ rows: sales(), columns: saleColumns, state, timeZone: 'UTC', locale: 'en-US' }), { pages: 'current' });
    assert.ok(expected && actual);
    assert.equal(actual.data, expected.data);
    assert.equal(actual.data.trim().split('\r\n').length, 3, 'header plus page 2 of size 2');
  });

  it('lookup columns export display text, local or remote', async () => {
    interface Order { readonly id: string; readonly customerId: number }
    const customers = [
      { CustomerID: 1, ContactName: 'Maria' },
      { CustomerID: 2, ContactName: 'Ana' },
    ];
    const rows: Order[] = [
      { id: 'o1', customerId: 2 },
      { id: 'o2', customerId: 1 },
    ];
    const columns = (data: unknown) => [
      { field: 'id' as const, header: 'ID', primaryKey: true },
      { field: 'customerId' as const, header: 'Customer', lookup: { data, keyField: 'CustomerID', displayField: 'ContactName' } },
    ];
    const csv = async (data: unknown): Promise<string> => {
      const stream = await createExportStream<Order>({ rows, columns: columns(data) as never }, { format: 'csv' });
      const parts: Uint8Array[] = [];
      for await (const chunk of (stream as NonNullable<typeof stream>).chunks) parts.push(chunk);
      return text(new Uint8Array(Buffer.concat(parts)));
    };
    assert.deepEqual((await csv(customers)).trim().split('\r\n'), ['ID,Customer', 'o1,Ana', 'o2,Maria']);
    const remote = {
      load: (request: { readonly keys: readonly unknown[] }) =>
        new Promise<unknown[]>((resolve) => setTimeout(() => resolve(customers.filter((c) => request.keys.includes(c.CustomerID))), 5)),
    };
    assert.deepEqual((await csv(remote)).trim().split('\r\n'), ['ID,Customer', 'o1,Ana', 'o2,Maria'], 'remote loads are awaited');
  });

  it('defaults row ids to the primary key, else the index', () => {
    const keyed = createExportDataGrid({ rows: sales(2), columns: saleColumns });
    assert.deepEqual(keyed.getSnapshot().rows.sourceIds.slice(0, 2), ['s0', 's1']);
    const plain = createExportDataGrid({ rows: [{ a: 1 }, { a: 2 }], columns: [{ field: 'a' }] });
    assert.deepEqual(plain.getSnapshot().rows.sourceIds.slice(0, 2), ['0', '1']);
  });
});

describe('exportToStream', () => {
  it('streams CSV into a Node Writable with backpressure', async () => {
    const rows = sales(3000);
    const sink = collector({ slow: true });
    const result = await exportToStream({ rows, columns: saleColumns, timeZone: 'UTC' }, sink.stream, { format: 'csv', fileName: 'sales', chunkRows: 200, bom: true });
    assert.ok(result);
    assert.equal(result.fileName, 'sales.csv');
    assert.equal(result.mimeType, 'text/csv');
    const bytes = sink.bytes();
    assert.equal(bytes.length, result.bytes);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const lines = text(bytes).trim().split('\r\n');
    assert.equal(lines.length, 3001);
    assert.ok(sink.drains > 0, 'waited for drain');
    assert.ok(sink.stream.writableFinished, 'target ended');
  });

  it('streams XLSX into a Web WritableStream', async () => {
    const parts: Uint8Array[] = [];
    const target = new WritableStream<Uint8Array>({ write: (chunk) => void parts.push(chunk) });
    const result = await exportToStream({ rows: sales(), columns: saleColumns, query: { grouping: [{ columnId: 'region' }] }, timeZone: 'UTC' }, target, { format: 'excel', fileName: 'sales' });
    assert.ok(result);
    const bytes = new Uint8Array(Buffer.concat(parts));
    assert.equal(bytes.length, result.bytes);
    const cells = sheetCells(unzip(bytes));
    assert.equal(cells['A1'], 'ID');
    assert.ok(Object.values(cells).some((v) => typeof v === 'string' && v.startsWith('Region: North')), 'group captions');
  });

  it('streams PDF with an embedded font and leaves the target untouched when prevented', async () => {
    const font = buildTestFont({ codePoints: [...Array.from({ length: 95 }, (_, i) => 32 + i), ...Array.from('東京大阪', (c) => c.codePointAt(0) as number)] });
    const rows = [{ id: '1', city: '東京' }, { id: '2', city: '大阪' }];
    const columns = [{ field: 'id', primaryKey: true }, { field: 'city', header: 'City' }];
    const sink = collector();
    const result = await exportToStream({ rows, columns }, sink.stream, { format: 'pdf', font: font.bytes });
    assert.ok(result);
    const decoded = pdfUnicodeText(sink.bytes());
    assert.ok(decoded.includes('東京') && decoded.includes('大阪'));

    const untouched = collector();
    assert.equal(await exportToStream({ rows, columns }, untouched.stream, { format: 'csv' }, { onBeforeExport: (e) => e.preventDefault() }), null);
    assert.equal(untouched.bytes().length, 0);
    assert.ok(!untouched.stream.writableEnded);
  });

  it('rejects when the target fails', async () => {
    const failing = new Writable({ write: (_chunk, _encoding, callback) => callback(new Error('disk full')) });
    failing.on('error', () => {});
    await assert.rejects(exportToStream({ rows: sales(2000), columns: saleColumns }, failing, { format: 'csv', chunkRows: 100 }), /disk full/);
  });

  it('runs hooks and keeps chunks lazy', async () => {
    const stream = await createExportStream({ rows: sales(), columns: saleColumns }, { format: 'csv', columns: [{ field: 'id' }, { field: 'qty' }] }, { cell: ({ column, text: t }) => (column.field === 'id' ? { text: `#${t}` } : null) });
    assert.ok(stream);
    assert.equal(stream.headers['content-type'], 'text/csv; charset=utf-8');
    let out = '';
    for await (const chunk of stream.chunks) out += text(chunk);
    assert.match(out, /^ID,Qty\r\n#s0,1\r\n/);
  });
});

describe('exportToResponse (Next.js route handler)', () => {
  // app/api/sales/export/route.ts
  async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const format = (url.searchParams.get('format') ?? 'csv') as ServerExportOptions<Sale>['format'];
    const state = url.searchParams.get('state') ?? undefined;
    const response = await exportToResponse({ rows: sales(), columns: saleColumns, ...(state ? { state } : {}), timeZone: 'UTC' }, { format, fileName: 'Umsätze 2025' });
    return response ?? new Response(null, { status: 204 });
  }

  it('returns a streaming Response with download headers', async () => {
    for (const format of ['csv', 'excel', 'pdf'] as const) {
      const response = await GET(new Request(`https://example.test/api/sales/export?format=${format}`));
      assert.equal(response.status, 200);
      const extension = format === 'excel' ? 'xlsx' : format;
      assert.equal(response.headers.get('content-disposition'), `attachment; filename="Ums_tze 2025.${extension}"; filename*=UTF-8''Ums%C3%A4tze%202025.${extension}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (format === 'csv') assert.match(text(bytes), /^ID,Region/);
      if (format === 'excel') assert.equal(sheetCells(unzip(bytes))['A1'], 'ID');
      if (format === 'pdf') assert.ok(Buffer.from(bytes).toString('latin1').startsWith('%PDF-1.4'));
    }
  });

  it('reads a client state from the request and returns null when prevented', async () => {
    const client = makeEngine();
    client.dispatch({ type: 'filter.set', filters: [{ columnId: 'region', operator: 'equal', value: 'South' }] });
    const response = await GET(new Request(`https://example.test/x?format=csv&state=${encodeURIComponent(createPersistence(client))}`));
    const body = await response.text();
    assert.equal(body.trim().split('\r\n').length, 3, 'header and the two South rows');
    assert.equal(await exportToResponse({ rows: sales(), columns: saleColumns }, { format: 'csv' }, { onBeforeExport: (e) => e.preventDefault() }), null);
  });
});
