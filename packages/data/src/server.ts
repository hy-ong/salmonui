// Reference server handler for the JSON protocol over an in-memory array.
// Server-safe, zero dependencies. Used by the conformance tests and examples;
// real backends translate the same messages into SQL or their ORM.

import { stableStringify } from './canonical.js';
import {
  encodeRows,
  isWirePivotRequest,
  isWireWriteRequest,
  type WireBatchRequest,
  type WireBatchResponse,
  type WireGroup,
  type WirePredicate,
  type WireQuery,
  type WireReadRequest,
  type WireReadResponse,
  type WireAnyRequest,
  type WireRequest,
  type WireResponse,
  type WireType,
  type WireWriteRequest,
  type WireWriteResponse,
} from './protocol.js';
import { fold, isBlank, likeToRegExp, predicates } from './predicates.js';
import type { JsonTransport } from './transport.js';
import type { Json } from './types.js';

type Obj = Record<string, unknown>;

export interface JsonQueryHandlerOptions {
  readonly key: string;
  /** Full field list (default: keys of the first row). */
  readonly fields?: readonly string[];
  /** Wire types per field (default: inferred from the first row; `Date` values are `date`). */
  readonly types?: Readonly<Record<string, WireType>>;
  /** Dictionary-encode these string fields, or `'auto'`. Default none. */
  readonly dict?: readonly string[] | 'auto';
  /**
   * Tree data: field holding the parent key (blank for roots). Tree reads
   * (`parent`, `null` for the root level) return that level's children with
   * `childCounts`; with a filter or search they return every match with its
   * ancestor chain (`filterMode: 'ancestors'`) in pre-order, with `parents`,
   * `depths`, and `childCounts` of the kept children, paged by top-level row.
   * Aggregates cover the kept rows of every depth. Writes: `parents` sets the
   * parent of added rows, deleting a row deletes its subtree, `moved` sets
   * the parent of moved rows and places them next to `target`.
   */
  readonly parentField?: string;
  /** Row version field; incremented on every change and checked against `version`. */
  readonly versionField?: string;
  /** Validation for added and changed rows. */
  readonly validate?: (row: Obj) => readonly { readonly field?: string; readonly code: string; readonly message: string }[];
  /** Key generator for added rows whose key is null. */
  readonly nextKey?: () => Json;
  /** Max facet entries. Default 1000. */
  readonly facetLimit?: number;
  /** Lookup tables answered for `{ v: 1, lookup: { name, keys, keyField } }`. */
  readonly lookups?: Readonly<Record<string, readonly Obj[]>>;
  /**
   * Fields holding a lookup key (lookup / foreign-key columns):
   * sorting and grouping by such a field order rows and groups by the
   * `displayField` of the matching row of `lookups[lookup]` (a server-side
   * join), then by the key. Group keys, filters and the returned rows keep
   * the key.
   */
  readonly lookupFields?: Readonly<Record<string, { readonly lookup: string; readonly keyField: string; readonly displayField: string }>>;
}

export interface JsonQueryHandler {
  /** Handles one request, a batch, or a state-storage call. */
  handle(message: unknown): unknown;
  /** Current rows (after writes). */
  rows(): readonly Obj[];
  /** In-process transport (no HTTP) for tests and SSR. */
  transport(): JsonTransport;
}

