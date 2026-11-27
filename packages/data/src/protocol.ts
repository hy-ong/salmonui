// Salmon UI JSON protocol v1. One endpoint, POST application/json. Rows travel as tuples under
// a `fields` header so keys are not repeated per row; low-cardinality strings
// may be dictionary encoded; dates are epoch milliseconds.

import type { Json } from './types.js';

export const PROTOCOL_VERSION = 1;

export type WireType = 'string' | 'number' | 'boolean' | 'date' | 'json';

/** Built-in operators use the Data Grid engine names (`startsWith`, `greaterThanOrEqual`, ...). */
export interface WireCondition {
  readonly field: string;
  readonly op: string;
  readonly value?: Json;
  readonly matchCase?: boolean;
  readonly ignoreAccent?: boolean;
}
export type WirePredicate = WireCondition | { readonly and: readonly WirePredicate[] } | { readonly or: readonly WirePredicate[] } | { readonly not: WirePredicate };

export type WirePage = { readonly offset: number; readonly limit: number } | { readonly cursor: string | null; readonly limit: number };

export interface WireQuery {
  readonly where?: WirePredicate;
  readonly sort?: readonly { readonly field: string; readonly dir: 'asc' | 'desc' }[];
  readonly search?: {
    readonly text: string;
    /** `'*'`: every searchable field (server-defined). */
    readonly fields: readonly string[] | '*';
    readonly op: string;
    readonly ignoreCase?: boolean;
    readonly ignoreAccent?: boolean;
  };
  readonly page?: WirePage;
  readonly group?: readonly { readonly field: string; readonly format?: string }[];
  readonly aggregates?: readonly { readonly field: string; readonly type: string }[];
  readonly select?: readonly string[];
}

export interface WireReadRequest {
  readonly v: 1;
  readonly id: string;
  readonly query: WireQuery;
  /** Lazy group load: `[]` = root level, otherwise the children of that group. */
  readonly groupPath?: readonly { readonly field: string; readonly key: Json }[];
  /** Tree read: key of the parent row; `null` reads the root level. */
  readonly parent?: Json;
  readonly facet?: { readonly field: string; readonly search?: string; readonly limit?: number };
  /** Default true; false skips the total count. */
  readonly count?: boolean;
}

export type WireTuple = readonly unknown[];

