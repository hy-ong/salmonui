// `@salmonui/data-grid/engine/export-server`: server-side export without a
// browser or React. `createExportDataGrid` builds a headless Data Grid engine
// from rows and column definitions (query, or a client `getState()`
// snapshot, applied through the same modules the browser grid uses), so the
// export model, formatting, grouping, and aggregates equal the client
// export. `createExportStream`, `exportToStream`, and `exportToResponse`
// stream CSV, XLSX, or PDF to an async iterable, a Node `Writable` or Web
// `WritableStream`, or a Web `Response` (Next.js route handlers, any
// fetch-style server).
//
// CSV is streamed chunk by chunk as it is written (`streamCsv`). XLSX and
// PDF are written to memory (their containers need offsets and sizes up
// front) and then streamed in 64 KB chunks with backpressure.
//
// No DOM globals and no Node built-in imports: platform classes
// (`ReadableStream`, `Response`) are read from `globalThis` when used, so the
// entry runs on Node 22+, Deno, Bun, and edge runtimes. XLSX and PDF load
// the `@salmonui/export` writers (an optional peer of this package) on use.

import {
  createAggregatesModule,
  createFilterModule,
  createDataGridEngine,
  createGroupingModule,
  createPagingModule,
  createSearchModule,
  createSortModule,
  type ColumnDef,
  type DataGridEngine,
  type DataGridModule,
  type DataGridQueryInit,
  type RowId,
} from './index.js';
import { createLookupModule } from './lookup.js';
import {
  createExportModule,
  exportFileName,
  resolveExportModel,
  runBeforeExport,
  streamCsv,
  toExportModelOptions,
  type CsvExportOptions,
  type CsvStreamOptions,
  type ExportFormat,
  type ExportHandlers,
  type ExportModel,
  type ExportSource,
} from './export.js';
import { DATA_GRID_PERSISTENCE_FNS, type DataGridState } from './persistence.js';
import { createTreeModule, flattenTree, withTreePersistence, type TreeOptions } from './tree.js';
import type { PdfExportOptions } from '@salmonui/export/pdf';
import type { XlsxExportOptions } from '@salmonui/export/xlsx';

interface TextEncoderLike {
  encode(text: string): Uint8Array;
}

const encoder: TextEncoderLike | null = (() => {
  const Ctor = (globalThis as { TextEncoder?: new () => TextEncoderLike }).TextEncoder;
  return Ctor ? new Ctor() : null;
})();

/** UTF-8 bytes of a string (a copy of the `@salmonui/export` helper, so CSV needs no writer package). */
function utf8(text: string): Uint8Array {
  if (encoder) return encoder.encode(text);
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d < 0xe000) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** Rows and columns of a headless export grid. */
export interface ExportDataGridOptions<Row> {
  readonly rows: readonly Row[];
  readonly columns: readonly ColumnDef<Row>[];
  /** Default: the `primaryKey` column's value, else the row index. */
  readonly getRowId?: (row: Row, index: number) => RowId;
  /** Sorting, filters, search, grouping, aggregates, and paging. */
  readonly query?: DataGridQueryInit;
  /** A client grid state (`getState()`, or its `serializeDataGridState` text), applied after `query`. */
  readonly state?: DataGridState | string;
  readonly locale?: string;
  readonly timeZone?: string;
  readonly currency?: string;
  readonly direction?: 'ltr' | 'rtl';
  /**
   * Tree mode: the same `tree` options as the client grid
   * (`true` means nested rows under `children`). Nested `rows` are flattened
   * here; a client `state` restores `tree.expandedRows`. The export model
   * then carries each row's depth, so XLSX outlines, PDF indentation, and
   * the CSV depth column equal the client export.
   */
  readonly tree?: TreeOptions<Row> | true;
}

/** A grid, an export model, or rows and columns. */
export type ServerExportSource<Row> = ExportSource<Row> | ExportDataGridOptions<Row>;