export function createJsonQueryHandler(initial: readonly Obj[], options: JsonQueryHandlerOptions): JsonQueryHandler {
  let data: Obj[] = initial.slice();
  const allFields = options.fields ?? Object.keys(initial[0] ?? { [options.key]: null });
  const typeOf = (field: string): WireType => {
    const declared = options.types?.[field];
    if (declared) return declared;
    const sample = data.find((r) => r[field] !== null && r[field] !== undefined)?.[field];
    if (sample instanceof Date) return 'date';
    if (typeof sample === 'number') return 'number';
    if (typeof sample === 'boolean') return 'boolean';
    if (typeof sample === 'string' || sample === undefined) return 'string';
    return 'json';
  };
  const states = new Map<string, { version: string; state: unknown }>();
  let keySeq = 0;

  const { comparable, compile } = predicates(typeOf);

  const searchFilter = (s: NonNullable<WireQuery['search']>): ((row: Obj) => boolean) => {
    const fields = s.fields === '*' ? allFields.filter((f) => typeOf(f) === 'string') : s.fields;
    const needle = fold(s.text, !s.ignoreCase, s.ignoreAccent ?? false);
    const re = s.op === 'wildcard' || s.op === 'like' ? likeToRegExp(needle, s.op === 'wildcard') : null;
    const test = (h: string): boolean =>
      re ? re.test(h) : s.op === 'startsWith' ? h.startsWith(needle) : s.op === 'endsWith' ? h.endsWith(needle) : s.op === 'equal' ? h === needle : s.op === 'notEqual' ? h !== needle : h.includes(needle);
    return (row) => fields.some((f) => row[f] != null && test(fold(String(row[f]), !s.ignoreCase, s.ignoreAccent ?? false)));
  };

  const compareValues = (a: unknown, b: unknown): number => {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    if (a instanceof Date) a = a.getTime();
    if (b instanceof Date) b = b.getTime();
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
    return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
  };

  // Display value per key of each `lookupFields` entry (the join), built once.
  const joins = new Map<string, Map<string, unknown>>();
  for (const [field, spec] of Object.entries(options.lookupFields ?? {})) {
    const byKey = new Map<string, unknown>();
    for (const r of options.lookups?.[spec.lookup] ?? []) byKey.set(String(r[spec.keyField]), r[spec.displayField]);
    joins.set(field, byKey);
  }
  const compareField = (field: string, a: unknown, b: unknown): number => {
    const join = joins.get(field);
    if (join) {
      const c = compareValues(a == null ? null : (join.get(String(a)) ?? null), b == null ? null : (join.get(String(b)) ?? null));
      if (c) return c;
    }
    return compareValues(a, b);
  };

  const sortRows = (rows: Obj[], q: WireQuery): Obj[] => {
    const keys: { field: string; dir: 'asc' | 'desc' }[] = [];
    for (const g of q.group ?? []) {
      const s = q.sort?.find((x) => x.field === g.field);
      keys.push({ field: g.field, dir: s?.dir ?? 'asc' });
    }
    for (const s of q.sort ?? []) if (!keys.some((k) => k.field === s.field)) keys.push(s);
    if (!keys.length) return rows;
    return rows
      .map((row, i) => ({ row, i }))
      .sort((x, y) => {
        for (const k of keys) {
          const c = compareField(k.field, x.row[k.field], y.row[k.field]);
          if (c) return k.dir === 'desc' ? -c : c;
        }
        return x.i - y.i;
      })
      .map((e) => e.row);
  };

  const aggregate = (rows: readonly Obj[], specs: WireQuery['aggregates']): Record<string, Record<string, unknown>> | undefined => {
    if (!specs?.length) return undefined;
    const out: Record<string, Record<string, unknown>> = {};
    for (const { field, type } of specs) {
      const values = rows.map((r) => comparable(field, r[field]));
      const nums = values.filter((v): v is number => typeof v === 'number');
      let v: unknown;
      switch (type) {
        case 'sum':
          v = nums.reduce((a, b) => a + b, 0);
          break;
        case 'average':
          v = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
          break;
        case 'min':
          v = values.reduce((a, b) => (a === undefined || compareValues(b, a) < 0 ? b : a), undefined as unknown) ?? null;
          break;
        case 'max':
          v = values.reduce((a, b) => (a === undefined || compareValues(b, a) > 0 ? b : a), undefined as unknown) ?? null;
          break;
        case 'count':
          v = rows.length;
          break;
        case 'trueCount':
          v = values.filter((x) => x === true).length;
          break;
        case 'falseCount':
          v = values.filter((x) => x === false).length;
          break;
        default:
          continue;
      }
      (out[field] ??= {})[type] = v;
    }
    return out;
  };

  const withoutField = (p: WirePredicate | undefined, field: string): WirePredicate | undefined => {
    if (!p) return undefined;
    if ('and' in p) {
      const rest = p.and.map((x) => withoutField(x, field)).filter((x): x is WirePredicate => x !== undefined);
      return rest.length ? { and: rest } : undefined;
    }
    if ('or' in p) return p.or.every((x) => 'field' in x && x.field === field) ? undefined : p;
    if ('not' in p) return withoutField(p.not, field) === undefined ? undefined : p;
    return p.field === field ? undefined : p;
  };

  const read = (req: WireReadRequest): WireReadResponse => {
    const q = req.query;
    let rows = data;
    const where = req.facet ? withoutField(q.where, req.facet.field) : q.where;
    if (where) rows = rows.filter(compile(where));
    if (q.search && q.search.text) rows = rows.filter(searchFilter(q.search));
    if (options.parentField && req.parent !== undefined && !req.facet && !req.groupPath) return readTree(req, rows, options.parentField);

    if (req.facet) {
      const field = req.facet.field;
      const counts = new Map<string, { label: string; count: number }>();
      for (const r of rows) {
        const v = r[field];
        const key = isBlank(v) ? '__salmon_ui_blank__' : String(comparable(field, v));
        const entry = counts.get(key);
        if (entry) entry.count++;
        else counts.set(key, { label: isBlank(v) ? '' : String(v instanceof Date ? v.toISOString() : v), count: 1 });
      }
      let entries = [...counts].map(([key, e]) => [key, e.label, e.count] as const);
      if (req.facet.search) {
        const s = req.facet.search.toLowerCase();
        entries = entries.filter((e) => e[1].toLowerCase().includes(s));
      }
      entries.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
      const limit = req.facet.limit ?? options.facetLimit ?? 1000;
      return { v: 1, id: req.id, fields: [], rows: [], facet: { field, entries: entries.slice(0, limit), complete: entries.length <= limit } };
    }

    // Lazy group level
    if (req.groupPath && q.group?.length) {
      for (const seg of req.groupPath) rows = rows.filter((r) => stableStringify(comparable(seg.field, r[seg.field]) ?? null) === stableStringify(seg.key));
      const depth = req.groupPath.length;
      if (depth < q.group.length) {
        const field = (q.group[depth] as { field: string }).field;
        const sorted = sortRows(rows, { ...q, group: [{ field }] });
        const groups: WireGroup[] = [];
        let current: Obj[] = [];
        let key: unknown = Symbol('none');
        const close = (): void => {
          if (!current.length) return;
          const aggregates = aggregate(current, q.aggregates);
          groups.push({ key: (comparable(field, key) ?? null) as Json, count: current.length, ...(aggregates ? { aggregates } : {}) });
        };
        for (const r of sorted) {
          if (typeof key === 'symbol' || compareValues(r[field], key) !== 0) {
            close();
            current = [];
            key = r[field];
          }
          current.push(r);
        }
        close();
        return page(req, groups, (list) => ({ v: 1, id: req.id, fields: [], rows: [], groups: list as WireGroup[] }));
      }
    }

    const sorted = sortRows(rows, req.groupPath ? { ...q, group: [] } : q);
    const aggregates = aggregate(sorted, q.aggregates);
    return page(req, sorted, (list) => {
      const fields = q.select ?? allFields;
      const types = fields.map(typeOf);
      const encoded = encodeRows(list, { fields, types, ...(options.dict ? { dict: options.dict } : {}) });
      return {
        v: 1,
        id: req.id,
        fields,
        types,
        rows: encoded.rows,
        ...(encoded.dict ? { dict: encoded.dict } : {}),
        ...(aggregates ? { aggregates } : {}),
      };
    });
  };

  const parentKeyOf = (r: Obj, field: string): string | null => (isBlank(r[field]) ? null : String(r[field]));

  /** Tree read (`parent`): one level, or matches with their ancestor chain when filtered. */
  const readTree = (req: WireReadRequest, matches: readonly Obj[], field: string): WireReadResponse => {
    const q = req.query;
    const filtered = matches.length !== data.length || Boolean(q.where) || Boolean(q.search && q.search.text);
    let kept: readonly Obj[] = data;
    if (filtered) {
      const byKey = new Map<string, Obj>();
      for (const r of data) byKey.set(String(r[options.key]), r);
      const keep = new Set<Obj>(matches);
      for (const r of matches) {
        for (let p = parentKeyOf(r, field); p !== null; ) {
          const up = byKey.get(p);
          if (!up || keep.has(up)) break;
          keep.add(up);
          p = parentKeyOf(up, field);
        }
      }
      kept = data.filter((r) => keep.has(r));
    }
    const children = new Map<string | null, Obj[]>();
    for (const r of kept) {
      const p = parentKeyOf(r, field);
      let list = children.get(p);
      if (!list) children.set(p, (list = []));
      list.push(r);
    }
    const sortQuery = { ...q, group: [] };
    const sortedChildren = (key: string | null): readonly Obj[] => sortRows(children.get(key) ?? [], sortQuery);
    const countOf = (r: Obj): number => children.get(String(r[options.key]))?.length ?? 0;
    const level = sortedChildren(req.parent === null || req.parent === undefined ? null : String(req.parent));
    const aggregates = aggregate(kept, q.aggregates);
    return page(req, level, (list) => {
      let out: readonly Obj[] = list;
      let parents: Json[] | undefined;
      let depths: number[] | undefined;
      if (filtered) {
        // The kept subtree of every top-level row, in pre-order.
        const rowsOut: Obj[] = [];
        parents = [];
        depths = [];
        const visit = (r: Obj, depth: number): void => {
          rowsOut.push(r);
          (parents as Json[]).push(parentKeyOf(r, field) === null ? null : (r[field] as Json));
          (depths as number[]).push(depth);
          for (const c of sortedChildren(String(r[options.key]))) visit(c, depth + 1);
        };
        for (const r of list as Obj[]) visit(r, 0);
        out = rowsOut;
      }
      const fields = q.select ?? allFields;
      const types = fields.map(typeOf);
      const encoded = encodeRows(out, { fields, types, ...(options.dict ? { dict: options.dict } : {}) });
      return {
        v: 1,
        id: req.id,
        fields,
        types,
        rows: encoded.rows,
        ...(encoded.dict ? { dict: encoded.dict } : {}),
        ...(aggregates ? { aggregates } : {}),
        childCounts: out.map(countOf),
        ...(parents && depths ? { parents, depths } : {}),
      };
    });
  };

  const page = <T>(req: WireReadRequest, all: readonly T[], build: (list: readonly T[]) => WireReadResponse): WireReadResponse => {
    const p = req.query.page;
    const total = req.count === false ? {} : { total: all.length };
    if (!p) return { ...build(all), ...total };
    const offset = 'offset' in p ? p.offset : p.cursor === null ? 0 : Number(p.cursor.slice(2));
    const list = all.slice(offset, offset + p.limit);
    const end = offset + list.length >= all.length;
    const cursors = 'cursor' in p ? { next: end ? null : `o:${offset + p.limit}`, prev: offset > 0 ? `o:${Math.max(0, offset - p.limit)}` : null } : {};
    return { ...build(list), ...total, ...cursors };
  };

  const write = (req: WireWriteRequest): WireWriteResponse => {
    const w = req.write;
    const vf = options.versionField;
    const fields = w.fields;
    const outFields = allFields;
    const ok: { key: Json; index?: number; version?: string; row?: unknown[] }[] = [];
    const errors: { key?: Json; index?: number; field?: string; code: string; message: string }[] = [];
    const conflicts: { key: Json; server: unknown[]; version?: string }[] = [];
    const tupleOf = (row: Obj): unknown[] => encodeRows([row], { fields: outFields }).rows[0] as unknown[];
    const find = (key: Json): number => data.findIndex((r) => String(r[options.key]) === String(key));
    const next = data.slice();
    const pf = options.parentField;

    w.added.forEach((t, index) => {
      const row: Obj = {};
      fields.forEach((f, i) => (row[f] = t[i]));
      if (row[options.key] === null || row[options.key] === undefined) row[options.key] = options.nextKey ? options.nextKey() : `k${++keySeq}`;
      if (vf) row[vf] = 1;
      const parent = w.parents?.[index];
      if (pf && parent !== undefined && parent !== null && isBlank(row[pf])) row[pf] = parent;
      const problems = options.validate?.(row) ?? [];
      if (problems.length) {
        for (const p of problems) errors.push({ index, ...p });
        return;
      }
      next.push(row);
      ok.push({ key: row[options.key] as Json, index, row: tupleOf(row), ...(vf ? { version: String(row[vf]) } : {}) });
    });
    for (const c of w.changed) {
      const at = find(c.key);
      const current = data[at];
      if (!current) {
        errors.push({ key: c.key, code: 'notFound', message: 'Row not found.' });
        continue;
      }
      if (vf && c.version !== undefined && String(current[vf]) !== c.version) {
        conflicts.push({ key: c.key, server: tupleOf(current), version: String(current[vf]) });
        continue;
      }
      const row: Obj = { ...current };
      for (const f of Object.keys(c.set)) {
        const v = c.set[f];
        row[f] = typeOf(f) === 'date' && typeof v === 'number' ? new Date(v) : v;
      }
      if (vf) row[vf] = Number(current[vf] ?? 0) + 1;
      const problems = options.validate?.(row) ?? [];
      if (problems.length) {
        for (const p of problems) errors.push({ key: c.key, ...p });
        continue;
      }
      next[next.indexOf(current)] = row;
      ok.push({ key: c.key, row: tupleOf(row), ...(vf ? { version: String(row[vf]) } : {}) });
    }
    for (const r of w.removed) {
      const at = find(r.key);
      const current = data[at];
      if (!current) {
        errors.push({ key: r.key, code: 'notFound', message: 'Row not found.' });
        continue;
      }
      if (vf && r.version !== undefined && String(current[vf]) !== r.version) {
        conflicts.push({ key: r.key, server: tupleOf(current), version: String(current[vf]) });
        continue;
      }
      next.splice(next.indexOf(current), 1);
      ok.push({ key: r.key });
    }
    if (pf && w.removed.length) {
      // Deleting a parent deletes its subtree, also for descendants the request did not list.
      const gone = new Set(data.filter((r) => !next.includes(r)).map((r) => String(r[options.key])));
      for (let grew = gone.size > 0; grew; ) {
        grew = false;
        for (let i = next.length - 1; i >= 0; i--) {
          const p = parentKeyOf(next[i] as Obj, pf);
          if (p !== null && gone.has(p)) {
            gone.add(String((next[i] as Obj)[options.key]));
            next.splice(i, 1);
            grew = true;
          }
        }
      }
    }
    if (pf && w.moved && errors.length === 0 && conflicts.length === 0) {
      // Tree moves: the moved rows join `parent` and sit next to `target` (sibling order is the array order).
      const keys = new Set(w.moved.keys.map(String));
      const changedKeys = new Set(w.changed.map((c) => String(c.key)));
      const moving: Obj[] = [];
      for (let i = next.length - 1; i >= 0; i--) {
        const r = next[i] as Obj;
        if (!keys.has(String(r[options.key]))) continue;
        next.splice(i, 1);
        const row: Obj = { ...r, [pf]: w.moved.parent };
        if (vf && !changedKeys.has(String(r[options.key]))) row[vf] = Number(r[vf] ?? 0) + 1;
        moving.unshift(row);
      }
      moving.sort((a, b) => w.moved!.keys.findIndex((k) => String(k) === String(a[options.key])) - w.moved!.keys.findIndex((k) => String(k) === String(b[options.key])));
      const target = w.moved.target === null ? -1 : next.findIndex((r) => String(r[options.key]) === String(w.moved!.target));
      const at = target < 0 ? (w.moved.position === 'before' ? 0 : next.length) : w.moved.position === 'before' ? target : target + 1;
      next.splice(at, 0, ...moving);
    }
    data = next;
    return {
      v: 1,
      id: req.id,
      fields: outFields,
      ok,
      ...(errors.length ? { errors } : {}),
      ...(conflicts.length ? { conflicts } : {}),
      total: data.length,
    };
  };

  const one = (req: WireAnyRequest): WireResponse => {
    try {
      if (isWirePivotRequest(req)) throw new Error('pivot requests are answered by createPivotQueryHandler');
      return isWireWriteRequest(req) ? write(req) : read(req);
    } catch (error) {
      return { v: 1, id: req.id, fields: [], rows: [], error: { code: 'badRequest', message: error instanceof Error ? error.message : String(error) } };
    }
  };

  const state = (body: { op: string; gridId: string; state?: unknown; expectedVersion?: string }): unknown => {
    const current = states.get(body.gridId);
    if (body.op === 'load') return { v: 1, state: current?.state ?? null, ...(current ? { version: current.version } : {}) };
    if (body.op === 'remove') {
      states.delete(body.gridId);
      return { v: 1, state: null };
    }
    if (body.expectedVersion !== undefined && current && current.version !== body.expectedVersion) return { v: 1, status: 'conflict', state: current.state, version: current.version };
    const version = String((current ? Number(current.version) : 0) + 1);
    states.set(body.gridId, { version, state: body.state });
    return { v: 1, status: 'saved', version, state: body.state };
  };

  const lookup = (body: { name: string; keys?: unknown[]; keyField: string }): unknown => {
    const table = options.lookups?.[body.name];
    if (!table) return { v: 1, rows: [], error: { code: 'unknownLookup', message: `Unknown lookup "${body.name}"` } };
    const wanted = new Set((body.keys ?? []).map((k) => String(k)));
    return { v: 1, rows: table.filter((row) => wanted.has(String(row[body.keyField]))) };
  };

  const handle = (message: unknown): unknown => {
    const m = message as Partial<WireBatchRequest> & { state?: { op: string; gridId: string }; lookup?: { name: string; keys?: unknown[]; keyField: string } };
    if (m.batch) return { v: 1, batch: m.batch.map(one) } satisfies WireBatchResponse;
    if (m.state) return state(m.state);
    if (m.lookup) return lookup(m.lookup);
    return one(message as WireRequest);
  };

  return {
    handle,
    rows: () => data,
    transport: () => async (request, ctx) => {
      if (ctx.signal.aborted) throw ctx.signal.reason ?? new Error('aborted');
      // Round-trip through JSON like a real network hop.
      return JSON.parse(JSON.stringify(handle(JSON.parse(JSON.stringify(request))))) as WireResponse;
    },
  };
}

export { createPivotQueryHandler } from './pivot-server.js';
export type { PivotEngineFactoryLike, PivotEngineLike, PivotQueryHandler, PivotQueryHandlerOptions, PivotResultLike } from './pivot-server.js';
export type { PivotHeaderLike } from './pivot-wire.js';
