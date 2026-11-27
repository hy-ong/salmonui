// Reference handler for the `pivot` request kind: runs the pivot engine the application
// passes in (`createPivotEngine` from `@salmonui/pivot-table/engine`) over
// an in-memory array and answers result windows, drill-through pages and,
// through the JSON handler, `read`, `facet` and `write` requests. Server-safe
// (Node, Workers, edge runtimes), zero dependencies, no package imports: the
// engine is typed structurally. Real backends port it to their database; the
// engine is the specification.

import { stableStringify } from './canonical.js';
import { windowHeaders, type PivotHeaderLike } from './pivot-wire.js';
import {
  encodeRows,
  isWirePivotRequest,
  isWireWriteRequest,
  type WireBatchRequest,
  type WirePivotRequest,
  type WirePivotModel,
  type WirePivotResponse,
  type WirePredicate,
  type WireAnyRequest,
  type WireAnyResponse,
  type WireType,
} from './protocol.js';
import { predicates } from './predicates.js';
import { createJsonQueryHandler, type JsonQueryHandler } from './server.js';
import type { UniversalJsonTransport } from './transport.js';
import type { Json } from './types.js';

type Obj = Record<string, unknown>;

/** A cell of `PivotResult.cellAt()`. */
export interface PivotCellLike {
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly rowKey: string;
  readonly columnKey: string;
  readonly measure: string | null;
  readonly value: number | null;
  readonly rawValue: number | null;
  readonly formattedValue: string;
  readonly kind: 'value' | 'subtotal' | 'grandTotal';
  readonly rowCount: number;
}

/** The part of `PivotResult` the handler reads (and `compute()` returns: `exportPivot()` accepts it). */
export interface PivotResultLike {
  readonly model: WirePivotModel;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly rowDepth: number;
  readonly columnDepth: number;
  readonly rowTree: readonly PivotHeaderLike[];
  readonly columnTree: readonly PivotHeaderLike[];
  memberAt(axis: 'rows' | 'columns', index: number): PivotHeaderLike;
  valueAt(rowIndex: number, columnIndex: number): number | null;
  cellAt(rowIndex: number, columnIndex: number): PivotCellLike;
  rowsAt(rowIndex: number, columnIndex: number): readonly number[];
}

/** The part of `PivotEngine` the handler drives. */
export interface PivotEngineLike {
  setModel(model: unknown): PivotResultLike;
  destroy?(): void;
}

/** Options `PivotEngineFactoryLike` is called with. */
export interface PivotEngineFactoryOptions {
  readonly data: readonly Obj[];
  readonly fields?: readonly unknown[];
  readonly model?: unknown;
  readonly locale?: string;
}

/**
 * `createPivotEngine` from `@salmonui/pivot-table/engine`, typed
 * structurally. Declared as a method type so its parameter is bivariant:
 * the engine's typed `fields` and `model` options accept it without `any`.
 */
export type PivotEngineFactoryLike = { bivariant(options: PivotEngineFactoryOptions): PivotEngineLike }['bivariant'];

export interface PivotQueryHandlerOptions {
  /** The engine factory: `createPivotEngine` from `@salmonui/pivot-table/engine`. */
  readonly engine: PivotEngineFactoryLike;
  /** Field definitions passed to the engine (server-side: `valueGetter` allowed). */
  readonly fields?: readonly unknown[];
  readonly locale?: string;
  /** Key field for `write` requests (drill-through editing). Default: the first field. */
  readonly key?: string;
  /** Wire types of drill-through and `read` rows (default: inferred). */
  readonly types?: Readonly<Record<string, WireType>>;
  /** Dictionary-encode drill-through and `read` string fields. */
  readonly dict?: readonly string[] | 'auto';
  /** Max facet entries. Default 1000. */
  readonly facetLimit?: number;
  /** Largest window a request may ask for, in cells. Default 250,000. */
  readonly maxCells?: number;
  /** Engines kept per distinct `where`. Default 4. */
  readonly cacheSize?: number;
}