/** Options of one server export; `format` selects the writer and its options. */
export type ServerExportOptions<Row> =
  | ({ readonly format: 'csv' } & CsvExportOptions<Row> & Omit<CsvStreamOptions, keyof CsvExportOptions<Row>>)
  | ({ readonly format: 'excel' } & XlsxExportOptions<Row>)
  | ({ readonly format: 'pdf' } & PdfExportOptions<Row>);

/** Hooks and `onBeforeExport`; there is no file promise, so no `onExport`. */
export type ServerExportHandlers<Row> = Omit<ExportHandlers<Row>, 'onExport'>;

/** A started export: name, type, download headers, and the bytes as an async iterable. */
export interface ExportStream {
  readonly fileName: string;
  readonly mimeType: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly chunks: AsyncIterable<Uint8Array>;
}

/** Result of `exportToStream`. */
export interface ExportStreamResult {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: number;
}

/** The parts of a Node `Writable` the export uses. */
export interface NodeWritableLike {
  write(chunk: Uint8Array): boolean;
  end(callback?: () => void): unknown;
  once(event: 'drain' | 'error', listener: (error?: unknown) => void): unknown;
  removeListener(event: 'drain' | 'error', listener: (error?: unknown) => void): unknown;
}

/** The parts of a Web `WritableStream` the export uses. */
export interface WebWritableStreamLike {
  getWriter(): {
    readonly ready: Promise<unknown>;
    write(chunk: Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort(reason?: unknown): Promise<void>;
  };
}

/** The platform `Response` type where the consumer's environment declares one (DOM lib, `@types/node`). */
export type PlatformResponse = typeof globalThis extends { Response: { prototype: infer R } } ? R : unknown;

const MIME: Readonly<Record<ExportFormat, string>> = {
  csv: 'text/csv',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

const CHUNK = 64 * 1024;

function isGridInput<Row>(source: ServerExportSource<Row>): source is ExportDataGridOptions<Row> {
  const s = source as Partial<ExportDataGridOptions<Row>> & { getRow?: unknown; dispatch?: unknown };
  return Array.isArray(s.rows) && Array.isArray(s.columns) && typeof s.getRow !== 'function' && typeof s.dispatch !== 'function';
}

function hasLookup<Row>(columns: readonly ColumnDef<Row>[]): boolean {
  return columns.some((c) => c.lookup !== undefined || (c.columns !== undefined && hasLookup(c.columns)));
}

interface LookupStatusReader {
  getColumns(): readonly { readonly columnId: string }[];
  getStatus(columnId: string): { readonly status: string } | undefined;
}

/**
 * Waits for remote lookup loads queued while building a model, so a
 * server export of a headless grid writes display text instead of blanks.
 */
async function settleLookups<Row>(engine: DataGridEngine<Row>): Promise<boolean> {
  const lookup = (engine as unknown as { readonly lookup?: LookupStatusReader }).lookup;
  if (!lookup) return false;
  const columns = lookup.getColumns();
  if (!columns.length) return false;
  const loading = (): boolean => columns.some((c) => lookup.getStatus(c.columnId)?.status === 'loading');
  // Keys are batched per microtask; let the batch start.
  await Promise.resolve();
  await Promise.resolve();
  if (!loading()) return false;
  await new Promise<void>((resolve) => {
    const off = engine.subscribeModule('lookup', () => {
      if (loading()) return;
      off();
      resolve();
    });
    if (!loading()) {
      off();
      resolve();
    }
  });
  return true;
}

/**
 * Creates a headless grid (no React, no DOM) with the query modules and the
 * `export` module (plus `lookup` when a column has one), for server-side
 * export. `query` is applied first, then a client `state` snapshot.
 */
export function createExportDataGrid<Row>(options: ExportDataGridOptions<Row>): DataGridEngine<Row> {
  const tree = options.tree === true ? { childrenField: 'children' } : (options.tree ?? null);
  // The tree part of a client state (`tree.expandedRows`) is read and restored only in tree mode.
  const fns = tree ? withTreePersistence(DATA_GRID_PERSISTENCE_FNS) : DATA_GRID_PERSISTENCE_FNS;
  const state = typeof options.state === 'string' ? fns.deserializeDataGridState(options.state) : options.state;
  const rows = tree && !tree.parentIdField ? flattenTree(options.rows, tree.childrenField ?? 'children') : options.rows;
  const key = options.columns.find((c) => c.primaryKey && typeof c.field === 'string')?.field;
  const getRowId =
    options.getRowId ??
    ((row: Row, index: number): RowId => {
      const value = key ? (row as Record<string, unknown>)[key] : undefined;
      return value === undefined || value === null ? String(index) : String(value);
    });
  const engine = createDataGridEngine<Row, readonly DataGridModule<Row, any, any, string>[]>({
    getRowId,
    columns: options.columns,
    dataSource: rows,
    dev: false,
    modules: [
      createSearchModule<Row>(),
      createFilterModule<Row>(),
      createSortModule<Row>(),
      createGroupingModule<Row>(),
      createAggregatesModule<Row>(),
      createPagingModule<Row>(),
      // Lookup columns export their display text, as on the client.
      ...(hasLookup(options.columns) ? [createLookupModule<Row>()] : []),
      ...(tree ? [createTreeModule<Row>()] : []),
      createExportModule<Row>(),
    ],
    ...(tree ? { tree } : {}),
    // Paging only applies when the query or the state carries a page.
    paging: { enabled: Boolean(options.query?.paging || state?.paging) },
    ...(options.query ? { defaultQuery: options.query } : {}),
    ...(options.locale ? { locale: options.locale } : {}),
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    ...(options.currency ? { currency: options.currency } : {}),
    ...(options.direction ? { direction: options.direction } : {}),
  });
  if (state) fns.restoreDataGridState(engine, state, { exclude: ['selection', 'scroll'] });
  return engine as DataGridEngine<Row>;
}

async function* slices(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  for (let at = 0; at < bytes.length; at += CHUNK) yield bytes.subarray(at, Math.min(bytes.length, at + CHUNK));
}

/** `Content-Disposition` for a download name (ASCII fallback plus RFC 5987 UTF-8 name). */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/**
 * Starts an export: raises `onBeforeExport` (null when prevented), builds the
 * export model, and returns the file name, MIME type, download headers, and
 * the bytes as an async iterable. Nothing is written until `chunks` is read.
 */
export async function createExportStream<Row>(source: ServerExportSource<Row>, options: ServerExportOptions<Row>, handlers: ServerExportHandlers<Row> = {}): Promise<ExportStream | null> {
  const format = options.format;
  if (!(format in MIME)) throw new Error(`createExportStream: unknown format "${String(format)}".`);
  if (!runBeforeExport(handlers, format)) return null;
  const headless = isGridInput(source) ? createExportDataGrid(source) : null;
  const engine = headless ?? (source as ExportSource<Row>);
  const modelOptions = toExportModelOptions(options, handlers);
  let model = resolveExportModel(engine, modelOptions) as ExportModel<Row>;
  if (headless && (await settleLookups(headless))) model = resolveExportModel(engine, modelOptions) as ExportModel<Row>;
  const fileName = exportFileName(options.fileName, format === 'excel' ? 'xlsx' : format);
  const mimeType = MIME[format];
  let chunks: AsyncIterable<Uint8Array>;
  if (format === 'csv') {
    chunks = (async function* () {
      for await (const text of streamCsv(model, options)) yield utf8(text);
    })();
  } else if (format === 'excel') {
    chunks = (async function* () {
      const { writeXlsx } = await import('@salmonui/export/xlsx');
      yield* slices(await writeXlsx([model], options));
    })();
  } else {
    chunks = (async function* () {
      const { writePdf } = await import('@salmonui/export/pdf');
      yield* slices(await writePdf(model, options));
    })();
  }
  return {
    fileName,
    mimeType,
    headers: { 'content-type': format === 'csv' ? `${mimeType}; charset=utf-8` : mimeType, 'content-disposition': contentDisposition(fileName) },
    chunks,
  };
}

async function pipeNode(chunks: AsyncIterable<Uint8Array>, target: NodeWritableLike): Promise<number> {
  let failure: unknown = null;
  let wake: (() => void) | null = null;
  const onError = (error?: unknown): void => {
    failure = error ?? new Error('exportToStream: the target stream failed.');
    wake?.();
  };
  target.once('error', onError);
  let bytes = 0;
  try {
    for await (const chunk of chunks) {
      if (failure) throw failure;
      bytes += chunk.length;
      if (!target.write(chunk)) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          target.once('drain', () => resolve());
        });
      }
      if (failure) throw failure;
    }
    await new Promise<void>((resolve) => {
      wake = resolve;
      target.end(() => resolve());
    });
    if (failure) throw failure;
    return bytes;
  } finally {
    target.removeListener('error', onError);
  }
}