export interface WireGroup {
  readonly key: Json;
  readonly count: number;
  readonly aggregates?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface WireError {
  readonly code: string;
  readonly message: string;
}

export interface WireReadResponse {
  readonly v: 1;
  readonly id: string;
  readonly fields: readonly string[];
  readonly types?: readonly WireType[];
  readonly rows: readonly WireTuple[];
  /** Dictionary encoding: that field's cells are indexes into the list. */
  readonly dict?: Readonly<Record<string, readonly string[]>>;
  readonly total?: number;
  /** Cursor of the next page; null on the last page. */
  readonly next?: string | null;
  readonly prev?: string | null;
  readonly aggregates?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Group level of a lazy group load (instead of rows). */
  readonly groups?: readonly WireGroup[];
  /** Tree loads: child count per row (0 = leaf), parallel to `rows`; filtered reads count the kept children only. */
  readonly childCounts?: readonly number[];
  /**
   * Tree loads that return more than one level (a filtered read with the
   * ancestor chain, or a whole subtree): the parent key per row (null: a
   * root), parallel to `rows`, in pre-order. Omitted: every row is a child
   * of the requested `parent`.
   */
  readonly parents?: readonly Json[];
  /** Depth per row relative to the requested level (0: a child of `parent`), parallel to `rows`. */
  readonly depths?: readonly number[];
  readonly facet?: { readonly field: string; readonly entries: readonly (readonly [key: string, label: string, count: number])[]; readonly complete: boolean };
  readonly error?: WireError;
}

export interface WireWriteRequest {
  readonly v: 1;
  readonly id: string;
  readonly write: {
    readonly fields: readonly string[];
    readonly added: readonly WireTuple[];
    readonly changed: readonly { readonly key: Json; readonly set: Readonly<Record<string, unknown>>; readonly version?: string }[];
    readonly removed: readonly { readonly key: Json; readonly version?: string }[];
    /** Tree mode: parent key per added tuple (null: a root), parallel to `added`. */
    readonly parents?: readonly Json[];
    /** Tree mode: rows moved under a new parent (`WriteRequest.moved` with `parentId`). */
    readonly moved?: { readonly keys: readonly Json[]; readonly parent: Json; readonly target: Json; readonly position: 'before' | 'after' };
  };
}

export interface WireWriteResponse {
  readonly v: 1;
  readonly id: string;
  /** Header for the tuples echoed in `ok[].row` and `conflicts[].server`. Defaults to the request's fields. */
  readonly fields?: readonly string[];
  /** Applied rows. `index` identifies an added tuple; `row` is the server echo (real key, computed fields). */
  readonly ok?: readonly { readonly key: Json; readonly index?: number; readonly version?: string; readonly row?: WireTuple }[];
  readonly errors?: readonly { readonly key?: Json; readonly index?: number; readonly field?: string; readonly code: string; readonly message: string }[];
  readonly conflicts?: readonly { readonly key: Json; readonly server: WireTuple; readonly version?: string }[];
  readonly total?: number;
  readonly error?: WireError;
}

// ---------------------------------------------------------------------------
// Pivot request and response
// ---------------------------------------------------------------------------

/** An axis field of a wire pivot model. */
export interface WirePivotAxisField {
  readonly field: string;
  readonly caption?: string;
  readonly showSubTotals?: boolean;
}

/** A value field of a wire pivot model; `aggregate: 'custom'` (a client function) cannot travel. */
export interface WirePivotValueField {
  readonly field: string;
  readonly caption?: string;
  readonly aggregate: string;
  readonly customId?: string;
  readonly showAs?: unknown;
}

/**
 * The pivot engine's `PivotModel` (`@salmonui/pivot-table/engine`), typed
 * structurally so this package keeps no package imports. Plain JSON; the
 * client sends it with defaults omitted and without the client-only parts
 * (`formats`, `conditionalFormats`, calculated field `format`).
 */
export interface WirePivotModel {
  readonly rows?: readonly WirePivotAxisField[];
  readonly columns?: readonly WirePivotAxisField[];
  readonly values?: readonly WirePivotValueField[];
  readonly filters?: readonly WirePivotAxisField[];
  readonly filterBy?: unknown;
  readonly sort?: unknown;
  readonly valueSort?: unknown;
  readonly groups?: unknown;
  readonly calculatedFields?: readonly { readonly name: string; readonly formula: string; readonly caption?: string; readonly format?: unknown }[];
  readonly formats?: unknown;
  readonly conditionalFormats?: unknown;
  /** Member paths (`['rows', ...keys]`) or `'all'`. */
  readonly expanded?: readonly (readonly Json[])[] | 'all';
  readonly totals?: unknown;
  readonly valuesPlacement?: unknown;
  readonly showEmptyMembers?: boolean;
  readonly showValueHeader?: boolean;
}

/** A leaf-position window, end exclusive. */
export interface WirePivotWindow {
  readonly rows: readonly [start: number, end: number];
  readonly columns: readonly [start: number, end: number];
}

export interface WirePivotRequest {
  readonly v: 1;
  readonly id: string;
  readonly pivot: {
    readonly model: WirePivotModel;
    /** Pre-aggregation filter over raw rows (same rules as `query.where`). */
    readonly where?: WirePredicate;
    readonly window?: WirePivotWindow;
    /** Default true; false = cells only (scroll within header nodes already held). */
    readonly headers?: boolean;
    /** Raw rows behind one cell, instead of a window. */
    readonly drillThrough?: {
      readonly rowPath: readonly Json[];
      readonly columnPath: readonly Json[];
      /** Measure of the value column (disambiguates value leaves with equal paths). */
      readonly value?: string;
      readonly page: { readonly offset: number; readonly limit: number };
      readonly select?: readonly string[];
    };
  };
}

/** A header node of the window (`PivotHeaderNode` without `axis` and `children`). */
export interface WirePivotHeader {
  /** `PivotHeaderNode.key`. */
  readonly key: string;
  readonly path: readonly Json[];
  readonly label: string;
  readonly depth: number;
  readonly position: number;
  readonly span: number;
  readonly kind: 'member' | 'subtotal' | 'grandTotal' | 'value';
  /** Field of the innermost member; omitted when null. */
  readonly field?: string;
  /** Measure of value headers and leaves under them; omitted when null. */
  readonly measure?: string;
  /** Has children (expanded or not). */
  readonly expandable?: true;
  readonly expanded?: true;
}

export interface WirePivotResponse {
  readonly v: 1;
  readonly id: string;
  /** Opaque; changes when the model or the data change. */
  readonly resultVersion?: string;
  /** Leaf rows and columns of the full result. */
  readonly rowCount?: number;
  readonly columnCount?: number;
  /** Header row count of the column tree and level count of the row tree. */
  readonly columnDepth?: number;
  readonly rowDepth?: number;
  /** The window's header nodes with their ancestors, depth-first. */
  readonly rowHeaders?: readonly WirePivotHeader[];
  readonly columnHeaders?: readonly WirePivotHeader[];
  /** `[row - window.rows[0]][column - window.columns[0]]`; formatted on the client. */
  readonly cells?: readonly (readonly (number | null)[])[];
  /** Cell kinds parallel to `cells`, one character per cell (`0` value, `1` subtotal, `2` grand total); omitted when every cell is a value. */
  readonly kinds?: readonly string[];
  // Drill-through responses reuse the read response body.
  readonly fields?: readonly string[];
  readonly types?: readonly WireType[];
  readonly rows?: readonly WireTuple[];
  readonly dict?: Readonly<Record<string, readonly string[]>>;
  readonly total?: number;
  readonly error?: WireError;
}

/** Read and write requests: what a `JsonTransport` (Data Grid sources) carries. */
export type WireRequest = WireReadRequest | WireWriteRequest;
export type WireResponse = WireReadResponse | WireWriteResponse;
/** Every request kind, pivot included: what a `PivotJsonTransport` (pivot sources) carries. */
export type WireAnyRequest = WireRequest | WirePivotRequest;
export type WireAnyResponse = WireResponse | WirePivotResponse;

export interface WireBatchRequest {
  readonly v: 1;
  readonly batch: readonly WireAnyRequest[];
}
export interface WireBatchResponse {
  readonly v: 1;
  readonly batch: readonly WireAnyResponse[];
}

/** Live push message (any subscription channel: SSE, WebSocket, polling). */
export type WireLiveMessage =
  | {
      readonly v: 1;
      readonly type: 'replace';
      readonly fields: readonly string[];
      readonly types?: readonly WireType[];
      readonly rows: readonly WireTuple[];
      readonly dict?: Readonly<Record<string, readonly string[]>>;
      readonly total?: number;
    }
  | {
      readonly v: 1;
      readonly type: 'patch';
      readonly fields?: readonly string[];
      readonly dict?: Readonly<Record<string, readonly string[]>>;
      readonly upsert?: readonly WireTuple[];
      readonly append?: readonly WireTuple[];
      readonly remove?: readonly Json[];
    };

export function isWireWriteRequest(request: WireAnyRequest): request is WireWriteRequest {
  return (request as WireWriteRequest).write !== undefined;
}

export function isWirePivotRequest(request: WireAnyRequest): request is WirePivotRequest {
  return (request as WirePivotRequest).pivot !== undefined;
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/**
 * Brings response tuples into the client's field order and expands
 * dictionary-encoded cells. Works in place on the freshly parsed arrays: when
 * the server already used the requested order and no dictionary, this is a
 * no-op (no per-row work at all). Returns the tuples.
 */
export function decodeTuples(
  rows: readonly WireTuple[],
  fields: readonly string[],
  expected: readonly string[] | null,
  dict: Readonly<Record<string, readonly string[]>> | undefined,
): unknown[][] {
  const out = rows as unknown[][];
  let remap: Int32Array | null = null;
  if (expected && !sameFields(fields, expected)) {
    remap = new Int32Array(expected.length);
    for (let i = 0; i < expected.length; i++) remap[i] = fields.indexOf(expected[i] as string);
  }
  if (dict) {
    for (const name of Object.keys(dict)) {
      const at = fields.indexOf(name);
      const table = dict[name] as readonly string[];
      if (at < 0) continue;
      for (let r = 0; r < out.length; r++) {
        const row = out[r] as unknown[];
        const code = row[at];
        if (typeof code === 'number') row[at] = table[code];
      }
    }
  }
  if (remap) {
    const width = remap.length;
    for (let r = 0; r < out.length; r++) {
      const src = out[r] as unknown[];
      const dst = new Array<unknown>(width);
      for (let i = 0; i < width; i++) {
        const at = remap[i] as number;
        dst[i] = at < 0 ? null : src[at];
      }
      out[r] = dst;
    }
  }
  return out;
}

function sameFields(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Materializes tuples as objects (object row mode). One allocation per row. */
export function tuplesToObjects<Row>(rows: readonly WireTuple[], fields: readonly string[]): Row[] {
  const out = new Array<Row>(rows.length);
  const width = fields.length;
  for (let r = 0; r < rows.length; r++) {
    const t = rows[r] as WireTuple;
    const o: Record<string, unknown> = {};
    for (let i = 0; i < width; i++) o[fields[i] as string] = t[i];
    out[r] = o as Row;
  }
  return out;
}

/** Inverse of `tuplesToObjects` for one row (writes). */
export function objectToTuple(row: unknown, fields: readonly string[]): unknown[] {
  const o = row as Record<string, unknown>;
  const out = new Array<unknown>(fields.length);
  for (let i = 0; i < fields.length; i++) out[i] = o[fields[i] as string];
  return out;
}

// ---------------------------------------------------------------------------
// Encoding helpers (servers and benchmarks)
// ---------------------------------------------------------------------------

export interface EncodeRowsOptions {
  readonly fields: readonly string[];
  readonly types?: readonly WireType[];
  /** Fields to dictionary encode. `'auto'` encodes string fields whose distinct count is at most `autoDictRatio` of the rows (default 0.25). */
  readonly dict?: readonly string[] | 'auto';
  readonly autoDictRatio?: number;
}

/** Encodes object rows as tuples (+ dictionaries); dates become epoch ms. */
export function encodeRows(
  rows: readonly unknown[],
  options: EncodeRowsOptions,
): { rows: unknown[][]; dict?: Record<string, string[]> } {
  const { fields } = options;
  const width = fields.length;
  const tuples = new Array<unknown[]>(rows.length);
  for (let r = 0; r < rows.length; r++) {
    const o = rows[r] as Record<string, unknown>;
    const t = new Array<unknown>(width);
    for (let i = 0; i < width; i++) {
      const v = o[fields[i] as string];
      t[i] = v instanceof Date ? v.getTime() : v === undefined ? null : v;
    }
    tuples[r] = t;
  }
  const dictFields = options.dict === 'auto' ? autoDictFields(tuples, options) : (options.dict ?? []);
  if (dictFields.length === 0) return { rows: tuples };
  const dict: Record<string, string[]> = {};
  for (const name of dictFields) {
    const at = fields.indexOf(name);
    if (at < 0) continue;
    const codes = new Map<string, number>();
    const table: string[] = [];
    for (let r = 0; r < tuples.length; r++) {
      const t = tuples[r] as unknown[];
      const v = t[at];
      if (typeof v !== 'string') continue;
      let code = codes.get(v);
      if (code === undefined) {
        code = table.length;
        codes.set(v, code);
        table.push(v);
      }
      t[at] = code;
    }
    dict[name] = table;
  }
  return { rows: tuples, dict };
}

function autoDictFields(tuples: readonly unknown[][], options: EncodeRowsOptions): string[] {
  const ratio = options.autoDictRatio ?? 0.25;
  const limit = Math.max(1, Math.floor(tuples.length * ratio));
  const out: string[] = [];
  options.fields.forEach((name, at) => {
    const type = options.types?.[at];
    if (type !== undefined && type !== 'string') return;
    const seen = new Set<string>();
    for (let r = 0; r < tuples.length; r++) {
      const v = (tuples[r] as unknown[])[at];
      if (v === null || v === undefined) continue;
      if (typeof v !== 'string') return;
      seen.add(v);
      if (seen.size > limit) return;
    }
    if (seen.size > 0) out.push(name);
  });
  return out;
}