export interface PivotQueryHandler {
  /** Handles one request (`pivot`, `read`, `facet`, `write`) or a batch. */
  handle(message: unknown): unknown;
  /** In-process transport (no HTTP) for tests, SSR and same-process apps. */
  transport(): UniversalJsonTransport;
  /** The whole result of a model (server-side export). */
  compute(model: unknown, options?: { readonly where?: WirePredicate }): PivotResultLike;
  /** Current rows (after writes). */
  rows(): readonly Obj[];
  /** Replaces the rows; cached engines are dropped and `resultVersion` changes. */
  setRows(rows: readonly Obj[]): void;
}

interface EngineEntry {
  readonly engine: PivotEngineLike;
  readonly data: readonly Obj[];
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const samePath = (a: readonly Json[], key: string): boolean => stableStringify(a) === key;

export function createPivotQueryHandler(initial: readonly Obj[], options: PivotQueryHandlerOptions): PivotQueryHandler {
  let data: readonly Obj[] = initial;
  let dataVersion = 0;
  let engines = new Map<string, EngineEntry>();
  const cacheSize = Math.max(1, options.cacheSize ?? 4);
  const maxCells = options.maxCells ?? 250_000;
  const fieldNames = (): string[] => Object.keys(data[0] ?? {});
  const json = (): JsonQueryHandler =>
    createJsonQueryHandler(data, {
      key: options.key ?? fieldNames()[0] ?? 'id',
      ...(options.types ? { types: options.types } : {}),
      ...(options.dict ? { dict: options.dict } : {}),
      ...(options.facetLimit !== undefined ? { facetLimit: options.facetLimit } : {}),
    });
  let inner = json();
  const typeOf = (field: string): WireType => {
    const declared = options.types?.[field];
    if (declared) return declared;
    const sample = data.find((r) => r[field] !== null && r[field] !== undefined)?.[field];
    return sample instanceof Date ? 'date' : typeof sample === 'number' ? 'number' : typeof sample === 'boolean' ? 'boolean' : typeof sample === 'object' ? 'json' : 'string';
  };

  const setRows = (rows: readonly Obj[]): void => {
    for (const e of engines.values()) e.engine.destroy?.();
    engines = new Map();
    data = rows;
    dataVersion++;
    inner = json();
  };

  /** The engine of one `where` (field index cached per rows identity and filter). */
  const engineFor = (where: WirePredicate | undefined): EngineEntry => {
    const key = stableStringify(where ?? null);
    const hit = engines.get(key);
    if (hit) {
      engines.delete(key);
      engines.set(key, hit);
      return hit;
    }
    const rows = where ? data.filter(predicates(typeOf).compile(where)) : data;
    const entry: EngineEntry = {
      engine: options.engine({ data: rows, ...(options.fields ? { fields: options.fields } : {}), ...(options.locale ? { locale: options.locale } : {}) }),
      data: rows,
    };
    engines.set(key, entry);
    while (engines.size > cacheSize) {
      const oldest = engines.keys().next().value as string;
      engines.get(oldest)?.engine.destroy?.();
      engines.delete(oldest);
    }
    return entry;
  };

  const pivot = (req: WirePivotRequest): WirePivotResponse => {
    const p = req.pivot;
    const entry = engineFor(p.where);
    const result = entry.engine.setModel(p.model);
    const rowCount = result.rowCount;
    const columnCount = result.columnCount;
    const resultVersion = `${dataVersion}.${hash(stableStringify([p.where ?? null, p.model]))}`;

    if (p.drillThrough) {
      const d = p.drillThrough;
      const rowKey = stableStringify(d.rowPath);
      const columnKey = stableStringify(d.columnPath);
      let r = -1;
      const fits = (h: PivotHeaderLike, key: string): boolean => samePath(h.path, key) && (d.value === undefined || h.measure === null || h.measure === d.value);
      for (let i = 0; i < rowCount && r < 0; i++) if (fits(result.memberAt('rows', i), rowKey)) r = i;
      let c = -1;
      for (let j = 0; j < columnCount && c < 0; j++) {
        const h = result.memberAt('columns', j);
        if (fits(h, columnKey)) c = j;
      }
      if (r < 0 || c < 0) return { v: 1, id: req.id, error: { code: 'pivot/unknown-cell', message: 'No result cell has these member paths.' } };
      const indexes = result.rowsAt(r, c);
      const offset = Math.max(0, d.page.offset);
      const slice = indexes.slice(offset, offset + Math.max(0, d.page.limit)).map((k) => entry.data[k] as Obj);
      const fields = d.select ?? fieldNames();
      const types = fields.map(typeOf);
      const encoded = encodeRows(slice, { fields, types, ...(options.dict ? { dict: options.dict } : {}) });
      return { v: 1, id: req.id, resultVersion, fields, types, rows: encoded.rows, ...(encoded.dict ? { dict: encoded.dict } : {}), total: indexes.length };
    }

    const w = p.window ?? { rows: [0, rowCount], columns: [0, columnCount] };
    const r0 = Math.max(0, Math.min(rowCount, w.rows[0]));
    const r1 = Math.max(r0, Math.min(rowCount, w.rows[1]));
    const c0 = Math.max(0, Math.min(columnCount, w.columns[0]));
    const c1 = Math.max(c0, Math.min(columnCount, w.columns[1]));
    if ((r1 - r0) * (c1 - c0) > maxCells) return { v: 1, id: req.id, error: { code: 'pivot/window-too-large', message: `A window may hold at most ${maxCells} cells.` } };
    const cells: (number | null)[][] = new Array(r1 - r0);
    // Cell kinds (subtotal / grand total), one character per cell; omitted when every cell is a value.
    const kinds: string[] = new Array(r1 - r0);
    let totals = false;
    for (let r = r0; r < r1; r++) {
      const line = new Array<number | null>(c1 - c0);
      let k = '';
      for (let c = c0; c < c1; c++) {
        const cell = result.cellAt(r, c);
        const v = cell.value;
        line[c - c0] = typeof v === 'number' && Number.isFinite(v) ? v : null;
        k += cell.kind === 'grandTotal' ? '2' : cell.kind === 'subtotal' ? '1' : '0';
      }
      if (/[12]/.test(k)) totals = true;
      cells[r - r0] = line;
      kinds[r - r0] = k;
    }
    return {
      v: 1,
      id: req.id,
      resultVersion,
      rowCount,
      columnCount,
      rowDepth: result.rowDepth,
      columnDepth: result.columnDepth,
      ...(p.headers === false ? {} : { rowHeaders: windowHeaders(result.rowTree, r0, r1), columnHeaders: windowHeaders(result.columnTree, c0, c1) }),
      cells,
      ...(totals ? { kinds } : {}),
    };
  };

  const one = (req: WireAnyRequest): WireAnyResponse => {
    if (!isWirePivotRequest(req)) {
      const response = inner.handle(req) as WireAnyResponse;
      // Writes (drill-through editing) change the rows the engines read.
      if (isWireWriteRequest(req) && inner.rows() !== data) {
        const rows = inner.rows();
        const keep = inner;
        setRows(rows);
        inner = keep;
      }
      return response;
    }
    try {
      return pivot(req);
    } catch (error) {
      return { v: 1, id: req.id, error: { code: 'badRequest', message: error instanceof Error ? error.message : String(error) } };
    }
  };

  const handle = (message: unknown): unknown => {
    const m = message as Partial<WireBatchRequest>;
    if (m.batch) return { v: 1, batch: m.batch.map(one) };
    if ((message as { pivot?: unknown }).pivot !== undefined || (message as { query?: unknown }).query !== undefined || (message as { write?: unknown }).write !== undefined) return one(message as WireAnyRequest);
    return inner.handle(message);
  };

  return {
    handle,
    transport: () =>
      (async (request: WireAnyRequest, ctx: { readonly signal: { readonly aborted: boolean; readonly reason?: unknown } }) => {
        if (ctx.signal.aborted) throw ctx.signal.reason ?? new Error('aborted');
        return JSON.parse(JSON.stringify(handle(JSON.parse(JSON.stringify(request))))) as WireAnyResponse;
      }) as UniversalJsonTransport,
    compute: (model, o = {}) => engineFor(o.where).engine.setModel(model),
    rows: () => data,
    setRows,
  };
}