async function pipeWeb(chunks: AsyncIterable<Uint8Array>, target: WebWritableStreamLike): Promise<number> {
  const writer = target.getWriter();
  let bytes = 0;
  try {
    for await (const chunk of chunks) {
      await writer.ready;
      bytes += chunk.length;
      writer.write(chunk).catch(() => {});
    }
    await writer.close();
    return bytes;
  } catch (error) {
    await writer.abort(error).catch(() => {});
    throw error;
  }
}

/**
 * Streams an export to a Node `Writable` (for example an `http.ServerResponse`
 * or `fs.createWriteStream`) or a Web `WritableStream`, honoring
 * backpressure, and ends the target. Resolves to the file name, MIME type,
 * and byte count, or null when `onBeforeExport` prevents the export (the
 * target is then left untouched).
 */
export async function exportToStream<Row>(
  source: ServerExportSource<Row>,
  target: NodeWritableLike | WebWritableStreamLike,
  options: ServerExportOptions<Row>,
  handlers: ServerExportHandlers<Row> = {},
): Promise<ExportStreamResult | null> {
  const stream = await createExportStream(source, options, handlers);
  if (!stream) return null;
  const bytes = 'getWriter' in target ? await pipeWeb(stream.chunks, target) : await pipeNode(stream.chunks, target);
  return { fileName: stream.fileName, mimeType: stream.mimeType, bytes };
}

interface ReadableStreamCtor {
  new (source: { pull(controller: { enqueue(chunk: Uint8Array): void; close(): void }): Promise<void>; cancel(): Promise<void> }): unknown;
}
type ResponseCtor = new (body: unknown, init: { status: number; headers: Record<string, string> }) => unknown;

/**
 * Exports to a Web `Response` whose body streams the file, with
 * `Content-Type` and `Content-Disposition` set: return it from a Next.js
 * route handler or any fetch-style server. Resolves to null when
 * `onBeforeExport` prevents the export.
 */
export async function exportToResponse<Row>(
  source: ServerExportSource<Row>,
  options: ServerExportOptions<Row>,
  handlers: ServerExportHandlers<Row> = {},
  init: { readonly status?: number; readonly headers?: Readonly<Record<string, string>> } = {},
): Promise<PlatformResponse | null> {
  const g = globalThis as { ReadableStream?: ReadableStreamCtor; Response?: ResponseCtor };
  if (!g.ReadableStream || !g.Response) throw new Error('exportToResponse: this runtime has no ReadableStream / Response; use exportToStream.');
  const stream = await createExportStream(source, options, handlers);
  if (!stream) return null;
  const iterator = stream.chunks[Symbol.asyncIterator]();
  const body = new g.ReadableStream({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return?.();
    },
  });
  return new g.Response(body, { status: init.status ?? 200, headers: { ...stream.headers, ...init.headers } }) as PlatformResponse;
}
